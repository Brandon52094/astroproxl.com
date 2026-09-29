// ============================================================
// FILE: lib/astrologicalCalculations.ts (FIXED & HARDENED)
// ============================================================

// ── SIGN RULERS (Traditional — keep synchronized with chart-calculate) ──
export const SIGN_RULERS: Record<string, string> = {
  Aries: "Mars",
  Taurus: "Venus",
  Gemini: "Mercury",
  Cancer: "Moon",
  Leo: "Sun",
  Virgo: "Mercury",
  Libra: "Venus",
  Scorpio: "Mars",
  Sagittarius: "Jupiter",
  Capricorn: "Saturn",
  Aquarius: "Saturn",
  Pisces: "Jupiter",
};

// ── MODERN SIGN RULERS (interpretive context only) ──
export const MODERN_SIGN_RULERS: Record<string, string> = {
  Scorpio: "Pluto",
  Aquarius: "Uranus",
  Pisces: "Neptune",
};

// ── ESSENTIAL DIGNITIES ──
export const EXALTATIONS: Record<string, string> = {
  Sun: "Aries",
  Moon: "Taurus",
  Mercury: "Virgo",
  Venus: "Pisces",
  Mars: "Capricorn",
  Jupiter: "Cancer",
  Saturn: "Libra",
};

export const FALLS: Record<string, string> = {
  Sun: "Libra",
  Moon: "Scorpio",
  Mercury: "Pisces",
  Venus: "Virgo",
  Mars: "Cancer",
  Jupiter: "Capricorn",
  Saturn: "Aries",
};

// Traditional planets with two domiciles can have two detriments
export const DETRIMENTS: Record<string, string[]> = {
  Sun: ["Aquarius"],
  Moon: ["Capricorn"],
  Mercury: ["Sagittarius", "Pisces"],
  Venus: ["Aries", "Scorpio"],
  Mars: ["Taurus", "Libra"],
  Jupiter: ["Gemini", "Virgo"],
  Saturn: ["Cancer", "Leo"],
};

// ── SIGN DEGREES ──
export const SIGN_START_DEGREES: Record<string, number> = {
  Aries: 0,
  Taurus: 30,
  Gemini: 60,
  Cancer: 90,
  Leo: 120,
  Virgo: 150,
  Libra: 180,
  Scorpio: 210,
  Sagittarius: 240,
  Capricorn: 270,
  Aquarius: 300,
  Pisces: 330,
};

// Synodic periods in days (approximate time for planet to return to exact natal position)
export const SYNODIC_PERIODS: Record<string, number> = {
  Sun: 365.25,
  Moon: 27.32,
  Mercury: 87.97,
  Venus: 224.7,
  Mars: 686.98,
  Jupiter: 4332.59,
  Saturn: 10759.22,
};

// ============================================================
// INTERFACES
// ============================================================

export interface HouseRuler {
  house: number;
  sign: string;
  ruler: string;
}

export interface MutualReception {
  planetA: string;
  planetB: string;
  signA: string;
  signB: string;
  description: string;
}

export interface EssentialDignity {
  planet: string;
  dignity: "Domicile" | "Exaltation" | "Fall" | "Detriment" | "Neutral";
  sign: string;
  strength: number;
}

export interface SynodicCycle {
  planet: string;
  returnDate: string;
  daysUntilReturn: number;
}

export interface Midpoint {
  pointA: string;
  pointB: string;
  sign: string;
  degree: number;
  house: number;
}

export interface LunarReturn {
  date: string;
  moonSign: string;
  moonDegree: string;
  daysUntil: number;
}

export interface EclipseActivation {
  eclipseDate: string;
  eclipseType: "Solar" | "Lunar";
  degree: number;
  sign: string;
  activatedPlanet: string;
  orb: number;
  durationMonths: number;
}

export interface TransitToAngle {
  angle: "Ascendant" | "Midheaven" | "Descendant" | "Imum Coeli";
  angleDegree: number;
  angleSign: string;
  transitPlanet: string;
  transitDegree: number;
  transitSign: string;
  aspectType: string;
  orb: number;
  isApplying: boolean;
}

export interface DispositorResult {
  planet: string;
  sign: string;
  dispositor: string;
  finalDispositor: string;
  chain: string[];
}

// ============================================================
// HELPER UTILITIES
// ============================================================

/**
 * Parse a degree string like "21°56'" or "21.5" into a numeric degree.
 * Previously this was losing minutes — fixed.
 */
function parseDegreeString(degreeStr: string | number): number {
  if (typeof degreeStr === "number") {
    return degreeStr;
  }

  const match = degreeStr.match(/(\d+(?:\.\d+)?)°(?:\s*(\d+(?:\.\d+)?)')?/);

  if (match) {
    const degrees = Number(match[1]);
    const minutes = Number(match[2] ?? 0);

    return degrees + minutes / 60;
  }

  const fallback = Number.parseFloat(degreeStr);

  return Number.isFinite(fallback) ? fallback : 0;
}

function getAbsoluteDegree(sign: string, degree: string | number): number {
  const signStart = SIGN_START_DEGREES[sign] ?? 0;
  return signStart + parseDegreeString(degree);
}

function getSignAndDegree(absDegree: number): { sign: string; degree: number } {
  const normalized = ((absDegree % 360) + 360) % 360;
  const signIndex = Math.floor(normalized / 30) % 12;
  const signs = Object.keys(SIGN_START_DEGREES);
  return {
    sign: signs[signIndex] ?? "Aries",
    degree: Math.round((normalized % 30) * 100) / 100,
  };
}

function angularDistance(a: number, b: number): number {
  let diff = Math.abs(((a % 360) + 360) % 360 - ((b % 360) + 360) % 360);

  if (diff > 180) {
    diff = 360 - diff;
  }

  return diff;
}

function getAspectOrb(transitLongitude: number, targetLongitude: number, aspectAngle: number): number {
  const distance = angularDistance(transitLongitude, targetLongitude);
  return Math.abs(distance - aspectAngle);
}

/**
 * Determine if a transit is applying to or separating from an aspect.
 * This is the correct method, not `!isRetrograde`.
 */
function isAspectApplying(
  transitLongitude: number,
  targetLongitude: number,
  aspectAngle: number,
  isRetrograde: boolean
): boolean {
  const currentOrb = getAspectOrb(transitLongitude, targetLongitude, aspectAngle);

  // Tiny movement in the planet's actual direction.
  // We only need direction here, not timing.
  const movement = isRetrograde ? -0.01 : 0.01;

  const futureLongitude = ((transitLongitude + movement + 360) % 360);

  const futureOrb = getAspectOrb(futureLongitude, targetLongitude, aspectAngle);

  return futureOrb < currentOrb;
}

// ============================================================
// CALCULATION FUNCTIONS
// ============================================================

export function calculateHouseRulers(
  planets: Array<{ name: string; sign: string; degree: string; house?: string }>,
  houseCusps: Record<number, string>
): HouseRuler[] {
  const rulers: HouseRuler[] = [];
  for (let house = 1; house <= 12; house++) {
    const sign = houseCusps[house];
    if (sign) {
      const ruler = SIGN_RULERS[sign];
      if (ruler) {
        rulers.push({ house, sign, ruler });
      }
    }
  }
  return rulers;
}

export function calculateMutualReception(
  planets: Array<{ name: string; sign: string; degree: string }>
): MutualReception[] {
  const receptions: MutualReception[] = [];
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const a = planets[i];
      const b = planets[j];

      const rulerA = SIGN_RULERS[a.sign];
      const rulerB = SIGN_RULERS[b.sign];

      if (rulerA === b.name && rulerB === a.name) {
        receptions.push({
          planetA: a.name,
          planetB: b.name,
          signA: a.sign,
          signB: b.sign,
          description: `${a.name} in ${a.sign}, ${b.name} in ${b.sign}`,
        });
      }
    }
  }
  return receptions;
}

export function calculateEssentialDignity(
  planet: string,
  sign: string
): EssentialDignity {
  let dignity: EssentialDignity["dignity"] = "Neutral";
  let strength = 5;

  if (SIGN_RULERS[sign] === planet) {
    dignity = "Domicile";
    strength = 10;
  } else if (EXALTATIONS[planet] === sign) {
    dignity = "Exaltation";
    strength = 8;
  } else if (FALLS[planet] === sign) {
    dignity = "Fall";
    strength = 3;
  } else if (DETRIMENTS[planet]?.includes(sign)) {
    dignity = "Detriment";
    strength = 2;
  }

  return { planet, dignity, sign, strength };
}

export function calculateSynodicCycles(
  _planets: Array<{ name: string; sign: string; degree: string }>,
  _currentDate: Date
): SynodicCycle[] {
  // DISABLED: the previous implementation fabricated data — it returned
  // "today + 30 days" as the return date for every planet, producing
  // meaningless, identical dates. Until a real ephemeris return-search is
  // implemented, return nothing so no fake cycle data reaches the prompt.
  return [];
}

export function calculateMidpoints(
  planets: Array<{ name: string; sign: string; degree: string }>,
  wholeSignHouseCusps: Record<number, string>
): Midpoint[] {
  const midpoints: Midpoint[] = [];
  const pairs = [
    ["Sun", "Moon"],
    ["Venus", "Mars"],
    ["Mercury", "Sun"],
    ["Moon", "Venus"],
  ];

  for (const [nameA, nameB] of pairs) {
    const planetA = planets.find((p) => p.name === nameA);
    const planetB = planets.find((p) => p.name === nameB);
    if (!planetA || !planetB) continue;

    const absA = getAbsoluteDegree(planetA.sign, planetA.degree);
    const absB = getAbsoluteDegree(planetB.sign, planetB.degree);

    let diff = Math.abs(absA - absB);
    let mid = (absA + absB) / 2;
    if (diff > 180) {
      mid = (absA + absB + 360) / 2;
      if (mid >= 360) mid -= 360;
    }

    const result = getSignAndDegree(mid);

    // Use Whole Sign houses: find which house cusp matches the midpoint's sign
    let house = 1;
    for (let h = 1; h <= 12; h++) {
      if (wholeSignHouseCusps[h] === result.sign) {
        house = h;
        break;
      }
    }

    midpoints.push({
      pointA: nameA,
      pointB: nameB,
      sign: result.sign,
      degree: result.degree,
      house,
    });
  }

  return midpoints;
}

/**
 * Calculate the next exact Lunar Return.
 *
 * A Lunar Return occurs when the transiting Moon returns to the
 * exact tropical longitude of the natal Moon.
 *
 * This uses Swiss Ephemeris and solves for the actual future
 * conjunction rather than approximating with +27 days.
 */
export function calculateLunarReturn(
  natalMoonSign: string,
  natalMoonDegree: string,
  currentDate: Date
): LunarReturn | undefined {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swisseph = require("swisseph");

  const natalMoonLongitude = getAbsoluteDegree(
    natalMoonSign,
    natalMoonDegree
  );

  const jdNow =
    2440587.5 + currentDate.getTime() / 86400000;

  const moonNow = swisseph.swe_calc_ut(
    jdNow,
    swisseph.SE_MOON,
    4 | 256
  );

  if (
    moonNow.rflag < 0 ||
    moonNow.error ||
    !Number.isFinite(moonNow.longitude) ||
    !Number.isFinite(moonNow.longitudeSpeed)
  ) {
    return undefined;
  }

  const currentLongitude =
    ((moonNow.longitude % 360) + 360) % 360;

  const targetLongitude =
    ((natalMoonLongitude % 360) + 360) % 360;

  // Distance the Moon must travel forward to reach natal Moon.
  let forwardDistance =
    (targetLongitude - currentLongitude + 360) % 360;

  // If the Moon is essentially on the natal position right now,
  // find the NEXT Lunar Return rather than returning the current one.
  if (forwardDistance < 0.01) {
    forwardDistance += 360;
  }

  const initialSpeed =
    Math.abs(moonNow.longitudeSpeed) > 0.0001
      ? moonNow.longitudeSpeed
      : 13.176;

  // First estimate from actual current lunar speed.
  let jd =
    jdNow + forwardDistance / initialSpeed;

  // Newton refinement to exact conjunction.
  for (let i = 0; i < 15; i++) {
    const result = swisseph.swe_calc_ut(
      jd,
      swisseph.SE_MOON,
      4 | 256
    );

    if (
      result.rflag < 0 ||
      result.error ||
      !Number.isFinite(result.longitude) ||
      !Number.isFinite(result.longitudeSpeed) ||
      Math.abs(result.longitudeSpeed) < 0.0001
    ) {
      return undefined;
    }

    let error =
      ((result.longitude - targetLongitude + 540) % 360) - 180;

    if (Math.abs(error) < 0.000001) {
      break;
    }

    // degrees / degrees-per-day = days
    let correction = error / result.longitudeSpeed;

    // Guard against a wild Newton jump.
    correction = Math.max(-2, Math.min(2, correction));

    jd -= correction;
  }

  const finalResult = swisseph.swe_calc_ut(
    jd,
    swisseph.SE_MOON,
    4 | 256
  );

  if (
    finalResult.rflag < 0 ||
    finalResult.error
  ) {
    return undefined;
  }

  const finalOrb = angularDistance(
    finalResult.longitude,
    targetLongitude
  );

  // Require a genuinely exact result.
  if (finalOrb > 0.01 || jd <= jdNow) {
    return undefined;
  }

  const returnDate = new Date(
    (jd - 2440587.5) * 86400000
  );

  const moonPosition = getSignAndDegree(
    finalResult.longitude
  );

  const daysUntil =
    (returnDate.getTime() - currentDate.getTime()) /
    86400000;

  return {
    date: returnDate.toISOString(),
    moonSign: moonPosition.sign,
    moonDegree: `${moonPosition.degree.toFixed(2)}°`,
    daysUntil: Math.round(daysUntil * 100) / 100,
  };
}

export function calculateEclipseActivation(
  planets: Array<{ name: string; sign: string; degree: string }>,
  eclipses: Array<{ date: string; type: "Solar" | "Lunar"; degree: number; sign: string }>
): EclipseActivation[] {
  const activations: EclipseActivation[] = [];

  for (const eclipse of eclipses) {
    const eclipseAbs = getAbsoluteDegree(eclipse.sign, eclipse.degree);

    for (const p of planets) {
      if (["Uranus", "Neptune", "Pluto"].includes(p.name)) continue;

      const planetAbs = getAbsoluteDegree(p.sign, p.degree);
      let diff = Math.abs(planetAbs - eclipseAbs);
      if (diff > 180) diff = 360 - diff;

      if (diff < 3) {
        activations.push({
          eclipseDate: eclipse.date,
          eclipseType: eclipse.type,
          degree: eclipse.degree,
          sign: eclipse.sign,
          activatedPlanet: p.name,
          orb: Math.round(diff * 100) / 100,
          durationMonths: eclipse.type === "Solar" ? 12 : 6,
        });
      }
    }
  }

  return activations;
}

export function calculateTransitsToAngles(
  transits: Array<{ name: string; sign: string; degree: string; isRetrograde: boolean }>,
  angles: Array<{ name: "Ascendant" | "Midheaven" | "Descendant" | "Imum Coeli"; sign: string; degree: string | number }>
): TransitToAngle[] {
  const results: TransitToAngle[] = [];

  for (const transit of transits) {
    for (const angle of angles) {
      const transAbs = getAbsoluteDegree(transit.sign, transit.degree);
      const angleAbs = getAbsoluteDegree(angle.sign, angle.degree);

      const aspects = [
        { name: "Conjunction", angle: 0 },
        { name: "Opposition", angle: 180 },
        { name: "Square", angle: 90 },
        { name: "Trine", angle: 120 },
        { name: "Sextile", angle: 60 },
      ];

      for (const aspect of aspects) {
        const orb = Math.abs(angularDistance(transAbs, angleAbs) - aspect.angle);
        if (orb < 3) {
          results.push({
            angle: angle.name,
            angleDegree: angleAbs,
            angleSign: angle.sign,
            transitPlanet: transit.name,
            transitDegree: transAbs,
            transitSign: transit.sign,
            aspectType: aspect.name,
            orb: Math.round(orb * 100) / 100,
            isApplying: isAspectApplying(transAbs, angleAbs, aspect.angle, transit.isRetrograde),
          });
        }
      }
    }
  }

  return results;
}

export function calculateDispositorTree(
  planets: Array<{ name: string; sign: string; degree: string }>
): DispositorResult[] {
  const results: DispositorResult[] = [];

  for (const p of planets) {
    if (["Uranus", "Neptune", "Pluto", "Ascendant", "Midheaven"].includes(p.name)) continue;

    const ruler = SIGN_RULERS[p.sign];
    results.push({
      planet: p.name,
      sign: p.sign,
      dispositor: ruler || "None",
      finalDispositor: "Unknown",
      chain: [p.name, ruler || "None"],
    });
  }

  for (const result of results) {
    if (result.dispositor === "None") continue;

    let current = result.dispositor;
    const chain = [result.planet, current];

    for (let i = 0; i < 10; i++) {
      const next = results.find((r) => r.planet === current);
      if (!next || next.dispositor === "None" || chain.includes(next.dispositor)) {
        break;
      }
      chain.push(next.dispositor);
      current = next.dispositor;
    }

    result.chain = chain;
    result.finalDispositor = chain[chain.length - 1];
  }

  return results;
}/* ═══════════════════════════════════════════════════════════════════════════
 * TRANSIT-TO-NATAL ASPECTS
 *
 * Why this exists: the reading prompt asks for "the tightest transit hitting
 * their chart today, under 3° orb" and "only include windows where a transit
 * is within 3° of a natal planet or angle." Previously the model had to work
 * that out by inference — ~700 comparisons of arc-distance across 11 transiting
 * bodies × 13 natal points × 5 aspect types, done in its head, every reading.
 *
 * It mostly got it right. "Mostly" is not good enough when someone is paying
 * for clarity about a court date.
 *
 * Now the math happens in code. The model receives a pre-sorted, pre-filtered
 * list — tightest orb first — and does only what it is actually good at:
 * interpretation. This makes the readings more accurate, kills a whole class
 * of hallucinated aspects, and lets the exact degrees flow straight into the
 * `sources` array without ever cluttering the prose.
 *
 * APPLYING vs SEPARATING is the other thing code can know and a model cannot
 * guess: an aspect the transit is still moving *into* is building (the event
 * hasn't peaked). One it's moving *out of* is releasing (the peak has passed).
 * We compute this from the transiting planet's longitude speed. It's the
 * difference between "this is about to land" and "this already happened."
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface TransitAspect {
  transitPlanet: string;
  natalPlanet: string;
  aspectType: "conjunction" | "opposition" | "square" | "trine" | "sextile";
  orbDegrees: number;
  natalHouse: number | null;
  natalSign: string;
  natalDegree: string;
  transitSign: string;
  transitDegree: string;
  isApplying: boolean;      // still tightening — the event is building
  isRetrograde: boolean;    // transiting planet is retrograde
  band: "exact" | "live" | "background";  // exact ≤0.5°, live ≤3°, background ≤6°
  exactDate: string | null; // When this aspect perfects (e.g., "August 25, 2026")
  exactJulianDay: number | null; // Julian day of exact perfection
  daysUntilExact: number | null; // Days until the aspect perfects
}

// ── HELPER FUNCTIONS ──

function normalizeLongitude(longitude: number): number {
  return ((longitude % 360) + 360) % 360;
}

function signedAngularDelta(longitude: number, target: number): number {
  let diff = normalizeLongitude(longitude) - normalizeLongitude(target);

  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;

  return diff;
}

function dateToJulianDayUT(date: Date): number {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swisseph = require("swisseph");

  const hour =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600 +
    date.getUTCMilliseconds() / 3600000;

  return swisseph.swe_julday(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    hour,
    swisseph.SE_GREG_CAL
  );
}

function julianDayToDate(jd: number): Date {
  return new Date((jd - 2440587.5) * 86400000);
}

function classifyAspectBand(
  type: TransitAspect["aspectType"],
  orb: number
): TransitAspect["band"] {
  const liveLimit = type === "sextile" ? 2.5 : 3.0;
  const backgroundLimit = type === "sextile" ? 5.0 : 6.0;

  if (orb <= 0.5) {
    return "exact";
  }

  if (orb <= liveLimit) {
    return "live";
  }

  if (orb <= backgroundLimit) {
    return "background";
  }

  return "background";
}

/**
 * Calculate when an aspect will perfect (reach exact orb).
 * Uses binary search with real UT time to find the exact date.
 * Handles both branches of aspects (e.g., square to 10° Aries can
 * perfect at either 10° Cancer or 10° Capricorn).
 */
function calculateExactAspectDate(
  transitPlanet: {
    name: string;
    longitude: number;
    longitudeSpeed: number;
  },
  natalLongitude: number,
  aspectAngle: number,
  startDate: Date,
  maxDays: number = 60
): {
  date: string;
  daysUntil: number;
  exactJulianDay: number;
} | null {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swisseph = require("swisseph");

  const PLANET_IDS: Record<string, number> = {
    Sun: swisseph.SE_SUN,
    Moon: swisseph.SE_MOON,
    Mercury: swisseph.SE_MERCURY,
    Venus: swisseph.SE_VENUS,
    Mars: swisseph.SE_MARS,
    Jupiter: swisseph.SE_JUPITER,
    Saturn: swisseph.SE_SATURN,
    Uranus: swisseph.SE_URANUS,
    Neptune: swisseph.SE_NEPTUNE,
    Pluto: swisseph.SE_PLUTO,
    "North Node": swisseph.SE_TRUE_NODE,
  };

  const planetId = PLANET_IDS[transitPlanet.name];

  if (planetId == null) {
    return null;
  }

  const jdStart = dateToJulianDayUT(startDate);
  const jdEnd = jdStart + maxDays;

  // Conjunction/opposition have one unique zodiac target.
  // Square/trine/sextile have ± branches.
  const targets =
    aspectAngle === 0 || aspectAngle === 180
      ? [normalizeLongitude(natalLongitude + aspectAngle)]
      : [
          normalizeLongitude(natalLongitude + aspectAngle),
          normalizeLongitude(natalLongitude - aspectAngle),
        ];

  // Faster bodies need a smaller scan step so we
  // don't jump over an exact crossing.
  const scanStep =
    transitPlanet.name === "Moon"
      ? 0.0625 // 1.5 hours
      : ["Mercury", "Venus", "Sun"].includes(transitPlanet.name)
      ? 0.125 // 3 hours
      : transitPlanet.name === "Mars"
      ? 0.25
      : 0.5;

  let earliestJD: number | null = null;

  for (const target of targets) {
    let leftJD = jdStart;

    let leftResult = swisseph.swe_calc_ut(leftJD, planetId, 4 | 256);

    if (leftResult.rflag < 0 || leftResult.error) {
      continue;
    }

    let leftError = signedAngularDelta(leftResult.longitude, target);

    // Already essentially exact.
    if (Math.abs(leftError) < 0.00001) {
      if (earliestJD === null || leftJD < earliestJD) {
        earliestJD = leftJD;
      }

      continue;
    }

    for (let rightJD = leftJD + scanStep; rightJD <= jdEnd + 0.000001; rightJD += scanStep) {
      const rightResult = swisseph.swe_calc_ut(rightJD, planetId, 4 | 256);

      if (rightResult.rflag < 0 || rightResult.error) {
        leftJD = rightJD;
        continue;
      }

      const rightError = signedAngularDelta(rightResult.longitude, target);

      /*
       * A sign change means the planet crossed
       * the target longitude between the two times.
       *
       * Ignore ±180° discontinuities in the signed
       * angular representation.
       */
      const crossed =
        leftError === 0 ||
        rightError === 0 ||
        (leftError * rightError < 0 && Math.abs(rightError - leftError) < 180);

      if (crossed) {
        let lo = leftJD;
        let hi = rightJD;
        let loError = leftError;

        // ~40 bisections is substantially finer
        // than the precision required here.
        for (let i = 0; i < 40; i++) {
          const mid = (lo + hi) / 2;

          const midResult = swisseph.swe_calc_ut(mid, planetId, 4 | 256);

          if (midResult.rflag < 0 || midResult.error) {
            break;
          }

          const midError = signedAngularDelta(midResult.longitude, target);

          if (Math.abs(midError) < 0.000001) {
            lo = mid;
            hi = mid;
            break;
          }

          if (loError * midError <= 0) {
            hi = mid;
          } else {
            lo = mid;
            loError = midError;
          }
        }

        const exactJD = (lo + hi) / 2;

        if (exactJD >= jdStart && (earliestJD === null || exactJD < earliestJD)) {
          earliestJD = exactJD;
        }

        // This target's first upcoming crossing
        // is the one we care about.
        break;
      }

      leftJD = rightJD;
      leftError = rightError;
    }
  }

  if (earliestJD === null) {
    return null;
  }

  const exactDate = julianDayToDate(earliestJD);
  const daysUntil = Math.max(0, Math.floor(earliestJD - jdStart));

  return {
    date: exactDate.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
    daysUntil,
    exactJulianDay: earliestJD,
  };
}

/**
 * Cross every transiting body against every natal point.
 * Returns aspects within orb, sorted tightest first.
 */
export function calculateTransitAspects(
  transitPlanets: Array<{ name: string; longitude: number; isRetrograde: boolean; longitudeSpeed: number }>,
  natalRaw: {
    planets: Array<{ name: string; longitude: number }>;
    ascLongitude: number;
    mcLongitude: number;
  },
  longitudeToSignDegree: (lon: number) => { sign: string; degree: string },
  getWholeSignHouse: (planetLon: number, ascLon: number) => number
): TransitAspect[] {
  const ASPECT_TYPES: Array<{
    type: "conjunction" | "opposition" | "square" | "trine" | "sextile";
    angle: number;
    maxOrb: number;
  }> = [
    { type: "conjunction", angle: 0, maxOrb: 6 },
    { type: "opposition", angle: 180, maxOrb: 6 },
    { type: "square", angle: 90, maxOrb: 6 },
    { type: "trine", angle: 120, maxOrb: 6 },
    { type: "sextile", angle: 60, maxOrb: 5 },
  ];

  const natalTargets = [
    ...natalRaw.planets.map((p) => ({
      name: p.name,
      longitude: p.longitude,
      house: getWholeSignHouse(p.longitude, natalRaw.ascLongitude),
    })),
    { name: "Ascendant", longitude: natalRaw.ascLongitude, house: 1 },
    { name: "Midheaven", longitude: natalRaw.mcLongitude, house: 10 },
  ];

  const aspects: TransitAspect[] = [];
  const now = new Date();

  for (const transit of transitPlanets) {
    const tPos = longitudeToSignDegree(transit.longitude);

    for (const natal of natalTargets) {
      let diff = Math.abs(transit.longitude - natal.longitude);
      if (diff > 180) diff = 360 - diff;

      for (const { type, angle, maxOrb } of ASPECT_TYPES) {
        const orb = Math.abs(diff - angle);
        if (orb > maxOrb) continue;

        // Determine applying/separating using actual longitude speed
        const step = 0.01;
        const futureLon = transit.longitude + transit.longitudeSpeed * step;
        let futureDiff = Math.abs(futureLon - natal.longitude);
        if (futureDiff > 180) futureDiff = 360 - futureDiff;
        const futureOrb = Math.abs(futureDiff - angle);
        const isApplying = futureOrb < orb;

        const natalPos = longitudeToSignDegree(natal.longitude);

        const exactDateInfo = calculateExactAspectDate(
          transit,
          natal.longitude,
          angle,
          now,
          60
        );

        aspects.push({
          transitPlanet: transit.name,
          natalPlanet: natal.name,
          aspectType: type,
          orbDegrees: Math.round(orb * 100) / 100,
          natalHouse: natal.house,
          natalSign: natalPos.sign,
          natalDegree: natalPos.degree,
          transitSign: tPos.sign,
          transitDegree: tPos.degree,
          isApplying,
          isRetrograde: transit.isRetrograde,
          band: classifyAspectBand(type, orb),
          exactDate: exactDateInfo?.date ?? null,
          exactJulianDay: exactDateInfo?.exactJulianDay ?? null,
          daysUntilExact: exactDateInfo?.daysUntil ?? null,
        });

        break;
      }
    }
  }

  return aspects.sort((a, b) => a.orbDegrees - b.orbDegrees);
}

/**
 * Format for the prompt.
 */
export function formatTransitAspects(aspects: TransitAspect[]): string {
  if (aspects.length === 0) {
    return "TRANSIT-TO-NATAL ASPECTS: none within 6° orb right now.";
  }

  const lines: string[] = [
    "TRANSIT-TO-NATAL ASPECTS (ephemeris-calculated, sorted tightest first —",
    "do not recompute these in the model.)",
    "EXACT = ≤0.5°.",
    "LIVE = active within the configured aspect-specific live orb.",
    "BACKGROUND = context only and never an independent event-date anchor.",
    "APPLYING = tightening toward perfection. SEPARATING = moving away from perfection.",
    "",
  ];

  for (const a of aspects) {
    const motion = a.isApplying ? "applying" : "separating";
    const rx = a.isRetrograde ? " Rx" : "";
    const dateStr = a.exactDate ? ` — exact on ${a.exactDate}` : "";
    lines.push(
      `[${a.band.toUpperCase()}] Transit ${a.transitPlanet}${rx} ${a.transitSign} ${a.transitDegree} ` +
        `${a.aspectType} natal ${a.natalPlanet} ${a.natalSign} ${a.natalDegree} ` +
        `(House ${a.natalHouse ?? "—"}) — ${a.orbDegrees}° orb, ${motion}${dateStr}`
    );
  }

  return lines.join("\n");
}

/**
 * Get unique dates from transit aspects within the next 60 days.
 *
 * Preserves the incoming evidence order.
 * The engine already supplies aspects in its deterministic strength/topic order.
 * Do not re-randomize, spread, or artificially diversify the dates here.
 */
export function getUniqueAspectDates(aspects: TransitAspect[]): string[] {
  const seen = new Set<string>();
  const dates: string[] = [];

  for (const a of aspects) {
    if (
      !a.exactDate ||
      a.daysUntilExact === null ||
      a.daysUntilExact < 0 ||
      a.daysUntilExact > 60
    ) {
      continue;
    }

    if (seen.has(a.exactDate)) {
      continue;
    }

    seen.add(a.exactDate);
    dates.push(a.exactDate);
  }

  return dates.slice(0, 6);
}
