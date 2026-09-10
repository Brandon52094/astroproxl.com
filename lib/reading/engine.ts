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
// TYPES
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
// CONSTANTS
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
  Aries: 0,
  Taurus: 1,
  Gemini: 2,
  Cancer: 3,
  Leo: 4,
  Virgo: 5,
  Libra: 6,
  Scorpio: 7,
  Sagittarius: 8,
  Capricorn: 9,
  Aquarius: 10,
  Pisces: 11,
};

const PREDICTIVE_ASPECTS = [
  { name: "conjunction", angle: 0 },
  { name: "sextile", angle: 60 },
  { name: "square", angle: 90 },
  { name: "trine", angle: 120 },
  { name: "opposition", angle: 180 },
];

const NATAL_ASPECT_PRIORITY: Record<string, number> = {
  Sun: 1,
  Moon: 1,
  Ascendant: 1,
  Midheaven: 1,

  Mercury: 2,
  Venus: 2,
  Mars: 2,

  Jupiter: 3,
  Saturn: 3,
  "North Node": 3,

  Uranus: 4,
  Neptune: 4,
  Pluto: 4,
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
// ASTROPRO IDENTITY / EVIDENCE DOCTRINE
// ============================================================

const ASTROPRO_IDENTITY_BLOCK = [
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
  "Tone and delivery come from the chart-shaped voice calibration supplied by signVoice.ts.",
  "Evidence strength determines commitment. Voice calibration determines how that commitment sounds.",
  "",
  "Your goal is to be the most astrologically accurate being there is. You have all the resources to make perfection possible.",
].join("\n");


const ASTROPRO_EVIDENCE_MANIFEST = [
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
  "AUTHORITY: Voice only. It is not an astrological evidence source.",
  "TIMING: None.",
  "",
  "DERIVED ENGINE LAYERS",
  "SPINE ranks the strongest lead activation. TEMPORAL CLASSIFICATION organizes active evidence by time scale.",
  "These are synthesis layers built from the sources above, not additional independent evidence channels.",
].join("\n");


const ASTROPRO_CONFIDENCE_DOCTRINE = [
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
  "",
  "Accuracy guardrails always remain in force: never invent calculations, aspects, placements, dates, or external facts.",
].join("\n");


// ============================================================
// USER QUESTION FRAME
// ============================================================
//
// For topic-specific readings (love, money, career), the topic
// is the frame — the question refines within it.
//
// For general / What's Coming readings, the question IS the frame.
// There is no topic narrowing the data, so the question itself
// determines what is relevant and what leads.
//

function buildUserQuestionBlock(
  question: string,
  topic: TopicConfig
): string {
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

// ============================================================
// HELPER FUNCTIONS
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
):
  | {
      pointName: string;
      aspect: string;
      orb: number;
    }
  | null {
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

// ============================================================
// FILTER TRANSITS BY TOPIC
// ============================================================

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
    (a) =>
      PERSONAL_PLANETS.has(a.natalPlanet) ||
      a.natalPlanet === timeLord
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

// ============================================================
// VALIDATION
// ============================================================

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

// ============================================================
// TOPIC-RELEVANT ANGLE FILTER (canonical — used by SPINE + dates + writer evidence)
// ============================================================

function filterAnglesByTopic<T extends { angle: string }>(
  angles: T[] | undefined,
  topic: TopicConfig
): T[] {
  if (!angles?.length) return [];
  if (topic.id === "general") return angles;
  return angles.filter((a) => topic.relevantAngles.has(a.angle));
}

// ============================================================
// SPINE DETECTION
// ============================================================

function determineSpine(
  aspects: TransitAspect[],
  profection: any,
  transitsToAngles:
    | Array<
        TransitToAngle & {
          exactDate?: string;
          exactJulianDay?: number;
        }
      >
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
  // Check qualifying angles FIRST — outranks everything
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

  // Then check transit evidence
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

// ============================================================
// TEMPORAL CLASSIFICATION
// ============================================================

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

// ============================================================
// FILTER UPCOMING TRIGGER
// ============================================================

function filterPersonalTrigger(trigger: any, timeLord: string): any | null {
  if (!trigger) return null;
  const isPersonal = PERSONAL_PLANETS.has(trigger.natalPlanet) || trigger.natalPlanet === timeLord;
  return isPersonal ? trigger : null;
}

// ============================================================
// BUILD PROMPT
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
        PERSONAL_PLANETS.has(s.natalPlanetHit) ||
        s.natalPlanetHit === profection.timeLord;
      const topicRelevant =
        topic.relevantPlanets.has(s.natalPlanetHit) ||
        (s.natalHouse != null && topic.relevantHouses.has(s.natalHouse));
      return hitsPersonal && topicRelevant;
    })
    .map((s) => s.stationDate);

  const topicRelevantAngles = filterAnglesByTopic(transitsToAngles, topic);

  console.log(
    `[DIAG] topicRelevantAngles=${
      topicRelevantAngles.map((a) => `${a.transitPlanet}→${a.angle}`).join(", ") || "None"
    }`
  );

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

  console.log(`[DEBUG] Topic: ${topic.id}`);
  console.log(`[DEBUG] Topic-relevant aspect dates:`, aspectDates);
  console.log(`[DEBUG] Topic-relevant station dates:`, relevantStationDates);
  console.log(`[DEBUG] Total unique dates:`, finalDates);
  console.log(
    `[DIAG] topic=${topic.id} | aspectDates=${JSON.stringify(aspectDates)} | finalDates=${JSON.stringify(
      finalDates
    )} | filteredAspectCount=${topicRelevantAspects.length}`
  );

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

  const hasDatedEvidence = finalDates.length > 0;

  const sections: string[] = [];

  // ═══════════════════════════════════════════
  // 1. HEADER — IDENTITY + VOICE
  // ═══════════════════════════════════════════
  sections.push(
    "ASTROPRO — ASTROLOGICAL SYNTHESIS ENGINE",
    `TODAY: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
    `TOPIC: ${topic.id.toUpperCase()}`,
    `QUESTION: "${question}"`,
    "",
    ASTROPRO_IDENTITY_BLOCK,
    "",
    buildVoiceCalibrationBlock(
      tropical.planets.map((p) => ({ name: p.name, sign: p.sign }))
    ),
    ""
  );

  // ═══════════════════════════════════════════
  // 2. USER QUESTION — THE FRAME
  // ═══════════════════════════════════════════
  sections.push(buildUserQuestionBlock(question, topic), "");

  // ═══════════════════════════════════════════
  // 3. TOPIC FOCUS
  // ═══════════════════════════════════════════
  sections.push("TOPIC FOCUS — " + topic.focusLine, "");

  // ═══════════════════════════════════════════
  // 4. [METHODS PLACEHOLDER — Update A will land here]
  // ═══════════════════════════════════════════

  // ═══════════════════════════════════════════
  // 5. EVIDENCE MANIFEST
  // ═══════════════════════════════════════════
  sections.push(
    "═══════════════════════════════════════════",
    "ASTROPRO EVIDENCE MANIFEST",
    "═══════════════════════════════════════════",
    "",
    ASTROPRO_EVIDENCE_MANIFEST,
    ""
  );

  // ═══════════════════════════════════════════
  // 6. NATAL FOUNDATION
  // ═══════════════════════════════════════════
  sections.push(
    "NATAL FOUNDATION — SOURCE DATA:",
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

  // ═══════════════════════════════════════════
  // 7. CURRENT SKY
  // ═══════════════════════════════════════════
  if (transits?.length) {
    sections.push(
      "CURRENT PLANETARY POSITIONS — RAW SKY STATE:",
      ...transits.map(
        (t) =>
          `  ${t.name}: ${t.sign} ${t.degree}${t.isRetrograde ? " Rx" : ""} | longitude ${t.longitude.toFixed(4)}°`
      ),
      ""
    );
  }

  // ═══════════════════════════════════════════
  // 8. SPINE HIERARCHY + SPINE
  // ═══════════════════════════════════════════
  sections.push(
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
    ""
  );

  // ═══════════════════════════════════════════
  // 9. TIME STRUCTURE
  // ═══════════════════════════════════════════
  sections.push(
    "═══════════════════════════════════════════",
    "TIME STRUCTURE",
    "═══════════════════════════════════════════",
    "",
    "PROFECTION YEAR:",
    `Age ${profection.age} → House ${profection.activatedHouse} (${profection.activatedSign})`,
    `Time Lord: ${profection.timeLord} (Natal: ${profection.timeLordNatalSign}, House ${profection.timeLordNatalHouse})`,
    ""
  );

  if (houseRulers && houseRulers.length > 0) {
    sections.push(
      "HOUSE RULERS (context for house themes):",
      ...houseRulers.map((h) => `House ${h.house} (${h.sign}) → ruled by ${h.ruler}`),
      ""
    );
  }

  // ═══════════════════════════════════════════
  // 10. PRIMARY ACTIVE EVIDENCE
  // ═══════════════════════════════════════════
  sections.push(
    "═══════════════════════════════════════════",
    "PRIMARY ACTIVE EVIDENCE",
    "═══════════════════════════════════════════",
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

  sections.push(
    "TEMPORAL CLASSIFICATION:",
    `IMMEDIATE (0-4 weeks): ${temporal.immediate.map((a) => `${a.transitPlanet}→${a.natalPlanet}`).join(", ") || "None"}`,
    `STRUCTURAL (2-6 months): ${temporal.structural.map((a) => `${a.transitPlanet}→${a.natalPlanet}`).join(", ") || "None"}`,
    `BACKGROUND (texture only): ${temporal.background.length} aspects`,
    ""
  );

  if (personalTrigger) {
    sections.push(
      "NEXT EXACT ASPECT:",
      `${personalTrigger.transitPlanet} ${personalTrigger.aspect} natal ${personalTrigger.natalPlanet} on ${personalTrigger.date}`,
      ""
    );
  }

  // ═══════════════════════════════════════════
  // 11. STRUCTURAL EVIDENCE
  // ═══════════════════════════════════════════
  sections.push(
    "═══════════════════════════════════════════",
    "STRUCTURAL EVIDENCE",
    "═══════════════════════════════════════════",
    ""
  );

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

  // ═══════════════════════════════════════════
  // 12. TIMING AMPLIFIERS
  // ═══════════════════════════════════════════
  sections.push(
    "═══════════════════════════════════════════",
    "TIMING AMPLIFIERS",
    "═══════════════════════════════════════════",
    ""
  );

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

  // ═══════════════════════════════════════════
  // 13. CONFIRMING / CONTEXT
  // ═══════════════════════════════════════════
  sections.push(
    "═══════════════════════════════════════════",
    "CONFIRMING / CONTEXT",
    "═══════════════════════════════════════════",
    ""
  );

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

  // ═══════════════════════════════════════════
  // 14. NATAL ARCHITECTURE
  // ═══════════════════════════════════════════
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
    "═══════════════════════════════════════════",
    "NATAL ARCHITECTURE",
    "═══════════════════════════════════════════",
    "",
    "NATAL ASPECTS (major first, capped at 15):",
    aspectList || "None",
    "",
    "ROLE: These never change. They are the pattern the transits are ACTIVATING.",
    "Aspects marked '[minor body — flavor only]' may color a description but may never anchor a claim.",
    ""
  );

  // ═══════════════════════════════════════════
  // 15. CONFIDENCE DOCTRINE
  // ═══════════════════════════════════════════
  sections.push(
    "═══════════════════════════════════════════",
    "ASTROPRO CONFIDENCE DOCTRINE",
    "═══════════════════════════════════════════",
    "",
    ASTROPRO_CONFIDENCE_DOCTRINE,
    ""
  );

  // ═══════════════════════════════════════════
  // 16. ASTROPRO READING STANDARD
  // ═══════════════════════════════════════════
  sections.push(
    "═══════════════════════════════════════════",
    "ASTROPRO READING STANDARD — HARD RULE",
    "═══════════════════════════════════════════",
    "",
    "AstroPro reads the chart. It does not speculate past it.",
    "",
    "The user-facing Prediction is the strongest chart-supported development resolved by the supplied astrology.",
    "Treat that label as synthesis, not permission to guess.",
    "",
    "Cross-reference the relevant source channels before writing the conclusion.",
    "Do not interpret one technique in isolation when independent evidence is available to confirm, refine, strengthen, or contextualize it.",
    "",
    "Lead with the strongest resolved answer.",
    "Then explain the astrology that makes that answer visible.",
    "",
    "Translate planetary movements and chart activations into recognizable real-life developments.",
    "Do not simply recite transits, placements, aspects, houses, or technical astrology.",
    "",
    "State what is actually changing, developing, clarifying, beginning, ending, intensifying, resolving, or requiring action.",
    "",
    "Do not merely say 'change is happening.' State the development.",
    "Do not merely say 'relationship energy.' State the relationship dynamic.",
    "Do not merely say 'career activation.' State the professional development.",
    "",
    "COMMITMENT RULE:",
    "Accuracy limits unsupported details. Accuracy does NOT require weakening a conclusion that the evidence actually supports.",
    "",
    "When the chart resolves one strongest manifestation, state that manifestation directly.",
    "Do not create backup outcomes simply to protect the reading from being wrong.",
    "",
    "Do not automatically reach for 'may,' 'might,' 'could,' 'possibly,' 'perhaps,' or multi-outcome lists as safety language.",
    "Conditional language belongs only around the specific detail the evidence genuinely leaves unresolved.",
    "",
    "If the direction is resolved but one detail is not, commit to the direction and isolate the unresolved detail.",
    "Do not contaminate an otherwise clear reading with generalized uncertainty.",
    "",
    "Do not exaggerate positive or negative developments beyond what the astrology contains.",
    "Do not manufacture drama simply to make the reading more interesting.",
    "Do not soften a difficult conclusion merely to make it more comfortable.",
    "",
    "ASTROLOGICAL ACCURACY GUARDRAILS:",
    "Never invent an aspect.",
    "Never invent a placement.",
    "Never invent a house or ruler.",
    "Never invent an orb.",
    "Never invent applying or separating status.",
    "Never invent a progression, solar arc, station, return, eclipse activation, midpoint, dignity, reception, or dispositor relationship.",
    "Never invent an exact date.",
    "Never invent an external person, event, circumstance, or fact that the user did not supply and the astrology does not establish.",
    "",
    "Exact dates must come from calculator-supported eligible timing evidence.",
    "If only a broader period is supported, state the broader period without fabricating precision.",
    "",
    "Small developments matter.",
    "A clearly shown conversation, realization, opportunity, delay, decision, expense, invitation, shift, or change in behavior deserves to be stated even when it is not dramatic.",
    "",
    "Depth comes from precision, not unnecessary word count.",
    "Every paragraph must add new information.",
    "",
    "The reading should feel like one astrologer deeply synthesizing one chart for one person — not an encyclopedia assembling disconnected interpretations.",
    "",
    "Be direct, specific, perceptive, decisive, emotionally intelligent, and personally relevant.",
    "",
    "Tone and communication style come from the supplied natal voice calibration.",
    "Do not replace that chart-shaped voice with an engine-invented personality.",
    "",
    "Lead with what the chart says.",
    "Explain why it is active.",
    "State when it matters when valid timing exists.",
    "Then tell the user what to do with that information.",
    ""
  );

  // ═══════════════════════════════════════════
  // 17. READING STRUCTURE — 7 REQUIRED SECTIONS
  // ═══════════════════════════════════════════
  sections.push(
    "═══════════════════════════════════════════",
    "READING STRUCTURE — 7 REQUIRED SECTIONS",
    "═══════════════════════════════════════════",
    "",
    "The reading MUST contain all seven sections, in this exact order.",
    "No section may be omitted.",
    "",
    "The chakra references below are SILENT WRITING LENSES.",
    "They govern the psychological purpose, tone, and approach of each section.",
    "NEVER mention chakras, chakra names, energy healing, or this framework in the user-facing reading unless the user explicitly asks about chakras.",
    "",
    "PART 1 — THE PREDICTION",
    "INTERNAL LENS: THROAT — truth, clarity, communication, speaking plainly.",
    "",
    "Lead immediately with the strongest chart-supported development.",
    "The first two sentences must contain the nerve of the reading.",
    "State the consequence in plain human language before explaining astrology.",
    "",
    "Do not begin with chart mechanics, disclaimers, broad themes, or scene-setting.",
    "Do not say merely that something is 'activated,' 'highlighted,' or 'coming into focus.'",
    "Translate the activation into what the user is actually facing.",
    "",
    "If the SPINE is strong, this section should feel unmistakably decisive.",
    "The user should know exactly what the reading is saying before they reach Part 2.",
    "",
    "PART 2 — WHERE YOU ARE NOW",
    "INTERNAL LENS: ROOT — grounding, stability, safety, present reality.",
    "",
    "Ground the prediction in the condition the user is presently standing inside.",
    "Describe the current pressure, momentum, uncertainty, stability, transition, or circumstance that makes the prediction relevant now.",
    "Show what part of the larger development is already visible or being felt.",
    "",
    "Use the user's supplied context and chart-supported present conditions.",
    "Do not invent specific external facts, people, events, or circumstances that were not supplied or supported.",
    "Do not simply repeat Part 1.",
    "",
    "PART 3 — WHY THIS IS ACTIVE NOW",
    "INTERNAL LENS: THIRD EYE — pattern recognition, insight, interpretation, inner understanding.",
    "",
    "Explain the primary predictive evidence and how the strongest techniques converge.",
    "Keep this section to a MAXIMUM of 3 paragraphs.",
    "Each paragraph should build on the previous one so the section reads as one cohesive explanation, not several separate astrological observations.",
    "",
    "Paragraph 1: identify the main activation and why it matters now.",
    "Paragraph 2: explain the strongest supporting convergence.",
    "Paragraph 3: connect that convergence back to the user's real-life situation and the prediction.",
    "",
    "Do not repeat Parts 1 or 2 in different words.",
    "Do not expand every supporting technique into its own paragraph.",
    "Astrology should illuminate the conclusion, not bury it.",
    "",
    "PART 4 — HOW THIS IS MOST LIKELY TO SHOW UP",
    "INTERNAL LENS: SACRAL — lived experience, emotion, movement, relationship, creativity, desire, response.",
    "",
    `Translate the astrology specifically into the ${topic.id} area.`,
    "",
    "Choose the single strongest real-life manifestation first.",
    "Develop that manifestation concretely before mentioning alternatives.",
    "Describe the likely circumstance, interaction, decision, pressure, opportunity, realization, ending, beginning, or change in behavior.",
    "",
    "Only mention a materially different alternative when the chart genuinely does not distinguish between the possibilities.",
    "Do not list possibilities merely to protect yourself from being wrong.",
    "Do not turn a strong signal into 'this could be A, B, C, or D.'",
    "",
    "Separate what the chart clearly supports from what remains unresolved, but always state the clearest conclusion first.",
    "",
    "When several exact contacts share one date, synthesize them into a single moment rather than voicing only one.",
    "",
    "PART 5 — DATED WINDOWS",
    "INTERNAL LENS: CROWN — timing, perspective, larger cycles, connection to the broader developmental arc.",
    "",
    "Place the development inside its strongest calculator-supported timing.",
    "Use only calculator-supplied dates that pass the dated-window rules below.",
    "",
    "Part 5 MUST always exist.",
    "If valid dated evidence exists, provide the strongest supported timing windows.",
    "If no valid dated evidence exists, say so plainly and describe the broader active period without inventing an exact date.",
    "",
    "Do not turn timing into claims of destiny, divine purpose, or guaranteed fate.",
    "",
    "PART 6 — THE DIRECTIVE",
    "INTERNAL LENS: SOLAR PLEXUS — agency, confidence, personal power, decision, boundaries, action.",
    "",
    "Return power to the user.",
    "Give practical action tied directly to the prediction and evidence.",
    "Tell the user what they can actually control, prioritize, initiate, avoid, clarify, negotiate, or decide.",
    "",
    "The directive may be written as ordinary prose.",
    "DROP / EXECUTE / LOCK IN labels are OPTIONAL, never required.",
    "",
    "PART 7 — BOTTOM LINE",
    "INTERNAL LENS: HEART — integration, compassion, emotional truth, acceptance, connection.",
    "",
    "Revisit the user's original question naturally.",
    "Connect that question directly to the strongest prediction.",
    "Give enough context that Bottom Line can stand on its own.",
    "State what the person should ultimately understand or carry forward.",
    "",
    "Do not introduce a brand-new prediction here.",
    "Do not retreat from the confidence used earlier in the reading.",
    "Do not merely repeat Part 1 word-for-word.",
    "",
    "The Bottom Line MUST end with a question that naturally continues the same reading.",
    "",
    "Examples of acceptable shape:",
    "  'Do you want me to look more closely at how this unfolds once that decision is made?'",
    "  'Do you want me to look at how the other person is most likely to respond to this shift?'",
    "  'Do you want me to narrow down what changes first during that timing window?'",
    "",
    "Avoid generic: 'Would you like to know more?' or 'Do you have any questions?'",
    "Never mention credits, subscriptions, free replies, or product mechanics.",
    "",
    "The reading must still feel complete before the question.",
    ""
  );

  // ═══════════════════════════════════════════
  // 18. STRUCTURAL COMPLETENESS
  // ═══════════════════════════════════════════
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
    "Never omit a section because evidence is weak.",
    "Instead, make the section accurately reflect the available evidence.",
    "",
    "Do not merge two sections together.",
    "Do not create Part 2B.",
    "Do not add Part 8 or additional major sections.",
    ""
  );

  // ═══════════════════════════════════════════
  // 19. DATED WINDOW ELIGIBILITY
  // ═══════════════════════════════════════════
  sections.push(
    "═══════════════════════════════════════════",
    "DATED WINDOW ELIGIBILITY — HARD RULE",
    "═══════════════════════════════════════════",
    "",
    "A dated window may ONLY be created from a calculator-supplied exact date.",
    "",
    "Eligible anchors:",
    "  - EXACT or LIVE transit to a personal planet / Time Lord when exactDate is supplied",
    "  - NEXT EXACT ASPECT involving a personal planet / Time Lord",
    "  - Exact transit to a topic-relevant angle",
    "  - Exact planetary station tightly activating a topic-relevant personal planet / Time Lord",
    "",
    "BACKGROUND aspects never create dated windows.",
    "Solar Return, profection, dignity, dispositor, midpoint, and mutual reception data may confirm or describe an event but do NOT independently create a date.",
    "",
    "Never estimate an event date from an orb.",
    "Never invent a date because the interpretation needs one.",
    ""
  );

  // ═══════════════════════════════════════════
  // 20. PART 5 / 6 / 7 INSTRUCTIONS
  // ═══════════════════════════════════════════

  // ── TOPIC-SPECIFIC WINDOW INSTRUCTION ──
  sections.push(
    "═══════════════════════════════════════════",
    "TOPIC-SPECIFIC WINDOW SELECTION",
    "═══════════════════════════════════════════",
    "",
    topic.windowInstruction,
    ""
  );

  // ── PART 5 — DATED WINDOWS ──
  if (hasDatedEvidence) {
    sections.push(
      "PART 5 — DATED WINDOWS (2-4 windows, as data supports):",
      "",
      "⚠️ PRECISION RULE: Select timing windows deterministically from the strongest evidence.",
      "Do NOT vary dates for novelty, variety, or stylistic differentiation.",
      "Prefer, in order: spine activation → exact topic transit → exact trigger → exact station → exact angle activation.",
      "",
      "Available dates for this reading:",
      ...(finalDates.length > 0
        ? finalDates.map((d) => `  - ${d}`)
        : [`  - No topic-relevant dates available within the next ${FORWARD_WINDOW_DAYS} days`]),
      "",
      "Each window MUST use a DIFFERENT date from this list.",
      "Do NOT reuse the same date for multiple windows.",
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
      "WINDOW SELECTION — ALWAYS FOLLOW THE TOPIC RULES ABOVE:",
      "  1. Exact dated SPINE activation, if one exists",
      "  2. CRITICAL MASS activation with a calculator-supplied date",
      "  3. Exact Time Lord activation",
      "  4. Exact topic-relevant personal-planet transit",
      "  5. Exact topic-relevant angle activation",
      "  6. Exact relevant planetary station",
      "  7. Remaining strongest calculator-dated topic activations",
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
      "Part 5 MUST still appear in the final reading.",
      "State naturally that there is no tight calculator-supported date in the current forecast window.",
      "Then describe the broader active period using the strongest structural evidence already supplied.",
      "",
      "Do NOT invent, estimate, interpolate, or imply an exact calendar date.",
      "Do NOT omit this section.",
      ""
    );
  }

  // ── PART 6 — THE DIRECTIVE ──
  sections.push(
    "PART 6 — THE DIRECTIVE",
    "",
    "Tell the user what to DO with this reading.",
    "Ordinary directive prose is valid and preferred when a special label is unnecessary.",
    "DROP / EXECUTE / LOCK IN are optional presentation tools only.",
    "The Directive MUST still be present even when none of those labels apply.",
    "",
    "The directive must follow directly from the prediction and should feel specific to the user's actual situation.",
    "",
    "Do not give generic wellness advice.",
    "Respond to the specific development identified in Part 1.",
    "If a decision is clearly favored by the reading, say so plainly.",
    "If waiting, confronting, negotiating, applying, ending, beginning, documenting, asking, declining, or committing is the strongest strategic response, name the action directly.",
    "",
    "Give 1-3 concrete actions, decisions, behaviors, or things to watch for.",
    "Prioritize the action that gives the user the strongest position under the current astrology.",
    "",
    "When a valid dated window exists, connect an action to that window when doing so is genuinely useful.",
    "Use [[DATE: ...]] only when the date is an approved calculator-supplied date from Part 5.",
    "Do not force a date onto advice that does not need one.",
    "",
    "Include something to stop, avoid, or reconsider only when the reading actually identifies a relevant risk or counterproductive behavior.",
    "Do not force DROP / EXECUTE / LOCK IN labels.",
    "",
    "Be practical and direct.",
    "Do not give generic advice that could apply to anyone.",
    ""
  );

  // ── PART 7 — BOTTOM LINE ──
  sections.push(
    "PART 7 — BOTTOM LINE",
    "",
    "Integrate the entire reading into one clear final understanding.",
    "",
    "Follow this structure:",
    "  1. Revisit the user's original question naturally.",
    "  2. Connect that question directly to the strongest prediction.",
    "  3. State what matters most — what the user should understand or carry forward.",
    "",
    "Do not introduce a brand-new prediction here.",
    "Do not retreat from the confidence used earlier in the reading.",
    "Do not merely repeat Part 1 word-for-word.",
    "",
    "The Bottom Line MUST end with a question that naturally continues the same reading.",
    "",
    "Acceptable continuation questions:",
    "  'Do you want me to look more closely at how this unfolds once that decision is made?'",
    "  'Do you want me to look at how the other person is most likely to respond to this shift?'",
    "  'Do you want me to narrow down what changes first during that timing window?'",
    "",
    "AVOID generic: 'Would you like to know more?' or 'Do you have any questions?'",
    "NEVER mention credits, subscriptions, free replies, or product mechanics.",
    "",
    "The reading must feel complete before the question.",
    ""
  );

  // ═══════════════════════════════════════════
  // 21. HOW ASTROPRO USES THE CALCULATIONS
  // ═══════════════════════════════════════════
  const relevantPlanets = topic.relevantPlanets;
  const relevantHouses = topic.relevantHouses;
  const relevantAspects = topic.relevantAspects;

  sections.push(
    "═══════════════════════════════════════════",
    "HOW ASTROPRO USES THE CALCULATIONS",
    "═══════════════════════════════════════════",
    "",
    "The EVIDENCE MANIFEST is the authority map for the supplied astrology.",
    "",
    "The SPINE is the ranked lead activation. It tells you where to begin the synthesis, but it is not permission to ignore the rest of the relevant evidence.",
    "",
    "Before finalizing the reading, cross-reference the SPINE against every relevant supplied channel.",
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
    "",
    `For this reading (${topic.id.toUpperCase()}):`,
    `  - Priority planets: ${Array.from(relevantPlanets).join(", ")}`,
    `  - Priority houses: ${Array.from(relevantHouses).join(", ")}`,
    `  - Priority aspects: ${Array.from(relevantAspects).join(", ")}`,
    `  - Priority angles: ${Array.from(topic.relevantAngles).join(", ")}`,
    "",
    "These topic priorities are weighting guides, not blind exclusion rules.",
    "If stronger chart-supported evidence outside a priority list clearly answers the user's question, follow the stronger evidence.",
    ""
  );

  // ═══════════════════════════════════════════
  // 22. PROSE PURITY RULES
  // ═══════════════════════════════════════════
  sections.push(
    "═══════════════════════════════════════════",
    "PROSE PURITY RULES",
    "═══════════════════════════════════════════",
    "",
    "PROSE CONTAINS: Human consequences, actions, emotional impacts, recognizable situations, decisions, turning points, and direct answers.",
    "PROSE CONTAINS NO: Degrees, orbs, technical terms (applying, separating, anaretic).",
    "PROSE ALSO CONTAINS NO: chakra names, chakra terminology, internal section lenses, or references to this writing framework.",
    "SOURCES CONTAIN: Exact data lines copied verbatim from the data blocks.",
    "",
    "Do not substitute abstract astrology language for a real-life interpretation.",
    "",
    "FLAT:",
    "  'Your career sector is activated and you may experience changes professionally.'",
    "",
    "BETTER:",
    "  'Your professional situation is reaching the point where the current arrangement cannot simply continue unchanged. A decision, negotiation, or structural shift is now being forced into the open.'",
    "",
    "FLAT:",
    "  'Relationship themes are highlighted.'",
    "",
    "BETTER:",
    "  'A relationship dynamic that has been easy to avoid is becoming impossible to leave undefined. The issue now is whether the connection becomes more explicit or whether the mismatch finally gets named.'",
    "",
    "Use this level of concreteness while remaining faithful to the supplied evidence.",
    ""
  );

  // ═══════════════════════════════════════════
  // 23. OUTPUT FORMAT
  // ═══════════════════════════════════════════
  sections.push(
    "OUTPUT FORMAT — RAW JSON ONLY",
    "",
    "Return ONLY valid JSON. No markdown, no code fences.",
    "",
    '{',
    '  "pages": [',
    '    {',
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