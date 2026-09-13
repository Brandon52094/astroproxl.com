import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { buildVoiceCalibrationBlock } from "@/lib/signVoice";
import { assessRisk, getSafeResponse, getCareNote } from "@/lib/crisisDetection";
import type { TransitAspect } from "@/lib/transitAspects";
import {
  JXL_MAX_REPLIES_PER_CONVERSATION,
  JXL_CONVERSATION_CAP_MESSAGE,
} from "@/lib/jxlConfig";
import { buildValidDateIndex, checkDateSupported } from "@/lib/validateReadingDates";
import { validateAndFilterAspects } from "@/lib/reading/engine";
import { PRICING } from "@/lib/paywallConfig";
import type {
  HouseRuler,
  MutualReception,
  EssentialDignity,
  SynodicCycle,
  Midpoint,
  LunarReturn,
  EclipseActivation,
  TransitToAngle,
  DispositorResult,
} from "@/lib/astrologicalCalculations";

/**
 * JXL — open-context premium predictive astrology route.
 *
 * Unlike regular Readings, JXL does not require the user to choose a preset
 * topic first. They can speak or type any situation, problem, decision,
 * pattern, or question. JXL determines the relevant life domains internally
 * and may combine them when the situation genuinely crosses areas of life.
 *
 * Reader-facing contract:
 * PREDICTION → ASTROLOGICAL WHY → WHAT HAPPENS NEXT
 *
 * JXL is prediction-first: it converts converging chart evidence into the most
 * concrete real-world manifestation that evidence supports. Useful astrology
 * terminology is encouraged when it is immediately translated into lived
 * meaning. Dates remain calculator-controlled and are never invented.
 */

const REPLIES_PER_SESSION = JXL_MAX_REPLIES_PER_CONVERSATION;

interface PlanetPlacement {
  name: string;
  sign: string;
  degree: string;
  house?: string;
  isAnaretic?: boolean;
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

interface DeclinationData {
  planet: string;
  declination: number;
  isOutOfBounds: boolean;
}

interface ArabicLot {
  name: "Lot of Fortune" | "Lot of Spirit";
  sign: string;
  degree: string;
  house: number;
}

interface ExtendedPoints {
  declinations: DeclinationData[];
  arabicLots: ArabicLot[];
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
  extendedPoints?: ExtendedPoints;

  // Current AstroPro calculation channels. Optional so older clients still work.
  houseRulers?: HouseRuler[];
  mutualReceptions?: MutualReception[];
  essentialDignities?: EssentialDignity[];
  synodicCycles?: SynodicCycle[];
  midpoints?: Midpoint[];
  lunarReturn?: LunarReturn;
  eclipseActivations?: EclipseActivation[];
  transitsToAngles?: TransitToAngle[];
  dispositorTree?: DispositorResult[];
}

const NL = "\n";

type VoiceTopic = "love" | "career" | "money" | "general";
type JxlDomain =
  | "relationships"
  | "career"
  | "money"
  | "home-family"
  | "self-purpose"
  | "wellbeing"
  | "legal-contracts"
  | "general";

const DOMAIN_TERMS: Record<Exclude<JxlDomain, "general">, string[]> = {
  relationships: [
    "love", "relationship", "partner", "dating", "date", "boyfriend", "girlfriend",
    "husband", "wife", "marriage", "married", "romance", "romantic", "breakup",
    "break up", "ex", "connection", "crush", "friendship", "friend",
  ],
  career: [
    "career", "job", "work", "boss", "manager", "coworker", "co-worker", "interview",
    "promotion", "professional", "business", "client", "employee", "company", "store",
    "office", "position", "offer",
  ],
  money: [
    "money", "salary", "pay", "income", "rent", "debt", "bill", "afford", "financial",
    "finance", "credit", "bank", "loan", "purchase", "investment", "price", "budget",
  ],
  "home-family": [
    "home", "house", "apartment", "move", "moving", "relocate", "family", "mother",
    "father", "parent", "sibling", "roommate", "living situation",
  ],
  "self-purpose": [
    "purpose", "identity", "direction", "path", "future", "myself", "confidence",
    "decision", "choice", "stuck", "growth", "calling",
  ],
  wellbeing: [
    "health", "wellbeing", "well-being", "stress", "burnout", "sleep", "energy",
    "exhausted", "anxiety", "overwhelmed", "grief",
  ],
  "legal-contracts": [
    "court", "lawsuit", "legal", "lawyer", "attorney", "judge", "trial", "case",
    "settlement", "contract", "hearing", "mediation",
  ],
};

function scoreTerms(text: string, terms: string[]): number {
  const haystack = text.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function inferJxlDomains(text: string): JxlDomain[] {
  const scored = (Object.entries(DOMAIN_TERMS) as Array<
    [Exclude<JxlDomain, "general">, string[]]
  >)
    .map(([domain, terms]) => ({ domain, score: scoreTerms(text, terms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return ["general"];
  const top = scored[0].score;
  return scored
    .filter((item) => item.score >= Math.max(1, top - 1))
    .slice(0, 3)
    .map((item) => item.domain);
}

function inferVoiceTopic(text: string): VoiceTopic {
  const scores: Record<Exclude<VoiceTopic, "general">, number> = {
    love: scoreTerms(text, DOMAIN_TERMS.relationships),
    career: scoreTerms(text, DOMAIN_TERMS.career),
    money: scoreTerms(text, DOMAIN_TERMS.money),
  };
  const ranked = (Object.entries(scores) as Array<
    [Exclude<VoiceTopic, "general">, number]
  >).sort((a, b) => b[1] - a[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : "general";
}

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
    "EXACT = precision band assigned by the validated reading engine — firing now.",
    "LIVE = active band assigned by the validated reading engine — lead with these.",
    "BACKGROUND = context only — never a date anchor.",
    "APPLYING = still tightening, the event is building toward them.",
    "SEPARATING = the peak has already passed; speak of it in past tense.",
    "",
  ];

  for (const a of aspects) {
    const motion = a.isApplying ? "APPLYING" : "SEPARATING";
    const rx = a.isRetrograde ? " Rx" : "";
    const exactTiming = a.exactDate ? ` — calculator exact date: ${a.exactDate}` : "";

    lines.push(
      `[${a.band.toUpperCase()}] Transit ${a.transitPlanet}${rx} ${a.transitSign} ${a.transitDegree} ` +
      `${a.aspectType} natal ${a.natalPlanet} ${a.natalSign} ${a.natalDegree} ` +
      `(House ${a.natalHouse ?? "—"}) — ${a.orbDegrees}° orb, ${motion}${exactTiming}`
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
    houseRulers,
    mutualReceptions,
    essentialDignities,
    synodicCycles,
    midpoints,
    lunarReturn,
    eclipseActivations,
    transitsToAngles,
    dispositorTree,
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
          "PLANETARY STATIONS (next 60 days):",
          "ROLE: A station is a valid date anchor ONLY when the calculator confirms a natal hit.",
          "With a natal hit, it can strongly amplify timing around that natal point or house.",
          "Without a natal hit, treat it as background context only. A station never guarantees an event by itself.",
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
        "MOON PHASE (timing texture only — never a date source):",
        `${moonPhase.phaseName}, ${moonPhase.illuminationPercent}% illuminated. Moon in ${moonPhase.moonSign}.`,
        `Next ${moonPhase.nextEventName} in ${moonPhase.daysUntilNextEvent} days.`,
        "ROLE: Use this only to describe whether the current phase favors building, culmination, or release.",
        "Never use it to create, choose, move, or strengthen a calendar date.",
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
        "ROLE: Use the Solar Return as annual context and confirmation only.",
        "It may strengthen an already-supported theme, but it cannot create, veto, or date an event by itself.",
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
          "ROLE: Progressions describe internal development and longer-form personal context.",
          "They may confirm why an active transit is landing strongly, but they cannot create or date an event by themselves.",
          "",
        ].join(NL)
      : "";

  const solarArcsBlock =
    solarArcs && solarArcs.length > 0
      ? NL +
        [
          "SOLAR ARC DIRECTIONS (long-arc structural timing):",
          ...solarArcs.map(fmtSolarArc),
          "ROLE: These are structural background context only unless a calculated Solar Arc contact is explicitly supplied.",
          "Do not calculate or infer a Solar Arc aspect from these raw positions, and never use them as a date source.",
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

  const anareticBlock = (() => {
    const anaretic = tropical.planets.filter((p) => p.isAnaretic);
    if (anaretic.length === 0) return "";
    const names = anaretic.map((p) => `${p.name} (${p.sign})`).join(", ");
    return NL + [
      "",
      "FINAL-DEGREE PLACEMENTS (anaretic — a quality, NOT a date):",
      names,
      "ROLE: A planet at the last degree of its sign carries a sense of something urgent or reaching its",
      "limit. Translate as ending-energy in the PROSE only. This is a texture, never a timing source —",
      "it does NOT permit a date, and it never overrides THE DATE RULE. Use only if central; else ignore.",
      "",
    ].join(NL);
  })();

  const extendedPointsBlock = (() => {
    if (!body.extendedPoints) return "";
    const { arabicLots, declinations } = body.extendedPoints;
    const oob = (declinations ?? []).filter((d) => d.isOutOfBounds);
    if ((!arabicLots || arabicLots.length === 0) && oob.length === 0) return "";
    const lines = ["", "EXTENDED POINTS (SUPPORTING SIGNAL ONLY — never a headline, never a date anchor):"];
    if (arabicLots && arabicLots.length > 0) {
      lines.push("Lots: " + arabicLots.map((l) => `${l.name} in ${l.sign} (House ${l.house})`).join(", "));
      lines.push(
        "ROLE: Fortune shows where ease flows; Spirit shows where effort lives. Use ONLY to confirm a theme the",
        "calculated aspects already established. Never introduce a new topic from a Lot alone."
      );
    }
    if (oob.length > 0) {
      lines.push(
        "Out-of-bounds: " + oob.map((d) => `${d.planet} (${d.declination}°)`).join(", "),
        "ROLE: An out-of-bounds planet runs hotter, less governed. If central to the answer, note its expression",
        "is extreme. If not central, ignore. Do not name it in the prose; let it sharpen the consequence."
      );
    }
    lines.push("");
    return NL + lines.join(NL);
  })();

  const advancedCalculationsBlock = (() => {
    const blocks: string[] = [];

    if (houseRulers?.length) {
      blocks.push(
        "",
        "HOUSE RULERS (natal structure):",
        ...houseRulers.map((r) => `House ${r.house}: ${r.sign}, ruled by ${r.ruler}`),
        "ROLE: Use rulership to connect the situation to natal structure. It can deepen WHY, but cannot create timing by itself."
      );
    }
    if (mutualReceptions?.length) {
      blocks.push(
        "",
        "MUTUAL RECEPTIONS (amplifier):",
        ...mutualReceptions.map((r) => `${r.planetA} in ${r.signA} ↔ ${r.planetB} in ${r.signB}`),
        "ROLE: Confirmation/amplifier only. Never create an event or date from reception alone."
      );
    }
    if (essentialDignities?.length) {
      blocks.push(
        "",
        "ESSENTIAL DIGNITIES (expression quality):",
        ...essentialDignities.map((d) => `${d.planet} in ${d.sign}: ${d.dignity} (strength ${d.strength})`),
        "ROLE: Modify how cleanly or awkwardly a planet expresses. This is not an event source."
      );
    }
    if (midpoints?.length) {
      blocks.push(
        "",
        "MIDPOINTS (sensitive context):",
        ...midpoints.slice(0, 8).map((m) => `${m.pointA}/${m.pointB}: ${m.sign} ${m.degree}°, House ${m.house}`),
        "ROLE: Context only unless directly activated by supplied calculated evidence."
      );
    }
    if (lunarReturn) {
      blocks.push(
        "",
        "LUNAR RETURN (short-term confirmation):",
        JSON.stringify(lunarReturn),
        "ROLE: Short-term texture/confirmation. It cannot manufacture an exact date."
      );
    }
    if (eclipseActivations?.length) {
      blocks.push(
        "",
        "ECLIPSE ACTIVATIONS (developmental amplifier):",
        ...eclipseActivations.map((e) => `${e.eclipseType} eclipse ${e.eclipseDate} in ${e.sign}; activates ${e.activatedPlanet}, orb ${e.orb}°`),
        "ROLE: Amplify an already-supported storyline. Do not convert an eclipse into a guaranteed event."
      );
    }
    if (transitsToAngles?.length) {
      blocks.push(
        "",
        "TRANSITS TO NATAL ANGLES:",
        ...transitsToAngles.map((a) => `${a.transitPlanet} ${a.aspectType} ${a.angle} — ${a.orb}° orb, ${a.isApplying ? "applying" : "separating"}`),
        "ROLE: Tight angle contacts can be major external activators when relevant to the user's question."
      );
    }
    if (dispositorTree?.length) {
      blocks.push(
        "",
        "DISPOSITOR STRUCTURE:",
        ...dispositorTree.slice(0, 12).map((d) => `${d.planet} → ${d.dispositor}; final dispositor: ${d.finalDispositor}`),
        "ROLE: Interpretive hierarchy/context only. Never a date source."
      );
    }
    if (synodicCycles?.length) {
      blocks.push(
        "",
        "SYNODIC CYCLES (context only):",
        ...synodicCycles.map((c) => `${c.planet}: ${c.returnDate} (${c.daysUntilReturn} days)`),
        "ROLE: Context only unless independently verified by current exact-timing rules."
      );
    }

    return blocks.length ? NL + blocks.join(NL) + NL : "";
  })();

  const MAJOR_BODIES = new Set([
    "Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn",
    "Uranus","Neptune","Pluto","North Node","Ascendant","Midheaven",
  ]);
  const isMajor = (a: Aspect) =>
    MAJOR_BODIES.has(a.planetA) && MAJOR_BODIES.has(a.planetB);

  const aspectList = (tropical.aspects || [])
    .slice()
    .sort((a, b) => {
      if (isMajor(a) !== isMajor(b)) return isMajor(a) ? -1 : 1;
      return a.orbDegrees - b.orbDegrees;
    })
    .slice(0, 12)
    .map((a) => (isMajor(a) ? fmtAspect(a) : fmtAspect(a) + "  [minor body — flavor only]"))
    .join(NL);

  const transitList = (transits || []).map(fmtTransit).join(NL);

  // Keep the compatibility voice stable across the conversation. Follow-up wording
  // can be too short to route tone reliably, so anchor it to the first question.
  const rootQuestion = conversationHistory?.[0]?.question ?? question;
  const voiceTopic = inferVoiceTopic(rootQuestion);

  const houseSigns = Object.fromEntries(
    (houseRulers ?? []).map(({ house, sign }) => [house, sign])
  ) as Partial<Record<number, string>>;

  const voiceCalibrationBlock = buildVoiceCalibrationBlock(voiceTopic, {
    planets: tropical.planets.map((p) => ({ name: p.name, sign: p.sign })),
    houseSigns,
  });

  const fullConversationText = [
    ...(conversationHistory ?? []).map((turn) => turn.question),
    question,
  ].join(" ");
  const domainHints = inferJxlDomains(fullConversationText);

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
    "THIS IS THE PREMIUM OPEN-CONTEXT READING.",
    "The user did not choose a preset topic. Their real situation defines the scope. You may combine",
    "relationship, career, money, home/family, self/purpose, wellbeing, legal/contract, or other chart",
    "domains when the question genuinely crosses them. Never force the question into one artificial lane.",
    `DOMAIN HINTS (routing only — verify against the actual question): ${domainHints.join(", ")}.`,
    "",
    "Depth is the product, but depth does not mean length for its own sake. Resolve the chart into the strongest",
    "concrete prediction it supports, explain the astrological mechanism underneath it, tell them what to do with",
    "that information, surface one genuine opportunity when one exists, and follow the prediction into its outcome.",
    "",
    "PREDICTION DOCTRINE — THIS IS WHAT MAKES JXL PREMIUM:",
    "JXL is not merely an interpretation engine. It is a predictive astrology engine.",
    "After understanding the situation and resolving the chart evidence, determine what concrete development",
    "the astrology is most strongly pointing toward next.",
    "",
    "Do not stop at themes such as 'pressure around work,' 'relationship clarity,' 'financial restructuring,'",
    "or 'a period of transformation.' Translate the astrology into the real-world manifestation those signatures",
    "are most likely to produce.",
    "",
    "Examples:",
    "- Not: 'Your career is entering a period of change.'",
    "  Instead: 'A change in your role, responsibilities, or employer becomes the next concrete career development.'",
    "- Not: 'Your relationship sector is activated.'",
    "  Instead: 'A relationship reaches a point where one of you has to define what this actually is.'",
    "- Not: 'Money is under pressure.'",
    "  Instead: 'A specific expense, payment, negotiation, or income decision forces you to reorganize your finances.'",
    "",
    "Choose ONE primary prediction whenever the evidence supports one. Do not dilute it with five equally weighted",
    "possibilities. Small predictions count: a conversation resurfaces, an answer arrives, a contract changes,",
    "a payment moves, a deadline shifts, someone becomes more direct, an old contact returns, or a decision becomes final.",
    "",
    "PREDICTION STRENGTH:",
    "- EVENT: multiple independent techniques converge on one concrete development → state that development directly.",
    "- ACTIVATION: a strong trigger is present but one external event is not uniquely determined → state the strongest",
    "  expected manifestation and the condition that shapes how it lands.",
    "- BACKGROUND: no concrete external event is supported → predict the internal decision, realization, behavior change,",
    "  or pressure point the chart actually supports. Never invent an external event just to sound predictive.",
    "",
    "Predictive language should be declarative when the evidence is strong. Do not hide every conclusion behind",
    "'may,' 'might,' 'could,' or a list of alternatives. Match certainty to the evidence, but actually make the call.",
    "",
    "The prediction must answer as many of these as the evidence supports:",
    "WHAT happens next?",
    "WHERE in life does it happen?",
    "WHAT changes because of it?",
    "WHEN does it peak, if calculator-supported timing exists?",
    "",
    "Specific dates remain governed entirely by THE DATE RULE. A strong prediction does not require an invented date.",
    "",
    "═══════════════════════════════════════════",
    "JXL LANGUAGE — ASTROLOGY IS ALLOWED, JARGON DUMPS ARE NOT",
    "═══════════════════════════════════════════",
    "This should sound like a skilled astrologer talking to a real person, not a technical report.",
    "",
    "You MAY name useful astrology directly: planets, signs, houses, transits, conjunctions, oppositions,",
    "squares, trines, sextiles, retrogrades, stations, profections, the Time Lord, progressions, Solar",
    "Return themes, house rulers, and other supplied chart factors when they genuinely matter.",
    "",
    "Whenever you use a technical term, translate it into consequence in the same sentence or the next one.",
    "Example: 'Saturn is squaring your Venus, so the relationship pressure is asking for definition rather",
    "than more waiting.' The astrology should make the user's reality make MORE sense.",
    "",
    "Do NOT recite degrees, minutes, orb numbers, raw coordinates, or calculator metadata in reader-facing",
    "prose. Do not stack five technical factors into a sentence simply to sound advanced. Precision lives",
    "in selecting the right factors and explaining exactly what they mean.",
    "",
    "═══════════════════════════════════════════",
    "ASPECT LAW — THE MATH IS DONE FOR YOU",
    "═══════════════════════════════════════════",
    "The transit-to-natal aspects below are CALCULATED and EXACT. You do not compute them. You do not",
    "estimate orbs. You do not invent an aspect that is not in the list. If an aspect is not in that",
    "block, it is not happening and you may not mention it.",
    "Lead with EXACT and LIVE aspects. BACKGROUND aspects are context only.",
    "An APPLYING aspect is building — speak of it as coming. A SEPARATING one has peaked — speak of it as passing.",
    "",
    "═══════════════════════════════════════════",
    "THE DATE RULE — READ THIS TWICE",
    "═══════════════════════════════════════════",
    "Every specific date you return must trace directly to a calculator-supplied exact date from:",
    "  1. The NEXT EXACT ASPECT block, if one was supplied.",
    "  2. A PLANETARY STATION with a natal hit.",
    "  3. An EXACT or LIVE calculated aspect that includes a calculator exact date.",
    "",
    "Specific calendar dates may appear ONLY in windows[].date or directives[].date.",
    "Do not place calendar dates inside the title, answer, window body, directive body, confirmation, or sources.",
    "",
    "If none of those genuinely bears on what they asked about, return no dated windows and use no",
    "dated directives.",
    "",
    "Zero dates is a CORRECT and COMMON answer. Many real questions — 'why does this keep happening',",
    "'why do I feel like this', 'what is actually going on here' — have no date and do not need one.",
    "NEVER manufacture, approximate, round, diversify, or substitute a date.",
    "NEVER turn an orb into a calendar date.",
    "Every emitted date must already exist in the supplied calculator data.",
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
    anareticBlock,
    "",
    "NATAL ASPECTS (ranked — major-body first, then by tightness; asteroid/Chiron/Lilith marked flavor):",
    aspectList || "None provided.",
    "ROLE: These never change. They are the pattern the transits are ACTIVATING.",
    "Aspects marked '[minor body — flavor only]' may color a description but may never anchor a claim.",
    extendedPointsBlock,
    advancedCalculationsBlock,
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
    "SYNTHESIS PASS — DO THIS BEFORE YOU WRITE A SINGLE WORD",
    "═══════════════════════════════════════════",
    "The layers above are NOT a menu and NOT a checklist. They are independent instruments pointed at the",
    "same situation. Determine which life domains the user's words actually touch, then find where the",
    "strongest calculated and natal evidence agrees inside those domains.",
    "",
    "Do not make the user choose a lane after the fact. A question can legitimately cross domains: a job",
    "offer can be career + money; moving in with a partner can be relationship + home + money. Follow the",
    "actual situation and let the chart show which thread is dominant.",
    "",
    "Work through this silently before writing:",
    "1. SCOPE. Identify the dominant domain and any secondary domain genuinely present in the question.",
    "   This is internal routing only. Do not tell them you classified their question.",
    "2. SPINE. Choose the strongest VALIDATED signal that directly bears on what they asked.",
    "   Prefer an exact calculator-dated trigger or natal-hit station when it is genuinely relevant;",
    "   otherwise use the tightest EXACT or LIVE transit-to-natal aspect.",
    "   If no strong signal directly bears on the question, do not manufacture an event spine.",
    "3. ROOT. Find the tightest MAJOR-body natal aspect, placement, angle, or rulership the spine lands on —",
    "   the fixed wiring being activated. This is why it lands on THEM, not on anyone having a hard week.",
    "4. AMPLIFIERS. Check every other layer against the spine. Ask each ONE question: does it point at the same",
    "   planet, house, angle, ruler, or life theme?",
    "   - Spine's planet is the Time Lord, or its house is the profected house? → headline of the year.",
    "   - A progression names the same chapter? → explains why the development is personally ripe now.",
    "   - Solar Return repeats the same theme? → confirmation only; it strengthens but cannot create the event.",
    "   - A natal-hit station reinforces the same point or house? → timing is amplified.",
    "   - A tight transit to an angle repeats the theme? → external manifestation strength rises.",
    "   - House rulers connect the active houses? → use that to identify WHERE the event is likely to show up.",
    "   - Dignities, receptions, eclipses, dispositors, midpoints, lunar return, sidereal, moon phase, lots,",
    "     anaretic or out-of-bounds factors agree? → use them to refine expression, never to invent a new event.",
    "5. CLASSIFY. Decide what level the evidence actually supports:",
    "   - EVENT: multiple independent techniques converge on one concrete development.",
    "   - ACTIVATION: a strong trigger is present, but its manifestation is not uniquely determined.",
    "   - BACKGROUND: theme or context only; no concrete external-event claim.",
    "6. MANIFESTATION. Convert the convergence into the most concrete real-world development the evidence supports.",
    "   Ask: if these exact signatures showed up in someone's actual life, what event, conversation, decision, offer,",
    "   ending, beginning, payment, move, commitment, conflict, opportunity, or realization best fits them?",
    "   Choose the strongest manifestation. Do not remain at the level of an abstract theme.",
    "7. PREDICT. State that manifestation as the primary prediction. The user came to JXL to know what the astrology",
    "   points toward happening — not merely what the symbols mean.",
    "8. OUTCOME. Follow the prediction forward. What does it change? What is the strongest supported trajectory after it?",
    "   If the evidence supports activation rather than one guaranteed event, state the leading trajectory and the one",
    "   condition that meaningfully changes it. Do not manufacture certainty.",
    "9. DISCARD. Anything that does not connect to the spine or prediction is dropped. You were given the whole chart",
    "   to FIND convergence, not to list it. An unused layer is not a failure; name-dropping every layer is.",
    "",
    "The finished answer is ONE predictive throughline: make the call, explain why the astrology supports it, then",
    "follow the development forward into what happens next. Opportunity and directive fields support that throughline;",
    "they are not separate mini-readings.",
    "",
    "═══════════════════════════════════════════",
    "STRUCTURE — WHAT YOU RETURN",
    "═══════════════════════════════════════════",
    "",
    "THIS IS THE PREMIUM PREDICTIVE READING. A regular Reading explains a selected life area. JXL listens to",
    "the exact situation, resolves the chart, and makes the strongest prediction the evidence supports.",
    "Depth comes from specificity, synthesis, mechanism, and consequence — not from adding more sections.",
    "",
    "TITLE — 2 to 4 words. Sharp, specific to what they actually asked. It should read like the name of the",
    "development or turning point they are entering, not a generic horoscope headline.",
    "",
    "ANSWER — exactly 3 substantial, flowing paragraphs. No headers. No bullets. No calendar dates inside the answer.",
    "",
    "  Paragraph 1 — THE PREDICTION:",
    "    Open with the concrete development the astrology is pointing toward. Answer their actual question immediately.",
    "    Do not spend the opening merely validating feelings or describing a theme. Make the call first.",
    "    Then identify the strongest live astrological trigger behind it in readable language.",
    "",
    "  Paragraph 2 — WHY THIS HAPPENS:",
    "    Go deeper. Explain the two to four chart factors that make this prediction specific to THIS person — natal",
    "    pattern, house/rulership, Time Lord, progression, Solar Return, angle activation, station, or other converging",
    "    evidence. Useful astrology terminology is encouraged, but translate every technical point into lived meaning.",
    "    This paragraph should make the prediction feel earned rather than asserted.",
    "",
    "  Paragraph 3 — WHAT HAPPENS NEXT:",
    "    Follow the predicted development forward. Explain what changes because of it, how it is most likely to unfold,",
    "    what the person should do with it, and the strongest supported outcome. If one condition materially changes",
    "    the trajectory, name that condition clearly. End with the outcome — not a vague list of possibilities.",
    "",
    "OPPORTUNITY — 0 or 1 strongest calculator-supported window, returned in windows[].",
    "  Only include it when a supplied exact aspect, natal-hit station, or next exact aspect genuinely bears on the",
    "  prediction. Give the specific supported date plus one or two sentences explaining what peaks or opens then.",
    "  One real window is premium. Multiple padded dates are not. If no valid date supports the prediction, return [].",
    "",
    "DIRECTIVE — 0 or 1 strongest action, returned in directives[].",
    "  Include only the move that materially improves how the predicted development lands.",
    "  DROP — the specific behavior or pattern to stop now; no date required.",
    "  EXECUTE — the action to take at the real supported opportunity; requires a date.",
    "  LOCK — the commitment to seal around the real supported opportunity; requires a date.",
    "  If there is no meaningful action, return []. Do not invent instructions to fill the field.",
    "",
    "CONFIRMATION — one or two warm sentences after the predictive work is complete.",
    "  Name the thing underneath the question that the person already senses but has not fully said out loud.",
    "  No astrology, no dates, no diagnosis. This is recognition, not another interpretation section.",
    "",
    "═══════════════════════════════════════════",
    "LAWS — NEVER BREAK THESE",
    "═══════════════════════════════════════════",
    "- ANSWER COMPLETELY. Every reply is whole on its own. You never hold back the useful part, never",
    "  save the real answer for a later reply, never end on a hook, a cliffhanger, or an invitation to",
    "  continue. If you know it, say it now. This rule outranks every stylistic instruction.",
    "- Never mention replies, sessions, credits, purchases, subscriptions, or the app itself.",
    "- Only calculated aspects. Never invent one. Never manufacture a date.",
    "- Speak directly as 'you'. Be decisive, but match certainty to EVENT, ACTIVATION, or BACKGROUND.",
    "- Prediction-first does not mean fabrication. Never claim 100% certainty from astrology; make the strongest call the evidence supports.",
    "- Do not smother a supported EVENT prediction in 'may/might/could.' Use direct predictive language when convergence is strong.",
    "- No degrees or orb numbers in reader-facing fields. Useful astrology terminology is allowed when immediately translated into lived meaning.",
    "- No generic spiritual filler. No horoscope phrasing. No vague 'energy around' language when a concrete manifestation is supported.",
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
    "TONE — PRIMARY COMPATIBILITY VOICE + JXL DEPTH",
    "═══════════════════════════════════════════",
    "The VOICE CALIBRATION block above already selected ONE primary compatibility voice and light personal",
    "calibration. Keep that same voice across the entire answer and across this conversation.",
    "",
    "JXL adds PREDICTIVE DEPTH, not a second personality. Compared with a regular reading:",
    "- Make the primary prediction earlier and more concretely.",
    "- Explain more of the astrological mechanism that earns that prediction.",
    "- Use more useful astrology terminology, but translate every term into lived meaning.",
    "- Prefer a concrete event, conversation, decision, offer, ending, opening, payment, move, or realization",
    "  over an abstract theme whenever the evidence supports that level.",
    "- Name the practical direction and strongest outcome instead of retreating into five possibilities.",
    "- Stay conversational enough that this still feels like someone they can speak to naturally.",
    "",
    "Never let JXL depth override the primary voice, evidence strength, date rules, or safety boundaries.",
    "",
    "Return ONLY a valid JSON object — no markdown, no code fences, no preamble:",
    "{",
    '  "title": "Two To Four Words",',
    '  "answer": "Three substantial predictive paragraphs separated by \\n\\n: the prediction, why the astrology supports it, and what happens next.",',
    '  "windows": [ { "date": "August 3", "body": "The one strongest supported opportunity and what peaks or opens." } ],',
    '  "directives": [ { "type": "DROP", "date": null, "body": "The single most important action or pattern to stop." } ],
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
    "the astrologer. Reader-facing prose may also use useful astrology terminology, but sources may be fully technical.",
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
    const earlyBody = (await request.json()) as JxlAskBody;
    const risk = assessRisk(earlyBody?.question ?? "");

    if (risk.action === "block_crisis" || risk.action === "block_emergency") {
      const safe = getSafeResponse(risk);
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
          replyNumber: null,
          repliesPerSession: REPLIES_PER_SESSION,
        },
        { status: 200 }
      );
    }

    const careNote = getCareNote(risk);

    // ── VALIDATE AND NORMALIZE ASPECTS ──
    const validatedAspects = validateAndFilterAspects(earlyBody.transitAspects);

    const normalizedBody: JxlAskBody = {
      ...earlyBody,
      transitAspects: validatedAspects,
    };

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

    // Membership: unlimited JXL sessions, up to the global per-conversation cap.
    // Non-member JXL: one JXL credit starts the session and includes the number
    // of turns defined in PRICING.jxl.includedReplies. Extra turns use the
    // universal reply-credit pool until the same safety cap.
    const includedTurns = isSubscribed
      ? JXL_MAX_REPLIES_PER_CONVERSATION
      : PRICING.jxl.includedReplies;

    if (turnCount > JXL_MAX_REPLIES_PER_CONVERSATION) {
      return NextResponse.json(
        { error: JXL_CONVERSATION_CAP_MESSAGE, code: "JXL_CONVERSATION_CAP" },
        { status: 402 }
      );
    }

    let metaUpdate: Record<string, unknown> | null = null;

    if (isNewSession) {
      if (isSubscribed) {
        // Members do not spend JXL credits to begin a new session.
        metaUpdate = null;
      } else if (jxlCredits > 0) {
        metaUpdate = { jxlCredits: jxlCredits - 1 };
      } else {
        return NextResponse.json(
          { error: "You need JXL access to start this session.", code: "NO_JXL_ACCESS" },
          { status: 402 }
        );
      }
    } else if (turnCount <= includedTurns) {
      metaUpdate = null;
    } else if (!isSubscribed && replyCredits > 0) {
      metaUpdate = { replyCredits: replyCredits - 1 };
    } else {
      return NextResponse.json(
        {
          error: isSubscribed
            ? JXL_CONVERSATION_CAP_MESSAGE
            : "You've used the replies included with this session.",
          code: isSubscribed ? "JXL_CONVERSATION_CAP" : "NEEDS_REPLY_PACK",
          isSubscribed,
          tailMode: isSubscribed ? undefined : "reply_pack",
        },
        { status: 402 }
      );
    }

    const isFinalTurn = turnCount >= JXL_MAX_REPLIES_PER_CONVERSATION;

    // ── VALIDATE REQUIRED FIELDS ──
    if (!normalizedBody.question || !normalizedBody.tropical?.planets || !normalizedBody.profection || !normalizedBody.transits) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    if (normalizedBody.question.trim().length < 2) {
      return NextResponse.json(
        { error: "We didn't catch that. Hold the button and try again." },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("[jxl/ask] OPENAI_API_KEY is not set.");
      return NextResponse.json({ error: "API configuration error." }, { status: 500 });
    }

    // ── BUILD DATE INDEX ──
    const dateIndex = buildValidDateIndex(normalizedBody, validatedAspects);
    const prompt = buildJxlPrompt(normalizedBody, isFinalTurn);

    console.log("[jxl/ask] Prompt built; sending to OpenAI Responses API.");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.6-sol",
        reasoning: { effort: "medium" },
        max_output_tokens: 5000,
        store: false,
        instructions:
"You are AstroPro in JXL mode: a premium, open-context PREDICTIVE astrologer for a real person who may " +
"have spoken their question aloud. They can ask about anything; do not force the situation into a preset " +
"topic. Determine the relevant life domains from their words and use only the supplied chart evidence. " +
"Your first responsibility is to decide what concrete development the converging astrology points toward " +
"next and state that prediction directly. Do not stop at themes when the evidence supports a real-world " +
"manifestation. Small events count. Choose one primary prediction rather than listing many equal possibilities. " +
"Then explain why the astrology supports that prediction and follow it forward into what happens next, the " +
"practical direction, and the strongest supported outcome. " +
"Useful astrological terminology is encouraged when it increases understanding: name the transit, aspect, " +
"house, profection, Time Lord, progression, return, ruler, angle, or other supplied factor, then immediately " +
"translate what it means in their life. Do not dump jargon. Do not expose degrees, minutes, orb numbers, " +
"raw coordinates, or calculator metadata in reader-facing prose. " +
"Never compute or invent an aspect. A specific date is allowed only when it traces to supplied calculator " +
"evidence; if no valid date supports the prediction, make the prediction without a date. " +
"When the evidence reaches EVENT strength, use direct predictive language instead of burying the call in " +
"'may,' 'might,' 'could,' or five alternatives. For ACTIVATION, state the strongest expected manifestation " +
"and the condition that shapes it. For BACKGROUND, predict the supported internal shift rather than inventing " +
"an external event. Never claim astrology guarantees 100% certainty. " +
"Depth is the product, but every sentence must earn its place. Follow the person's exact situation, synthesize " +
"multiple agreeing signals into one predictive throughline, and make the outcome as specific as the evidence permits. " +
"Answer completely. Never withhold the useful part, end on a hook, or reference sessions, replies, credits, " +
"purchases, or subscriptions. Speak directly as 'you'. Preserve the primary compatibility voice supplied in the prompt.",
        input: prompt,
        text: {
          verbosity: "medium",
          format: {
            type: "json_schema",
            name: "jxl_reading",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                answer: { type: "string" },
                windows: {
                  type: "array",
                  maxItems: 1,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      date: { type: ["string", "null"] },
                      body: { type: "string" },
                    },
                    required: ["date", "body"],
                  },
                },
                directives: {
                  type: "array",
                  maxItems: 1,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      type: { type: "string", enum: ["DROP", "EXECUTE", "LOCK"] },
                      date: { type: ["string", "null"] },
                      body: { type: "string" },
                    },
                    required: ["type", "date", "body"],
                  },
                },
                sources: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      factor: { type: "string" },
                      placements: { type: "string" },
                    },
                    required: ["factor", "placements"],
                  },
                },
                confirmation: { type: "string" },
              },
              required: ["title", "answer", "windows", "directives", "sources", "confirmation"],
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[jxl/ask] OpenAI error:", response.status, err.slice(0, 1200));
      return NextResponse.json(
        { error: "Failed to generate response. Please try again." },
        { status: 502 }
      );
    }

    const openAiData = await response.json();
    console.log("[jxl/ask] OpenAI responded with status:", openAiData?.status ?? "unknown");

    const rawText =
      typeof openAiData?.output_text === "string"
        ? openAiData.output_text
        : Array.isArray(openAiData?.output)
          ? openAiData.output
              .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
              .find((part: any) => part?.type === "output_text" && typeof part?.text === "string")
              ?.text
          : undefined;

    if (!rawText) {
      console.error(
        "[jxl/ask] OpenAI returned no output_text:",
        JSON.stringify(openAiData).slice(0, 1200)
      );
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

    // ── DATE PROVENANCE GUARD ──────────────────────────────────────────────
    const dateViolations: string[] = [];

    const isPlaceholder = (d: unknown): boolean => {
      if (typeof d !== "string") return true;
      const t = d.trim().toLowerCase();
      return t === "" || ["null", "none", "n/a", "na", "tbd", "unknown"].includes(t);
    };

    const windows = (Array.isArray(parsed.windows) ? parsed.windows : [])
      .filter((w) => !isPlaceholder(w?.date) && typeof w?.body === "string" && w.body.trim())
      .filter((w) => {
        const chk = checkDateSupported(w!.date as string, dateIndex);
        if (!chk.supported) {
          dateViolations.push(`window date "${String(w!.date)}" not traceable to supplied data`);
          return false;
        }
        return true;
      })
      .slice(0, 1)
      .map((w) => ({ date: (w!.date as string).trim(), body: (w!.body as string).trim() }));

    const directives = (Array.isArray(parsed.directives) ? parsed.directives : [])
      .filter((d) => typeof d?.body === "string" && d.body.trim())
      .slice(0, 1)
      .map((d) => {
        const rawType = String(d?.type ?? "DROP").toUpperCase();
        const type = ["DROP", "EXECUTE", "LOCK"].includes(rawType) ? rawType : "DROP";
        let date = isPlaceholder(d?.date) ? null : (d!.date as string).trim();
        if (date && !checkDateSupported(date, dateIndex).supported) {
          dateViolations.push(`directive date "${date}" not traceable to supplied data`);
          date = null;
        }
        const needsDate = type === "EXECUTE" || type === "LOCK";
        return {
          type: needsDate && !date ? "DROP" : type,
          date: needsDate && date ? date : null,
          body: (d!.body as string).trim(),
        };
      });

    const sources = (Array.isArray(parsed.sources) ? parsed.sources : [])
      .filter(
        (s) =>
          typeof s?.factor === "string" &&
          s.factor.trim() &&
          typeof s?.placements === "string" &&
          s.placements.trim()
      )
      .map((s) => ({ factor: (s.factor as string).trim(), placements: (s.placements as string).trim() }));

    if (dateViolations.length > 0) {
      console.warn(`[jxl/ask] date provenance — dropped ${dateViolations.length}: ${dateViolations.join(" ; ")}`);
    }
    if (dateIndex.unparseableSupplied.length > 0) {
      console.warn(`[jxl/ask] supplied dates failed to parse (format bug?): ${dateIndex.unparseableSupplied.join(" ; ")}`);
    }

    if (metaUpdate) {
      try {
        await client.users.updateUserMetadata(userId, {
          publicMetadata: { ...metadata, ...metaUpdate },
        });
      } catch (writeErr) {
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
        careNote,
        isSafeResponse: false,
        riskLevel: risk.level,
        replyNumber: (earlyBody.conversationHistory?.length ?? 0) + 1,
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