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
    planets: Array<{
      name: string;
      sign: string;
      degree: string;
      house?: string;
    }>;
  };

  transits: Array<{
    name: string;
    sign: string;
    degree: string;
    longitude?: number;
    isRetrograde: boolean;
  }>;

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

  // Natal interpretation
  placidusHouseCusps: Record<number, string>;

  // Predictive house placement
  wholeSignHouseCusps: Record<number, string>;
}

export interface AdvancedCalculations {
  houseRulers: HouseRuler[];
  mutualReceptions: MutualReception[];
  essentialDignities: EssentialDignity[];
  synodicCycles: SynodicCycle[];
  midpoints: Midpoint[];
  lunarReturn: LunarReturn | undefined;
  eclipseActivations: EclipseActivation[];

  /**
   * NOTE:
   * These are raw angle contacts only.
   * Exact dates must be attached by the ephemeris/date solver
   * before they are used as prediction anchors.
   */
  transitsToAngles: TransitToAngle[];

  dispositorTree: DispositorResult[];
}

/**
 * Generate secondary interpretive calculations.
 *
 * Exact astronomical timing should be calculated upstream
 * in chart-calculate, not inferred here.
 */
export function generateAdvancedCalculations(
  chartData: ChartData
): AdvancedCalculations {
  const currentDate = new Date();

  // 1. HOUSE RULERS
  // Natal interpretation → Placidus
  const houseRulers = calculateHouseRulers(
    chartData.tropical.planets,
    chartData.placidusHouseCusps
  );

  // 2. MUTUAL RECEPTION
  const mutualReceptions =
    calculateMutualReception(
      chartData.tropical.planets
    );

  // 3. ESSENTIAL DIGNITIES
  const essentialDignities =
    chartData.tropical.planets.map((p) =>
      calculateEssentialDignity(
        p.name,
        p.sign
      )
    );

  // 4. SYNODIC CYCLES
  // Context only until independently exact-timed.
  const synodicCycles =
    calculateSynodicCycles(
      chartData.tropical.planets,
      currentDate
    );

  // 5. MIDPOINTS
  // Predictive placement → Whole Sign
  const midpoints =
    calculateMidpoints(
      chartData.tropical.planets,
      chartData.wholeSignHouseCusps
    );

  // 6. LUNAR RETURN
  // Confirmation layer, not a standalone date anchor.
  const lunarReturn =
    calculateLunarReturn(
      chartData.moonSign,
      chartData.moonDegree,
      currentDate
    );

  // 7. ECLIPSE ACTIVATIONS
  const knownEclipses =
    getKnownEclipses(currentDate);

  const eclipseActivations =
    calculateEclipseActivation(
      chartData.tropical.planets,
      knownEclipses
    );

  // 8. TRANSITS TO ANGLES
  const angles = [
    {
      name: "Ascendant" as const,
      sign: chartData.ascendantSign,
      degree: chartData.ascendantDegree,
    },
    {
      name: "Midheaven" as const,
      sign: chartData.midheavenSign,
      degree: chartData.midheavenDegree,
    },
    {
      name: "Descendant" as const,
      sign: chartData.descendantSign,
      degree: chartData.descendantDegree,
    },
    {
      name: "Imum Coeli" as const,
      sign: chartData.icSign,
      degree: chartData.icDegree,
    },
  ];

  const transitsToAngles =
    calculateTransitsToAngles(
      chartData.transits,
      angles
    );

  // 9. DISPOSITOR TREE
  const dispositorTree =
    calculateDispositorTree(
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