import { NextRequest, NextResponse } from "next/server";

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

// ── NEW: Source citation for a section of the reading ─────────────────────────
interface ReadingSource {
  section: string; // e.g. "Part 1", "Part 2", "June 28 window", "DROP"
  placements: string; // e.g. "Mercury 23°34' Cancer conjunct natal Neptune 23°11' Capricorn, House 11, 1° orb"
}

interface ReadingPage {
  pageNumber: 1;
  title: string;
  content: string;
  sources?: ReadingSource[]; // NEW
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
  planetaryStations?: PlanetaryStationData[];
  solarReturn?: SolarReturnData;
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
  return p.name + ": " + p.sign + " " + p.degree;
}

function fmtSolarArc(p: SolarArcPlanet): string {
  return p.name + ": " + p.sign + " " + p.degree;
}

function buildReadingPrompt(body: ReadingRequestBody): string {
  const { topic, question, tropical, sidereal, transits, profection, progressions, solarArcs, upcomingTrigger, planetaryStations, solarReturn } = body;

  const topicLabel =
    topic === "love" ? "love and relationships"
    : topic === "career" ? "career and professional life"
    : topic === "money" ? "money and finances"
    : "life in general";

  const currentDateString = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const upcomingTriggerBlock = upcomingTrigger
    ? NL + "NEXT EXACT ASPECT (Ephemeris-Calculated — use as a primary date anchor):" + NL
      + upcomingTrigger.transitPlanet + " " + upcomingTrigger.aspect + " natal " + upcomingTrigger.natalPlanet
      + " — exact within 1° on " + upcomingTrigger.date + NL
    : "";

  const progressionsBlock = progressions && progressions.length > 0
    ? NL + "SECONDARY PROGRESSIONS (Current):" + NL + progressions.map(fmtProgression).join(NL) + NL
    : "";

  const solarArcsBlock = solarArcs && solarArcs.length > 0
    ? NL + "SOLAR ARC DIRECTIONS (Current):" + NL + solarArcs.map(fmtSolarArc).join(NL) + NL
    : "";

  const stationsBlock = planetaryStations && planetaryStations.length > 0
    ? NL + [
      "PLANETARY STATIONS (next 60 days — crystallization points):",
      "Stations with natal hits are PRIMARY date anchors. A planet stationing on a natal point forces an unavoidable crystallization of that house theme.",
      ...planetaryStations.map(s => {
        const hit = s.natalPlanetHit
          ? ` — stations within ${s.orbDegrees}° of natal ${s.natalPlanetHit} (House ${s.natalHouse})`
          : " — no exact natal hit within 3°";
        return `${s.planet} stations ${s.stationType.toUpperCase()} on ${s.stationDate} at ${s.degree} ${s.sign}${hit}`;
      }),
      ""
    ].join(NL)
    : "";

  const solarReturnBlock = solarReturn
    ? NL + [
      `SOLAR RETURN (${solarReturn.sunReturnDate} — cast for ${solarReturn.location}):`,
      `SR Ascendant: ${solarReturn.ascendant.sign} ${solarReturn.ascendant.degree}`,
      `SR Midheaven: ${solarReturn.midheaven.sign} ${solarReturn.midheaven.degree}`,
      solarReturn.timeLordInSR
        ? `Time Lord (${profection.timeLord}) falls in SR ${solarReturn.timeLordInSR} — this is how ${profection.timeLord} will behave this year.`
        : "",
      "SR Planets: " + solarReturn.planets.map(p => `${p.name} ${p.sign} H${p.house}`).join(", "),
      "FILTER RULE: A transit must be reflected in the Solar Return chart themes to trigger a major physical event. Use SR to confirm or downgrade transit predictions.",
      ""
    ].filter(Boolean).join(NL)
    : "";

  const planetList = tropical.planets.map(fmtPlanet).join(NL);

  const aspectList = tropical.aspects
    .slice()
    .sort((a, b) => a.orbDegrees - b.orbDegrees)
    .map(fmtAspect)
    .join(NL);

  const transitList = transits.map(fmtTransit).join(NL);
  const siderealList = sidereal.planets.map(fmtPlanet).join(NL);

  const lines = [
    "CRITICAL REAL-ESTATE RULE: This reading renders on a mobile screen. Cut 30% of standard prose. Short, heavy sentences. No cosmic setup fluff. Hit the nerve and move forward.",
    "",
    "═══════════════════════════════════════════",
    "ORB PRIORITY RULES — LAW",
    "═══════════════════════════════════════════",
    "Aspects sorted tightest first below. This is your activation priority.",
    "LIVE (under 3° orb) — lead with these. Name degree and house. State behavioral consequence.",
    "BACKGROUND (3°-6° orb) — reference once for root context only.",
    "WIDE (over 6° orb) — ignore entirely.",
    "Transits within 2° are exact and urgent. Beyond 5° — do not use as timing anchors.",
    "Anaretic 29° placements — always name when activated by a transit within 3°.",
    "",
    "═══════════════════════════════════════════",
    "CHART DATA",
    "═══════════════════════════════════════════",
    "TODAY: " + currentDateString,
    upcomingTriggerBlock,
    stationsBlock,
    solarReturnBlock,
    "TROPICAL PLACEMENTS:",
    planetList,
    "",
    "NATAL ASPECTS (tightest first — your priority order):",
    aspectList,
    "",
    "SIDEREAL PLACEMENTS:",
    siderealList,
    "",
    "CURRENT TRANSITS:",
    transitList,
    "",
    "ANNUAL PROFECTION:",
    "Age " + profection.age + ", House " + profection.activatedHouse + " (" + profection.activatedSign + "), Time Lord: " + profection.timeLord + " (Natal: " + profection.timeLordNatalSign + ", House " + profection.timeLordNatalHouse + ")",
    progressionsBlock,
    solarArcsBlock,
    "THEIR QUESTION (" + topicLabel + "):",
    "\"" + question + "\"",
    "",
    "═══════════════════════════════════════════",
    "READING STRUCTURE — STRICT LIMITS",
    "═══════════════════════════════════════════",
    "",
    "No section headers in output — only date labels and DROP/EXECUTE/LOCK appear in caps. Everything flows as prose.",
    "",
    "PART 1 — WHERE YOU ARE RIGHT NOW (Exactly 1 compact paragraph)",
    "Open with the tightest transit or progression hitting their chart today — under 3° orb, exact degree and house named. State what it is doing to their life in concrete behavioral terms. End on one acute tension sentence that leaves the core conflict open.",
    "",
    "PART 2 — THE ROOT (Exactly 1 tight paragraph)",
    "Identify the single tightest natal aspect driving the Part 1 pattern. Name planets, degrees, houses, orb. Expose the loop they have been running. End with one plain uncomfortable truth. No softening.",
    "",
    "PART 3 — DATED WINDOWS (Exactly 2 or 3 windows — no more)",
    "Only include windows where a transit is within 3° of a natal planet or angle. Format:",
    "[DATE OR DATE RANGE] — [PLANET] [ASPECT] NATAL [PLANET], [DEGREE], [HOUSE]:",
    "1 sentence: what this activates. 1 sentence: the specific consequence. Fact, not possibility. Do not manufacture dates.",
    "",
    "PART 4 — THE DIRECTIVE (Exactly 3 directives — hard 3-sentence ceiling each)",
    "DROP: The specific behavior or pattern they must stop immediately. Name the natal placement driving it. Max 3 sentences.",
    "",
    "EXECUTE BY [SPECIFIC DATE]: The exact action tied to the tightest upcoming window. What to do and when. Max 3 sentences.",
    "",
    "LOCK IN BY [SPECIFIC DATE]: The structural commitment that must be sealed before the window closes. Max 3 sentences.",
    "",
    "End with 1 sentence opening the door to JXL — frame as real-time calibration of these windows, not a sales line.",
    "",
    "═══════════════════════════════════════════",
    "LAWS",
    "═══════════════════════════════════════════",
    "- Tight orbs lead. Wide orbs are background only.",
    "- 'You' in every sentence. No passive voice.",
    "- Outcomes as facts. No hedging words.",
    "- Named degrees, dates, house numbers throughout.",
    "- 30-45 day window only.",
    "- Reading feels complete but leaves them wanting the live conversation.",
    "- Strip all textbook phrasing and cosmic setup fluff.",
    "- DATES in the main content must appear in this exact bracket format so the UI can highlight them: [[DATE: June 28]] or [[DATE: June 28-July 3]]. Wrap every specific date or date range you mention in the prose this way.",
    "",
    "═══════════════════════════════════════════",
    "SOURCES — SEPARATE FROM THE READING",
    "═══════════════════════════════════════════",
    "After writing the content, build a 'sources' array. One entry per distinct claim/section of the reading (Part 1, Part 2, each dated window, DROP, EXECUTE, LOCK IN). For each entry:",
    "- 'section': a short label identifying which part of the reading this supports (e.g. 'Part 1', 'Part 2', 'June 28-July 3 window', 'DROP', 'EXECUTE', 'LOCK IN')",
    "- 'placements': the exact astrological data that justified that section — list every planet, sign, degree, house, and orb you used for that specific claim, comma separated. Use as many or as few as were actually used — don't pad it, don't omit any that were used.",
    "This is the technical proof behind each part of the reading, written precisely and tersely, no prose.",
    "",
    "Return ONLY a valid JSON object — no markdown, no code fences, no explanation:",
    "{",
    "  \"pages\": [",
    "    {",
    "      \"pageNumber\": 1,",
    "      \"title\": \"WHY YOU FEEL [X] RIGHT NOW — AND IT'S REAL\",",
    "      \"content\": \"The compressed reading as one unbroken piece. Part 1 into Part 2 into dated windows into directives. No headers except date labels and DROP/EXECUTE/LOCK. Dates wrapped in [[DATE: ...]] format.\",",
    "      \"sources\": [",
    "        { \"section\": \"Part 1\", \"placements\": \"Mercury 23°34' Cancer conjunct natal Neptune 23°11' Capricorn, House 11, 1° orb\" }",
    "      ]",
    "    }",
    "  ]",
    "}",
  ];

  return lines.join(NL);
}

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
        max_tokens: 3000,
        system: "You are a precision astrologer with no filter. You are this person's personal astrologer — you know their chart completely and speak to them directly, without softening, without hedging, without generic language. You output ONLY raw valid JSON — no markdown, no code fences, no preamble. Your entire response is a single parseable JSON object containing one page with a content field and a sources field. You speak to the person as 'you' in every sentence. You state outcomes as facts. You name specific degrees, dates, and planetary events throughout. Your tone is direct, unfiltered, and unnervingly accurate. Keep the reading tight and mobile-optimized — no padding, no fluff, best information only. Every specific date in the content must be wrapped in [[DATE: ...]] brackets.",
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
      if (cleaned.startsWith("\`\`\`")) cleaned = cleaned.slice(cleaned.indexOf("\n") + 1);
      if (cleaned.endsWith("\`\`\`")) cleaned = cleaned.slice(0, cleaned.lastIndexOf("\`\`\`"));
      cleaned = cleaned.trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        cleaned = cleaned.slice(start, end + 1);
      }
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("[readings] Failed to parse Claude response. Error:", String(parseErr));
      console.error("[readings] Raw response start:", rawText.slice(0, 300));
      console.error("[readings] Raw response end:", rawText.slice(-200));
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
