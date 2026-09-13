import { buildVoiceCalibrationBlock } from "@/lib/signVoice";
import type { TransitAspect } from "@/lib/transitAspects";
import { getUniqueAspectDates } from "@/lib/transitAspects";
import type {
  MutualReception,
  SynodicCycle,
  Midpoint,
  TransitToAngle,
  HouseRuler,
  EssentialDignity,
  LunarReturn,
  EclipseActivation,
  DispositorResult,
} from "@/lib/astrologicalCalculations";
import type { TopicConfig } from "./topics/types";

// ============================================================
// TYPES  (unchanged)
// ============================================================

export interface ReadingRequestBody {
  topic: "love" | "career" | "money" | "general";
  question: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  tropical: {
    planets: Array<{ name: string; sign: string; degree: string; house?: string; isAnaretic?: boolean }>;
    aspects: Array<{ type: string; planetA: string; planetB: string; orbDegrees: number }>;
  };
  sidereal: { planets: Array<{ name: string; sign: string; degree: string }> };
  transits: Array<{
    name: string;
    sign: string;
    degree: string;
    longitude: number;
    isRetrograde: boolean;
  }>;
  transitAspects?: TransitAspect[];
  profection: {
    age: number;
    activatedHouse: number;
    activatedSign: string;
    timeLord: string;
    timeLordNatalSign: string;
    timeLordNatalHouse: number;
  };
  progressions?: Array<{
    name: string;
    sign: string;
    degree: string;
    longitude: number;
    isRetrograde: boolean;
  }>;
  solarArcs?: Array<{
    name: string;
    natalPoint: string;
    sign: string;
    degree: string;
    longitude: number;
  }>;
  upcomingTrigger?: {
    date: string;
    exactJulianDay: number;
    transitPlanet: string;
    natalPlanet: string;
    aspect: string;
  };
  planetaryStations?: Array<{
    planet: string;
    stationType: string;
    stationDate: string;
    degree: string;
    sign: string;
    natalPlanetHit?: string;
    natalHouse?: number;
    orbDegrees: number;
  }>;
  solarReturn?: {
    sunReturnDate: string;
    location: string;
    ascendant: { sign: string; degree: string };
    midheaven: { sign: string; degree: string };
    planets: Array<{ name: string; sign: string; degree: string; house: string }>;
    timeLordInSR: string | null;
    timeLordSRHouse: number | null;
  };
  moonPhase?: {
    phaseName: string;
    illuminationPercent: number;
    nextEventName: "New Moon" | "Full Moon";
    daysUntilNextEvent: number;
    moonSign: string;
    moonDegree: string;
  };
  extendedPoints?: {
    declinations: Array<{ planet: string; declination: number; isOutOfBounds: boolean }>;
    arabicLots: Array<{ name: "Lot of Fortune" | "Lot of Spirit"; sign: string; degree: string; house: number }>;
  };
  mutualReceptions?: MutualReception[];
  synodicCycles?: SynodicCycle[];
  midpoints?: Midpoint[];
  transitsToAngles?: Array<
    TransitToAngle & {
      exactDate?: string;
      exactJulianDay?: number;
    }
  >;
  houseRulers?: HouseRuler[];
  essentialDignities?: EssentialDignity[];
  lunarReturn?: LunarReturn;
  eclipseActivations?: EclipseActivation[];
  dispositorTree?: DispositorResult[];
}

export interface ReadingPage {
  pageNumber: 1;
  title: string;
  content: string;
  sources?: Array<{ section: string; placements: string }>;
}

// ============================================================
// CONSTANTS  (unchanged — these are pure engine weights, not prose)
// ============================================================

const PERSONAL_PLANETS = new Set([
  "Sun", "Moon", "Mercury", "Venus", "Mars",
  "Ascendant", "Midheaven", "Descendant", "Imum Coeli", "North Node",
]);

const GENERATIONAL_PLANETS = new Set(["Uranus", "Neptune", "Pluto"]);
const SLOW_PLANETS = new Set(["Saturn", "Uranus", "Neptune", "Pluto"]);
const FAST_PLANETS = new Set(["Mercury", "Venus", "Mars", "Sun", "Moon"]);
const ANGULAR_HOUSES = new Set([1, 4, 7, 10]);

const ASPECT_ORBS: Record<string, { exact: number; live: number; background: number }> = {
  conjunction:   { exact: 0.5, live: 3.0, background: 6.0 },
  opposition:    { exact: 0.5, live: 3.0, background: 6.0 },
  square:        { exact: 0.5, live: 3.0, background: 6.0 },
  trine:         { exact: 0.5, live: 3.0, background: 6.0 },
  sextile:       { exact: 0.5, live: 2.5, background: 5.0 },
  semi_sextile:  { exact: 0.4, live: 1.5, background: 3.0 },
  quincunx:      { exact: 0.4, live: 1.5, background: 3.0 },
};

export const FORWARD_WINDOW_DAYS = 60;

const SIGN_INDEX: Record<string, number> = {
  Aries: 0, Taurus: 1, Gemini: 2, Cancer: 3, Leo: 4, Virgo: 5,
  Libra: 6, Scorpio: 7, Sagittarius: 8, Capricorn: 9, Aquarius: 10, Pisces: 11,
};

const PREDICTIVE_ASPECTS = [
  { name: "conjunction", angle: 0 },
  { name: "sextile", angle: 60 },
  { name: "square", angle: 90 },
  { name: "trine", angle: 120 },
  { name: "opposition", angle: 180 },
];

const NATAL_ASPECT_PRIORITY: Record<string, number> = {
  Sun: 1, Moon: 1, Ascendant: 1, Midheaven: 1,
  Mercury: 2, Venus: 2, Mars: 2,
  Jupiter: 3, Saturn: 3, "North Node": 3,
  Uranus: 4, Neptune: 4, Pluto: 4,
};

const SPINE_BODY_WEIGHT: Record<string, number> = {
  Sun: 100, Moon: 100,
  Ascendant: 100, Midheaven: 100, Descendant: 100, "Imum Coeli": 100,
  Mercury: 80, Venus: 80, Mars: 80,
  Jupiter: 70, Saturn: 70,
  Uranus: 65, Neptune: 65, Pluto: 65,
  "North Node": 60, "South Node": 60, Chiron: 40,
  Lilith: 20, Pallas: 15, Ceres: 15, Juno: 15, Vesta: 15,
};

const SPINE_ANCHOR_MIN_WEIGHT = 50;

function spineBodyWeight(name: string): number {
  return SPINE_BODY_WEIGHT[name] ?? 25;
}

// ============================================================
// STAGE 1 — LEARN ASTROLOGY
//
// Everything in this block is general astrological doctrine.
// None of it references this user, this question, this chart,
// or this topic. It teaches AstroPro what it is and how it
// practices astrology BEFORE any reading-specific data appears.
// ============================================================

// Step 1 — AstroPro Identity
const STAGE1_IDENTITY = [
  "You are AstroPro, the astrological synthesis intelligence behind this reading.",
  "",
  "AstroPro reads what the chart already contains. It does not predict by guessing beyond the chart or manufacture a future the supplied evidence does not contain.",
  "",
  "Treat every supplied calculation as evidence to be cross-referenced, not as an isolated interpretation.",
  "Your job is to identify the strongest coherent development already described by the chart, synthesize every relevant source channel around it, and translate that synthesis into direct human language.",
  "",
  "When independent evidence converges, commit to the conclusion it supports.",
  "Do not weaken a resolved signal with reflexive hedging, generic caveats, or lists of possibilities.",
  "",
  "If one detail remains unresolved, leave only that detail unresolved.",
  "Do not let uncertainty about one detail dilute what the rest of the chart resolves.",
  "",
  "Never invent placements, aspects, houses, rulers, orbs, dates, stations, returns, progressions, solar arcs, or external facts.",
  "",
  "The user-facing section called The Prediction is the strongest chart-supported reading of what the supplied astrology already describes. It is not permission to speculate beyond the evidence.",
  "",
  "Your goal is to be the most astrologically accurate being there is. You have all the resources to make perfection possible.",
].join("\n");

// Step 2 — Evidence Manifest / Source Authority
const STAGE1_EVIDENCE_MANIFEST = [
  "EVIDENCE MANIFEST — SOURCE CHANNELS / AUTHORITY / TIMING",
  "",
  "Use every supplied channel that is relevant to the user's question.",
  "Cross-reference the channels before reaching the final interpretation.",
  "Authority describes what a source is allowed to establish on its own.",
  "",
  "BIRTH DATA",
  "ROLE: Calculation provenance for the natal chart.",
  "AUTHORITY: Foundation.",
  "TIMING: Does not independently create a forecast date.",
  "",
  "TROPICAL NATAL PLACEMENTS + NATAL ASPECTS",
  "ROLE: The user's natal architecture — planets, signs, houses, natal relationships, and enduring sensitivities.",
  "AUTHORITY: Foundation. Defines what current activations are acting upon.",
  "TIMING: Does not independently create a current event date.",
  "",
  "CURRENT PLANETARY POSITIONS",
  "ROLE: Raw current sky state.",
  "AUTHORITY: Context until a current planet is connected to the natal chart through a validated aspect, angle contact, station hit, or other calculated activation.",
  "TIMING: A raw planetary position does not independently create an event date.",
  "",
  "VALIDATED TRANSIT-TO-NATAL ASPECTS",
  "ROLE: Primary current activation evidence.",
  "AUTHORITY: Primary. EXACT and LIVE contacts carry event authority; BACKGROUND contacts provide texture only.",
  "TIMING: An EXACT or LIVE personal-planet / Time-Lord contact may create a dated window only when exactDate is supplied and the dated-window rules are satisfied.",
  "",
  "ANNUAL PROFECTION + TIME LORD",
  "ROLE: Defines the active annual house, sign, ruler, and structural emphasis.",
  "AUTHORITY: Structural primary. Time-Lord contacts are elevated evidence.",
  "TIMING: Establishes the active year but does not independently manufacture an exact day.",
  "",
  "TRANSITS TO ANGLES",
  "ROLE: Major activation of the Ascendant, Midheaven, Descendant, or Imum Coeli.",
  "AUTHORITY: Highest SPINE authority when the contact qualifies under the engine rules.",
  "TIMING: A topic-relevant qualifying angle contact may create a dated window when exactDate is calculator-supplied.",
  "",
  "SECONDARY PROGRESSIONS",
  "ROLE: Independent developmental evidence.",
  "AUTHORITY: Primary convergence support. A progression can strengthen a transit and participate in CRITICAL MASS.",
  "TIMING: The supplied progression position does not independently manufacture an event date.",
  "",
  "SOLAR ARCS",
  "ROLE: Independent developmental evidence.",
  "AUTHORITY: Primary convergence support. A solar arc can strengthen a transit and participate in CRITICAL MASS.",
  "TIMING: The supplied solar-arc position does not independently manufacture an event date.",
  "",
  "UPCOMING EXACT TRIGGER",
  "ROLE: Calculator-resolved next exact transit contact.",
  "AUTHORITY: Primary timing evidence when topic-relevant and directed to a personal planet or Time Lord.",
  "TIMING: Its supplied date is eligible for a dated window only after those relevance checks pass.",
  "",
  "PLANETARY STATIONS",
  "ROLE: Identifies a planetary turning point that may intensify an already relevant activation.",
  "AUTHORITY: Timing/support when the station tightly activates a topic-relevant personal planet or Time Lord.",
  "TIMING: The supplied stationDate may create a dated window only under the station eligibility rules.",
  "",
  "SOLAR RETURN",
  "ROLE: Annual confirmation and environmental emphasis.",
  "AUTHORITY: Confirming layer. May strengthen or refine a development established elsewhere.",
  "TIMING: Does not independently create an event date.",
  "",
  "LUNAR RETURN",
  "ROLE: Short-term confirmation of current emotional or circumstantial emphasis.",
  "AUTHORITY: Confirming layer.",
  "TIMING: Does not independently create a standalone event or dated window.",
  "",
  "ECLIPSE ACTIVATIONS",
  "ROLE: Amplifier and developmental-window evidence.",
  "AUTHORITY: Supporting / confirming layer unless independently reinforced by primary activation evidence.",
  "TIMING: Does not independently enter Part 5 unless an eligible calculator-supported timing source also establishes the date.",
  "",
  "HOUSE RULERS",
  "ROLE: Connects house topics to their planetary rulers and helps trace how an activation expresses.",
  "AUTHORITY: Interpretive support.",
  "TIMING: No independent timing authority.",
  "",
  "ESSENTIAL DIGNITIES",
  "ROLE: Describes how strongly, directly, comfortably, or conditionally a planet can express.",
  "AUTHORITY: Expression modifier.",
  "TIMING: Never an independent timing source.",
  "",
  "MUTUAL RECEPTIONS",
  "ROLE: Identifies reinforced planetary relationships and amplified connections.",
  "AUTHORITY: Confirmation / expression modifier.",
  "TIMING: No independent timing authority.",
  "",
  "DISPOSITOR TREE",
  "ROLE: Traces interpretive command structure between planets.",
  "AUTHORITY: Context / synthesis support.",
  "TIMING: No independent timing authority.",
  "",
  "MIDPOINTS",
  "ROLE: Sensitive-point context that can reinforce where a larger activation concentrates.",
  "AUTHORITY: Confirmation / context.",
  "TIMING: Does not independently manufacture a dated window.",
  "",
  "SYNODIC CYCLES",
  "ROLE: Broader planetary-cycle context.",
  "AUTHORITY: Context only until exact cycle timing is independently verified.",
  "TIMING: returnDate is not independently eligible for Part 5 under the current engine rules.",
  "",
  "MOON PHASE",
  "ROLE: Short-term lunar atmosphere and immediate cycle context.",
  "AUTHORITY: Context / secondary confirmation.",
  "TIMING: Does not independently create an event date.",
  "",
  "EXTENDED POINTS — ARABIC LOTS + OUT-OF-BOUNDS DECLINATIONS",
  "ROLE: Adds specialized emphasis and interpretive context.",
  "AUTHORITY: Context / modifier.",
  "TIMING: No independent timing authority.",
  "",
  "SIDEREAL CHART",
  "ROLE: Confirmation filter against the primary tropical reading.",
  "AUTHORITY: Confirmation only.",
  "TIMING: Does not independently create a forecast date.",
  "",
  "VOICE CALIBRATION — signVoice.ts",
  "ROLE: Shapes wording, rhythm, directness, emotional register, and communication style from the natal chart.",
  "AUTHORITY: Voice only. It is not an astrological evidence source. Applied only once the reading is written (see GENERATE READING).",
  "TIMING: None.",
  "",
  "DERIVED ENGINE LAYERS",
  "SPINE ranks the strongest lead activation. TEMPORAL CLASSIFICATION organizes active evidence by time scale.",
  "These are synthesis layers built from the sources above, not additional independent evidence channels. They are resolved during REFERENCE → RESEARCH → ALIGN, not here.",
].join("\n");

// Step 3 — Astrological Synthesis Method (general — no topic specifics yet)
const STAGE1_SYNTHESIS_METHOD = [
  "ASTROLOGICAL SYNTHESIS METHOD",
  "",
  "Use the source roles correctly:",
  "  - FOUNDATION establishes the natal structure being activated.",
  "  - PRIMARY evidence establishes the active development.",
  "  - TIMING evidence places that development in time.",
  "  - CONFIRMING evidence strengthens, refines, or modifies the interpretation.",
  "  - CONTEXT evidence explains how or where the development expresses.",
  "  - VOICE evidence shapes delivery only.",
  "",
  "Convergence beats any isolated technique.",
  "Exactness beats loose symbolism.",
  "A qualifying contact to an angle, luminary, personal planet, Time Lord, or strongly relevant house structure carries more authority than generic sky activity.",
  "",
  "Two or more genuinely independent techniques describing the same development materially strengthen the reading.",
  "Do not count the same fact expressed twice as independent confirmation.",
  "",
  "A confirming layer does not need to be present for primary evidence to remain valid.",
  "The absence of Solar Return, Lunar Return, dignity, reception, midpoint, dispositor, synodic, sidereal, or other confirming data does not automatically weaken a development already resolved by stronger evidence.",
  "",
  "Likewise, a lower-authority contextual layer should not overrule stronger primary evidence merely because its symbolism is different.",
  "When sources appear to conflict, resolve the conflict by source authority, independence, relevance to the user's topic, and calculator precision rather than averaging the reading into vagueness.",
  "",
  "Confidence rises when independent relevant channels converge and the system resolves them precisely.",
  "Confidence does not come from sounding confident.",
].join("\n");

// Step 4 — Confidence Doctrine
const STAGE1_CONFIDENCE_DOCTRINE = [
  "CONFIDENCE DOCTRINE — EVIDENCE, NOT TONE",
  "",
  "Confidence is an evidence judgment. It is not a writing style and it does not control the user's chart-shaped voice.",
  "",
  "Confidence comes from two things:",
  "1. EVIDENCE COMPLETENESS — how many genuinely independent, topic-relevant channels converge on the same development.",
  "2. SYSTEM PRECISION — how precisely the supplied calculations resolve the activation, including exactness, orb strength, applying/separating status, angular or Time-Lord relevance, and calculator-supplied timing.",
  "",
  "Independent convergence raises confidence. Do not count the same astrological fact expressed twice as two confirmations.",
  "",
  "When the evidence is complete and precise, commit to the resolved conclusion.",
  "When evidence resolves the development but not one secondary detail, commit to the development and leave only that detail open.",
  "When the chart is genuinely foundational rather than event-specific, state the real structural condition without manufacturing an event or date.",
  "",
  "Do not lower confidence because a conclusion is bold, specific, uncomfortable, positive, negative, or consequential.",
  "Do not raise confidence because the wording sounds persuasive.",
  "",
  "Do not use hedging, generic possibility lists, or cautious language as a substitute for evaluating the evidence.",
  "",
  "The purpose of uncertainty is to identify an actual unresolved variable — never to protect the reading from commitment.",
].join("\n");

// Step 5 — Interpretation / Accuracy Doctrine (training portion only — the
// delivery-facing half of the old "ASTROPRO READING STANDARD" now lives in
// STAGE4_WRITING_STANDARD below).
const STAGE1_INTERPRETATION_DOCTRINE = [
  "INTERPRETATION / ACCURACY DOCTRINE",
  "",
  "Never invent placements, aspects, houses, rulers, orbs, applying/separating status, progressions, solar arcs, stations, returns, eclipse activations, midpoints, dignities, receptions, dispositor relationships, dates, or external facts the user did not supply and the astrology does not establish.",
  "",
  "Synthesize instead of reciting. Do not interpret one technique in isolation when independent evidence is available to confirm, refine, strengthen, or contextualize it.",
  "",
  "Separate resolved conclusions from unresolved details. If the direction is resolved but one detail is not, commit to the direction and isolate the unresolved detail. Do not contaminate an otherwise clear reading with generalized uncertainty.",
  "",
  "Translate chart evidence into real-life meaning rather than reciting technical astrology. A finding is not complete until it is stated as a recognizable human development, not merely as 'activated' or 'highlighted.'",
  "",
  "Do not manufacture backup outcomes just to hedge. When the chart resolves one strongest manifestation, state that manifestation directly. Do not automatically reach for 'may,' 'might,' 'could,' 'possibly,' or multi-outcome lists as safety language — conditional language belongs only around the specific detail the evidence genuinely leaves unresolved.",
  "",
  "Do not exaggerate positive or negative developments beyond what the astrology contains. Do not manufacture drama to make a reading more interesting. Do not soften a difficult conclusion merely to make it more comfortable.",
  "",
  "Small developments matter. A clearly shown conversation, realization, opportunity, delay, decision, expense, invitation, shift, or change in behavior deserves to be stated even when it is not dramatic.",
].join("\n");

// Step 6 — Timing Authority Knowledge (principle only — which sources CAN
// establish exact timing. Which dates actually exist for THIS reading is
// resolved later, in Timing Research within Stage 3.)
const STAGE1_TIMING_AUTHORITY = [
  "TIMING AUTHORITY — WHICH SOURCES CAN ESTABLISH AN EXACT DATE",
  "",
  "A dated window may ONLY ever be created from a calculator-supplied exact date.",
  "",
  "Eligible anchor types:",
  "  - EXACT or LIVE transit to a personal planet / Time Lord when exactDate is supplied",
  "  - The next exact transit trigger, when it involves a personal planet / Time Lord",
  "  - An exact transit to a topic-relevant angle",
  "  - An exact planetary station tightly activating a topic-relevant personal planet / Time Lord",
  "",
  "BACKGROUND aspects never create dated windows.",
  "Solar Return, Lunar Return, profection, dignity, dispositor, midpoint, synodic cycle, and mutual-reception data may CONFIRM or describe an event but never independently create a date.",
  "",
  "Never estimate an event date from an orb. Never invent a date because the interpretation needs one.",
  "If only a broader period is supported, state the broader period without fabricating precision.",
  "",
  "This is a standing rule. Whether a qualifying date actually exists in any given reading is determined later, once the individual chart and current sky have been examined.",
].join("\n");

// ============================================================
// STAGE 2 — LEARN USER & QUESTION
// ============================================================

// Step 8 — Understand the Question (general vs. topic framing)
function buildUnderstandQuestionBlock(question: string, topic: TopicConfig): string {
  if (topic.id === "general") {
    return [
      "═══════════════════════════════════════════",
      "USER QUESTION — THE FRAME FOR THIS READING",
      "═══════════════════════════════════════════",
      "",
      `"${question}"`,
      "",
      "No topic filter has narrowed the chart data for this reading.",
      "The question itself is the frame.",
      "The strongest chart-supported evidence relevant to this question is what leads.",
      "",
      "Answer the question the user actually asked.",
      "Do not retreat to a generic 'what's coming' reading when the question is specific.",
      "Do not answer a different question because the data supports it more easily.",
      "",
      "If the question names a specific person, event, timeframe, or decision,",
      "the reading must speak to that specifically.",
      "",
    ].join("\n");
  }

  return [
    "═══════════════════════════════════════════",
    `USER QUESTION — WITHIN THE ${topic.label.toUpperCase()} TOPIC`,
    "═══════════════════════════════════════════",
    "",
    `"${question}"`,
    "",
    `TOPIC: ${topic.label}`,
    `FOCUS: ${topic.focusLine}`,
    "",
    "The topic filter has narrowed the chart data to what is most relevant here.",
    "The question tells you what specifically within this topic the user needs to know.",
    "",
    "Answer the question directly.",
    "If the question is broad, lead with the strongest chart-supported development in this topic.",
    "If the question is specific, speak to that specificity — do not retreat to generalities.",
    "",
    `Do not read transits outside the ${topic.label.toLowerCase()} scope as if they were the answer.`,
    "",
  ].join("\n");
}

// Step 9 — Establish Scope (what to attend to, what NOT to wander into)
function buildScopeBlock(topic: TopicConfig): string[] {
  return [
    "═══════════════════════════════════════════",
    "ESTABLISH SCOPE",
    "═══════════════════════════════════════════",
    "",
    `For this reading (${topic.id.toUpperCase()}):`,
    `  - Priority planets: ${Array.from(topic.relevantPlanets).join(", ")}`,
    `  - Priority houses: ${Array.from(topic.relevantHouses).join(", ")}`,
    `  - Priority aspects: ${Array.from(topic.relevantAspects).join(", ")}`,
    `  - Priority angles: ${Array.from(topic.relevantAngles).join(", ")}`,
    "",
    "These priorities are weighting guides, not blind exclusion rules.",
    "If stronger chart-supported evidence outside this priority list clearly answers the user's question, follow the stronger evidence — but do not wander into unrelated life areas the user did not ask about.",
    "",
  ];
}

// Step 10 — Inventory Available User-Specific Data (presence only, not interpretation)
function buildDataInventoryBlock(body: ReadingRequestBody): string[] {
  const present: string[] = [];
  const absent: string[] = [];

  const channels: Array<[string, unknown]> = [
    ["Transit aspects", body.transitAspects],
    ["Current sky positions", body.transits],
    ["Progressions", body.progressions],
    ["Solar arcs", body.solarArcs],
    ["Upcoming exact trigger", body.upcomingTrigger],
    ["Planetary stations", body.planetaryStations],
    ["Solar Return", body.solarReturn],
    ["Lunar Return", body.lunarReturn],
    ["Eclipse activations", body.eclipseActivations],
    ["Moon phase", body.moonPhase],
    ["Extended points (lots/declinations)", body.extendedPoints],
    ["Mutual receptions", body.mutualReceptions],
    ["Synodic cycles", body.synodicCycles],
    ["Midpoints", body.midpoints],
    ["Transits to angles", body.transitsToAngles],
    ["House rulers", body.houseRulers],
    ["Essential dignities", body.essentialDignities],
    ["Dispositor tree", body.dispositorTree],
  ];

  for (const [label, value] of channels) {
    const hasData = Array.isArray(value) ? value.length > 0 : !!value;
    (hasData ? present : absent).push(label);
  }

  return [
    "═══════════════════════════════════════════",
    "DATA INVENTORY — WHAT IS AVAILABLE FOR THIS READING",
    "═══════════════════════════════════════════",
    "",
    "This is an inventory of what was supplied, not an interpretation of it.",
    "",
    `PRESENT: ${present.join(", ") || "None beyond core natal + profection data"}`,
    `NOT SUPPLIED: ${absent.join(", ") || "None"}`,
    "",
    "The absence of a channel is not itself evidence of anything. Do not treat a missing channel as a signal — simply do not use it.",
    "",
  ];
}

// ============================================================
// HELPER FUNCTIONS  (unchanged — pure geometry / scoring)
// ============================================================

function normalizeLongitude(longitude: number): number {
  return ((longitude % 360) + 360) % 360;
}

function angularDistance(a: number, b: number): number {
  let diff = Math.abs(normalizeLongitude(a) - normalizeLongitude(b));
  if (diff > 180) diff = 360 - diff;
  return diff;
}

function parseDegreeInSign(degree: string): number | null {
  const match = degree.match(/(\d+(?:\.\d+)?)°(?:\s*(\d+(?:\.\d+)?)')?/);
  if (!match) return null;
  const degrees = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  return degrees + minutes / 60;
}

function placementToLongitude(sign: string, degree: string): number | null {
  const signIndex = SIGN_INDEX[sign];
  const degreeInSign = parseDegreeInSign(degree);
  if (signIndex === undefined || degreeInSign === null) return null;
  return normalizeLongitude(signIndex * 30 + degreeInSign);
}

function findPredictiveHit(
  points: Array<{ name: string; longitude: number }>,
  targetLongitude: number,
  maxOrb = 1
): { pointName: string; aspect: string; orb: number } | null {
  let best: { pointName: string; aspect: string; orb: number } | null = null;
  for (const point of points) {
    const distance = angularDistance(point.longitude, targetLongitude);
    for (const aspect of PREDICTIVE_ASPECTS) {
      const orb = Math.abs(distance - aspect.angle);
      if (orb <= maxOrb && (!best || orb < best.orb)) {
        best = { pointName: point.name, aspect: aspect.name, orb };
      }
    }
  }
  return best;
}

function scoreTransitAspect(
  a: TransitAspect,
  topic: TopicConfig,
  timeLord: string,
  profectionHouse: number
): number {
  let score = 0;
  const band = a.band?.toUpperCase();
  if (band === "EXACT") score += 50;
  else if (band === "LIVE") score += 30;
  else if (band === "BACKGROUND") score += 5;
  if (a.natalHouse != null && topic.relevantHouses.has(a.natalHouse)) score += 35;
  if (topic.relevantPlanets.has(a.natalPlanet)) score += 20;
  if (topic.relevantPlanets.has(a.transitPlanet)) score += 15;
  if (topic.relevantAspects.has(a.aspectType?.toLowerCase() || "")) score += 15;
  if (a.natalPlanet === timeLord) score += 30;
  if (a.natalHouse != null && a.natalHouse === profectionHouse) score += 20;
  if (a.isApplying) score += 10;
  if (SLOW_PLANETS.has(a.transitPlanet) && PERSONAL_PLANETS.has(a.natalPlanet)) score += 10;
  score += spineBodyWeight(a.transitPlanet) / 10;
  score -= a.orbDegrees;
  return score;
}

function filterTransitsByTopic(
  aspects: TransitAspect[],
  topic: TopicConfig,
  timeLord: string,
  profectionHouse: number
): TransitAspect[] {
  const relevantPlanets = topic.relevantPlanets;
  const relevantHouses = topic.relevantHouses;
  const relevantAspects = topic.relevantAspects;

  const personalAspects = aspects.filter(
    (a) => PERSONAL_PLANETS.has(a.natalPlanet) || a.natalPlanet === timeLord
  );

  let filtered = personalAspects.filter((a) => {
    const isRelevantHouse = a.natalHouse != null && relevantHouses.has(a.natalHouse);
    const isRelevantAspect = relevantAspects.has(a.aspectType?.toLowerCase() || "");
    return isRelevantHouse && isRelevantAspect;
  });

  if (filtered.length === 0) {
    filtered = personalAspects.filter((a) => {
      const isRelevantPlanet = relevantPlanets.has(a.transitPlanet) || relevantPlanets.has(a.natalPlanet);
      const isRelevantAspect = relevantAspects.has(a.aspectType?.toLowerCase() || "");
      return isRelevantPlanet && isRelevantAspect;
    });
  }

  if (filtered.length === 0) {
    filtered = personalAspects.filter((a) => a.natalHouse === profectionHouse);
  }

  const pool = filtered.length > 0 ? filtered : personalAspects;
  const ranked = [...pool].sort(
    (a, b) =>
      scoreTransitAspect(b, topic, timeLord, profectionHouse) -
      scoreTransitAspect(a, topic, timeLord, profectionHouse)
  );

  const strong = ranked.filter(
    (a) => a.band?.toUpperCase() === "EXACT" || a.band?.toUpperCase() === "LIVE"
  );
  const background = ranked.filter((a) => a.band?.toUpperCase() === "BACKGROUND");

  return [...strong, ...background.slice(0, 8)];
}

export function validateAndFilterAspects(aspects: TransitAspect[] | undefined): TransitAspect[] {
  if (!aspects?.length) return [];
  const valid: TransitAspect[] = [];
  for (const a of aspects) {
    const aspectType = a.aspectType?.toLowerCase() || "conjunction";
    const orbs = ASPECT_ORBS[aspectType] || ASPECT_ORBS.conjunction;
    let band: TransitAspect["band"];
    if (a.orbDegrees <= orbs.exact) {
      band = "exact";
    } else if (a.orbDegrees <= orbs.live) {
      band = "live";
    } else if (a.orbDegrees <= orbs.background) {
      band = "background";
    } else {
      continue;
    }
    valid.push({ ...a, band });
  }
  return valid;
}

function filterAnglesByTopic<T extends { angle: string }>(
  angles: T[] | undefined,
  topic: TopicConfig
): T[] {
  if (!angles?.length) return [];
  if (topic.id === "general") return angles;
  return angles.filter((a) => topic.relevantAngles.has(a.angle));
}

function determineSpine(
  aspects: TransitAspect[],
  profection: any,
  transitsToAngles:
    | Array<TransitToAngle & { exactDate?: string; exactJulianDay?: number }>
    | undefined,
  natalPlanets: ReadingRequestBody["tropical"]["planets"],
  progressions?: ReadingRequestBody["progressions"],
  solarArcs?: ReadingRequestBody["solarArcs"]
): {
  primary: string;
  priority: number;
  sources: string[];
  temporalClass: string;
  selectedAspect?: any;
} {
  if (transitsToAngles && transitsToAngles.length > 0) {
    const exactAngles = transitsToAngles
      .filter((a) => a.orb < 2 && spineBodyWeight(a.transitPlanet) >= SPINE_ANCHOR_MIN_WEIGHT)
      .sort((a, b) => {
        const wA = spineBodyWeight(a.transitPlanet);
        const wB = spineBodyWeight(b.transitPlanet);
        if (wA !== wB) return wB - wA;
        if (a.isApplying !== b.isApplying) return a.isApplying ? -1 : 1;
        return a.orb - b.orb;
      });

    if (exactAngles.length > 0) {
      const a = exactAngles[0];
      return {
        primary: `ANGLE ACTIVATION: ${a.transitPlanet} ${a.aspectType} ${a.angle} — major life event`,
        priority: 1,
        sources: [
          `Transit ${a.transitPlanet} ${a.aspectType} ${a.angle} — ${a.orb}° orb${a.exactDate ? ` — exact on ${a.exactDate}` : ""}`,
        ],
        temporalClass: a.isApplying ? "Immediate" : "Structural",
        selectedAspect: a,
      };
    }
  }

  if (!aspects?.length) {
    return {
      primary: `${profection.activatedHouse}th House ${profection.activatedSign} Year — Time Lord: ${profection.timeLord}`,
      priority: 7,
      sources: ["No transits within orb — profection year is the primary theme"],
      temporalClass: "Foundational",
    };
  }

  const active: TransitAspect[] = [];
  for (const a of aspects) {
    const band = a.band?.toUpperCase();
    if (band === "EXACT" || band === "LIVE") active.push(a);
  }

  if (!active.length) {
    return {
      primary: `${profection.activatedHouse}th House ${profection.activatedSign} Year — Time Lord: ${profection.timeLord}`,
      priority: 7,
      sources: ["No EXACT or LIVE transits — profection year is the primary theme"],
      temporalClass: "Foundational",
    };
  }

  const personal: TransitAspect[] = [];
  for (const a of active) {
    if (PERSONAL_PLANETS.has(a.natalPlanet) || a.natalPlanet === profection.timeLord) {
      personal.push(a);
    }
  }

  personal.sort((a, b) => {
    const wA = spineBodyWeight(a.transitPlanet);
    const wB = spineBodyWeight(b.transitPlanet);
    if (wA !== wB) return wB - wA;
    return a.orbDegrees - b.orbDegrees;
  });

  for (const a of personal) {
    const natalPlacement = natalPlanets.find((p) => p.name === a.natalPlanet);
    if (!natalPlacement) continue;
    const natalLongitude = placementToLongitude(natalPlacement.sign, natalPlacement.degree);
    if (natalLongitude === null) continue;
    const progHit = findPredictiveHit(
      (progressions || []).map((p) => ({ name: p.name, longitude: p.longitude })),
      natalLongitude,
      1.0
    );
    const arcHit = findPredictiveHit(
      (solarArcs || []).map((s) => ({ name: s.name, longitude: s.longitude })),
      natalLongitude,
      1.0
    );
    if (progHit && arcHit) {
      return {
        primary: `CRITICAL MASS: Transit ${a.transitPlanet} + Progression + Solar Arc converge on natal ${a.natalPlanet}`,
        priority: 2,
        sources: [
          `Transit ${a.transitPlanet} ${a.aspectType} natal ${a.natalPlanet} — ${a.orbDegrees}° orb`,
          `Progression ${progHit.pointName} ${progHit.aspect} natal ${a.natalPlanet} — ${progHit.orb.toFixed(2)}° orb`,
          `Solar Arc ${arcHit.pointName} ${arcHit.aspect} natal ${a.natalPlanet} — ${arcHit.orb.toFixed(2)}° orb`,
        ],
        temporalClass: a.orbDegrees < 1 ? "Immediate" : "Structural",
        selectedAspect: a,
      };
    }
  }

  for (const a of personal) {
    if (a.natalPlanet === profection.timeLord) {
      return {
        primary: `TIME LORD ACTIVATION: ${profection.timeLord} (${profection.activatedHouse}th House Lord) activated by ${a.transitPlanet}`,
        priority: 3,
        sources: [`Transit ${a.transitPlanet} ${a.aspectType} natal ${a.natalPlanet}`],
        temporalClass: a.orbDegrees < 1 ? "Immediate" : "Structural",
        selectedAspect: a,
      };
    }
  }

  for (const a of personal) {
    if (SLOW_PLANETS.has(a.transitPlanet) && PERSONAL_PLANETS.has(a.natalPlanet)) {
      return {
        primary: `STRUCTURAL SHIFT: ${a.transitPlanet} activating ${a.natalPlanet} — lasts weeks/months`,
        priority: 4,
        sources: [`Transit ${a.transitPlanet} ${a.aspectType} natal ${a.natalPlanet}`],
        temporalClass: "Structural",
        selectedAspect: a,
      };
    }
  }

  const exactFast = personal.filter(
    (a) => a.band?.toUpperCase() === "EXACT" && FAST_PLANETS.has(a.transitPlanet)
  );
  if (exactFast.length) {
    const a = exactFast[0];
    return {
      primary: `IMMEDIATE MOMENT: ${a.transitPlanet} exactly activating ${a.natalPlanet}`,
      priority: 5,
      sources: [`Transit ${a.transitPlanet} ${a.aspectType} natal ${a.natalPlanet}`],
      temporalClass: "Immediate",
      selectedAspect: a,
    };
  }

  if (personal.length > 0) {
    const a = personal[0];
    return {
      primary: `${a.transitPlanet} activating ${a.natalPlanet} — active and unfolding`,
      priority: 6,
      sources: [`Transit ${a.transitPlanet} ${a.aspectType} natal ${a.natalPlanet}`],
      temporalClass: a.orbDegrees < 1 ? "Immediate" : "Structural",
      selectedAspect: a,
    };
  }

  return {
    primary: `${profection.activatedHouse}th House ${profection.activatedSign} Year — Time Lord: ${profection.timeLord}`,
    priority: 7,
    sources: ["No personal planet transits — profection year is the primary theme"],
    temporalClass: "Foundational",
  };
}

function classifyTemporal(aspects: TransitAspect[], timeLord: string) {
  const immediate: TransitAspect[] = [];
  const structural: TransitAspect[] = [];
  const background: TransitAspect[] = [];

  for (const a of aspects) {
    const band = a.band?.toUpperCase();
    const isPersonal = PERSONAL_PLANETS.has(a.natalPlanet) || a.natalPlanet === timeLord;
    const isGenerational = GENERATIONAL_PLANETS.has(a.transitPlanet) && !isPersonal;

    if (band === "BACKGROUND" || (isGenerational && !isPersonal)) {
      background.push(a);
      continue;
    }
    if (!isPersonal) {
      background.push(a);
      continue;
    }
    if (band === "EXACT") {
      (FAST_PLANETS.has(a.transitPlanet) ? immediate : structural).push(a);
    } else if (band === "LIVE") {
      (SLOW_PLANETS.has(a.transitPlanet) ? structural : immediate).push(a);
    }
  }

  return { immediate, structural, background };
}

function filterPersonalTrigger(trigger: any, timeLord: string): any | null {
  if (!trigger) return null;
  const isPersonal = PERSONAL_PLANETS.has(trigger.natalPlanet) || trigger.natalPlanet === timeLord;
  return isPersonal ? trigger : null;
}

// ============================================================
// BUILD PROMPT
//
// Assembly now follows the four-stage cognitive workflow:
//   STAGE 1 — LEARN ASTROLOGY            (identity/doctrine, no user data)
//   STAGE 2 — LEARN USER & QUESTION      (question, scope, data inventory)
//   STAGE 3 — REFERENCE → RESEARCH → ALIGN (evidence, SPINE resolved LAST)
//   STAGE 4 — GENERATE READING           (SignVoice, writing rules, 7 parts)
// ============================================================

export function buildReadingPrompt(
  body: ReadingRequestBody,
  topic: TopicConfig,
  validatedAspects: TransitAspect[] = []
): string {
  const {
    birthDate,
    birthTime,
    birthPlace,
    question,
    tropical,
    sidereal,
    transits,
    profection,
    progressions,
    solarArcs,
    upcomingTrigger,
    planetaryStations,
    solarReturn,
    moonPhase,
    extendedPoints,
    mutualReceptions,
    synodicCycles,
    midpoints,
    transitsToAngles,
    houseRulers,
    essentialDignities,
    lunarReturn,
    eclipseActivations,
    dispositorTree,
  } = body;

  // ---- REFERENCE → RESEARCH computations (Stage 3 numerical work) ----
  // JS has to compute these before we can describe results in prose, but
  // the *prose describing them* is what got reordered — SPINE text still
  // renders after all evidence has been laid out, per step 27.

  const topicRelevantAspects = filterTransitsByTopic(
    validatedAspects,
    topic,
    profection.timeLord,
    profection.activatedHouse
  );

  const activeTopicAspects = topicRelevantAspects.filter(
    (a) =>
      (a.band?.toUpperCase() === "EXACT" || a.band?.toUpperCase() === "LIVE") &&
      (PERSONAL_PLANETS.has(a.natalPlanet) || a.natalPlanet === profection.timeLord) &&
      !!a.exactDate
  );

  const aspectDates = getUniqueAspectDates(activeTopicAspects);

  const isTriggerRelevant = Boolean(
    upcomingTrigger &&
      (topic.relevantPlanets.has(upcomingTrigger.transitPlanet) ||
        topic.relevantPlanets.has(upcomingTrigger.natalPlanet))
  );

  const personalTrigger = filterPersonalTrigger(
    isTriggerRelevant ? upcomingTrigger : null,
    profection.timeLord
  );

  const triggerDate = personalTrigger?.date ?? null;

  const relevantStationDates = (planetaryStations || [])
    .filter((s) => {
      if (!s.natalPlanetHit) return false;
      const hitsPersonal =
        PERSONAL_PLANETS.has(s.natalPlanetHit) || s.natalPlanetHit === profection.timeLord;
      const topicRelevant =
        topic.relevantPlanets.has(s.natalPlanetHit) ||
        (s.natalHouse != null && topic.relevantHouses.has(s.natalHouse));
      return hitsPersonal && topicRelevant;
    })
    .map((s) => s.stationDate);

  const topicRelevantAngles = filterAnglesByTopic(transitsToAngles, topic);

  const angleDates = topicRelevantAngles
    .filter((t) => t.orb < 2 && !!t.exactDate)
    .map((t) => t.exactDate!)
    .filter(Boolean);

  const prioritizedDates = [
    ...aspectDates,
    ...(triggerDate ? [triggerDate] : []),
    ...relevantStationDates,
    ...angleDates,
  ].filter(Boolean) as string[];

  const finalDates = [...new Set(prioritizedDates)];
  const hasDatedEvidence = finalDates.length > 0;

  // ---- ALIGN (Stage 3, resolved only once all evidence above exists) ----

  const spine = determineSpine(
    topicRelevantAspects.length > 0 ? topicRelevantAspects : validatedAspects,
    profection,
    topicRelevantAngles,
    tropical.planets,
    progressions,
    solarArcs
  );

  const temporal = classifyTemporal(
    topicRelevantAspects.length > 0 ? topicRelevantAspects : validatedAspects,
    profection.timeLord
  );

  const sections: string[] = [];

  // ============================================================
  // STAGE 1 — LEARN ASTROLOGY
  // (Steps 1–6. No user data referenced anywhere in this block.)
  // ============================================================
  sections.push(
    "═══════════════════════════════════════════",
    "STAGE 1 — LEARN ASTROLOGY",
    "═══════════════════════════════════════════",
    "",
    STAGE1_IDENTITY,
    "",
    STAGE1_EVIDENCE_MANIFEST,
    "",
    STAGE1_SYNTHESIS_METHOD,
    "",
    STAGE1_CONFIDENCE_DOCTRINE,
    "",
    STAGE1_INTERPRETATION_DOCTRINE,
    "",
    STAGE1_TIMING_AUTHORITY,
    "",
    "Training ends here. No user question has been interpreted yet. No SPINE has been chosen. No voice calibration. No reading structure.",
    ""
  );

  // ============================================================
  // STAGE 2 — LEARN USER & QUESTION
  // (Steps 7–10.)
  // ============================================================
  sections.push(
    "═══════════════════════════════════════════",
    "STAGE 2 — LEARN USER & QUESTION",
    "═══════════════════════════════════════════",
    "",
    `TODAY: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
    `TOPIC: ${topic.id.toUpperCase()}`,
    `QUESTION: "${question}"`,
    ""
  );

  sections.push(buildUnderstandQuestionBlock(question, topic), "");
  sections.push(...buildScopeBlock(topic));
  sections.push(...buildDataInventoryBlock(body));
  sections.push(
    "I know who I'm reading for and exactly what I am being asked to determine. Only now does evidence gathering begin.",
    ""
  );

  // ============================================================
  // STAGE 3 — REFERENCE → RESEARCH → ALIGN
  // (Steps 11–31. This is the astrological working room.)
  // ============================================================
  sections.push(
    "═══════════════════════════════════════════",
    "STAGE 3 — REFERENCE → RESEARCH → ALIGN",
    "═══════════════════════════════════════════",
    ""
  );

  // -- Reference --
  sections.push(
    "REFERENCE — NATAL FOUNDATION:",
    `Birth Date: ${birthDate}`,
    `Birth Time: ${birthTime}`,
    `Birth Place: ${birthPlace}`,
    "",
    "TROPICAL NATAL PLACEMENTS:",
    ...tropical.planets.map(
      (p) =>
        `  ${p.name}: ${p.sign} ${p.degree}${p.house ? ` | House ${p.house}` : ""}${p.isAnaretic ? " | ANARETIC" : ""}`
    ),
    ""
  );

  const rankedAspects = tropical.aspects
    .slice()
    .sort((a, b) => {
      const priorityA = Math.min(
        NATAL_ASPECT_PRIORITY[a.planetA] ?? 99,
        NATAL_ASPECT_PRIORITY[a.planetB] ?? 99
      );
      const priorityB = Math.min(
        NATAL_ASPECT_PRIORITY[b.planetA] ?? 99,
        NATAL_ASPECT_PRIORITY[b.planetB] ?? 99
      );
      if (priorityA !== priorityB) return priorityA - priorityB;
      return a.orbDegrees - b.orbDegrees;
    })
    .slice(0, 15);

  const aspectList = rankedAspects
    .map((a) => {
      const isMajor =
        NATAL_ASPECT_PRIORITY[a.planetA] !== undefined ||
        NATAL_ASPECT_PRIORITY[a.planetB] !== undefined ||
        ["North Node", "Ascendant", "Midheaven"].includes(a.planetA);
      return isMajor
        ? `${a.planetA} ${a.type} ${a.planetB} — ${a.orbDegrees}° orb`
        : `${a.planetA} ${a.type} ${a.planetB} — ${a.orbDegrees}° orb [minor]`;
    })
    .join("\n");

  sections.push(
    "REFERENCE — NATAL ARCHITECTURE (major aspects first, capped at 15):",
    aspectList || "None",
    "",
    "ROLE: These never change. They are the pattern the transits are ACTIVATING.",
    "Aspects marked '[minor]' may color a description but may never anchor a claim.",
    ""
  );

  if (houseRulers && houseRulers.length > 0) {
    sections.push(
      "REFERENCE — ANNUAL TIME STRUCTURE:",
      `Age ${profection.age} → House ${profection.activatedHouse} (${profection.activatedSign})`,
      `Time Lord: ${profection.timeLord} (Natal: ${profection.timeLordNatalSign}, House ${profection.timeLordNatalHouse})`,
      "HOUSE RULERS (context for house themes):",
      ...houseRulers.map((h) => `House ${h.house} (${h.sign}) → ruled by ${h.ruler}`),
      ""
    );
  } else {
    sections.push(
      "REFERENCE — ANNUAL TIME STRUCTURE:",
      `Age ${profection.age} → House ${profection.activatedHouse} (${profection.activatedSign})`,
      `Time Lord: ${profection.timeLord} (Natal: ${profection.timeLordNatalSign}, House ${profection.timeLordNatalHouse})`,
      ""
    );
  }

  // -- Research --
  if (transits?.length) {
    sections.push(
      "RESEARCH — CURRENT SKY:",
      ...transits.map(
        (t) =>
          `  ${t.name}: ${t.sign} ${t.degree}${t.isRetrograde ? " Rx" : ""} | longitude ${t.longitude.toFixed(4)}°`
      ),
      ""
    );
  }

  sections.push(
    "RESEARCH — TOPIC/QUESTION RELEVANCE + SCORED, RANKED ACTIVE EVIDENCE:",
    ""
  );

  if (topicRelevantAngles.length > 0) {
    sections.push(
      "TRANSIT TO ANGLES (Major Life Events):",
      ...topicRelevantAngles.map(
        (t) =>
          `  ${t.transitPlanet} ${t.aspectType} ${t.angle} (${t.angleSign} ${t.angleDegree}°) — ${t.orb}° orb${t.isApplying ? ", APPLYING" : ", SEPARATING"}${t.exactDate ? ` — exact on ${t.exactDate}` : ""}`
      ),
      ""
    );
  }

  if (topicRelevantAspects.length > 0) {
    sections.push("TRANSIT-TO-NATAL ASPECTS — TOPIC-RELEVANT ONLY:");
    sections.push(`RELEVANT ASPECTS (${topicRelevantAspects.length}):`);

    const exact = topicRelevantAspects.filter((a) => a.band?.toUpperCase() === "EXACT");
    const live = topicRelevantAspects.filter((a) => a.band?.toUpperCase() === "LIVE");
    const background = topicRelevantAspects.filter((a) => a.band?.toUpperCase() === "BACKGROUND");

    if (exact.length > 0) {
      sections.push(`  EXACT (${exact.length}):`);
      for (const a of exact) {
        const rx = a.isRetrograde ? " Rx" : "";
        const motion = a.isApplying ? "APPLYING" : "SEPARATING";
        const dateStr = a.exactDate ? ` — exact on ${a.exactDate}` : "";
        sections.push(
          `    • ${a.transitPlanet}${rx} ${a.aspectType} ${a.natalPlanet} — ${a.orbDegrees}° orb, ${motion}${dateStr}`
        );
      }
    }

    if (live.length > 0) {
      sections.push(`  LIVE (${live.length}):`);
      for (const a of live) {
        const rx = a.isRetrograde ? " Rx" : "";
        const motion = a.isApplying ? "APPLYING" : "SEPARATING";
        const dateStr = a.exactDate ? ` — exact on ${a.exactDate}` : "";
        sections.push(
          `    • ${a.transitPlanet}${rx} ${a.aspectType} ${a.natalPlanet} — ${a.orbDegrees}° orb, ${motion}${dateStr}`
        );
      }
    }

    if (background.length > 0) {
      sections.push(`  BACKGROUND (${background.length} — texture only):`);
      for (const a of background) {
        const dateStr = a.exactDate ? ` — exact on ${a.exactDate}` : "";
        sections.push(`    • ${a.transitPlanet} ${a.aspectType} ${a.natalPlanet} — ${a.orbDegrees}° orb${dateStr}`);
      }
    }

    sections.push("");
  } else {
    sections.push(
      "TRANSIT-TO-NATAL ASPECTS: No topic-relevant transits within orb.",
      "Using profection year and house rulers for context.",
      ""
    );
  }

  if (personalTrigger) {
    sections.push(
      "NEXT EXACT ASPECT:",
      `${personalTrigger.transitPlanet} ${personalTrigger.aspect} natal ${personalTrigger.natalPlanet} on ${personalTrigger.date}`,
      ""
    );
  }

  sections.push("RESEARCH — STRUCTURAL EVIDENCE (progressions / solar arcs):", "");
  if (progressions?.length) {
    sections.push(
      "PROGRESSIONS:",
      progressions.map((p) => `${p.name}: ${p.sign} ${p.degree}`).join(", "),
      ""
    );
  }
  if (solarArcs?.length) {
    sections.push(
      "SOLAR ARCS:",
      solarArcs.map((s) => `${s.name}: ${s.sign} ${s.degree}`).join(", "),
      ""
    );
  }

  sections.push("RESEARCH — TIMING AMPLIFIERS (stations / returns / eclipses):", "");
  if (planetaryStations?.length) {
    sections.push("PLANETARY STATIONS:");
    for (const s of planetaryStations) {
      const hit = s.natalPlanetHit ? ` → ${s.orbDegrees}° from ${s.natalPlanetHit}` : "";
      sections.push(`  ${s.planet} stations ${s.stationType} on ${s.stationDate} at ${s.degree} ${s.sign}${hit}`);
    }
    sections.push("");
  }
  if (solarReturn) {
    const timeLordInAngularHouse =
      solarReturn.timeLordSRHouse !== null && ANGULAR_HOUSES.has(solarReturn.timeLordSRHouse);
    sections.push(
      "SOLAR RETURN — EXTERNAL/INTERNAL FILTER:",
      `Date: ${solarReturn.sunReturnDate}`,
      `SR Asc: ${solarReturn.ascendant?.sign || "N/A"} ${solarReturn.ascendant?.degree || ""}`,
      `SR MC: ${solarReturn.midheaven?.sign || "N/A"} ${solarReturn.midheaven?.degree || ""}`,
      `SR Planets: ${solarReturn.planets
        .map((p) => `${p.name}: ${p.sign} ${p.degree} (House ${p.house})`)
        .join(", ")}`,
      solarReturn.timeLordInSR
        ? `Time Lord ${profection.timeLord} in SR: ${solarReturn.timeLordInSR}${timeLordInAngularHouse ? " ★ Angular House!" : ""}`
        : `Time Lord ${profection.timeLord} not prominent in SR chart`,
      ""
    );
  }
  if (lunarReturn) {
    sections.push(
      "LUNAR RETURN — SHORT-TERM CONFIRMATION, NOT A STANDALONE EVENT PREDICTION:",
      `  ${JSON.stringify(lunarReturn)}`,
      ""
    );
  }
  if (eclipseActivations && eclipseActivations.length > 0) {
    sections.push(
      "ECLIPSE ACTIVATIONS — AMPLIFIER / DEVELOPMENT WINDOW:",
      ...eclipseActivations.map((e) => `  ${JSON.stringify(e)}`),
      ""
    );
  }

  sections.push("RESEARCH — CONFIRMATION / CONTEXT:", "");
  if (essentialDignities && essentialDignities.length > 0) {
    sections.push(
      "ESSENTIAL DIGNITIES — EXPRESSION MODIFIER, NOT TIMING:",
      ...essentialDignities.map((d) => `  ${JSON.stringify(d)}`),
      ""
    );
  }
  if (mutualReceptions && mutualReceptions.length > 0) {
    sections.push(
      "MUTUAL RECEPTION — AMPLIFIED CONNECTIONS:",
      ...mutualReceptions.map(
        (m) => `⚡ ${m.description} → ${m.planetA} and ${m.planetB} are in each other's signs`
      ),
      ""
    );
  }
  if (dispositorTree && dispositorTree.length > 0) {
    sections.push(
      "DISPOSITOR TREE — INTERPRETIVE CONTEXT ONLY:",
      ...dispositorTree.map((d) => `  ${JSON.stringify(d)}`),
      ""
    );
  }
  if (midpoints && midpoints.length > 0) {
    sections.push(
      "MIDPOINTS (Sensitive Point Activators):",
      ...midpoints.map(
        (m) => `${m.pointA}/${m.pointB} midpoint: ${m.sign} ${m.degree}° (House ${m.house})`
      ),
      ""
    );
  }
  if (synodicCycles && synodicCycles.length > 0) {
    const relevantCycles = synodicCycles.filter((s) => s.daysUntilReturn <= FORWARD_WINDOW_DAYS);
    if (relevantCycles.length > 0) {
      sections.push(
        "SYNODIC CYCLES — Context only until exact cycle timing is independently verified:",
        ...relevantCycles.map(
          (s) => `${s.planet} return in ${s.daysUntilReturn} days (${s.returnDate})`
        ),
        ""
      );
    }
  }
  if (moonPhase) {
    sections.push(
      "MOON PHASE:",
      `${moonPhase.phaseName}, ${moonPhase.illuminationPercent}% illuminated`,
      `Moon in ${moonPhase.moonSign} ${moonPhase.moonDegree}`,
      `Next ${moonPhase.nextEventName} in ${moonPhase.daysUntilNextEvent} days`,
      ""
    );
  }
  if (extendedPoints) {
    const { arabicLots, declinations } = extendedPoints;
    const oob = (declinations ?? []).filter((d: any) => d.isOutOfBounds);
    if (arabicLots?.length || oob.length) {
      const parts = [];
      if (arabicLots?.length) {
        parts.push(`Lots: ${arabicLots.map((l: any) => `${l.name} in ${l.sign} (H${l.house})`).join(", ")}`);
      }
      if (oob.length) {
        parts.push(`Out-of-bounds: ${oob.map((d: any) => `${d.planet} (${d.declination}°)`).join(", ")}`);
      }
      sections.push("EXTENDED POINTS:", parts.join(" | "), "");
    }
  }
  if (sidereal?.planets?.length) {
    sections.push(
      "SIDEREAL (confirmation filter):",
      sidereal.planets.map((p) => `${p.name}: ${p.sign} ${p.degree}`).join(", "),
      ""
    );
  }

  // -- Timing Research --
  sections.push(
    "TIMING RESEARCH — ELIGIBLE DATE POOL:",
    "",
    hasDatedEvidence
      ? `Eligible calculator-supported dates found: ${finalDates.join(", ")}`
      : `No calculator-supported topic-relevant exact date was found within the next ${FORWARD_WINDOW_DAYS} days.`,
    ""
  );

  // -- Align --
  sections.push(
    "═══════════════════════════════════════════",
    "ALIGN",
    "═══════════════════════════════════════════",
    "",
    "SPINE HIERARCHY (apply in order):",
    "1. TRANSIT TO ANGLE → Major Life Event (outranks everything)",
    "2. CRITICAL MASS: Transit + Progression + Solar Arc hit same personal planet",
    "3. TIME LORD: Transit aspects the Time Lord",
    "4. SLOW PLANET (Saturn/Uranus/Neptune/Pluto) aspecting PERSONAL planet",
    "5. FAST PLANET exact aspect to PERSONAL planet",
    "6. Any LIVE aspect to PERSONAL planet",
    "7. No personal aspects → lead with profection year",
    "",
    `SPINE: ${spine.primary}`,
    `PRIORITY: ${spine.priority}`,
    `CLASS: ${spine.temporalClass}`,
    "SPINE EVIDENCE:",
    ...spine.sources.map((source) => `  ${source}`),
    "",
    "TEMPORAL CLASSIFICATION:",
    `IMMEDIATE (0-4 weeks): ${temporal.immediate.map((a) => `${a.transitPlanet}→${a.natalPlanet}`).join(", ") || "None"}`,
    `STRUCTURAL (2-6 months): ${temporal.structural.map((a) => `${a.transitPlanet}→${a.natalPlanet}`).join(", ") || "None"}`,
    `BACKGROUND (texture only): ${temporal.background.length} aspects`,
    "",
    "CROSS-REFERENCE THE EVIDENCE:",
    "Weigh primary against structural against timing against confirming/context evidence before resolving anything.",
    "Two or more genuinely independent techniques agreeing on the same development materially strengthens it. A lower-authority layer should not overrule stronger primary evidence just because its symbolism differs.",
    "",
    "RESOLVE CONVERGENCE AND CONFLICT:",
    "Identify what multiple independent techniques agree on, what is merely supportive texture, and whether anything materially contradicts the apparent conclusion. Resolve any conflict by source authority, independence, relevance to the topic, and calculator precision — not by averaging into vagueness.",
    "",
    "ALIGN EVERYTHING TO THE USER'S ACTUAL QUESTION.",
    "Before writing, you should have internally resolved:",
    "  This is what the user asked.",
    "  This is what the natal chart establishes.",
    "  This is what is active.",
    "  This is the strongest manifestation.",
    "  This is why.",
    "  This is when (if valid timing exists).",
    "  This is what remains unresolved, if anything.",
    "",
    "Only once all of the above is resolved should writing begin.",
    ""
  );

  // ============================================================
  // STAGE 4 — GENERATE READING IN DESIGNATED STRUCTURE
  // (Steps 32–44. AstroPro switches from astrologer/researcher → communicator.)
  // ============================================================
  sections.push(
   "═══════════════════════════════════════════",
"STAGE 4 — GENERATE READING IN DESIGNATED STRUCTURE",
"═══════════════════════════════════════════",
"",
"The interpretation above is already resolved. Nothing below may change the evidence or the conclusion — it only governs how that conclusion is communicated.",
""
);

// Step 32 — Load SignVoice
// SignVoice only controls how the already-resolved interpretation is communicated.

const voiceHouseSigns = Object.fromEntries(
  (houseRulers ?? []).map(({ house, sign }) => [house, sign])
) as Partial<Record<number, string>>;

sections.push(
  "VOICE CALIBRATION (shapes delivery only — cannot change the evidence or conclusion):",
  buildVoiceCalibrationBlock(topic.id, {
    planets: tropical.planets.map((p) => ({
      name: p.name,
      sign: p.sign,
    })),
    houseSigns: voiceHouseSigns,
  }),
  ""
);

  // Step 33 — Apply User-Facing Writing Standard (delivery half of old ASTROPRO_READING_STANDARD)
  sections.push(
    "═══════════════════════════════════════════",
    "USER-FACING WRITING STANDARD",
    "═══════════════════════════════════════════",
    "",
    "Lead with the strongest resolved answer. Then explain the astrology that makes that answer visible.",
    "",
    "Use recognizable human language. Translate planetary movements and chart activations into recognizable real-life developments — do not simply recite transits, placements, aspects, houses, or technical astrology.",
    "",
    "Do not dump chart mechanics into the prose. State what is actually changing, developing, clarifying, beginning, ending, intensifying, resolving, or requiring action — not merely that something is 'activated' or 'highlighted.'",
    "",
    "Do not merely say 'change is happening.' State the development.",
    "Do not merely say 'relationship energy.' State the relationship dynamic.",
    "Do not merely say 'career activation.' State the professional development.",
    "",
    "Be direct, specific, perceptive, decisive, emotionally intelligent, and personally relevant. Depth comes from precision, not word count — every paragraph must add new information.",
    "",
    "The reading should feel like one astrologer deeply synthesizing one chart for one person — not an encyclopedia assembling disconnected interpretations.",
    "",
    "Tone and communication style come from the voice calibration above. Do not replace that chart-shaped voice with an engine-invented personality.",
    "",
    "Lead with what the chart says. Explain why it is active. State when it matters when valid timing exists. Then tell the user what to do with that information.",
    ""
  );

  // Step 34 — Apply Prose Purity Rules
  sections.push(
    "═══════════════════════════════════════════",
    "PROSE PURITY RULES",
    "═══════════════════════════════════════════",
    "",
    "PROSE CONTAINS: Human consequences, actions, emotional impacts, recognizable situations, decisions, turning points, and direct answers.",
    "PROSE CONTAINS NO: Degrees, orbs, technical terms (applying, separating, anaretic).",
    "",
    "Do not substitute abstract astrology language for a real-life interpretation.",
    "",
    "FLAT:",
    "  'Your career sector is activated and you may experience changes professionally.'",
    "BETTER:",
    "  'Your professional situation is reaching the point where the current arrangement cannot simply continue unchanged. A decision, negotiation, or structural shift is now being forced into the open.'",
    "",
    "FLAT:",
    "  'Relationship themes are highlighted.'",
    "BETTER:",
    "  'A relationship dynamic that has been easy to avoid is becoming impossible to leave undefined. The issue now is whether the connection becomes more explicit or whether the mismatch finally gets named.'",
    "",
    "SOURCES CONTAIN: Exact data lines copied verbatim from the data blocks above — that is where technical precision belongs.",
    ""
  );

  // Steps 35–41 — Reading Structure (7 required sections)
  sections.push(
    "═══════════════════════════════════════════",
    "READING STRUCTURE — 7 REQUIRED SECTIONS",
    "═══════════════════════════════════════════",
    "",
    "The reading MUST contain all seven sections, in this exact order. No section may be omitted.",
    "",
    "PART 1 — THE PREDICTION",
    "Lead immediately with the strongest chart-supported development. The first two sentences must contain the nerve of the reading. State the consequence in plain human language before explaining astrology.",
    "Do not begin with chart mechanics, disclaimers, broad themes, or scene-setting. Do not say merely that something is 'activated' — translate the activation into what the user is actually facing.",
    "",
    "PART 2 — WHERE YOU ARE NOW",
    "Ground the prediction in the condition the user is presently standing inside. Describe the current pressure, momentum, uncertainty, stability, transition, or circumstance that makes the prediction relevant now.",
    "Do not invent specific external facts, people, events, or circumstances that were not supplied or supported. Do not simply repeat Part 1.",
    "",
    "PART 3 — WHY THIS IS ACTIVE NOW",
    "Explain the primary predictive evidence and how the strongest techniques converge. Maximum 3 paragraphs, each building on the last:",
    "  1. The main activation and why it matters now.",
    "  2. The strongest supporting convergence.",
    "  3. How that convergence connects back to the user's real situation and the prediction.",
    "Do not repeat Parts 1 or 2. Do not expand every supporting technique into its own paragraph.",
    "",
    "PART 4 — HOW THIS IS MOST LIKELY TO SHOW UP",
    `Translate the astrology specifically into the ${topic.id} area.`,
    "Choose the single strongest real-life manifestation first and develop it concretely before mentioning alternatives.",
    "Only mention a materially different alternative when the chart genuinely does not distinguish between the possibilities. Do not list possibilities merely to protect yourself from being wrong.",
    "When several exact contacts share one date, synthesize them into a single moment rather than voicing only one.",
    "",
    "PART 5 — DATED WINDOWS",
    "Place the development inside its strongest calculator-supported timing, using only the dates already resolved in TIMING RESEARCH above. Do not perform timing research again here.",
    "Part 5 MUST always exist. If no valid dated evidence exists, say so plainly and describe the broader active period without inventing an exact date.",
    "Do not turn timing into claims of destiny, divine purpose, or guaranteed fate.",
    "",
    "PART 6 — THE DIRECTIVE",
    "Return power to the user. Give 1-3 concrete actions, decisions, behaviors, or things to watch for, tied directly to the prediction and evidence. Do not give generic advice that could apply to anyone.",
    "When a valid dated window exists, connect an action to that window only when genuinely useful. Use [[DATE: ...]] only with an approved date from Part 5.",
    "",
    "PART 7 — BOTTOM LINE",
    "Revisit the user's original question naturally, connect it directly to the strongest prediction, and state what the person should ultimately understand or carry forward.",
    "Do not introduce a brand-new prediction here. Do not retreat from the confidence used earlier. Do not merely repeat Part 1 word-for-word.",
    "The Bottom Line MUST end with a question that naturally continues the same reading (e.g. 'Do you want me to look at how the other person is most likely to respond to this shift?'). Avoid generic: 'Would you like to know more?' Never mention credits, subscriptions, free replies, or product mechanics.",
    ""
  );

  // Part 5 detail — use the already-resolved date pool, do not re-derive it
  sections.push(
    "═══════════════════════════════════════════",
    "TOPIC-SPECIFIC WINDOW SELECTION",
    "═══════════════════════════════════════════",
    "",
    topic.windowInstruction,
    ""
  );

  if (hasDatedEvidence) {
    sections.push(
      "PART 5 — DATED WINDOWS (2-4 windows, as data supports):",
      "",
      "⚠️ PRECISION RULE: Select timing windows deterministically from the strongest evidence already resolved above.",
      "Do NOT vary dates for novelty, variety, or stylistic differentiation.",
      "Prefer, in order: spine activation → exact topic transit → exact trigger → exact station → exact angle activation.",
      "",
      "Available dates for this reading:",
      ...finalDates.map((d) => `  - ${d}`),
      "",
      "Each window MUST use a DIFFERENT date from this list. Do NOT reuse the same date for multiple windows.",
      "If there are fewer than 2 dates, give only what's available.",
      "",
      "Each window format:",
      "  [[DATE: X]] — [one sentence on what activates] [one sentence on consequence]",
      "",
      "TIMING RULES:",
      "  - Fast planets (Mercury, Venus, Mars, Sun, Moon): ±1 day window",
      "  - Slow planets (Jupiter, Saturn, Uranus, Neptune, Pluto): ±2 week window",
      "  - Stations: ±2 day window around station date",
      "",
      "Mutual receptions, Solar Return, progressions, solar arcs, dignities, midpoints, dispositors, and profections may CONFIRM a window but may not manufacture a date.",
      ""
    );
  } else {
    sections.push(
      "PART 5 — DATED WINDOWS",
      "",
      `No calculator-supported topic-relevant exact timing window is available within the next ${FORWARD_WINDOW_DAYS} days.`,
      "",
      "Part 5 MUST still appear in the final reading. State naturally that there is no tight calculator-supported date in the current forecast window, then describe the broader active period using the strongest structural evidence already resolved above.",
      "Do NOT invent, estimate, interpolate, or imply an exact calendar date. Do NOT omit this section.",
      ""
    );
  }

  // Step 42 — Structural Completeness Check
  sections.push(
    "═══════════════════════════════════════════",
    "STRUCTURAL COMPLETENESS — HARD RULE",
    "═══════════════════════════════════════════",
    "",
    "The final reading must contain exactly these seven conceptual sections:",
    "1. The Prediction",
    "2. Where You Are Now",
    "3. Why This Is Active Now",
    "4. How This Is Most Likely To Show Up",
    "5. Dated Windows",
    "6. The Directive",
    "7. Bottom Line",
    "",
    "Never omit a section because evidence is weak — instead make the section accurately reflect the available evidence.",
    "Do not merge two sections together. Do not create Part 2B. Do not add Part 8 or additional major sections.",
    ""
  );

  // Step 43 — Sources / Evidence Attachment
  sections.push(
    "═══════════════════════════════════════════",
    "SOURCES / EVIDENCE ATTACHMENT",
    "═══════════════════════════════════════════",
    "",
    "Attach the supporting calculations to the appropriate sections using exact data lines copied verbatim from the REFERENCE/RESEARCH blocks above — never invented, never paraphrased into technical-sounding but unsupported detail.",
    ""
  );

  // Step 44 — Output Formatting
  sections.push(
    "OUTPUT FORMAT — RAW JSON ONLY",
    "",
    "Return ONLY valid JSON. No markdown, no code fences.",
    "",
    "{",
    '  "pages": [',
    "    {",
    '      "pageNumber": 1,',
    '      "title": "Your Reading",',
    '      "content": "Part 1: The Prediction\\n...\\n\\nPart 2: Where You Are Now\\n...\\n\\nPart 3: Why This Is Active Now\\n...\\n\\nPart 4: How This Is Most Likely To Show Up\\n...\\n\\nPart 5: Dated Windows\\n...\\n\\nPart 6: The Directive\\n...\\n\\nPart 7: Bottom Line\\n...",',
    '      "sources": [',
    '        { "section": "Part 1 — The Prediction", "placements": "...verbatim line..." }',
    "      ]",
    "    }",
    "  ]",
    "}"
  );

  return sections.join("\n");
}
