import { NextRequest, NextResponse } from "next/server";
import type { NormalizedChart } from "@/lib/schema/charts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChartCalculateRequest {
  birthDate: string;   // YYYY-MM-DD
  birthTime: string;   // HH:MM (24h)
  birthPlace: string;  // City, State/Country (display only)
  lat: number;
  lng: number;
  timezone: string;    // IANA timezone e.g. "America/New_York"
}

export interface TransitPlanet {
  name: string;
  sign: string;
  degree: string;
  isRetrograde: boolean;
}

export interface ProfectionData {
  age: number;
  profectionYear: number;        // 1–12
  activatedHouse: number;        // 1–12
  activatedSign: string;
  timeLord: string;              // Planet ruling the activated sign
  timeLordNatalSign: string;     // Where the Time Lord sits in natal chart
  timeLordNatalHouse: number;
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
  upcomingTrigger?: UpcomingTriggerData;
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

const SIGN_RULERS: Record<string, string> = {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDateParts(birthDate: string): [number, number, number] {
  if (birthDate.includes("-")) {
    const [y, m, d] = birthDate.split("-").map(Number);
    return [y, m, d];
  } else if (birthDate.includes("/")) {
    const parts = birthDate.split("/").map(Number);
    if (parts[0] > 31) return [parts[0], parts[1], parts[2]]; // YYYY/MM/DD
    return [parts[2], parts[0], parts[1]]; // MM/DD/YYYY
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
  let utcDay = day;
  let utcMonth = month;
  let utcYear = year;

  if (utcHour >= 24) {
    utcHour -= 24;
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() + 1);
    utcYear = d.getUTCFullYear();
    utcMonth = d.getUTCMonth() + 1;
    utcDay = d.getUTCDate();
  } else if (utcHour < 0) {
    utcHour += 24;
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() - 1);
    utcYear = d.getUTCFullYear();
    utcMonth = d.getUTCMonth() + 1;
    utcDay = d.getUTCDate();
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
  } catch {
    return 0;
  }
}

function longitudeToSignDegree(longitude: number): { sign: string; degree: string } {
  const signIndex = Math.floor(longitude / 30);
  const degreeInSign = longitude % 30;
  const degrees = Math.floor(degreeInSign);
  const minutes = Math.floor((degreeInSign - degrees) * 60);
  return {
    sign: SIGNS[signIndex],
    degree: `${degrees}°${String(minutes).padStart(2, "0")}'`,
  };
}

function calculatePlanets(
  jd: number,
  lat: number,
  lng: number,
  houseSystem: string,
  ayanamsa?: number
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

  if (ayanamsa !== undefined) {
    swisseph.swe_set_sid_mode(ayanamsa, 0, 0);
  }

  const houses = swisseph.swe_houses(jd, lat, lng, "W");
  const ascLongitude = houses.ascendant;
  const mcLongitude = houses.mc;
  const houseCusps = houses.house;

  const planets = PLANETS.map(({ id, name }) => {
    const result = swisseph.swe_calc_ut(jd, id, iflag);
    const longitude = result.longitude;
    const isRetrograde = result.longitudeSpeed < 0;
    return { name, longitude, isRetrograde };
  });

  return { planets, ascLongitude, mcLongitude, houseCusps };
}

function getWholeSignHouse(planetLongitude: number, ascLongitude: number): number {
  const ascSign = Math.floor(ascLongitude / 30);
  const planetSign = Math.floor(planetLongitude / 30);
  return ((planetSign - ascSign + 12) % 12) + 1;
}

function calculateAspects(
  planets: Array<{ name: string; longitude: number }>
): NormalizedChart["aspects"] {
  const ASPECT_TYPES: Array<{
    type: "conjunction" | "opposition" | "square" | "trine" | "sextile";
    angle: number;
    orb: number;
  }> = [
    { type: "conjunction", angle: 0,   orb: 8 },
    { type: "opposition",  angle: 180, orb: 8 },
    { type: "square",      angle: 90,  orb: 7 },
    { type: "trine",       angle: 120, orb: 7 },
    { type: "sextile",     angle: 60,  orb: 5 },
  ];

  const aspects: NormalizedChart["aspects"] = [];

  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const a = planets[i];
      const b = planets[j];
      let diff = Math.abs(a.longitude - b.longitude);
      if (diff > 180) diff = 360 - diff;

      for (const { type, angle, orb } of ASPECT_TYPES) {
        const orbDegrees = Math.abs(diff - angle);
        if (orbDegrees <= orb) {
          aspects.push({
            type,
            planetA: a.name,
            planetB: b.name,
            orbDegrees: Math.round(orbDegrees * 10) / 10,
          });
          break;
        }
      }
    }
  }

  return aspects;
}

function buildNormalizedChart(
  raw: ReturnType<typeof calculatePlanets>,
  birthDate: string,
  birthTime: string,
  birthPlace: string,
  lat: number,
  lng: number,
  timezone: string
): NormalizedChart {
  const { planets, ascLongitude, mcLongitude } = raw;

  const ascDeg = longitudeToSignDegree(ascLongitude);
  const mcDeg = longitudeToSignDegree(mcLongitude);
  const icLongitude = (mcLongitude + 180) % 360;
  const dcLongitude = (ascLongitude + 180) % 360;
  const icDeg = longitudeToSignDegree(icLongitude);
  const dcDeg = longitudeToSignDegree(dcLongitude);

  const planetPlacements = planets.map(({ name, longitude, isRetrograde }) => {
    const { sign, degree } = longitudeToSignDegree(longitude);
    const house = getWholeSignHouse(longitude, ascLongitude);
    return {
      name,
      sign,
      degree: isRetrograde ? `${degree} Rx` : degree,
      house: String(house),
    };
  });

  planetPlacements.push({ name: "Ascendant", sign: ascDeg.sign, degree: ascDeg.degree, house: "1" });
  planetPlacements.push({ name: "Midheaven", sign: mcDeg.sign, degree: mcDeg.degree, house: "10" });

  const aspects = calculateAspects(
    planets.map(({ name, longitude }) => ({ name, longitude }))
  );

  return {
    birthDate,
    birthTime,
    birthPlace,
    timezone,
    coordinates: { lat, lng },
    planets: planetPlacements,
    angles: {
      asc: ascDeg,
      mc: mcDeg,
      ic: icDeg,
      dc: dcDeg,
    },
    aspects,
  };
}

function calculateProfection(
  birthDate: string,
  ascSign: string,
  natalPlanets: Array<{ name: string; sign: string; house: number }>
): ProfectionData {
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - birthYear;
  if (
    now.getMonth() + 1 < birthMonth ||
    (now.getMonth() + 1 === birthMonth && now.getDate() < birthDay)
  ) {
    age--;
  }

  const profectionYear = (age % 12) + 1;
  const activatedHouse = profectionYear;
  const ascSignIndex = SIGNS.indexOf(ascSign);
  const activatedSignIndex = (ascSignIndex + activatedHouse - 1) % 12;
  const activatedSign = SIGNS[activatedSignIndex];
  const timeLord = SIGN_RULERS[activatedSign];

  const timeLordNatal = natalPlanets.find((p) => p.name === timeLord);

  return {
    age,
    profectionYear,
    activatedHouse,
    activatedSign,
    timeLord,
    timeLordNatalSign: timeLordNatal?.sign ?? "",
    timeLordNatalHouse: timeLordNatal?.house ?? 0,
  };
}

// ─── Ephemeris Sweeper Engine for Orb Integration ─────────────────────────────

/**
 * Sweeps a 14-30 day chronological time window forward from today.
 * Looks for the next major aspect intersection with an orb under 1.0 degree.
 */
function calculateUpcomingTrigger(
  natalRaw: ReturnType<typeof calculatePlanets>,
  lat: number,
  lng: number
): UpcomingTriggerData | undefined {
  const ASPECT_CONFIGS: Array<{ type: "conjunction" | "opposition" | "square" | "trine" | "sextile"; angle: number }> = [
    { type: "conjunction", angle: 0 },
    { type: "opposition",  angle: 180 },
    { type: "square",      angle: 90 },
    { type: "trine",       angle: 120 },
    { type: "sextile",     angle: 60 },
  ];

  // Map out absolute targets including Angles
  const natalTargets = natalRaw.planets.map(p => ({ name: p.name, longitude: p.longitude }));
  natalTargets.push({ name: "Ascendant", longitude: natalRaw.ascLongitude });
  natalTargets.push({ name: "Midheaven", longitude: natalRaw.mcLongitude });

  const today = new Date();

  // Sweep forward across a 30-day projection matrix
  for (let dayOffset = 0; dayOffset <= 30; dayOffset++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + dayOffset);
    
    const checkDateStr = checkDate.toISOString().slice(0, 10);
    const jdCheck = toJulianDay(checkDateStr, "12:00", 0); // Check mid-day UTC

    const transitRaw = calculatePlanets(jdCheck, lat, lng, "W");

    // Evaluate transit connections against structural targets
    for (const tPlanet of transitRaw.planets) {
      // Exclude fast lunar movements to focus on high-potency outer/personal triggers
      if (tPlanet.name === "Moon") continue;

      for (const nTarget of natalTargets) {
        if (tPlanet.name === nTarget.name) continue; // Avoid auto-conjunction returns for simple sweep pacing

        let diff = Math.abs(tPlanet.longitude - nTarget.longitude);
        if (diff > 180) diff = 360 - diff;

        for (const aspect of ASPECT_CONFIGS) {
          const currentOrb = Math.abs(diff - aspect.angle);
          
          // Tight Lock Constraint: Under 1.0 degree exact orb
          if (currentOrb <= 1.0) {
            const dateOptions: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" };
            const formattedCalendarDate = checkDate.toLocaleDateString("en-US", dateOptions);

            return {
              date: formattedCalendarDate, // e.g. "June 10"
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
      return NextResponse.json(
        { success: false, error: "birthDate, birthTime, lat, and lng are required." },
        { status: 400 }
      );
    }

    const utcOffset = getUtcOffset(birthDate, birthTime, timezone);
    const jdBirth = toJulianDay(birthDate, birthTime, utcOffset);

    const jdNow = toJulianDay(
      new Date().toISOString().slice(0, 10),
      `${new Date().getUTCHours()}:${String(new Date().getUTCMinutes()).padStart(2, "0")}`,
      0
    );

    const tropicalRaw = calculatePlanets(jdBirth, lat, lng, "W");
    const tropicalChart = buildNormalizedChart(
      tropicalRaw, birthDate, birthTime, birthPlace, lat, lng, timezone
    );

    const siderealRaw = calculatePlanets(jdBirth, lat, lng, "W", swisseph.SE_SIDM_LAHIRI);
    const siderealChart = buildNormalizedChart(
      siderealRaw, birthDate, birthTime, birthPlace, lat, lng, timezone
    );

    const transitRaw = calculatePlanets(jdNow, lat, lng, "W");
    const transits: TransitPlanet[] = transitRaw.planets.map(({ name, longitude, isRetrograde }) => {
      const { sign, degree } = longitudeToSignDegree(longitude);
      return { name, sign, degree, isRetrograde };
    });

    const ascSign = tropicalChart.angles.asc?.sign ?? "Aries";
    const natalPlanetsForProfection = tropicalRaw.planets.map(({ name, longitude }) => {
      const { sign } = longitudeToSignDegree(longitude);
      const house = getWholeSignHouse(longitude, tropicalRaw.ascLongitude);
      return { name, sign, house };
    });
    const profection = calculateProfection(birthDate, ascSign, natalPlanetsForProfection);

    // Compute chronological tracking matrices to detect impending 0-1 degree orbs
    let upcomingTrigger: UpcomingTriggerData | undefined;
    try {
      upcomingTrigger = calculateUpcomingTrigger(tropicalRaw, lat, lng);
    } catch (ephemerisErr) {
      console.warn("[chart-calculate] Ephemeris sweep failed, skipping upcomingTrigger:", ephemerisErr);
      upcomingTrigger = undefined;
    }

    const response: ChartCalculateResponse = {
      success: true,
      tropical: tropicalChart,
      sidereal: siderealChart,
      transits,
      profection,
      upcomingTrigger, // Integrated dynamically into client payload pipelines
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err) {
    console.error("[chart-calculate] Error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to calculate chart. Please check your inputs." },
      { status: 500 }
    );
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