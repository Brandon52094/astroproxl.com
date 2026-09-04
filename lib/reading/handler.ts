import { generateOpenAIText } from "@/lib/ai/openai";
import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { assessRisk, getSafeResponse, getCareNote } from "@/lib/crisisDetection";
import { buildValidDateIndex, findUnsupportedMarkers } from "@/lib/validateReadingDates";
import {
  buildReadingPrompt,
  validateAndFilterAspects,
  type ReadingRequestBody,
  type ReadingPage,
} from "./engine";
import { getTopic } from "./topics";

const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const FREE_READING_RESET_MS = 7 * 24 * 60 * 60 * 1000;
const CREDITS_PER_READING = 1;

const DEFAULT_SYSTEM =
  "You are a precision personal astrologer. Follow the supplied calculation hierarchy and evidence exactly. " +
  "Never invent aspects, dates, placements, or unsupported outcomes. " +
  "Select timing windows deterministically from the strongest topic-relevant calculator-supported evidence. " +
  "Never approximate, diversify, shift, or substitute dates for variety; if the evidence does not support a dated window, do not create one. " +
  "When the supplied evidence strongly converges, write with conviction and commit to the strongest supported interpretation. " +
  "Speak directly to the person as 'you' with warmth, specificity, and emotional intelligence. " +
  "Translate astrology into recognizable real-life developments rather than sounding like a technical report. " +
  "Match certainty to the evidence: EVENT, ACTIVATION, or BACKGROUND. " +
  "Bold delivery never upgrades weak evidence.";

const RETRY_SYSTEM =
  "You are a precision personal astrologer correcting date provenance in an existing reading. " +
  "Use the PREVIOUS READING supplied in the correction prompt as the text to repair. " +
  "Remove or replace every unsupported date using ONLY calculator-supported dates explicitly provided in the correction instruction. " +
  "Do not invent, approximate, shift, diversify, or substitute dates; if no valid date supports a window, remove that window. " +
  "Preserve all supported interpretation, structure, specificity, warmth, and decisive voice. " +
  "Change only what is necessary to repair date provenance. " +
  "Do NOT make the corrected reading more tentative, generic, flat, or clinical than the original. " +
  "Bold delivery does not upgrade evidence: preserve EVENT, ACTIVATION, and BACKGROUND distinctions exactly as supported. " +
  "Output raw JSON only.";

function buildSystemPrompt(topicSystem?: string) {
  if (!topicSystem?.trim()) {
    return `${DEFAULT_SYSTEM} Output raw JSON only.`;
  }

  return DEFAULT_SYSTEM + " " + topicSystem.trim() + " Output raw JSON only.";
}

/**
 * Strip specific [[DATE: ...]] markers the validator flagged, keeping the
 * surrounding prose. Driven entirely by the validator's own findUnsupportedMarkers
 * output — we do NOT re-derive which dates are bad here, so this can never
 * disagree with the provenance check.
 *
 * A stripped window paragraph loses its lead date and degrades to plain prose
 * downstream, which is acceptable and far better than failing the whole reading.
 */
function stripMarkersByDateText(content: string, badDateTexts: string[]): string {
  let out = content;

  for (const bad of badDateTexts) {
    const inner = bad
      .replace(/^\[\[\s*DATE\s*:\s*/i, "")
      .replace(/\]\]$/, "")
      .trim();

    if (!inner) continue;

    const esc = inner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Match the whole marker for this date, plus any trailing dash lead-in
    // (the window format is "[[DATE: X]] — ...").
    const re = new RegExp(
      `\\s*\\[\\[\\s*DATE\\s*:\\s*${esc}\\s*\\]\\]\\s*[—–-]?\\s*`,
      "gi"
    );

    out = out.replace(re, " ");
  }

  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export async function handleReading(request: NextRequest) {
  try {
    const body = (await request.json()) as ReadingRequestBody;

    // ── VALIDATE REQUEST STRUCTURE ──
    if (!body || typeof body.question !== "string") {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    // ── CRISIS CHECK ──
    const risk = assessRisk(body.question);
    if (risk.action === "block_crisis" || risk.action === "block_emergency") {
      const safe = getSafeResponse(risk);
      return NextResponse.json({
        reading: {
          id: crypto.randomUUID(),
          pages: [
            {
              pageNumber: 1,
              title: safe.title,
              content: safe.answer + "\n\n" + safe.confirmation,
              sources: [],
            },
          ],
          topic: body?.topic ?? "general",
          question: body?.question ?? "",
          status: "complete",
          isSafeResponse: true,
          riskLevel: risk.level,
        },
      });
    }

    // ── VALIDATE REQUIRED FIELDS ──
    if (
      !body.topic ||
      !body.question.trim() ||
      !body.tropical ||
      !body.transits ||
      !body.profection
    ) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // ── ELIGIBILITY CHECK ──
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const metadata = user.publicMetadata;

    const isSubscribed = metadata?.isSubscribed === true;
    const credits = Number(metadata?.credits ?? 0);
    const isPaid = isSubscribed || credits >= CREDITS_PER_READING;

    const lastFree = metadata?.freeReadingUsedAt ? new Date(metadata.freeReadingUsedAt as string) : null;
    const freeAvailable = !lastFree || Date.now() >= lastFree.getTime() + FREE_READING_RESET_MS;

    const cooldown = metadata?.cooldownStartedAt ? new Date(metadata.cooldownStartedAt as string) : null;
    if (!isPaid && cooldown && Date.now() < cooldown.getTime() + COOLDOWN_MS) {
      return NextResponse.json({ error: "Cooldown active. Please wait." }, { status: 403 });
    }

    if (!isPaid && !freeAvailable) {
      return NextResponse.json({ error: "Insufficient credits. Purchase more or subscribe." }, { status: 403 });
    }

    // ── VALIDATE ASPECTS ──
    const validatedAspects = validateAndFilterAspects(body.transitAspects);

    // ── BUILD NORMALIZED REQUEST ──
    const readingBody: ReadingRequestBody = {
      ...body,
      transitAspects: validatedAspects,
    };

    // ── RESOLVE TOPIC ──
    const topic = getTopic(body.topic);

    // ── BUILD PROMPT & DATE INDEX ──
    const prompt = buildReadingPrompt(readingBody, topic, validatedAspects);
    const dateIndex = buildValidDateIndex(readingBody, validatedAspects);

    // ── DEBUG LOGGING ──
    console.log("[DEBUG] === DATE PROVENANCE INDEX ===");
    console.log(`[IDX] count=${dateIndex.dates.length}`);
    console.log(
      "[IDX] anchors:",
      dateIndex.dates.map((d) => ({
        date: d.raw,
        source: d.source,
      }))
    );
    console.log("[DEBUG] Transit aspects:", validatedAspects.length);
    console.log(
      "[DEBUG] Exact dated transit aspects:",
      validatedAspects
        .filter((a) => a.exactDate)
        .map((a) => ({
          transit: a.transitPlanet,
          aspect: a.aspectType,
          natal: a.natalPlanet,
          date: a.exactDate,
          applying: a.isApplying,
          orb: a.orbDegrees,
        }))
    );
    console.log(
      "[DEBUG] Exact angle dates:",
      readingBody.transitsToAngles
        ?.filter((a) => a.exactDate)
        .map((a) => ({
          transit: a.transitPlanet,
          angle: a.angle,
          aspect: a.aspectType,
          date: a.exactDate,
        })) ?? []
    );
    console.log("[DEBUG] Upcoming trigger:", readingBody.upcomingTrigger?.date ?? "none");
    console.log(
      "[DEBUG] Planetary stations with dates:",
      readingBody.planetaryStations?.filter((s) => s.stationDate).map((s) => s.stationDate) ?? []
    );
    console.log("[DEBUG] =============================");

    // ── GENERATE READING WITH GPT-5.6 LUNA ──
    let rawText: string;

    try {
      rawText = await generateOpenAIText({
        system: buildSystemPrompt(topic.system),
        prompt,
        maxTokens: topic.maxTokens ?? 4000,
      });
    } catch (error) {
      console.error("[readings] OpenAI Luna error:", error);
      return NextResponse.json(
        { error: "Failed to generate reading." },
        { status: 502 }
      );
    }

    // ── PARSE RESPONSE ──
    try {
      let cleaned = rawText.trim();
      if (cleaned.startsWith("```")) cleaned = cleaned.slice(cleaned.indexOf("\n") + 1);
      if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, cleaned.lastIndexOf("```"));
      cleaned = cleaned.trim();

      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        cleaned = cleaned.slice(start, end + 1);
      }

      const parsed = JSON.parse(cleaned) as { pages: ReadingPage[] };

      if (!parsed.pages?.length) {
        return NextResponse.json({ error: "Invalid reading structure." }, { status: 422 });
      }

      let pages = parsed.pages;
      let unsupported = pages.flatMap((pg) => findUnsupportedMarkers(pg.content ?? "", dateIndex));

      // ── RETRY ON UNSUPPORTED DATES ──
      if (unsupported.length > 0) {
        console.warn(`[readings] Unsupported dates: ${unsupported.join(" | ")}`);

        const approvedDates =
          dateIndex.dates.length > 0
            ? dateIndex.dates
                .map((d) => `  - ${d.raw} [${d.source}]`)
                .join("\n")
            : "  - NONE";

        const correctionMessage =
          prompt +
          "\n\n═══════════════════════════════════════════" +
          "\nDATE PROVENANCE CORRECTION — HARD RULE" +
          "\n═══════════════════════════════════════════" +
          "\nThe previous response contained unsupported dates." +
          "\n\nPREVIOUS READING TO CORRECT:" +
          "\n" +
          rawText +
          "\n\nThe ONLY approved date anchors are:" +
          "\n" +
          approvedDates +
          "\n\nCorrect the PREVIOUS READING above." +
          "\nPreserve its supported interpretation, structure, specificity, and voice." +
          "\nChange only what is necessary to repair unsupported date provenance." +
          "\nRemove every unsupported dated window." +
          "\nDo not move an event to the nearest approved date." +
          "\nDo not add a date merely because one is available." +
          "\nA date may be used only when the corresponding astrological evidence actually supports that claim." +
          "\nIf there are no approved dates, the corrected reading must contain no [[DATE: ...]] markers.";

        try {
          const retryText = await generateOpenAIText({
            system: RETRY_SYSTEM,
            prompt: correctionMessage,
            maxTokens: topic.maxTokens ?? 4000,
          });

          if (retryText) {
            let retryCleaned = retryText.trim();

            if (retryCleaned.startsWith("```")) {
              retryCleaned = retryCleaned.slice(
                retryCleaned.indexOf("\n") + 1
              );
            }

            if (retryCleaned.endsWith("```")) {
              retryCleaned = retryCleaned.slice(
                0,
                retryCleaned.lastIndexOf("```")
              );
            }

            retryCleaned = retryCleaned.trim();

            const start2 = retryCleaned.indexOf("{");
            const end2 = retryCleaned.lastIndexOf("}");

            if (start2 !== -1 && end2 !== -1) {
              retryCleaned = retryCleaned.slice(start2, end2 + 1);
            }

            const retryParsed = JSON.parse(retryCleaned) as {
              pages: ReadingPage[];
            };

            if (retryParsed.pages?.length) {
              const stillBad = retryParsed.pages.flatMap((pg) =>
                findUnsupportedMarkers(pg.content ?? "", dateIndex)
              );

              if (stillBad.length === 0) {
                pages = retryParsed.pages;
                unsupported = [];
              }
            }
          }
        } catch (retryError) {
          console.error(
            "[readings] Luna correction retry failed:",
            retryError
          );
        }
      }

      // ── FINAL DATE PROVENANCE CHECK ──
      // Salvage before failing: strip only the markers the validator flagged,
      // then RE-VALIDATE against the same index. We hard-fail only if stripping
      // did not actually clear the problem — one stubborn invented date no
      // longer sinks an otherwise-supported reading.
      if (unsupported.length > 0) {
        console.warn(
          `[readings] Stripping unsupported dates: ${unsupported.join(" | ")}`
        );

        pages = pages.map((pg) => ({
          ...pg,
          content: stripMarkersByDateText(pg.content ?? "", unsupported),
        }));

        const recheck = pages.flatMap((pg) =>
          findUnsupportedMarkers(pg.content ?? "", dateIndex)
        );

        if (recheck.length > 0) {
          console.error(
            `[readings] Date provenance FAILED after strip: ${recheck.join(" | ")}`
          );

          return NextResponse.json(
            { error: "Could not verify timing. Please try again." },
            { status: 422 }
          );
        }
      }

      // ── SUCCESS ──
      return NextResponse.json(
        {
          reading: {
            id: crypto.randomUUID(),
            pages,
            topic: body.topic,
            question: body.question,
            status: "complete",
          },
          careNote: getCareNote(risk),
        },
        { status: 201 }
      );
    } catch (parseErr) {
      console.error("[readings] Parse error:", parseErr);

      return NextResponse.json(
        { error: "Failed to parse reading. Please try again." },
        { status: 422 }
      );
    }
  } catch (error) {
    console.error("[readings] Error:", error);

    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}