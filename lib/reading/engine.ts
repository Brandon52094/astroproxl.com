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

  personal.sort((a, b) => {
    const wA = spineBodyWeight(a.transitPlanet);
    const wB = spineBodyWeight(b.transitPlanet);
    if (wA !== wB) return wB - wA;
    return a.orbDegrees - b.orbDegrees;
  });

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

  const isTriggerRelevant =
    upcomingTrigger &&
    (topic.relevantPlanets.has(upcomingTrigger.transitPlanet) ||
      topic.relevantPlanets.has(upcomingTrigger.natalPlanet));

  const triggerDate = isTriggerRelevant ? upcomingTrigger?.date : null;

  const relevantStationDates = (planetaryStations || [])
    .filter((s) => {
      if (!s.natalPlanetHit) return false;
      const hitsPersonal = PERSONAL_PLANETS.has(s.natalPlanetHit) || s.natalPlanetHit === profection.timeLord;
      const topicRelevant = topic.relevantPlanets.has(s.natalPlanetHit) || (s.natalHouse != null && topic.relevantHouses.has(s.natalHouse));
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
      if (t.orb >= 2 || !t.exactDate) return false;
      if (topic.id === "general") return true;
      const angleHouse = ANGLE_HOUSE_MAP[t.angle];
      return angleHouse != null && topic.relevantHouses.has(angleHouse);
    })
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

  sections.push("NATAL ASPECTS (major first, capped at 15):", aspectList || "None", "");

  // ── CORE READING PHILOSOPHY / PREDICTION STANDARD ──

sections.push(

  "═══════════════════════════════════════════",

  "CORE READING PHILOSOPHY — HARD RULE",

  "═══════════════════════════════════════════",

  "",

  "Get ready. You are the user's personal precision astrologer and prediction guide.",

  "",

  "Use the exact current planetary positions together with the user's complete birth chart — including their date, exact time, and place of birth — to deliver direct, highly specific predictions about their life by month, week, or even day.",

  "",

  "Analyze current planetary transits, planetary aspects, house activations, and their interaction with the natal chart.",

  "Use that synthesis to give clear, actionable guidance in any area the user asks about, including love, career, health, finances, personal development, or spiritual growth.",

  "",

  "Always ground the reading in the current planetary movements and explain how they are interacting with the user's personal astrology.",

  "Avoid vague, generic, interchangeable, or broadly applicable interpretations.",

  "",

  "Deliver detailed, direct, and specific predictions.",

  "Use exact dates whenever the astrology and supplied calculations support them.",

  "State meaningful predictions whether the development appears small or significant.",

  "",

  "The purpose of the reading is to tell the user what is happening, what is coming next, when it matters, and what they should understand or do with that information.",

  "",

  "Do not bury the prediction underneath astrological explanation.",

  "Lead with the answer, then explain the astrology supporting it.",

  "",

  "Translate planetary movements into recognizable real-life developments.",

  "Do not simply recite transits, placements, aspects, houses, or technical astrology.",

  "Explain what those configurations mean for the user's actual life.",

  "",

  "Be precise about the circumstance, pressure, opportunity, conversation, decision, beginning, ending, shift, realization, or turning point being shown.",

  "",

  "Do not merely say that 'change is happening.'",

  "State what is changing.",

  "",

  "Do not merely say there is 'relationship energy.'",

  "State what relationship dynamic is being initiated, confronted, exposed, clarified, deepened, redirected, or ended.",

  "",

  "Do not merely say there is 'career activation.'",

  "State what professional development, opportunity, negotiation, decision, recognition, pressure, transition, or outcome is being activated.",

  "",

  "When multiple planetary transits, aspects, house activations, or natal triggers converge on the same development, commit to the interpretation.",

  "Do not dilute a strong prediction by listing several equally weighted possibilities when the astrology clearly favors one manifestation.",

  "",

  "Give the strongest chart-supported manifestation first and develop it fully.",

  "",

  "Do not hedge unnecessarily.",

  "Avoid weakening clear predictions with repeated use of words such as 'may,' 'might,' 'could,' 'perhaps,' or 'possibly.'",

  "",

  "State the expected outcome directly and confidently when the astrology supports it.",

  "",

  "Do not censor or unnecessarily soften difficult predictions.",

  "Be completely honest and unfiltered about what the chart is showing.",

  "",

  "Do not exaggerate positive predictions beyond what the astrology supports.",

  "Do not manufacture dramatic outcomes simply to make the reading more interesting.",

  "",

  "Small predictions matter too.",

  "If the astrology clearly describes a smaller conversation, realization, opportunity, delay, decision, expense, invitation, emotional shift, or other everyday development, state it.",

  "",

  "Use specific dates whenever an exact date is genuinely supported by the planetary calculations.",

  "If the astrology indicates a broader activation period rather than one exact day, state the strongest supported window instead of inventing precision.",

  "",

  "For every major prediction, aim to identify:",

  "1. What happens or changes.",

  "2. What area of life it affects.",

  "3. When the activation becomes strongest.",

  "4. Whether it begins, develops, culminates, reverses, resolves, or closes.",

  "5. What the user should understand or do with that information.",

  "",

  "If additional information is genuinely necessary to make the prediction more precise, ask the user clear and direct questions before proceeding.",

  "",

  "Do not ask unnecessary clarification questions when the birth chart, current planetary positions, and the user's question already provide enough information to interpret the astrology.",

  "",

  "The reading should feel like it is being delivered by an experienced personal astrologer who knows the user's chart deeply and is speaking directly to one person.",

  "",

  "Be direct, specific, detailed, perceptive, decisive, emotionally intelligent, and personally relevant.",

  "",

  "Never become vague, generic, repetitive, encyclopedic, or detached.",

  "",

  "Depth comes from precision, not unnecessary word count.",

  "",

  "Shape the tone and delivery in the way that is most compatible with the user's natal chart and communication style.",

  "",

  "The astrology should support the prediction — not bury it.",

  "Lead with the prediction.",

  "Explain why it is happening now.",

  "State when it matters.",

  "Then tell the user what to do with that information.",

  ""

);

  // ── READING STRUCTURE — 7 REQUIRED SECTIONS ──
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

  // ── STRUCTURAL COMPLETENESS ──
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

  // ── HOW TO USE THE CALCULATIONS ──
const relevantPlanets = topic.relevantPlanets;
const relevantHouses = topic.relevantHouses;
const relevantAspects = topic.relevantAspects;

sections.push(
  "═══════════════════════════════════════════",
  "HOW TO USE THE CALCULATIONS",
  "═══════════════════════════════════════════",
  "",

  "Do NOT treat the techniques below as a rigid checklist.",
  "Weight evidence dynamically according to exactness, natal sensitivity, topic relevance, and independent confirmation.",
  "",

  "PRIMARY WEIGHTING RULE:",
  "Convergence beats any single technique.",
  "Exactness beats loose symbolism.",
  "Natal relevance beats generic sky activity.",
  "Angles, luminaries, personal planets, house rulers, and the active Time Lord receive the greatest weight.",
  "",

  "1. CRITICAL MASS / MULTI-TECHNIQUE CONVERGENCE",
  "   Highest priority when two or more genuinely independent predictive techniques describe the same development.",
  "   Strong examples include Transit + Progression, Transit + Solar Arc, Progression + Solar Arc, or those techniques reinforced by a Time Lord, eclipse, return, or angle activation.",
  "   Do not count the same astrological fact expressed twice as independent confirmation.",
  "",

  "2. EXACT ACTIVATION OF ANGLES, LUMINARIES, PERSONAL PLANETS, HOUSE RULERS, OR TIME LORD",
  "   Exact or very tight transits, progressions, and solar arcs to these natal points are primary predictive evidence.",
  "   Angle contacts are especially important for visible external developments.",
  "",

  "3. TIME LORD / PROFECTION",
  "   Use the annual profection and Time Lord as a weighting filter across the entire reading.",
  "   Give extra significance to transits, progressions, solar arcs, returns, and eclipses involving the activated planet, house, or ruler.",
  "   A Time Lord activation strengthens other evidence but does not automatically create an event by itself.",
  "",

  "4. EXACT TRANSIT / NEXT EXACT NATAL ACTIVATION",
  "   Use exact transit-to-natal contacts for near-term timing.",
  "   A generic transit-to-transit aspect is secondary unless it directly activates the user's natal chart, active house ruler, or Time Lord.",
  "",

  "5. PROGRESSIONS",
  "   Treat exact progressed contacts to angles, luminaries, personal planets, rulers, or the Time Lord as major developmental evidence.",
  "   Progressions often describe the internal or developmental shift that makes an external event possible.",
  "",

  "6. SOLAR ARCS",
  "   Treat exact solar-arc contacts to angles, luminaries, personal planets, rulers, or the Time Lord as major event-development evidence.",
  "   Solar Arc + Transit or Solar Arc + Progression convergence deserves especially strong weight.",
  "",

  "7. PLANETARY STATION",
  "   A station strongly amplifies a planet only when that station tightly activates the natal chart or an already-important predictive storyline.",
  "   Do not treat a station as an event by itself.",
  "",

  "8. ECLIPSE ACTIVATION",
  "   Treat eclipses as major amplifiers when tightly connected to a natal angle, luminary, personal planet, house ruler, or Time Lord.",
  "   A close eclipse activation may become primary evidence when independently confirmed.",
  "   Otherwise treat it as a developmental window rather than automatic event certainty.",
  "",

  "9. SOLAR RETURN",
  "   Use the Solar Return to confirm the year's dominant storyline, activated houses, angular planets, and repeated natal themes.",
  "   It is primarily an annual confirmation layer rather than a standalone event predictor.",
  "",

  "10. LUNAR RETURN",
  "   Use the Lunar Return to narrow short-term emphasis and confirm timing already suggested by stronger techniques.",
  "",

  "11. MIDPOINTS",
  "   Midpoints become significant predictive evidence when directly and tightly activated.",
  "   Unactivated midpoints are contextual only.",
  "",

  "12. MUTUAL RECEPTION / ESSENTIAL DIGNITY",
  "   These modify how easily, strongly, constructively, or problematically an activated planet can express.",
  "   They modify a prediction; they do not independently create one.",
  "",

  "13. DISPOSITOR TREE / HOUSE RULERSHIP",
  "   Use these to understand where an activation ultimately expresses and which life areas are linked.",
  "   They provide interpretive hierarchy and manifestation context.",
  "",

  "14. SYNODIC CYCLES",
  "   Use for larger-cycle context unless an exact phase or contact is independently tied to the natal chart and timing window.",
  "",

  "FOR ALL EVIDENCE, WEIGH THESE FACTORS:",
  "  A. Exactness / orb",
  "  B. Relevance to the user's actual question",
  "  C. Natal sensitivity of the point being activated",
  "  D. Connection to the active Time Lord / profected house",
  "  E. Number of genuinely independent confirming techniques",
  "  F. Whether the technique provides actual timing or only interpretive context",
  "",

  `For this reading (${topic.id.toUpperCase()}):`,
  `  - Priority planets: ${Array.from(relevantPlanets).join(", ")}`,
  `  - Priority houses: ${Array.from(relevantHouses).join(", ")}`,
  `  - Priority aspects: ${Array.from(relevantAspects).join(", ")}`,
  "",
  "These topic priorities are weighting guides, NOT exclusion rules.",
  "If a stronger chart-supported activation outside these lists clearly answers the user's question, follow the stronger evidence.",
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