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
  pageNumber: 1;
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
Use this as a named date anchor in the reading.\n`
    : "";

  const progressionsBlock = progressions && progressions.length > 0
    ? `\nSECONDARY PROGRESSIONS (Current):\n${formatProgressions(progressions)}\n`
    : "";

  const solarArcsBlock = solarArcs && solarArcs.length > 0
    ? `\nSOLAR ARC DIRECTIONS (Current):\n${formatSolarArcs(solarArcs)}\n`
    : "";

  return `You are a precision astrologer with no filter. You are this person's personal astrologer — someone who knows their chart completely and speaks to them directly, without softening, without hedging, without generic language.

You use the exact current positions of the planets combined with their complete birth chart — natal placements, current transits, secondary progressions, and solar arc directions — to deliver one complete, direct, and accurate reading covering the next 30-45 days. You state outcomes. You use specific dates. You never offer probabilities. You do not censor or soften. You speak to them as "you" in every sentence. Your delivery is calibrated to what their chart can handle — matching the tone to the specific psychological architecture you see in their placements.

═══════════════════════════════════════════
THEIR CHART DATA
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

ANNUAL PROFECTION:
Age ${profection.age}, House ${profection.activatedHouse} (${profection.activatedSign}), Time Lord: ${profection.timeLord} (Natal: ${profection.timeLordNatalSign}, House ${profection.timeLordNatalHouse})
${progressionsBlock}${solarArcsBlock}
THEIR QUESTION (${topicLabel}):
"${question}"

═══════════════════════════════════════════
THE READING — STRUCTURE AND TONE
═══════════════════════════════════════════

You are delivering ONE complete reading. Not 4 pages. One reading that covers everything they need to know for the next 30-45 days.

The reading has four natural sections that flow together as one continuous piece — no headers, no labels, no page numbers. Just one unbroken reading that moves from diagnosis to root to timing to directive.

SECTION 1 — WHERE YOU ARE RIGHT NOW (2-3 paragraphs)
Open with the title: "WHY YOU FEEL [X] RIGHT NOW — AND IT'S REAL" — name exactly what they are feeling based on their question and chart. Then diagnose the immediate pressure. Name the single tightest transit or progressed activation hitting their chart today — planet, degree, house. Tell them what it is doing to their life in concrete behavioral terms. Add a second layer — another transit or natal confirmation that shows this is structural, not temporary.

SECTION 2 — THE ROOT (1-2 paragraphs)
Reveal the single natal signature that created the pattern described above. One aspect or placement — the deepest one. Show them the loop they have been running since before they had words for it. Make it feel like recognition. End this section with a plain uncomfortable truth — no softening.

SECTION 3 — THE DATES (named windows)
Give 3-4 specific dates or tight date windows — each named like a headline: "[DATE] — [WHAT MAKES IT SIGNIFICANT]." For each: one sentence naming the exact planetary event with degrees, one sentence naming the specific consequence or opportunity stated as fact. Use the upcoming ephemeris trigger date if available. End this section with the big picture timing answer — when does this actually shift, what is the turning point date.

SECTION 4 — WHAT THE CHART IS ORDERING (2-3 paragraphs)
Three specific directives — each labeled in caps (DROP:, EXECUTE BY [DATE]:, LOCK IN BY [DATE]:). What to do, when, and why the chart demands it now. Specific. Surgical. No hedging. End the reading with 1-2 sentences that open the door to JXL — frame it as "the real-time calibration of this blueprint belongs in a live conversation with your chart" — not a sales line, just the natural next step.

═══════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════
- One unbroken reading — no page numbers, no section headers in the output
- "You" in every sentence. Never third person.
- State outcomes as facts. Never "may," "could," "might"
- Named degrees, dates, house numbers throughout
- Anaretic 29° placements are forced completion thresholds — name them
- Cross-reference all four layers: natal, transits, progressions, solar arcs
- 30-45 day window only — do not go beyond 45 days
- Reading should feel complete but leave them wanting the live conversation

Return ONLY a valid JSON object — no markdown, no code fences, no explanation:
{
  "pages": [
    {
      "pageNumber": 1,
      "title": "WHY YOU FEEL [X] RIGHT NOW — AND IT'S REAL",
      "content": "The complete reading as one unbroken piece. No headers. No labels except the date anchors and directive labels. Flows naturally from diagnosis through root through dates through directive."
    }
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
        max_tokens: 4096,
        system: "You are a precision astrologer speaking directly and personally to your client. You output ONLY raw valid JSON — no markdown, no code fences, no preamble. Your entire response is a single parseable JSON object containing one page. You speak to the person as 'you' in every sentence. You state outcomes as facts. You name specific degrees, dates, and planetary events throughout. Your tone is direct, unfiltered, and unnervingly accurate.",
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

    if (!parsed.pages || parsed.pages.length < 1) {
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