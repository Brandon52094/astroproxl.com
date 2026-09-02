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
const FORWARD_WINDOW_DAYS = 60;

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

  return [...pool]
    .sort(
      (a, b) =>
        scoreTransitAspect(b, topic, timeLord, profectionHouse) -
        scoreTransitAspect(a, topic, timeLord, profectionHouse)
    )
    .slice(0, 6);
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

  // CHECK 1: TRANSIT TO ANGLE
  if (transitsToAngles && transitsToAngles.length > 0) {
    const exactAngles = transitsToAngles
      .filter((a) => a.orb < 2)
      .sort((a, b) => {
        if (a.isApplying !== b.isApplying) {
          return a.isApplying ? -1 : 1;
        }

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
    "When the evidence supports an activation but not one uniquely determined outcome, state the activation directly and explain the strongest supported manifestation without pretending certainty the chart does not provide.",
    "When the evidence is weak, do not manufacture a prediction.",
    "",
    "Small predictions are worth stating when the evidence supports them.",
    "Not every meaningful development needs to be dramatic.",
    "Do not soften a difficult interpretation merely to make it more pleasant.",
    "Do not exaggerate a positive interpretation merely to make it more exciting.",
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
    "Supported beats confident.",
    "Convergence beats quantity.",
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
    "State the consequence in plain human language before explaining astrology.",
    "",
    "PART 2 — WHY THIS IS ACTIVE NOW",
    "Explain the primary predictive evidence and how the techniques converge.",
    "Do not repeat Part 1 in different words.",
    "",
    "PART 2B — HOW IT IS MOST LIKELY TO SHOW UP",
    `Translate the astrology specifically into the ${topic.id} area.`,
    "Separate what the chart clearly supports from manifestations that are merely possible.",
    "",
    "PART 3 — DATED WINDOWS",
    "Use only calculator-supplied dates that pass the dated-window rules below.",
    "",
    "PART 4 — THE DIRECTIVE",
    "Give practical action tied directly to the reading evidence.",
    "",
    "PART 5 — BOTTOM LINE",
    "Close with as many sentences needed stating the central development and the single most important thing to understand.",
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

  // ── SOURCE VERIFICATION ──
  sections.push(
    "═══════════════════════════════════════════",
    "SOURCE VERIFICATION",
    "═══════════════════════════════════════════",
    "",
    "Every ASTROLOGICAL claim in Parts 1, 2, 2B, 3, 4, and 5 must be traceable to evidence printed in this prompt.",
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
    "PROSE CONTAINS: Human consequences, actions, emotional impacts",
    "PROSE CONTAINS NO: Degrees, orbs, technical terms (applying, separating, anaretic)",
    "SOURCES CONTAIN: Exact data lines copied verbatim from the data blocks",
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