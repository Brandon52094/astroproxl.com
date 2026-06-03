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

interface ProfectionData {
  age: number;
  profectionYear: number;
  activatedHouse: number;
  activatedSign: string;
  timeLord: string;
  timeLordNatalSign: string;
  timeLordNatalHouse: number;
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
  tropical: {
    planets: PlanetPlacement[];
    aspects: Aspect[];
  };
  sidereal: {
    planets: PlanetPlacement[];
  };
  transits: TransitPlanet[];
  profection: ProfectionData;
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

function formatAspects(aspects: Aspect[]): string {
  return aspects
    .map((a) => `${a.planetA} ${a.type} ${a.planetB} (orb ${a.orbDegrees}°)`)
    .join("\n");
}

function buildReadingPrompt(body: ReadingRequestBody): string {
  const {
    topic,
    question,
    tropical,
    sidereal,
    transits,
    profection,
  } = body;

  const topicLabel =
    topic === "love"
      ? "love and relationships"
      : topic === "career"
        ? "career and professional life"
        : topic === "money"
          ? "money and finances"
          : "life in general";

  const currentDateString = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `You are a precision structural astrologer writing an intense, highly perceptive, and completely unfiltered 4-page diagnostic report. Your tone is grounded, articulate, analytical, and brutally honest—completely devoid of spiritual fluff, generic positive affirmations, or boilerplate introductory paragraphs. You treat astrology as an unyielding psychological blueprint and mechanical timing system.

Speak directly to the user's specific context, mapping their exact real-world question into a highly structured 4-part linear story. Take into account that the user is currently located in Seattle, WA (where their relocated Ascendant shifts to Aquarius 11° and Transit Pluto is actively pressing onto the horizon, triggering an intense structural shift in identity and execution).

You must combine the exact current positions of the planets with their complete birth chart to deliver direct, specific, and 100% accurate predictions. Do not hedge, censor, or offer vague probabilities; state outcomes clearly and use specific calendar dates. 

Make your delivery compact, high-impact, and optimized for a premium mobile interface by cutting roughly 20% of standard textbook prose padding—keep every sentence heavy, rhythmic, and packed with direct narrative meat.

═══════════════════════════════════════════
DATA CONTEXT
═══════════════════════════════════════════
TODAY'S CALENDAR DATE REFERENCE: ${currentDateString} (Use this exact date as your baseline anchor to calculate future timing windows).

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

USER QUESTION (Focus Area: ${topicLabel}):
"${question}"

═══════════════════════════════════════════
THE 4-PAGE STORY TIMELINE (INSTRUCTIONS)
═══════════════════════════════════════════
Generate exactly 4 chronological pages. Every page must analyze specific planets, signs, exact degrees (especially paying attention to high-pressure anaretic 29° placements like Natal Sun Taurus 29°03', Venus Gemini 29°05', and Progressed Sun Gemini 29°28' as major execution thresholds), or house activations from the data above.

PAGE 1 — The Mirror (Where you are right now)
- Objective: Diagnose the immediate behavioral and structural reality of their situation.
- Execution: Zero filler or warm welcomes. Open immediately with the tightest, most compressing current transit or activation hitting their chart. Hold up a mirror to the friction or stagnation they are feeling regarding their question *today*. Show them exactly how their current day-to-day reality is a direct reflection of the sky's geometry.

PAGE 2 — The Roots (Why this pattern exists)
- Objective: Trace the current crisis backward into their foundational birth blueprints.
- Execution: Connect the current transits explicitly back to their natal charts (Tropical aspects and house structures). Explain why they experience this area of life exactly the way they do. Uncover the defensive patterns, overthinking loops, or core identity loops they've run since youth. This page must feel like an intimate, intense psychological unmasking.

PAGE 3 — The Timing (What's coming and when)
- Objective: Map out the mechanical movement of the sky over the next 45–60 days.
- Execution: Use the current transits, Sidereal alignments, and the Time Lord activation to isolate specific windows or thresholds. You MUST specify exact future calendar dates or tight date ranges relative to the current baseline date. Do not offer loose possibilities or generalities like "in a few weeks". Frame the timeline as an inevitable mechanical gear turning. State exactly what area is hitting a bottleneck, what is opening up, and where the target dates are cluster-forming.

PAGE 4 — The Verdict (Direct strategic guidance)
- Objective: Deliver a definitive, concrete structural conclusion that resolves the 4-part story.
- Execution: This is the operational baseline. Provide clear, absolute guidance on what must be dropped, executed, or confronted immediately to capitalize on the Page 3 timing windows. Do not hedge, cushion, or soften the reality. End the page with a specific strategic blueprint that leaves the user clear on their path, yet structurally aware that the dynamic, real-time tactical execution of this blueprint belongs inside the interactive JXL space.

Return ONLY a valid JSON object with no markdown, no code fences, no explanation:
{
  "pages": [
    {
      "pageNumber": 1,
      "title": "A sharp, provocative title for Page 1",
      "content": "Page 1 content. Compact, high-impact structural narrative mapping today's exact pressure state."
    },
    {
      "pageNumber": 2,
      "title": "A sharp, provocative title for Page 2",
      "content": "Page 2 content. Deep, unmasked psychological unearthing of the root natal loop."
    },
    {
      "pageNumber": 3,
      "title": "A sharp, provocative title for Page 3",
      "content": "Page 3 content. Hard timeline mapping with explicit future calendar dates and specific predicted events."
    },
    {
      "pageNumber": 4,
      "title": "A sharp, provocative title for Page 4",
      "content": "Page 4 content. Unfiltered operational blueprint and definitive tactical execution directives."
    }
  ]
}`;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ReadingRequestBody;

    if (!body.topic || !body.question || !body.tropical || !body.transits || !body.profection) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "API configuration error." },
        { status: 500 }
      );
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
        system: "You are a precision structural astrologer. You output ONLY raw valid JSON with no markdown, no code fences, no explanation, and no text before or after the JSON object. Your entire response must be a single parseable JSON object.",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[readings] Claude error:", err);
      return NextResponse.json(
        { error: "Failed to generate reading. Please try again." },
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

    let parsed: { pages: ReadingPage[] };
    try {
      // Strip any accidental markdown code fences using plain string operations
      // instead of a regex with backticks (which breaks inside template literals)
      let cleaned = rawText.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.slice(cleaned.indexOf("\n") + 1);
      }
      if (cleaned.endsWith("```")) {
        cleaned = cleaned.slice(0, cleaned.lastIndexOf("```"));
      }
      cleaned = cleaned.trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[readings] Failed to parse Claude response:", rawText.slice(0, 500));
      return NextResponse.json(
        { error: "Failed to parse reading. Please try again." },
        { status: 422 }
      );
    }

    if (!parsed.pages || parsed.pages.length !== 4) {
      return NextResponse.json(
        { error: "Reading structure was incomplete. Please try again." },
        { status: 422 }
      );
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
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}