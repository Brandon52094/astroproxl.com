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
}// ============================================================
// FILE: app/api/chart-calculate/route.ts (UPDATED WITH ALL FIXES)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import type { NormalizedChart } from "@/lib/schema/charts";
import { calculateTransitAspects, type TransitAspect } from "@/lib/transitAspects";

// ── NEW: Import advanced calculations ──
import {
  calculateHouseRulers,
  calculateMutualReception,
  calculateEssentialDignity,
  calculateSynodicCycles,
  calculateMidpoints,
  calculateLunarReturn,
  calculateEclipseActivation,
  calculateTransitsToAngles,
  calculateDispositorTree,
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
import { getKnownEclipses } from "@/lib/eclipseData";

export interface ChartCalculateRequest {
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  lat: number;
  lng: number;
  timezone: string;
  currentLat?: number;
  currentLng?: number;
}

export interface TransitPlanet {
  name: string;
  sign: string;
  degree: string;
  longitude: number;
  isRetrograde: boolean;
}

export interface ProgressedPlanet {
  name: string;
  sign: string;
  degree: string;
  longitude: number;
  isRetrograde: boolean;
}

export interface SolarArcPlanet {
  name: string;
  natalPoint: string;
  sign: string;
  degree: string;
  longitude: number;
}

export interface UpcomingTriggerData {
  date: string;
  exactJulianDay: number;
  transitPlanet: string;
  natalPlanet: string;
  aspect: string;
}

export interface PlanetaryStationData {
  planet: string;
  stationDate: string;
  stationType: "retrograde" | "direct";
  sign: string;
  degree: string;
  natalPlanetHit: string | null;
  orbDegrees: number | null;
  natalHouse: number | null;
}

export interface SolarReturnData {
  sunReturnDate: string;
  location: string;
  ascendant: { sign: string; degree: string };
  midheaven: { sign: string; degree: string };
  planets: Array<{ name: string; sign: string; degree: string; house: string }>;
  timeLordInSR: string | null;
  timeLordSRHouse: number | null;
}

export interface MoonPhaseData {
  phaseName: string;
  illuminationPercent: number;
  nextEventName: "New Moon" | "Full Moon";
  daysUntilNextEvent: number;
  moonSign: string;
  moonDegree: string;
}

export interface DeclinationData {
  planet: string;
  declination: number;
  isOutOfBounds: boolean;
}

export interface ArabicLot {
  name: "Lot of Fortune" | "Lot of Spirit";
  sign: string;
  degree: string;
  house: number;
}

export interface ExtendedPoints {
  declinations: DeclinationData[];
  arabicLots: ArabicLot[];
}

// Clean, UI-ready list for the Upgrade Chart experience.
// Aspects stay separate and continue to use tropical.aspects.
export interface UpgradeChartPoint {
  id: string;
  name: string;
  sourceName?: string;
  category: "placement" | "angle" | "point";
  sign: string;
  degree: string;
  house: string;
}

export type TransitToAngleWithDate = TransitToAngle & {
  exactDate?: string;
  exactJulianDay?: number;
};

// ── NEW: Extended response with all 10 calculations ──
export interface ChartCalculateResponse {
  success: boolean;
  tropical: NormalizedChart;
  sidereal: NormalizedChart;
  transits: TransitPlanet[];
  transitAspects: TransitAspect[];
  profection: ProfectionData;
  progressions: ProgressedPlanet[];
  solarArcs: SolarArcPlanet[];
  upcomingTrigger?: UpcomingTriggerData;
  planetaryStations: PlanetaryStationData[];
  solarReturn?: SolarReturnData;
  moonPhase?: MoonPhaseData;
  extendedPoints?: ExtendedPoints;
  upgradeChartPoints?: UpgradeChartPoint[];

  // ── NEW: Advanced calculations ──
  houseRulers?: HouseRuler[];
  mutualReceptions?: MutualReception[];
  essentialDignities?: EssentialDignity[];
  synodicCycles?: SynodicCycle[];
  midpoints?: Midpoint[];
  lunarReturn?: LunarReturn;
  eclipseActivations?: EclipseActivation[];
  transitsToAngles?: TransitToAngleWithDate[];
  dispositorTree?: DispositorResult[];

  error?: string;
}

export interface ProfectionData {
  age: number;
  profectionYear: number;
  activatedHouse: number;
  activatedSign: string;
  timeLord: string;
  timeLordNatalSign: string;
  timeLordNatalHouse: number;
}

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

const SIGN_RULERS: Record<string, string> = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon",
  Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Mars",
  Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter",
};

// ── PRECISION HELPERS ──

const ASPECT_ANGLE_MAP: Record<string, number> = {
  conjunction: 0,
  sextile: 60,
  square: 90,
  trine: 120,
  opposition: 180,
};

function normalizeLongitude(longitude: number): number {
  return ((longitude % 360) + 360) % 360;
}

function signedAngularDelta(a: number, b: number): number {
  let diff = normalizeLongitude(a) - normalizeLongitude(b);

  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;

  return diff;
}

function angularDistance(a: number, b: number): number {
  return Math.abs(signedAngularDelta(a, b));
}

function julianDayToDate(jd: number): Date {
  return new Date((jd - 2440587.5) * 86400000);
}

function formatJulianDate(jd: number): string {
  return julianDayToDate(jd).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function getSwissPlanetId(swisseph: any, name: string): number | null {
  const map: Record<string, number> = {
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

  return map[name] ?? null;
}

/**
 * Refines a rough Julian-day guess until a transiting planet reaches
 * a specific absolute zodiac longitude.
 *
 * Uses the planet's actual instantaneous speed rather than converting
 * degrees of orb into an assumed number of days.
 */
function refinePlanetToLongitude(
  planetId: number,
  targetLongitude: number,
  jdGuess: number
): number | null {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swisseph = require("swisseph");

  let jd = jdGuess;

  for (let i = 0; i < 20; i++) {
    const result = swisseph.swe_calc_ut(jd, planetId, 4 | 256);

    if (result.rflag < 0 || result.error) return null;

    const error = signedAngularDelta(result.longitude, targetLongitude);

    if (Math.abs(error) < 0.000001) {
      return jd;
    }

    const speed = result.longitudeSpeed;

    // Too close to stationary for Newton refinement to be trustworthy.
    if (!Number.isFinite(speed) || Math.abs(speed) < 0.00001) {
      return null;
    }

    let correction = error / speed;

    // Prevent a bad initial guess from launching Newton iteration
    // absurdly far away.
    correction = Math.max(-10, Math.min(10, correction));

    jd -= correction;
  }

  const finalResult = swisseph.swe_calc_ut(jd, planetId, 4 | 256);

  if (
    finalResult.rflag < 0 ||
    finalResult.error ||
    angularDistance(finalResult.longitude, targetLongitude) > 0.01
  ) {
    return null;
  }

  return jd;
}

function refineStationJulianDay(
  planetId: number,
  leftJD: number,
  rightJD: number
): number | null {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swisseph = require("swisseph");

  let left = leftJD;
  let right = rightJD;

  let leftSpeed = swisseph.swe_calc_ut(left, planetId, 4 | 256).longitudeSpeed;
  let rightSpeed = swisseph.swe_calc_ut(right, planetId, 4 | 256).longitudeSpeed;

  if (!Number.isFinite(leftSpeed) || !Number.isFinite(rightSpeed)) {
    return null;
  }

  if (leftSpeed * rightSpeed > 0) {
    return null;
  }

  for (let i = 0; i < 40; i++) {
    const mid = (left + right) / 2;
    const result = swisseph.swe_calc_ut(mid, planetId, 4 | 256);
    const midSpeed = result.longitudeSpeed;

    if (!Number.isFinite(midSpeed)) return null;

    if (Math.abs(midSpeed) < 0.0000001) {
      return mid;
    }

    if (leftSpeed * midSpeed <= 0) {
      right = mid;
      rightSpeed = midSpeed;
    } else {
      left = mid;
      leftSpeed = midSpeed;
    }
  }

  return (left + right) / 2;
}

// ── HELPER: Attach exact dates to angle transits ──

function attachExactDatesToAngleTransits(
  aspects: TransitToAngle[],
  natalRaw: ReturnType<typeof calculatePlanets>,
  jdNow: number
): TransitToAngleWithDate[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swisseph = require("swisseph");

  const angleLongitudes: Record<string, number> = {
    Ascendant: natalRaw.ascLongitude,
    Midheaven: natalRaw.mcLongitude,
    Descendant: normalizeLongitude(natalRaw.ascLongitude + 180),
    "Imum Coeli": normalizeLongitude(natalRaw.mcLongitude + 180),
  };

  return aspects.map((aspect) => {
    // A separating aspect's exact hit is behind us,
    // not a future date anchor.
    if (!aspect.isApplying) {
      return { ...aspect };
    }

    const planetId = getSwissPlanetId(swisseph, aspect.transitPlanet);

    const angleLongitude = angleLongitudes[aspect.angle];

    const aspectAngle = ASPECT_ANGLE_MAP[aspect.aspectType.toLowerCase()];

    if (planetId === null || angleLongitude === undefined || aspectAngle === undefined) {
      return { ...aspect };
    }

    const targetLongitudes =
      aspectAngle === 0 || aspectAngle === 180
        ? [normalizeLongitude(angleLongitude + aspectAngle)]
        : [
            normalizeLongitude(angleLongitude + aspectAngle),
            normalizeLongitude(angleLongitude - aspectAngle),
          ];

    const exactCandidates = targetLongitudes
      .map((targetLongitude) =>
        refinePlanetToLongitude(planetId, targetLongitude, jdNow)
      )
      .filter((jd): jd is number =>
        jd !== null && jd >= jdNow - 0.001 && jd <= jdNow + 60
      )
      .filter((jd) => {
        const result = swisseph.swe_calc_ut(jd, planetId, 4 | 256);

        return targetLongitudes.some(
          (target) => angularDistance(result.longitude, target) <= 0.01
        );
      })
      .sort((a, b) => a - b);

    if (!exactCandidates.length) {
      return { ...aspect };
    }

    const exactJD = exactCandidates[0];

    return {
      ...aspect,
      exactDate: formatJulianDate(exactJD),
      exactJulianDay: exactJD,
    };
  });
}

// ── PARSE HELPERS ──

function parseDateParts(birthDate: string): [number, number, number] {
  if (birthDate.includes("-")) {
    const [y, m, d] = birthDate.split("-").map(Number);
    return [y, m, d];
  } else if (birthDate.includes("/")) {
    const parts = birthDate.split("/").map(Number);
    if (parts[0] > 31) return [parts[0], parts[1], parts[2]];
    return [parts[2], parts[0], parts[1]];
  }
  throw new Error(`Unrecognized birthDate format: ${birthDate}`);
}

function parseTimeTo24h(birthTime: string): [number, number] {
  const trimmed = birthTime.trim();

  const colonMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (colonMatch) {
    let hour = Number(colonMatch[1]);
    const minute = Number(colonMatch[2]);
    const meridiem = colonMatch[3]?.toLowerCase();
    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    return [hour, minute];
  }

  const digitMatch = trimmed.match(/^(\d{3,4})\s*(am|pm)?$/i);
  if (digitMatch) {
    const digits = digitMatch[1];
    const meridiem = digitMatch[2]?.toLowerCase();
    let hour: number;
    let minute: number;
    if (digits.length === 4) {
      hour = Number(digits.slice(0, 2));
      minute = Number(digits.slice(2));
    } else {
      hour = Number(digits.slice(0, 1));
      minute = Number(digits.slice(1));
    }
    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) {
      throw new Error(`Unrecognized birthTime format: ${birthTime}`);
    }
    return [hour, minute];
  }

  throw new Error(`Unrecognized birthTime format: ${birthTime}`);
}

function toJulianDay(birthDate: string, birthTime: string, utcOffsetHours: number = 0): number {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swisseph = require("swisseph");
  const [year, month, day] = parseDateParts(birthDate);
  const [hour, minute] = parseTimeTo24h(birthTime);
  const utcDecimalHour = (hour + minute / 60) - utcOffsetHours;
  let utcHour = utcDecimalHour;
  let utcDay = day, utcMonth = month, utcYear = year;
  if (utcHour >= 24) {
    utcHour -= 24;
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() + 1);
    utcYear = d.getUTCFullYear(); utcMonth = d.getUTCMonth() + 1; utcDay = d.getUTCDate();
  } else if (utcHour < 0) {
    utcHour += 24;
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() - 1);
    utcYear = d.getUTCFullYear(); utcMonth = d.getUTCMonth() + 1; utcDay = d.getUTCDate();
  }
  return swisseph.swe_julday(utcYear, utcMonth, utcDay, utcHour, swisseph.SE_GREG_CAL);
}

function getUtcOffset(birthDate: string, birthTime: string, timezone: string): number {
  try {
    const [year, month, day] = parseDateParts(birthDate);
    const [hour, minute] = parseTimeTo24h(birthTime);
    const localDate = new Date(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
    const utcStr = localDate.toLocaleString("en-US", { timeZone: "UTC", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    const tzStr = localDate.toLocaleString("en-US", { timeZone: timezone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    const parseMs = (s: string) => {
      const m = s.match(/(\d+)\/(\d+)\/(\d+),\s*(\d+):(\d+)/);
      if (!m) return 0;
      return Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]), Number(m[4]), Number(m[5]));
    };
    return (parseMs(tzStr) - parseMs(utcStr)) / 3600000;
  } catch { return 0; }
}

function longitudeToSignDegree(longitude: number): { sign: string; degree: string } {
  const norm = ((longitude % 360) + 360) % 360;
  const signIndex = Math.floor(norm / 30);
  const degreeInSign = norm % 30;
  const degrees = Math.floor(degreeInSign);
  const minutes = Math.floor((degreeInSign - degrees) * 60);
  return { sign: SIGNS[signIndex], degree: `${degrees}°${String(minutes).padStart(2, "0")}'` };
}

function isAnareticLongitude(longitude: number): boolean {
  const degreeInSign = (((longitude % 360) + 360) % 360) % 30;
  return degreeInSign >= 29;
}

// ============================================================
// ── Whole Sign House Calculation ──
// ============================================================

function getWholeSignHouseCusps(ascLongitude: number): number[] {
  const ascSign = Math.floor(((ascLongitude % 360) + 360) % 360 / 30);
  const cusps: number[] = [];
  for (let i = 0; i < 12; i++) {
    cusps.push((ascSign + i) * 30);
  }
  return cusps;
}

// ============================================================
// ── House calculation functions ──
// ============================================================

// For natal interpretation: Use Placidus house cusps (already in calculatePlanets)
// For predictive calculations: Use Whole Sign houses

function getWholeSignHouse(planetLongitude: number, ascLongitude: number): number {
  const ascSign = Math.floor(((ascLongitude % 360) + 360) % 360 / 30);
  const planetSign = Math.floor((((planetLongitude % 360) + 360) % 360) / 30);
  return ((planetSign - ascSign + 12) % 12) + 1;
}

function getPlacidusHouse(planetLongitude: number, houseCusps: number[]): number {
  // Find which Placidus house cusp the planet is between
  const normLong = ((planetLongitude % 360) + 360) % 360;
  for (let i = 0; i < 12; i++) {
    const cusp1 = ((houseCusps[i] % 360) + 360) % 360;
    const cusp2 = ((houseCusps[(i + 1) % 12] % 360) + 360) % 360;

    // Handle wrap-around
    if (cusp1 < cusp2) {
      if (normLong >= cusp1 && normLong < cusp2) {
        return i + 1;
      }
    } else {
      // Wrap-around case (e.g., cusp1 = 350°, cusp2 = 10°)
      if (normLong >= cusp1 || normLong < cusp2) {
        return i + 1;
      }
    }
  }
  return 1; // Default to first house if not found
}

function calculatePlanets(
  jd: number, lat: number, lng: number, houseSystem: string, ayanamsa?: number
): {
  planets: Array<{ name: string; longitude: number; isRetrograde: boolean; longitudeSpeed: number }>;
  ascLongitude: number;
  mcLongitude: number;
  vertexLongitude: number;
  houseCusps: number[]; // Placidus house cusps for natal interpretation
  wholeSignCusps: number[]; // Whole Sign cusps for predictive calculations
} {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swisseph = require("swisseph");
  const PLANETS = [
    { id: swisseph.SE_SUN, name: "Sun" },
    { id: swisseph.SE_MOON, name: "Moon" },
    { id: swisseph.SE_MERCURY, name: "Mercury" },
    { id: swisseph.SE_VENUS, name: "Venus" },
    { id: swisseph.SE_MARS, name: "Mars" },
    { id: swisseph.SE_JUPITER, name: "Jupiter" },
    { id: swisseph.SE_SATURN, name: "Saturn" },
    { id: swisseph.SE_URANUS, name: "Uranus" },
    { id: swisseph.SE_NEPTUNE, name: "Neptune" },
    { id: swisseph.SE_PLUTO, name: "Pluto" },
    { id: swisseph.SE_TRUE_NODE, name: "North Node" },
    { id: swisseph.SE_CHIRON, name: "Chiron" },
    { id: swisseph.SE_MEAN_APOG, name: "Lilith" },
    { id: swisseph.SE_CERES, name: "Ceres" },
    { id: swisseph.SE_PALLAS, name: "Pallas" },
    { id: swisseph.SE_JUNO, name: "Juno" },
    { id: swisseph.SE_VESTA, name: "Vesta" },
  ];
  const iflag = ayanamsa !== undefined ? (4 | 65536 | 256) : (4 | 256);
  if (ayanamsa !== undefined) swisseph.swe_set_sid_mode(ayanamsa, 0, 0);

  // Calculate houses using the specified house system
  const houses = swisseph.swe_houses(jd, lat, lng, houseSystem);
  const ascLongitude = houses.ascendant;
  const mcLongitude = houses.mc;
  // Swiss Ephemeris returns the Vertex with the same house calculation.
  // Keep it as natal geometry only; do not add it to the predictive planet arrays.
  const vertexLongitude = normalizeLongitude(houses.vertex);
  const houseCusps = houses.house;

  // Calculate Whole Sign houses (for predictive calculations)
  const wholeSignCusps = getWholeSignHouseCusps(ascLongitude);

  const planets = PLANETS.map(({ id, name }) => {
    if (id === undefined || id === null) {
      console.error(`[swisseph] Constant for ${name} is undefined — check the binding`);
    }
    const result = swisseph.swe_calc_ut(jd, id, iflag);
    if (result.rflag < 0 || result.error) {
      console.error(`[swisseph] Error calculating ${name}:`, result.error);
    }
    return {
      name,
      longitude: result.longitude,
      isRetrograde: result.longitudeSpeed < 0,
      longitudeSpeed: result.longitudeSpeed,
    };
  });
  return { planets, ascLongitude, mcLongitude, vertexLongitude, houseCusps, wholeSignCusps };
}

function calculateAspects(planets: Array<{ name: string; longitude: number }>): NormalizedChart["aspects"] {
  const ASPECT_TYPES: Array<{ type: "conjunction" | "opposition" | "square" | "trine" | "sextile"; angle: number; orb: number }> = [
    { type: "conjunction", angle: 0, orb: 8 },
    { type: "opposition", angle: 180, orb: 8 },
    { type: "square", angle: 90, orb: 7 },
    { type: "trine", angle: 120, orb: 7 },
    { type: "sextile", angle: 60, orb: 5 },
  ];
  const aspects: NormalizedChart["aspects"] = [];
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      let diff = Math.abs(planets[i].longitude - planets[j].longitude);
      if (diff > 180) diff = 360 - diff;
      for (const { type, angle, orb } of ASPECT_TYPES) {
        const orbDegrees = Math.abs(diff - angle);
        if (orbDegrees <= orb) {
          aspects.push({ type, planetA: planets[i].name, planetB: planets[j].name, orbDegrees: Math.round(orbDegrees * 10) / 10 });
          break;
        }
      }
    }
  }
  return aspects;
}

function buildNormalizedChart(
  raw: ReturnType<typeof calculatePlanets>,
  birthDate: string, birthTime: string, birthPlace: string,
  lat: number, lng: number, timezone: string
): NormalizedChart {
  const { planets, ascLongitude, mcLongitude, vertexLongitude, houseCusps } = raw;
  const ascDeg = longitudeToSignDegree(ascLongitude);
  const mcDeg = longitudeToSignDegree(mcLongitude);
  const icDeg = longitudeToSignDegree((mcLongitude + 180) % 360);
  const dcDeg = longitudeToSignDegree((ascLongitude + 180) % 360);
  const vertexDeg = longitudeToSignDegree(vertexLongitude);

  // Use Placidus houses for natal interpretation
  const planetPlacements = planets.map(({ name, longitude, isRetrograde }) => {
    const { sign, degree } = longitudeToSignDegree(longitude);
    const house = getPlacidusHouse(longitude, houseCusps);
    return {
      name,
      sign,
      degree: isRetrograde ? `${degree} Rx` : degree,
      house: String(house),
      isAnaretic: isAnareticLongitude(longitude),
    };
  });

  planetPlacements.push({
    name: "Ascendant", sign: ascDeg.sign, degree: ascDeg.degree, house: "1",
    isAnaretic: isAnareticLongitude(ascLongitude),
  });
  planetPlacements.push({
    name: "Midheaven", sign: mcDeg.sign, degree: mcDeg.degree, house: "10",
    isAnaretic: isAnareticLongitude(mcLongitude),
  });

  // Natal-only derived points. These are exposed to the Birth Chart / My Readings
  // experience without changing transits, progressions, solar arcs, dignities, etc.
  const northNode = planets.find((planet) => planet.name === "North Node");
  if (northNode) {
    const southNodeLongitude = normalizeLongitude(northNode.longitude + 180);
    const southNodeDeg = longitudeToSignDegree(southNodeLongitude);

    planetPlacements.push({
      name: "South Node",
      sign: southNodeDeg.sign,
      degree: southNodeDeg.degree,
      house: String(getPlacidusHouse(southNodeLongitude, houseCusps)),
      isAnaretic: isAnareticLongitude(southNodeLongitude),
    });
  }

  planetPlacements.push({
    name: "Vertex",
    sign: vertexDeg.sign,
    degree: vertexDeg.degree,
    house: String(getPlacidusHouse(vertexLongitude, houseCusps)),
    isAnaretic: isAnareticLongitude(vertexLongitude),
  });

  // Keep the existing aspect engine unchanged. South Node and Vertex are available
  // as natal placements, but they do not silently expand the predictive/aspect set.
  const aspects = calculateAspects(planets.map(({ name, longitude }) => ({ name, longitude })));
  return { birthDate, birthTime, birthPlace, timezone, coordinates: { lat, lng }, planets: planetPlacements, angles: { asc: ascDeg, mc: mcDeg, ic: icDeg, dc: dcDeg }, aspects };
}

function calculateProfection(
  birthDate: string, ascSign: string,
  natalPlanets: Array<{ name: string; sign: string; house: number }>
): ProfectionData {
  const [birthYear, birthMonth, birthDay] = parseDateParts(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birthYear;
  if (now.getMonth() + 1 < birthMonth || (now.getMonth() + 1 === birthMonth && now.getDate() < birthDay)) age--;
  const profectionYear = (age % 12) + 1;
  const activatedHouse = profectionYear;
  const ascSignIndex = SIGNS.indexOf(ascSign);
  const activatedSign = SIGNS[(ascSignIndex + activatedHouse - 1) % 12];
  const timeLord = SIGN_RULERS[activatedSign];
  const timeLordNatal = natalPlanets.find((p) => p.name === timeLord);
  return { age, profectionYear, activatedHouse, activatedSign, timeLord, timeLordNatalSign: timeLordNatal?.sign ?? "", timeLordNatalHouse: timeLordNatal?.house ?? 0 };
}

function calculateProgressions(jdBirth: number, birthDate: string, lat: number, lng: number): ProgressedPlanet[] {
  const [birthYear, birthMonth, birthDay] = parseDateParts(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birthYear;
  if (now.getMonth() + 1 < birthMonth || (now.getMonth() + 1 === birthMonth && now.getDate() < birthDay)) age--;

  const hasHadBirthdayThisYear = now >= new Date(now.getFullYear(), birthMonth - 1, birthDay);
  const lastBirthdayYear = hasHadBirthdayThisYear ? now.getFullYear() : now.getFullYear() - 1;
  const lastBirthday = new Date(lastBirthdayYear, birthMonth - 1, birthDay);

  const daysSinceLastBirthday = Math.floor((now.getTime() - lastBirthday.getTime()) / 86400000);
  const fractionalAge = age + daysSinceLastBirthday / 365.25;
  const jdProgressed = jdBirth + fractionalAge;
  const raw = calculatePlanets(jdProgressed, lat, lng, "P");
  const PLANET_NAMES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node"];

  const progressed: ProgressedPlanet[] = raw.planets
    .filter(p => PLANET_NAMES.includes(p.name))
    .map(({ name, longitude, isRetrograde }) => {
      const { sign, degree } = longitudeToSignDegree(longitude);
      return {
        name,
        sign,
        degree: isRetrograde ? `${degree} Rx` : degree,
        longitude: normalizeLongitude(longitude),
        isRetrograde,
      };
    });

  const pAsc = longitudeToSignDegree(raw.ascLongitude);
  const pMc = longitudeToSignDegree(raw.mcLongitude);

  progressed.push({
    name: "Ascendant",
    sign: pAsc.sign,
    degree: pAsc.degree,
    longitude: normalizeLongitude(raw.ascLongitude),
    isRetrograde: false,
  });

  progressed.push({
    name: "Midheaven",
    sign: pMc.sign,
    degree: pMc.degree,
    longitude: normalizeLongitude(raw.mcLongitude),
    isRetrograde: false,
  });

  return progressed;
}

function calculateSolarArcs(jdBirth: number, birthDate: string, lat: number, lng: number): SolarArcPlanet[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swisseph = require("swisseph");
  const [birthYear, birthMonth, birthDay] = parseDateParts(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birthYear;
  if (now.getMonth() + 1 < birthMonth || (now.getMonth() + 1 === birthMonth && now.getDate() < birthDay)) age--;

  const hasHadBirthdayThisYear = now >= new Date(now.getFullYear(), birthMonth - 1, birthDay);
  const lastBirthdayYear = hasHadBirthdayThisYear ? now.getFullYear() : now.getFullYear() - 1;
  const lastBirthday = new Date(lastBirthdayYear, birthMonth - 1, birthDay);
  const daysSinceLastBirthday = Math.floor((now.getTime() - lastBirthday.getTime()) / 86400000);
  const fractionalAge = age + daysSinceLastBirthday / 365.25;
  const jdProgressed = jdBirth + fractionalAge;
  const natalSunResult = swisseph.swe_calc_ut(jdBirth, swisseph.SE_SUN, 4 | 256);
  const progressedSunResult = swisseph.swe_calc_ut(jdProgressed, swisseph.SE_SUN, 4 | 256);
  let solarArc = progressedSunResult.longitude - natalSunResult.longitude;
  if (solarArc < 0) solarArc += 360;
  const natalRaw = calculatePlanets(jdBirth, lat, lng, "P");
  const PLANET_NAMES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node"];
  const solarArcPlanets: SolarArcPlanet[] = natalRaw.planets
    .filter(p => PLANET_NAMES.includes(p.name))
    .map(({ name, longitude }) => {
      const directedLongitude = (longitude + solarArc) % 360;
      const { sign, degree } = longitudeToSignDegree(directedLongitude);
      return {
        name: `SA ${name}`,
        natalPoint: name,
        sign,
        degree,
        longitude: normalizeLongitude(directedLongitude),
      };
    });

  const saAscLongitude = normalizeLongitude(natalRaw.ascLongitude + solarArc);
  const saMcLongitude = normalizeLongitude(natalRaw.mcLongitude + solarArc);

  solarArcPlanets.push({
    name: "SA Ascendant",
    natalPoint: "Ascendant",
    ...longitudeToSignDegree(saAscLongitude),
    longitude: saAscLongitude,
  });

  solarArcPlanets.push({
    name: "SA Midheaven",
    natalPoint: "Midheaven",
    ...longitudeToSignDegree(saMcLongitude),
    longitude: saMcLongitude,
  });

  return solarArcPlanets;
}

function calculateUpcomingTrigger(
  natalRaw: ReturnType<typeof calculatePlanets>,
  jdNow: number
): UpcomingTriggerData | undefined {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swisseph = require("swisseph");

  const TRANSIT_PLANETS = [
    { id: swisseph.SE_SUN, name: "Sun" },
    { id: swisseph.SE_MERCURY, name: "Mercury" },
    { id: swisseph.SE_VENUS, name: "Venus" },
    { id: swisseph.SE_MARS, name: "Mars" },
    { id: swisseph.SE_JUPITER, name: "Jupiter" },
    { id: swisseph.SE_SATURN, name: "Saturn" },
    { id: swisseph.SE_URANUS, name: "Uranus" },
    { id: swisseph.SE_NEPTUNE, name: "Neptune" },
    { id: swisseph.SE_PLUTO, name: "Pluto" },
    { id: swisseph.SE_TRUE_NODE, name: "North Node" },
  ];

  const natalTargets = natalRaw.planets
    .filter((p) =>
      [
        "Sun",
        "Moon",
        "Mercury",
        "Venus",
        "Mars",
        "Jupiter",
        "Saturn",
        "Uranus",
        "Neptune",
        "Pluto",
        "North Node",
      ].includes(p.name)
    )
    .map((p) => ({
      name: p.name,
      longitude: p.longitude,
    }));

  natalTargets.push(
    {
      name: "Ascendant",
      longitude: natalRaw.ascLongitude,
    },
    {
      name: "Midheaven",
      longitude: natalRaw.mcLongitude,
    }
  );

  const aspects = [
    { type: "conjunction", angle: 0 },
    { type: "sextile", angle: 60 },
    { type: "square", angle: 90 },
    { type: "trine", angle: 120 },
    { type: "opposition", angle: 180 },
  ];

  const candidates: Array<UpcomingTriggerData & { jd: number }> = [];

  // Daily rough scan. Exact time is solved only after a candidate
  // approaches the target longitude.
  for (const transitPlanet of TRANSIT_PLANETS) {
    for (let dayOffset = 0; dayOffset <= 30; dayOffset++) {
      const jdGuess = jdNow + dayOffset;

      const transitResult = swisseph.swe_calc_ut(jdGuess, transitPlanet.id, 4 | 256);

      if (transitResult.rflag < 0 || transitResult.error) continue;

      for (const natalTarget of natalTargets) {
        // Intentionally DO NOT exclude same-planet contacts.
        // This allows Saturn returns, Jupiter returns, etc.

        for (const aspect of aspects) {
          const targetLongitudes =
            aspect.angle === 0 || aspect.angle === 180
              ? [normalizeLongitude(natalTarget.longitude + aspect.angle)]
              : [
                  normalizeLongitude(natalTarget.longitude + aspect.angle),
                  normalizeLongitude(natalTarget.longitude - aspect.angle),
                ];

          for (const exactTarget of targetLongitudes) {
            // Rough discovery only.
            if (angularDistance(transitResult.longitude, exactTarget) > 1.25) {
              continue;
            }

            const exactJD = refinePlanetToLongitude(transitPlanet.id, exactTarget, jdGuess);

            if (exactJD === null) continue;

            if (exactJD < jdNow - 0.001) continue;
            if (exactJD > jdNow + 30.5) continue;

            const exactResult = swisseph.swe_calc_ut(exactJD, transitPlanet.id, 4 | 256);

            if (angularDistance(exactResult.longitude, exactTarget) > 0.01) {
              continue;
            }

            candidates.push({
              jd: exactJD,
              date: formatJulianDate(exactJD),
              exactJulianDay: exactJD,
              transitPlanet: transitPlanet.name,
              natalPlanet: natalTarget.name,
              aspect: aspect.type,
            });
          }
        }
      }
    }
  }

  if (!candidates.length) {
    return undefined;
  }

  candidates.sort((a, b) => a.jd - b.jd);

  const earliest = candidates[0];

  return {
    date: earliest.date,
    exactJulianDay: earliest.exactJulianDay,
    transitPlanet: earliest.transitPlanet,
    natalPlanet: earliest.natalPlanet,
    aspect: earliest.aspect,
  };
}

function calculatePlanetaryStations(natalRaw: ReturnType<typeof calculatePlanets>, lat: number, lng: number): PlanetaryStationData[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swisseph = require("swisseph");
  const STATION_PLANETS = [
    { id: swisseph.SE_MERCURY, name: "Mercury" }, { id: swisseph.SE_VENUS, name: "Venus" },
    { id: swisseph.SE_MARS, name: "Mars" }, { id: swisseph.SE_JUPITER, name: "Jupiter" },
    { id: swisseph.SE_SATURN, name: "Saturn" }, { id: swisseph.SE_URANUS, name: "Uranus" },
    { id: swisseph.SE_NEPTUNE, name: "Neptune" }, { id: swisseph.SE_PLUTO, name: "Pluto" },
  ];

  // Use Whole Sign houses for station house placement (predictive)
  const natalTargets = [
    ...natalRaw.planets.map(p => ({
      name: p.name,
      longitude: p.longitude,
      house: getWholeSignHouse(p.longitude, natalRaw.ascLongitude)
    })),
    { name: "Ascendant", longitude: natalRaw.ascLongitude, house: 1 },
    { name: "Midheaven", longitude: natalRaw.mcLongitude, house: 10 },
  ];

  const today = new Date();
  const stations: PlanetaryStationData[] = [];
  for (const planet of STATION_PLANETS) {
    let prevSpeed: number | null = null;
    let prevJD: number | null = null;
    for (let dayOffset = 0; dayOffset <= 60; dayOffset++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + dayOffset);
      const jd = toJulianDay(checkDate.toISOString().slice(0, 10), "12:00", 0);
      const result = swisseph.swe_calc_ut(jd, planet.id, 4 | 256);
      const speed = result.longitudeSpeed;
      const longitude = result.longitude;

      if (prevSpeed !== null && prevJD !== null &&
        ((prevSpeed > 0 && speed <= 0) || (prevSpeed < 0 && speed >= 0))
      ) {
        const exactStationJD = refineStationJulianDay(planet.id, prevJD, jd) ?? jd;

        const stationResult = swisseph.swe_calc_ut(exactStationJD, planet.id, 4 | 256);
        const stationSpeed = stationResult.longitudeSpeed;
        const stationLongitude = stationResult.longitude;

        const stationType: "retrograde" | "direct" =
          prevSpeed > 0 && stationSpeed <= 0 ? "retrograde" : "direct";

        const { sign, degree } = longitudeToSignDegree(stationLongitude);

        let natalPlanetHit: string | null = null;
        let orbDegrees: number | null = null;
        let natalHouse: number | null = null;

        for (const target of natalTargets) {
          let diff = Math.abs(stationLongitude - target.longitude);
          if (diff > 180) diff = 360 - diff;

          if (diff <= 3.0 && (orbDegrees === null || diff < orbDegrees)) {
            natalPlanetHit = target.name;
            orbDegrees = Math.round(diff * 10) / 10;
            natalHouse = target.house;
          }
        }

        stations.push({
          planet: planet.name,
          stationDate: formatJulianDate(exactStationJD),
          stationType,
          sign,
          degree,
          natalPlanetHit,
          orbDegrees,
          natalHouse,
        });
      }

      prevSpeed = speed;
      prevJD = jd;
    }
  }
  return stations;
}

function calculateSolarReturn(
  jdBirth: number,
  natalSunLongitude: number,
  srLat: number,
  srLng: number,
  useCurrentLocation: boolean,
  timeLord: string
): SolarReturnData {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swisseph = require("swisseph");

  const now = new Date();
  const currentYear = now.getFullYear();

  const jdToDate = (jd: number) => new Date((jd - 2440587.5) * 86400000);
  const yearsSinceBirth = currentYear - jdToDate(jdBirth).getFullYear();
  const approxJD = jdBirth + yearsSinceBirth * 365.25;

  const bestJD = refinePlanetToLongitude(swisseph.SE_SUN, natalSunLongitude, approxJD);

  if (bestJD === null) {
    throw new Error("Unable to solve exact Solar Return.");
  }

  const srRaw = calculatePlanets(bestJD, srLat, srLng, "P");

  const ascDeg = longitudeToSignDegree(srRaw.ascLongitude);
  const mcDeg = longitudeToSignDegree(srRaw.mcLongitude);

  const PLANET_NAMES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node"];

  // Use Whole Sign houses for Solar Return (predictive)
  const planets = srRaw.planets
    .filter(p => PLANET_NAMES.includes(p.name))
    .map(({ name, longitude, isRetrograde }) => {
      const { sign, degree } = longitudeToSignDegree(longitude);
      const house = String(getWholeSignHouse(longitude, srRaw.ascLongitude));
      return { name, sign, degree: isRetrograde ? `${degree} Rx` : degree, house };
    });

  const timeLordInSR = planets.find(p => p.name === timeLord);

  const srDate = new Date((bestJD - 2440587.5) * 86400000);
  const sunReturnDate = srDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  return {
    sunReturnDate,
    location: useCurrentLocation ? "current location" : "birth location",
    ascendant: ascDeg,
    midheaven: mcDeg,
    planets,
    timeLordInSR: timeLordInSR ? `${timeLordInSR.sign} House ${timeLordInSR.house}` : null,
    timeLordSRHouse: timeLordInSR ? Number(timeLordInSR.house) : null,
  };
}

const MOON_PHASE_NAMES: Array<{ maxAngle: number; name: string }> = [
  { maxAngle: 11.25, name: "New Moon" },
  { maxAngle: 78.75, name: "Waxing Crescent" },
  { maxAngle: 101.25, name: "First Quarter" },
  { maxAngle: 168.75, name: "Waxing Gibbous" },
  { maxAngle: 191.25, name: "Full Moon" },
  { maxAngle: 258.75, name: "Waning Gibbous" },
  { maxAngle: 281.25, name: "Last Quarter" },
  { maxAngle: 348.75, name: "Waning Crescent" },
  { maxAngle: 360.01, name: "New Moon" },
];

function getMoonPhaseName(moonSunAngle: number): string {
  for (const { maxAngle, name } of MOON_PHASE_NAMES) {
    if (moonSunAngle < maxAngle) return name;
  }
  return "New Moon";
}

function getMoonIllumination(moonSunAngle: number): number {
  const radians = (moonSunAngle * Math.PI) / 180;
  const illumination = (1 - Math.cos(radians)) / 2;
  return Math.round(illumination * 100);
}

function calculateMoonPhase(
  jdNow: number,
  moonLongitude: number,
  moonSign: string,
  moonDegree: string,
  lat: number,
  lng: number
): MoonPhaseData {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swisseph = require("swisseph");

  const sunResult = swisseph.swe_calc_ut(jdNow, swisseph.SE_SUN, 4 | 256);
  const sunLongitude = sunResult.longitude;

  let moonSunAngle = moonLongitude - sunLongitude;
  moonSunAngle = ((moonSunAngle % 360) + 360) % 360;

  const phaseName = getMoonPhaseName(moonSunAngle);
  const illuminationPercent = getMoonIllumination(moonSunAngle);

  let daysUntilNextEvent = 30;
  let nextEventName: "New Moon" | "Full Moon" = moonSunAngle < 180 ? "Full Moon" : "New Moon";

  for (let dayOffset = 0; dayOffset <= 30; dayOffset++) {
    const jdCheck = jdNow + dayOffset;
    const sunCheck = swisseph.swe_calc_ut(jdCheck, swisseph.SE_SUN, 4 | 256);
    const moonCheck = swisseph.swe_calc_ut(jdCheck, swisseph.SE_MOON, 4 | 256);
    let angleCheck = moonCheck.longitude - sunCheck.longitude;
    angleCheck = ((angleCheck % 360) + 360) % 360;

    const closeToNew = angleCheck < 2 || angleCheck > 358;
    const closeToFull = angleCheck > 178 && angleCheck < 182;

    if (closeToNew) {
      daysUntilNextEvent = dayOffset;
      nextEventName = "New Moon";
      break;
    }
    if (closeToFull) {
      daysUntilNextEvent = dayOffset;
      nextEventName = "Full Moon";
      break;
    }
  }

  return {
    phaseName,
    illuminationPercent,
    nextEventName,
    daysUntilNextEvent,
    moonSign,
    moonDegree,
  };
}

function calculateDeclinations(jd: number): DeclinationData[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swisseph = require("swisseph");
  const BODIES = [
    { id: swisseph.SE_SUN, name: "Sun" },
    { id: swisseph.SE_MOON, name: "Moon" },
    { id: swisseph.SE_MERCURY, name: "Mercury" },
    { id: swisseph.SE_VENUS, name: "Venus" },
    { id: swisseph.SE_MARS, name: "Mars" },
    { id: swisseph.SE_JUPITER, name: "Jupiter" },
    { id: swisseph.SE_SATURN, name: "Saturn" },
    { id: swisseph.SE_URANUS, name: "Uranus" },
    { id: swisseph.SE_NEPTUNE, name: "Neptune" },
    { id: swisseph.SE_PLUTO, name: "Pluto" },
  ];

  return BODIES.map(({ id, name }) => {
    const res = swisseph.swe_calc_ut(jd, id, 4 | 2048);
    const declinationVal = res.latitude ?? 0;
    const declination = Math.round(declinationVal * 100) / 100;
    const isOutOfBounds = Math.abs(declination) > 23.45;

    return { planet: name, declination, isOutOfBounds };
  });
}

function calculateArabicLots(
  sunLong: number,
  moonLong: number,
  ascLong: number,
  isDayChart: boolean
): ArabicLot[] {
  let fortuneLong: number;
  let spiritLong: number;

  if (isDayChart) {
    fortuneLong = (ascLong + moonLong - sunLong + 360) % 360;
    spiritLong = (ascLong + sunLong - moonLong + 360) % 360;
  } else {
    fortuneLong = (ascLong + sunLong - moonLong + 360) % 360;
    spiritLong = (ascLong + moonLong - sunLong + 360) % 360;
  }

  // Use Whole Sign houses for Arabic Lots (predictive)
  const fortunePos = longitudeToSignDegree(fortuneLong);
  const spiritPos = longitudeToSignDegree(spiritLong);

  return [
    {
      name: "Lot of Fortune",
      sign: fortunePos.sign,
      degree: fortunePos.degree,
      house: getWholeSignHouse(fortuneLong, ascLong),
    },
    {
      name: "Lot of Spirit",
      sign: spiritPos.sign,
      degree: spiritPos.degree,
      house: getWholeSignHouse(spiritLong, ascLong),
    },
  ];
}

// ============================================================
// ── UPGRADE CHART CATALOG ──
// ============================================================

function buildUpgradeChartPoints(
  chart: NormalizedChart,
  raw: ReturnType<typeof calculatePlanets>,
  extendedPoints?: ExtendedPoints
): UpgradeChartPoint[] {
  const requestedPlacementNames = [
    "Sun",
    "Moon",
    "Ascendant",
    "Mercury",
    "Venus",
    "Mars",
    "Jupiter",
    "Saturn",
    "Uranus",
    "Neptune",
    "Pluto",
    "Chiron",
    "North Node",
    "South Node",
    "Lilith",
  ];

  const points: UpgradeChartPoint[] = [];

  for (const name of requestedPlacementNames) {
    const placement = chart.planets.find((planet) => planet.name === name);
    if (!placement) continue;

    points.push({
      id: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      category:
        name === "Ascendant" ? "angle" :
        ["South Node", "North Node", "Chiron", "Lilith", "Vertex"].includes(name) ? "point" :
        "placement",
      sign: placement.sign,
      degree: placement.degree,
      house: placement.house ?? "",
    });
  }

  const fortune = extendedPoints?.arabicLots.find((lot) => lot.name === "Lot of Fortune");
  if (fortune) {
    // The existing Arabic-lot calculation remains untouched. The UI label uses
    // the user's preferred name, Part of Fortune.
    points.push({
      id: "part-of-fortune",
      name: "Part of Fortune",
      sourceName: "Lot of Fortune",
      category: "point",
      sign: fortune.sign,
      degree: fortune.degree,
      house: String(fortune.house),
    });
  }

  const vertex = chart.planets.find((planet) => planet.name === "Vertex");
  if (vertex) {
    points.push({
      id: "vertex",
      name: "Vertex",
      category: "point",
      sign: vertex.sign,
      degree: vertex.degree,
      house: vertex.house ?? String(getPlacidusHouse(raw.vertexLongitude, raw.houseCusps)),
    });
  }

  // Read the three additional angles from the same raw Swiss Ephemeris
  // longitudes used to build the normalized chart. NormalizedChart marks some
  // angle properties as optional, so deriving them here keeps strict TypeScript
  // happy without changing the actual astrology calculation.
  const mcPosition = longitudeToSignDegree(raw.mcLongitude);
  const icLongitude = normalizeLongitude(raw.mcLongitude + 180);
  const icPosition = longitudeToSignDegree(icLongitude);
  const dcLongitude = normalizeLongitude(raw.ascLongitude + 180);
  const dcPosition = longitudeToSignDegree(dcLongitude);

  const anglePoints: Array<{
    id: string;
    name: string;
    sign: string;
    degree: string;
    house: string;
    sourceName?: string;
  }> = [
    {
      id: "mc",
      name: "MC",
      sourceName: "Midheaven",
      sign: mcPosition.sign,
      degree: mcPosition.degree,
      house: "10",
    },
    {
      id: "ic",
      name: "IC",
      sourceName: "Imum Coeli",
      sign: icPosition.sign,
      degree: icPosition.degree,
      house: "4",
    },
    {
      id: "descendant",
      name: "Descendant",
      sign: dcPosition.sign,
      degree: dcPosition.degree,
      house: "7",
    },
  ];

  for (const angle of anglePoints) {
    points.push({
      id: angle.id,
      name: angle.name,
      sourceName: angle.sourceName,
      category: "angle",
      sign: angle.sign,
      degree: angle.degree,
      house: angle.house,
    });
  }

  return points;
}

// ============================================================
// ── HELPERS FOR ADVANCED CALCULATIONS ──
// ============================================================

/**
 * Convert Placidus house cusps to the format expected by houseRulers
 */
function buildHouseCuspMap(houseCusps: number[]): Record<number, string> {
  const houseCuspSigns: Record<number, string> = {};
  for (let i = 0; i < houseCusps.length; i++) {
    const { sign } = longitudeToSignDegree(houseCusps[i]);
    houseCuspSigns[i + 1] = sign;
  }
  return houseCuspSigns;
}

/**
 * Build angles array for transit-to-angle calculations
 */
function buildAngles(
  ascLongitude: number,
  mcLongitude: number
): Array<{ name: "Ascendant" | "Midheaven" | "Descendant" | "Imum Coeli"; sign: string; degree: string }> {
  const asc = longitudeToSignDegree(ascLongitude);
  const mc = longitudeToSignDegree(mcLongitude);
  const dc = longitudeToSignDegree((ascLongitude + 180) % 360);
  const ic = longitudeToSignDegree((mcLongitude + 180) % 360);

  return [
    { name: "Ascendant", sign: asc.sign, degree: asc.degree },
    { name: "Midheaven", sign: mc.sign, degree: mc.degree },
    { name: "Descendant", sign: dc.sign, degree: dc.degree },
    { name: "Imum Coeli", sign: ic.sign, degree: ic.degree },
  ];
}

// ============================================================
// POST HANDLER
// ============================================================

export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swisseph = require("swisseph");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("path");
  swisseph.swe_set_ephe_path(path.join(process.cwd(), "node_modules/swisseph/ephe"));

  try {
    const body = await req.json() as ChartCalculateRequest;
    const { birthDate, birthTime, birthPlace, lat, lng, timezone, currentLat, currentLng } = body;

    const hasBirthCoordinates =
      typeof lat === "number" &&
      Number.isFinite(lat) &&
      typeof lng === "number" &&
      Number.isFinite(lng);

    if (!birthDate || !birthTime || !timezone || !hasBirthCoordinates) {
      return NextResponse.json(
        {
          success: false,
          error: "birthDate, birthTime, timezone, lat, and lng are required.",
        },
        { status: 400 }
      );
    }

    const utcOffset = getUtcOffset(birthDate, birthTime, timezone);
    const jdBirth = toJulianDay(birthDate, birthTime, utcOffset);

    const now = new Date();
    const jdNow = toJulianDay(
      now.toISOString().slice(0, 10),
      `${now.getUTCHours()}:${String(now.getUTCMinutes()).padStart(2, "0")}`,
      0
    );

    // Use Placidus ("P") for all natal and transit calculations
    const tropicalRaw = calculatePlanets(jdBirth, lat, lng, "P");
    const tropicalChart = buildNormalizedChart(tropicalRaw, birthDate, birthTime, birthPlace, lat, lng, timezone);

    const siderealRaw = calculatePlanets(jdBirth, lat, lng, "P", swisseph.SE_SIDM_LAHIRI);
    const siderealChart = buildNormalizedChart(siderealRaw, birthDate, birthTime, birthPlace, lat, lng, timezone);

    const transitRaw = calculatePlanets(jdNow, lat, lng, "P");
    const transits: TransitPlanet[] = transitRaw.planets.map(({ name, longitude, isRetrograde }) => {
      const { sign, degree } = longitudeToSignDegree(longitude);
      return {
        name,
        sign,
        degree,
        longitude: normalizeLongitude(longitude),
        isRetrograde,
      };
    });

    let transitAspects: TransitAspect[] = [];
    try {
      transitAspects = calculateTransitAspects(
        transitRaw.planets,
        tropicalRaw,
        longitudeToSignDegree,
        getWholeSignHouse // Use Whole Sign houses for transit aspects (predictive)
      );
    } catch (e) {
      console.warn("[chart-calculate] Transit aspect calculation failed:", e);
    }

    const ascSign = tropicalChart.angles.asc?.sign ?? "Aries";

    // For profection, use Whole Sign houses (predictive)
    const natalPlanetsForProfection = tropicalRaw.planets.map(({ name, longitude }) => {
      const { sign } = longitudeToSignDegree(longitude);
      return { name, sign, house: getWholeSignHouse(longitude, tropicalRaw.ascLongitude) };
    });
    const profection = calculateProfection(birthDate, ascSign, natalPlanetsForProfection);

    const progressions = calculateProgressions(jdBirth, birthDate, lat, lng);
    const solarArcs = calculateSolarArcs(jdBirth, birthDate, lat, lng);

    let upcomingTrigger: UpcomingTriggerData | undefined;
    try {
      upcomingTrigger = calculateUpcomingTrigger(tropicalRaw, jdNow);
    } catch (e) {
      console.warn("[chart-calculate] Upcoming trigger sweep failed:", e);
    }

    let planetaryStations: PlanetaryStationData[] = [];
    try {
      planetaryStations = calculatePlanetaryStations(tropicalRaw, lat, lng);
    } catch (e) {
      console.warn("[chart-calculate] Planetary stations sweep failed:", e);
    }

    let solarReturn: SolarReturnData | undefined;
    try {
      const natalSun = tropicalRaw.planets.find(p => p.name === "Sun");
      if (natalSun) {
        const hasCurrentLocation =
          typeof currentLat === "number" &&
          Number.isFinite(currentLat) &&
          typeof currentLng === "number" &&
          Number.isFinite(currentLng);

        const srLat = hasCurrentLocation ? currentLat : lat;
        const srLng = hasCurrentLocation ? currentLng : lng;
        const useCurrentLocation = hasCurrentLocation;

        solarReturn = calculateSolarReturn(jdBirth, natalSun.longitude, srLat, srLng, useCurrentLocation, profection.timeLord);
      }
    } catch (e) {
      console.warn("[chart-calculate] Solar return calculation failed:", e);
    }

    let moonPhase: MoonPhaseData | undefined;
    try {
      const transitMoon = transitRaw.planets.find(p => p.name === "Moon");
      if (transitMoon) {
        const { sign: moonSign, degree: moonDegree } = longitudeToSignDegree(transitMoon.longitude);
        moonPhase = calculateMoonPhase(jdNow, transitMoon.longitude, moonSign, moonDegree, lat, lng);
      }
    } catch (e) {
      console.warn("[chart-calculate] Moon phase calculation failed:", e);
    }

    let extendedPoints: ExtendedPoints | undefined;
    try {
      const sunPlanet = tropicalRaw.planets.find((p) => p.name === "Sun");
      const moonPlanet = tropicalRaw.planets.find((p) => p.name === "Moon");

      if (sunPlanet && moonPlanet) {
        // Use Placidus houses for determining day/night chart (sect is horizon-based)
        const sunHouse = getPlacidusHouse(sunPlanet.longitude, tropicalRaw.houseCusps);
        const isDayChart = sunHouse >= 7 && sunHouse <= 12;

        const arabicLots = calculateArabicLots(
          sunPlanet.longitude,
          moonPlanet.longitude,
          tropicalRaw.ascLongitude,
          isDayChart
        );
        const declinations = calculateDeclinations(jdBirth);

        extendedPoints = { declinations, arabicLots };
      }
    } catch (e) {
      console.warn("[chart-calculate] Extended points calculation failed:", e);
    }

    // Build the exact placement list used by Upgrade Chart. This is presentation
    // data only; aspects remain separate and predictive calculations are unchanged.
    const upgradeChartPoints = buildUpgradeChartPoints(
      tropicalChart,
      tropicalRaw,
      extendedPoints
    );

    // ============================================================
    // ── GENERATE ALL 9 ADVANCED CALCULATIONS ──
    // ============================================================

    let houseRulers: HouseRuler[] = [];
    let mutualReceptions: MutualReception[] = [];
    let essentialDignities: EssentialDignity[] = [];
    let synodicCycles: SynodicCycle[] = [];
    let midpoints: Midpoint[] = [];
    let lunarReturn: LunarReturn | undefined;
    let eclipseActivations: EclipseActivation[] = [];
    let transitsToAngles: TransitToAngleWithDate[] = [];
    let dispositorTree: DispositorResult[] = [];

    try {
      // Normalize planets for dignity calculations
      const dignityPlanets = tropicalRaw.planets.map((p) => {
        const { sign, degree } = longitudeToSignDegree(p.longitude);
        return { name: p.name, sign, degree, isRetrograde: p.isRetrograde };
      });

      // Build house cusp map from Placidus houses (for natal interpretation)
      const houseCuspMap = buildHouseCuspMap(tropicalRaw.houseCusps);

      // 1. House Rulers (Most Important) - Uses Placidus for natal
      houseRulers = calculateHouseRulers(dignityPlanets, houseCuspMap);

      // 2. Mutual Reception
      mutualReceptions = calculateMutualReception(dignityPlanets);

      // 3. Essential Dignities
      essentialDignities = dignityPlanets.map((p) =>
        calculateEssentialDignity(p.name, p.sign)
      );

      // 4. Synodic Cycles (Planetary Returns)
      synodicCycles = calculateSynodicCycles(dignityPlanets, now);

      // 5. Midpoints - Uses Whole Sign houses for midpoint house placement (predictive)
      // Convert houseCuspMap to use Whole Sign cusps for midpoints
      const wholeSignHouseMap: Record<number, string> = {};
      for (let i = 0; i < 12; i++) {
        const cuspLong = tropicalRaw.wholeSignCusps[i];
        const { sign } = longitudeToSignDegree(cuspLong);
        wholeSignHouseMap[i + 1] = sign;
      }
      midpoints = calculateMidpoints(dignityPlanets, wholeSignHouseMap);

      // 6. Lunar Return
// Target = natal Moon. Search forward for the next exact
// conjunction of the transiting Moon to that natal longitude.
const natalMoon = tropicalRaw.planets.find(
  (p) => p.name === "Moon"
);

if (natalMoon) {
  const {
    sign: natalMoonSign,
    degree: natalMoonDegree,
  } = longitudeToSignDegree(natalMoon.longitude);

  lunarReturn = calculateLunarReturn(
    natalMoonSign,
    natalMoonDegree,
    now
  );
}

      // 7. Eclipse Activation
      const knownEclipses = getKnownEclipses(now);
      eclipseActivations = calculateEclipseActivation(dignityPlanets, knownEclipses);

      // 8. Transit to Angles - with exact dates attached
      const angles = buildAngles(tropicalRaw.ascLongitude, tropicalRaw.mcLongitude);
      const rawAngleTransits = calculateTransitsToAngles(transits, angles);
      transitsToAngles = attachExactDatesToAngleTransits(rawAngleTransits, tropicalRaw, jdNow);

      // 9. Dispositor Tree
      dispositorTree = calculateDispositorTree(dignityPlanets);

    } catch (e) {
      console.warn("[chart-calculate] Advanced calculations failed:", e);
      // Continue with empty arrays - the reading will still work with basic data
    }

    // ============================================================
    // ── RESPONSE ──
    // ============================================================

    const response: ChartCalculateResponse = {
      success: true,
      tropical: tropicalChart,
      sidereal: siderealChart,
      transits,
      transitAspects,
      profection,
      progressions,
      solarArcs,
      upcomingTrigger,
      planetaryStations,
      solarReturn,
      moonPhase,
      extendedPoints,
      upgradeChartPoints,

      // ── NEW: Advanced calculations ──
      houseRulers,
      mutualReceptions,
      essentialDignities,
      synodicCycles,
      midpoints,
      lunarReturn,
      eclipseActivations,
      transitsToAngles,
      dispositorTree,
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err) {
    console.error("[chart-calculate] Error:", err);
    return NextResponse.json({ success: false, error: "Failed to calculate chart." }, { status: 500 });
  }
}

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swisseph = require("swisseph");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("path");
  swisseph.swe_set_ephe_path(path.join(process.cwd(), "node_modules/swisseph/ephe"));
  return NextResponse.json({ status: "ok", endpoint: "/api/chart-calculate", method: "POST" });
}"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles, RotateCcw, Crown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadChart } from "@/lib/chartStore";

/**
 * TODAY'S SKY — v4
 *
 * Present-tense sky panel. The birth chart moved to its own sibling
 * panel (BirthChartPanel); this one keeps what's happening NOW:
 *
 *   HERO → Sun season + Moon (with drawn moon disc + next event)
 *   Retrogrades | Time Lord
 *   Transits (full list, last on the page)
 *
 * Time Lord lives here (not on the birth chart page) because it's a
 * timing pointer — "what's steering your year right now" — which is the
 * same present tense as transits and the moon.
 *
 * This panel has NO overflow of its own — PagerContainer's wrapper
 * scrolls it. Keep it that way.
 */
interface UserStatus {
  credits: number;
  isSubscribed: boolean;
  readingsCompleted: number;
  onCooldown: boolean;
  cooldownExpiresAt: string | null;
  canBypass: boolean;
}

interface TodaySkyPanelProps {
  userStatus: UserStatus | null;
}

interface TransitPlanet {
  name: string;
  sign: string;
  degree: string;
  isRetrograde: boolean;
  house?: number;
}

interface MoonPhaseData {
  phaseName: string;
  illuminationPercent: number;
  nextEventName: "New Moon" | "Full Moon";
  daysUntilNextEvent: number;
  moonSign: string;
  moonDegree: string;
}

interface ProfectionData {
  profectionYear: number;
  age: number;
  activatedSign: string;
  timeLord: string;
}

// U+FE0E forces text presentation so iOS never swaps these for emoji.
const T = "\uFE0E";
const GLYPHS: Record<string, string> = {
  Sun: `☉${T}`, Moon: `☽${T}`, Mercury: `☿${T}`, Venus: `♀${T}`, Mars: `♂${T}`,
  Jupiter: `♃${T}`, Saturn: `♄${T}`, Uranus: `♅${T}`, Neptune: `♆${T}`,
  Pluto: `♇${T}`, "North Node": `☊${T}`, "South Node": `☋${T}`,
  Chiron: `⚷${T}`, Vesta: `⚶${T}`, Juno: `⚵${T}`, Ceres: `⚳${T}`,
  Pallas: `⚴${T}`, Lilith: `⚸${T}`,
  Ascendant: `↑${T}`,
};

const IMPORTANT_PLANETS = ["Sun", "Moon", "Mercury", "Venus", "Mars"];
const CORE_TRANSIT_ORDER = [
  "Sun",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto",
  "North Node",
  "South Node",
];
const EXTRA_TRANSIT_ORDER = ["Chiron", "Lilith", "Ceres", "Pallas", "Juno", "Vesta"];
const TRANSIT_ORDER = [...CORE_TRANSIT_ORDER, ...EXTRA_TRANSIT_ORDER];

type Element = "Fire" | "Earth" | "Air" | "Water";

const SIGN_ELEMENTS: Record<string, Element> = {
  Aries: "Fire", Leo: "Fire", Sagittarius: "Fire",
  Taurus: "Earth", Virgo: "Earth", Capricorn: "Earth",
  Gemini: "Air", Libra: "Air", Aquarius: "Air",
  Cancer: "Water", Scorpio: "Water", Pisces: "Water",
};

const ELEMENT_COLORS: Record<Element, { text: string; glow: string }> = {
  Fire:  { text: "#FDBA74", glow: "rgba(239, 68, 68, 0.28)" },
  Earth: { text: "#6EE7B7", glow: "rgba(16, 185, 129, 0.24)" },
  Air:   { text: "#BAE6FD", glow: "rgba(125, 211, 252, 0.22)" },
  Water: { text: "#93C5FD", glow: "rgba(59, 130, 246, 0.26)" },
};

function elementOf(sign?: string): Element | null {
  if (!sign) return null;
  return SIGN_ELEMENTS[sign] ?? null;
}

function transitRank(name: string): number {
  const knownIndex = TRANSIT_ORDER.indexOf(name);
  return knownIndex === -1 ? TRANSIT_ORDER.length + 100 : knownIndex;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/* ── Card chrome ───────────────────────────────────────────────────── */
function SkyCard({
  icon: Icon,
  label,
  className,
  children,
}: {
  icon: React.ElementType;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "standard-shadow rounded-[24px] border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm",
        className
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-slate-400" strokeWidth={2.2} />
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

/* ── SVG moon drawn from the real illumination percent ─────────────── */
function MoonDisc({ illumination, waxing, size = 108 }: { illumination: number; waxing: boolean; size?: number }) {
  const f = Math.min(1, Math.max(0, illumination / 100));
  const r = 46;
  const c = 50;
  const top = `${c} ${c - r}`;
  const bottom = `${c} ${c + r}`;
  const rx = Math.abs(1 - 2 * f) * r;
  const outerSweep = waxing ? 1 : 0;
  const terminatorSweep = f >= 0.5 ? (waxing ? 1 : 0) : (waxing ? 0 : 1);
  const litPath = `M ${top} A ${r} ${r} 0 0 ${outerSweep} ${bottom} A ${rx} ${r} 0 0 ${terminatorSweep} ${top}`;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id="moonlit" cx="38%" cy="34%" r="75%">
          <stop offset="0%" stopColor="#F1EFF7" />
          <stop offset="55%" stopColor="#C9C7D6" />
          <stop offset="100%" stopColor="#9A98AC" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={r} fill="#151A30" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
      {f > 0.995 ? (
        <circle cx={c} cy={c} r={r} fill="url(#moonlit)" />
      ) : f > 0.005 ? (
        <path d={litPath} fill="url(#moonlit)" />
      ) : null}
      <circle cx="38" cy="40" r="7" fill="rgba(0,0,0,0.10)" />
      <circle cx="60" cy="58" r="5" fill="rgba(0,0,0,0.09)" />
      <circle cx="52" cy="30" r="3.5" fill="rgba(0,0,0,0.08)" />
      <circle cx="42" cy="66" r="4" fill="rgba(0,0,0,0.08)" />
    </svg>
  );
}

/* ── Panel ──────────────────────────────────────────────────────────── */
export default function TodaySkyPanel({ userStatus }: TodaySkyPanelProps) {
  const shouldReduceMotion = useReducedMotion();
  const [transits, setTransits] = useState<TransitPlanet[]>([]);
  const [moonPhase, setMoonPhase] = useState<MoonPhaseData | null>(null);
  const [profection, setProfection] = useState<ProfectionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Lightweight interaction state for the transit escalator.
  const [transitsPaused, setTransitsPaused] = useState(false);
  const transitDragRef = React.useRef<{
    pointerId: number | null;
    startY: number;
    startTime: number;
  }>({
    pointerId: null,
    startY: 0,
    startTime: 0,
  });

  useEffect(() => {
    let cancelled = false;
    const tryLoad = () => {
      const chart = loadChart();
      if (!chart?.chartData) return false; // not ready yet
      const data = chart.chartData as unknown as {
        transits?: TransitPlanet[];
        moonPhase?: MoonPhaseData;
        profection?: ProfectionData;
      };
      if (data.transits) {
        setTransits(
          [...data.transits].sort(
          (a, b) => transitRank(a.name) - transitRank(b.name)
        )
        );
      }
      if (data.moonPhase) setMoonPhase(data.moonPhase);
      if (data.profection) setProfection(data.profection);
      setIsLoading(false);
      return true; // loaded
    };

    // Try immediately; if the chart isn't ready, retry briefly until it is.
    if (tryLoad()) return;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (cancelled || tryLoad() || attempts > 20) {
        clearInterval(interval);
        if (attempts > 20) setIsLoading(false); // give up after ~5s, show empty state
      }
    }, 250);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const sunNow = useMemo(() => transits.find((p) => p.name === "Sun"), [transits]);
  const moonNow = useMemo(() => transits.find((p) => p.name === "Moon"), [transits]);
  const retrogrades = useMemo(() => transits.filter((p) => p.isRetrograde === true), [transits]);
  const hasProfection =
    !!profection &&
    typeof profection.profectionYear === "number" &&
    !!profection.timeLord &&
    !!profection.activatedSign;
  const waxing = moonPhase?.nextEventName === "Full Moon";
  const dateLine = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const heroDetail = (p: TransitPlanet | undefined, fallbackDegree?: string) => {
    const degree = p?.degree ?? fallbackDegree;
    if (!degree) return null;
    return (
      <p className="mt-0.5 text-[13px] text-slate-400 tabular-nums">
        {degree}
        {p?.house ? <span className="text-slate-500"> · {ordinal(p.house)} house</span> : null}
        {p?.isRetrograde ? <span className="ml-1 text-amber-300/80">℞</span> : null}
      </p>
    );
  };

  const getTransitAnimation = () => {
    if (typeof document === "undefined") return null;
    const track = document.querySelector<HTMLElement>("[data-transit-track]");
    return track?.getAnimations()[0] ?? null;
  };

  const beginTransitDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (transits.length <= 5) return;
    const animation = getTransitAnimation();
    const currentTime =
      animation && typeof animation.currentTime === "number"
        ? animation.currentTime
        : 0;
    transitDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTime: currentTime,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setTransitsPaused(true);
  };

  const moveTransitDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = transitDragRef.current;
    if (drag.pointerId !== event.pointerId || transits.length <= 5) return;
    const animation = getTransitAnimation();
    if (!animation) return;
    const rowHeight = 52;
    const rowDurationMs = 3000;
    const totalDuration = transits.length * rowDurationMs;
    // Dragging upward advances the list; dragging downward rewinds it.
    const deltaY = event.clientY - drag.startY;
    let nextTime = drag.startTime - (deltaY / rowHeight) * rowDurationMs;
    nextTime %= totalDuration;
    if (nextTime < 0) nextTime += totalDuration;
    animation.currentTime = nextTime;
  };

  const endTransitDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (transitDragRef.current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    transitDragRef.current.pointerId = null;
    setTransitsPaused(false);
  };

  // Resolve the element color for the profection's activated sign up front.
  // elementOf() can return null for unknown signs, so fall back to Fire's
  // color rather than indexing ELEMENT_COLORS with a possibly-null key.
  const profectionElement = elementOf(profection?.activatedSign) ?? "Fire";
  const profectionSignColor = ELEMENT_COLORS[profectionElement].text;

  if (isLoading) {
    return (
      <div className="flex min-h-full w-full min-w-0 max-w-full items-center justify-center bg-[#050816]">
        <div className="text-sm text-slate-400">Reading the sky…</div>
      </div>
    );
  }

  return (
    <div
      className="relative min-h-full w-full min-w-0 max-w-full overflow-x-hidden font-sans text-slate-100"
    >
      <style jsx>{`
        @keyframes transitEscalator {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(0, calc(var(--transit-count) * -52px), 0); }
        }

        .transit-viewport {
          height: 260px;
          overflow: hidden;
          contain: layout paint;
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
          touch-action: none;
          cursor: grab;
        }

        .transit-viewport[data-paused="true"] {
          cursor: grabbing;
        }

        .transit-track {
          will-change: transform;
          animation: transitEscalator calc(var(--transit-count) * 3s) linear infinite;
        }

        .transit-track[data-paused="true"] {
          animation-play-state: paused;
        }

        .transit-row {
          height: 52px;
        }

        @media (prefers-reduced-motion: reduce) {
          .transit-track {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>

      <div
        className="relative z-10 mx-auto w-full min-w-0 max-w-[430px] px-[clamp(12px,4vw,16px)]"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 8px)",
          paddingBottom: "calc(4rem + env(safe-area-inset-bottom))",
        }}
      >
        {/* ── HERO — Sun + Moon, borderless, data-first ── */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="mb-6"
        >
          <p className="text-center text-[10px] uppercase tracking-[0.24em] text-slate-500">
            {dateLine}
          </p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  {GLYPHS.Sun} Sun Season
                </p>
                <p className="text-[clamp(30px,8.7vw,34px)] font-light leading-tight text-white">
                  {sunNow?.sign ?? "—"}
                </p>
                {heroDetail(sunNow)}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  {GLYPHS.Moon} Moon
                </p>
                <p className="text-[clamp(30px,8.7vw,34px)] font-light leading-tight text-white">
                  {moonPhase?.moonSign ?? moonNow?.sign ?? "—"}
                </p>
                {heroDetail(moonNow, moonPhase?.moonDegree)}
              </div>
            </div>

            {moonPhase && (
              <div className="shrink-0 text-center">
                <div style={{ filter: "drop-shadow(0 0 26px rgba(226,223,240,0.16))" }}>
                  <MoonDisc illumination={moonPhase.illuminationPercent} waxing={waxing} />
                </div>
                <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  {moonPhase.nextEventName}
                </p>
                <p className="text-[13px] font-medium text-slate-200 tabular-nums">
                  in {moonPhase.daysUntilNextEvent} days
                </p>
              </div>
            )}
          </div>

          {moonPhase && (
            <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Phase</p>
                <p className="mt-0.5 text-[13px] font-medium text-slate-200">{moonPhase.phaseName}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Illumination</p>
                <p className="mt-0.5 text-[13px] font-medium text-slate-200 tabular-nums">
                  {moonPhase.illuminationPercent}%
                </p>
              </div>
            </div>
          )}
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
          className="space-y-3"
        >
          {/* ── ROW: Retrogrades | Time Lord ── */}
          <div className="grid grid-cols-2 gap-3">
            <SkyCard icon={RotateCcw} label="Retrogrades">
              <p className="text-[clamp(32px,9.7vw,38px)] font-extralight leading-none text-white tabular-nums">
                {retrogrades.length}
              </p>
              <p className="mt-4 text-[12px] leading-5 text-slate-400">
                {retrogrades.length > 0
                  ? retrogrades.map((p) => p.name).join(", ")
                  : "Every planet is moving direct."}
              </p>
            </SkyCard>
            <SkyCard icon={Crown} label="Time Lord">
              {hasProfection ? (
                <>
                  <p className="text-[26px] font-light leading-tight text-white">
                    {profection!.timeLord}
                  </p>
                  <p className="mt-4 text-[12px] leading-5 text-slate-400">
                    {ordinal(profection!.profectionYear)} house year —{" "}
                    <span
                      className="font-medium"
                      style={{ color: profectionSignColor }}
                    >
                      {profection!.activatedSign}
                    </span>{" "}
                    activated.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[26px] font-light leading-tight text-slate-500">—</p>
                  <p className="mt-4 text-[12px] leading-5 text-slate-500">
                    Exit and re-enter if it's not populating.
                  </p>
                </>
              )}
            </SkyCard>
          </div>

          {/* ── TRANSITS — birth-chart chrome + lightweight five-row escalator ── */}
          <section className="standard-shadow overflow-hidden rounded-[18px] border border-white/10 bg-transparent">
            {/* Same visual treatment as View My Chart; intentionally not interactive yet. */}
            <div
              className="relative flex w-full items-center justify-center px-4 py-[13px] text-[13px] font-medium uppercase tracking-[0.18em] text-slate-200"
              style={{
                background:
                  "radial-gradient(circle at 18% 0%, rgba(96,165,250,0.10), transparent 44%), linear-gradient(145deg, rgba(17,29,52,0.92), rgba(8,13,28,0.88))",
                WebkitBackdropFilter: "blur(14px)",
                backdropFilter: "blur(14px)",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.055), inset 0 -1px 0 rgba(255,255,255,0.025)",
              }}
            >
              <span>Transits</span>
            </div>

            {transits.length > 0 ? (
              <div className="border-t border-white/[0.06] px-4">
                <div
                  className="transit-viewport"
                  data-paused={transitsPaused}
                  onPointerDown={beginTransitDrag}
                  onPointerMove={moveTransitDrag}
                  onPointerUp={endTransitDrag}
                  onPointerCancel={endTransitDrag}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  {shouldReduceMotion || transits.length <= 5 ? (
                    <div>
                      {transits.slice(0, 5).map((planet, index) => {
                        const element = elementOf(planet.sign);
                        const colors = element ? ELEMENT_COLORS[element] : null;
                        const important = IMPORTANT_PLANETS.includes(planet.name);
                        const isRetrograde = planet.isRetrograde === true;

                        return (
                          <div
                            key={planet.name}
                            className={cn(
                              "transit-row flex items-center gap-3",
                              index < Math.min(transits.length, 5) - 1 && "border-b border-white/5"
                            )}
                          >
                            <span
                              className="w-8 shrink-0 text-center text-xl"
                              style={{
                                color: colors?.text ?? (important ? "#FCD34D" : "#64748b"),
                                textShadow: colors ? `0 0 10px ${colors.glow}` : "none",
                              }}
                            >
                              {GLYPHS[planet.name] ?? "•"}
                            </span>
                            <span
                              className={cn(
                                "w-24 shrink-0 text-[12px] font-medium uppercase tracking-wide",
                                important ? "text-slate-200" : "text-slate-400"
                              )}
                            >
                              {planet.name}
                            </span>
                            <span
                              className="min-w-0 flex-1 truncate text-[15px] font-medium"
                              style={{ color: colors?.text ?? "#cbd5e1" }}
                            >
                              {planet.sign}
                            </span>
                            <span className="shrink-0 text-[13px] text-slate-400 tabular-nums">
                              {planet.degree}
                              {isRetrograde && <span className="ml-1 text-amber-300/80">℞</span>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      className="transit-track"
                      data-transit-track
                      data-paused={transitsPaused}
                      style={{ "--transit-count": transits.length } as React.CSSProperties}
                    >
                      {[...transits, ...transits].map((planet, index) => {
                        const element = elementOf(planet.sign);
                        const colors = element ? ELEMENT_COLORS[element] : null;
                        const important = IMPORTANT_PLANETS.includes(planet.name);
                        const isRetrograde = planet.isRetrograde === true;

                        return (
                          <div
                            key={`${planet.name}-${index}`}
                            className="transit-row flex items-center gap-3 border-b border-white/5"
                          >
                            <span
                              className="w-8 shrink-0 text-center text-xl"
                              style={{
                                color: colors?.text ?? (important ? "#FCD34D" : "#64748b"),
                                textShadow: colors ? `0 0 10px ${colors.glow}` : "none",
                              }}
                            >
                              {GLYPHS[planet.name] ?? "•"}
                            </span>
                            <span
                              className={cn(
                                "w-24 shrink-0 text-[12px] font-medium uppercase tracking-wide",
                                important ? "text-slate-200" : "text-slate-400"
                              )}
                            >
                              {planet.name}
                            </span>
                            <span
                              className="min-w-0 flex-1 truncate text-[15px] font-medium"
                              style={{ color: colors?.text ?? "#cbd5e1" }}
                            >
                              {planet.sign}
                            </span>
                            <span className="shrink-0 text-[13px] text-slate-400 tabular-nums">
                              {planet.degree}
                              {isRetrograde && <span className="ml-1 text-amber-300/80">℞</span>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="border-t border-white/[0.06] px-4 py-5 text-center text-[12px] text-slate-500">
                Calculate your chart to see today&apos;s transits.
              </p>
            )}
          </section>

          <p className="flex items-center justify-center gap-1 pt-2 text-center text-[10px] uppercase tracking-[0.18em] text-slate-600">
            <ChevronLeft className="h-3 w-3" /> Your Birth Chart
          </p>
        </motion.div>
      </div>
    </div>
  );
}import { NextResponse } from "next/server";
import {
  buildDailyHoroscopePrompt,
  parseDailyHoroscopeResponse,
  formatDailyHoroscope,
  type DailyHoroscopeInput,
} from "@/lib/dailyHoroscopeEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OpenAITextContent = {
  type?: string;
  text?: string;
};

type OpenAIResponsePayload = {
  status?: "completed" | "incomplete" | "failed";
  incomplete_details?: { reason?: string };
  output_text?: string;
  output?: Array<{
    content?: Array<OpenAITextContent & { refusal?: string }>;
  }>;
  error?: { message?: string };
};

function extractOutputText(payload: OpenAIResponsePayload): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text!.trim())
    .filter(Boolean)
    .join("\n");
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Daily horoscope generation is not configured yet." },
        { status: 503 }
      );
    }

    const body = await request.json() as Partial<DailyHoroscopeInput>;
    if (!body.localDate || !Array.isArray(body.tropicalPlanets) || body.tropicalPlanets.length === 0) {
      return NextResponse.json(
        { error: "A saved birth chart is required to prepare today’s horoscope." },
        { status: 400 }
      );
    }

    const input: DailyHoroscopeInput = {
      localDate: body.localDate,
      tropicalPlanets: body.tropicalPlanets,
      currentTransits: Array.isArray(body.currentTransits) ? body.currentTransits : [],
      transitAspects: Array.isArray(body.transitAspects) ? body.transitAspects : [],
      ...(body.profection ? { profection: body.profection } : {}),
      ...(body.moonPhase ? { moonPhase: body.moonPhase } : {}),
    };

    const prompt = buildDailyHoroscopePrompt(input);
    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // This is intentionally a small, non-reasoning model. The task is a
        // short structured synthesis, so it is faster and cheaper than using
        // the full reading model and does not spend the output allowance on
        // hidden reasoning tokens.
        model: process.env.DAILY_HOROSCOPE_MODEL || "gpt-4o-mini",
        input: prompt,
        max_output_tokens: 450,
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "daily_horoscope",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                urgency: {
                  type: "string",
                  enum: ["urgent", "important", "steady", "supportive"],
                },
                action: { type: "string" },
                boundary: { type: "string" },
                warning: { type: "string" },
                positive: { type: "string" },
              },
              required: ["urgency", "action", "boundary", "warning", "positive"],
            },
          },
        },
      }),
    });

    const payload = await openAIResponse.json() as OpenAIResponsePayload;
    if (!openAIResponse.ok) {
      throw new Error(payload.error?.message || "The horoscope service did not complete the request.");
    }

    if (payload.status === "incomplete") {
      throw new Error(
        `The horoscope response was incomplete${payload.incomplete_details?.reason ? `: ${payload.incomplete_details.reason}` : ""}.`
      );
    }

    const refusal = (payload.output ?? [])
      .flatMap((item) => item.content ?? [])
      .find((content) => typeof content.refusal === "string")?.refusal;
    if (refusal) throw new Error("The horoscope request was refused by the model.");

    const raw = extractOutputText(payload);
    if (!raw) throw new Error("The horoscope service returned an empty response.");

    const result = parseDailyHoroscopeResponse(raw);
    return NextResponse.json({
      horoscope: formatDailyHoroscope(result),
      urgency: result.urgency,
      localDate: input.localDate,
    });
  } catch (error) {
    console.error("Daily horoscope generation failed", error);
    const message = error instanceof Error ? error.message : "Unknown horoscope error";
    return NextResponse.json(
      {
        error: process.env.NODE_ENV === "production"
          ? "Today’s horoscope could not be prepared. Please try again."
          : `Today’s horoscope could not be prepared: ${message}`,
      },
      { status: 500 }
    );
  }
}
// AstroProXL — lightweight daily horoscope engine
//
// This is intentionally much smaller than the full reading engine. It sends a
// compact natal/timing snapshot and the strongest daily aspects to the model,
// then returns four short components that the UI combines into three sentences:
// action. boundary + warning. positive.

export type DailyUrgency = "urgent" | "important" | "steady" | "supportive";

export interface DailyPlanet {
  name: string;
  sign: string;
  degree: string;
  house?: string | number;
  longitude?: number;
  isRetrograde?: boolean;
}

export interface DailyTransitAspect {
  transitPlanet: string;
  natalPlanet: string;
  aspectType: string;
  orbDegrees: number;
  isApplying?: boolean;
  exactDate?: string;
  natalHouse?: number;
  band?: "exact" | "live" | "background";
}

export interface DailyProfection {
  age: number;
  activatedHouse: number;
  activatedSign: string;
  timeLord: string;
  timeLordNatalSign?: string;
  timeLordNatalHouse?: number;
}

export interface DailyMoonPhase {
  phaseName: string;
  illuminationPercent: number;
  nextEventName: "New Moon" | "Full Moon";
  daysUntilNextEvent: number;
  moonSign: string;
  moonDegree: string;
}

export interface DailyHoroscopeInput {
  /** Local calendar date in YYYY-MM-DD form. */
  localDate: string;
  tropicalPlanets: DailyPlanet[];
  currentTransits: DailyPlanet[];
  transitAspects: DailyTransitAspect[];
  profection?: DailyProfection;
  moonPhase?: DailyMoonPhase;
}

export interface DailyHoroscopeResult {
  urgency: DailyUrgency;
  action: string;
  boundary: string;
  warning: string;
  positive: string;
}

const PERSONAL_POINTS = new Set([
  "ascendant",
  "rising",
  "midheaven",
  "mc",
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
]);

const TRANSIT_SPEED_WEIGHT: Record<string, number> = {
  moon: 5,
  sun: 4,
  mercury: 4,
  venus: 4,
  mars: 4,
  jupiter: 3,
  saturn: 3,
  uranus: 2,
  neptune: 2,
  pluto: 2,
};

const ASPECT_WEIGHT: Record<string, number> = {
  conjunction: 4,
  opposition: 4,
  square: 4,
  trine: 3,
  sextile: 2.5,
  quincunx: 2,
  semi_sextile: 1.5,
};

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function aspectScore(aspect: DailyTransitAspect): number {
  const transit = normalize(aspect.transitPlanet);
  const natal = normalize(aspect.natalPlanet);
  const type = normalize(aspect.aspectType);
  const orb = Number.isFinite(aspect.orbDegrees) ? aspect.orbDegrees : 10;

  const transitWeight = TRANSIT_SPEED_WEIGHT[transit] ?? 1;
  const natalWeight = PERSONAL_POINTS.has(natal) ? 4 : 2;
  const typeWeight = ASPECT_WEIGHT[type] ?? 1;
  const closenessWeight = Math.max(0, 4 - orb) * 2;
  const applyingWeight = aspect.isApplying ? 1.25 : 0;
  const exactWeight = aspect.band === "exact" ? 2 : aspect.band === "live" ? 1 : 0;

  return transitWeight + natalWeight + typeWeight + closenessWeight + applyingWeight + exactWeight;
}

/**
 * Keeps the prompt inexpensive while preserving a mix of pressure and support.
 * Six aspects is enough for synthesis without turning the daily into a reading.
 */
export function selectDailyAspects(
  aspects: DailyTransitAspect[],
  limit = 6
): DailyTransitAspect[] {
  return [...aspects]
    .filter(
      (aspect) =>
        aspect.transitPlanet &&
        aspect.natalPlanet &&
        aspect.aspectType &&
        Number.isFinite(aspect.orbDegrees)
    )
    .sort((a, b) => aspectScore(b) - aspectScore(a))
    .slice(0, limit);
}

function compactPlanet(planet: DailyPlanet): Record<string, unknown> {
  return {
    name: planet.name,
    sign: planet.sign,
    degree: planet.degree,
    ...(planet.house !== undefined ? { house: planet.house } : {}),
    ...(planet.isRetrograde !== undefined ? { retrograde: planet.isRetrograde } : {}),
  };
}

function relevantNatalPlanets(planets: DailyPlanet[]): DailyPlanet[] {
  const preferred = planets.filter((planet) => PERSONAL_POINTS.has(normalize(planet.name)));
  return preferred.length ? preferred : planets.slice(0, 7);
}

export function buildDailyHoroscopePrompt(input: DailyHoroscopeInput): string {
  const evidence = {
    date: input.localDate,
    natal: relevantNatalPlanets(input.tropicalPlanets).map(compactPlanet),
    currentPlanets: input.currentTransits.map(compactPlanet),
    strongestTransitAspects: selectDailyAspects(input.transitAspects),
    profection: input.profection ?? null,
    moonPhase: input.moonPhase ?? null,
  };

  return [
    "You are AstroPro Daily, a precise personal astrology advisor.",
    "This is a daily advisory, not a full reading. Decide what the user most needs to know or do today.",
    "Use only the supplied astrology. Do not invent events, biography, danger, certainty, or urgency.",
    "When several signals exist, synthesize them into one coherent message instead of listing transits.",
    "",
    "REQUIRED FOUR-BEAT INTERPRETATION",
    "1. ACTION — the clearest useful thing to do today.",
    "2. BOUNDARY — what not to accept, chase, overexplain, force, or give energy to.",
    "3. WARNING — the most relevant mistake, pressure, or consequence to watch for.",
    "4. POSITIVE — the real opening, advantage, relief, or momentum available today.",
    "",
    "URGENCY",
    'Use "urgent" only when the supplied aspects show an unusually exact, active, and consequential pressure.',
    'Use "important" for a meaningful day that calls for extra attention.',
    'Use "steady" for practical ordinary guidance and "supportive" when the strongest pattern is constructive.',
    "Never manufacture urgency. Direct does not mean frightening or dramatic.",
    "",
    "WRITING RULES",
    "Each field must be a concise clause, not a paragraph.",
    "Use plain, confident, protective language. Make the advice recognizable in real life.",
    "Avoid vague inspiration, fatalism, therapy language, and astrology lectures.",
    "Mention at most one astrological factor, and only when it makes the advice more useful.",
    "Do not repeat the same idea across fields.",
    "The four fields will be combined into three short sentences, so keep the total under 70 words.",
    "Write action, boundary, and positive as standalone clauses without trailing punctuation.",
    "Write warning as a lower-case clause that can naturally follow the boundary after a semicolon.",
    "",
    "ASTROLOGICAL EVIDENCE",
    JSON.stringify(evidence),
    "",
    "OUTPUT — VALID JSON ONLY",
    '{"urgency":"steady","action":"...","boundary":"...","warning":"...","positive":"..."}',
  ].join("\n");
}

function cleanClause(value: string): string {
  return value.trim().replace(/[.!?;,:]+$/g, "");
}

function sentence(value: string): string {
  const cleaned = cleanClause(value);
  if (!cleaned) return "";
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}.`;
}

/** Turns the four required beats into the 1–3 sentence text shown in the card. */
export function formatDailyHoroscope(result: DailyHoroscopeResult): string {
  const action = sentence(result.action);
  const boundary = cleanClause(result.boundary);
  const warning = cleanClause(result.warning);
  const caution = boundary && warning
    ? `${boundary.charAt(0).toUpperCase()}${boundary.slice(1)}; ${warning}.`
    : sentence(boundary || warning);
  const positive = sentence(result.positive);

  return [action, caution, positive].filter(Boolean).join(" ");
}

export function parseDailyHoroscopeResponse(raw: string): DailyHoroscopeResult {
  const parsed = JSON.parse(raw) as Partial<DailyHoroscopeResult>;
  const allowedUrgency: DailyUrgency[] = ["urgent", "important", "steady", "supportive"];

  if (
    !parsed.urgency ||
    !allowedUrgency.includes(parsed.urgency) ||
    !parsed.action?.trim() ||
    !parsed.boundary?.trim() ||
    !parsed.warning?.trim() ||
    !parsed.positive?.trim()
  ) {
    throw new Error("Daily horoscope response is missing a required field.");
  }

  return {
    urgency: parsed.urgency,
    action: cleanClause(parsed.action),
    boundary: cleanClause(parsed.boundary),
    warning: cleanClause(parsed.warning),
    positive: cleanClause(parsed.positive),
  };
}

/** One cached result per user/chart and local calendar day. */
export function dailyHoroscopeCacheKey(userId: string, localDate: string): string {
  return `astroproxl:daily-horoscope:${userId}:${localDate}`;
}
