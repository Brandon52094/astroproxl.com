import { NextRequest, NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  profectionYear: number;
  activatedHouse: number;
  activatedSign: string;
  timeLord: string;
  timeLordNatalSign: string;
  timeLordNatalHouse: number;
}

interface UpcomingTrigger {
  date: string;
  transitPlanet: string;
  natalPlanet: string;
  aspect: string;
}

interface ReadingPage {
  pageNumber: 1 | 2 | 3 | 4;
  title: string;
  content: string;
}

interface ReadingRequestBody {
  topic: "love" | "career" | "money" | "general";
  question: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  tropical: { planets: PlanetPlacement[]; aspects: Aspect[] };
  sidereal: { planets: PlanetPlacement[] };
  transits: TransitPlanet[];
  profection: ProfectionData;
  progressions?: ProgressedPlanet[];
  solarArcs?: SolarArcPlanet[];
  upcomingTrigger?: UpcomingTrigger;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPlacements(planets: PlanetPlacement[]): string {
  return planets
    .map((p) => {
      const isAnaretic = p.degree.startsWith("29°");
      return `${p.name}: ${p.sign} ${p.degree}${p.house ? ` (House ${p.house})` : ""}${isAnaretic ? " [CRITICAL 29° ANARETIC DEGREE - HIGH PRESSURE KARMIC THRESHOLD]" : ""}`;
    })
    .join("\n");
}

function formatTransits(transits: TransitPlanet[]): string {
  return transits
    .map((p) => `${p.name}: ${p.sign} ${p.degree}${p.isRetrograde ? " Rx" : ""}`)
    .join("\n");
}

function formatProgressions(progressions: ProgressedPlanet[]): string {
  return progressions
    .map((p) => `${p.name}: ${p.sign} ${p.degree}`)
    .join("\n");
}

function formatSolarArcs(solarArcs: SolarArcPlanet[]): string {
  return solarArcs
    .map((p) => `${p.name}: ${p.sign} ${p.degree}`)
    .join("\n");
}

function formatAspects(aspects: Aspect[]): string {
  return aspects
    .map((a) => {
      const isTight = a.orbDegrees <= 2.0;
      return `${a.planetA} ${a.type} ${a.planetB} (orb ${a.orbDegrees}°)${isTight ? " [TIGHT ORB CORE PSYCHOLOGICAL COMPLEX]" : ""}`;
    })
    .join("\n");
}

function buildReadingPrompt(body: ReadingRequestBody): string {
  const { topic, question, tropical, sidereal, transits, profection, progressions, solarArcs, upcomingTrigger } = body;

  const topicLabel =
    topic === "love" ? "love and relationships"
    : topic === "career" ? "career and professional life"
    : topic === "money" ? "money and finances"
    : "life in general";

  const currentDateString = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const upcomingTriggerBlock = upcomingTrigger
    ? `\nNEXT EXACT ASPECT (Ephemeris-Calculated Hard Date):
${upcomingTrigger.transitPlanet} ${upcomingTrigger.aspect} natal ${upcomingTrigger.natalPlanet} — exact within 1° on ${upcomingTrigger.date}
Use this as a hard anchor date in Page 3.\n`
    : "";

  const progressionsBlock = progressions && progressions.length > 0
    ? `\nSECONDARY PROGRESSIONS (Current):
${formatProgressions(progressions)}\n`
    : "";

  const solarArcsBlock = solarArcs && solarArcs.length > 0
    ? `\nSOLAR ARC DIRECTIONS (Current):
${formatSolarArcs(solarArcs)}\n`
    : "";

  return `You are a precision structural astrologer delivering a 4-page mobile reading. Your tone is direct, cold, articulate, and completely unfiltered—devoid of spiritual boilerplate, generic affirmations, or comforting introductions.

CRITICAL FORMAT RULE: Each page contains ONE core insight, delivered in exactly 2 short paragraphs (except page 4). Each paragraph must be 3-5 sentences maximum. Avoid any generic layout padding. Write heavy, short, and rhythmic prose designed for quick scannability on a narrow mobile UI screen view.

THE HOOK REVELATION LOOP:
Do not satisfy the user's curiosity too early. Page 1 diagnoses the acute symptom. Page 2 unmasks the hidden natal vulnerability loop. Page 3 lays out a concrete, inevitable linear timing grid. Page 4 provides the structural execution baseline.

═══════════════════════════════════════════
CHART DATA
═══════════════════════════════════════════
TODAY: ${currentDateString}
${upcomingTriggerBlock}
TROPICAL PLACEMENTS:
${formatPlacements(tropical.planets)}

NATAL ASPECTS:
${formatAspects(tropical.aspects)}

SIDEREAL PLACEMENTS:
${formatPlacements(sidereal.planets)}

CURRENT TRANSITS:
${formatTransits(transits)}

PROFECTION:
Age ${profection.age}, House ${profection.activatedHouse} (${profection.activatedSign}), Time Lord: ${profection.timeLord} (Natal: ${profection.timeLordNatalSign}, House ${profection.timeLordNatalHouse})
${progressionsBlock}${solarArcsBlock}
QUESTION (${topicLabel}):
"${question}"

═══════════════════════════════════════════
PAGE INSTRUCTIONS
═══════════════════════════════════════════

PAGE 1 — THE MIRROR (The Acute Symptom)
Isolate the absolute tightest, most high-pressure current transit or progression actively squeezing their chart today. Map it directly into an immediate behavioral symptom regarding their question. Describe exactly what they are avoiding, over-analyzing, or physically feeling right now. The tone must be a cold diagnosis. End paragraph 2 with a high-tension cliffhanger sentence that exposes their current friction but intentionally holds back the internal reason *why* they do it.

PAGE 2 — THE ROOT (The Subconscious Defense Loop)
Expose the specific natal layout (prioritizing any flagged [TIGHT ORB] aspects or [CRITICAL 29° ANARETIC] placements) that fuels the Page 1 symptom. Show them the deep defensive pattern or core identity cycle they have repeated since childhood. Make them realize that their external issue is a predictable internal loop written into their natal geometry. End paragraph 2 with a blunt, uncomfortable truth. Do not offer a solution or tell them how to fix it yet—withhold the strategic path entirely.

PAGE 3 — THE TIMING (The Gear Alignment Grid)
Provide exactly 3 future date ranges or tight timeline windows relative to the calendar date baseline. No vague approximations like "in a few weeks". State these as absolute, unhedged mechanical outcomes. Frame each window as a sequential gear turn: 1 sentence explaining the specific planet collision, and 1 sentence naming the concrete material consequence. End this page with a single line signaling that while these dates are certain, navigating the oncoming friction successfully requires a distinct strategic blueprint.

PAGE 4 — THE DIRECTIVE (The Operational Strategy Blueprint)
Provide exactly 3 specific operational strategy commands. Every directive must open with a direct, capitalized bold label ("DROP:", "EXECUTE:", or "LOCK:") followed by one tight paragraph dictating the real-world operational execution required to master the Page 3 timing windows. No cushioning or softening. Conclude the page with 1-2 sentences stating that real-time tracking, calibration, and direct action on this blueprint belongs entirely within the interactive JXL space.

Return ONLY a valid JSON object — no markdown, no code fences, no explanation:
{
  "pages": [
    { "pageNumber": 1, "title": "Sharp, diagnostic, 5-8 words", "content": "Paragraph one. 3-5 sentences.\n\nParagraph two. 3-5 sentences. Ends on acute tension cliffhanger." },
    { "pageNumber": 2, "title": "Sharp, diagnostic, 5-8 words", "content": "Paragraph one. 3-5 sentences.\n\nParagraph two. 3-5 sentences. Ends on unsoftened uncomfortable truth." },
    { "pageNumber": 3, "title": "Sharp, diagnostic, 5-8 words", "content": "Paragraph one. 3-5 sentences.\n\nParagraph two. 3-5 sentences. Ends with a high-stakes transition to strategy." },
    { "pageNumber": 4, "title": "Sharp, diagnostic, 5-8 words", "content": "DROP: Paragraph. 3-5 sentences.\n\nEXECUTE: Paragraph. 3-5 sentences.\n\nLOCK: Paragraph. 3-5 sentences.\n\nJXL handoff instruction sentence." }
  ]
}`;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ReadingRequestBody;

    if (!body.topic || !body.question || !body.tropical || !body.transits || !body.profection) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API configuration error." }, { status: 500 });
    }

    const prompt = buildReadingPrompt(body);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2500,
        system: "You are a precision structural astrologer. You output ONLY raw valid JSON — no markdown, no code fences, no explanation. Your entire response must be a single parseable JSON object. Each page content must be exactly 2 paragraphs separated by a blank line (\\n\\n), except page 4 which has 4 sections. Never exceed 5 sentences per paragraph.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[readings] Claude error:", err);
      return NextResponse.json({ error: "Failed to generate reading. Please try again." }, { status: 502 });
    }

    const claudeData = await response.json();
    const rawText = claudeData.content?.[0]?.text;

    if (!rawText) {
      return NextResponse.json({ error: "No response from reading engine." }, { status: 502 });
    }

    let parsed: { pages: ReadingPage[] };
    try {
      let cleaned = rawText.trim();
      if (cleaned.startsWith("```")) cleaned = cleaned.slice(cleaned.indexOf("\n") + 1);
      if (cleaned.endsWith("
```")) cleaned = cleaned.slice(0, cleaned.lastIndexOf("```"));
      cleaned = cleaned.trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[readings] Failed to parse Claude response:", rawText.slice(0, 500));
      return NextResponse.json({ error: "Failed to parse reading. Please try again." }, { status: 422 });
    }

    if (!parsed.pages || parsed.pages.length !== 4) {
      return NextResponse.json({ error: "Reading structure was incomplete. Please try again." }, { status: 422 });
    }

    return NextResponse.json({
      reading: {
        id: crypto.randomUUID(),
        pages: parsed.pages,
        topic: body.topic,
        question: body.question,
        status: "complete",
      },
    }, { status: 201 });

  } catch (error) {
    console.error("[readings] Unexpected error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}