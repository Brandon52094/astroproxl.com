// ============================================================
// FILE: lib/readingCalculations.ts
// ============================================================

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

export interface ChartData {
  tropical: {
    planets: Array<{ name: string; sign: string; degree: string; house?: string }>;
  };
  transits: Array<{ name: string; sign: string; degree: string; isRetrograde: boolean }>;
  ascendantSign: string;
  ascendantDegree: string;
  midheavenSign: string;
  midheavenDegree: string;
  descendantSign: string;
  descendantDegree: string;
  icSign: string;
  icDegree: string;
  moonSign: string;
  moonDegree: string;
  houseCusps: Record<number, string>;
}

export interface AdvancedCalculations {
  houseRulers: HouseRuler[];
  mutualReceptions: MutualReception[];
  essentialDignities: EssentialDignity[];
  synodicCycles: SynodicCycle[];
  midpoints: Midpoint[];
  lunarReturn: LunarReturn | undefined;
  eclipseActivations: EclipseActivation[];
  transitsToAngles: TransitToAngle[];
  dispositorTree: DispositorResult[];
}

/**
 * Generate all advanced astrological calculations
 * This should run after the chart is built, before the reading is generated
 */
export function generateAdvancedCalculations(chartData: ChartData): AdvancedCalculations {
  const currentDate = new Date();

  // 1. HOUSE RULERS (Most Important)
  const houseRulers = calculateHouseRulers(
    chartData.tropical.planets,
    chartData.houseCusps
  );

  // 2. MUTUAL RECEPTION
  const mutualReceptions = calculateMutualReception(
    chartData.tropical.planets
  );

  // 3. ESSENTIAL DIGNITIES
  const essentialDignities = chartData.tropical.planets.map((p) =>
    calculateEssentialDignity(p.name, p.sign)
  );

  // 4. SYNODIC CYCLES (Planetary Returns)
  const synodicCycles = calculateSynodicCycles(
    chartData.tropical.planets,
    currentDate
  );

  // 5. MIDPOINTS
  const midpoints = calculateMidpoints(
    chartData.tropical.planets,
    chartData.houseCusps
  );

  // 6. LUNAR RETURN
  const lunarReturn = calculateLunarReturn(
    chartData.moonSign,
    chartData.moonDegree,
    currentDate
  );

  // 7. ECLIPSE ACTIVATION
  const knownEclipses = getKnownEclipses(currentDate);
  const eclipseActivations = calculateEclipseActivation(
    chartData.tropical.planets,
    knownEclipses
  );

  // 8. TRANSIT TO ANGLES
  const angles = [
    { name: "Ascendant" as const, sign: chartData.ascendantSign, degree: chartData.ascendantDegree },
    { name: "Midheaven" as const, sign: chartData.midheavenSign, degree: chartData.midheavenDegree },
    { name: "Descendant" as const, sign: chartData.descendantSign, degree: chartData.descendantDegree },
    { name: "Imum Coeli" as const, sign: chartData.icSign, degree: chartData.icDegree },
  ];
  const transitsToAngles = calculateTransitsToAngles(
    chartData.transits,
    angles
  );

  // 9. DISPOSITOR TREE
  const dispositorTree = calculateDispositorTree(
    chartData.tropical.planets
  );

  return {
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
}