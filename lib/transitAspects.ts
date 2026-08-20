/* ═══════════════════════════════════════════════════════════════════════════
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
  band: "exact" | "live" | "background";  // exact <1°, live <3°, background <6°
  exactDate: string | null; // When this aspect perfects (e.g., "August 25, 2026")
  daysUntilExact: number | null; // Days until the aspect perfects
}

/**
 * Calculate when an aspect will perfect (reach exact orb).
 * Uses binary search to find the exact date.
 */
function calculateExactAspectDate(
  transitPlanet: { name: string; longitude: number; longitudeSpeed: number },
  natalLongitude: number,
  aspectAngle: number,
  startDate: Date,
  maxDays: number = 45
): { date: string; daysUntil: number } | null {
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
  };

  const planetId = PLANET_IDS[transitPlanet.name];
  if (!planetId) return null;

  // Target longitude: natal + aspect angle (normalized to 0-360)
  let targetLon = (natalLongitude + aspectAngle) % 360;
  if (targetLon < 0) targetLon += 360;

  // Binary search for the exact date
  let lo = 0;
  let hi = maxDays;
  let bestDate = startDate;
  let bestDiff = Infinity;

  for (let i = 0; i < 30; i++) { // 30 iterations = ~1 second precision
    const mid = (lo + hi) / 2;
    const checkDate = new Date(startDate);
    checkDate.setDate(startDate.getDate() + mid);
    
    const jd = swisseph.swe_julday(
      checkDate.getFullYear(),
      checkDate.getMonth() + 1,
      checkDate.getDate(),
      12, // Noon
      swisseph.SE_GREG_CAL
    );
    
    const result = swisseph.swe_calc_ut(jd, planetId, 4 | 256);
    let diff = Math.abs(result.longitude - targetLon);
    if (diff > 180) diff = 360 - diff;
    
    if (diff < bestDiff) {
      bestDiff = diff;
      bestDate = checkDate;
    }
    
    // Check if we're getting closer or farther
    const nextDate = new Date(startDate);
    nextDate.setDate(startDate.getDate() + mid + 0.5);
    const nextJd = swisseph.swe_julday(
      nextDate.getFullYear(),
      nextDate.getMonth() + 1,
      nextDate.getDate(),
      12,
      swisseph.SE_GREG_CAL
    );
    const nextResult = swisseph.swe_calc_ut(nextJd, planetId, 4 | 256);
    let nextDiff = Math.abs(nextResult.longitude - targetLon);
    if (nextDiff > 180) nextDiff = 360 - nextDiff;
    
    if (nextDiff < diff) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  // Check if we found a date within reasonable orb
  if (bestDiff > 5) return null;

  const daysUntil = Math.round((bestDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntil < 0 || daysUntil > maxDays) return null;

  return {
    date: bestDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    daysUntil,
  };
}

/**
 * Cross every transiting body against every natal point.
 * Returns aspects within 6° orb, sorted tightest first.
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
    { type: "conjunction", angle: 0,   maxOrb: 6 },
    { type: "opposition",  angle: 180, maxOrb: 6 },
    { type: "square",      angle: 90,  maxOrb: 5 },
    { type: "trine",       angle: 120, maxOrb: 5 },
    { type: "sextile",     angle: 60,  maxOrb: 4 },
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
          45
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
          band: orb < 1 ? "exact" : orb < 3 ? "live" : "background",
          exactDate: exactDateInfo?.date || null,
          daysUntilExact: exactDateInfo?.daysUntil || null,
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
    "TRANSIT-TO-NATAL ASPECTS (calculated, exact, sorted tightest first —",
    "this is your activation priority. Do NOT compute these yourself; they are given.)",
    "EXACT = under 1° orb. LIVE = under 3°. BACKGROUND = 3-6°, context only.",
    "APPLYING = still tightening, the event is building. SEPARATING = peak has passed.",
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
 * Get a diverse, chronologically spread set of unique dates from transit aspects 
 * within the next 45 days, preventing date-clustering bottlenecks.
 * 
 * This fixes the "same 2 dates" problem by:
 * 1. Keeping only the tightest aspect per date
 * 2. Spreading dates at least 3 days apart
 * 3. Returning up to 6 diverse dates
 */
export function getUniqueAspectDates(aspects: TransitAspect[]): string[] {
  // Map all valid exact dates with their corresponding orbs
  const dateMap = new Map<string, { orb: number; planet: string }>();

  for (const a of aspects) {
    if (!a.exactDate || a.daysUntilExact === null || a.daysUntilExact > 45 || a.daysUntilExact < 0) {
      continue;
    }

    // If we already have this date, keep the one with the tighter orb
    if (!dateMap.has(a.exactDate) || a.orbDegrees < dateMap.get(a.exactDate)!.orb) {
      dateMap.set(a.exactDate, { orb: a.orbDegrees, planet: a.transitPlanet });
    }
  }

  // Convert to an array of objects for sorting/filtering
  const uniqueDateEntries = Array.from(dateMap.entries()).map(([date, meta]) => ({
    dateStr: date,
    dateObj: new Date(date),
    ...meta,
  }));

  // Sort chronologically
  uniqueDateEntries.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

  // Diversity filter: Ensure we don't pack all dates into the exact same 3-day window
  const diverseDates: string[] = [];
  let lastTime = 0;
  const MIN_GAP_MS = 3 * 24 * 60 * 60 * 1000; // At least 3 days apart when possible

  for (const entry of uniqueDateEntries) {
    if (diverseDates.length === 0 || entry.dateObj.getTime() - lastTime >= MIN_GAP_MS) {
      diverseDates.push(entry.dateStr);
      lastTime = entry.dateObj.getTime();
    }
  }

  // If diversity filter stripped too many, fallback to top chronological unique dates (up to 5)
  if (diverseDates.length < 2 && uniqueDateEntries.length >= 2) {
    return uniqueDateEntries.slice(0, 5).map(e => e.dateStr);
  }

  // Cap at 6 distinct, spread-out dates
  return diverseDates.slice(0, 6);
}