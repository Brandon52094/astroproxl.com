import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { buildVoiceCalibrationBlock } from "@/lib/signVoice";
import type { TransitAspect } from "@/lib/transitAspects";

const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks — must match credits/route.ts
const FREE_READING_RESET_MS = 7 * 24 * 60 * 60 * 1000; // 1 week — must match credits/route.ts
const CREDITS_PER_READING = 4; // must match reading-complete/route.ts

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

interface MoonPhaseData {
  phaseName: string;
  illuminationPercent: number;
  nextEventName: "New Moon" | "Full Moon";
  daysUntilNextEvent: number;
  moonSign: string;
  moonDegree: string;
}

interface ReadingSource {
  section: string;
  placements: string;
}

interface ReadingPage {
  pageNumber: 1;
  title: string;
  content: string;
  sources?: ReadingSource[];
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
  transitAspects?: TransitAspect[];
  profection: ProfectionData;
  progressions?: ProgressedPlanet[];
  solarArcs?: SolarArcPlanet[];
  upcomingTrigger?: UpcomingTrigger;
  planetaryStations?: PlanetaryStationData[];
  solarReturn?: SolarReturnData;
  moonPhase?: MoonPhaseData;
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

/**
 * The transit-to-natal aspects arrive pre-calculated, pre-filtered, and
 * pre-sorted from lib/transitAspects.ts. This is the single most important
 * block in the prompt: it means the model NEVER has to work out which transit
 * is hitting which natal point, or how tightly, or whether it's building or
 * fading. That arithmetic used to happen by inference — ~700 comparisons per
 * reading — and "mostly right" is not good enough when someone is paying for
 * clarity about something that matters. Now it's given.
 */
function fmtTransitAspects(aspects: TransitAspect[]): string {
  if (!aspects || aspects.length === 0) {
    return "TRANSIT-TO-NATAL ASPECTS: none within orb right now. Lead from progressions and the profection year instead.";
  }

  const lines = [
    "TRANSIT-TO-NATAL ASPECTS — CALCULATED, EXACT, SORTED TIGHTEST FIRST",
    "These are given to you. Do NOT compute aspects yourself. Do NOT use any aspect",
    "that is not in this list. If it is not here, it is not happening.",
    "",
    "EXACT = under 1° orb — this is firing right now.",
    "LIVE = under 3° orb — active, lead with these.",
    "BACKGROUND = 3-6° orb — context only, never a date anchor.",
    "APPLYING = still tightening, the event is building toward them.",
    "SEPARATING = the peak has already passed; speak of it in past tense.",
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

function buildReadingPrompt(body: ReadingRequestBody): string {
  const {
    topic,
    question,
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

  const transitAspectBlock = fmtTransitAspects(transitAspects ?? []);

  const upcomingTriggerBlock = upcomingTrigger
    ? NL +
      "NEXT EXACT ASPECT (ephemeris-calculated — a primary date anchor):" + NL +
      upcomingTrigger.transitPlanet + " " + upcomingTrigger.aspect + " natal " +
      upcomingTrigger.natalPlanet + " — exact within 1° on " + upcomingTrigger.date + NL
    : "";

  const moonPhaseBlock = moonPhase
    ? NL +
      [
        "MOON PHASE (timing texture — use to shape WHEN, not what):",
        `${moonPhase.phaseName}, ${moonPhase.illuminationPercent}% illuminated. Moon in ${moonPhase.moonSign}.`,
        `Next ${moonPhase.nextEventName} in ${moonPhase.daysUntilNextEvent} days.`,
        "ROLE: A waxing moon supports initiating and building; a waning moon supports closing, releasing, and cutting.",
        "The New Moon is a start-point; the Full Moon is a culmination and a reveal.",
        "Use this to choose WHICH of the dated windows to push toward — never as a prediction on its own.",
        "",
      ].join(NL)
    : "";

  const stationsBlock =
    planetaryStations && planetaryStations.length > 0
      ? NL +
        [
          "PLANETARY STATIONS (next 60 days — crystallization points):",
          "ROLE: Stations with natal hits are PRIMARY date anchors. A planet stationing on a natal point",
          "forces an unavoidable crystallization of that house theme. Outrank ordinary transits.",
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
          ? `Time Lord (${profection.timeLord}) falls in SR ${solarReturn.timeLordInSR} — this is how ${profection.timeLord} will behave this year.`
          : "",
        "SR Planets: " + solarReturn.planets.map((p) => `${p.name} ${p.sign} H${p.house}`).join(", "),
        "ROLE — FILTER RULE: A transit must be reflected in the Solar Return chart themes to trigger a major",
        "physical event. Use SR to CONFIRM or DOWNGRADE a transit prediction. If a tight transit has no SR",
        "support, say the shift is internal rather than external. Do not inflate it into an event.",
        "",
      ].filter(Boolean).join(NL)
    : "";

  const progressionsBlock =
    progressions && progressions.length > 0
      ? NL +
        [
          "SECONDARY PROGRESSIONS (current — inner development, slow):",
          ...progressions.map(fmtProgression),
          "ROLE: Progressions describe who they are BECOMING internally. The progressed Moon shows their",
          "current emotional chapter; a progressed Ascendant or Sun that has changed sign marks a genuine",
          "life-chapter shift. Use progressions to explain WHY a transit is landing the way it is — the",
          "transit is the event, the progression is the person it's happening to.",
          "",
        ].join(NL)
      : "";

  const solarArcsBlock =
    solarArcs && solarArcs.length > 0
      ? NL +
        [
          "SOLAR ARC DIRECTIONS (current — long-arc structural timing):",
          ...solarArcs.map(fmtSolarArc),
          "ROLE: Solar arcs move roughly 1° per year, so they are only meaningful when one lands within 1°",
          "of a natal planet or angle. When that happens it marks a multi-year structural shift underneath",
          "the present moment — the deep tectonic layer. Reference ONLY if within 1°. Otherwise ignore.",
          "",
        ].join(NL)
      : "";

  const planetList = tropical.planets.map(fmtPlanet).join(NL);

  const voiceCalibrationBlock = buildVoiceCalibrationBlock(
    tropical.planets.map((p) => ({ name: p.name, sign: p.sign }))
  );

  const aspectList = tropical.aspects
    .slice()
    .sort((a, b) => a.orbDegrees - b.orbDegrees)
    .map(fmtAspect)
    .join(NL);

  const transitList = transits.map(fmtTransit).join(NL);
  const siderealList = sidereal.planets.map(fmtPlanet).join(NL);

  const lines = [
    "You are writing a reading for a real person who is paying for clarity about something that matters to them.",
    "They may know nothing about astrology. Write so they understand every sentence.",
    "",
    "CRITICAL REAL-ESTATE RULE: This renders on a mobile screen. Short, heavy sentences. No cosmic setup fluff.",
    "Hit the nerve and move forward.",
    "",
    "═══════════════════════════════════════════",
    "THE LANGUAGE RULE — THIS GOVERNS EVERYTHING",
    "═══════════════════════════════════════════",
    "The prose is for a human being. The technical proof goes in the 'sources' array, which they can expand if",
    "they want it. These are two different audiences and you serve both — but never in the same sentence.",
    "",
    "IN THE PROSE, DO NOT WRITE:",
    "- Degrees or minutes (no '24°35\\'', no '29°03\\'')",
    "- Orb numbers (no 'within 1° orb', no 'a 2.4° orb opposition')",
    "- The word 'orb', 'anaretic', 'applying', 'separating', 'ingress', 'cusp'",
    "- Sidereal/tropical distinctions, solar arc jargon, or system names",
    "",
    "IN THE PROSE, DO WRITE:",
    "- The planet, the aspect, and the house TRANSLATED into what it governs.",
    "  Not: 'Mercury at 24°35\\' Cancer trine natal North Node at 23°47\\' Scorpio in your 9th house, 1° orb.'",
    "  But: 'Mercury is exactly trine your North Node today, in the house that rules courts and formal judgments.'",
    "- Houses by MEANING first, number second if at all: '9th house — courts, contracts, formal judgments'",
    "  becomes 'the part of your chart that governs courts and formal judgments.'",
    "- Plain consequence. What it DOES to their week. What they will feel, face, or have to decide.",
    "",
    "The reading must lose NO precision — every claim still rests on an exact calculated aspect. It simply stops",
    "reciting the arithmetic at someone who did not ask for it. The specificity lives in the CONSEQUENCE,",
    "not in the decimal places.",
    "",
    "═══════════════════════════════════════════",
    "ASPECT LAW — THE MATH IS DONE FOR YOU",
    "═══════════════════════════════════════════",
    "The transit-to-natal aspects below are CALCULATED and EXACT. You do not compute them. You do not estimate",
    "orbs. You do not invent an aspect that is not on the list. If an aspect is not in that block, it is not",
    "happening and you may not mention it.",
    "Lead with EXACT and LIVE aspects. BACKGROUND aspects are context only and can never anchor a date.",
    "An APPLYING aspect is building — speak of it as coming. A SEPARATING aspect has peaked — speak of it as passing.",
    "Never manufacture a date. Every date you give must trace to a calculated aspect, a station, or the next exact aspect.",
    "",
    "═══════════════════════════════════════════",
    "CHART DATA",
    "═══════════════════════════════════════════",
    "TODAY: " + currentDateString,
    voiceCalibrationBlock,
    "",
    transitAspectBlock,
    "",
    upcomingTriggerBlock,
    stationsBlock,
    moonPhaseBlock,
    solarReturnBlock,
    "NATAL PLACEMENTS (tropical — the primary chart):",
    planetList,
    "",
    "NATAL ASPECTS (tightest first — the fixed wiring they were born with):",
    aspectList,
    "ROLE: These never change. They are the pattern the transits are ACTIVATING. Part 2 lives here.",
    "",
    "SIDEREAL PLACEMENTS:",
    siderealList,
    "ROLE — CONFIRMATION FILTER: Sidereal is a second opinion, not a second reading. Where sidereal agrees",
    "with the tropical read, the prediction is STRONGER — say it with more force. Where it disagrees, the",
    "signal is mixed — soften the certainty of that specific claim. NEVER mention sidereal, tropical, or",
    "any system name in the prose. It shapes your confidence; it is not content.",
    "",
    "CURRENT TRANSIT POSITIONS:",
    transitList,
    "",
    "ANNUAL PROFECTION:",
    "Age " + profection.age + ", House " + profection.activatedHouse + " (" + profection.activatedSign + "), Time Lord: " + profection.timeLord + " (Natal: " + profection.timeLordNatalSign + ", House " + profection.timeLordNatalHouse + ")",
    "ROLE: The Time Lord is this year's ruling planet. Any transit involving the Time Lord is AMPLIFIED —",
    "it carries more weight than the same transit would in another year. If a dated window involves the",
    "Time Lord, that window is the most important one in the reading.",
    progressionsBlock,
    solarArcsBlock,
    "",
    "THEIR QUESTION (" + topicLabel + "):",
    "\"" + question + "\"",
    "",
    "═══════════════════════════════════════════",
    "READING STRUCTURE — STRICT LIMITS",
    "═══════════════════════════════════════════",
    "",
    "No section headers in output — only date labels and DROP/EXECUTE/LOCK appear in caps. Everything flows as prose.",
    "",
    "PART 1 — WHERE YOU ARE RIGHT NOW (exactly 1 compact paragraph)",
    "Open with the tightest EXACT or LIVE aspect from the calculated list. Name the planets and translate the",
    "house into what it governs. State what it is doing to their life in concrete behavioral terms — what they",
    "will actually face this week. End on one acute tension sentence that leaves the core conflict open.",
    "",
    "PART 2 — THE ROOT (exactly 2 sentences — HARD LIMIT. Not a paragraph.)",
    "Name the single tightest natal aspect that the Part 1 transit is landing on, in plain terms — the wiring",
    "they were born with that is being touched right now. Then name the loop it produces, once, bluntly.",
    "",
    "This is a BRIDGE, not a character autopsy. Its only job is to show them this is happening to THEM",
    "specifically — not to anyone having a hard week. Two sentences. Then move on.",
    "Do NOT narrate their whole life pattern. Do NOT deliver an extended uncomfortable truth here.",
    "Stay blunt — bluntness is what keeps this from being generic — but stay SHORT. The behavioral correction",
    "belongs in DROP, where it is actionable, not here where it is just commentary.",
    "",
    "PART 3 — DATED WINDOWS (exactly 2 — no more. A third only if it is as strong as the first two.)",
    "Only from calculated aspects, stations, or the next exact aspect. Never invented.",
    "Format: [[DATE: ...]] — then plain language: which planet, what it touches, what it governs.",
    "1 sentence: what this activates. 1 sentence: the specific consequence. Fact, not possibility.",
    "If a window involves the Time Lord, say so — it outranks the others.",
    "",
    "DO NOT spend a window on a period where nothing happens. A window that says 'wait, nothing moves yet'",
    "is not a window — it is filler. Every window must contain an EVENT they can act on or prepare for.",
    "If only two windows carry real activation, give two. Two strong windows beat three padded ones.",
    "",
    "PART 4 — THE DIRECTIVE (exactly 3 — hard 3-sentence ceiling each)",
    "DROP: The specific behavior they must stop immediately. Name the natal pattern driving it in plain terms.",
    "EXECUTE BY [[DATE: ...]]: The exact action tied to the tightest upcoming window. What to do and when.",
    "LOCK IN BY [[DATE: ...]]: The structural commitment sealed before the window closes.",
    "",
    "PART 5 — THE ACTUAL ANSWER (exactly 1-2 warm sentences, last)",
    "Everything above is diagnosis. This is different. Directly answer the literal question they asked, in plain",
    "human language, like a person who actually heard them. Drop the clinical tone entirely. No new placements,",
    "no astrology at all. Just land on their real question with warmth and a real answer — even if the question",
    "was casual or funny. This is where the reading stops being a report and becomes a person talking to them.",
    "",
    "═══════════════════════════════════════════",
    "TONE — VOICE CALIBRATION",
    "═══════════════════════════════════════════",
    "Each of Sun, Moon, Rising, Mercury, Venus came with a RHYTHM, a TRIGGER, and a FORBIDDEN list above.",
    "These govern DELIVERY, never content. The facts, dates, and directives stay exactly as the chart dictates.",
    "- Sun's RHYTHM sets baseline confidence and cadence.",
    "- Moon's RHYTHM and TRIGGER set emotional weight — feeling versus blunt fact.",
    "- Rising's RHYTHM sets how the reading opens.",
    "- Mercury's RHYTHM sets sentence length and directness.",
    "- Venus's TRIGGER and RHYTHM shape the warm closing answer (Part 5).",
    "Blend these into ONE coherent voice. Where they conflict: Sun and Mercury win sentence rhythm, Moon and",
    "Venus win emotional register, Rising wins the opening.",
    "Respect every FORBIDDEN. Never name a placement as the reason for your tone ('because you're a Pisces Moon').",
    "",
    "IMPORTANT: A voice calibration may call for precision or exactness — deliver that through SHARPNESS OF",
    "CONSEQUENCE, never through reciting degrees. Precision means 'you will feel it Thursday and here is exactly",
    "what it will look like,' not 'a 2.4° orb opposition.' The LANGUAGE RULE overrides any voice instruction",
    "that would pull you toward technical jargon.",
    "",
    "═══════════════════════════════════════════",
    "LAWS",
    "═══════════════════════════════════════════",
    "- Only calculated aspects. Never invent one.",
    "- 'You' in every sentence. No passive voice.",
    "- Outcomes as facts. No hedging words.",
    "- No degrees, no orbs, no jargon in the prose. All of it goes in sources.",
    "- 30-45 day window only.",
    "- Strip all textbook phrasing and cosmic setup fluff.",
    "- Every date in the content wrapped as [[DATE: June 28]] or [[DATE: June 28-July 3]] so the UI can highlight it.",
    "- The reading feels complete but leaves them wanting the live conversation.",
    "",
    "═══════════════════════════════════════════",
    "SOURCES — WHERE ALL THE TECHNICAL PROOF LIVES",
    "═══════════════════════════════════════════",
    "This is the receipt. The person can expand it if they want to see the machinery. Here — and ONLY here —",
    "you write the exact degrees, orbs, houses, and system names. Be precise and terse. No prose.",
    "One entry per distinct section of the reading (Part 1, Part 2, each dated window, DROP, EXECUTE, LOCK IN).",
    "- 'section': short label ('Part 1', 'Part 2', 'July 6-7 window', 'DROP', 'EXECUTE', 'LOCK IN')",
    "- 'placements': the exact astrological data justifying that section — every planet, sign, degree, house,",
    "  and orb you actually used, comma separated. Copy the numbers EXACTLY from the calculated aspect list.",
    "  Do not pad. Do not omit anything you used.",
    "",
    "Return ONLY a valid JSON object — no markdown, no code fences, no explanation:",
    "{",
    "  \"pages\": [",
    "    {",
    "      \"pageNumber\": 1,",
    "      \"title\": \"WHY YOU FEEL [X] RIGHT NOW — AND IT'S REAL\",",
    "      \"content\": \"The reading as one unbroken piece, in plain human language. Part 1 into Part 2 into dated windows into directives into the warm direct answer. No headers except date labels and DROP/EXECUTE/LOCK. No degrees. No orbs. Dates wrapped in [[DATE: ...]].\",",
    "      \"sources\": [",
    "        { \"section\": \"Part 1\", \"placements\": \"Transit Mercury 24°35' Cancer trine natal North Node 23°47' Scorpio, House 9, 0.8° orb, applying\" }",
    "      ]",
    "    }",
    "  ]",
    "}",
  ];

  return lines.join(NL);
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Server-side eligibility check — mirrors credits/route.ts logic ────────
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const metadata = user.publicMetadata;

    const isSubscribed = metadata?.isSubscribed === true;
    const credits = Number(metadata?.credits ?? 0);
    const firstReadingUsed = metadata?.firstReadingUsed === true;

    const cooldownStartedAt = metadata?.cooldownStartedAt
      ? new Date(metadata.cooldownStartedAt as string)
      : null;
    const onCooldown = !isSubscribed && !!cooldownStartedAt &&
      Date.now() < cooldownStartedAt.getTime() + COOLDOWN_MS;

    if (onCooldown) {
      return NextResponse.json({ error: "You're on cooldown. Please wait before starting a new reading." }, { status: 403 });
    }

    const freeReadingUsedAt = metadata?.freeReadingUsedAt
      ? new Date(metadata.freeReadingUsedAt as string)
      : null;
    let freeReadingAvailable = !firstReadingUsed;
    if (freeReadingUsedAt && !isSubscribed) {
      freeReadingAvailable = Date.now() >= freeReadingUsedAt.getTime() + FREE_READING_RESET_MS;
    }

    const eligible = isSubscribed || freeReadingAvailable || credits >= CREDITS_PER_READING;
    if (!eligible) {
      return NextResponse.json({ error: "You don't have enough credits for a reading. Please purchase more or subscribe." }, { status: 403 });
    }
    // ── End eligibility check ──────────────────────────────────────────────────

    const body = (await request.json()) as ReadingRequestBody;

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
        system:
          "You are a precision astrologer writing for a real person who is paying for clarity about something " +
          "that matters to them. They may know nothing about astrology — write so they understand every sentence. " +
          "You are their personal astrologer: you know their chart completely and speak to them directly, without " +
          "softening, without hedging, without generic language. " +
          "The transit aspects are calculated and given to you — never compute or invent one. " +
          "CRITICAL: the prose contains NO degrees, NO orbs, and NO astrological jargon. All technical proof goes " +
          "in the 'sources' array, which the reader can expand. The reading loses no precision — precision lives in " +
          "the sharpness of the consequence, not in decimal places. " +
          "You output ONLY raw valid JSON — no markdown, no code fences, no preamble. Your entire response is a " +
          "single parseable JSON object containing one page with a content field and a sources field. " +
          "You speak to the person as 'you' in every sentence. You state outcomes as facts. " +
          "Keep it tight and mobile-optimized — no padding, no fluff. " +
          "Every specific date in the content must be wrapped in [[DATE: ...]] brackets.",
        messages: [{ role: "user", content: prompt }],
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
      console.error("[readings] Failed to parse Claude response. Error:", String(parseErr));
      console.error("[readings] Raw response start:", rawText.slice(0, 300));
      console.error("[readings] Raw response end:", rawText.slice(-200));
      return NextResponse.json(
        { error: "Failed to parse reading. Please try again." },
        { status: 422 }
      );
    }

    if (!parsed.pages || parsed.pages.length < 1) {
      return NextResponse.json(
        { error: "Reading structure was incomplete. Please try again." },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        reading: {
          id: crypto.randomUUID(),
          pages: parsed.pages,
          topic: body.topic,
          question: body.question,
          status: "complete",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[readings] Unexpected error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}