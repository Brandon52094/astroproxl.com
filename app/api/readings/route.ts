// ============================================================
// FILE: app/api/readings/route.ts (COMPLETE UPDATED)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { buildVoiceCalibrationBlock } from "@/lib/signVoice";
import { assessRisk, getSafeResponse, getCareNote } from "@/lib/crisisDetection";
import type { TransitAspect } from "@/lib/transitAspects";
import { buildValidDateIndex, findUnsupportedMarkers } from "@/lib/validateReadingDates";

// Import types from calculations
import {
  type HouseRuler,
  type MutualReception,
  type EssentialDignity,
  type SynodicCycle,
  type Midpoint,
  type LunarReturn,
  type EclipseActivation,
  type TransitToAngle,
  type DispositorResult,
} from "@/lib/astrologicalCalculations";

// Import the generation service
import { generateAdvancedCalculations, type ChartData } from "@/lib/readingCalculations";

const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const FREE_READING_RESET_MS = 7 * 24 * 60 * 60 * 1000;
const CREDITS_PER_READING = 4;

// ============================================================
// TYPES - Extended with all 10 calculations
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
  solarReturn?: any;
  moonPhase?: any;
  extendedPoints?: any;

  // Chart data for advanced calculations
  ascendantSign?: string;
  ascendantDegree?: string;
  midheavenSign?: string;
  midheavenDegree?: string;
  descendantSign?: string;
  descendantDegree?: string;
  icSign?: string;
  icDegree?: string;
  houseCusps?: Record<number, string>; // ADDED: This is needed for generateAdvancedCalculations

  // All 10 advanced calculations
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
  "Sun",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Ascendant",
  "Midheaven",
  "Descendant",
  "Imum Coeli",
  "North Node",
]);

const GENERATIONAL_PLANETS = new Set(["Uranus", "Neptune", "Pluto"]);
const SLOW_PLANETS = new Set(["Saturn", "Uranus", "Neptune", "Pluto"]);
const FAST_PLANETS = new Set(["Mercury", "Venus", "Mars", "Sun", "Moon"]);

const MAX_ORB: Record<string, number> = {
  EXACT: 1.0,
  LIVE: 3.0,
  BACKGROUND: 6.0,
};

// ============================================================
// CRITICAL CALCULATION: Validate Aspects
// ============================================================

function validateAndFilterAspects(aspects: TransitAspect[] | undefined): TransitAspect[] {
  if (!aspects?.length) return [];

  const valid: TransitAspect[] = [];
  for (const a of aspects) {
    const maxOrb = MAX_ORB[a.band?.toUpperCase() || ""];
    if (maxOrb && a.orbDegrees <= maxOrb) {
      valid.push(a);
    }
  }
  return valid;
}

// ============================================================
// CRITICAL CALCULATION: Spine Detection (Enhanced with Angles)
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

  // Filter to active aspects (EXACT or LIVE)
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

  // CHECK 2: CRITICAL MASS (Transit + Progression + Solar Arc)
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
// CRITICAL CALCULATION: Temporal Classification
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
// Helper: Filter upcoming trigger to personal planets
// ============================================================

function filterPersonalTrigger(trigger: any, timeLord: string): any | null {
  if (!trigger) return null;
  const isPersonal = PERSONAL_PLANETS.has(trigger.natalPlanet) || trigger.natalPlanet === timeLord;
  return isPersonal ? trigger : null;
}

// ============================================================
// BUILD PROMPT - Complete with all 10 calculations
// ============================================================

function buildReadingPrompt(body: ReadingRequestBody, validatedAspects: TransitAspect[] = []): string {
  const {
    topic,
    question,
    tropical,
    profection,
    progressions,
    solarArcs,
    upcomingTrigger,
    planetaryStations,
    solarReturn,
    moonPhase,
    extendedPoints,
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

  // ── HOUSE RULERS (NEW - Most Important) ──
  if (houseRulers && houseRulers.length > 0) {
    sections.push(
      "═══════════════════════════════════════════",
      "HOUSE RULERS (which planet drives each area of life)",
      "═══════════════════════════════════════════",
      "",
      ...houseRulers.map((h) => `House ${h.house} (${h.sign}) → ruled by ${h.ruler}`),
      "",
      "ROLE: When a planet transits a house, look to that house's ruler for amplification.",
      "Example: Transiting Jupiter in 7th House + 7th House ruler is Venus → Venus transits are amplified.",
      "Use this to connect multiple transits into a single coherent theme.",
      ""
    );
  }

  // ── MUTUAL RECEPTION (NEW) ──
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

  // ── ESSENTIAL DIGNITIES (NEW) ──
  if (essentialDignities && essentialDignities.length > 0) {
    const strong = essentialDignities.filter((d) => d.strength >= 8);
    const weak = essentialDignities.filter((d) => d.strength <= 3);

    sections.push(
      "═══════════════════════════════════════════",
      "ESSENTIAL DIGNITIES (how planets express)",
      "═══════════════════════════════════════════",
      "",
      ...strong.map((d) => `💪 ${d.planet} in ${d.sign} — ${d.dignity} (strength: ${d.strength}/10)`),
      ...weak.map((d) => `⚠️ ${d.planet} in ${d.sign} — ${d.dignity} (strength: ${d.strength}/10)`),
      "",
      "ROLE: Strong planets (10/8) express powerfully and naturally.",
      "Weak planets (3/2) struggle to express their themes — their transits are more difficult.",
      "If a weak planet is activated by transit, note that it will be felt more acutely.",
      ""
    );
  }

  // ── SYNODIC CYCLES (NEW) ──
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

  // ── MIDPOINTS (NEW) ──
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

  // ── LUNAR RETURN (NEW) ──
  if (lunarReturn) {
    sections.push(
      "═══════════════════════════════════════════",
      "LUNAR RETURN — MONTHLY RESET",
      "═══════════════════════════════════════════",
      "",
      `Next Lunar Return: ${lunarReturn.date} (${lunarReturn.daysUntil} days)`,
      `Moon returns to ${lunarReturn.moonSign} ${lunarReturn.moonDegree}`,
      "",
      "ROLE: The Lunar Return is a monthly reset point — the start of a new emotional cycle.",
      "If a question is about emotions, relationships, or home, this is a PRIMARY date anchor.",
      `Mark it as [[DATE: ${lunarReturn.date}]] in Part 3 if the topic is emotional.`,
      ""
    );
  }

  // ── ECLIPSE ACTIVATION (NEW) ──
  if (eclipseActivations && eclipseActivations.length > 0) {
    sections.push(
      "═══════════════════════════════════════════",
      "ECLIPSE ACTIVATION — LONG-TERM THEMES",
      "═══════════════════════════════════════════",
      "",
      ...eclipseActivations.map(
        (e) =>
          `${e.eclipseType} Eclipse on ${e.eclipseDate} at ${e.degree}° ${e.sign} — activating ${e.activatedPlanet} (${e.orb}° orb) for ${e.durationMonths} months`
      ),
      "",
      "ROLE: Eclipses activate a point for 6-12 months.",
      "If an eclipse hit a personal planet in your chart, that planet's themes are ONGOING.",
      "This is not a new event — it's a continuation of a long-term theme.",
      "",
      "If a transit hits the same planet, the transit is AMPLIFIED by the eclipse.",
      ""
    );
  }

  // ── TRANSIT TO ANGLES (NEW) ──
  if (transitsToAngles && transitsToAngles.length > 0) {
    sections.push(
      "═══════════════════════════════════════════",
      "TRANSIT TO ANGLES — MAJOR LIFE EVENTS",
      "═══════════════════════════════════════════",
      "",
      ...transitsToAngles.map(
        (t) =>
          `${t.transitPlanet} ${t.aspectType} ${t.angle} (${t.angleSign} ${t.angleDegree}°) — ${t.orb}° orb, ${t.isApplying ? "APPLYING" : "SEPARATING"}`
      ),
      "",
      "ROLE: Transits to angles are MAJOR life events. They OUTRANK all other personal-planet transits.",
      "",
      "Angle meanings:",
      "  - Ascendant: Identity, body, how you present yourself",
      "  - Midheaven: Career, public reputation, authority",
      "  - Descendant: Relationships, partnerships, open enemies",
      "  - Imum Coeli: Home, family, emotional foundation",
      "",
      "If a transit is EXACT to an angle, it is a PRIMARY date anchor.",
      "Mark it as [[DATE: ...]] in Part 3 with HIGH PRIORITY.",
      ""
    );
  }

  // ── DISPOSITOR TREE (NEW) ──
  if (dispositorTree && dispositorTree.length > 0) {
    const finalDispositors = dispositorTree.map((d) => d.finalDispositor);
    const uniqueFinal = [...new Set(finalDispositors)];

    sections.push(
      "═══════════════════════════════════════════",
      "DISPOSITOR TREE (Chain of Command)",
      "═══════════════════════════════════════════",
      "",
      ...dispositorTree.map(
        (d) =>
          `${d.planet} in ${d.sign} → ruled by ${d.dispositor} → chain: ${d.chain.join(" → ")}`
      ),
      "",
      `FINAL DISPOSITOR(S): ${uniqueFinal.join(", ")}`,
      "",
      "ROLE: The Final Dispositor is the planet that ultimately rules the entire chart.",
      "It is the 'ultimate authority' — its transits and conditions set the tone for everything else.",
      "",
      `If ${uniqueFinal.join(" or ")} is activated by a transit, that transit OUTRANKS all others.`,
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
        `NOTE: ${generationalCount} generational aspects (outer-planet to outer-planet) were filtered out.`,
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

  // ── SOLAR RETURN ──
  if (solarReturn) {
    sections.push(
      "SOLAR RETURN:",
      `Date: ${solarReturn.sunReturnDate} | Location: ${solarReturn.location}`,
      `SR Asc: ${solarReturn.ascendant?.sign || "N/A"} ${solarReturn.ascendant?.degree || ""}`,
      `SR MC: ${solarReturn.midheaven?.sign || "N/A"} ${solarReturn.midheaven?.degree || ""}`,
      solarReturn.timeLordInSR
        ? `Time Lord ${profection.timeLord} in SR: ${solarReturn.timeLordInSR} (House ${solarReturn.timeLordSRHouse})`
        : `Time Lord ${profection.timeLord} not prominent in SR chart`,
      "",
      "EXTERNAL EVENT TEST: Transit predicts EXTERNAL event only if:",
      "  1. Transit planet appears in Solar Return chart, OR",
      "  2. Transit activates Time Lord with SR support, OR",
      "  3. Transit hits angular house (1, 4, 7, 10)",
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

  // ── NATAL ASPECTS ──
  const SPEED_PRIORITY: Record<string, number> = {
    Moon: 10,
    Mercury: 9,
    Venus: 8,
    Sun: 7,
    Mars: 6,
    Jupiter: 5,
    Saturn: 4,
    Uranus: 3,
    Neptune: 2,
    Pluto: 1,
    "North Node": 5,
    Ascendant: 5,
    Midheaven: 5,
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
      const isMajor =
        SPEED_PRIORITY[a.planetA] !== undefined ||
        ["North Node", "Ascendant", "Midheaven"].includes(a.planetA);
      return isMajor
        ? `${a.planetA} ${a.type} ${a.planetB} — ${a.orbDegrees}° orb`
        : `${a.planetA} ${a.type} ${a.planetB} — ${a.orbDegrees}° orb [minor — flavor only]`;
    })
    .join("\n");

  sections.push("NATAL ASPECTS (major first, capped at 15):", aspectList || "None", "");

  // ── SIDEREAL ──
  if (tropical.planets.length && sidereal.planets.length) {
    sections.push(
      "SIDEREAL:",
      sidereal.planets.map((p) => `${p.name}: ${p.sign} ${p.degree}`).join(", "),
      ""
    );
  }

  // ── CRITICAL: PERSONAL PLANET FILTER HARD RULE ──
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
    "It can be mentioned as background texture, but never as a window.",
    "",
    "If there are no personal-planet aspects in the EXACT or LIVE lists, then Part 3 must be skipped.",
    "Replace it with: 'There are no tight personal transit windows in the next 45 days. Your focus should be on the profection year and progressions.'",
    "",
    "This is a HARD RULE. Do not violate it.",
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
      "  1. Lead with the SPINE aspect identified above (it is always personal)",
      "  2. Add any CRITICAL MASS windows",
      "  3. Add any Time Lord windows",
      "  4. Fill remaining with strongest EXACT/LIVE personal aspects",
      "  5. NEVER use BACKGROUND aspects as windows",
      "  6. NEVER use generational-only aspects as windows",
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

  // ── HOW TO USE ALL THESE CALCULATIONS ──
  sections.push(
    "═══════════════════════════════════════════",
    "HOW TO USE THESE CALCULATIONS",
    "═══════════════════════════════════════════",
    "",
    "1. PRIORITY ORDER (highest to lowest):",
    "   a. Transit to Angle → Major Life Event",
    "   b. Critical Mass (Transit + Progression + Solar Arc)",
    "   c. Time Lord Activation",
    "   d. Mutual Reception (amplifies any transit hitting either planet)",
    "   e. Synodic Cycle (Return) → Major Chapter Marker",
    "   f. Lunar Return → Monthly Reset (for emotional topics)",
    "   g. Eclipse Activation → Long-term theme continuation",
    "   h. Slow Planet (Saturn/Uranus/Neptune/Pluto) → Structural",
    "   i. Fast Planet (Mercury/Venus/Mars/Sun/Moon) → Immediate",
    "",
    "2. HOW TO WEIGHT THEM:",
    "   - A Transit to an Angle + Mutual Reception = PREDICT WITH HIGHEST CERTAINTY",
    "   - A Critical Mass + Time Lord = PREDICT WITH HIGH CERTAINTY",
    "   - A Slow Planet + Eclipse Activation = PREDICT WITH MEDIUM CERTAINTY",
    "   - A Fast Planet alone = PREDICT WITH LOW CERTAINTY (one-day event)",
    "",
    "3. IF MULTIPLE SIGNALS CONVERGE ON THE SAME DATE:",
    "   - State the prediction with full certainty.",
    "   - The convergence is the confirmation.",
    "   - Example: 'Saturn square your Sun peaks on August 20, and on that same day Venus trines your Descendant. This is not a coincidence — it is a structural shift in your relationships.'",
    "",
    "4. IF SIGNALS CONFLICT:",
    "   - Name both, but lead with the higher-priority signal.",
    "   - Example: 'A fast Mercury transit suggests a conversation on August 25, but the slower Saturn transit says the decision won't settle until September 10.'",
    ""
  );

  // ── CRITICAL: SOURCE VERIFICATION WITH EXAMPLE ──
  sections.push(
    "═══════════════════════════════════════════",
    "SOURCE VERIFICATION — YOUR SAFETY NET",
    "═══════════════════════════════════════════",
    "",
    "For EVERY claim in Parts 1, 2, 3 (each window), and 4 (each directive):",
    "",
    "1. Find the supporting line from the TRANSIT ASPECTS block above",
    "2. Copy that line VERBATIM into the 'placements' field for that section",
    "3. If multiple sources support a claim, list all that apply",
    "4. If you cannot find a line that EXACTLY supports a claim, DO NOT make that claim",
    "",
    "Example sources entry:",
    '{',
    '  "section": "Part 1 — Spine",',
    '  "placements": "[EXACT] Transit Saturn Rx 24°35\' Cancer square natal Moon 21°56\' Virgo (House 8) — 1.2° orb, APPLYING"',
    '}',
    "",
    "For stations: Use the station line verbatim from the PLANETARY STATIONS block.",
    "For progressions/solar arcs: Use the line from the progression/solar arc block.",
    "",
    "If a source line is not available for a claim, that claim must be DELETED from the reading.",
    ""
  );

  // ── PROSE PURITY RULES ──
  sections.push(
    "═══════════════════════════════════════════",
    "PROSE PURITY RULES",
    "═══════════════════════════════════════════",
    "",
    "PROSE (content field) CONTAINS:",
    "  - Human consequences: 'You'll feel pressure in your career'",
    "  - Actions: 'Start documenting your wins now'",
    "  - Emotional impacts: 'There's a pull between stability and freedom'",
    "",
    "PROSE CONTAINS NO:",
    "  - Degrees: 24°35'",
    "  - Orbs: 0.8° orb",
    "  - Technical terms: applying, separating, anaretic, ingress, cusp",
    "  - The words: 'may', 'might', 'could', 'possibly', 'perhaps'",
    "",
    "SOURCES (sources field) CONTAINS:",
    "  - Exact data lines copied verbatim from the data blocks below",
    "  - All technical precision goes here, not in the prose",
    ""
  );

  // ── OUTPUT FORMAT ──
  sections.push(
    "OUTPUT FORMAT — RAW JSON ONLY",
    "",
    "Return ONLY valid JSON. No markdown, no code fences, no explanations before or after.",
    "",
    "The response must be a single parseable JSON object:",
    '{',
    '  "pages": [',
    '    {',
    '      "pageNumber": 1,',
    '      "title": "Your Reading",',
    '      "content": "Part 1: ...\\n\\nPart 2: ...\\n\\nPart 2B: ...\\n\\nPart 3: ...\\n\\nPart 4: ...\\n\\nPart 5: ...",',
    '      "sources": [',
    '        { "section": "Part 1 — Spine", "placements": "...verbatim line..." },',
    '        { "section": "Part 2 — Root", "placements": "...verbatim line..." },',
    '        { "section": "June 14 window", "placements": "...verbatim line..." },',
    '        { "section": "DROP", "placements": "...verbatim line..." }',
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

    // ── LAYER 1: Crisis check ──
    const risk = assessRisk(body?.question ?? "");
    if (risk.action === "block_crisis" || risk.action === "block_emergency") {
      const safe = getSafeResponse(risk);
      return NextResponse.json({
        reading: {
          id: crypto.randomUUID(),
          pages: [
            {
              pageNumber: 1,
              title: safe.title,
              content: safe.answer + "\n\n" + safe.confirmation,
              sources: [],
            },
          ],
          topic: body?.topic ?? "general",
          question: body?.question ?? "",
          status: "complete",
          isSafeResponse: true,
          riskLevel: risk.level,
        },
      });
    }

    // ── LAYER 2: Eligibility check ──
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
      return NextResponse.json(
        { error: "Insufficient credits. Purchase more or subscribe." },
        { status: 403 }
      );
    }

    if (!body.topic || !body.question || !body.tropical || !body.transits || !body.profection) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API configuration error." }, { status: 500 });
    }

    // ── Validate aspects ──
    const validatedAspects = validateAndFilterAspects(body.transitAspects);
    body.transitAspects = validatedAspects;

    const prompt = buildReadingPrompt(body, validatedAspects);
    const dateIndex = buildValidDateIndex(body);

    // ── Generate reading ──
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
        system:
          "You are a precision astrological synthesis engine. Use ONLY personal-planet aspects for dated windows. Output raw JSON.",
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

    // ── Parse response ──
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

      // ── Verify dates ──
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
            messages: [
              {
                role: "user",
                content:
                  prompt +
                  "\n\nDATE CORRECTION: Use only these dates: " +
                  dateIndex.dates.map((d) => d.raw).join(", ") +
                  "\nRewrite using ONLY these dates. Drop any unsupported windows.",
              },
            ],
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

      return NextResponse.json(
        {
          reading: {
            id: crypto.randomUUID(),
            pages,
            topic: body.topic,
            question: body.question,
            status: "complete",
          },
          careNote: getCareNote(risk),
        },
        { status: 201 }
      );
    } catch (parseErr) {
      console.error("[readings] Parse error:", parseErr);
      return NextResponse.json({ error: "Failed to parse reading. Please try again." }, { status: 422 });
    }
  } catch (error) {
    console.error("[readings] Error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}