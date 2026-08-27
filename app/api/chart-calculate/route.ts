// ============================================================
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
  return { planets, ascLongitude, mcLongitude, houseCusps, wholeSignCusps };
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
  const { planets, ascLongitude, mcLongitude, houseCusps } = raw;
  const ascDeg = longitudeToSignDegree(ascLongitude);
  const mcDeg = longitudeToSignDegree(mcLongitude);
  const icDeg = longitudeToSignDegree((mcLongitude + 180) % 360);
  const dcDeg = longitudeToSignDegree((ascLongitude + 180) % 360);

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
      const transitMoon = transitRaw.planets.find((p) => p.name === "Moon");
      if (transitMoon) {
        const { sign: moonSign, degree: moonDegree } = longitudeToSignDegree(transitMoon.longitude);
        lunarReturn = calculateLunarReturn(moonSign, moonDegree, now);
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
}