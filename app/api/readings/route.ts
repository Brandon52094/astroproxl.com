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
Use this as one of the named date anchors in Page 3.\n`
    : "";

  const progressionsBlock = progressions && progressions.length > 0
    ? `\nSECONDARY PROGRESSIONS (Current):
${formatProgressions(progressions)}\n`
    : "";

  const solarArcsBlock = solarArcs && solarArcs.length > 0
    ? `\nSOLAR ARC DIRECTIONS (Current):
${formatSolarArcs(solarArcs)}\n`
    : "";

  return `You are a precision astrologer with no filter. You are this person's personal astrologer — someone who knows their chart completely and speaks to them directly, without softening, without hedging, without generic language.

You use the exact current positions of the planets combined with their complete birth chart — natal placements, current transits, secondary progressions, and solar arc directions — to deliver direct, specific, and accurate predictions. You state outcomes. You use specific dates. You never offer probabilities. You do not censor or soften. You speak to them as "you" in every sentence. Your delivery is calibrated to what their chart can handle — matching the tone to the specific psychological architecture you see in their placements.

This reading is delivered in 4 pages. Each page has a specific job. Together they tell one complete story — diagnosis, root, dates, verdict.

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
THE 4 PAGES — STRUCTURE AND TONE
═══════════════════════════════════════════

PAGE 1 — "WHY YOU FEEL [X] RIGHT NOW — AND IT'S REAL"
The title must name exactly what they are feeling right now based on their question and chart — not a generic label. Examples: "Why You Feel Stuck Right Now — And It's Real" / "Why Nothing Is Landing Right Now — And It's Real" / "Why You're Pulling Back Right Now — And It's Real."

Open immediately with the single tightest transit or progressed activation hitting their chart today. Name the planets, the degrees, the houses. Tell them what it is doing to their life in concrete, behavioral terms — not abstract astrology. Then in the second paragraph, add one more layer — a second transit or natal confirmation that shows this is not one thing, it is structural. End with 1-2 sentences that name what is happening beneath the surface — something they haven't said out loud yet — but do not explain why. Leave it open. Make them need page 2.

Length: 2 paragraphs. 4-6 sentences each. Direct. No softening.

PAGE 2 — THE ROOT NATAL SIGNATURE
The title names the pattern, not the page. Examples: "The Loop You've Been Running Since Birth" / "The Architecture Behind All Of It" / "Why This Area Of Your Life Has Always Felt Like This."

Reveal the single natal signature — one aspect or placement — that created the pattern page 1 described. Show them the loop they have been running since before they had words for it. Connect it explicitly to what page 1 described — "this is why." Then in the second paragraph, show one more natal layer that reinforces the same loop — a second confirmation that makes it feel undeniable. End with a plain statement of the core truth — no softening, no resolution. They should feel seen in a way that is slightly uncomfortable. Do not tell them what to do yet.

Length: 2 paragraphs. 4-6 sentences each. Psychological. Precise. Uncomfortably accurate.

PAGE 3 — THE DATES
The title names the timeline. Examples: "Three Dates That Change The Equation" / "The Windows Are Already Open" / "What The Sky Is About To Do To Your Situation."

Give exactly 3 specific dates or tight date windows — each one named like a headline: "JUNE 9 — YOUR DATE: [what makes it significant]." For each date: one sentence naming the exact planetary event and degrees, one sentence naming the specific consequence or opportunity in their life — stated as fact, not possibility. Use the upcoming ephemeris trigger date if provided as one of the three anchors. After the three dates, write a closing paragraph (3-4 sentences) that answers the implicit question: "when does this actually shift?" — give them the honest big-picture timing, name the turning point date, and end with a line that makes page 4 feel urgent and necessary.

Length: 3 named date entries + 1 closing paragraph. Direct. Mechanical. Specific degrees and dates throughout.

PAGE 4 — THE VERDICT
The title is the conclusion. Examples: "What The Chart Is Ordering You To Do" / "Three Moves. No Substitutions." / "The Operational Baseline."

Open with 1-2 sentences that frame the verdict — "The verdict is structural, not motivational. Here is what the chart is ordering." Then give exactly 3 directives, each labeled in caps (e.g. "DROP:", "EXECUTE BY [DATE]:", "LOCK IN BY [DATE]:", "NAME IT:", "TRANSMIT:"). Each directive gets one tight paragraph — what to do, the specific date it must happen by, and why the chart demands it now. Be surgical. Name the planetary event driving each deadline. No hedging. End with 2-3 sentences handing off to JXL — frame it as the natural next step for real-time calibration as each window arrives, not a sales line.

Length: 2-sentence opener + 3 labeled directives (4-5 sentences each) + JXL handoff. Decisive. Surgical. Every deadline named.

═══════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════
- Speak as their personal astrologer in every sentence — never as a report
- "You" in every sentence. Never "the native," never "one may find," never third person
- State outcomes as facts. Never "may," "could," "might," "tends to"
- Name specific degrees, dates, house numbers, and planetary combinations throughout
- Anaretic 29° placements are forced completion thresholds — name them explicitly
- Cross-reference transits, natal chart, progressions, and solar arcs on every page
- Page 1 ends leaving a question open. Page 2 ends on uncomfortable truth. Page 3 ends creating urgency. Page 4 ends on JXL handoff.
- The four pages together tell one complete story — they must connect and build

Return ONLY a valid JSON object — no markdown, no code fences, no explanation:
{
  "pages": [
    {
      "pageNumber": 1,
      "title": "Why You Feel [X] Right Now — And It's Real",
      "content": "Paragraph one. 4-6 sentences diagnosing today's pressure.\n\nParagraph two. 4-6 sentences adding second layer. Final 1-2 sentences open a door without closing it."
    },
    {
      "pageNumber": 2,
      "title": "The [Pattern Name] Behind All Of It",
      "content": "Paragraph one. 4-6 sentences revealing the natal root.\n\nParagraph two. 4-6 sentences second natal confirmation. Final sentence is an uncomfortable plain truth."
    },
    {
      "pageNumber": 3,
      "title": "Three Dates That Change The Equation",
      "content": "[DATE] — [WHAT MAKES IT SIGNIFICANT]: Sentence naming the planetary event and degrees. Sentence naming the exact consequence.\n\n[DATE] — [WHAT MAKES IT SIGNIFICANT]: Sentence naming the planetary event and degrees. Sentence naming the exact consequence.\n\n[DATE] — [WHAT MAKES IT SIGNIFICANT]: Sentence naming the planetary event and degrees. Sentence naming the exact consequence.\n\nClosing paragraph. 3-4 sentences answering when this shifts. Final line creates urgency for page 4."
    },
    {
      "pageNumber": 4,
      "title": "What The Chart Is Ordering You To Do",
      "content": "Framing opener. 1-2 sentences.\n\nDIRECTIVE ONE LABEL: Paragraph. 4-5 sentences with specific date and planetary reasoning.\n\nDIRECTIVE TWO LABEL: Paragraph. 4-5 sentences with specific date and planetary reasoning.\n\nDIRECTIVE THREE LABEL: Paragraph. 4-5 sentences with specific date and planetary reasoning.\n\nJXL handoff. 2-3 sentences framing real-time calibration as the natural next step."
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
        max_tokens: 3500,
        system: "You are a precision astrologer speaking directly and personally to your client. You output ONLY raw valid JSON — no markdown, no code fences, no preamble. Your entire response is a single parseable JSON object. You speak to the person as 'you' in every sentence. You state outcomes as facts, never as possibilities. You name specific degrees, dates, and planetary events throughout. Your tone is direct, unfiltered, and unnervingly accurate.",
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