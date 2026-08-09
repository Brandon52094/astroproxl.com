import { NextRequest, NextResponse } from "next/server";
import type { NormalizedChart } from "@/lib/schema/charts";
import { calculateTransitAspects, type TransitAspect } from "@/lib/transitAspects";

export interface ChartCalculateRequest {
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  lat: number;
  lng: number;
  timezone: string;
  currentLat?: number;  // for Solar Return — current location
  currentLng?: number;
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
  phaseName: string;           // e.g. "Waxing Gibbous"
  illuminationPercent: number; // 0-100
  nextEventName: "New Moon" | "Full Moon";
  daysUntilNextEvent: number;
  moonSign: string;            // current transiting Moon sign — for display
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
  error?: string;
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

  // Standard colon format — "2:22 AM", "14:22", "2:22pm" (with or without space)
  const colonMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (colonMatch) {
    let hour = Number(colonMatch[1]);
    const minute = Number(colonMatch[2]);
    const meridiem = colonMatch[3]?.toLowerCase();
    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    return [hour, minute];
  }

  // Plain digit format — "1048" (10:48), "848" (8:48), optionally with am/pm
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
    const localDate = new Date(`${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00`);
    const utcStr = localDate.toLocaleString("en-US", { timeZone: "UTC", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    const tzStr  = localDate.toLocaleString("en-US", { timeZone: timezone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
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

// EDIT A: Add the anaretic helper function
function isAnareticLongitude(longitude: number): boolean {
  const degreeInSign = (((longitude % 360) + 360) % 360) % 30;
  return degreeInSign >= 29; // the 29th degree — anaretic / "degree of fate"
}

function calculatePlanets(
  jd: number, lat: number, lng: number, houseSystem: string, ayanamsa?: number
): {
  planets: Array<{ name: string; longitude: number; isRetrograde: boolean; longitudeSpeed: number }>;
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
    // FIX: Correct Swiss Ephemeris ID for Black Moon Lilith
    { id: swisseph.SE_CHIRON,    name: "Chiron" },
    { id: swisseph.SE_MEAN_APOG, name: "Lilith" },
    { id: swisseph.SE_CERES,     name: "Ceres" },
    { id: swisseph.SE_PALLAS,    name: "Pallas" },
    { id: swisseph.SE_JUNO,      name: "Juno" },
    { id: swisseph.SE_VESTA,     name: "Vesta" },
  ];
  // 4 = SEFLG_SWIEPH, 256 = SEFLG_SPEED, 65536 = SEFLG_SIDEREAL
  const iflag = ayanamsa !== undefined ? (4 | 65536 | 256) : (4 | 256);
  if (ayanamsa !== undefined) swisseph.swe_set_sid_mode(ayanamsa, 0, 0);
  const houses = swisseph.swe_houses(jd, lat, lng, "W");
  const ascLongitude = houses.ascendant;
  const mcLongitude = houses.mc;
  const houseCusps = houses.house;
  
  const planets = PLANETS.map(({ id, name }) => {
    // GUARD: Catch undefined constants before they silently become the Sun
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
  
  // EDIT B: Set the anaretic flag on each placement
  const planetPlacements = planets.map(({ name, longitude, isRetrograde }) => {
    const { sign, degree } = longitudeToSignDegree(longitude);
    const house = getWholeSignHouse(longitude, ascLongitude);
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
  
  // FIX: Correct birthday check - has birthday occurred this calendar year?
  const hasHadBirthdayThisYear = now >= new Date(now.getFullYear(), birthMonth - 1, birthDay);
  const lastBirthdayYear = hasHadBirthdayThisYear ? now.getFullYear() : now.getFullYear() - 1;
  const lastBirthday = new Date(lastBirthdayYear, birthMonth - 1, birthDay);
  
  const daysSinceLastBirthday = Math.floor((now.getTime() - lastBirthday.getTime()) / 86400000);
  const fractionalAge = age + daysSinceLastBirthday / 365.25;
  const jdProgressed = jdBirth + fractionalAge;
  const raw = calculatePlanets(jdProgressed, lat, lng, "W");
  const PLANET_NAMES = ["Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn","Uranus","Neptune","Pluto","North Node"];

  const progressed: ProgressedPlanet[] = raw.planets
    .filter(p => PLANET_NAMES.includes(p.name))
    .map(({ name, longitude, isRetrograde }) => {
      const { sign, degree } = longitudeToSignDegree(longitude);
      return { name, sign, degree: isRetrograde ? `${degree} Rx` : degree, isRetrograde };
    });

  // ── The progressed angles — previously dropped ──
  const pAsc = longitudeToSignDegree(raw.ascLongitude);
  const pMc  = longitudeToSignDegree(raw.mcLongitude);
  progressed.push({ name: "Ascendant", sign: pAsc.sign, degree: pAsc.degree, isRetrograde: false });
  progressed.push({ name: "Midheaven", sign: pMc.sign,  degree: pMc.degree,  isRetrograde: false });

  return progressed;
}

function calculateSolarArcs(jdBirth: number, birthDate: string, lat: number, lng: number): SolarArcPlanet[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swisseph = require("swisseph");
  const [birthYear, birthMonth, birthDay] = parseDateParts(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birthYear;
  if (now.getMonth() + 1 < birthMonth || (now.getMonth() + 1 === birthMonth && now.getDate() < birthDay)) age--;
  
  // FIX: match the corrected birthday logic used in calculateProgressions
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
  const natalRaw = calculatePlanets(jdBirth, lat, lng, "W");
  const PLANET_NAMES = ["Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn","Uranus","Neptune","Pluto","North Node"];
  const solarArcPlanets: SolarArcPlanet[] = natalRaw.planets
    .filter(p => PLANET_NAMES.includes(p.name))
    .map(({ name, longitude }) => {
      const directedLongitude = (longitude + solarArc) % 360;
      const { sign, degree } = longitudeToSignDegree(directedLongitude);
      return { name: `SA ${name}`, sign, degree };
    });
  solarArcPlanets.push({ name: "SA Ascendant", ...longitudeToSignDegree((natalRaw.ascLongitude + solarArc) % 360) });
  solarArcPlanets.push({ name: "SA Midheaven", ...longitudeToSignDegree((natalRaw.mcLongitude + solarArc) % 360) });
  return solarArcPlanets;
}

function calculateUpcomingTrigger(natalRaw: ReturnType<typeof calculatePlanets>, lat: number, lng: number): UpcomingTriggerData | undefined {
  const ASPECT_CONFIGS: Array<{ type: "conjunction"|"opposition"|"square"|"trine"|"sextile"; angle: number }> = [
    { type: "conjunction", angle: 0 }, { type: "opposition", angle: 180 },
    { type: "square", angle: 90 }, { type: "trine", angle: 120 }, { type: "sextile", angle: 60 },
  ];
  
  // FIX: Whitelist primary bodies to eliminate minor asteroid trigger noise
  const TRIGGER_WHITELIST = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node"];

  const natalTargets = natalRaw.planets
    .filter(p => TRIGGER_WHITELIST.includes(p.name))
    .map(p => ({ name: p.name, longitude: p.longitude }));
    
  natalTargets.push({ name: "Ascendant", longitude: natalRaw.ascLongitude });
  natalTargets.push({ name: "Midheaven", longitude: natalRaw.mcLongitude });

  const today = new Date();
  for (let dayOffset = 0; dayOffset <= 30; dayOffset++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + dayOffset);
    const jdCheck = toJulianDay(checkDate.toISOString().slice(0, 10), "12:00", 0);
    const transitRaw = calculatePlanets(jdCheck, lat, lng, "W");

    const filteredTransits = transitRaw.planets.filter(p => TRIGGER_WHITELIST.includes(p.name));

    for (const tPlanet of filteredTransits) {
      if (tPlanet.name === "Moon") continue; // Skip fast-moving Moon for major trigger events
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
              aspect: aspect.type
            };
          }
        }
      }
    }
  }
  return undefined;
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
  const natalTargets = [
    ...natalRaw.planets.map(p => ({ name: p.name, longitude: p.longitude, house: getWholeSignHouse(p.longitude, natalRaw.ascLongitude) })),
    { name: "Ascendant", longitude: natalRaw.ascLongitude, house: 1 },
    { name: "Midheaven", longitude: natalRaw.mcLongitude, house: 10 },
  ];
  const today = new Date();
  const stations: PlanetaryStationData[] = [];
  for (const planet of STATION_PLANETS) {
    let prevSpeed: number | null = null;
    for (let dayOffset = 0; dayOffset <= 60; dayOffset++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + dayOffset);
      const jd = toJulianDay(checkDate.toISOString().slice(0, 10), "12:00", 0);
      const result = swisseph.swe_calc_ut(jd, planet.id, 4 | 256);
      const speed = result.longitudeSpeed;
      const longitude = result.longitude;
      if (prevSpeed !== null && ((prevSpeed > 0 && speed <= 0) || (prevSpeed < 0 && speed >= 0))) {
        const stationType: "retrograde" | "direct" = speed <= 0 ? "retrograde" : "direct";
        const { sign, degree } = longitudeToSignDegree(longitude);
        let natalPlanetHit: string | null = null;
        let orbDegrees: number | null = null;
        let natalHouse: number | null = null;
        for (const target of natalTargets) {
          let diff = Math.abs(longitude - target.longitude);
          if (diff > 180) diff = 360 - diff;
          if (diff <= 3.0 && (orbDegrees === null || diff < orbDegrees)) {
            natalPlanetHit = target.name;
            orbDegrees = Math.round(diff * 10) / 10;
            natalHouse = target.house;
          }
        }
        stations.push({ planet: planet.name, stationDate: checkDate.toLocaleDateString("en-US", { month: "long", day: "numeric" }), stationType, sign, degree, natalPlanetHit, orbDegrees, natalHouse });
      }
      prevSpeed = speed;
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

  // FIX: correct JD→Date conversion. The epoch offset is 2440587.5 * 86400000
  //      = 210866760000000 ms (the old constant was short three zeros, throwing
  //      approxJD back ~6600 years).
  const jdToDate = (jd: number) => new Date((jd - 2440587.5) * 86400000);
  const yearsSinceBirth = currentYear - jdToDate(jdBirth).getFullYear();
  const approxJD = jdBirth + yearsSinceBirth * 365.25;

  let bestJD = approxJD;
  let smallestDiff = 360;

  for (let offset = -3 * 24; offset <= 3 * 24; offset++) {
    const jdCheck = approxJD + offset / 24;
    const sunResult = swisseph.swe_calc_ut(jdCheck, swisseph.SE_SUN, 4 | 256);
    let diff = Math.abs(sunResult.longitude - natalSunLongitude);
    if (diff > 180) diff = 360 - diff;
    if (diff < smallestDiff) {
      smallestDiff = diff;
      bestJD = jdCheck;
    }
  }

  const srRaw = calculatePlanets(bestJD, srLat, srLng, "W");

  const ascDeg = longitudeToSignDegree(srRaw.ascLongitude);
  const mcDeg = longitudeToSignDegree(srRaw.mcLongitude);

  const PLANET_NAMES = ["Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn","Uranus","Neptune","Pluto","North Node"];
  const planets = srRaw.planets
    .filter(p => PLANET_NAMES.includes(p.name))
    .map(({ name, longitude, isRetrograde }) => {
      const { sign, degree } = longitudeToSignDegree(longitude);
      const house = String(getWholeSignHouse(longitude, srRaw.ascLongitude));
      return { name, sign, degree: isRetrograde ? `${degree} Rx` : degree, house };
    });

  const timeLordInSR = planets.find(p => p.name === timeLord);

  const srDate = new Date((bestJD - 2440587.5) * 86400000);
  const sunReturnDate = srDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

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

// ── Moon Phase ────────────────────────────────────────────────────────────────
// Phase is determined by the angular distance between Moon and Sun longitudes:
//   0°   = New Moon          90°  = First Quarter
//   180° = Full Moon         270° = Last Quarter
// Illumination % follows from that same angle via (1 - cos(angle)) / 2.

const MOON_PHASE_NAMES: Array<{ maxAngle: number; name: string }> = [
  { maxAngle: 11.25,  name: "New Moon" },
  { maxAngle: 78.75,  name: "Waxing Crescent" },
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

// ── Extended Points: Declinations & Arabic Lots ──────────────────────────────

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
    // 4 = SEFLG_SWIEPH, 2048 = SEFLG_EQUATORIAL
    const res = swisseph.swe_calc_ut(jd, id, 4 | 2048);
    
    // FIX: Read .latitude instead of .declination
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

export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swisseph = require("swisseph");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("path");
  swisseph.swe_set_ephe_path(path.join(process.cwd(), "node_modules/swisseph/ephe"));

  try {
    const body = await req.json() as ChartCalculateRequest;
    const { birthDate, birthTime, birthPlace, lat, lng, timezone, currentLat, currentLng } = body;

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

    const tropicalRaw = calculatePlanets(jdBirth, lat, lng, "W");
    const tropicalChart = buildNormalizedChart(tropicalRaw, birthDate, birthTime, birthPlace, lat, lng, timezone);

    const siderealRaw = calculatePlanets(jdBirth, lat, lng, "W", swisseph.SE_SIDM_LAHIRI);
    const siderealChart = buildNormalizedChart(siderealRaw, birthDate, birthTime, birthPlace, lat, lng, timezone);

    const transitRaw = calculatePlanets(jdNow, lat, lng, "W");
    const transits: TransitPlanet[] = transitRaw.planets.map(({ name, longitude, isRetrograde }) => {
      const { sign, degree } = longitudeToSignDegree(longitude);
      return { name, sign, degree, isRetrograde };
    });

    let transitAspects: TransitAspect[] = [];
    try {
      transitAspects = calculateTransitAspects(
        transitRaw.planets,
        tropicalRaw,
        longitudeToSignDegree,
        getWholeSignHouse
      );
    } catch (e) {
      console.warn("[chart-calculate] Transit aspect calculation failed:", e);
    }

    const ascSign = tropicalChart.angles.asc?.sign ?? "Aries";
    const natalPlanetsForProfection = tropicalRaw.planets.map(({ name, longitude }) => {
      const { sign } = longitudeToSignDegree(longitude);
      return { name, sign, house: getWholeSignHouse(longitude, tropicalRaw.ascLongitude) };
    });
    const profection = calculateProfection(birthDate, ascSign, natalPlanetsForProfection);

    const progressions = calculateProgressions(jdBirth, birthDate, lat, lng);
    const solarArcs = calculateSolarArcs(jdBirth, birthDate, lat, lng);

    let upcomingTrigger: UpcomingTriggerData | undefined;
    try {
      upcomingTrigger = calculateUpcomingTrigger(tropicalRaw, lat, lng);
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
        const srLat = currentLat ?? lat;
        const srLng = currentLng ?? lng;
        const useCurrentLocation = !!(currentLat && currentLng);
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
        const sunHouse = getWholeSignHouse(sunPlanet.longitude, tropicalRaw.ascLongitude);
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