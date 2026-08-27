/**
 * validateReadingDates.ts
 *
 * Provenance guard for JXL.
 *
 * THE DATE RULE:
 * The model may return one or more dated windows, but EVERY emitted date
 * must trace to an exact date calculated and supplied by the astrology engine.
 *
 * This file enforces that rule after generation.
 *
 * What this guarantees:
 * every date that survives into a window or dated directive matches an
 * approved calculator-supplied date.
 *
 * What this does NOT do:
 * judge whether the interpretation itself is correct.
 *
 * Valid date sources:
 *   1. upcomingTrigger.date
 *      — exact transit-to-natal aspect
 *
 *   2. planetaryStations[].stationDate
 *      — only when the station has a natal hit
 *
 *   3. transitAspects[].exactDate
 *      — ephemeris-computed exact transit dates
 *
 *   4. transitsToAngles[].exactDate
 *      — calculator-computed exact angle contacts
 */

// Forward-looking limit for exact calculator-supplied date anchors.
// Keep synchronized with FORWARD_WINDOW_DAYS in lib/reading/engine.ts.
// Discovery may happen outside this window, but the model may not create
// a dated prediction from an activation beyond this horizon.
const FORWARD_WINDOW_DAYS = 60;

/** Minimal shape this module needs — a subset of JxlAskBody. */
interface DateProvenanceInput {
  upcomingTrigger?: {
    date?: string | null;
    exactJulianDay?: number | null;
    transitPlanet?: string;
    natalPlanet?: string;
    aspect?: string;
  } | null;

  planetaryStations?: Array<{
    planet?: string;
    stationDate?: string | null;
    natalPlanetHit?: string | null;
    natalHouse?: number | null;
    orbDegrees?: number | null;
  }> | null;

  transitsToAngles?: Array<{
    transitPlanet?: string;
    angle?: string;
    aspectType?: string;
    orb?: number | null;
    isApplying?: boolean;
    exactDate?: string | null;
    exactJulianDay?: number | null;
  }> | null;
}

/** Aspect carrying a real, ephemeris-computed exact date. */
interface AspectAnchor {
  transitPlanet?: string;
  natalPlanet?: string;
  exactDate?: string | null;
  daysUntilExact?: number | null;
}

interface ParsedDate {
  month: number; // 1-12
  day: number; // 1-31
  year: number | null; // null when the string carried no year (e.g. "August 3")
}

export interface ValidDate {
  raw: string;
  parsed: ParsedDate | null; // null means the SUPPLIED date failed to parse — logged upstream
  source: string; // e.g. "upcomingTrigger", "station:Mars", "aspect:Venus-Sun"
}

export interface ValidDateIndex {
  dates: ValidDate[];
  /** Supplied dates we couldn't parse. Surfacing these catches an ephemeris
   *  date-format that our parser doesn't understand — a real bug that would
   *  otherwise cause silent false drops. */
  unparseableSupplied: string[];
}

const MS_PER_DAY = 86_400_000;

/**
 * Exact calculator dates should be echoed exactly.
 *
 * Ranges remain supported: a marker such as
 * [[DATE: August 20-August 24]]
 * passes when an approved exact anchor falls inside that range.
 *
 * For single-date markers, however, no ±day drift is allowed.
 */
const DEFAULT_TOLERANCE_DAYS = 0;

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
  sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** Lowercase, drop ordinal suffixes and commas, collapse whitespace. */
function scrub(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function norm(month: number, day: number, year: number | null): ParsedDate | null {
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  if (year !== null && (year < 1900 || year > 2200)) return null;
  return { month, day, year };
}

/**
 * Parse a loose date string into {month, day, year?}. Handles the formats the
 * model and a typical ephemeris actually emit: "August 3", "August 3, 2026",
 * "Aug 3", "3 August 2026", ISO "2026-08-03", "8/3", "8/3/2026", "8/3/26".
 * Returns null on anything it can't confidently read — the caller treats an
 * unparseable emitted date as unsupported (conservative), and an unparseable
 * supplied date as a logged data-format warning.
 */
export function parseLooseDate(input: string | null | undefined): ParsedDate | null {
  if (!input) return null;
  const s = scrub(input);
  if (!s) return null;

  let m: RegExpMatchArray | null;

  // ISO: 2026-08-03
  m = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return norm(+m[2], +m[3], +m[1]);

  // Numeric: 8/3, 8/3/2026, 8/3/26
  m = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null;
    return norm(+m[1], +m[2], year);
  }

  // Month-name first: "august 3", "aug 3 2026"
  m = s.match(/\b([a-z]{3,9})\s+(\d{1,2})(?:\s+(\d{4}))?\b/);
  if (m && MONTHS[m[1]]) return norm(MONTHS[m[1]], +m[2], m[3] ? +m[3] : null);

  // Day first: "3 august", "3 august 2026"
  m = s.match(/\b(\d{1,2})\s+([a-z]{3,9})(?:\s+(\d{4}))?\b/);
  if (m && MONTHS[m[2]]) return norm(MONTHS[m[2]], +m[1], m[3] ? +m[3] : null);

  return null;
}

/**
 * Smallest absolute day-gap between two parsed dates. When a year is missing on
 * either side we try neighbouring years and take the minimum, so a station on
 * Dec 31 still matches a model "January 1" across the boundary.
 */
function minDayDiff(a: ParsedDate, b: ParsedDate): number {
  const currentYear = new Date().getUTCFullYear();
  const aYears = a.year !== null ? [a.year] : [currentYear - 1, currentYear, currentYear + 1];
  const bYears = b.year !== null ? [b.year] : [currentYear - 1, currentYear, currentYear + 1];
  let best = Infinity;
  for (const ay of aYears) {
    for (const by of bYears) {
      const diff = Math.abs(Date.UTC(ay, a.month - 1, a.day) - Date.UTC(by, b.month - 1, b.day)) / MS_PER_DAY;
      if (diff < best) best = diff;
    }
  }
  return best;
}

/**
 * Collect every date the model is ALLOWED to anchor to, tagged by source.
 * Stations without a natal hit are excluded — per THE DATE RULE they are not a
 * valid anchor.
 */
export function buildValidDateIndex(
  body: DateProvenanceInput,
  aspects: AspectAnchor[] = [],
): ValidDateIndex {
  const dates: ValidDate[] = [];
  const unparseableSupplied: string[] = [];

  const add = (raw: string | null | undefined, source: string) => {
    if (!raw || !raw.trim()) return;
    const parsed = parseLooseDate(raw);
    if (!parsed) unparseableSupplied.push(`${source}="${raw.trim()}"`);
    dates.push({ raw: raw.trim(), parsed, source });
  };

  // Source 1 — NEXT EXACT ASPECT
  add(body.upcomingTrigger?.date, "upcomingTrigger");

  // Source 2 — stations WITH a natal hit only
  for (const s of body.planetaryStations ?? []) {
    if (s?.natalPlanetHit && s.stationDate) {
      add(s.stationDate, `station:${s.planet ?? "?"}`);
    }
  }

  // Source 3 — transit-to-natal aspect exact dates (ephemeris-computed).
  for (const a of aspects) {
    if (!a?.exactDate) continue;

    let withinWindow = false;

    if (a.daysUntilExact != null) {
      withinWindow = a.daysUntilExact >= 0 && a.daysUntilExact <= FORWARD_WINDOW_DAYS;
    } else {
      const parsed = parseLooseDate(a.exactDate);

      if (parsed) {
        const now = new Date();

        const todayUTC = Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate()
        );

        const year = parsed.year ?? now.getUTCFullYear();

        const anchorUTC = Date.UTC(
          year,
          parsed.month - 1,
          parsed.day
        );

        const gap = (anchorUTC - todayUTC) / MS_PER_DAY;

        withinWindow = gap >= 0 && gap <= FORWARD_WINDOW_DAYS;
      }
    }

    if (withinWindow) {
      add(a.exactDate, `aspect:${a.transitPlanet ?? "?"}-${a.natalPlanet ?? "?"}`);
    }
  }

  // Source 4 — exact transit-to-angle contacts.
  //
  // Only calculator-supplied exact dates qualify.
  // The route only attaches exactDate to future/applying contacts;
  // separating contacts therefore cannot manufacture future anchors.
  for (const t of body.transitsToAngles ?? []) {
    if (!t?.exactDate) continue;

    // Keep this consistent with the engine's angle activation threshold.
    if (typeof t.orb === "number" && t.orb >= 2) {
      continue;
    }

    add(t.exactDate, `angle:${t.transitPlanet ?? "?"}-${t.angle ?? "?"}`);
  }

  return { dates, unparseableSupplied };
}

/**
 * Is an emitted date traceable to a supplied one? Two independent paths, either
 * satisfies:
 *   1. Normalized string equality/containment — a cheap safety net that works
 *      even when parsing is imperfect on both sides in the same way.
 *   2. Parsed proximity within toleranceDays.
 */
export function checkDateSupported(
  dateStr: string | null | undefined,
  index: ValidDateIndex,
  toleranceDays: number = DEFAULT_TOLERANCE_DAYS,
): { supported: boolean; source?: string } {
  if (!dateStr || !dateStr.trim()) return { supported: false };

  const normEmitted = scrub(dateStr);
  const parsedEmitted = parseLooseDate(dateStr);

  for (const v of index.dates) {
    // Path 1: normalized string match
    const normValid = scrub(v.raw);
    if (
      normValid &&
      (normValid === normEmitted || normEmitted.includes(normValid) || normValid.includes(normEmitted))
    ) {
      return { supported: true, source: v.source };
    }
    // Path 2: parsed proximity
    if (parsedEmitted && v.parsed && minDayDiff(parsedEmitted, v.parsed) <= toleranceDays) {
      return { supported: true, source: v.source };
    }
  }

  return { supported: false };
}

/* ────────────────────────────────────────────────────────────────────────────
 * INLINE MARKER SUPPORT — for the /api/readings route
 *
 * That route embeds dates in prose as [[DATE: June 28]] or [[DATE: June 28-July 3]]
 * rather than in structured fields. These helpers extract those markers and
 * validate each — including ranges, where support means a supplied anchor date
 * falls inside the range (± tolerance).
 * ──────────────────────────────────────────────────────────────────────────── */

/** Pull the inner text of every [[DATE: ...]] marker in a content string. */
export function extractDateMarkers(content: string): string[] {
  const out: string[] = [];
  const re = /\[\[\s*DATE\s*:\s*([^\]]+?)\s*\]\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) out.push(m[1].trim());
  return out;
}

function toOrdinalDay(p: ParsedDate, refYear: number): number {
  const y = p.year ?? refYear;
  return Date.UTC(y, p.month - 1, p.day) / MS_PER_DAY;
}

/** Does a supplied anchor fall within [start, end] (± tolerance)? Handles a
 *  missing year on any side and a range that wraps across the year boundary. */
function anchorInRange(anchor: ParsedDate, start: ParsedDate, end: ParsedDate, tolDays: number): boolean {
  const currentYear = new Date().getUTCFullYear();
  const refYear = anchor.year ?? start.year ?? end.year ?? currentYear;
  const a = toOrdinalDay(anchor, refYear);
  const s = toOrdinalDay(start, refYear);
  let e = toOrdinalDay(end, refYear);
  if (e < s) e += 365; // range wraps Dec→Jan
  // Try the anchor in the same, previous, and next year to survive wrap.
  return [a, a + 365, a - 365].some((x) => x >= s - tolDays && x <= e + tolDays);
}

/**
 * Is a single marker's date (or range) traceable to supplied data?
 * Ranges are split on hyphen, en/em dash, or the word "to". This assumes the
 * month-name date format your prompt uses ("June 28-July 3"); a purely numeric
 * "6-28" would be misread as a range, but your prose uses month names.
 */
export function checkMarkerSupported(
  marker: string,
  index: ValidDateIndex,
  toleranceDays: number = DEFAULT_TOLERANCE_DAYS,
): boolean {
  const parts = marker
    .split(/\s*(?:–|—|-|\bto\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const start = parseLooseDate(parts[0]);
    const end = parseLooseDate(parts[parts.length - 1]);
    if (start && end) {
      for (const v of index.dates) {
        if (v.parsed && anchorInRange(v.parsed, start, end, toleranceDays)) return true;
      }
      // A range whose endpoint verbatim-matches an anchor also counts.
      return (
        checkDateSupported(parts[0], index, toleranceDays).supported ||
        checkDateSupported(parts[parts.length - 1], index, toleranceDays).supported
      );
    }
    // One endpoint unparseable — accept if either half is supported on its own.
    return parts.some((p) => checkDateSupported(p, index, toleranceDays).supported);
  }

  return checkDateSupported(marker, index, toleranceDays).supported;
}

/** Every [[DATE: ...]] marker in the content that does NOT trace to supplied data. */
export function findUnsupportedMarkers(
  content: string,
  index: ValidDateIndex,
  toleranceDays: number = DEFAULT_TOLERANCE_DAYS,
): string[] {
  return extractDateMarkers(content).filter((mk) => !checkMarkerSupported(mk, index, toleranceDays));
}