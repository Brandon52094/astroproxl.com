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

// Discovery can be broad upstream, but the synthesis engine applies
// conservative labels. "EXACT" should actually mean exact/tight.
// Wider contacts remain available as context without becoming event anchors.
const ASPECT_ORBS: Record<string, { exact: number; live: number; background: number }> = {
  conjunction:   { exact: 0.5, live: 3.0, background: 6.0 },
  opposition:    { exact: 0.5, live: 3.0, background: 6.0 },
  square:        { exact: 0.5, live: 3.0, background: 6.0 },
  trine:         { exact: 0.5, live: 3.0, background: 6.0 },
  sextile:       { exact: 0.5, live: 2.5, background: 5.0 },
  semi_sextile:  { exact: 0.4, live: 1.5, background: 3.0 },
  quincunx:      { exact: 0.4, live: 1.5, background: 3.0 },
};

// Forward-looking window (days) for a transit's exact date to still count as
// usable for a dated window. Must stay in sync with buildValidDateIndex's
// window in lib/validateReadingDates.ts — widening one without the other
// causes the model to surface dates the provenance validator then rejects.
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

// ── EDIT 1: Body-weighting constants ──
// Significance of a *transiting* body when deciding what may anchor the reading.
// Luminaries and angles outrank planets; planets outrank asteroids and points.
// Stops a tight asteroid contact from outranking a luminary on an angle.
const SPINE_BODY_WEIGHT: Record<string, number> = {
  Sun: 100, Moon: 100,
  Ascendant: 100, Midheaven: 100, Descendant: 100, "Imum Coeli": 100,
  Mercury: 80, Venus: 80, Mars: 80,
  Jupiter: 70, Saturn: 70,
  Uranus: 65, Neptune: 65, Pluto: 65,
  "North Node": 60, "South Node": 60, Chiron: 40,
  Lilith: 20, Pallas: 15, Ceres: 15, Juno: 15, Vesta: 15,
};

// Minimum significance for a transiting body to anchor a priority-1
// "major life event" ANGLE ACTIVATION spine. Asteroids/minor points fall short
// and remain available as context instead of hijacking the headline.
const SPINE_ANCHOR_MIN_WEIGHT = 50;

function spineBodyWeight(name: string): number {
  return SPINE_BODY_WEIGHT[name] ?? 25;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function normalizeLongitude(longitude: number): number {
  return ((longitude % 360) + 360) % 360;
}

function angularDistance(a: number, b: number): number {
  let diff = Math.abs(normalizeLongitude(a) - normalizeLongitude(b));

  if (diff > 180) {
    diff = 360 - diff;
  }

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

  if (signIndex === undefined || degreeInSign === null) {
    return null;
  }

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
        best = {
          pointName: point.name,
          aspect: aspect.name,
          orb,
        };
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

  if (a.natalHouse != null && topic.relevantHouses.has(a.natalHouse)) {
    score += 35;
  }

  if (topic.relevantPlanets.has(a.natalPlanet)) {
    score += 20;
  }

  if (topic.relevantPlanets.has(a.transitPlanet)) {
    score += 15;
  }

  if (topic.relevantAspects.has(a.aspectType?.toLowerCase() || "")) {
    score += 15;
  }

  if (a.natalPlanet === timeLord) {
    score += 30;
  }

  if (a.natalHouse != null && a.natalHouse === profectionHouse) {
    score += 20;
  }

  if (a.isApplying) {
    score += 10;
  }

  if (SLOW_PLANETS.has(a.transitPlanet) && PERSONAL_PLANETS.has(a.natalPlanet)) {
    score += 10;
  }

  // ── EDIT 2: Weight the transiting body in topic scoring ──
  // Significance of the transiting body itself (luminary > planet > asteroid).
  score += spineBodyWeight(a.transitPlanet) / 10;

  // Within the same category, tighter always wins.
  score -= a.orbDegrees;

  return score;
}

// ============================================================
// FILTER TRANSITS BY TOPIC  (now reads from TopicConfig)
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
    const isRelevantHouse =
      a.natalHouse != null &&
      relevantHouses.has(a.natalHouse);

    const isRelevantAspect =
      relevantAspects.has(a.aspectType?.toLowerCase() || "");

    return isRelevantHouse && isRelevantAspect;
  });

  if (filtered.length === 0) {
    filtered = personalAspects.filter((a) => {
      const isRelevantPlanet =
        relevantPlanets.has(a.transitPlanet) ||
        relevantPlanets.has(a.natalPlanet);

      const isRelevantAspect =
        relevantAspects.has(a.aspectType?.toLowerCase() || "");

      return isRelevantPlanet && isRelevantAspect;
    });
  }

  if (filtered.length === 0) {
    filtered = personalAspects.filter(
      (a) => a.natalHouse === profectionHouse
    );
  }

  // Final fallback stays deterministic.
  // We would rather return the strongest evidence repeatedly
  // than a different answer because Math.random() fired differently.
  const pool = filtered.length > 0 ? filtered : personalAspects;

  // ── EDIT 3: Stop truncating evidence to 6 ──
  const ranked = [...pool].sort(
    (a, b) =>
      scoreTransitAspect(b, topic, timeLord, profectionHouse) -
      scoreTransitAspect(a, topic, timeLord, profectionHouse)
  );

  // Never drop EXACT/LIVE evidence — those are load-bearing. Cap only BACKGROUND.
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

 valid.push({
      ...a,
      band,
    });
  }

  return valid;
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

  // ── EDIT 4: Sort the personal array by significance ──
  // Order personal contacts by significance so the checks below select the
  // strongest available contact rather than whichever arrived first.
  personal.sort((a, b) => {
    const wA = spineBodyWeight(a.transitPlanet);
    const wB = spineBodyWeight(b.transitPlanet);
    if (wA !== wB) return wB - wA;
    return a.orbDegrees - b.orbDegrees;
  });

  // ── EDIT 5: Gate and sort CHECK 1 by body weight ──
  // CHECK 1: TRANSIT TO ANGLE
  // Only a significant transiting body may anchor a "major life event" spine.
  // An asteroid at a tight orb must not outrank a luminary on an angle.
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

  // CHECK 2: CRITICAL MASS
  //
  // A critical-mass hit means three independent predictive layers
  // converge on the SAME natal target:
  //   1. active transit
  //   2. secondary progression
  //   3. solar arc
  //
  // Progressions and solar arcs are evaluated numerically in 360° longitude,
  // not by parsing display strings.
  for (const a of personal) {
    const natalPlacement = natalPlanets.find((p) => p.name === a.natalPlanet);

    if (!natalPlacement) continue;

    const natalLongitude = placementToLongitude(natalPlacement.sign, natalPlacement.degree);

    if (natalLongitude === null) continue;

    const progHit = findPredictiveHit(
      (progressions || []).map((p) => ({
        name: p.name,
        longitude: p.longitude,
      })),
      natalLongitude,
      1.0
    );

    const arcHit = findPredictiveHit(
      (solarArcs || []).map((s) => ({
        name: s.name,
        longitude: s.longitude,
      })),
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

  // CHECK 3: TIME LORD ACTIVATION
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

  // CHECK 4: SLOW PLANET activating PERSONAL PLANET
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

  // CHECK 5: FAST PLANET EXACT
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

  // CHECK 6: Any LIVE aspect
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
// BUILD PROMPT  (topic is now a TopicConfig, not a string)
// ============================================================

export function buildReadingPrompt(
  body: ReadingRequestBody,
  topic: TopicConfig,
  validatedAspects: TransitAspect[] = []
): string {
  const {
    question,
    tropical,
    sidereal,
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

  // ── TOPIC-SPECIFIC FILTERING ──
  const topicRelevantAspects = filterTransitsByTopic(
    validatedAspects,
    topic,
    profection.timeLord,
    profection.activatedHouse
  );

  // ── COLLECT TOPIC-RELEVANT DATES ──
  const activeTopicAspects = topicRelevantAspects.filter(
    (a) =>
      (a.band?.toUpperCase() === "EXACT" || a.band?.toUpperCase() === "LIVE") &&
      (PERSONAL_PLANETS.has(a.natalPlanet) || a.natalPlanet === profection.timeLord) &&
      !!a.exactDate
  );

  const aspectDates = getUniqueAspectDates(activeTopicAspects);

  const isTriggerRelevant =
    upcomingTrigger &&
    (topic.relevantPlanets.has(upcomingTrigger.transitPlanet) ||
      topic.relevantPlanets.has(upcomingTrigger.natalPlanet));

  const triggerDate = isTriggerRelevant ? upcomingTrigger?.date : null;

  const relevantStationDates = (planetaryStations || [])
    .filter((s) => {
      if (!s.natalPlanetHit) {
        return false;
      }

      const hitsPersonal =
        PERSONAL_PLANETS.has(s.natalPlanetHit) ||
        s.natalPlanetHit === profection.timeLord;

      const topicRelevant =
        topic.relevantPlanets.has(s.natalPlanetHit) ||
        (s.natalHouse != null && topic.relevantHouses.has(s.natalHouse));

      return hitsPersonal && topicRelevant;
    })
    .map((s) => s.stationDate);

  const ANGLE_HOUSE_MAP: Record<string, number> = {
    Ascendant: 1,
    "Imum Coeli": 4,
    Descendant: 7,
    Midheaven: 10,
  };

  const angleDates = (transitsToAngles || [])
    .filter((t) => {
      if (t.orb >= 2 || !t.exactDate) {
        return false;
      }

      if (topic.id === "general") {
        return true;
      }

      const angleHouse = ANGLE_HOUSE_MAP[t.angle];

      return angleHouse != null && topic.relevantHouses.has(angleHouse);
    })
    .map((t) => t.exactDate!)
    .filter(Boolean);

  // PRIORITY ORDER: topic-specific aspect dates first, then topic-relevant
  // trigger/station/angle dates as fallback. Synodic cycle dates excluded.
  const prioritizedDates = [
    ...aspectDates, // topic-specific — these lead
    ...(triggerDate ? [triggerDate] : []), // universal, but topic-gated
    ...relevantStationDates, // universal, but topic-gated
    ...angleDates,
  ].filter(Boolean) as string[];

  // Deduplicate while preserving evidence priority.
  // The model may present chosen windows chronologically,
  // but selection itself must follow astrological strength.
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
    transitsToAngles,
    tropical.planets,
    progressions,
    solarArcs
  );

  const temporal = classifyTemporal(
    topicRelevantAspects.length > 0 ? topicRelevantAspects : validatedAspects,
    profection.timeLord
  );
  const personalTrigger = filterPersonalTrigger(
    isTriggerRelevant ? upcomingTrigger : null,
    profection.timeLord
  );

  const hasDatedEvidence = finalDates.length > 0;

  const sections: string[] = [];

  // ── HEADER ──
  sections.push(
    "ASTROLOGICAL SYNTHESIS ENGINE",
    `TODAY: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
    `TOPIC: ${topic.id.toUpperCase()}`,
    `QUESTION: "${question}"`,
    "",
    buildVoiceCalibrationBlock(tropical.planets.map((p) => ({ name: p.name, sign: p.sign }))),
    ""
  );

  // ── TOPIC FOCUS ──
  sections.push("TOPIC FOCUS — " + topic.focusLine, "");

  // ── TOPIC-SPECIFIC WINDOW INSTRUCTION ──
  sections.push(
    "═══════════════════════════════════════════",
    "TOPIC-SPECIFIC WINDOW SELECTION",
    "═══════════════════════════════════════════",
    "",
    topic.windowInstruction,
    ""
  );

  // ── SPINE HIERARCHY ──
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

  // ── PROFECTION ──
  sections.push(
    "PROFECTION YEAR:",
    `Age ${profection.age} → House ${profection.activatedHouse} (${profection.activatedSign})`,
    `Time Lord: ${profection.timeLord} (Natal: ${profection.timeLordNatalSign}, House ${profection.timeLordNatalHouse})`,
    ""
  );

  // ── HOUSE RULERS ──
  if (houseRulers && houseRulers.length > 0) {
    sections.push(
      "HOUSE RULERS (context for house themes):",
      ...houseRulers.map((h) => `House ${h.house} (${h.sign}) → ruled by ${h.ruler}`),
      ""
    );
  }

  // ── MUTUAL RECEPTION ──
  if (mutualReceptions && mutualReceptions.length > 0) {
    sections.push(
      "MUTUAL RECEPTION — AMPLIFIED CONNECTIONS:",
      ...mutualReceptions.map(
        (m) => `⚡ ${m.description} → ${m.planetA} and ${m.planetB} are in each other's signs`
      ),
      ""
    );
  }

  // ── ESSENTIAL DIGNITIES ──
  if (essentialDignities && essentialDignities.length > 0) {
    sections.push(
      "ESSENTIAL DIGNITIES — EXPRESSION MODIFIER, NOT TIMING:",
      ...essentialDignities.map((d) => `  ${JSON.stringify(d)}`),
      ""
    );
  }

  // ── LUNAR RETURN ──
  if (lunarReturn) {
    sections.push(
      "LUNAR RETURN — SHORT-TERM CONFIRMATION, NOT A STANDALONE EVENT PREDICTION:",
      `  ${JSON.stringify(lunarReturn)}`,
      ""
    );
  }

  // ── ECLIPSE ACTIVATIONS ──
  if (eclipseActivations && eclipseActivations.length > 0) {
    sections.push(
      "ECLIPSE ACTIVATIONS — AMPLIFIER / DEVELOPMENT WINDOW:",
      ...eclipseActivations.map((e) => `  ${JSON.stringify(e)}`),
      ""
    );
  }

  // ── DISPOSITOR TREE ──
  if (dispositorTree && dispositorTree.length > 0) {
    sections.push(
      "DISPOSITOR TREE — INTERPRETIVE CONTEXT ONLY:",
      ...dispositorTree.map((d) => `  ${JSON.stringify(d)}`),
      ""
    );
  }

  // ── SYNODIC CYCLES ──
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

  // ── MIDPOINTS ──
  if (midpoints && midpoints.length > 0) {
    sections.push(
      "MIDPOINTS (Sensitive Point Activators):",
      ...midpoints.map(
        (m) => `${m.pointA}/${m.pointB} midpoint: ${m.sign} ${m.degree}° (House ${m.house})`
      ),
      ""
    );
  }

  // ── TRANSIT TO ANGLES ──
  if (transitsToAngles && transitsToAngles.length > 0) {
    sections.push(
      "TRANSIT TO ANGLES (Major Life Events):",
      ...transitsToAngles.map(
        (t) =>
          `  ${t.transitPlanet} ${t.aspectType} ${t.angle} (${t.angleSign} ${t.angleDegree}°) — ${t.orb}° orb${t.isApplying ? ", APPLYING" : ", SEPARATING"}${t.exactDate ? ` — exact on ${t.exactDate}` : ""}`
      ),
      ""
    );
  }

  // ── PROGRESSIONS & SOLAR ARCS ──
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

  // ── TRANSIT ASPECTS (Topic-Filtered) ──
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

  // ── TEMPORAL CLASSIFICATION ──
  sections.push(
    "TEMPORAL CLASSIFICATION:",
    `IMMEDIATE (0-4 weeks): ${temporal.immediate.map((a) => `${a.transitPlanet}→${a.natalPlanet}`).join(", ") || "None"}`,
    `STRUCTURAL (2-6 months): ${temporal.structural.map((a) => `${a.transitPlanet}→${a.natalPlanet}`).join(", ") || "None"}`,
    `BACKGROUND (texture only): ${temporal.background.length} aspects`,
    ""
  );

  // ── UPCOMING TRIGGER ──
  if (personalTrigger) {
    sections.push(
      "NEXT EXACT ASPECT:",
      `${personalTrigger.transitPlanet} ${personalTrigger.aspect} natal ${personalTrigger.natalPlanet} on ${personalTrigger.date}`,
      ""
    );
  }

  // ── PLANETARY STATIONS ──
  if (planetaryStations?.length) {
    sections.push("PLANETARY STATIONS:");
    for (const s of planetaryStations) {
      const hit = s.natalPlanetHit ? ` → ${s.orbDegrees}° from ${s.natalPlanetHit}` : "";
      sections.push(`  ${s.planet} stations ${s.stationType} on ${s.stationDate} at ${s.degree} ${s.sign}${hit}`);
    }
    sections.push("");
  }

  // ── SOLAR RETURN ──
  if (solarReturn) {
    const timeLordInAngularHouse =
      solarReturn.timeLordSRHouse !== null && ANGULAR_HOUSES.has(solarReturn.timeLordSRHouse);

    sections.push(
      "SOLAR RETURN — EXTERNAL/INTERNAL FILTER:",
      `Date: ${solarReturn.sunReturnDate}`,
      `SR Asc: ${solarReturn.ascendant?.sign || "N/A"} ${solarReturn.ascendant?.degree || ""}`,
      `SR MC: ${solarReturn.midheaven?.sign || "N/A"} ${solarReturn.midheaven?.degree || ""}`,
      solarReturn.timeLordInSR
        ? `Time Lord ${profection.timeLord} in SR: ${solarReturn.timeLordInSR}${timeLordInAngularHouse ? " ★ Angular House!" : ""}`
        : `Time Lord ${profection.timeLord} not prominent in SR chart`,
      ""
    );
  }

  // ── MOON PHASE ──
  if (moonPhase) {
    sections.push(
      "MOON PHASE:",
      `${moonPhase.phaseName}, ${moonPhase.illuminationPercent}% illuminated`,
      `Moon in ${moonPhase.moonSign} ${moonPhase.moonDegree}`,
      `Next ${moonPhase.nextEventName} in ${moonPhase.daysUntilNextEvent} days`,
      ""
    );
  }

  // ── EXTENDED POINTS ──
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

  // ── SIDEREAL ──
  if (sidereal?.planets?.length) {
    sections.push(
      "SIDEREAL (confirmation filter):",
      sidereal.planets.map((p) => `${p.name}: ${p.sign} ${p.degree}`).join(", "),
      ""
    );
  }

  // ── NATAL ASPECTS ──
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

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

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

  sections.push("NATAL ASPECTS (major first, capped at 15):", aspectList || "None", "");

  // ── CORE READING PHILOSOPHY / PREDICTION STANDARD ──
  sections.push(
    "═══════════════════════════════════════════",
    "CORE READING PHILOSOPHY — HARD RULE",
    "═══════════════════════════════════════════",
    "",
    "You are a precision astrologer, not an astrology report generator.",
    "The user came here to understand what is happening in their life, what is most likely to happen next, when it matters, and what they should do with that information.",
    "",
    "═══════════════════════════════════════════",
    "HOW TO DELIVER — COMMIT TO THE SPINE",
    "═══════════════════════════════════════════",
    "",
    // ── EDIT 6: Reframe the spine from command to prior ──
    "The SPINE below is the engine's best estimate of the strongest chart-supported development.",
    "It will usually be the right lead — but your first duty is to answer the user's actual question using the tightest, most significant evidence in the chart.",
    "If the tightest convergence of contacts points elsewhere, follow the evidence and lead there. Prefer luminaries, angles, and personal planets over asteroids and minor points; prefer tighter orbs when choosing what to lead with.",
    "",
    "Your first responsibility is to LAND the reading.",
    "Do not make the user dig through explanation before they understand what is happening.",
    "Lead with the nerve of the reading in the first two sentences, then explain why it is happening now in plain human terms.",
    "",
    "When the SPINE is an EXACT activation, tight LIVE activation, Critical Mass convergence, Time Lord activation, or tight angle activation:",
    "  Speak with conviction.",
    "  Do not weaken the activation with 'may,' 'might,' 'could,' 'perhaps,' or 'the potential for.'",
    "  State what is happening directly.",
    "  Name the affected life area concretely.",
    "  Translate the astrology into the actual circumstance, pressure, opening, conversation, decision, ending, beginning, or turning point it describes.",
    "  Make the user recognize their own life in the interpretation.",
    "",
    "Do not merely tell them that 'change is happening.'",
    "Tell them WHAT is changing.",
    "Do not merely say there is 'relationship energy.'",
    "Tell them what dynamic is being confronted, initiated, exposed, clarified, deepened, or ended.",
    "Do not merely say there is 'career activation.'",
    "Tell them what professional reality is being pushed forward, tested, negotiated, changed, or decided.",
    "",
    "CONVICTION MUST SCALE WITH EVIDENCE:",
    "  CRITICAL MASS / tight ANGLE activation / multiple independent confirmations → strongest language.",
    "  EXACT personal or Time Lord activation → direct, confident language.",
    "  LIVE personal activation → direct language about what is actively unfolding.",
    "  BACKGROUND evidence → context and texture only.",
    "",
    "Strong convergence deserves strong language.",
    "When multiple independent predictive techniques point to the same development, do not dilute the reading by listing several equally weighted possibilities.",
    "Identify the strongest manifestation and develop it fully.",
    "",
    "Confidence is not the same as guaranteeing an external outcome the chart cannot uniquely determine.",
    "Commit fully to the activation and its strongest chart-supported real-life shape.",
    "If materially different outcomes remain equally compatible with the evidence, say what IS clear first, then distinguish the unresolved external result briefly.",
    "",
    "Write like an experienced personal astrologer who has read thousands of charts and is speaking to one person in front of them:",
    "warm, perceptive, specific, decisive, emotionally intelligent, and willing to say the important thing plainly.",
    "Do not sound like a research report auditing its own conclusions.",
    "",
    "Lead with the answer.",
    "Astrology exists to support the answer, not bury it.",
    "Be direct, specific, detailed, and personally relevant.",
    "Translate chart evidence into recognizable real-life developments rather than reciting placements.",
    "",
    "You are not writing a generic horoscope.",
    "You are identifying the strongest chart-supported development for the user's specific question.",
    "",
    "When multiple predictive techniques converge, COMMIT to the interpretation.",
    "State what changes, where it changes, and when the activation peaks.",
    "Do not bury the forecast underneath astrological explanation.",
    "",
    "When the evidence strongly converges, commit to the prediction.",
    "When the evidence supports a strong activation but not one uniquely determined external result, state the activation decisively and give the strongest supported manifestation first.",
    "When the evidence is genuinely weak, do not manufacture a prediction.",
    "",
    "Small predictions are worth stating when the evidence supports them.",
    "Not every meaningful development needs to be dramatic.",
    "Do not soften a difficult interpretation merely to make it more pleasant.",
    "Do not inflate a positive interpretation beyond what the evidence supports.",
    "",
    "DISTINGUISH:",
    "EVENT — multiple predictive techniques converge on a concrete development.",
    "ACTIVATION — a strong astrological trigger exists, but its external manifestation is not uniquely determined.",
    "BACKGROUND — thematic context only; never present it as a concrete event prediction.",
    "",
    "DATE RULE:",
    "Use an exact date only when that date was supplied by an exact-date calculation.",
    "Otherwise describe the activation as a broader period without inventing a calendar date.",
    "",
    "CLAIM STRENGTH — HARD RULE:",
    "",
    "EVENT:",
    "  You may state the concrete development directly when multiple independent predictive techniques converge strongly enough to support it.",
    "",
    "ACTIVATION:",
    "  State the life development or pressure directly, but do not convert it into a guaranteed external result that the evidence does not uniquely determine.",
    "",
    "BACKGROUND:",
    "  Describe atmosphere, context, or reinforcement only.",
    "  Never turn BACKGROUND evidence into a concrete prediction.",
    "",
    "Bold delivery does not upgrade evidence.",
    "Voice follows evidence strength; it never substitutes for it.",
    "",
    "For every major forecast:",
    "1. State the development.",
    "2. State the affected life area.",
    "3. State the calculator-supported peak date/window if one exists.",
    "4. State whether it initiates, culminates, reverses, resolves, or closes.",
    "5. State the most useful response from the user.",
    "",
    "Depth comes from precision, not word count.",
    "Do not repeat conclusions simply to make the reading longer.",
    "Do not expand weak secondary evidence into additional predictions.",
    "Never become vague, generic, repetitive, or encyclopedic.",
    "",
    "Specific beats dramatic.",
    "Confidence must match support.",
    "Strong convergence earns strong language.",
    "Convergence beats quantity.",
    "Do not confuse caution with accuracy.",
    ""
  );

  // ── READING STRUCTURE ──
  sections.push(
    "═══════════════════════════════════════════",
    "READING STRUCTURE",
    "═══════════════════════════════════════════",
    "",
    "PART 1 — THE PREDICTION",
    "Lead immediately with the strongest chart-supported development.",
    "The first two sentences must contain the nerve of the reading.",
    "State the consequence in plain human language before explaining astrology.",
    "",
    "Do not begin with chart mechanics, disclaimers, broad themes, or scene-setting.",
    "Do not say merely that something is 'activated,' 'highlighted,' or 'coming into focus.'",
    "Translate the activation into what the user is actually facing.",
    "",
    "If the SPINE is strong, this section should feel unmistakably decisive.",
    "The user should know what the reading is saying before they reach Part 2.",
    "",
    "PART 2 — WHY THIS IS ACTIVE NOW",
    "Explain the primary predictive evidence and how the techniques converge.",
    "Do not repeat Part 1 in different words.",
    "",
    "PART 2B — HOW IT IS MOST LIKELY TO SHOW UP",
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
    // ── EDIT 7: Synthesize multi-aspect dates ──
    "When several exact contacts share one date, synthesize them into a single moment (e.g. identity + the other person + the decision) rather than voicing only one.",
    "",
    "PART 3 — DATED WINDOWS",
    "Use only calculator-supplied dates that pass the dated-window rules below.",
    "",
    "PART 4 — THE DIRECTIVE",
    "Give practical action tied directly to the reading evidence.",
    "",
    "PART 5 — BOTTOM LINE",
    "Close by returning to the SPINE in plain human language.",
    "State the central development with conviction, not as a list of possibilities.",
    "Then state the single most important thing the user should understand or do about it.",
    "",
    "Do not introduce a new prediction here.",
    "Do not retreat from the confidence used earlier in the reading.",
    "End cleanly and decisively.",
    ""
  );

  // ── DATED WINDOW ELIGIBILITY ──
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

  // ── PART 3 — DATED WINDOWS ──
  if (hasDatedEvidence) {
    sections.push(
      "PART 3 — DATED WINDOWS (2-4 windows, as data supports):",
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
      "PART 3 — SKIPPED: No topic-relevant personal EXACT or LIVE transit aspects with calculator-supplied dates.",
      "",
      `Replace Part 3 with: "There are no tight topic-relevant transit windows in the next ${FORWARD_WINDOW_DAYS} days. Your focus should be on the ${profection.activatedHouse}th House ${profection.activatedSign} year theme and the longer-term progressions unfolding."`,
      ""
    );
  }

  // ── PART 4 — DIRECTIVE ──
  sections.push(
    "PART 4 — THE DIRECTIVE",
    "",
    "Tell the user what to DO with this reading.",
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
    "Use [[DATE: ...]] only when the date is an approved calculator-supplied date from Part 3.",
    "Do not force a date onto advice that does not need one.",
    "",
    "Include something to stop, avoid, or reconsider only when the reading actually identifies a relevant risk or counterproductive behavior.",
    "Do not force DROP / EXECUTE / LOCK IN labels.",
    "",
    "Be practical and direct.",
    "Do not give generic advice that could apply to anyone.",
    ""
  );

  // ── HOW TO USE THE CALCULATIONS ──
  const relevantPlanets = topic.relevantPlanets;
  const relevantHouses = topic.relevantHouses;
  const relevantAspects = topic.relevantAspects;

  sections.push(
    "═══════════════════════════════════════════",
    "HOW TO USE THE CALCULATIONS",
    "═══════════════════════════════════════════",
    "",
    "1. TRANSIT TO ANGLE → Highest-priority external activation when tight and relevant",
    "2. CRITICAL MASS → Transit + Progression + Solar Arc convergence",
    "3. EXACT TRANSIT / NEXT EXACT ASPECT → Primary near-term timing",
    "4. TIME LORD / PROFECTION → Determines which life storyline is emphasized",
    "5. PLANETARY STATION → Amplifies a planet when tightly connected to the natal chart",
    "6. SOLAR RETURN → Annual external/internal confirmation filter",
    "7. ECLIPSE ACTIVATION → Amplifier / developmental window, not automatic event certainty",
    "8. LUNAR RETURN → Short-term confirmation",
    "9. MUTUAL RECEPTION → Amplifier, not an independent event",
    "10. ESSENTIAL DIGNITY → Modifies how strongly/cleanly a planet expresses",
    "11. MIDPOINTS → Sensitive-point context unless directly activated",
    "12. DISPOSITOR TREE → Interpretive hierarchy/context",
    "13. SYNODIC CYCLES → Context only until exact timing is independently verified",
    "",
    `For this reading (${topic.id.toUpperCase()}):`,
    `  - Priority planets: ${Array.from(relevantPlanets).join(", ")}`,
    `  - Priority houses: ${Array.from(relevantHouses).join(", ")}`,
    `  - Priority aspects: ${Array.from(relevantAspects).join(", ")}`,
    ""
  );

  // ── MANIFESTATION SELECTION ──
  sections.push(
    "═══════════════════════════════════════════",
    "MANIFESTATION SELECTION",
    "═══════════════════════════════════════════",
    "",
    "Astrological evidence often permits several theoretical manifestations.",
    "The reading must not present all of them as equally likely.",
    "",
    "Choose the manifestation that best satisfies ALL of the following:",
    "  1. Fits the SPINE.",
    "  2. Fits the user's actual question.",
    "  3. Fits the activated house/life area.",
    "  4. Fits the natal planet or angle being activated.",
    "  5. Is reinforced by the greatest number of independent predictive layers.",
    "",
    "Lead with that manifestation.",
    "Other manifestations are secondary and should normally be omitted.",
    "",
    "If two manifestations are genuinely indistinguishable from the supplied evidence, state the shared underlying development confidently and identify the external fork briefly.",
    ""
  );

  // ── SOURCE VERIFICATION ──
  sections.push(
    "═══════════════════════════════════════════",
    "SOURCE VERIFICATION",
    "═══════════════════════════════════════════",
    "",
    "Every ASTROLOGICAL claim in Parts 1, 2, 2B, 3, 4, and 5 must be traceable to evidence printed in this prompt.",
    "",
    "The verification requirement governs factual support; it must NOT make the prose sound tentative.",
    "Verify silently in your reasoning, then write the supported conclusion naturally and decisively.",
    "",
    "VALID EVIDENCE BLOCKS INCLUDE:",
    "  - SPINE EVIDENCE",
    "  - TRANSIT-TO-NATAL ASPECTS",
    "  - TRANSIT TO ANGLES",
    "  - NEXT EXACT ASPECT",
    "  - PLANETARY STATIONS",
    "  - PROGRESSIONS",
    "  - SOLAR ARCS",
    "  - PROFECTION YEAR",
    "  - SOLAR RETURN",
    "  - ECLIPSE ACTIVATIONS",
    "  - LUNAR RETURN",
    "  - MUTUAL RECEPTION",
    "  - ESSENTIAL DIGNITIES",
    "  - HOUSE RULERS",
    "  - MIDPOINTS",
    "  - DISPOSITOR TREE",
    "",
    "For each source entry:",
    "1. Identify the technique that supports the statement.",
    "2. Copy the supporting evidence line VERBATIM into the placements field.",
    "3. Never cite a technique that does not actually support the claim.",
    "4. If no printed evidence supports a concrete claim, DO NOT make the claim.",
    "",
    "Strong event predictions should use convergence when available:",
    "  - at least one primary activation",
    "  - plus one independent confirmation",
    "",
    "Behavioral advice in Part 4 does not require a separate astrological claim, but it must logically follow from the cited prediction/window.",
    ""
  );

  // ── PROSE PURITY RULES ──
  sections.push(
    "═══════════════════════════════════════════",
    "PROSE PURITY RULES",
    "═══════════════════════════════════════════",
    "",
    "PROSE CONTAINS: Human consequences, actions, emotional impacts, recognizable situations, decisions, turning points, and direct answers.",
    "PROSE CONTAINS NO: Degrees, orbs, technical terms (applying, separating, anaretic).",
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

  // ── OUTPUT FORMAT ──
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
    '      "content": "Part 1: ...\\n\\nPart 2: ...\\n\\nPart 2B: ...\\n\\nPart 3: ...\\n\\nPart 4: ...\\n\\nPart 5: ...",',
    '      "sources": [',
    '        { "section": "Part 1 — Spine", "placements": "...verbatim line..." }',
    "      ]",
    "    }",
    "  ]",
    "}"
  );

  return sections.join("\n");
}