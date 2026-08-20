// ============================================================
// FILE: app/api/readings/route.ts (FIXED - DUPLICATE REMOVED)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { buildVoiceCalibrationBlock } from "@/lib/signVoice";
import { assessRisk, getSafeResponse, getCareNote } from "@/lib/crisisDetection";
import type { TransitAspect } from "@/lib/transitAspects";
import { buildValidDateIndex, findUnsupportedMarkers } from "@/lib/validateReadingDates";

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
// TYPES - Extended to match chart-calculate
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

  // ESSENTIAL CALCULATIONS (keeping only these 4)
  mutualReceptions?: MutualReception[]; // KEPT: Amplifier
  synodicCycles?: SynodicCycle[]; // KEPT: Chapter markers
  midpoints?: Midpoint[]; // KEPT: Sensitive point activator
  
  // NEW: From chart-calculate
  transitsToAngles?: TransitToAngle[]; // KEPT: For spine detection priority 1
  houseRulers?: HouseRuler[]; // KEPT: Context for house themes
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

// Angular houses (1, 4, 7, 10) - for Solar Return external event test
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
// VALIDATION - Single pass
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
// SPINE DETECTION - With Angle priority (from chart-calculate)
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

  // Filter to active aspects
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

  // Filter to personal planet aspects
  const personal: TransitAspect[] = [];
  for (const a of active) {
    if (PERSONAL_PLANETS.has(a.natalPlanet) || a.natalPlanet === profection.timeLord) {
      personal.push(a);
    }
  }

  // CHECK 1: TRANSIT TO ANGLE (Highest Priority - Major Life Event)
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

  // CHECK 5: FAST PLANET EXACT activation
  const exactFast = personal.filter(
    (a) => a.band?.toUpperCase() === "EXACT" && FAST_PLANETS.has(a.transitPlanet)
  );
  if (exactFast.length) {
    const a = exactFast[0];
    return {
      primary: `IMMEDIATE MOMENT: ${a.transitPlanet} exactly activating ${a.natalPlanet} — sharp, intense, fleeting`,
      priority: 5,
      sources: [`Transit ${a.transitPlanet} ${a.aspectType} natal ${a.natalPlanet}`],
      temporalClass: "Immediate",
      selectedAspect: a,
    };
  }

  // CHECK 6: Any LIVE aspect to personal planet
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

  // Fallback
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
// BUILD PROMPT - With all 4 essential calculations + transitsToAngles
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

  const spine = determineSpine(validatedAspects, profection, transitsToAngles, progressions, solarArcs);
  const temporal = classifyTemporal(validatedAspects, profection.timeLord);
  const personalTrigger = filterPersonalTrigger(upcomingTrigger, profection.timeLord);

  const hasActiveAspects = validatedAspects.some(
    (a) => a.band?.toUpperCase() === "EXACT" || a.band?.toUpperCase() === "LIVE"
  );

  const hasPersonalActive = validatedAspects.some(
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
  if (topic !== "general") {
    const topicMap = {
      love: "LOVE: 5th/7th/8th houses, Venus/Moon/Mars",
      money: "MONEY: 2nd/8th/11th houses, Jupiter/Venus/Saturn",
      career: "CAREER: 10th/6th/2nd houses, Saturn/Sun/Mars",
    };
    sections.push("TOPIC FOCUS — " + topicMap[topic], "");
  }

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

  // ── HOUSE RULERS (from chart-calculate) ──
  if (houseRulers && houseRulers.length > 0) {
    sections.push(
      "HOUSE RULERS (context for house themes):",
      ...houseRulers.map((h) => `House ${h.house} (${h.sign}) → ruled by ${h.ruler}`),
      ""
    );
  }

  // ============================================================
  // ESSENTIAL CALCULATION 1: MUTUAL RECEPTION (Amplifier)
  // ============================================================
  if (mutualReceptions && mutualReceptions.length > 0) {
    sections.push(
      "═══════════════════════════════════════════",
      "MUTUAL RECEPTION — AMPLIFIED CONNECTIONS",
      "═══════════════════════════════════════════",
      "",
      ...mutualReceptions.map(
        (m) => `⚡ ${m.description} → ${m.planetA} and ${m.planetB} are in each other's signs`
      ),
      "",
      "ROLE: Mutual reception AMPLIFIES any transit involving either planet.",
      "If a transit hits one of these planets, it is STRONGER than the orb suggests.",
      "Lead with these when they appear in the active transit list.",
      ""
    );
  }

  // ============================================================
  // ESSENTIAL CALCULATION 2: SYNODIC CYCLES (Chapter Markers)
  // ============================================================
  if (synodicCycles && synodicCycles.length > 0) {
    const relevantCycles = synodicCycles.filter((s) => s.daysUntilReturn <= 45);
    if (relevantCycles.length > 0) {
      sections.push(
        "═══════════════════════════════════════════",
        "SYNODIC CYCLES — MAJOR CHAPTER MARKERS",
        "═══════════════════════════════════════════",
        "",
        ...relevantCycles.map(
          (s) => `${s.planet} return in ${s.daysUntilReturn} days (${s.returnDate})`
        ),
        "",
        "ROLE: A planetary return is a MAJOR life chapter marker.",
        "If a return is approaching in the next 45 days, it is a PRIMARY date anchor.",
        "The Sun return = birthday. Moon return = monthly reset. Venus return = relationship chapter.",
        "",
        "Return windows: Mark the return date as [[DATE: X]] in Part 3.",
        ""
      );
    }
  }

  // ============================================================
  // ESSENTIAL CALCULATION 3: MIDPOINTS (Sensitive Point Activator)
  // ============================================================
  if (midpoints && midpoints.length > 0) {
    sections.push(
      "═══════════════════════════════════════════",
      "MIDPOINTS — SENSITIVE POINTS",
      "═══════════════════════════════════════════",
      "",
      ...midpoints.map(
        (m) => `${m.pointA}/${m.pointB} midpoint: ${m.sign} ${m.degree}° (House ${m.house})`
      ),
      "",
      "ROLE: Midpoints are sensitive points that can be activated by transits.",
      "If a transit hits a midpoint, it triggers both planets simultaneously.",
      "Example: Sun/Moon midpoint = relationship balance. Venus/Mars = attraction/drive.",
      ""
    );
  }

  // ── TRANSIT TO ANGLES (from chart-calculate, used in spine) ──
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

  // ── TRANSIT ASPECTS ──
  if (validatedAspects.length) {
    const personalAspects = validatedAspects.filter(
      (a) => PERSONAL_PLANETS.has(a.natalPlanet) || a.natalPlanet === profection.timeLord
    );

    const generationalCount = validatedAspects.filter(
      (a) => GENERATIONAL_PLANETS.has(a.transitPlanet) && !PERSONAL_PLANETS.has(a.natalPlanet)
    ).length;

    sections.push("TRANSIT-TO-NATAL ASPECTS — PERSONAL PLANETS ONLY:");
    sections.push(`PERSONAL ASPECTS (${personalAspects.length}):`);

    for (const a of personalAspects) {
      const band = a.band?.toUpperCase() || "";
      const rx = a.isRetrograde ? " Rx" : "";
      const motion = a.isApplying ? "APPLYING" : "SEPARATING";
      const personalMark = PERSONAL_PLANETS.has(a.natalPlanet) ? " ★" : " ⚡";
      sections.push(
        `  [${band}]${personalMark} ${a.transitPlanet}${rx} ${a.aspectType} ${a.natalPlanet} — ${a.orbDegrees}° orb, ${motion}`
      );
    }

    if (generationalCount > 0) {
      sections.push(
        "",
        `NOTE: ${generationalCount} generational aspects were filtered out.`,
        "These are universal background texture, never personal windows."
      );
    }
    sections.push("");
  } else {
    sections.push(
      "TRANSIT-TO-NATAL ASPECTS: NONE WITHIN ORB RIGHT NOW.",
      "The sky is quiet for your personal chart.",
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
      "This is the SAME aspect as in the transit list above. Mention it ONCE.",
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

  // ============================================================
  // ESSENTIAL CALCULATION 4: SOLAR RETURN (External Event Filter)
  // ============================================================
  if (solarReturn) {
    // Check if Time Lord is in an angular house in the SR chart
    const timeLordInAngularHouse = solarReturn.timeLordSRHouse !== null && 
      ANGULAR_HOUSES.has(solarReturn.timeLordSRHouse);
    
    sections.push(
      "═══════════════════════════════════════════",
      "SOLAR RETURN — EXTERNAL/INTERNAL EVENT FILTER",
      "═══════════════════════════════════════════",
      "",
      `Date: ${solarReturn.sunReturnDate} | Location: ${solarReturn.location}`,
      `SR Asc: ${solarReturn.ascendant?.sign || "N/A"} ${solarReturn.ascendant?.degree || ""}`,
      `SR MC: ${solarReturn.midheaven?.sign || "N/A"} ${solarReturn.midheaven?.degree || ""}`,
      solarReturn.timeLordInSR
        ? `Time Lord ${profection.timeLord} in SR: ${solarReturn.timeLordInSR} (House ${solarReturn.timeLordSRHouse})${timeLordInAngularHouse ? " ★ Angular House!" : ""}`
        : `Time Lord ${profection.timeLord} not prominent in SR chart`,
      "",
      "EXTERNAL EVENT TEST: A transit predicts an EXTERNAL event (job, relationship, money) ONLY if:",
      "  1. Transit planet appears in Solar Return chart, OR",
      "  2. Transit activates the Time Lord with SR support (Time Lord in angular house), OR",
      "  3. Transit hits an angular house (1, 4, 7, 10)",
      "Otherwise → INTERNAL (psychological/spiritual) interpretation.",
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
      "USE: Quiet texture, not a window anchor.",
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

  // ── SIDEREAL (Keep but minimize) ──
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
      "Each window format:",
      "  [[DATE: X]] — [one sentence on what activates] [one sentence on consequence]",
      "",
      "TIMING RULES:",
      "  - Fast planets (Mercury, Venus, Mars, Sun, Moon): ±1 day window",
      "  - Slow planets (Jupiter, Saturn, Uranus, Neptune, Pluto): ±2 week window",
      "  - Stations: ±2 day window around station date",
      "",
      "WINDOW SELECTION (PERSONAL PLANETS ONLY):",
      "  1. Lead with the SPINE aspect identified above",
      "  2. Add any CRITICAL MASS windows",
      "  3. Add any Time Lord windows",
      "  4. Add any Mutual Reception windows (amplified)",
      "  5. Add any Synodic Cycle windows (chapter markers)",
      "  6. Add any TRANSIT TO ANGLE windows (major life events)",
      "  7. Fill remaining with strongest EXACT/LIVE personal aspects",
      "  8. NEVER use BACKGROUND aspects as windows",
      "",
      "If fewer than 2 personal EXACT/LIVE aspects exist, give only what's available.",
      ""
    );
  } else {
    sections.push(
      "PART 3 — SKIPPED: No personal EXACT or LIVE transit aspects in the next 45 days.",
      "",
      `Replace Part 3 with: "There are no tight personal transit windows in the next 45 days. Your focus should be on the ${profection.activatedHouse}th House ${profection.activatedSign} year theme and the longer-term progressions unfolding."`,
      "",
      "Do NOT invent dated windows. Do NOT pad with empty predictions.",
      ""
    );
  }

  // ── PART 4 — DIRECTIVE ──
  sections.push(
    "PART 4 — THE DIRECTIVE (1-3 items, hard 3-sentence ceiling each):",
    "",
    "DROP: The behavior to stop immediately (ALWAYS available, no date needed)",
    "  - Example: 'DROP: Stop over-explaining your decisions to people who aren't listening.'",
    "",
    "EXECUTE BY [[DATE: ...]]: A specific action for the tightest window (only if window exists)",
    "  - Must be tied to a dated window from Part 3",
    "  - Example: 'EXECUTE BY [[DATE: June 14-16]]: Have the direct conversation about the budget.'",
    "",
    "LOCK IN BY [[DATE: ...]]: A structural commitment (only for slow planet windows)",
    "  - Must be tied to a slow planet window",
    "  - Example: 'LOCK IN BY [[DATE: June 25]]: Commit to the new shared budget structure.'",
    "",
    "If no dated windows exist, DROP alone is a complete directive.",
    ""
  );

  // ── HOW TO USE THE CALCULATIONS (Priority Order) ──
  sections.push(
    "═══════════════════════════════════════════",
    "HOW TO USE THE CALCULATIONS (Priority Order)",
    "═══════════════════════════════════════════",
    "",
    "1. TRANSIT TO ANGLE — Major Life Event:",
    "   When a transit hits an angle (Asc, MC, Desc, IC), it's a MAJOR life event.",
    "   This OUTRANKS all other aspects. Lead with it if present.",
    "",
    "2. SOLAR RETURN — External Event Filter:",
    "   Use this to determine if a transit predicts an EXTERNAL event or INTERNAL shift.",
    "   If the transit planet appears in the Solar Return chart → EXTERNAL.",
    "   If the Time Lord is in an angular house in SR → EXTERNAL.",
    "   If the transit hits an angular house → EXTERNAL.",
    "   Otherwise → INTERNAL (psychological, spiritual, emotional).",
    "",
    "3. MUTUAL RECEPTION — Amplifier:",
    "   When two planets are in each other's signs, any transit hitting either planet is AMPLIFIED.",
    "   If a mutual reception pair appears in the active transit list, lead with it.",
    "",
    "4. SYNODIC CYCLES — Chapter Markers:",
    "   Planetary returns (Sun, Moon, Venus, Mars, Jupiter, Saturn) are major life transitions.",
    "   If a return is within 45 days, mark it as a PRIMARY date anchor.",
    "",
    "5. MIDPOINTS — Sensitive Point Activator:",
    "   When a transit hits a midpoint, it activates both planets simultaneously.",
    "   Use midpoints to identify subtle but powerful timing windows.",
    ""
  );

  // ── SOURCE VERIFICATION ──
  sections.push(
    "═══════════════════════════════════════════",
    "SOURCE VERIFICATION — YOUR SAFETY NET",
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
    '  "placements": "[EXACT] Transit Saturn Rx 24°35\' Cancer square natal Moon 21°56\' Virgo — 1.2° orb, APPLYING"',
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
// POST HANDLER (unchanged from previous version)
// ============================================================

export async function POST(request: NextRequest) {
  // ... (same as before, no changes needed)
}

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "/api/readings", method: "POST" });
}