// ============================================================
// FILE: app/api/readings/route.ts (TOPIC-SPECIFIC WITH DATE FILTERING)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { buildVoiceCalibrationBlock } from "@/lib/signVoice";
import { assessRisk, getSafeResponse, getCareNote } from "@/lib/crisisDetection";
import type { TransitAspect } from "@/lib/transitAspects";
import { buildValidDateIndex, findUnsupportedMarkers } from "@/lib/validateReadingDates";
import { getUniqueAspectDates } from "@/lib/transitAspects";

// Import types for the 4 essential calculations
import {
  type MutualReception,
  type SynodicCycle,
  type Midpoint,
  type TransitToAngle,
  type HouseRuler,
} from "@/lib/astrologicalCalculations";

const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const FREE_READING_RESET_MS = 7 * 24 * 60 * 60 * 1000;
const CREDITS_PER_READING = 4;

// ============================================================
// TYPES
// ============================================================

interface ReadingRequestBody {
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

  // Essential calculations
  mutualReceptions?: MutualReception[];
  synodicCycles?: SynodicCycle[];
  midpoints?: Midpoint[];
  transitsToAngles?: TransitToAngle[];
  houseRulers?: HouseRuler[];
}

interface ReadingPage {
  pageNumber: 1;
  title: string;
  content: string;
  sources?: Array<{ section: string; placements: string }>;
}

// ============================================================
// CRITICAL CONSTANTS
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
  conjunction: { exact: 2.0, live: 4.0, background: 8.0 },
  opposition: { exact: 2.0, live: 4.0, background: 8.0 },
  square: { exact: 2.0, live: 4.0, background: 8.0 },
  trine: { exact: 2.0, live: 4.0, background: 8.0 },
  sextile: { exact: 1.5, live: 3.0, background: 6.0 },
  semi_sextile: { exact: 1.0, live: 2.0, background: 4.0 },
  quincunx: { exact: 1.0, live: 2.0, background: 4.0 },
};

// ============================================================
// TOPIC-SPECIFIC FILTERS
// ============================================================

function getTopicRelevantPlanets(topic: string): Set<string> {
  const base = new Set(["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"]);
  
  switch(topic) {
    case "love":
      return new Set([...base, "Venus", "Mars", "Moon", "North Node"]);
    case "money":
      return new Set([...base, "Venus", "Jupiter", "Saturn", "Pluto"]);
    case "career":
      return new Set([...base, "Saturn", "Sun", "Mars", "Jupiter", "Uranus", "Midheaven"]);
    default: // general
      return base;
  }
}

function getTopicRelevantHouses(topic: string): Set<number> {
  switch(topic) {
    case "love":
      return new Set([5, 7, 8]); // Romance, Partnerships, Intimacy
    case "money":
      return new Set([2, 8, 11]); // Income, Shared Resources, Gains
    case "career":
      return new Set([10, 6, 2]); // Vocation, Daily Work, Income
    default:
      return new Set([1, 4, 7, 10]); // Angular houses for general
  }
}

function getTopicRelevantAspects(topic: string): Set<string> {
  switch(topic) {
    case "love":
      return new Set(["conjunction", "trine", "sextile"]); // Harmonious aspects
    case "money":
      return new Set(["conjunction", "trine", "square"]); // Expansion + tension
    case "career":
      return new Set(["conjunction", "square", "opposition"]); // Tension + action
    default:
      return new Set(["conjunction", "opposition", "square", "trine", "sextile"]);
  }
}

function getTopicWindowInstruction(topic: string): string {
  const instructions = {
    love: [
      "LOVE READING — Focus on these transits:",
      "  - Venus aspects (love, attraction, values)",
      "  - Mars aspects (passion, drive, action)",
      "  - Moon aspects (emotions, nurturing, receptivity)",
      "  - 5th House activations (romance, pleasure, creativity)",
      "  - 7th House activations (partnerships, commitments)",
      "  - 8th House activations (intimacy, shared resources, depth)",
      "",
      "WINDOW INTERPRETATION:",
      "  - Venus trine Mars → magnetic attraction, chemistry",
      "  - Venus square Saturn → relationship tests, commitment fears",
      "  - Moon conjunct Venus → emotional bonding, nurturing love",
      "  - Mars in 5th → bold romantic gestures, passion",
      "",
      "🔴 AVOID: Reading money or career transits as love signals.",
    ].join("\n"),
    
    money: [
      "MONEY READING — Focus on these transits:",
      "  - Venus aspects (money, values, resources)",
      "  - Jupiter aspects (expansion, abundance, opportunity)",
      "  - Saturn aspects (structure, discipline, long-term wealth)",
      "  - Pluto aspects (transformation, power, shared resources)",
      "  - 2nd House activations (income, personal assets)",
      "  - 8th House activations (shared resources, debt, investments)",
      "  - 11th House activations (gains, networks, financial opportunities)",
      "",
      "WINDOW INTERPRETATION:",
      "  - Jupiter trine Venus → financial expansion, windfall",
      "  - Saturn square Venus → financial constraints, budgeting required",
      "  - Pluto sextile Venus → financial transformation, investment opportunity",
      "  - Venus in 2nd → income increase, value recognition",
      "",
      "🔴 AVOID: Reading romance or career transits as money signals.",
    ].join("\n"),
    
    career: [
      "CAREER READING — Focus on these transits:",
      "  - Saturn aspects (career structure, authority, long-term path)",
      "  - Sun aspects (identity, recognition, leadership)",
      "  - Mars aspects (action, ambition, drive)",
      "  - Jupiter aspects (expansion, opportunity, promotion)",
      "  - Uranus aspects (change, innovation, unexpected shifts)",
      "  - 10th House activations (vocation, public reputation, authority)",
      "  - 6th House activations (daily work, routines, service)",
      "  - 2nd House activations (income from work, value)",
      "",
      "WINDOW INTERPRETATION:",
      "  - Saturn trine Sun → career recognition, authority role",
      "  - Mars square Saturn → work pressure, ambition vs reality",
      "  - Jupiter sextile Sun → promotion, recognition, opportunity",
      "  - Uranus in 10th → career pivot, unexpected change",
      "",
      "🔴 AVOID: Reading romance or money transits as career signals.",
    ].join("\n"),
    
    general: [
      "GENERAL READING — Focus on significant transits:",
      "  - All personal planet transits",
      "  - Angular house activations (1, 4, 7, 10)",
      "  - Slow planet transits (structural shifts)",
      "  - Fast planet transits (immediate moments)",
      "",
      "WINDOW INTERPRETATION:",
      "  - Lead with the SPINE aspect",
      "  - Mix structural and immediate windows",
      "  - Include one long-term theme and one immediate action",
      "",
      "🔴 No topic filter applied — use all significant transits.",
    ].join("\n"),
  };

  return instructions[topic as keyof typeof instructions] || instructions.general;
}

// ============================================================
// FILTER TRANSITS BY TOPIC
// ============================================================

function filterTransitsByTopic(
  aspects: TransitAspect[],
  topic: string,
  timeLord: string
): TransitAspect[] {
  const relevantPlanets = getTopicRelevantPlanets(topic);
  const relevantHouses = getTopicRelevantHouses(topic);
  const relevantAspects = getTopicRelevantAspects(topic);

  const personalAspects = aspects.filter(a => 
    PERSONAL_PLANETS.has(a.natalPlanet) || a.natalPlanet === timeLord
  );

  // First pass: Filter by relevant planets and aspects
  let filtered = personalAspects.filter(a => {
    const isRelevantPlanet = relevantPlanets.has(a.transitPlanet) || 
                           relevantPlanets.has(a.natalPlanet);
    const isRelevantAspect = relevantAspects.has(a.aspectType?.toLowerCase() || "");
    return isRelevantPlanet && isRelevantAspect;
  });

  // Second pass: If we have more than 8, prioritize by house
  if (filtered.length > 8) {
    filtered = filtered.filter(a => {
      const house = a.natalHouse || 0;
      return relevantHouses.has(house);
    });
  }

  // Third pass: Still too many? Prioritize by band
  if (filtered.length > 6) {
    filtered = filtered.filter(a => 
      a.band?.toUpperCase() === "EXACT" || a.band?.toUpperCase() === "LIVE"
    );
  }

  // If we have NO filtered aspects, fall back to personal aspects
  if (filtered.length === 0) {
    console.warn(`[readings] No topic-specific transits for "${topic}", falling back to all personal aspects`);
    return personalAspects.slice(0, 6);
  }

  return filtered.slice(0, 6);
}

// ============================================================
// VALIDATION
// ============================================================

function validateAndFilterAspects(aspects: TransitAspect[] | undefined): TransitAspect[] {
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
// BUILD PROMPT - Topic-Specific Version with Date Filtering
// ============================================================

function buildReadingPrompt(body: ReadingRequestBody, validatedAspects: TransitAspect[] = []): string {
  const {
    topic,
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
  const topicRelevantAspects = filterTransitsByTopic(validatedAspects, topic, profection.timeLord);
  
  // ── COLLECT TOPIC-RELEVANT DATES ONLY ──
  // 1. Dates from topic-relevant aspects
  const aspectDates = getUniqueAspectDates(topicRelevantAspects);
  
  // 2. Upcoming trigger - only if it's topic-relevant
  const isTriggerRelevant = upcomingTrigger && (
    getTopicRelevantPlanets(topic).has(upcomingTrigger.transitPlanet) ||
    getTopicRelevantPlanets(topic).has(upcomingTrigger.natalPlanet)
  );
  const triggerDate = isTriggerRelevant ? upcomingTrigger?.date : null;
  
  // 3. Planetary stations - only if they hit a topic-relevant planet/house
  const relevantStationDates = (planetaryStations || [])
    .filter(s => {
      // Check if station hits a topic-relevant planet
      const hitsRelevantPlanet = s.natalPlanetHit && 
        getTopicRelevantPlanets(topic).has(s.natalPlanetHit);
      // Check if station is in a topic-relevant house
      const inRelevantHouse = s.natalHouse && 
        getTopicRelevantHouses(topic).has(s.natalHouse);
      return hitsRelevantPlanet || inRelevantHouse;
    })
    .map(s => s.stationDate);
  
  // 4. Synodic cycles - only returns for topic-relevant planets
  const relevantCycleDates = (synodicCycles || [])
    .filter(s => s.daysUntilReturn <= 45 && getTopicRelevantPlanets(topic).has(s.planet))
    .map(s => s.returnDate);
  
  // 5. Solar Return date - always relevant (it's a major life event)
  const solarReturnDate = solarReturn?.sunReturnDate;
  
  // 6. Transit to Angles - always relevant (major life events)
  const angleDates = (transitsToAngles || [])
    .filter(t => t.orb < 2)
    .map(t => {
      // Calculate the date this angle transit perfects
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

  const uniqueDates = [...new Set(allDates)].sort();

  // ── DEBUG: Log topic-specific dates ──
  console.log(`[DEBUG] Topic: ${topic}`);
  console.log(`[DEBUG] Topic-relevant aspect dates:`, aspectDates);
  console.log(`[DEBUG] Topic-relevant station dates:`, relevantStationDates);
  console.log(`[DEBUG] Topic-relevant cycle dates:`, relevantCycleDates);
  console.log(`[DEBUG] Total unique dates:`, uniqueDates);
  
  // For spine detection, use ALL aspects but weight topic-relevant ones
  const spine = determineSpine(
    topicRelevantAspects.length > 0 ? topicRelevantAspects : validatedAspects,
    profection,
    transitsToAngles,
    progressions,
    solarArcs
  );
  
  const temporal = classifyTemporal(topicRelevantAspects.length > 0 ? topicRelevantAspects : validatedAspects, profection.timeLord);
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
    `TOPIC: ${topic.toUpperCase()}`,
    `QUESTION: "${question}"`,
    "",
    buildVoiceCalibrationBlock(tropical.planets.map((p) => ({ name: p.name, sign: p.sign }))),
    ""
  );

  // ── TOPIC FOCUS ──
  const topicFocusMap = {
    love: "LOVE & RELATIONSHIPS — Focus on Venus, Mars, Moon, 5th/7th/8th houses",
    money: "MONEY & FINANCES — Focus on Venus, Jupiter, Saturn, 2nd/8th/11th houses",
    career: "CAREER & PROFESSION — Focus on Saturn, Sun, Mars, 10th/6th/2nd houses",
    general: "GENERAL — No topic filter, use all significant transits",
  };
  sections.push("TOPIC FOCUS — " + (topicFocusMap[topic as keyof typeof topicFocusMap] || topicFocusMap.general), "");

  // ── TOPIC-SPECIFIC WINDOW INSTRUCTION ──
  sections.push(
    "═══════════════════════════════════════════",
    "TOPIC-SPECIFIC WINDOW SELECTION",
    "═══════════════════════════════════════════",
    "",
    getTopicWindowInstruction(topic),
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
    const relevantCycles = synodicCycles.filter((s) => s.daysUntilReturn <= 45);
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

    // Group by band for clarity
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
      "Using all personal aspects for context.",
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
      "⚠️ CRITICAL: These are the ONLY dates available for this reading:",
      ...(uniqueDates.length > 0 
        ? uniqueDates.map(d => `  - ${d}`)
        : ["  - No topic-relevant dates available within the next 45 days"]),
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
      `Replace Part 3 with: "There are no tight topic-relevant transit windows in the next 45 days. Your focus should be on the ${profection.activatedHouse}th House ${profection.activatedSign} year theme and the longer-term progressions unfolding."`,
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
  const relevantPlanets = getTopicRelevantPlanets(topic);
  const relevantHouses = getTopicRelevantHouses(topic);
  const relevantAspects = getTopicRelevantAspects(topic);
  
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
    `For this reading (${topic.toUpperCase()}):`,
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

// ============================================================
// POST HANDLER
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as ReadingRequestBody;

    // Crisis check
    const risk = assessRisk(body?.question ?? "");
    if (risk.action === "block_crisis" || risk.action === "block_emergency") {
      const safe = getSafeResponse(risk);
      return NextResponse.json({
        reading: {
          id: crypto.randomUUID(),
          pages: [{
            pageNumber: 1,
            title: safe.title,
            content: safe.answer + "\n\n" + safe.confirmation,
            sources: [],
          }],
          topic: body?.topic ?? "general",
          question: body?.question ?? "",
          status: "complete",
          isSafeResponse: true,
          riskLevel: risk.level,
        },
      });
    }

    // Eligibility check
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const metadata = user.publicMetadata;

    const isSubscribed = metadata?.isSubscribed === true;
    const credits = Number(metadata?.credits ?? 0);
    const isPaid = isSubscribed || credits >= CREDITS_PER_READING;

    const lastFree = metadata?.freeReadingUsedAt ? new Date(metadata.freeReadingUsedAt as string) : null;
    const freeAvailable = !lastFree || Date.now() >= lastFree.getTime() + FREE_READING_RESET_MS;

    const cooldown = metadata?.cooldownStartedAt ? new Date(metadata.cooldownStartedAt as string) : null;
    if (!isPaid && cooldown && Date.now() < cooldown.getTime() + COOLDOWN_MS) {
      return NextResponse.json({ error: "Cooldown active. Please wait." }, { status: 403 });
    }

    if (!isPaid && !freeAvailable) {
      return NextResponse.json({ error: "Insufficient credits. Purchase more or subscribe." }, { status: 403 });
    }

    if (!body.topic || !body.question || !body.tropical || !body.transits || !body.profection) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API configuration error." }, { status: 500 });
    }

    // Validate aspects
    const validatedAspects = validateAndFilterAspects(body.transitAspects);
    body.transitAspects = validatedAspects;

    const prompt = buildReadingPrompt(body, validatedAspects);
    const dateIndex = buildValidDateIndex(body);

    // ── DEBUG: Log all available dates ──
    console.log("[DEBUG] === AVAILABLE DATES ===");
    console.log("[DEBUG] Dates from index:", dateIndex.dates.map(d => d.raw));
    console.log("[DEBUG] Upcoming trigger:", body.upcomingTrigger?.date || "none");
    console.log("[DEBUG] Planetary stations:", body.planetaryStations?.map(s => s.stationDate) || []);
    console.log("[DEBUG] Synodic cycles (within 45d):", body.synodicCycles?.filter(s => s.daysUntilReturn <= 45).map(s => s.returnDate) || []);
    console.log("[DEBUG] Transit aspects count:", validatedAspects.length);
    console.log("[DEBUG] Sample transit aspect:", validatedAspects[0] ? JSON.stringify(validatedAspects[0], null, 2) : "none");
    console.log("[DEBUG] ===========================");

    // Generate reading
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
        temperature: 0.3,
        system: "You are a precision astrological synthesis engine. Use ONLY personal-planet aspects for dated windows. Output raw JSON.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[readings] Claude error:", err);
      return NextResponse.json({ error: "Failed to generate reading." }, { status: 502 });
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text;
    if (!rawText) {
      return NextResponse.json({ error: "No response from reading engine." }, { status: 502 });
    }

    // Parse response
    try {
      let cleaned = rawText.trim();
      if (cleaned.startsWith("```")) cleaned = cleaned.slice(cleaned.indexOf("\n") + 1);
      if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, cleaned.lastIndexOf("```"));
      cleaned = cleaned.trim();

      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        cleaned = cleaned.slice(start, end + 1);
      }

      const parsed = JSON.parse(cleaned) as { pages: ReadingPage[] };

      if (!parsed.pages?.length) {
        return NextResponse.json({ error: "Invalid reading structure." }, { status: 422 });
      }

      // Verify dates
      let pages = parsed.pages;
      let unsupported = pages.flatMap((pg) => findUnsupportedMarkers(pg.content ?? "", dateIndex));

      if (unsupported.length > 0) {
        console.warn(`[readings] Unsupported dates: ${unsupported.join(" | ")}`);

        // Retry with date correction
        const retryResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 3000,
            temperature: 0.3,
            system: "You are a precision astrological synthesis engine. Use only the provided dates.",
            messages: [{
              role: "user",
              content: prompt + "\n\nDATE CORRECTION: Use only these dates: " +
                dateIndex.dates.map((d) => d.raw).join(", ") +
                "\nRewrite using ONLY these dates. Drop any unsupported windows.",
            }],
          }),
        });

        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          const retryText = retryData.content?.[0]?.text;
          if (retryText) {
            let retryCleaned = retryText.trim();
            if (retryCleaned.startsWith("```")) retryCleaned = retryCleaned.slice(retryCleaned.indexOf("\n") + 1);
            if (retryCleaned.endsWith("```")) retryCleaned = retryCleaned.slice(0, retryCleaned.lastIndexOf("```"));
            retryCleaned = retryCleaned.trim();

            const start2 = retryCleaned.indexOf("{");
            const end2 = retryCleaned.lastIndexOf("}");
            if (start2 !== -1 && end2 !== -1) {
              retryCleaned = retryCleaned.slice(start2, end2 + 1);
            }

            const retryParsed = JSON.parse(retryCleaned) as { pages: ReadingPage[] };
            if (retryParsed.pages?.length) {
              const stillBad = retryParsed.pages.flatMap((pg) =>
                findUnsupportedMarkers(pg.content ?? "", dateIndex)
              );
              if (stillBad.length === 0) {
                pages = retryParsed.pages;
                unsupported = [];
              }
            }
          }
        }
      }

      if (unsupported.length > 0) {
        console.error(`[readings] Date provenance FAILED: ${unsupported.join(" | ")}`);
        return NextResponse.json({ error: "Could not verify timing. Please try again." }, { status: 422 });
      }

      return NextResponse.json({
        reading: {
          id: crypto.randomUUID(),
          pages,
          topic: body.topic,
          question: body.question,
          status: "complete",
        },
        careNote: getCareNote(risk),
      }, { status: 201 });

    } catch (parseErr) {
      console.error("[readings] Parse error:", parseErr);
      return NextResponse.json({ error: "Failed to parse reading. Please try again." }, { status: 422 });
    }

  } catch (error) {
    console.error("[readings] Error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

// ============================================================
// GET HANDLER
// ============================================================

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "/api/readings", method: "POST" });
}