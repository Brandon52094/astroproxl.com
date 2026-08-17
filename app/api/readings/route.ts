// ============================================================
// COMPLETE UPDATED FILE: route.ts
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { buildVoiceCalibrationBlock } from "@/lib/signVoice";
import { assessRisk, getSafeResponse, getCareNote } from "@/lib/crisisDetection";
import type { TransitAspect } from "@/lib/transitAspects";
import { buildValidDateIndex, findUnsupportedMarkers } from "@/lib/validateReadingDates";

const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks
const FREE_READING_RESET_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
const CREDITS_PER_READING = 4;

// ============================================================
// TYPES
// ============================================================

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
  profectionYear: number;
  activatedHouse: number;
  activatedSign: string;
  timeLord: string;
  timeLordNatalSign: string;
  timeLordNatalHouse: number;
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

interface ReadingSource {
  section: string;
  placements: string;
}

interface ReadingPage {
  pageNumber: 1;
  title: string;
  content: string;
  sources?: ReadingSource[];
}

interface ReadingRequestBody {
  topic: "love" | "career" | "money" | "general";
  question: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  tropical: { planets: PlanetPlacement[]; aspects: Aspect[] };
  sidereal: { planets: PlanetPlacement[] };
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
}

// ============================================================
// CONSTANTS
// ============================================================

const NL = "\n";

// CRITICAL FIX: Expanded personal natal points
// These are the only points that can anchor a spine or dated window.
const PERSONAL_NATAL_POINTS = new Set([
  "Sun",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Ascendant",
  "Midheaven",
  "Descendant",      // added for relationship themes
  "Imum Coeli",      // added for home/foundation themes
  "North Node",      // added for karmic/directional themes
  // Do NOT include Uranus, Neptune, Pluto, or Chiron here.
]);

// Generational planets that should never be used as date anchors alone
const GENERATIONAL_PLANETS = new Set(["Uranus", "Neptune", "Pluto"]);

// Slow planets (structural shifts)
const SLOW_PLANETS = new Set(["Saturn", "Uranus", "Neptune", "Pluto"]);

// Fast planets (immediate moments)
const FAST_PLANETS = new Set(["Mercury", "Venus", "Mars", "Sun", "Moon"]);

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function isPersonalPlanet(planet: string): boolean {
  return PERSONAL_NATAL_POINTS.has(planet);
}

function isGenerationalPlanet(planet: string): boolean {
  return GENERATIONAL_PLANETS.has(planet);
}

function isSlowPlanet(planet: string): boolean {
  return SLOW_PLANETS.has(planet);
}

function isFastPlanet(planet: string): boolean {
  return FAST_PLANETS.has(planet);
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
  return p.name + ": " + p.sign + " " + p.degree + (p.isRetrograde ? " Rx" : "");
}

function fmtSolarArc(p: SolarArcPlanet): string {
  return p.name + ": " + p.sign + " " + p.degree;
}

// ============================================================
// VALIDATION & FILTERING
// ============================================================

function validateAndFilterAspects(aspects: TransitAspect[] | undefined): TransitAspect[] {
  if (!aspects || aspects.length === 0) return [];

  return aspects.filter((a) => {
    const maxOrbForBand: Record<string, number> = {
      EXACT: 1.0,
      LIVE: 3.0,
      BACKGROUND: 6.0,
    };
    const maxOrb = maxOrbForBand[a.band?.toUpperCase()];
    if (maxOrb === undefined) {
      console.warn(`[validation] Unknown band "${a.band}" for ${a.transitPlanet} → ${a.natalPlanet}; rejecting.`);
      return false;
    }
    if (a.orbDegrees > maxOrb) {
      console.warn(
        `[validation] Rejecting ${a.transitPlanet} → ${a.natalPlanet}: ` +
        `band=${a.band}, orb=${a.orbDegrees}° exceeds max ${maxOrb}°`
      );
      return false;
    }
    return true;
  });
}

// ============================================================
// SPINE DETECTION ENGINE (with personal-planet filtering)
// ============================================================

interface SpineResult {
  primary: string;
  priority: number;
  sources: string[];
  temporalClass: "Immediate" | "Structural" | "Foundational";
  selectedAspect?: TransitAspect;
}

function determineSpine(
  aspects: TransitAspect[],
  profection: ProfectionData,
  progressions?: ProgressedPlanet[],
  solarArcs?: SolarArcPlanet[]
): SpineResult {
  if (!aspects || aspects.length === 0) {
    return {
      primary: `${profection.activatedHouse}th House ${profection.activatedSign} Year — Time Lord: ${profection.timeLord}`,
      priority: 5,
      sources: ["No transits within orb — profection year is the primary theme"],
      temporalClass: "Foundational",
    };
  }

  const activeAspects = aspects.filter(
    (a) => a.band?.toUpperCase() === "EXACT" || a.band?.toUpperCase() === "LIVE"
  );

  if (activeAspects.length === 0) {
    return {
      primary: `${profection.activatedHouse}th House ${profection.activatedSign} Year — Time Lord: ${profection.timeLord}`,
      priority: 5,
      sources: ["No EXACT or LIVE transits — profection year is the primary theme"],
      temporalClass: "Foundational",
    };
  }

  // CRITICAL FIX: Only consider aspects where the natal point is personal
  const personalActive = activeAspects.filter(
    (a) => isPersonalPlanet(a.natalPlanet) || a.natalPlanet === profection.timeLord
  );

  // If no personal aspects exist, fall back to profection
  if (personalActive.length === 0) {
    return {
      primary: `${profection.activatedHouse}th House ${profection.activatedSign} Year — Time Lord: ${profection.timeLord}`,
      priority: 5,
      sources: ["No personal planet transits — profection year is the primary theme"],
      temporalClass: "Foundational",
    };
  }

  // Check 1: Critical Mass (Transit + Progression + Solar Arc hit same personal planet)
  for (const aspect of personalActive) {
    const progressionsHit = progressions?.some(
      (p) => p.name === aspect.natalPlanet && Math.abs(parseFloat(p.degree) - parseFloat(aspect.natalDegree)) < 2
    );
    const solarArcsHit = solarArcs?.some(
      (s) => s.name === aspect.natalPlanet && Math.abs(parseFloat(s.degree) - parseFloat(aspect.natalDegree)) < 2
    );

    if (progressionsHit && solarArcsHit) {
      return {
        primary: `CRITICAL MASS: Transit ${aspect.transitPlanet} + Progression + Solar Arc activating ${aspect.natalPlanet}`,
        priority: 1,
        sources: [
          `Transit ${aspect.transitPlanet} ${aspect.aspectType} natal ${aspect.natalPlanet}`,
          `Progression activating ${aspect.natalPlanet}`,
          `Solar Arc activating ${aspect.natalPlanet}`,
        ],
        temporalClass: aspect.orbDegrees < 1 ? "Immediate" : "Structural",
        selectedAspect: aspect,
      };
    }
  }

  // Check 2: Time Lord Activation (Time Lord is always personal)
  for (const aspect of personalActive) {
    if (aspect.natalPlanet === profection.timeLord) {
      return {
        primary: `TIME LORD ACTIVATION: ${profection.timeLord} (${profection.activatedHouse}th House Lord) activated by ${aspect.transitPlanet}`,
        priority: 2,
        sources: [`Transit ${aspect.transitPlanet} ${aspect.aspectType} natal ${aspect.natalPlanet}`],
        temporalClass: aspect.orbDegrees < 1 ? "Immediate" : "Structural",
        selectedAspect: aspect,
      };
    }
  }

  // CRITICAL FIX: Check 3 — Slow Planet activating a PERSONAL planet (not generational)
  for (const aspect of personalActive) {
    if (isSlowPlanet(aspect.transitPlanet) && isPersonalPlanet(aspect.natalPlanet)) {
      return {
        primary: `STRUCTURAL SHIFT: ${aspect.transitPlanet} activating ${aspect.natalPlanet} — lasts weeks/months`,
        priority: 3,
        sources: [`Transit ${aspect.transitPlanet} ${aspect.aspectType} natal ${aspect.natalPlanet}`],
        temporalClass: "Structural",
        selectedAspect: aspect,
      };
    }
  }

  // Check 4: Fast Planet Activation (EXACT only) on personal planet
  const exactFast = personalActive.filter(
    (a) => a.band?.toUpperCase() === "EXACT" && isFastPlanet(a.transitPlanet)
  );
  if (exactFast.length > 0) {
    const aspect = exactFast[0];
    return {
      primary: `IMMEDIATE MOMENT: ${aspect.transitPlanet} exactly activating ${aspect.natalPlanet} — sharp, intense, fleeting`,
      priority: 4,
      sources: [`Transit ${aspect.transitPlanet} ${aspect.aspectType} natal ${aspect.natalPlanet}`],
      temporalClass: "Immediate",
      selectedAspect: aspect,
    };
  }

  // Check 5: Any LIVE aspect to a personal planet
  if (personalActive.length > 0) {
    const aspect = personalActive[0];
    return {
      primary: `${aspect.transitPlanet} activating ${aspect.natalPlanet} — active and unfolding`,
      priority: 5,
      sources: [`Transit ${aspect.transitPlanet} ${aspect.aspectType} natal ${aspect.natalPlanet}`],
      temporalClass: aspect.orbDegrees < 1 ? "Immediate" : "Structural",
      selectedAspect: aspect,
    };
  }

  // Fallback
  return {
    primary: `${profection.activatedHouse}th House ${profection.activatedSign} Year — Time Lord: ${profection.timeLord}`,
    priority: 5,
    sources: ["No personal planet transits — profection year is the primary theme"],
    temporalClass: "Foundational",
  };
}

// ============================================================
// TEMPORAL CLASSIFICATION (with personal-planet filtering)
// ============================================================

function classifyTemporal(aspects: TransitAspect[], timeLord: string): {
  immediate: TransitAspect[];
  structural: TransitAspect[];
  background: TransitAspect[];
} {
  const immediate: TransitAspect[] = [];
  const structural: TransitAspect[] = [];
  const background: TransitAspect[] = [];

  for (const a of aspects) {
    const band = a.band?.toUpperCase();
    const isPersonal = isPersonalPlanet(a.natalPlanet) || a.natalPlanet === timeLord;
    const isGenerational = isGenerationalPlanet(a.transitPlanet) && !isPersonal;

    // BACKGROUND aspects never become windows
    if (band === "BACKGROUND") {
      background.push(a);
      continue;
    }

    // Generational-only aspects never become windows
    if (isGenerational) {
      background.push(a);
      continue;
    }

    // Only personal aspects can become windows
    if (!isPersonal) {
      background.push(a);
      continue;
    }

    if (band === "EXACT") {
      if (isFastPlanet(a.transitPlanet)) {
        immediate.push(a);
      } else {
        structural.push(a);
      }
    } else if (band === "LIVE") {
      if (isSlowPlanet(a.transitPlanet)) {
        structural.push(a);
      } else {
        immediate.push(a);
      }
    }
  }

  return { immediate, structural, background };
}

// ============================================================
// FILTER UPCOMING TRIGGER TO PERSONAL PLANETS
// ============================================================

function filterPersonalUpcomingTrigger(
  trigger: UpcomingTrigger | undefined,
  timeLord: string
): UpcomingTrigger | null {
  if (!trigger) return null;
  const isPersonal = isPersonalPlanet(trigger.natalPlanet) || trigger.natalPlanet === timeLord;
  return isPersonal ? trigger : null;
}

// ============================================================
// FORMAT TRANSIT ASPECTS (with band grouping and personal filter)
// ============================================================

function fmtTransitAspects(aspects: TransitAspect[], timeLord: string): string {
  if (!aspects || aspects.length === 0) {
    return [
      "TRANSIT-TO-NATAL ASPECTS: NONE WITHIN ORB RIGHT NOW.",
      "",
      "The sky is quiet for your personal chart. There are no transiting planets",
      "making aspects to your natal planets within the calculated orb.",
      "",
      "INSTRUCTIONS:",
      "- Lead with the PROFECTION YEAR and PROGRESSIONS as your structural anchors.",
      "- Skip Part 3 entirely. Replace with: 'There are no tight transit windows in the next 45 days.'",
      "- Do NOT invent transits. If they are not here, they are not happening.",
      "- This is a period of slow, internal unfolding — not external events.",
    ].join(NL);
  }

  // CRITICAL FIX: Filter for personal aspects only
  const personalAspects = aspects.filter(
    (a) => isPersonalPlanet(a.natalPlanet) || a.natalPlanet === timeLord
  );

  const exact = personalAspects.filter((a) => a.band?.toUpperCase() === "EXACT");
  const live = personalAspects.filter((a) => a.band?.toUpperCase() === "LIVE");
  const background = aspects.filter((a) => a.band?.toUpperCase() === "BACKGROUND");

  // Count generational-only aspects (for transparency)
  const generationalCount = aspects.filter(
    (a) => isGenerationalPlanet(a.transitPlanet) && !isPersonalPlanet(a.natalPlanet)
  ).length;

  const lines = [
    "TRANSIT-TO-NATAL ASPECTS — PRE-CALCULATED, DO NOT COMPUTE",
    "",
    "BAND MEANING:",
    "EXACT (< 1°) = FIRING NOW — lead with these, give dated windows",
    "LIVE (< 3°) = ACTIVE — secondary windows, structural context",
    "BACKGROUND (3-6°) = QUIET TEXTURE — name briefly, never a window",
    "",
    `PERSONAL ASPECTS (${personalAspects.length}):`,
    "",
  ];

  if (exact.length > 0) {
    lines.push(`EXACT ASPECTS (${exact.length}):`);
    for (const a of exact) {
      const motion = a.isApplying ? "APPLYING" : "SEPARATING";
      const rx = a.isRetrograde ? " Rx" : "";
      const personalMark = isPersonalPlanet(a.natalPlanet) ? " ★" : " ⚡";
      lines.push(
        `  • [EXACT]${personalMark} ${a.transitPlanet}${rx} ${a.transitSign} ${a.transitDegree} ` +
        `${a.aspectType} natal ${a.natalPlanet} ${a.natalSign} ${a.natalDegree} ` +
        `(House ${a.natalHouse ?? "—"}) — ${a.orbDegrees}° orb, ${motion}`
      );
    }
    lines.push("");
  }

  if (live.length > 0) {
    lines.push(`LIVE ASPECTS (${live.length}):`);
    for (const a of live) {
      const motion = a.isApplying ? "APPLYING" : "SEPARATING";
      const rx = a.isRetrograde ? " Rx" : "";
      const personalMark = isPersonalPlanet(a.natalPlanet) ? " ★" : " ⚡";
      lines.push(
        `  • [LIVE]${personalMark} ${a.transitPlanet}${rx} ${a.transitSign} ${a.transitDegree} ` +
        `${a.aspectType} natal ${a.natalPlanet} ${a.natalSign} ${a.natalDegree} ` +
        `(House ${a.natalHouse ?? "—"}) — ${a.orbDegrees}° orb, ${motion}`
      );
    }
    lines.push("");
  }

  if (background.length > 0) {
    lines.push(`BACKGROUND ASPECTS (${background.length} — texture only, no windows):`);
    for (const a of background) {
      const motion = a.isApplying ? "APPLYING" : "SEPARATING";
      const rx = a.isRetrograde ? " Rx" : "";
      lines.push(
        `  • [BACKGROUND] ${a.transitPlanet}${rx} ${a.transitSign} ${a.transitDegree} ` +
        `${a.aspectType} natal ${a.natalPlanet} ${a.natalSign} ${a.natalDegree} ` +
        `(House ${a.natalHouse ?? "—"}) — ${a.orbDegrees}° orb, ${motion}`
      );
    }
  }

  if (generationalCount > 0) {
    lines.push(
      "",
      `NOTE: ${generationalCount} generational aspects (outer-planet to outer-planet) were filtered out.`,
      "These are universal background texture, never personal windows."
    );
  }

  return lines.join(NL);
}

// ============================================================
// TOPIC SIGNIFICATOR
// ============================================================

function buildTopicSignificator(topic: "love" | "career" | "money" | "general"): string {
  if (topic === "general") {
    return [
      "TOPIC: GENERAL — No domain filter applied.",
      "Select the spine purely by the hierarchy above. Do not overweight any specific houses or planets.",
      "",
    ].join(NL);
  }

  const map = {
    love: {
      label: "LOVE & RELATIONSHIPS",
      houses: "5th (romance), 7th (partnership), 8th (intimacy)",
      planets: "Venus, Moon, Mars",
      points: "Descendant",
      guard: "Do not read 2nd/10th house money/career signals as love.",
    },
    money: {
      label: "MONEY & FINANCES",
      houses: "2nd (income), 8th (shared/debt), 11th (gains)",
      planets: "Jupiter, Venus, Saturn",
      points: "Lot of Fortune",
      guard: "Do not read 5th/7th romance as money.",
    },
    career: {
      label: "CAREER & PROFESSIONAL",
      houses: "10th (vocation), 6th (daily work), 2nd (income)",
      planets: "Saturn, Sun, Mars",
      points: "Midheaven",
      guard: "Do not read 5th/7th romance as career.",
    },
  };

  const t = map[topic];
  return [
    `TOPIC FOCUS — ${t.label}`,
    `Relevant houses: ${t.houses}`,
    `Relevant planets: ${t.planets}`,
    `Relevant points: ${t.points}`,
    `Apply the SPINE HIERARCHY first, THEN weight toward these elements.`,
    t.guard,
    "",
  ].join(NL);
}

// ============================================================
// DATE CORRECTION
// ============================================================

function allowedDatesInstruction(index: ReturnType<typeof buildValidDateIndex>): string {
  const allowed = index.dates.map((d) => d.raw);
  if (allowed.length === 0) {
    return (
      NL + NL +
      "DATE CORRECTION: Your previous draft named a date the chart data does not support. " +
      "There are NO calculated dates available for this reading. Rewrite it with NO [[DATE: ...]] markers " +
      "at all. Drop every dated window and use a DROP-only directive."
    );
  }
  return (
    NL + NL +
    "DATE CORRECTION: Your previous draft used a date not in the supplied data. " +
    "The ONLY dates you may place inside [[DATE: ...]] markers are the calculated trigger dates below. " +
    "These are the precise moments the ephemeris aspects perfect. You MUST match each date to the aspect " +
    "it belongs to—do not swap them. Allowed dates: " + allowed.map((d) => `'${d}'`).join(", ") + NL +
    "Rewrite the reading using ONLY these dates, keeping each date paired with the transit it was calculated for. " +
    "If a window has no supported date, drop that window entirely." +
    "IMPORTANT: If you use a date range (e.g., [[DATE: June 28-July 3]]), both endpoints must be from the allowed list above."
  );
}

// ============================================================
// BUILD READING PROMPT (REFACTORED WITH PERSONAL-PLANET FILTER)
// ============================================================

function buildReadingPrompt(body: ReadingRequestBody, validatedAspects: TransitAspect[] = []): string {
  const {
    topic,
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
  } = body;

  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const topicLabel =
    topic === "love"
      ? "love and relationships"
      : topic === "career"
      ? "career and professional life"
      : topic === "money"
      ? "money and finances"
      : "life in general";

  // CRITICAL FIX: Filter upcoming trigger to personal planets only
  const personalTrigger = filterPersonalUpcomingTrigger(upcomingTrigger, profection.timeLord);

  // ── SPINE DETECTION ──
  const spine = determineSpine(validatedAspects, profection, progressions, solarArcs);
  const temporal = classifyTemporal(validatedAspects, profection.timeLord);
  const hasActiveAspects = validatedAspects.some(
    (a) => a.band?.toUpperCase() === "EXACT" || a.band?.toUpperCase() === "LIVE"
  );

  // CRITICAL FIX: Check if we have personal active aspects
  const hasPersonalActive = validatedAspects.some(
    (a) => (a.band?.toUpperCase() === "EXACT" || a.band?.toUpperCase() === "LIVE") &&
    (isPersonalPlanet(a.natalPlanet) || a.natalPlanet === profection.timeLord)
  );

  // ── DATA BLOCKS ──

  const transitAspectBlock = fmtTransitAspects(validatedAspects, profection.timeLord);

  const profectionBlock = [
    "PROFECTION YEAR — FOUNDATIONAL CONTAINER FOR ALL OTHER DATA",
    `Age ${profection.age} → House ${profection.activatedHouse} (${profection.activatedSign})`,
    `Time Lord: ${profection.timeLord} (Natal: ${profection.timeLordNatalSign}, House ${profection.timeLordNatalHouse})`,
    "",
    "This is your YEAR-LONG THEME. Everything below happens WITHIN this container.",
    `If a transit aspects your Time Lord (${profection.timeLord}), that transit OUTRANKS all others.`,
    "",
  ].join(NL);

  const progressionsBlock =
    progressions && progressions.length > 0
      ? [
          "PROGRESSIONS (Internal Evolution — long-term changes):",
          progressions.map(fmtProgression).join(", "),
          "",
          "Cross-reference with transits for CRITICAL MASS detection.",
          "",
        ].join(NL)
      : "";

  const solarArcsBlock =
    solarArcs && solarArcs.length > 0
      ? [
          "SOLAR ARCS (External Development — life unfolding):",
          solarArcs.map(fmtSolarArc).join(", "),
          "",
          "Cross-reference with transits for CRITICAL MASS detection.",
          "",
        ].join(NL)
      : "";

  const solarReturnBlock = solarReturn
    ? [
        "SOLAR RETURN — EXTERNAL/INTERNAL EVENT FILTER",
        `Date: ${solarReturn.sunReturnDate} | Location: ${solarReturn.location}`,
        `SR Asc: ${solarReturn.ascendant.sign} ${solarReturn.ascendant.degree}`,
        `SR MC: ${solarReturn.midheaven.sign} ${solarReturn.midheaven.degree}`,
        solarReturn.timeLordInSR
          ? `Time Lord ${profection.timeLord} in SR: ${solarReturn.timeLordInSR} (House ${solarReturn.timeLordSRHouse})`
          : `Time Lord ${profection.timeLord} not prominent in SR chart`,
        "",
        `SR Planets: ${solarReturn.planets.map((p) => `${p.name} ${p.sign} H${p.house}`).join(", ")}`,
        "",
        "EXTERNAL EVENT TEST: A transit predicts an EXTERNAL event (job, relationship, money) ONLY if:",
        "  1. Transit planet appears in Solar Return chart, OR",
        "  2. Transit activates the Time Lord with SR support, OR",
        "  3. Transit hits an angular house (1, 4, 7, 10)",
        "Otherwise → INTERNAL (psychological/spiritual) interpretation.",
        "",
      ].join(NL)
    : "";

  const stationsBlock =
    planetaryStations && planetaryStations.length > 0
      ? [
          "PLANETARY STATIONS — EVENT ANCHORS",
          ...planetaryStations.map((s) => {
            const hit = s.natalPlanetHit
              ? ` → ${s.orbDegrees}° from natal ${s.natalPlanetHit} (House ${s.natalHouse})`
              : " → No exact natal hit";
            return `${s.planet} stations ${s.stationType.toUpperCase()} on ${s.stationDate} at ${s.degree} ${s.sign}${hit}`;
          }),
          "",
          "STATION RULES:",
          "  - Direct station = 'green light' → EXECUTE directives",
          "  - Retrograde station = 'pause and review' → DROP directives",
          "  - Station within 3° of natal point = STRONG window",
          "",
        ].join(NL)
      : "";

  const moonPhaseBlock = moonPhase
    ? [
        "MOON PHASE — EMOTIONAL UNDERTONE",
        `${moonPhase.phaseName}, ${moonPhase.illuminationPercent}% illuminated`,
        `Moon in ${moonPhase.moonSign} ${moonPhase.moonDegree}`,
        `Next ${moonPhase.nextEventName} in ${moonPhase.daysUntilNextEvent} days`,
        "",
        "USE: Quiet texture in Part 2B, not a window anchor.",
        "",
      ].join(NL)
    : "";

  const extendedBlock = (() => {
    if (!extendedPoints) return "";
    const { arabicLots, declinations } = extendedPoints;
    const oob = (declinations ?? []).filter((d) => d.isOutOfBounds);
    if (arabicLots.length === 0 && oob.length === 0) return "";

    const parts = [];
    if (arabicLots.length > 0) {
      parts.push(
        `Lots: ${arabicLots.map((l) => `${l.name} in ${l.sign} (H${l.house})`).join(", ")}`
      );
    }
    if (oob.length > 0) {
      parts.push(
        `Out-of-bounds: ${oob.map((d) => `${d.planet} (${d.declination}°)`).join(", ")}`
      );
    }
    return [
      "EXTENDED POINTS — NUANCE/CONFIRMATION",
      parts.join(" | "),
      "",
      "USE:",
      "  - Lot of Fortune confirms abundance/financial themes",
      "  - Out-of-bounds planets indicate 'unconventional expression'",
      "  - If a transit hits an OOB planet, it's 'breaking the rules' energy",
      "",
    ].join(NL);
  })();

  const siderealBlock = [
    "SIDEREAL PLACEMENTS — CONFIRMATION FILTER",
    sidereal.planets.map(fmtPlanet).join(", "),
    "",
    "Cross-check tropical vs sidereal. If they disagree on house/sign, note the discrepancy",
    "in your internal reasoning and weight the tropical reading more heavily.",
    "",
  ].join(NL);

  // Natal Aspects (ranked, capped at 15)
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
      return isMajor ? fmtAspect(a) : `${fmtAspect(a)}  [minor — flavor only]`;
    })
    .join(NL);

  const planetList = tropical.planets.map(fmtPlanet).join(NL);

  const anareticBlock = (() => {
    const anaretic = tropical.planets.filter((p) => p.isAnaretic);
    if (anaretic.length === 0) return "";
    return `ANARETIC PLANETS (final degree): ${anaretic.map((p) => `${p.name} (${p.sign})`).join(", ")}`;
  })();

  const transitList = transits.map(fmtTransit).join(NL);

  const upcomingBlock = personalTrigger
    ? [
        "NEXT EXACT ASPECT — MERGE WITH WINDOWS, DO NOT DUPLICATE",
        `${personalTrigger.transitPlanet} ${personalTrigger.aspect} natal ${personalTrigger.natalPlanet} — exact on ${personalTrigger.date}`,
        "",
        "This is the SAME aspect as in the transit list above. Mention it ONCE as the 'nearest exact activation'.",
        "Do NOT create two separate windows.",
        "",
      ].join(NL)
    : "No personal upcoming trigger within 45 days.";

  const voiceBlock = buildVoiceCalibrationBlock(
    tropical.planets.map((p) => ({ name: p.name, sign: p.sign }))
  );

  const topicBlock = buildTopicSignificator(topic);

  // ── TEMPORAL SUMMARY ──
  const temporalSummary = [
    "TEMPORAL CLASSIFICATION — SPLIT THE FUTURE",
    "",
    `IMMEDIATE (0-4 weeks): ${temporal.immediate.length} aspects`,
    `  ${temporal.immediate.map((a) => `${a.transitPlanet} ${a.aspectType} ${a.natalPlanet}`).join(", ") || "None"}`,
    "",
    `STRUCTURAL (2-6 months): ${temporal.structural.length} aspects`,
    `  ${temporal.structural.map((a) => `${a.transitPlanet} ${a.aspectType} ${a.natalPlanet}`).join(", ") || "None"}`,
    "",
    `BACKGROUND (texture only): ${temporal.background.length} aspects`,
    "",
    "Never collapse Immediate and Structural into one timeframe.",
    "",
  ].join(NL);

  // ── CRITICAL FIX: PART 3 WINDOW INSTRUCTION WITH PERSONAL-PLANET RULE ──
  const part3Instruction = (hasActiveAspects && hasPersonalActive)
    ? [
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
        "",
        "═══════════════════════════════════════════",
        "PART 3 — DATED WINDOWS (2-4 windows, as data supports)",
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
        "",
      ].join(NL)
    : [
        "PART 3 — SKIPPED: No personal EXACT or LIVE transit aspects in the next 45 days.",
        "",
        "Replace Part 3 with:",
        `  "There are no tight personal transit windows in the next 45 days. Your focus should be on the ${profection.activatedHouse}th House ${profection.activatedSign} year theme and the longer-term progressions unfolding."`,
        "",
        "Do NOT invent dated windows. Do NOT pad with empty predictions.",
        "",
      ].join(NL);

  // ── CRITICAL FIX: HIERARCHY RULES EXPLICITLY STATED ──
  const hierarchyRules = [
    "═══════════════════════════════════════════",
    "SPINE HIERARCHY RULES (applied in this order)",
    "═══════════════════════════════════════════",
    "",
    "1. CRITICAL MASS: Transit + Progression + Solar Arc hit same personal planet → strongest signal.",
    "2. TIME LORD ACTIVATION: Transit aspects the Time Lord → outranks everything else.",
    "3. SLOW PLANET (Saturn, Uranus, Neptune, Pluto) aspecting a PERSONAL PLANET → structural shift.",
    "4. FAST PLANET (Mercury, Venus, Mars, Sun, Moon) EXACT aspect to a PERSONAL PLANET → immediate moment.",
    "5. Any LIVE aspect to a PERSONAL PLANET → active unfolding.",
    "6. No personal aspects → lead with the profection year and skip dated windows.",
    "",
    `SPINE IDENTIFIED: ${spine.primary}`,
    `PRIORITY: ${spine.priority} (1 = highest)`,
    `TEMPORAL CLASS: ${spine.temporalClass}`,
    "",
    "You MUST lead Part 1 with this spine. Do not override it with a lower-priority aspect.",
    "",
  ].join(NL);

  // ── PART 4 DIRECTIVE INSTRUCTION ──
  const part4Instruction = [
    "PART 4 — THE DIRECTIVE (1-3 items, hard 3-sentence ceiling each)",
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
    "",
  ].join(NL);

  // ── SOURCE VERIFICATION ──
  const sourceInstruction = [
    "SOURCE VERIFICATION — YOUR SAFETY NET",
    "",
    "For EVERY claim in Parts 1, 2, 3 (each window), and 4 (each directive):",
    "",
    "1. Find the supporting line from the TRANSIT-TO-NATAL ASPECTS block above",
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
    "For stations: Use the station line verbatim from the STATIONS block.",
    "For progressions/solar arcs: Use the line from the progression/solar arc block.",
    "",
  ].join(NL);

  // ── OUTPUT FORMAT ──
  const outputFormat = [
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
    '}',
    "",
  ].join(NL);

  // ── ASSEMBLE FINAL PROMPT ──

  const lines = [
    "═══════════════════════════════════════════",
    "ASTROLOGICAL SYNTHESIS ENGINE",
    "═══════════════════════════════════════════",
    "",
    `TODAY: ${currentDate}`,
    `TOPIC: ${topic.toUpperCase()}`,
    `QUESTION: "${question}"`,
    "",
    voiceBlock,
    "",
    topicBlock,
    "",
    hierarchyRules,
    "",
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
    "  - Technical terms: applying, separating, anaretic",
    "",
    "SOURCES (sources field) CONTAINS:",
    "  - Exact data lines copied verbatim from the data blocks below",
    "  - All technical precision goes here, not in the prose",
    "",
    "═══════════════════════════════════════════",
    "EXTERNAL VS INTERNAL FILTER",
    "═══════════════════════════════════════════",
    "",
    solarReturnBlock || "No Solar Return data available — default all events to INTERNAL.",
    "",
    "═══════════════════════════════════════════",
    "PROFECTION FOUNDATION",
    "═══════════════════════════════════════════",
    "",
    profectionBlock,
    "",
    "═══════════════════════════════════════════",
    "PROGRESSIONS & SOLAR ARCS",
    "═══════════════════════════════════════════",
    "",
    progressionsBlock,
    solarArcsBlock,
    "",
    "═══════════════════════════════════════════",
    "PLANETARY STATIONS",
    "═══════════════════════════════════════════",
    "",
    stationsBlock || "No planetary stations within orb in the next 60 days.",
    "",
    "═══════════════════════════════════════════",
    "MOON PHASE",
    "═══════════════════════════════════════════",
    "",
    moonPhaseBlock || "Moon phase data not available.",
    "",
    "═══════════════════════════════════════════",
    "EXTENDED POINTS",
    "═══════════════════════════════════════════",
    "",
    extendedBlock || "No extended points available.",
    "",
    "═══════════════════════════════════════════",
    "TRANSIT-TO-NATAL ASPECTS — PRIMARY DATA",
    "═══════════════════════════════════════════",
    "",
    transitAspectBlock,
    "",
    "═══════════════════════════════════════════",
    "NATAL CHART DATA (for reference)",
    "═══════════════════════════════════════════",
    "",
    "TROPICAL PLACEMENTS:",
    planetList,
    "",
    anareticBlock,
    "",
    "NATAL ASPECTS (ranked, major first, capped at 15):",
    aspectList,
    "",
    "═══════════════════════════════════════════",
    "SIDEREAL (confirmation filter)",
    "═══════════════════════════════════════════",
    "",
    siderealBlock,
    "",
    "═══════════════════════════════════════════",
    "CURRENT TRANSIT POSITIONS",
    "═══════════════════════════════════════════",
    "",
    transitList,
    "",
    "═══════════════════════════════════════════",
    "UPCOMING TRIGGER",
    "═══════════════════════════════════════════",
    "",
    upcomingBlock,
    "",
    "═══════════════════════════════════════════",
    "TEMPORAL CLASSIFICATION",
    "═══════════════════════════════════════════",
    "",
    temporalSummary,
    "",
    "═══════════════════════════════════════════",
    "READING STRUCTURE",
    "═══════════════════════════════════════════",
    "",
    "### Part 1 — Where You Are (1 compact paragraph)",
    "Open with the spine: " + spine.primary,
    "Translate the house into its meaning.",
    "State one concrete behavioral consequence.",
    "End with one acute tension sentence.",
    "",
    "### Part 2 — The Root (exactly 2 sentences)",
    "Name the tightest natal aspect the spine lands on.",
    "Name the loop it produces in them — once, bluntly.",
    "Bridge to show this is happening TO them, not a character study.",
    "",
    "### Part 2B — Other Currents (1-2 sentences, OPTIONAL)",
    "Only if real minor aspects exist (LIVE or BACKGROUND).",
    "Name ONE or TWO aspects that run parallel to the spine.",
    "Keep it quiet: 'Underneath that, [planet] is also quietly stirring [house theme].'",
    "If nothing worth naming, SKIP this section entirely.",
    "",
    part3Instruction,
    "",
    part4Instruction,
    "",
    "### Part 5 — The Actual Answer (1-2 warm sentences)",
    "Directly answer their literal question in plain human language.",
    "No astrology, no jargon, no hedging.",
    "This is where the reading stops being a report and becomes a person talking to them.",
    "",
    "═══════════════════════════════════════════",
    "SOURCE VERIFICATION",
    "═══════════════════════════════════════════",
    "",
    sourceInstruction,
    "",
    "═══════════════════════════════════════════",
    "OUTPUT FORMAT",
    "═══════════════════════════════════════════",
    "",
    outputFormat,
  ];

  return lines.join(NL);
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

    // ── LAYER 1: crisis check ──
    const risk = assessRisk(body?.question ?? "");
    if (risk.action === "block_crisis" || risk.action === "block_emergency") {
      const safe = getSafeResponse(risk);
      console.warn(
        `[readings] Layer 1 block — level=${risk.level} action=${risk.action} ` +
        `conf=${risk.confidence} signals=${risk.signals.join("|")}`
      );
      return NextResponse.json(
        {
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
          isSafeResponse: true,
          riskLevel: risk.level,
        },
        { status: 200 }
      );
    }
    const careNote = getCareNote(risk);

    // ── Eligibility check ──
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const metadata = user.publicMetadata;

    const isSubscribed = metadata?.isSubscribed === true;
    const credits = Number(metadata?.credits ?? 0);
    const hasEnoughCredits = credits >= CREDITS_PER_READING;
    const isPaidReading = isSubscribed || hasEnoughCredits;

    const lastFreeReading = metadata?.freeReadingUsedAt
      ? new Date(metadata.freeReadingUsedAt as string)
      : null;
    const freeReadingAvailable = !lastFreeReading ||
      Date.now() >= lastFreeReading.getTime() + FREE_READING_RESET_MS;

    const cooldownStartedAt = metadata?.cooldownStartedAt
      ? new Date(metadata.cooldownStartedAt as string)
      : null;
    const onCooldown = !isPaidReading && !!cooldownStartedAt &&
      Date.now() < cooldownStartedAt.getTime() + COOLDOWN_MS;

    if (onCooldown) {
      return NextResponse.json({ error: "You're on cooldown. Please wait before starting a new reading." }, { status: 403 });
    }

    const eligible = isPaidReading || freeReadingAvailable;
    if (!eligible) {
      return NextResponse.json({ error: "You don't have enough credits for a reading. Please purchase more or subscribe." }, { status: 403 });
    }

    if (!body.topic || !body.question || !body.tropical || !body.transits || !body.profection) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API configuration error." }, { status: 500 });
    }

    // Validate transit aspects before building prompt
    const validatedAspects = validateAndFilterAspects(body.transitAspects);
    body.transitAspects = validatedAspects;

    const prompt = buildReadingPrompt(body, validatedAspects);
    const dateIndex = buildValidDateIndex(body);

    if (dateIndex.unparseableSupplied.length > 0) {
      console.warn(`[readings] supplied dates failed to parse (format bug?): ${dateIndex.unparseableSupplied.join(" ; ")}`);
    }

    // ── GENERATE FUNCTION ──
    async function generate(
      promptText: string,
    ): Promise<{ ok: true; pages: ReadingPage[] } | { ok: false; status: number; error: string }> {
      if (!apiKey) {
        return { ok: false, status: 500, error: "API key is not configured" };
      }

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
            "You are a precision astrological SYNTHESIS ENGINE. " +
            "You produce readings that are accurate, integrated, practical, and verifiable. " +
            "You work ONLY with the data provided. Never invent aspects, dates, or events. " +
            "You ONLY use personal-planet aspects for dated windows. " +
            "Generational aspects (Uranus, Neptune, Pluto to generational planets) are NEVER windows. " +
            "Your output is raw valid JSON with a 'pages' array containing the reading. " +
            "The reading has 5 parts: Where You Are, The Root, Other Currents (optional), " +
            "Dated Windows (or skip if none), The Directive, and The Actual Answer. " +
            "Prose contains no degrees, orbs, or technical jargon. All technical data goes in sources. " +
            "Every claim must be backed by a source line copied verbatim from the provided data.",
          messages: [{ role: "user", content: promptText }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error("[readings] Claude error:", err);
        return { ok: false, status: 502, error: "Failed to generate reading. Please try again." };
      }

      const claudeData = await response.json();
      const rawText = claudeData.content?.[0]?.text;
      if (!rawText) return { ok: false, status: 502, error: "No response from reading engine." };

      try {
        let cleaned = rawText.trim();
        if (cleaned.startsWith("```")) cleaned = cleaned.slice(cleaned.indexOf("\n") + 1);
        if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, cleaned.lastIndexOf("```"));
        cleaned = cleaned.trim();
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        if (start !== -1 && end !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);

        const p = JSON.parse(cleaned) as { pages: ReadingPage[] };
        if (!p.pages || p.pages.length < 1) {
          return { ok: false, status: 422, error: "Reading structure was incomplete. Please try again." };
        }
        return { ok: true, pages: p.pages };
      } catch (parseErr) {
        console.error("[readings] Failed to parse Claude response. Error:", String(parseErr));
        console.error("[readings] Raw response start:", rawText.slice(0, 300));
        console.error("[readings] Raw response end:", rawText.slice(-200));
        return { ok: false, status: 422, error: "Failed to parse reading. Please try again." };
      }
    }

    const first = await generate(prompt);
    if (!first.ok) return NextResponse.json({ error: first.error }, { status: first.status });

    let pages = first.pages;
    let unsupported = pages.flatMap((pg) => findUnsupportedMarkers(pg.content ?? "", dateIndex));

    if (unsupported.length > 0) {
      console.warn(`[readings] date provenance — retrying once. Unsupported: ${unsupported.join(" | ")}`);
      const retry = await generate(prompt + allowedDatesInstruction(dateIndex));
      if (retry.ok) {
        const stillBad = retry.pages.flatMap((pg) => findUnsupportedMarkers(pg.content ?? "", dateIndex));
        if (stillBad.length === 0) {
          pages = retry.pages;
          unsupported = [];
        } else {
          unsupported = stillBad;
        }
      }
    }

    if (unsupported.length > 0) {
      console.error(`[readings] date provenance FAILED after retry — unsupported: ${unsupported.join(" | ")}`);
      return NextResponse.json(
        { error: "We couldn't verify the timing on this reading. Please try again." },
        { status: 422 },
      );
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
        careNote,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[readings] Unexpected error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}