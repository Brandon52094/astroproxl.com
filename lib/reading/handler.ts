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
  "You are a precision astrological synthesis engine. Vary your selection of timing windows across the provided date index based on the user's specific topic and question. Never default to the first available dates unless they uniquely match the spine aspect. Output raw JSON.";

export async function handleReading(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as ReadingRequestBody;

    // Crisis check
    const risk = assessRisk(body?.question ?? "");
    if (risk.action === "block_crisis" || risk.action === "block_emergency") {
      const safe = getSafeResponse(risk);
      return NextResponse.json({
        reading: {
          id: crypto.randomUUID(),
          pages: [{
            pageNumber: 1,
            title: safe.title,
            content: safe.answer + "\n\n" + safe.confirmation,
            sources: [],
          }],
          topic: body?.topic ?? "general",
          question: body?.question ?? "",
          status: "complete",
          isSafeResponse: true,
          riskLevel: risk.level,
        },
      });
    }

    // Eligibility check
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

    if (!body.topic || !body.question || !body.tropical || !body.transits || !body.profection) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API configuration error." }, { status: 500 });
    }

    // Validate aspects
    const validatedAspects = validateAndFilterAspects(body.transitAspects);
    body.transitAspects = validatedAspects;

    // Resolve the topic module (love / money / career / whatsComing)
    const topic = getTopic(body.topic);

    const prompt = buildReadingPrompt(body, topic, validatedAspects);
    const dateIndex = buildValidDateIndex(body, validatedAspects);

    console.log("[DEBUG] === AVAILABLE DATES ===");
    console.log(`[IDX] count=${dateIndex.dates.length} raw=${JSON.stringify(dateIndex.dates.map(d => d.raw))} sources=${JSON.stringify(dateIndex.dates.map(d => d.source))}`);
    console.log("[DEBUG] Upcoming trigger:", body.upcomingTrigger?.date || "none");
    console.log("[DEBUG] Planetary stations:", body.planetaryStations?.map(s => s.stationDate) || []);
    console.log("[DEBUG] Synodic cycles (within 45d):", body.synodicCycles?.filter(s => s.daysUntilReturn <= 45).map(s => s.returnDate) || []);
    console.log("[DEBUG] Transit aspects count:", validatedAspects.length);
    console.log("[DEBUG] Sample transit aspect:", validatedAspects[0] ? JSON.stringify(validatedAspects[0], null, 2) : "none");
    console.log("[DEBUG] ===========================");

    // Generate reading. topic.* overrides are unset today → identical behavior.
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: topic.maxTokens ?? 4000,
        temperature: topic.temperature ?? 0.7,
        system: topic.system ?? DEFAULT_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[readings] Claude error:", err);
      return NextResponse.json({ error: "Failed to generate reading." }, { status: 502 });
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text;
    if (!rawText) {
      return NextResponse.json({ error: "No response from reading engine." }, { status: 502 });
    }

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

      if (unsupported.length > 0) {
        console.warn(`[readings] Unsupported dates: ${unsupported.join(" | ")}`);

        const retryResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 3000,
            temperature: 0.3,
            system: "You are a precision astrological synthesis engine. Vary your selection of timing windows across the provided date index. Never default to the first available dates. Output raw JSON.",
            messages: [{
              role: "user",
              content: prompt + "\n\nDATE CORRECTION: Use only these dates: " +
                dateIndex.dates.map((d) => d.raw).join(", ") +
                "\nRewrite using ONLY these dates. Drop any unsupported windows.",
            }],
          }),
        });

        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          const retryText = retryData.content?.[0]?.text;
          if (retryText) {
            let retryCleaned = retryText.trim();
            if (retryCleaned.startsWith("```")) retryCleaned = retryCleaned.slice(retryCleaned.indexOf("\n") + 1);
            if (retryCleaned.endsWith("```")) retryCleaned = retryCleaned.slice(0, retryCleaned.lastIndexOf("```"));
            retryCleaned = retryCleaned.trim();

            const start2 = retryCleaned.indexOf("{");
            const end2 = retryCleaned.lastIndexOf("}");
            if (start2 !== -1 && end2 !== -1) {
              retryCleaned = retryCleaned.slice(start2, end2 + 1);
            }

            const retryParsed = JSON.parse(retryCleaned) as { pages: ReadingPage[] };
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
        }
      }

      if (unsupported.length > 0) {
        console.error(`[readings] Date provenance FAILED: ${unsupported.join(" | ")}`);
        return NextResponse.json({ error: "Could not verify timing. Please try again." }, { status: 422 });
      }

      return NextResponse.json({
        reading: {
          id: crypto.randomUUID(),
          pages,
          topic: body.topic,
          question: body.question,
          status: "complete",
        },
        careNote: getCareNote(risk),
      }, { status: 201 });

    } catch (parseErr) {
      console.error("[readings] Parse error:", parseErr);
      return NextResponse.json({ error: "Failed to parse reading. Please try again." }, { status: 422 });
    }

  } catch (error) {
    console.error("[readings] Error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}