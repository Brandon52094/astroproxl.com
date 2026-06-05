import { NextRequest, NextResponse } from "next/server";
import type { NormalizedChart } from "@/lib/schema/charts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChartCalculateRequest {
  birthDate: string;   // YYYY-MM-DD
  birthTime: string;   // HH:MM (24h)
  birthPlace: string;
  lat: number;
  lng: number;
  timezone: string;
}

export interface TransitPlanet {
  name: string;
  sign: string;
  degree: string;
  isRetrograde: boolean;
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

export interface ProgressedPlanet {
  name: string;
  sign: string;
  degree: string;
  isRetrograde: boolean;
}

export interface SolarArcPlanet {
  name: string;
  sign: string;
  degree: string;
}

export interface UpcomingTriggerData {
  date: string;
  transitPlanet: string;
  natalPlanet: string;
  aspect: string;
}

export interface ChartCalculateResponse {
  success: boolean;
  tropical: NormalizedChart;
  sidereal: NormalizedChart;
  transits: TransitPlanet[];
  profection: ProfectionData;
  progressions: ProgressedPlanet[];
  solarArcs: SolarArcPlanet[];
  upcomingTrigger?: UpcomingTriggerData;
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

const SIGN_RULERS: Record<string, string> = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon",
  Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Mars",
  Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  const timeMatch = birthTime.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!timeMatch) throw new Error(`Unrecognized birthTime format: ${birthTime}`);
  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const meridiem = timeMatch[3]?.toLowerCase();
  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return [hour, minute];
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
    const localDate = new Date(`${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00`);
    const utcStr = localDate.toLocaleString("en-US", { timeZone: "UTC", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    const tzStr  = localDate.toLocaleString("en-US", { timeZone: timezone,  hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
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

function calculatePlanets(
  jd: number, lat: number, lng: number, houseSystem: string, ayanamsa?: number
): {
  planets: Array<{ name: string; longitude: number; isRetrograde: boolean }>;
  ascLongitude: number;
  mcLongitude: number;
  houseCusps: number[];
} {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swisseph = require("swisseph");
  const PLANETS = [
    { id: swisseph.SE_SUN,       name: "Sun" },
    { id: swisseph.SE_MOON,      name: "Moon" },
    { id: swisseph.SE_MERCURY,   name: "Mercury" },
    { id: swisseph.SE_VENUS,     name: "Venus" },
    { id: swisseph.SE_MARS,      name: "Mars" },
    { id: swisseph.SE_JUPITER,   name: "Jupiter" },
    { id: swisseph.SE_SATURN,    name: "Saturn" },
    { id: swisseph.SE_URANUS,    name: "Uranus" },
    { id: swisseph.SE_NEPTUNE,   name: "Neptune" },
    { id: swisseph.SE_PLUTO,     name: "Pluto" },
    { id: swisseph.SE_TRUE_NODE, name: "North Node" },
  ];
  const iflag = ayanamsa !== undefined ? (4 | 65536) : 4;
  if (ayanamsa !== undefined) swisseph.swe_set_sid_mode(ayanamsa, 0, 0);
  const houses = swisseph.swe_houses(jd, lat, lng, "W");
  const ascLongitude = houses.ascendant;
  const mcLongitude = houses.mc;
  const houseCusps = houses.house;
  const planets = PLANETS.map(({ id, name }) => {
    const result = swisseph.swe_calc_ut(jd, id, iflag);
    return { name, longitude: result.longitude, isRetrograde: result.longitudeSpeed < 0 };
  });
  return { planets, ascLongitude, mcLongitude, houseCusps };
}

function getWholeSignHouse(planetLongitude: number, ascLongitude: number): number {
  const ascSign = Math.floor(ascLongitude / 30);
  const planetSign = Math.floor(planetLongitude / 30);
  return ((planetSign - ascSign + 12) % 12) + 1;
}

function calculateAspects(planets: Array<{ name: string; longitude: number }>): NormalizedChart["aspects"] {
  const ASPECT_TYPES: Array<{ type: "conjunction"|"opposition"|"square"|"trine"|"sextile"; angle: number; orb: number }> = [
    { type: "conjunction", angle: 0,   orb: 8 },
    { type: "opposition",  angle: 180, orb: 8 },
    { type: "square",      angle: 90,  orb: 7 },
    { type: "trine",       angle: 120, orb: 7 },
    { type: "sextile",     angle: 60,  orb: 5 },
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
  const { planets, ascLongitude, mcLongitude } = raw;
  const ascDeg = longitudeToSignDegree(ascLongitude);
  const mcDeg  = longitudeToSignDegree(mcLongitude);
  const icDeg  = longitudeToSignDegree((mcLongitude + 180) % 360);
  const dcDeg  = longitudeToSignDegree((ascLongitude + 180) % 360);
  const planetPlacements = planets.map(({ name, longitude, isRetrograde }) => {
    const { sign, degree } = longitudeToSignDegree(longitude);
    const house = getWholeSignHouse(longitude, ascLongitude);
    return { name, sign, degree: isRetrograde ? `${degree} Rx` : degree, house: String(house) };
  });
  planetPlacements.push({ name: "Ascendant", sign: ascDeg.sign, degree: ascDeg.degree, house: "1" });
  planetPlacements.push({ name: "Midheaven", sign: mcDeg.sign,  degree: mcDeg.degree,  house: "10" });
  const aspects = calculateAspects(planets.map(({ name, longitude }) => ({ name, longitude })));
  return { birthDate, birthTime, birthPlace, timezone, coordinates: { lat, lng }, planets: planetPlacements, angles: { asc: ascDeg, mc: mcDeg, ic: icDeg, dc: dcDeg }, aspects };
}

function calculateProfection(
  birthDate: string, ascSign: string,
  natalPlanets: Array<{ name: string; sign: string; house: number }>
): ProfectionData {
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
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

// ─── Secondary Progressions ───────────────────────────────────────────────────
// Uses the "day-for-a-year" method: 1 day after birth = 1 year of life.
// JD for progressions = JD birth + age in years (approximated as days).

function calculateProgressions(
  jdBirth: number, birthDate: string, lat: number, lng: number
): ProgressedPlanet[] {
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - birthYear;
  if (now.getMonth() + 1 < birthMonth || (now.getMonth() + 1 === birthMonth && now.getDate() < birthDay)) age--;

  // Fractional age: adds days elapsed since last birthday for sub-year precision
  const lastBirthday = new Date(now.getFullYear() - (now < new Date(now.getFullYear(), birthMonth - 1, birthDay) ? 0 : 0), birthMonth - 1, birthDay);
  const daysSinceLastBirthday = Math.floor((now.getTime() - lastBirthday.getTime()) / 86400000);
  const fractionalAge = age + daysSinceLastBirthday / 365.25;

  // Progressed JD = birth JD + age in days (1 day per year)
  const jdProgressed = jdBirth + fractionalAge;

  const raw = calculatePlanets(jdProgressed, lat, lng, "W");

  const PLANET_NAMES = ["Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn","Uranus","Neptune","Pluto","North Node"];

  return raw.planets
    .filter(p => PLANET_NAMES.includes(p.name))
    .map(({ name, longitude, isRetrograde }) => {
      const { sign, degree } = longitudeToSignDegree(longitude);
      return { name, sign, degree: isRetrograde ? `${degree} Rx` : degree, isRetrograde };
    });
}

// ─── Solar Arc Directions ─────────────────────────────────────────────────────
// Solar arc = distance the progressed Sun has traveled from natal Sun position.
// Every natal planet is advanced by this same arc.

function calculateSolarArcs(
  jdBirth: number, birthDate: string, lat: number, lng: number
): SolarArcPlanet[] {
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - birthYear;
  if (now.getMonth() + 1 < birthMonth || (now.getMonth() + 1 === birthMonth && now.getDate() < birthDay)) age--;

  const lastBirthday = new Date(now.getFullYear(), birthMonth - 1, birthDay);
  const daysSinceLastBirthday = Math.floor((now.getTime() - lastBirthday.getTime()) / 86400000);
  const fractionalAge = age + daysSinceLastBirthday / 365.25;
  const jdProgressed = jdBirth + fractionalAge;

  // Get natal Sun longitude
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swisseph = require("swisseph");
  const natalSunResult = swisseph.swe_calc_ut(jdBirth, swisseph.SE_SUN, 4);
  const natalSunLongitude = natalSunResult.longitude;

  // Get progressed Sun longitude
  const progressedSunResult = swisseph.swe_calc_ut(jdProgressed, swisseph.SE_SUN, 4);
  const progressedSunLongitude = progressedSunResult.longitude;

  // Solar arc = angular distance traveled by the Sun
  let solarArc = progressedSunLongitude - natalSunLongitude;
  if (solarArc < 0) solarArc += 360;

  // Get all natal planet longitudes and advance each by solar arc
  const natalRaw = calculatePlanets(jdBirth, lat, lng, "W");

  const PLANET_NAMES = ["Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn","Uranus","Neptune","Pluto","North Node"];

  const solarArcPlanets: SolarArcPlanet[] = natalRaw.planets
    .filter(p => PLANET_NAMES.includes(p.name))
    .map(({ name, longitude }) => {
      const directedLongitude = (longitude + solarArc) % 360;
      const { sign, degree } = longitudeToSignDegree(directedLongitude);
      return { name: `SA ${name}`, sign, degree };
    });

  // Also direct the Ascendant and MC
  const directedAsc = (natalRaw.ascLongitude + solarArc) % 360;
  const directedMC  = (natalRaw.mcLongitude  + solarArc) % 360;
  const ascDeg = longitudeToSignDegree(directedAsc);
  const mcDeg  = longitudeToSignDegree(directedMC);
  solarArcPlanets.push({ name: "SA Ascendant", sign: ascDeg.sign, degree: ascDeg.degree });
  solarArcPlanets.push({ name: "SA Midheaven", sign: mcDeg.sign,  degree: mcDeg.degree });

  return solarArcPlanets;
}

// ─── Upcoming Trigger Sweep ───────────────────────────────────────────────────

function calculateUpcomingTrigger(
  natalRaw: ReturnType<typeof calculatePlanets>, lat: number, lng: number
): UpcomingTriggerData | undefined {
  const ASPECT_CONFIGS: Array<{ type: "conjunction"|"opposition"|"square"|"trine"|"sextile"; angle: number }> = [
    { type: "conjunction", angle: 0 },
    { type: "opposition",  angle: 180 },
    { type: "square",      angle: 90 },
    { type: "trine",       angle: 120 },
    { type: "sextile",     angle: 60 },
  ];
  const natalTargets = natalRaw.planets.map(p => ({ name: p.name, longitude: p.longitude }));
  natalTargets.push({ name: "Ascendant", longitude: natalRaw.ascLongitude });
  natalTargets.push({ name: "Midheaven", longitude: natalRaw.mcLongitude });
  const today = new Date();
  for (let dayOffset = 0; dayOffset <= 30; dayOffset++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + dayOffset);
    const checkDateStr = checkDate.toISOString().slice(0, 10);
    const jdCheck = toJulianDay(checkDateStr, "12:00", 0);
    const transitRaw = calculatePlanets(jdCheck, lat, lng, "W");
    for (const tPlanet of transitRaw.planets) {
      if (tPlanet.name === "Moon") continue;
      for (const nTarget of natalTargets) {
        if (tPlanet.name === nTarget.name) continue;
        let diff = Math.abs(tPlanet.longitude - nTarget.longitude);
        if (diff > 180) diff = 360 - diff;
        for (const aspect of ASPECT_CONFIGS) {
          if (Math.abs(diff - aspect.angle) <= 1.0) {
            return {
              date: checkDate.toLocaleDateString("en-US", { month: "long", day: "numeric" }),
              transitPlanet: tPlanet.name,
              natalPlanet: nTarget.name,
              aspect: aspect.type,
            };
          }
        }
      }
    }
  }
  return undefined;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swisseph = require("swisseph");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("path");
  swisseph.swe_set_ephe_path(path.join(process.cwd(), "node_modules/swisseph/ephe"));

  try {
    const body = await req.json() as ChartCalculateRequest;
    const { birthDate, birthTime, birthPlace, lat, lng, timezone } = body;

    if (!birthDate || !birthTime || !lat || !lng) {
      return NextResponse.json({ success: false, error: "birthDate, birthTime, lat, and lng are required." }, { status: 400 });
    }

    const utcOffset = getUtcOffset(birthDate, birthTime, timezone);
    const jdBirth = toJulianDay(birthDate, birthTime, utcOffset);

    const now = new Date();
    const jdNow = toJulianDay(
      now.toISOString().slice(0, 10),
      `${now.getUTCHours()}:${String(now.getUTCMinutes()).padStart(2, "0")}`,
      0
    );

    // Natal charts
    const tropicalRaw = calculatePlanets(jdBirth, lat, lng, "W");
    const tropicalChart = buildNormalizedChart(tropicalRaw, birthDate, birthTime, birthPlace, lat, lng, timezone);

    const siderealRaw = calculatePlanets(jdBirth, lat, lng, "W", swisseph.SE_SIDM_LAHIRI);
    const siderealChart = buildNormalizedChart(siderealRaw, birthDate, birthTime, birthPlace, lat, lng, timezone);

    // Current transits
    const transitRaw = calculatePlanets(jdNow, lat, lng, "W");
    const transits: TransitPlanet[] = transitRaw.planets.map(({ name, longitude, isRetrograde }) => {
      const { sign, degree } = longitudeToSignDegree(longitude);
      return { name, sign, degree, isRetrograde };
    });

    // Profection
    const ascSign = tropicalChart.angles.asc?.sign ?? "Aries";
    const natalPlanetsForProfection = tropicalRaw.planets.map(({ name, longitude }) => {
      const { sign } = longitudeToSignDegree(longitude);
      return { name, sign, house: getWholeSignHouse(longitude, tropicalRaw.ascLongitude) };
    });
    const profection = calculateProfection(birthDate, ascSign, natalPlanetsForProfection);

    // Secondary progressions (day-for-a-year)
    const progressions = calculateProgressions(jdBirth, birthDate, lat, lng);

    // Solar arc directions
    const solarArcs = calculateSolarArcs(jdBirth, birthDate, lat, lng);

    // Upcoming exact aspect trigger
    let upcomingTrigger: UpcomingTriggerData | undefined;
    try {
      upcomingTrigger = calculateUpcomingTrigger(tropicalRaw, lat, lng);
    } catch (e) {
      console.warn("[chart-calculate] Upcoming trigger sweep failed:", e);
    }

    const response: ChartCalculateResponse = {
      success: true,
      tropical: tropicalChart,
      sidereal: siderealChart,
      transits,
      profection,
      progressions,
      solarArcs,
      upcomingTrigger,
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