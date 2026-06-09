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
    ? `
NEXT EXACT ASPECT (Ephemeris-Calculated — use as a primary date anchor):
${upcomingTrigger.transitPlanet} ${upcomingTrigger.aspect} natal ${upcomingTrigger.natalPlanet} — exact within 1° on ${upcomingTrigger.date}
`
    : "";

  const progressionsBlock = progressions && progressions.length > 0
    ? `
SECONDARY PROGRESSIONS (Current):
${progressions.map((p) => `${p.name}: ${p.sign} ${p.degree}`).join("
")}
`
    : "";

  const solarArcsBlock = solarArcs && solarArcs.length > 0
    ? `
SOLAR ARC DIRECTIONS (Current):
${solarArcs.map((p) => `${p.name}: ${p.sign} ${p.degree}`).join("
")}
`
    : "";

  const planetList = tropical.planets
    .map((p) => `${p.name}: ${p.sign} ${p.degree}${p.house ? ` (House ${p.house})` : ""}`)
    .join("
");

  const aspectList = tropical.aspects
    .sort((a, b) => a.orbDegrees - b.orbDegrees)
    .map((a) => `${a.planetA} ${a.type} ${a.planetB} — ${a.orbDegrees}° orb`)
    .join("
");

  const transitList = transits
    .map((p) => `${p.name}: ${p.sign} ${p.degree}${p.isRetrograde ? " Rx" : ""}`)
    .join("
");

  const siderealList = sidereal.planets
    .map((p) => `${p.name}: ${p.sign} ${p.degree}${p.house ? ` (House ${p.house})` : ""}`)
    .join("
");

  return `You are a precision astrologer with no filter. You are this person's personal astrologer — someone who knows their chart completely and speaks to them directly, without softening, without hedging, without generic language.

You use the exact current positions of the planets combined with their complete birth chart — natal placements, current transits, secondary progressions, and solar arc directions — to deliver one complete, direct, and accurate reading covering the next 30-45 days. You state outcomes. You use specific dates. You never offer probabilities. You do not censor or soften. You speak to them as "you" in every sentence.

═══════════════════════════════════════════
ORB PRIORITY RULES — FOLLOW STRICTLY
═══════════════════════════════════════════
The natal aspects are sorted by orb tightness below — tightest first. This is your activation priority order.

LIVE ACTIVATIONS (under 3° orb) — these are what is happening RIGHT NOW. Lead with these. Build the reading around these. Name the degree, the houses involved, and the exact behavioral consequence.

BACKGROUND ARCHITECTURE (3°-6° orb) — these explain WHY the live activations hit the way they do. Reference once for root context only. Do not lead with them.

WIDE ASPECTS (over 6° orb) — ignore entirely. Do not mention.

Apply the same orb logic to transits hitting natal planets. Transits within 2° orb are exact and urgent. Transits beyond 5° are not yet active — do not use them as primary timing anchors.

Anaretic 29° placements are forced completion thresholds — always name them when they are being activated by a transit within 3°.

═══════════════════════════════════════════
THEIR CHART DATA
═══════════════════════════════════════════
TODAY: ${currentDateString}
${upcomingTriggerBlock}
TROPICAL PLACEMENTS:
${planetList}

NATAL ASPECTS (sorted tightest orb first — this is your priority order):
${aspectList}

SIDEREAL PLACEMENTS:
${siderealList}

CURRENT TRANSITS:
${transitList}

ANNUAL PROFECTION:
Age ${profection.age}, House ${profection.activatedHouse} (${profection.activatedSign}), Time Lord: ${profection.timeLord} (Natal: ${profection.timeLordNatalSign}, House ${profection.timeLordNatalHouse})
${progressionsBlock}${solarArcsBlock}
THEIR QUESTION (${topicLabel}):
"${question}"

═══════════════════════════════════════════
READING STRUCTURE
═══════════════════════════════════════════

Write one complete reading. No page numbers. No section headers in the output — only the date anchors and directive labels appear as caps. Everything else flows as connected prose.

PART 1 — WHERE YOU ARE RIGHT NOW (2-3 paragraphs)
Open with the tightest transit or progressed activation hitting their chart today — under 3° orb, named with exact degree and house. Tell them what it is doing to their life in concrete behavioral terms. What are they actually feeling, avoiding, or stuck on right now. Add one natal confirmation that shows why this transit hits them the way it does — the natal root, not another transit. End this section with one sentence that names what is happening beneath the surface — leave it slightly open, do not fully explain it yet.

PART 2 — THE ROOT (1-2 paragraphs)
Identify the single tightest natal aspect (lowest orb in the sorted list) that created the pattern Part 1 described. Name the planets, degrees, houses, and orb. Show the loop they have been running. End with one plain uncomfortable truth — no softening.

PART 3 — 2 TO 4 DATED WINDOWS
Based strictly on tightest orb transits — only include dates where a transit is within 3° of a natal planet or angle. Each window gets a headline label in this format:
[DATE OR DATE RANGE] — [PLANET] [ASPECT] NATAL [PLANET], [DEGREE], [HOUSE]:
Then one sentence naming exactly what this activates and one sentence naming the specific consequence or required action. State as fact, not possibility. 2 dates minimum, 4 maximum. Do not manufacture dates — only use real tight-orb windows from the data.

PART 4 — THE DIRECTIVE (exactly 3 labeled directives)
DROP: One paragraph. What they need to stop doing immediately and why the chart demands it. Name the specific natal placement driving the pattern. 3-5 sentences.

EXECUTE BY [SPECIFIC DATE]: One paragraph. The specific action tied to the tightest upcoming window. What to do, the exact date it must happen by, and the planetary reason. 3-5 sentences.

LOCK IN BY [SPECIFIC DATE]: One paragraph. The structural decision that must be made before the final window closes. Identity, foundation, or direction-level. What gets locked and why. 3-5 sentences.

End the reading with 1-2 sentences that open the door to JXL — frame it as the natural next step for real-time calibration of these specific windows, not a sales line.

═══════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════
- Orb priority is law — tight orbs lead, wide orbs are background only
- "You" in every sentence. Never third person.
- State outcomes as facts. Never "may," "could," "might"
- Named degrees, dates, house numbers throughout
- 30-45 day window only
- The reading should feel complete but leave them wanting the live conversation

Return ONLY a valid JSON object — no markdown, no code fences, no explanation:
{
  "pages": [
    {
      "pageNumber": 1,
      "title": "WHY YOU FEEL [X] RIGHT NOW — AND IT'S REAL",
      "content": "The complete reading as one unbroken piece. Part 1 flows into Part 2 flows into the dated windows flows into the directives. No section headers except the date labels and DROP/EXECUTE/LOCK labels."
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