import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { buildVoiceCalibrationBlock } from "@/lib/signVoice";
import { assessRisk, getSafeResponse, getCareNote } from "@/lib/crisisDetection";
import type { TransitAspect } from "@/lib/transitAspects";
import {
  JXL_MAX_REPLIES_PER_CONVERSATION,
  JXL_CONVERSATION_CAP_MESSAGE,
} from "@/lib/jxlConfig";

/**
 * JXL — "ask anything" route.
 *
 * Built on the same architecture as /api/readings: the LANGUAGE RULE, the
 * ASPECT LAW, and the shared voice calibration. The differences are scope and
 * shape, not tone:
 *
 *   - The person brings a SPECIFIC situation instead of choosing a topic lane.
 *   - The answer is condensed: three paragraphs, no directives, no windows.
 *   - ONE date, and only when the ephemeris actually contains one. Otherwise
 *     the answer carries no date at all. It is never invented to fill a slot.
 *   - Every reply is COMPLETE. Nothing is withheld for a later reply.
 *
 * This replaces /api/jxl/chat (the paused 6-phase version), which can be
 * deleted along with /api/jxl/session and the session-tier config.
 */

const REPLIES_PER_SESSION = JXL_MAX_REPLIES_PER_CONVERSATION;

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

interface MoonPhaseData {
  phaseName: string;
  illuminationPercent: number;
  nextEventName: "New Moon" | "Full Moon";
  daysUntilNextEvent: number;
  moonSign: string;
  moonDegree: string;
}

interface JxlTurn {
  question: string;
  answer: string;
}

interface JxlAskBody {
  /** Transcribed speech. Messy by nature — read for intent. */
  question: string;
  /** Prior turns in THIS session, oldest first. */
  conversationHistory?: JxlTurn[];
  tropical: { planets: PlanetPlacement[]; aspects: Aspect[] };
  sidereal?: { planets: PlanetPlacement[] };
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

function fmtTransitAspects(aspects: TransitAspect[]): string {
  if (!aspects || aspects.length === 0) {
    return [
      "TRANSIT-TO-NATAL ASPECTS: none within orb right now.",
      "Answer from progressions, stations, and the profection year instead.",
      "IMPORTANT: with no aspects in orb, there is very likely NO date to give. Return date as null",
      "unless a station or the next exact aspect below supplies a real one.",
    ].join(NL);
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

function buildJxlPrompt(body: JxlAskBody, isFinalTurnOverride?: boolean): string {
  const {
    question,
    conversationHistory,
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

  const currentDateString = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const turnCount = (conversationHistory?.length ?? 0) + 1;
  const isFinalTurn = isFinalTurnOverride ?? (turnCount >= REPLIES_PER_SESSION);

  const transitAspectBlock = fmtTransitAspects(transitAspects ?? []);

  const upcomingTriggerBlock = upcomingTrigger
    ? NL +
      "NEXT EXACT ASPECT (ephemeris-calculated — a valid date anchor):" + NL +
      `${upcomingTrigger.transitPlanet} ${upcomingTrigger.aspect} natal ${upcomingTrigger.natalPlanet} — exact within 1° on ${upcomingTrigger.date}` +
      NL
    : NL + "NEXT EXACT ASPECT: none supplied. This is NOT a date source." + NL;

  const stationsBlock =
    planetaryStations && planetaryStations.length > 0
      ? NL +
        [
          "PLANETARY STATIONS (next 60 days — crystallization points, valid date anchors):",
          "ROLE: Stations with natal hits outrank ordinary transits. A planet stationing on a natal point",
          "forces an unavoidable crystallization of that house theme.",
          ...planetaryStations.map((s) => {
            const hit = s.natalPlanetHit
              ? ` — stations within ${s.orbDegrees}° of natal ${s.natalPlanetHit} (House ${s.natalHouse})`
              : " — no exact natal hit within 3°";
            return `${s.planet} stations ${s.stationType.toUpperCase()} on ${s.stationDate} at ${s.degree} ${s.sign}${hit}`;
          }),
          "",
        ].join(NL)
      : NL + "PLANETARY STATIONS: none in range. Not a date source." + NL;

  const moonPhaseBlock = moonPhase
    ? NL +
      [
        "MOON PHASE (timing texture — shapes WHEN, never what):",
        `${moonPhase.phaseName}, ${moonPhase.illuminationPercent}% illuminated. Moon in ${moonPhase.moonSign}.`,
        `Next ${moonPhase.nextEventName} in ${moonPhase.daysUntilNextEvent} days.`,
        "ROLE: Waxing supports initiating and building. Waning supports closing, releasing, and cutting.",
        "Use to choose which window to push toward — never as a date anchor on its own.",
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
        "ROLE — FILTER RULE: A transit must be reflected in Solar Return themes to trigger a major external",
        "event. Use SR to CONFIRM or DOWNGRADE. No SR support means the shift is internal, not an event.",
        "",
      ]
        .filter(Boolean)
        .join(NL)
    : "";

  const progressionsBlock =
    progressions && progressions.length > 0
      ? NL +
        [
          "SECONDARY PROGRESSIONS (current — inner development):",
          ...progressions.map(fmtProgression),
          "ROLE: The transit is the event; the progression is the person it is happening to. Use these to",
          "explain WHY something is landing the way it is.",
          "",
        ].join(NL)
      : "";

  const solarArcsBlock =
    solarArcs && solarArcs.length > 0
      ? NL +
        [
          "SOLAR ARC DIRECTIONS (long-arc structural timing):",
          ...solarArcs.map(fmtSolarArc),
          "ROLE: Only meaningful within 1° of a natal planet or angle — then it marks a multi-year structural",
          "shift underneath the moment. Otherwise ignore entirely.",
          "",
        ].join(NL)
      : "";

  const siderealBlock = sidereal?.planets?.length
    ? NL +
      [
        "SIDEREAL PLACEMENTS:",
        ...sidereal.planets.map(fmtPlanet),
        "ROLE — CONFIRMATION FILTER: A second opinion, not a second reading. Agrees with tropical → say it",
        "with more force. Disagrees → soften the certainty of that specific claim. NEVER mention sidereal,",
        "tropical, or any system name in the prose. It shapes confidence; it is not content.",
        "",
      ].join(NL)
    : "";

  const planetList = tropical.planets.map(fmtPlanet).join(NL);

  const aspectList = (tropical.aspects || [])
    .slice()
    .sort((a, b) => a.orbDegrees - b.orbDegrees)
    .map(fmtAspect)
    .join(NL);

  const transitList = (transits || []).map(fmtTransit).join(NL);

  const voiceCalibrationBlock = buildVoiceCalibrationBlock(
    tropical.planets.map((p) => ({ name: p.name, sign: p.sign }))
  );

  const conversationBlock =
    conversationHistory && conversationHistory.length > 0
      ? NL +
        "EARLIER IN THIS CONVERSATION:" + NL +
        conversationHistory
          .map((t, i) => `[${i + 1}] They said: "${t.question}"${NL}You answered: ${t.answer}`)
          .join(NL + NL) +
        NL
      : "";

  return [
    "You are answering a real person who just spoke out loud about something happening in their life",
    "right now. They may know nothing about astrology. Write so they understand every sentence.",
    "",
    "THIS ARRIVED AS TRANSCRIBED SPEECH. It may contain filler words, false starts, repetition, or",
    "transcription errors. Read for INTENT. Never comment on how they said it, never quote their",
    "phrasing back at them awkwardly, never mention transcription.",
    "",
    "CRITICAL REAL-ESTATE RULE: Mobile screen. Short, heavy sentences. No cosmic setup fluff.",
    "This is more condensed and more direct than a full reading. Hit the nerve and land it.",
    "",
    "═══════════════════════════════════════════",
    "THE LANGUAGE RULE — THIS GOVERNS EVERYTHING",
    "═══════════════════════════════════════════",
    "The prose is for a human being. This is a conversation, not a technical readout.",
    "",
    "DO NOT WRITE: degrees, minutes, orb numbers, or the words 'orb', 'anaretic', 'applying',",
    "'separating', 'ingress', 'cusp'. Never name sidereal, tropical, solar arc, or any system.",
    "",
    "DO WRITE: the planet, the aspect, and the house TRANSLATED into what it governs.",
    "  Not: 'Mercury at 24°35' Cancer trine natal North Node at 23°47' Scorpio, 1° orb.'",
    "  But: 'Mercury is exactly trine your North Node right now, in the part of your chart that rules courts.'",
    "Houses by MEANING, not number. Plain consequence. What they will actually feel, face, or decide.",
    "",
    "This loses NO precision. Every claim still rests on an exact calculated aspect. Precision lives in the",
    "sharpness of the consequence — never in decimal places.",
    "",
    "═══════════════════════════════════════════",
    "ASPECT LAW — THE MATH IS DONE FOR YOU",
    "═══════════════════════════════════════════",
    "The transit-to-natal aspects below are CALCULATED and EXACT. You do not compute them. You do not",
    "estimate orbs. You do not invent an aspect that is not on the list. If an aspect is not in that",
    "block, it is not happening and you may not mention it.",
    "Lead with EXACT and LIVE aspects. BACKGROUND aspects are context only.",
    "An APPLYING aspect is building — speak of it as coming. A SEPARATING one has peaked — speak of it as passing.",
    "",
    "═══════════════════════════════════════════",
    "THE DATE RULE — READ THIS TWICE",
    "═══════════════════════════════════════════",
    "You may return AT MOST ONE date, and ONLY if it traces directly to one of these three sources:",
    "  1. The NEXT EXACT ASPECT block, if one was supplied.",
    "  2. A PLANETARY STATION with a natal hit.",
    "  3. An EXACT or LIVE calculated aspect that has a real timing implication.",
    "",
    "If none of those exist, or none of them genuinely bears on what they asked about, return",
    "  \"date\": null",
    "and write the answer with no date in it at all.",
    "",
    "A null date is a CORRECT and COMMON answer. Many real questions — 'why does this keep happening',",
    "'why do I feel like this', 'what is actually going on here' — have no date and do not need one.",
    "NEVER manufacture a date. NEVER round a vague transit into a specific day to fill the slot.",
    "NEVER give a date range in this field — one specific date only, or null.",
    "An invented date is the single worst thing you can do here. Omitting one costs nothing.",
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
    "NATAL PLACEMENTS:",
    planetList,
    "",
    "NATAL ASPECTS (tightest first — the fixed wiring they were born with):",
    aspectList || "None provided.",
    "ROLE: These never change. They are the pattern the transits are ACTIVATING.",
    siderealBlock,
    "CURRENT TRANSIT POSITIONS:",
    transitList || "None provided.",
    "",
    "ANNUAL PROFECTION:",
    `Age ${profection.age}, House ${profection.activatedHouse} (${profection.activatedSign}), Time Lord: ${profection.timeLord}` +
      (profection.timeLordNatalSign
        ? ` (Natal: ${profection.timeLordNatalSign}${profection.timeLordNatalHouse ? `, House ${profection.timeLordNatalHouse}` : ""})`
        : ""),
    "ROLE: Any transit involving the Time Lord is AMPLIFIED — it carries more weight this year than it",
    "otherwise would. If your answer rests on a Time Lord transit, that is the strongest answer available.",
    progressionsBlock,
    solarArcsBlock,
    "",
    "═══════════════════════════════════════════",
    "WHAT THEY JUST SAID",
    "═══════════════════════════════════════════",
    conversationBlock,
    "THEIR LATEST:",
    `"${question}"`,
    "",
    `This is reply ${turnCount} of ${REPLIES_PER_SESSION} in this conversation.`,
    isFinalTurn
      ? "This is the LAST reply of the session. Close the loop cleanly and completely. Do not open a new" +
        NL +
        "question, do not tease anything further, do not hint that more is available. Land it and stop."
      : "They may speak again after this. That changes NOTHING about how complete this answer is.",
    "",
    "═══════════════════════════════════════════",
    "STRUCTURE — WHAT YOU RETURN",
    "═══════════════════════════════════════════",
    "",
    "THIS IS THE UPGRADED READING, NOT A SHORTER ONE. The full reading answers a broad topic. You are",
    "answering the exact situation this person is living through, which means MORE precision aimed at",
    "less surface area. Compress the prose. Never compress the substance. If the chart genuinely holds a",
    "dated window or a directive, it appears — omitting it to stay short is a failure, not restraint.",
    "",
    "TITLE — 2 to 4 words. Sharp, specific to what they actually asked. Not a headline, not clickbait,",
    "no colon-subtitle construction. It should read like the name of the thing they are living through.",
    "",
    "ANSWER — exactly 3 compact paragraphs. No headers. No bullets. No date labels.",
    "  Paragraph 1: Answer the thing they actually asked, directly, in the first sentence. Then ground it",
    "    in the tightest EXACT or LIVE aspect that bears on it — planets named, house translated into what",
    "    it governs, stated as what is happening to them right now.",
    "  Paragraph 2: The root. What in their natal wiring this is landing on, and the loop it produces.",
    "    Plain behavioral language — what they actually DO, not astrological concepts.",
    "  Paragraph 3: The mechanism — why it is landing now specifically, and what changes it. Pull in the",
    "    progression, the Time Lord, or the Solar Return filter if any of them genuinely bear on it.",
    "",
    "WINDOWS — 0, 1, or 2. Governed entirely by THE DATE RULE above.",
    "  Give a window ONLY when a calculated aspect, a station, or the next exact aspect supplies a real",
    "  date that genuinely bears on what they asked. Each window is one specific date plus ONE OR TWO",
    "  sentences: what activates, and the concrete consequence. Fact, not possibility.",
    "  If a window involves the Time Lord, say so — it outranks the others.",
    "  A window where nothing happens is not a window, it is filler. One real window beats two padded ones.",
    "  ZERO windows is correct and common. Return an empty array and let the answer stand on its own.",
    "",
    "DIRECTIVES — 0, 1, or 2. Include them whenever the chart supports a concrete move.",
    "  This is the actionable half of the upgrade. Do not drop it to save space.",
    "  Each is at most 2 sentences, and its type is one of:",
    "    DROP    — the specific behavior to stop now. Name the pattern driving it, in plain terms.",
    "    EXECUTE — the exact action to take, tied to a real window. Requires a date.",
    "    LOCK    — the commitment to seal before a window closes. Requires a date.",
    "  EXECUTE and LOCK may ONLY be used when a real date exists; otherwise use DROP, which needs none.",
    "  If the honest answer is that there is nothing to do yet, return an empty array rather than",
    "  inventing an instruction.",
    "",
    "CONFIRMATION — one or two warm sentences, and this is the most human part of the response.",
    "  Everything above is diagnosis. This is different. Name the thing they already know but have not",
    "  said out loud — the feeling underneath the question. Drop the clinical tone entirely. No astrology",
    "  at all, no placements, no dates. Just a person who actually heard them, telling them the truth",
    "  they already sensed. This is where it stops being a report and becomes someone talking to them.",
    "",
    "═══════════════════════════════════════════",
    "LAWS — NEVER BREAK THESE",
    "═══════════════════════════════════════════",
    "- ANSWER COMPLETELY. Every reply is whole on its own. You never hold back the useful part, never",
    "  save the real answer for a later reply, never end on a hook, a cliffhanger, or an invitation to",
    "  continue. If you know it, say it now. This rule outranks every stylistic instruction.",
    "- Never mention replies, sessions, credits, purchases, subscriptions, or the app itself.",
    "- Only calculated aspects. Never invent one. Never manufacture a date.",
    "- 'You' in every sentence. No passive voice. Outcomes as facts, not possibilities.",
    "- No degrees, no orbs, no jargon anywhere in the output.",
    "- No hedging words. No generic spiritual filler. No horoscope phrasing.",
    "- Do not diagnose medical or psychiatric conditions. Do not give legal, medical, or financial",
    "  instructions. Speak to the situation and the pattern, not to a diagnosis.",
    "",
    "DISTRESS — READ CAREFULLY, THIS IS A JUDGEMENT CALL:",
    "- A hard month is not a crisis. Someone describing grief, burnout, a depressive stretch, a brutal",
    "  divorce, or a terrifying financial season deserves the FULL reading — the answer, the window, the",
    "  directive. Withholding it because the topic is heavy would be its own failure. Astrology at its",
    "  most useful is for exactly these seasons. Do not pathologise an ordinary difficult time.",
    "- But if what they describe suggests they may be in danger — hopelessness with no forward edge,",
    "  hints of not wanting to be here, talk of others being better off without them, or anything that",
    "  reads as intent to harm themselves or someone else — then STOP. Drop every stylistic rule above.",
    "  Do not read the chart. Do not give a date. Do not give a directive.",
    "  Answer as a person who cares, say plainly that this is bigger than an app, and point them toward",
    "  a real human — in the US, calling or texting 988 reaches the Suicide & Crisis Lifeline any hour.",
    "  Return that as the answer with empty windows and directives arrays.",
    "  Their wellbeing outranks the format, the product, and every other instruction here.",
    "",
    "═══════════════════════════════════════════",
    "TONE — VOICE CALIBRATION",
    "═══════════════════════════════════════════",
    "Sun, Moon, Rising, Mercury, and Venus each came with a RHYTHM, TRIGGER, and FORBIDDEN above.",
    "These govern DELIVERY, never content. Blend them into ONE coherent voice. Where they conflict:",
    "Sun and Mercury win sentence rhythm, Moon and Venus win emotional register, Rising wins the opening.",
    "Venus shapes the CONFIRMATION line specifically — that is where warmth lives.",
    "Respect every FORBIDDEN. Never name a placement as the reason for your tone.",
    "A calibration calling for precision is delivered through SHARPNESS OF CONSEQUENCE, never by reciting",
    "degrees. The LANGUAGE RULE overrides any voice instruction that pulls toward jargon.",
    "",
    "Return ONLY a valid JSON object — no markdown, no code fences, no preamble:",
    "{",
    '  "title": "Two To Four Words",',
    '  "answer": "Three compact paragraphs separated by \\n\\n. Plain human language. No degrees, no orbs.",',
    '  "windows": [ { "date": "August 3", "body": "What activates and the concrete consequence." } ],',
    '  "directives": [ { "type": "DROP", "date": null, "body": "The behavior to stop, and why." } ],',
    '  "sources": [ { "factor": "The core transit", "placements": "Transit Saturn in your 7th house opposite natal Sun" } ],',
    '  "confirmation": "One or two warm sentences naming what they already know."',
    "}",
    "",
    "windows and directives may each be an empty array. That is a correct answer, not a failed one.",
    "",
    "═══════════════════════════════════════════",
    "SOURCES — SHOW YOUR WORK",
    "═══════════════════════════════════════════",
    "A real astrologer will read this and want to verify it against the chart. The sources array is where",
    "they check your work, so it must be HONEST and COMPLETE about what actually drove THIS answer.",
    "",
    "Include EVERY chart factor your answer genuinely leaned on — the transit aspects, the natal placements",
    "and aspects, the profection and Time Lord, progressions, solar arcs, stations, the solar return, the",
    "moon phase, the sidereal confirmation — whichever ones actually shaped what you said. If a factor",
    "changed your answer, name it. Leaving out something you used reads as hiding the working.",
    "",
    "But do NOT pad. Only list factors this specific answer actually rests on. Dumping the entire chart",
    "when the answer turned on two aspects reads as filler and makes an astrologer trust you LESS. A tight",
    "answer has few sources; a many-threaded answer has more. Match the sources to the reasoning.",
    "",
    "Each source: 'factor' is a short plain-language label (e.g. 'The timing', 'The root pattern',",
    "'Why it's amplified this year'). 'placements' is the precise astrological detail an astrologer would",
    "check — here you MAY name planets, signs, houses, and aspects technically, because this block is FOR",
    "the astrologer, not the reader. This is the ONLY place technical language is allowed.",
    "Order them to follow the answer: the factor behind paragraph one first.",
  ].join(NL);
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── LAYER 1: tiered risk assessment ────────────────────────────────────
    // Runs BEFORE the access gate and before the model call, so blocking costs
    // the person nothing and never spends a reply.
    //
    // Only CRITICAL and HIGH block. MEDIUM proceeds to a full reading and
    // carries a care note appended underneath — someone in a hard season still
    // gets the answer, the window, and the directive. See lib/crisisDetection.ts.
    const earlyBody = (await request.json()) as JxlAskBody;
    const risk = assessRisk(earlyBody?.question ?? "");

    if (risk.action === "block_crisis" || risk.action === "block_emergency") {
      const safe = getSafeResponse(risk);
      // Signals are category/level labels only — never the person's words.
      console.warn(
        `[jxl/ask] Layer 1 block — level=${risk.level} action=${risk.action} ` +
        `conf=${risk.confidence} signals=${risk.signals.join("|")}`
      );
      return NextResponse.json(
        {
          title: safe.title,
          answer: safe.answer,
          windows: [],
          directives: [],
          confirmation: safe.confirmation,
          isSafeResponse: true,
          riskLevel: risk.level,
          // Not counted as a reply — the client must not decrement anything.
          replyNumber: null,
          repliesPerSession: REPLIES_PER_SESSION,
        },
        { status: 200 }
      );
    }

    // MEDIUM: reading proceeds in full; this rides along with the response.
    const careNote = getCareNote(risk);

    // ── JXL access model ───────────────────────────────────────────────────
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const metadata = user.publicMetadata;

    const isSubscribed = metadata?.isSubscribed === true;
    const jxlCredits = Number(metadata?.jxlCredits ?? 0);
    const replyCredits = Number(metadata?.replyCredits ?? 0);

    const historyLen = earlyBody.conversationHistory?.length ?? 0;
    const turnCount = historyLen + 1;
    const isNewSession = historyLen === 0;

    // Free band: subscribers 4, non-subscribers 2 (their included replies).
    const freeReplies = isSubscribed ? 4 : 1;

    // ── The 8-reply safety wall — absolute, counts every turn, fresh per convo ──
    if (turnCount > JXL_MAX_REPLIES_PER_CONVERSATION) {
      return NextResponse.json(
        { error: JXL_CONVERSATION_CAP_MESSAGE, code: "JXL_CONVERSATION_CAP" },
        { status: 402 }
      );
    }

    let metaUpdate: Record<string, unknown> | null = null;

    if (isNewSession) {
      // JXL is credits-only. First-JXL 50% off is handled at checkout.
      // Zero jxlCredits → paywall.
      if (jxlCredits > 0) {
        metaUpdate = { jxlCredits: jxlCredits - 1 };
      } else {
        return NextResponse.json(
          { error: "You need a JXL credit to start a session.", code: "NO_JXL_ACCESS" },
          { status: 402 }
        );
      }
    } else if (turnCount <= freeReplies) {
      // CONTINUING within the free band — no charge.
      metaUpdate = null;
    } else {
      // CONTINUING past the free band — spend from the UNIFIED reply pool.
      if (replyCredits > 0) {
        metaUpdate = { replyCredits: replyCredits - 1 };
      } else {
        return NextResponse.json(
          {
            error: "You've used your free replies.",
            code: "NEEDS_REPLY_PACK",
            isSubscribed,
            // One pool now. Non-subs buy the à-la-carte replies pack
            // (reply_pack → replyCredits); subs get the discounted tail,
            // which also lands in replyCredits via sub_reply_tail_regular.
            tailMode: isSubscribed ? "sub_reply_tail_regular" : "reply_pack",
          },
          { status: 402 }
        );
      }
    }

    const isFinalTurn = turnCount >= JXL_MAX_REPLIES_PER_CONVERSATION;
    // ── End access model ───────────────────────────────────────────────────

    // Already parsed above for the crisis check — the request stream can only
    // be read once, so reuse it rather than calling request.json() again.
    const body = earlyBody;

    if (!body.question || !body.tropical?.planets || !body.profection || !body.transits) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    if (body.question.trim().length < 2) {
      return NextResponse.json(
        { error: "We didn't catch that. Hold the button and try again." },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API configuration error." }, { status: 500 });
    }

    const prompt = buildJxlPrompt(body, isFinalTurn);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1600,
        system:
          "You are a precision astrologer answering a real person who just spoke aloud about a specific " +
          "situation in their life. They may know nothing about astrology — write so they understand every " +
          "sentence. The transit aspects are calculated and given to you: never compute or invent one, and " +
          "never manufacture a date. Returning a null date is correct and common. " +
          "CRITICAL: no degrees, no orbs, and no astrological jargon anywhere in your output. This is a " +
          "conversation, not a technical readout. Precision lives in the sharpness of the consequence, not " +
          "in decimal places. " +
          "Answer completely. Never withhold the useful part, never end on a hook, never reference sessions, " +
          "replies, or purchases. If the person is in real distress, care for them first and set the format " +
          "aside. " +
          "Speak directly to them as 'you'. State outcomes as facts. Keep it tight and mobile-optimized. " +
          "Output ONLY raw valid JSON — no markdown, no code fences, no preamble.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[jxl/ask] Claude error:", err);
      return NextResponse.json(
        { error: "Failed to generate response. Please try again." },
        { status: 502 }
      );
    }

    const claudeData = await response.json();
    const rawText = claudeData.content?.[0]?.text;

    if (!rawText) {
      return NextResponse.json({ error: "No response from reading engine." }, { status: 502 });
    }

    let parsed: {
      title: string;
      answer: string;
      windows?: Array<{ date?: string | null; body?: string }>;
      directives?: Array<{ type?: string; date?: string | null; body?: string }>;
      sources?: Array<{ factor?: string; placements?: string }>;
      confirmation: string;
    };

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
      console.error("[jxl/ask] Failed to parse response:", String(parseErr));
      console.error("[jxl/ask] Raw start:", rawText.slice(0, 300));
      console.error("[jxl/ask] Raw end:", rawText.slice(-200));
      return NextResponse.json(
        { error: "Failed to parse response. Please try again." },
        { status: 422 }
      );
    }

    if (!parsed.title || !parsed.answer) {
      return NextResponse.json(
        { error: "Response was incomplete. Please try again." },
        { status: 422 }
      );
    }

    // Placeholder dates the model sometimes emits instead of omitting a date.
    // Anything on this list is treated as "no date", so the UI never renders a
    // chip reading "TBD" or "null".
    const isPlaceholder = (d: unknown): boolean => {
      if (typeof d !== "string") return true;
      const t = d.trim().toLowerCase();
      return t === "" || ["null", "none", "n/a", "na", "tbd", "unknown"].includes(t);
    };

    // Windows: max 2, must have a real date AND a body.
    const windows = (Array.isArray(parsed.windows) ? parsed.windows : [])
      .filter((w) => !isPlaceholder(w?.date) && typeof w?.body === "string" && w.body.trim())
      .slice(0, 2)
      .map((w) => ({ date: (w.date as string).trim(), body: (w.body as string).trim() }));

    // Directives: max 2. EXECUTE and LOCK require a real date — if the model
    // returns one without, downgrade it to DROP rather than showing a dateless
    // "execute by" with nothing to execute by.
    const directives = (Array.isArray(parsed.directives) ? parsed.directives : [])
      .filter((d) => typeof d?.body === "string" && d.body.trim())
      .slice(0, 2)
      .map((d) => {
        const rawType = String(d?.type ?? "DROP").toUpperCase();
        const type = ["DROP", "EXECUTE", "LOCK"].includes(rawType) ? rawType : "DROP";
        const date = isPlaceholder(d?.date) ? null : (d!.date as string).trim();
        const needsDate = type === "EXECUTE" || type === "LOCK";
        return {
          type: needsDate && !date ? "DROP" : type,
          date: needsDate && date ? date : null,
          body: (d!.body as string).trim(),
        };
      });

    // Sources: each needs both a label and the placement detail. No cap — an
    // honest answer lists everything it leaned on — but drop empties so the UI
    // never shows a blank row.
    const sources = (Array.isArray(parsed.sources) ? parsed.sources : [])
      .filter(
        (s) =>
          typeof s?.factor === "string" &&
          s.factor.trim() &&
          typeof s?.placements === "string" &&
          s.placements.trim()
      )
      .map((s) => ({ factor: (s.factor as string).trim(), placements: (s.placements as string).trim() }));

    // Charge only now — the reading succeeded. Every failure path above already
    // returned without touching metadata.
    if (metaUpdate) {
      try {
        await client.users.updateUserMetadata(userId, {
          publicMetadata: { ...metadata, ...metaUpdate },
        });
      } catch (writeErr) {
        // They already have their answer; never fail the response on the write.
        console.error("[jxl/ask] metadata write failed post-reading:", writeErr);
      }
    }

    return NextResponse.json(
      {
        title: parsed.title,
        answer: parsed.answer,
        windows,
        directives,
        sources,
        confirmation: parsed.confirmation ?? "",
        // Present only on MEDIUM risk. The client renders it quietly beneath
        // the reading — never as a warning, never as an interruption.
        careNote,
        isSafeResponse: false,
        riskLevel: risk.level,
        replyNumber: (body.conversationHistory?.length ?? 0) + 1,
        repliesPerSession: REPLIES_PER_SESSION,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[jxl/ask] Unexpected error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}