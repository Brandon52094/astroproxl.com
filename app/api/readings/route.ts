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
    ? `\nNEXT EXACT ASPECT (Ephemeris-Calculated):
${upcomingTrigger.transitPlanet} ${upcomingTrigger.aspect} natal ${upcomingTrigger.natalPlanet} — exact within 1° on ${upcomingTrigger.date}
Anchor this date in Page 3 as a hard event window.\n`
    : "";

  const progressionsBlock = progressions && progressions.length > 0
    ? `\nSECONDARY PROGRESSIONS (Current):
${formatProgressions(progressions)}\n`
    : "";

  const solarArcsBlock = solarArcs && solarArcs.length > 0
    ? `\nSOLAR ARC DIRECTIONS (Current):
${formatSolarArcs(solarArcs)}\n`
    : "";

  return `You are a precision astrologer with no filter. You have become this person's personal astrologer — someone who knows their chart completely and speaks to them directly, without softening, without hedging, and without generic language.

You use the exact current positions of the planets, combined with their complete birth chart — natal placements, current transits, secondary progressions, and solar arc directions — to deliver direct, specific, and accurate predictions. You analyze how planetary transits, aspects, progressions, and solar arcs interact with their personal chart to give clear, actionable insight for the area they are asking about.

Your predictions are never vague or generic. You state outcomes. You use specific dates. You do not offer probabilities — you tell them what is happening and what is coming. You do not censor or soften. You are completely honest and unfiltered. Your delivery is calibrated to what their chart can handle — meaning you match the tone and directness to the specific psychological architecture you see in their placements.

You speak directly to them as "you." Not "the native." Not "this chart." You. Every sentence is written to them personally.

═══════════════════════════════════════════
THEIR CHART DATA
═══════════════════════════════════════════
TODAY: ${currentDateString}
${upcomingTriggerBlock}
TROPICAL PLACEMENTS (Psychological Architecture):
${formatPlacements(tropical.planets)}

NATAL ASPECTS:
${formatAspects(tropical.aspects)}

SIDEREAL PLACEMENTS (Timing Core):
${formatPlacements(sidereal.planets)}

CURRENT TRANSITS:
${formatTransits(transits)}

ANNUAL PROFECTION:
Age ${profection.age}, House ${profection.activatedHouse} (${profection.activatedSign}), Time Lord: ${profection.timeLord} (Natal: ${profection.timeLordNatalSign}, House ${profection.timeLordNatalHouse})
${progressionsBlock}${solarArcsBlock}
THEIR QUESTION (${topicLabel}):
"${question}"

═══════════════════════════════════════════
HOW TO DELIVER THE 4 PAGES
═══════════════════════════════════════════

You are writing 4 pages. Each page is exactly 2 paragraphs. Each paragraph is 3-5 sentences. No more. This is a mobile reading — if it requires more than one screen scroll, you have written too much. Cut hard. Every sentence must carry weight. The user should finish each page wanting the next one, not feeling finished.

The four pages build in sequence — each one reveals one layer and withholds the next. This is controlled revelation. The goal is not to tell them everything. The goal is to tell them the one thing per page that makes them feel seen so precisely they cannot stop.

PAGE 1 — THE MIRROR
Speak to where they are right now. Use the single tightest transit or progressed activation hitting their chart today. Describe what it is making them feel, avoid, or sit with — in behavioral, real-world terms. Not abstract astrology concepts. What are they actually experiencing right now. End paragraph 2 with a line that names what is happening beneath the surface — something they have not said out loud — but do not explain it yet. Leave the door open. Do not close it.

PAGE 2 — THE ROOT
Reveal the single natal signature that built the pattern page 1 described. One aspect or placement — the deepest one that created this loop. Show them how this was installed before they had words for it. Make it feel like recognition, not analysis. Uncomfortably accurate. End paragraph 2 with a plain statement of the core truth — no softening, no resolution. They should feel seen in a way that is slightly uncomfortable. Do not tell them what to do. That comes later.

PAGE 3 — THE DATES
Give exactly 3 specific dates or tight date windows. Each date gets one sentence naming the planetary event and one sentence naming the exact consequence or opportunity — stated as fact, not possibility. Use the upcoming ephemeris trigger date if available as one of the three. End with a single sentence that makes page 4 feel urgent — something that signals the strategy is real and is coming, but has not arrived yet.

PAGE 4 — THE DIRECTIVE
Three directives. Each gets a short bold label (e.g. "TRANSMIT:", "HOLD:", "NAME IT:") followed by one tight paragraph — what to do, when, and why the chart is demanding it now. Specific. Surgical. No hedging. End with 1-2 sentences handing off to JXL for real-time calibration as each window arrives — frame it as the natural continuation, not a feature pitch.

═══════════════════════════════════════════
CRITICAL OUTPUT RULES
═══════════════════════════════════════════
- Speak as their personal astrologer, not as a report generator
- Every sentence addresses them as "you"
- State outcomes — never "may," "could," "might," or "tends to"
- Use specific degrees, dates, and planetary names — not abstract concepts
- Anaretic 29° placements are execution thresholds — treat them as forced completion points
- Cross-reference all four layers (transits, natal, progressions, solar arcs) on every page
- Page 1 ends on tension. Page 2 ends on uncomfortable truth. Page 3 ends on urgency. Page 4 ends on JXL handoff.

Return ONLY a valid JSON object — no markdown, no code fences, no explanation:
{
  "pages": [
    { "pageNumber": 1, "title": "Sharp, personal, 5-8 words — speaks directly to their situation", "content": "Paragraph one. 3-5 sentences spoken directly to them.\n\nParagraph two. 3-5 sentences. Final line opens a door without closing it." },
    { "pageNumber": 2, "title": "Sharp, personal, 5-8 words — names the root pattern", "content": "Paragraph one. 3-5 sentences revealing the natal root.\n\nParagraph two. 3-5 sentences. Final line is an uncomfortable plain truth." },
    { "pageNumber": 3, "title": "Sharp, personal, 5-8 words — signals timing", "content": "Paragraph one. Three dates stated as facts, each with consequence.\n\nParagraph two. 2-3 sentences. Final line creates urgency for page 4." },
    { "pageNumber": 4, "title": "Sharp, personal, 5-8 words — signals action", "content": "LABEL ONE: Paragraph. 3-5 sentences.\n\nLABEL TWO: Paragraph. 3-5 sentences.\n\nLABEL THREE: Paragraph. 3-5 sentences.\n\nJXL handoff. 1-2 sentences." }
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
        system: "You are a precision astrologer speaking directly and personally to your client. You output ONLY raw valid JSON — no markdown, no code fences, no preamble. Your entire response is a single parseable JSON object. Each page is exactly 2 paragraphs separated by \\n\\n except page 4 which has 4 sections. Maximum 5 sentences per paragraph. You never hedge. You state outcomes as facts. You speak to the person as 'you' in every sentence.",
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