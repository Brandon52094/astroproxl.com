import { buildVoiceCalibrationBlock } from "@/lib/signVoice";
import type { TransitAspect } from "@/lib/transitAspects";
import { getUniqueAspectDates } from "@/lib/transitAspects";
import type {
  MutualReception,
  SynodicCycle,
  Midpoint,
  TransitToAngle,
  HouseRuler,
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
  transits: Array<{ name: string; sign: string; degree: string; isRetrograde: boolean }>;
  transitAspects?: TransitAspect[];
  profection: {
    age: number;
    activatedHouse: number;
    activatedSign: string;
    timeLord: string;
    timeLordNatalSign: string;
    timeLordNatalHouse: number;
  };
  progressions?: Array<{ name: string; sign: string; degree: string; isRetrograde: boolean }>;
  solarArcs?: Array<{ name: string; sign: string; degree: string }>;
  upcomingTrigger?: { date: string; transitPlanet: string; natalPlanet: string; aspect: string };
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
  transitsToAngles?: TransitToAngle[];
  houseRulers?: HouseRuler[];
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

// Widened from the original bands — the tighter orbs were causing too many
// topic-relevant slots to come up empty, forcing love/money/career readings
// to fall back to the same shared (topic-blind) aspect pool and converge on
// identical dates. Wider orbs give each topic more genuine, differentiated
// material to draw from before it ever needs that shared fallback.
const ASPECT_ORBS: Record<string, { exact: number; live: number; background: number }> = {
  conjunction: { exact: 4.0, live: 8.0, background: 14.0 },
  opposition:  { exact: 4.0, live: 8.0, background: 14.0 },
  square:      { exact: 4.0, live: 8.0, background: 14.0 },
  trine:       { exact: 4.0, live: 8.0, background: 14.0 },
  sextile:     { exact: 3.5, live: 7.0, background: 12.0 },
  semi_sextile: { exact: 2.0, live: 4.5, background: 9.0 },
  quincunx:    { exact: 2.0, live: 4.5, background: 9.0 },
};

// Forward-looking window (days) for a transit's exact date to still count as
// usable for a dated window. Must stay in sync with buildValidDateIndex's
// window in lib/validateReadingDates.ts — widening one without the other
// causes the model to surface dates the provenance validator then rejects.
const FORWARD_WINDOW_DAYS = 60;

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

  const personalAspects = aspects.filter(a =>
    PERSONAL_PLANETS.has(a.natalPlanet) || a.natalPlanet === timeLord
  );

  // First pass: relevant HOUSE + aspect type. House match is the primary
  // signal — the topic planet sets overlap heavily by design (Sun, Moon,
  // Mercury, Venus, Mars, Jupiter, Saturn show up in nearly every topic),
  // so filtering on planet name first let the same aspects qualify for
  // love, money, and career alike. House placement is what actually tells
  // topics apart.
  let filtered = personalAspects.filter(a => {
    const isRelevantHouse = a.natalHouse != null && relevantHouses.has(a.natalHouse);
    const isRelevantAspect = relevantAspects.has(a.aspectType?.toLowerCase() || "");
    return isRelevantHouse && isRelevantAspect;
  });

  // Fallback: relevant planets + aspects (previously the first pass)
  if (filtered.length === 0) {
    filtered = personalAspects.filter(a => {
      const isRelevantPlanet = relevantPlanets.has(a.transitPlanet) ||
                               relevantPlanets.has(a.natalPlanet);
      const isRelevantAspect = relevantAspects.has(a.aspectType?.toLowerCase() || "");
      return isRelevantPlanet && isRelevantAspect;
    });
  }

  // Fallback: profection house
  if (filtered.length === 0) {
    filtered = personalAspects.filter(a => a.natalHouse === profectionHouse);
  }

  // Last resort: shuffle and take up to 4
  if (filtered.length === 0) {
    const shuffled = [...personalAspects].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(4, shuffled.length));
  }

  // More than 6 → sort by band priority, slight shuffle for variety
  if (filtered.length > 6) {
    const bandPriority = { EXACT: 0, LIVE: 1, BACKGROUND: 2 };
    filtered.sort((a, b) => {
      const pa = bandPriority[a.band?.toUpperCase() as keyof typeof bandPriority] ?? 3;
      const pb = bandPriority[b.band?.toUpperCase() as keyof typeof bandPriority] ?? 3;
      if (pa !== pb) return pa - pb;
      return Math.random() > 0.5 ? -1 : 1;
    });
  }

  return filtered.slice(0, 6);
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
    const band = a.band?.toUpperCase() || "";

    let maxOrb: number;
    if (band === "EXACT") maxOrb = orbs.exact;
    else if (band === "LIVE") maxOrb = orbs.live;
    else if (band === "BACKGROUND") maxOrb = orbs.background;
    else continue;

    if (a.orbDegrees <= maxOrb) {
      valid.push(a);
    }
  }
  return valid;
}

// ============================================================
// SPINE DETECTION
// ============================================================

function determineSpine(
  aspects: TransitAspect[],
  profection: any,
  transitsToAngles: TransitToAngle[] | undefined,
  progressions?: any[],
  solarArcs?: any[]
): { primary: string; priority: number; sources: string[]; temporalClass: string; selectedAspect?: any } {
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
    const exactAngles = transitsToAngles.filter((a) => a.orb < 2);
    if (exactAngles.length > 0) {
      const a = exactAngles[0];
      return {
        primary: `ANGLE ACTIVATION: ${a.transitPlanet} ${a.aspectType} ${a.angle} — major life event`,
        priority: 1,
        sources: [`Transit ${a.transitPlanet} ${a.aspectType} ${a.angle} (${a.orb}° orb)`],
        temporalClass: a.isApplying ? "Immediate" : "Structural",
        selectedAspect: a,
      };
    }
  }

  // CHECK 2: CRITICAL MASS
  for (const a of personal) {
    const progHit = progressions?.some(
      (p) =>
        p.name === a.natalPlanet &&
        Math.abs(parseFloat(p.degree) - parseFloat(a.natalDegree || "0")) < 2
    );
    const arcHit = solarArcs?.some(
      (s) =>
        s.name === a.natalPlanet &&
        Math.abs(parseFloat(s.degree) - parseFloat(a.natalDegree || "0")) < 2
    );

    if (progHit && arcHit) {
      return {
        primary: `CRITICAL MASS: Transit ${a.transitPlanet} + Progression + Solar Arc activating ${a.natalPlanet}`,
        priority: 2,
        sources: [`Transit ${a.transitPlanet} ${a.aspectType} natal ${a.natalPlanet}`],
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
  } = body;

  // ── TOPIC-SPECIFIC FILTERING ──
  const topicRelevantAspects = filterTransitsByTopic(
    validatedAspects,
    topic,
    profection.timeLord,
    profection.activatedHouse
  );

  // ── COLLECT TOPIC-RELEVANT DATES WITH ROTATION ──
  const aspectDates = getUniqueAspectDates(topicRelevantAspects);

  const isTriggerRelevant = upcomingTrigger && (
    topic.relevantPlanets.has(upcomingTrigger.transitPlanet) ||
    topic.relevantPlanets.has(upcomingTrigger.natalPlanet)
  );
  const triggerDate = isTriggerRelevant ? upcomingTrigger?.date : null;

  const relevantStationDates = (planetaryStations || [])
    .filter(s => {
      const hitsRelevantPlanet = s.natalPlanetHit && topic.relevantPlanets.has(s.natalPlanetHit);
      const inRelevantHouse = s.natalHouse && topic.relevantHouses.has(s.natalHouse);
      return hitsRelevantPlanet || inRelevantHouse;
    })
    .map(s => s.stationDate);

  const relevantCycleDates = (synodicCycles || [])
    .filter(s => s.daysUntilReturn <= FORWARD_WINDOW_DAYS && topic.relevantPlanets.has(s.planet))
    .map(s => s.returnDate);

    console.error(`ZZZ_MAP topic=${topic.id} | poolBreakdown=${JSON.stringify({
  aspectDates: aspectDates,
  triggerRelevant: isTriggerRelevant ? triggerDate : "BLOCKED(not topic-relevant)",
  stationDates: relevantStationDates,
  cycleDates: relevantCycleDates,
})} | topicAspects=${JSON.stringify(topicRelevantAspects.map(a => `${a.transitPlanet} ${a.aspectType} ${a.natalPlanet} [${a.band}]`))}`);

  const solarReturnDate = solarReturn?.sunReturnDate;

  const angleDates = (transitsToAngles || [])
    .filter(t => t.orb < 2)
    .map(t => {
      const date = new Date();
      date.setDate(date.getDate() + Math.round(t.orb * 2));
      return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    });

  const allDates = [
    ...aspectDates,
    triggerDate,
    ...relevantStationDates,
    ...relevantCycleDates,
    solarReturnDate,
    ...angleDates,
  ].filter(Boolean) as string[];

  const uniqueDates = [...new Set(allDates)];
  const shuffledDates = uniqueDates.sort(() => Math.random() - 0.5);
  const finalDates = shuffledDates.sort((a, b) => {
    const dateA = new Date(a);
    const dateB = new Date(b);
    return dateA.getTime() - dateB.getTime();
  });

  console.log(`[DEBUG] Topic: ${topic.id}`);
  console.log(`[DEBUG] Topic-relevant aspect dates:`, aspectDates);
  console.log(`[DEBUG] Topic-relevant station dates:`, relevantStationDates);
  console.log(`[DEBUG] Topic-relevant cycle dates:`, relevantCycleDates);
  console.log(`[DEBUG] Total unique dates:`, finalDates);
  console.log(`[DIAG] topic=${topic.id} | aspectDates=${JSON.stringify(aspectDates)} | finalDates=${JSON.stringify(finalDates)} | filteredAspectCount=${topicRelevantAspects.length}`);

  const spine = determineSpine(
    topicRelevantAspects.length > 0 ? topicRelevantAspects : validatedAspects,
    profection,
    transitsToAngles,
    progressions,
    solarArcs
  );

  const temporal = classifyTemporal(
    topicRelevantAspects.length > 0 ? topicRelevantAspects : validatedAspects,
    profection.timeLord
  );
  const personalTrigger = filterPersonalTrigger(upcomingTrigger, profection.timeLord);

  const hasActiveAspects = topicRelevantAspects.some(
    (a) => a.band?.toUpperCase() === "EXACT" || a.band?.toUpperCase() === "LIVE"
  );

  const hasPersonalActive = topicRelevantAspects.some(
    (a) =>
      (a.band?.toUpperCase() === "EXACT" || a.band?.toUpperCase() === "LIVE") &&
      (PERSONAL_PLANETS.has(a.natalPlanet) || a.natalPlanet === profection.timeLord)
  );

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

  // ── SYNODIC CYCLES ──
  if (synodicCycles && synodicCycles.length > 0) {
    const relevantCycles = synodicCycles.filter((s) => s.daysUntilReturn <= FORWARD_WINDOW_DAYS);
    if (relevantCycles.length > 0) {
      sections.push(
        "SYNODIC CYCLES (Chapter Markers):",
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
        (t) => `  ${t.transitPlanet} ${t.aspectType} ${t.angle} (${t.angleSign} ${t.angleDegree}°) — ${t.orb}° orb`
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

    const exact = topicRelevantAspects.filter(a => a.band?.toUpperCase() === "EXACT");
    const live = topicRelevantAspects.filter(a => a.band?.toUpperCase() === "LIVE");
    const background = topicRelevantAspects.filter(a => a.band?.toUpperCase() === "BACKGROUND");

    if (exact.length > 0) {
      sections.push(`  EXACT (${exact.length}):`);
      for (const a of exact) {
        const rx = a.isRetrograde ? " Rx" : "";
        const motion = a.isApplying ? "APPLYING" : "SEPARATING";
        const dateStr = a.exactDate ? ` — exact on ${a.exactDate}` : "";
        sections.push(`    • ${a.transitPlanet}${rx} ${a.aspectType} ${a.natalPlanet} — ${a.orbDegrees}° orb, ${motion}${dateStr}`);
      }
    }

    if (live.length > 0) {
      sections.push(`  LIVE (${live.length}):`);
      for (const a of live) {
        const rx = a.isRetrograde ? " Rx" : "";
        const motion = a.isApplying ? "APPLYING" : "SEPARATING";
        const dateStr = a.exactDate ? ` — exact on ${a.exactDate}` : "";
        sections.push(`    • ${a.transitPlanet}${rx} ${a.aspectType} ${a.natalPlanet} — ${a.orbDegrees}° orb, ${motion}${dateStr}`);
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
    const timeLordInAngularHouse = solarReturn.timeLordSRHouse !== null &&
      ANGULAR_HOUSES.has(solarReturn.timeLordSRHouse);

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
  const SPEED_PRIORITY: Record<string, number> = {
    Moon: 10, Mercury: 9, Venus: 8, Sun: 7, Mars: 6,
    Jupiter: 5, Saturn: 4, Uranus: 3, Neptune: 2, Pluto: 1,
    "North Node": 5, Ascendant: 5, Midheaven: 5,
  };

  const rankedAspects = tropical.aspects
    .slice()
    .sort((a, b) => {
      const pa = SPEED_PRIORITY[a.planetA] ?? 99;
      const pb = SPEED_PRIORITY[b.planetA] ?? 99;
      if (pa !== pb) return pa - pb;
      return a.orbDegrees - b.orbDegrees;
    })
    .slice(0, 15);

  const aspectList = rankedAspects
    .map((a) => {
      const isMajor = SPEED_PRIORITY[a.planetA] !== undefined ||
        ["North Node", "Ascendant", "Midheaven"].includes(a.planetA);
      return isMajor
        ? `${a.planetA} ${a.type} ${a.planetB} — ${a.orbDegrees}° orb`
        : `${a.planetA} ${a.type} ${a.planetB} — ${a.orbDegrees}° orb [minor]`;
    })
    .join("\n");

  sections.push("NATAL ASPECTS (major first, capped at 15):", aspectList || "None", "");

  // ── PERSONAL PLANET FILTER HARD RULE ──
  sections.push(
    "═══════════════════════════════════════════",
    "PERSONAL PLANET FILTER FOR WINDOWS — HARD RULE",
    "═══════════════════════════════════════════",
    "",
    "You may ONLY create a dated window (Part 3) if the aspect involves at least one of these:",
    "  - A personal planet: Sun, Moon, Mercury, Venus, Mars, Ascendant, Midheaven, Descendant, Imum Coeli, North Node",
    "  - The Time Lord (even if not a personal planet)",
    "",
    "Any aspect involving ONLY generational planets (Uranus, Neptune, Pluto) may NEVER be used as a date anchor.",
    "",
    "If there are no personal-planet aspects in the EXACT or LIVE lists, then Part 3 must be skipped.",
    ""
  );

  // ── PART 3 — DATED WINDOWS ──
  if (hasActiveAspects && hasPersonalActive) {
    sections.push(
      "PART 3 — DATED WINDOWS (2-4 windows, as data supports):",
      "",
      "⚠️ CRITICAL: Vary your selection of timing windows across the provided date index.",
      "Never default to the first available dates unless they uniquely match the spine aspect.",
      "",
      "Available dates for this reading:",
      ...(finalDates.length > 0
        ? finalDates.map(d => `  - ${d}`)
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
      "  1. Lead with the SPINE aspect identified above",
      "  2. Prioritize topic-relevant planets and houses",
      "  3. Add any CRITICAL MASS windows",
      "  4. Add any Time Lord windows",
      "  5. Add any Mutual Reception windows (amplified)",
      "  6. Add any Synodic Cycle windows (chapter markers)",
      "  7. Fill remaining with strongest topic-relevant aspects",
      "",
      "If fewer than 2 topic-relevant EXACT/LIVE aspects exist, give only what's available.",
      ""
    );
  } else {
    sections.push(
      "PART 3 — SKIPPED: No topic-relevant personal EXACT or LIVE transit aspects.",
      "",
      `Replace Part 3 with: "There are no tight topic-relevant transit windows in the next ${FORWARD_WINDOW_DAYS} days. Your focus should be on the ${profection.activatedHouse}th House ${profection.activatedSign} year theme and the longer-term progressions unfolding."`,
      ""
    );
  }

  // ── PART 4 — DIRECTIVE ──
  sections.push(
    "PART 4 — THE DIRECTIVE (1-3 items, hard 3-sentence ceiling each):",
    "",
    "DROP: The behavior to stop immediately (ALWAYS available, no date needed)",
    "",
    "EXECUTE BY [[DATE: ...]]: A specific action for the tightest window (only if window exists)",
    "  - Must be tied to a topic-relevant window from Part 3",
    "",
    "LOCK IN BY [[DATE: ...]]: A structural commitment (only for slow planet windows)",
    "  - Must be tied to a topic-relevant slow planet window",
    "",
    "If no dated windows exist, DROP alone is a complete directive.",
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
    "1. TRANSIT TO ANGLE → Major Life Event (OUTRANKS all)",
    "2. SOLAR RETURN → External/Internal event filter",
    "3. MUTUAL RECEPTION → Amplifier (makes transits stronger)",
    "4. SYNODIC CYCLES → Chapter markers",
    "5. MIDPOINTS → Sensitive point activators",
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
    "For EVERY claim in Parts 1, 2, 3, and 4:",
    "1. Find the supporting line from the TRANSIT ASPECTS block above",
    "2. Copy that line VERBATIM into the 'placements' field",
    "3. If you cannot find a line that EXACTLY supports a claim, DO NOT make that claim",
    "",
    "Example sources entry:",
    '{',
    '  "section": "Part 1 — Spine",',
    '  "placements": "[EXACT] Saturn Rx 24°35\' Cancer square natal Moon 21°56\' Virgo — 1.2° orb, APPLYING"',
    '}',
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
    '      ]',
    '    }',
    '  ]',
    '}'
  );

  return sections.join("\n");
}