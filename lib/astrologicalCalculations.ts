// ============================================================
// FILE: lib/astrologicalCalculations.ts
// ============================================================

// ── SIGN RULERS ──
export const SIGN_RULERS: Record<string, string> = {
  Aries: "Mars",
  Taurus: "Venus",
  Gemini: "Mercury",
  Cancer: "Moon",
  Leo: "Sun",
  Virgo: "Mercury",
  Libra: "Venus",
  Scorpio: "Pluto",
  Sagittarius: "Jupiter",
  Capricorn: "Saturn",
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

export const DETRIMENTS: Record<string, string> = {
  Sun: "Aquarius",
  Moon: "Capricorn",
  Mercury: "Sagittarius",
  Venus: "Scorpio",
  Mars: "Libra",
  Jupiter: "Gemini",
  Saturn: "Cancer",
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

// ── PLANET SPEEDS (degrees per day, approximate) ──
export const PLANET_SPEEDS: Record<string, number> = {
  Moon: 13.17,
  Mercury: 1.38,
  Venus: 1.20,
  Sun: 0.99,
  Mars: 0.52,
  Jupiter: 0.08,
  Saturn: 0.03,
  Uranus: 0.01,
  Neptune: 0.006,
  Pluto: 0.004,
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
// CALCULATION FUNCTIONS
// ============================================================

/**
 * 1. HOUSE RULERS
 * Which planet rules each house based on the sign on the cusp
 */
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
        rulers.push({
          house,
          sign,
          ruler,
        });
      }
    }
  }

  return rulers;
}

/**
 * 2. MUTUAL RECEPTION
 * When two planets are in each other's signs
 */
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

/**
 * 3. ESSENTIAL DIGNITIES
 * How planets express based on their sign placement
 */
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
  } else if (DETRIMENTS[planet] === sign) {
    dignity = "Detriment";
    strength = 2;
  }

  return {
    planet,
    dignity,
    sign,
    strength,
  };
}

/**
 * 4. SYNODIC CYCLES (Planetary Returns)
 * When each planet returns to its natal position
 */
export function calculateSynodicCycles(
  planets: Array<{ name: string; sign: string; degree: string }>,
  currentDate: Date
): SynodicCycle[] {
  const cycles: SynodicCycle[] = [];

  for (const p of planets) {
    if (["Uranus", "Neptune", "Pluto"].includes(p.name)) continue;

    const speed = PLANET_SPEEDS[p.name] || 0.5;
    const daysToReturn = Math.round(360 / speed);

    const returnDate = new Date(currentDate);
    returnDate.setDate(returnDate.getDate() + daysToReturn);

    cycles.push({
      planet: p.name,
      returnDate: returnDate.toISOString().split("T")[0],
      daysUntilReturn: daysToReturn,
    });
  }

  return cycles;
}

/**
 * 5. MIDPOINTS
 * Sensitive points halfway between two planets
 */
export function calculateMidpoints(
  planets: Array<{ name: string; sign: string; degree: string }>,
  houseCusps: Record<number, string>
): Midpoint[] {
  const midpoints: Midpoint[] = [];

  function getAbsoluteDegree(sign: string, degree: string): number {
    const signStart = SIGN_START_DEGREES[sign] || 0;
    return signStart + parseFloat(degree);
  }

  function getSignAndDegree(absDegree: number): { sign: string; degree: number } {
    const signIndex = Math.floor(absDegree / 30) % 12;
    const signs = Object.keys(SIGN_START_DEGREES);
    return {
      sign: signs[signIndex] || "Aries",
      degree: absDegree % 30,
    };
  }

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
      diff = 360 - diff;
    }

    const result = getSignAndDegree(mid);

    // Find the house of the midpoint
    let house = 1;
    for (let h = 1; h <= 12; h++) {
      const houseSign = houseCusps[h];
      if (!houseSign) continue;
      const houseStart = SIGN_START_DEGREES[houseSign] || 0;
      const nextHouseSign = houseCusps[(h % 12) + 1];
      const nextStart = nextHouseSign ? SIGN_START_DEGREES[nextHouseSign] || 360 : 360;

      if (mid >= houseStart && mid < nextStart) {
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
 * 6. LUNAR RETURN
 * When the Moon returns to its natal position
 */
export function calculateLunarReturn(
  moonSign: string,
  moonDegree: string,
  currentDate: Date
): LunarReturn {
  const daysUntil = Math.round(27.3);
  const returnDate = new Date(currentDate);
  returnDate.setDate(returnDate.getDate() + daysUntil);

  return {
    date: returnDate.toISOString().split("T")[0],
    moonSign,
    moonDegree,
    daysUntil,
  };
}

/**
 * 7. ECLIPSE ACTIVATION
 * When an eclipse activates a natal planet
 */
export function calculateEclipseActivation(
  planets: Array<{ name: string; sign: string; degree: string }>,
  eclipses: Array<{ date: string; type: "Solar" | "Lunar"; degree: number; sign: string }>
): EclipseActivation[] {
  const activations: EclipseActivation[] = [];

  function getAbsoluteDegree(sign: string, degree: string): number {
    const signStart = SIGN_START_DEGREES[sign] || 0;
    return signStart + parseFloat(degree);
  }

  for (const eclipse of eclipses) {
    for (const p of planets) {
      if (["Uranus", "Neptune", "Pluto"].includes(p.name)) continue;

      const planetAbs = getAbsoluteDegree(p.sign, p.degree);
      const eclipseAbs = eclipse.degree;

      let diff = Math.abs(planetAbs - eclipseAbs);
      if (diff > 180) diff = 360 - diff;

      if (diff < 3) {
        activations.push({
          eclipseDate: eclipse.date,
          eclipseType: eclipse.type,
          degree: eclipse.degree,
          sign: eclipse.sign,
          activatedPlanet: p.name,
          orb: diff,
          durationMonths: eclipse.type === "Solar" ? 12 : 6,
        });
      }
    }
  }

  return activations;
}

/**
 * 8. TRANSIT TO ANGLES
 * When a transit hits the Ascendant, Midheaven, Descendant, or IC
 */
export function calculateTransitsToAngles(
  transits: Array<{ name: string; sign: string; degree: string; isRetrograde: boolean }>,
  angles: Array<{ name: "Ascendant" | "Midheaven" | "Descendant" | "Imum Coeli"; sign: string; degree: string }>
): TransitToAngle[] {
  const results: TransitToAngle[] = [];

  function getAbsoluteDegree(sign: string, degree: string): number {
    const signStart = SIGN_START_DEGREES[sign] || 0;
    return signStart + parseFloat(degree);
  }

  for (const transit of transits) {
    for (const angle of angles) {
      const transAbs = getAbsoluteDegree(transit.sign, transit.degree);
      const angleAbs = getAbsoluteDegree(angle.sign, angle.degree);

      let diff = Math.abs(transAbs - angleAbs);
      if (diff > 180) diff = 360 - diff;

      const aspects = [0, 180, 90];
      for (const aspect of aspects) {
        const orb = Math.abs(diff - aspect);
        if (orb < 3) {
          results.push({
            angle: angle.name,
            angleDegree: angleAbs,
            angleSign: angle.sign,
            transitPlanet: transit.name,
            transitDegree: transAbs,
            transitSign: transit.sign,
            aspectType: aspect === 0 ? "Conjunction" : aspect === 180 ? "Opposition" : "Square",
            orb,
            isApplying: !transit.isRetrograde,
          });
        }
      }
    }
  }

  return results;
}

/**
 * 9. DISPOSITOR TREE (Chain of Command)
 * The chain of rulership from each planet to the final dispositor
 */
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

  // Second pass: resolve final dispositor
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