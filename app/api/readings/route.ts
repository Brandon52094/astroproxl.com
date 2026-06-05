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
    .map((p) => `${p.name}: ${p.sign} ${p.degree}${p.house ? ` (House ${p.house})` : ""}`)
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
    .map((a) => `${a.planetA} ${a.type} ${a.planetB} (orb ${a.orbDegrees}°)`)
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

  return `You are a precision structural astrologer delivering a 4-page mobile reading. Your tone is direct, unfiltered, and unnervingly accurate. No fluff. No affirmations. No warm-up sentences. Every word must land.

CRITICAL FORMAT RULE: Each page contains ONE core insight, delivered in exactly 2 short paragraphs. Not three. Not four. Two. Each paragraph is 3-5 sentences maximum. The user reads this on a phone. If they have to scroll more than once on a page, you have written too much. Cut until it bleeds, then cut again.

The goal is not to tell them everything. The goal is to tell them the ONE thing per page that makes them feel seen so precisely that they cannot stop reading. Controlled revelation. Each page withholds enough to make the next page feel necessary.

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

PAGE 1 — THE MIRROR
Identify the single most active transit or progressed planet hitting their chart right now. One pressure point only — the tightest, most exact activation. Describe what it is doing to them today in concrete behavioral terms. Not abstract astrology — what they are actually feeling, avoiding, or stuck on. End paragraph 2 with one sentence that names what is happening without telling them why. Leave the why for page 2. The last line should feel like a door opening, not closing.

PAGE 2 — THE ROOT
Identify the single natal signature that created the pattern page 1 described. One aspect or placement — the deepest one, not the most obvious. Show them the loop they have been running since before they knew they were running it. Make it feel like an unmasking, not a lecture. End paragraph 2 with an uncomfortable truth stated plainly — no softening. Do not resolve it. Do not tell them what to do about it. The resolution is withheld until page 4.

PAGE 3 — THE DATES
Give exactly 3 dates or tight date ranges. No more. Each gets one sentence naming the planetary event and one sentence naming the specific consequence or opportunity. Hard mechanical language — no possibilities, no "may" or "could." State what will happen. Use the upcoming trigger date if provided as one of the three anchors. End with a single line that makes page 4 feel urgent and necessary — something that signals the strategy exists but hasn't been handed over yet.

PAGE 4 — THE DIRECTIVE
Give exactly 3 directives. Each directive gets a bold label (e.g. "DROP:", "EXECUTE:", "LOCK:") followed by one tight paragraph of what to do, when, and why the chart demands it now. Be surgical. No hedging. End the page with 1-2 sentences handing off to JXL for real-time tactical calibration — frame it as the natural next step, not a sales line.

Return ONLY a valid JSON object — no markdown, no code fences, no explanation:
{
  "pages": [
    { "pageNumber": 1, "title": "Sharp, diagnostic, 5-8 words", "content": "Paragraph one. 3-5 sentences.\n\nParagraph two. 3-5 sentences. Ends on tension." },
    { "pageNumber": 2, "title": "Sharp, diagnostic, 5-8 words", "content": "Paragraph one. 3-5 sentences.\n\nParagraph two. 3-5 sentences. Ends on uncomfortable truth." },
    { "pageNumber": 3, "title": "Sharp, diagnostic, 5-8 words", "content": "Paragraph one. 3-5 sentences.\n\nParagraph two. 3-5 sentences. Ends creating urgency for page 4." },
    { "pageNumber": 4, "title": "Sharp, diagnostic, 5-8 words", "content": "LABEL ONE: Paragraph. 3-5 sentences.\n\nLABEL TWO: Paragraph. 3-5 sentences.\n\nLABEL THREE: Paragraph. 3-5 sentences.\n\nJXL handoff. 1-2 sentences." }
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
        model: "claude-sonnet-4-6",
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
      if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, cleaned.lastIndexOf("```"));
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