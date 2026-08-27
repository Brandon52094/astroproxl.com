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
}