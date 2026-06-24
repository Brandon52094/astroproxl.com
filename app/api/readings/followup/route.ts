import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { buildVoiceCalibrationBlock } from "@/lib/signVoice";

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

interface FollowupRequestBody {
  question: string;
  originalReading: string;
  originalTitle: string;
  topic: "love" | "career" | "money" | "general";
  tropical: { planets: PlanetPlacement[]; aspects: Aspect[] };
  sidereal?: { planets: PlanetPlacement[] };
  transits: TransitPlanet[];
  profection: ProfectionData;
  progressions?: ProgressedPlanet[];
  solarArcs?: SolarArcPlanet[];
  upcomingTrigger?: UpcomingTrigger;
  planetaryStations?: PlanetaryStationData[];
  solarReturn?: SolarReturnData;
  conversationHistory?: string;
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

function buildFollowupPrompt(body: FollowupRequestBody): string {
  const {
    question,
    originalReading,
    originalTitle,
    topic,
    tropical,
    sidereal,
    transits,
    profection,
    progressions,
    solarArcs,
    upcomingTrigger,
    planetaryStations,
    solarReturn,
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

  const progressionsBlock =
    progressions && progressions.length > 0
      ? NL + "SECONDARY PROGRESSIONS (Current):" + NL + progressions.map(fmtProgression).join(NL) + NL
      : "";

  const solarArcsBlock =
    solarArcs && solarArcs.length > 0
      ? NL + "SOLAR ARC DIRECTIONS (Current):" + NL + solarArcs.map(fmtSolarArc).join(NL) + NL
      : "";

  const upcomingTriggerBlock = upcomingTrigger
    ? NL +
      "NEXT EXACT ASPECT (Ephemeris-Calculated — primary timing anchor):" + NL +
      `${upcomingTrigger.transitPlanet} ${upcomingTrigger.aspect} natal ${upcomingTrigger.natalPlanet} — exact within 1° on ${upcomingTrigger.date}` +
      NL
    : "";

  const stationsBlock =
    planetaryStations && planetaryStations.length > 0
      ? NL +
        [
          "PLANETARY STATIONS (next 60 days — crystallization points):",
          "Stations with natal hits are PRIMARY timing anchors.",
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
        "Use Solar Return to confirm or downgrade major event claims.",
        "",
      ]
        .filter(Boolean)
        .join(NL)
    : "";

  const siderealBlock =
    sidereal?.planets?.length
      ? NL + "SIDEREAL PLACEMENTS:" + NL + sidereal.planets.map(fmtPlanet).join(NL) + NL
      : "";

  const voiceCalibrationBlock = buildVoiceCalibrationBlock(
    tropical.planets.map((p) => ({ name: p.name, sign: p.sign }))
  );

  const conversationBlock = conversationHistory
    ? `PREVIOUS CONVERSATION:\n${conversationHistory}\n`
    : "";

  return [
    "CRITICAL REAL-ESTATE RULE: Mobile screen. Short, heavy sentences. No fluff. No recycled wording. Answer the latest question only, but answer it from the chart.",
    "",
    "═══════════════════════════════════════════",
    "QUESTION + CONTEXT",
    "═══════════════════════════════════════════",
    `TOPIC: ${topicLabel}`,
    `ORIGINAL TITLE: ${originalTitle}`,
    "",
    "ORIGINAL READING:",
    originalReading,
    "",
    conversationBlock,
    "THEIR LATEST QUESTION:",
    `"${question}"`,
    "",
    "═══════════════════════════════════════════",
    "EVIDENCE — USE THIS, NOT VAGUE MEMORY",
    "═══════════════════════════════════════════",
    voiceCalibrationBlock,
    upcomingTriggerBlock,
    stationsBlock,
    solarReturnBlock,
    "NATAL PLACEMENTS:",
    planetList,
    "",
    "NATAL ASPECTS (tightest first — priority order):",
    aspectList || "None provided.",
    siderealBlock,
    "CURRENT TRANSITS:",
    transitList || "None provided.",
    "",
    "ANNUAL PROFECTION:",
    `Age ${profection.age}, House ${profection.activatedHouse} (${profection.activatedSign}), Time Lord: ${profection.timeLord}` +
      (profection.timeLordNatalSign
        ? ` (Natal: ${profection.timeLordNatalSign}${profection.timeLordNatalHouse ? `, House ${profection.timeLordNatalHouse}` : ""})`
        : ""),
    progressionsBlock,
    solarArcsBlock,
    "",
    "═══════════════════════════════════════════",
    "FOLLOW-UP RULES",
    "═══════════════════════════════════════════",
    "You are not writing a new full reading. You are answering one follow-up question using the chart data above.",
    "Use the ORIGINAL READING only as prior context. Do not treat it as your evidence. Use the chart blocks above as evidence.",
    "If they ask WHY, identify the tightest natal aspect or current transit driving it.",
    "If they ask WHEN, answer from current transits, the upcoming trigger, stations, progressions, solar arcs, and solar return confirmation.",
    "If they ask WHAT TO DO, give one concrete action tied to the nearest valid timing window.",
    "If they ask about a specific planet, house, aspect, or date, stay on that thread and go deeper there only.",
    "Name the exact planet, sign, degree, house, and orb when available.",
    "Tight orbs lead. Wide orbs are background only. Ignore wide aspects over 6°.",
    "Transits within 2° are urgent. Beyond 5° are not valid timing anchors.",
    "No hedging. No generic spiritual filler. No copy-pasting the original reading.",
    "You in every sentence. No passive voice.",
    "3-5 compact paragraphs maximum. No headers.",
    "End with one sentence that either closes the loop or opens the next natural question.",
    "",
    "Return ONLY a valid JSON object:",
    '{ "title": "A sharp 4-6 word title specific to their question", "content": "The deeper chart-grounded response as flowing prose." }',
  ].join(NL);
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
          "You are a precision astrologer answering a follow-up question after an initial reading. You must answer from the supplied chart data, not from vague memory of the original reading. The original reading is context only. The chart data is evidence. Speak directly to the person as 'you'. State outcomes as facts. Name specific planets, signs, degrees, houses, and timing windows when available. Keep it tight, mobile-optimized, and specific. Output ONLY raw valid JSON — no markdown, no code fences, no preamble.",
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

    return NextResponse.json(
      { title: parsed.title, content: parsed.content },
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