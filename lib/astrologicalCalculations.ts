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
 * DISABLED — A true Lunar Return requires solving for the exact future time
 * when the transiting Moon returns to the natal Moon longitude.
 *
 * Do not approximate this as currentDate + 27 days.
 * Re-enable only after an ephemeris-based return solver is implemented.
 */
export function calculateLunarReturn(
  _moonSign: string,
  _moonDegree: string,
  _currentDate: Date
): LunarReturn | undefined {
  return undefined;
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
}