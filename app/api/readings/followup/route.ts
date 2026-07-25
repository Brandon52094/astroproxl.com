import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { buildVoiceCalibrationBlock } from "@/lib/signVoice";
import { assessRisk, getSafeResponse, getCareNote } from "@/lib/crisisDetection";
import type { TransitAspect } from "@/lib/transitAspects";

interface PlanetPlacement {
  name: string;
  sign: string;
  degree: string;
  house?: string;
}

interface Aspect {
  type: string;
  planetA: string;
  planetB: string;
  orbDegrees: number;
}

interface TransitPlanet {
  name: string;
  sign: string;
  degree: string;
  isRetrograde: boolean;
}

interface ProgressedPlanet {
  name: string;
  sign: string;
  degree: string;
  isRetrograde: boolean;
}

interface SolarArcPlanet {
  name: string;
  sign: string;
  degree: string;
}

interface ProfectionData {
  age: number;
  activatedHouse: number;
  activatedSign: string;
  timeLord: string;
  timeLordNatalSign?: string;
  timeLordNatalHouse?: number;
}

interface UpcomingTrigger {
  date: string;
  transitPlanet: string;
  natalPlanet: string;
  aspect: string;
}

interface PlanetaryStationData {
  planet: string;
  stationType: string;
  stationDate: string;
  degree: string;
  sign: string;
  natalPlanetHit?: string;
  natalHouse?: number;
  orbDegrees: number;
}

interface SolarReturnData {
  sunReturnDate: string;
  location: string;
  ascendant: { sign: string; degree: string };
  midheaven: { sign: string; degree: string };
  planets: Array<{ name: string; sign: string; degree: string; house: string }>;
  timeLordInSR: string | null;
  timeLordSRHouse: number | null;
}

interface MoonPhaseData {
  phaseName: string;
  illuminationPercent: number;
  nextEventName: "New Moon" | "Full Moon";
  daysUntilNextEvent: number;
  moonSign: string;
  moonDegree: string;
}

interface FollowupRequestBody {
  question: string;
  originalReading: string;
  originalTitle: string;
  topic: "love" | "career" | "money" | "general";
  tropical: { planets: PlanetPlacement[]; aspects: Aspect[] };
  sidereal?: { planets: PlanetPlacement[] };
  transits: TransitPlanet[];
  transitAspects?: TransitAspect[];
  profection: ProfectionData;
  progressions?: ProgressedPlanet[];
  solarArcs?: SolarArcPlanet[];
  upcomingTrigger?: UpcomingTrigger;
  planetaryStations?: PlanetaryStationData[];
  solarReturn?: SolarReturnData;
  moonPhase?: MoonPhaseData;
  conversationHistory?: string;
  /**
   * How many free replies the client has already used on THIS reading.
   * Tracked client-side (localStorage), reset to 0 on every new reading.
   * The server trusts this for the free tier only — paid replies are
   * server-authoritative via `replyCredits`.
   */
  freeRepliesUsed?: number;
}

const NL = "\n";

function fmtPlanet(p: PlanetPlacement): string {
  return p.name + ": " + p.sign + " " + p.degree + (p.house ? " (House " + p.house + ")" : "");
}

function fmtTransit(p: TransitPlanet): string {
  return p.name + ": " + p.sign + " " + p.degree + (p.isRetrograde ? " Rx" : "");
}

function fmtAspect(a: Aspect): string {
  return a.planetA + " " + a.type + " " + a.planetB + " — " + a.orbDegrees + "° orb";
}

function fmtProgression(p: ProgressedPlanet): string {
  return p.name + ": " + p.sign + " " + p.degree + (p.isRetrograde ? " Rx" : "");
}

function fmtSolarArc(p: SolarArcPlanet): string {
  return p.name + ": " + p.sign + " " + p.degree;
}

/**
 * Same calculated-aspect block as the main reading. The follow-up is exactly
 * where people push for specifics — "when?", "are you sure?", "what about
 * next week?" — so it is the LAST place we want the model estimating orbs
 * by eye. It gets the same finished answers the main reading got.
 */
function fmtTransitAspects(aspects: TransitAspect[] | undefined): string {
  if (!aspects || aspects.length === 0) {
    return "TRANSIT-TO-NATAL ASPECTS: none within orb right now. Answer from progressions, stations, and the profection year instead.";
  }

  const lines = [
    "TRANSIT-TO-NATAL ASPECTS — CALCULATED, EXACT, SORTED TIGHTEST FIRST",
    "These are given to you. Do NOT compute aspects yourself. Do NOT use any aspect not on this list.",
    "If it is not here, it is not happening, and you may not mention it.",
    "",
    "EXACT = under 1° orb — firing right now.",
    "LIVE = under 3° orb — active, lead with these.",
    "BACKGROUND = 3-6° orb — context only, never a date anchor.",
    "APPLYING = still tightening, the event is building. SEPARATING = the peak has passed.",
    "",
  ];

  for (const a of aspects) {
    const motion = a.isApplying ? "APPLYING" : "SEPARATING";
    const rx = a.isRetrograde ? " Rx" : "";
    lines.push(
      `[${a.band.toUpperCase()}] Transit ${a.transitPlanet}${rx} ${a.transitSign} ${a.transitDegree} ` +
      `${a.aspectType} natal ${a.natalPlanet} ${a.natalSign} ${a.natalDegree} ` +
      `(House ${a.natalHouse ?? "—"}) — ${a.orbDegrees}° orb, ${motion}`
    );
  }

  return lines.join(NL);
}

function buildFollowupPrompt(body: FollowupRequestBody): string {
  const {
    question,
    originalReading,
    originalTitle,
    topic,
    tropical,
    sidereal,
    transits,
    transitAspects,
    profection,
    progressions,
    solarArcs,
    upcomingTrigger,
    planetaryStations,
    solarReturn,
    moonPhase,
    conversationHistory,
  } = body;

  const topicLabel =
    topic === "love"
      ? "love and relationships"
      : topic === "career"
      ? "career and professional life"
      : topic === "money"
      ? "money and finances"
      : "life in general";

  const planetList = tropical.planets.map(fmtPlanet).join(NL);

  const aspectList = (tropical.aspects || [])
    .slice()
    .sort((a, b) => a.orbDegrees - b.orbDegrees)
    .map(fmtAspect)
    .join(NL);

  const transitList = (transits || []).map(fmtTransit).join(NL);

  const transitAspectBlock = fmtTransitAspects(transitAspects);

  const progressionsBlock =
    progressions && progressions.length > 0
      ? NL +
        [
          "SECONDARY PROGRESSIONS (current — inner development):",
          ...progressions.map(fmtProgression),
          "ROLE: The transit is the event; the progression is the person it is happening to. Use these to",
          "explain WHY something is landing the way it is.",
          "",
        ].join(NL)
      : "";

  const solarArcsBlock =
    solarArcs && solarArcs.length > 0
      ? NL +
        [
          "SOLAR ARC DIRECTIONS (current — long-arc structural timing):",
          ...solarArcs.map(fmtSolarArc),
          "ROLE: Only meaningful within 1° of a natal planet or angle. Then it marks a multi-year structural",
          "shift underneath the moment. Otherwise ignore entirely.",
          "",
        ].join(NL)
      : "";

  const upcomingTriggerBlock = upcomingTrigger
    ? NL +
      "NEXT EXACT ASPECT (ephemeris-calculated — primary timing anchor):" + NL +
      `${upcomingTrigger.transitPlanet} ${upcomingTrigger.aspect} natal ${upcomingTrigger.natalPlanet} — exact within 1° on ${upcomingTrigger.date}` +
      NL
    : "";

  const moonPhaseBlock = moonPhase
    ? NL +
      [
        "MOON PHASE (timing texture — shapes WHEN, never what):",
        `${moonPhase.phaseName}, ${moonPhase.illuminationPercent}% illuminated. Moon in ${moonPhase.moonSign}.`,
        `Next ${moonPhase.nextEventName} in ${moonPhase.daysUntilNextEvent} days.`,
        "ROLE: Waxing supports initiating and building. Waning supports closing, releasing, and cutting.",
        "Use to choose which window to push toward — never as a prediction on its own.",
        "",
      ].join(NL)
    : "";

  const stationsBlock =
    planetaryStations && planetaryStations.length > 0
      ? NL +
        [
          "PLANETARY STATIONS (next 60 days — crystallization points):",
          "ROLE: Stations with natal hits are PRIMARY timing anchors and outrank ordinary transits.",
          ...planetaryStations.map((s) => {
            const hit = s.natalPlanetHit
              ? ` — stations within ${s.orbDegrees}° of natal ${s.natalPlanetHit} (House ${s.natalHouse})`
              : " — no exact natal hit within 3°";
            return `${s.planet} stations ${s.stationType.toUpperCase()} on ${s.stationDate} at ${s.degree} ${s.sign}${hit}`;
          }),
          "",
        ].join(NL)
      : "";

  const solarReturnBlock = solarReturn
    ? NL +
      [
        `SOLAR RETURN (${solarReturn.sunReturnDate} — cast for ${solarReturn.location}):`,
        `SR Ascendant: ${solarReturn.ascendant.sign} ${solarReturn.ascendant.degree}`,
        `SR Midheaven: ${solarReturn.midheaven.sign} ${solarReturn.midheaven.degree}`,
        solarReturn.timeLordInSR
          ? `Time Lord (${profection.timeLord}) falls in SR ${solarReturn.timeLordInSR}.`
          : "",
        "SR Planets: " + solarReturn.planets.map((p) => `${p.name} ${p.sign} H${p.house}`).join(", "),
        "ROLE — FILTER RULE: A transit must be reflected in Solar Return themes to trigger a major external",
        "event. Use SR to CONFIRM or DOWNGRADE. No SR support means the shift is internal, not an event.",
        "",
      ]
        .filter(Boolean)
        .join(NL)
    : "";

  const siderealBlock =
    sidereal?.planets?.length
      ? NL +
        [
          "SIDEREAL PLACEMENTS:",
          ...sidereal.planets.map(fmtPlanet),
          "ROLE — CONFIRMATION FILTER: A second opinion, not a second reading. Agrees with tropical → say it",
          "with more force. Disagrees → soften the certainty of that specific claim. NEVER mention sidereal,",
          "tropical, or any system name in the prose. It shapes confidence; it is not content.",
          "",
        ].join(NL)
      : "";

  const voiceCalibrationBlock = buildVoiceCalibrationBlock(
    tropical.planets.map((p) => ({ name: p.name, sign: p.sign }))
  );

  const conversationBlock = conversationHistory
    ? `PREVIOUS CONVERSATION:\n${conversationHistory}\n`
    : "";

  return [
    "You are answering a follow-up from a real person who is paying for clarity about something that matters",
    "to them. They may know nothing about astrology. Write so they understand every sentence.",
    "",
    "CRITICAL REAL-ESTATE RULE: Mobile screen. Short, heavy sentences. No fluff. No recycled wording.",
    "Answer the latest question only — but answer it from the chart.",
    "",
    "═══════════════════════════════════════════",
    "THE LANGUAGE RULE — THIS GOVERNS EVERYTHING",
    "═══════════════════════════════════════════",
    "The prose is for a human being. This is a conversation, not a technical readout.",
    "",
    "DO NOT WRITE: degrees, minutes, orb numbers, or the words 'orb', 'anaretic', 'applying', 'separating',",
    "'ingress', 'cusp'. Never name sidereal, tropical, solar arc, or any system.",
    "",
    "DO WRITE: the planet, the aspect, and the house TRANSLATED into what it governs.",
    "  Not: 'Mercury at 24°35' Cancer trine natal North Node at 23°47' Scorpio, 1° orb.'",
    "  But: 'Mercury is exactly trine your North Node right now, in the part of your chart that rules courts.'",
    "Houses by MEANING, not number. Plain consequence. What they will actually feel, face, or decide.",
    "",
    "This loses NO precision. Every claim still rests on an exact calculated aspect. Precision lives in the",
    "sharpness of the consequence — 'you will feel it Thursday and here is exactly what it looks like' —",
    "never in decimal places.",
    "",
    "═══════════════════════════════════════════",
    "QUESTION + CONTEXT",
    "═══════════════════════════════════════════",
    `TOPIC: ${topicLabel}`,
    `ORIGINAL TITLE: ${originalTitle}`,
    "",
    "ORIGINAL READING (context only — NOT your evidence):",
    originalReading,
    "",
    conversationBlock,
    "THEIR LATEST QUESTION:",
    `"${question}"`,
    "",
    "═══════════════════════════════════════════",
    "EVIDENCE — THE MATH IS DONE FOR YOU",
    "═══════════════════════════════════════════",
    voiceCalibrationBlock,
    "",
    transitAspectBlock,
    "",
    upcomingTriggerBlock,
    stationsBlock,
    moonPhaseBlock,
    solarReturnBlock,
    "NATAL PLACEMENTS:",
    planetList,
    "",
    "NATAL ASPECTS (tightest first — the fixed wiring they were born with):",
    aspectList || "None provided.",
    "ROLE: These never change. They are the pattern the transits are ACTIVATING.",
    siderealBlock,
    "CURRENT TRANSIT POSITIONS:",
    transitList || "None provided.",
    "",
    "ANNUAL PROFECTION:",
    `Age ${profection.age}, House ${profection.activatedHouse} (${profection.activatedSign}), Time Lord: ${profection.timeLord}` +
      (profection.timeLordNatalSign
        ? ` (Natal: ${profection.timeLordNatalSign}${profection.timeLordNatalHouse ? `, House ${profection.timeLordNatalHouse}` : ""})`
        : ""),
    "ROLE: Any transit involving the Time Lord is AMPLIFIED — it carries more weight this year than it",
    "otherwise would. If your answer rests on a Time Lord transit, that is the strongest answer available.",
    progressionsBlock,
    solarArcsBlock,
    "",
    "═══════════════════════════════════════════",
    "FOLLOW-UP RULES",
    "═══════════════════════════════════════════",
    "You are not writing a new full reading. You are answering one question using the chart data above.",
    "The ORIGINAL READING is prior context only. The chart blocks are your evidence.",
    "",
    "If they ask WHY → identify the tightest natal aspect or calculated transit driving it.",
    "If they ask WHEN → answer from the calculated aspects, the next exact aspect, stations, and moon phase.",
    "If they ask WHAT TO DO → one concrete action tied to the nearest valid window.",
    "If they ask about a specific planet, house, or date → stay on that thread and go deeper there only.",
    "",
    "ONLY calculated aspects. Never invent one. Never manufacture a date.",
    "An APPLYING aspect is building — speak of it as coming. A SEPARATING one has peaked — speak of it as passing.",
    "No degrees, no orbs, no jargon. No hedging. No generic spiritual filler. No copy-pasting the original reading.",
    "'You' in every sentence. No passive voice. Outcomes as facts.",
    "3-5 compact paragraphs maximum. No headers.",
    "End with one sentence that either closes the loop or opens the next natural question.",
    "",
    "VOICE: The calibration above governs DELIVERY, never content. If a voice instruction calls for precision",
    "or exactness, deliver it through SHARPNESS OF CONSEQUENCE — never by reciting degrees. The LANGUAGE RULE",
    "overrides any voice instruction that would pull you toward jargon.",
    "",
    "Return ONLY a valid JSON object:",
    '{ "title": "A sharp 4-6 word title specific to their question", "content": "The deeper chart-grounded response as flowing prose, in plain human language." }',
  ].join(NL);
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Parse + validate the body FIRST ─────────────────────────────────────
    // We need `freeRepliesUsed` from the body to decide access, so parsing has
    // to happen before the gate (in the old code it ran after).
    const body = (await request.json()) as FollowupRequestBody;

    if (
      !body.question ||
      !body.originalReading ||
      !body.originalTitle ||
      !body.topic ||
      !body.tropical ||
      !body.tropical.planets ||
      !body.profection ||
      !body.transits
    ) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // ── Reply-access gating ─────────────────────────────────────────────────
    // Priority: subscribed (unlimited) → free replies → paid replyCredits → block.
    //
    // HARD RULE: this route only ever reads/writes `replyCredits`. It never
    // touches `credits` (readings) or `readingsCompleted`. Sending a reply must
    // never advance the reading cycle or spend a reading credit.
    const FREE_REPLIES_PER_READING = 2;

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const metadata = user.publicMetadata;

    const isSubscribed = metadata?.isSubscribed === true;
    const replyCredits = Number(metadata?.replyCredits ?? 0);
    const freeRepliesUsed = Math.max(0, Number(body.freeRepliesUsed ?? 0));

    // ── LAYER 1: crisis check ────────────────────────────────────────────────
    // Before the reply gate and the model call, so a block never spends a reply
    // and preempts the paywall — someone in crisis gets help, not a 402.
    const risk = assessRisk(body?.question ?? "");
    if (risk.action === "block_crisis" || risk.action === "block_emergency") {
      const safe = getSafeResponse(risk);
      console.warn(
        `[followup] Layer 1 block — level=${risk.level} action=${risk.action} ` +
        `conf=${risk.confidence} signals=${risk.signals.join("|")}`
      );
      return NextResponse.json(
        {
          title: safe.title,
          content: safe.answer + "\n\n" + safe.confirmation,
          // Nothing was spent — the client must not decrement its reply counter.
          isSafeResponse: true,
          riskLevel: risk.level,
          replyMeta: {
            accessTier: null,
            usedFreeReply: false,
            freeRepliesRemaining: Math.max(0, FREE_REPLIES_PER_READING - freeRepliesUsed),
            replyCreditsRemaining: replyCredits,
            isSubscribed,
          },
        },
        { status: 200 }
      );
    }
    // MEDIUM proceeds to the full answer; this rides along underneath it.
    const careNote = getCareNote(risk);

    let accessTier: "subscribed" | "free" | "credit" | null;
    if (isSubscribed) {
      accessTier = "subscribed"; // unlimited, deduct nothing
    } else if (freeRepliesUsed < FREE_REPLIES_PER_READING) {
      accessTier = "free"; // client-tracked free reply
    } else if (replyCredits > 0) {
      accessTier = "credit"; // paid reply, deduct after success
    } else {
      accessTier = null; // out of everything → paywall
    }

    if (accessTier === null) {
      return NextResponse.json(
        {
          error: "You've used your free replies. Get 2 more for $2 to keep the conversation going.",
          code: "NO_REPLY_CREDITS",
        },
        { status: 402 }
      );
    }
    // Note: deduction happens AFTER a successful generation, so a failed API
    // call never burns a paid reply credit.

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API configuration error." }, { status: 500 });
    }

    const prompt = buildFollowupPrompt(body);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1400,
        system:
          "You are a precision astrologer answering a follow-up question after an initial reading, for a real " +
          "person who may know nothing about astrology. Write so they understand every sentence. " +
          "Answer from the supplied chart data, not from vague memory of the original reading — the original " +
          "reading is context only; the chart data is evidence. " +
          "The transit aspects are calculated and given to you — never compute or invent one. " +
          "CRITICAL: no degrees, no orbs, and no astrological jargon in your prose. This is a conversation, not " +
          "a technical readout. You lose no precision — precision lives in the sharpness of the consequence, " +
          "not in decimal places. " +
          "Speak directly to the person as 'you'. State outcomes as facts. Keep it tight and mobile-optimized. " +
          "Output ONLY raw valid JSON — no markdown, no code fences, no preamble.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[followup] Claude error:", err);
      return NextResponse.json(
        { error: "Failed to generate response. Please try again." },
        { status: 502 }
      );
    }

    const claudeData = await response.json();
    const rawText = claudeData.content?.[0]?.text;

    if (!rawText) {
      return NextResponse.json(
        { error: "No response from reading engine." },
        { status: 502 }
      );
    }

    let parsed: { title: string; content: string };
    try {
      let cleaned = rawText.trim();
      if (cleaned.startsWith("```")) cleaned = cleaned.slice(cleaned.indexOf("\n") + 1);
      if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, cleaned.lastIndexOf("```"));
      cleaned = cleaned.trim();

      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        cleaned = cleaned.slice(start, end + 1);
      }

      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("[followup] Failed to parse response:", String(parseErr));
      console.error("[followup] Raw response start:", rawText.slice(0, 300));
      console.error("[followup] Raw response end:", rawText.slice(-200));
      return NextResponse.json(
        { error: "Failed to parse response. Please try again." },
        { status: 422 }
      );
    }

    // ── Spend a PAID reply credit — only on success, only for the credit tier ─
    // Free replies are tracked client-side and reported via `freeRepliesUsed`.
    // Subscribers are unlimited. Reading credits are never touched here.
    let replyCreditsRemaining = replyCredits;
    if (accessTier === "credit") {
      replyCreditsRemaining = Math.max(0, replyCredits - 1);
      await client.users.updateUserMetadata(userId, {
        publicMetadata: {
          ...metadata,
          replyCredits: replyCreditsRemaining,
        },
      });
      console.log(
        `[followup] spent 1 reply credit for ${userId}. Remaining: ${replyCreditsRemaining}`
      );
    }

    const usedFreeReply = accessTier === "free";
    const freeRepliesRemaining = Math.max(
      0,
      FREE_REPLIES_PER_READING - (freeRepliesUsed + (usedFreeReply ? 1 : 0))
    );

    return NextResponse.json(
      {
        title: parsed.title,
        content: parsed.content,
        // null unless MEDIUM risk; client renders it quietly beneath the answer.
        careNote,
        // The client uses this to update its free-reply counter and to know
        // whether to show "replies remaining" vs. the paywall next time.
        replyMeta: {
          accessTier,
          usedFreeReply,
          freeRepliesRemaining,
          replyCreditsRemaining,
          isSubscribed,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[followup] Unexpected error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}