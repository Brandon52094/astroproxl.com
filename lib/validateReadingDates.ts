/**
 * validateReadingDates.ts
 *
 * Provenance guard for JXL. THE DATE RULE says the model may return at most one
 * date, and only if it traces to a date the ephemeris actually calculated. The
 * model is *told* this — this file *enforces* it after the fact.
 *
 * What this guarantees: every date that survives into a window or a dated
 * directive matches a date you supplied, within a small tolerance.
 * What this does NOT do: judge whether the interpretation is correct, or force
 * the model to use the data. It only catches invented dates.
 *
 * Valid date sources (mirrors THE DATE RULE exactly):
 *   1. upcomingTrigger.date            — the NEXT EXACT ASPECT
 *   2. planetaryStations[].stationDate — ONLY when the station has a natal hit
 *
 * Solar Return date is intentionally NOT a valid anchor: your prompt uses SR as
 * a confirmation FILTER, not a timing source. "Today for EXACT aspects" is also
 * excluded — the prompt itself says EXACT aspects very likely warrant no date.
 * If you ever want either, add it in buildValidDateIndex and nowhere else.
 */

/** Minimal shape this module needs — a subset of JxlAskBody. */
interface DateProvenanceInput {
  upcomingTrigger?: { date?: string | null } | null;
  planetaryStations?: Array<{
    planet?: string;
    stationDate?: string | null;
    natalPlanetHit?: string | null;
  }> | null;
}

interface ParsedDate {
  month: number; // 1-12
  day: number; // 1-31
  year: number | null; // null when the string carried no year (e.g. "August 3")
}

export interface ValidDate {
  raw: string;
  parsed: ParsedDate | null; // null means the SUPPLIED date failed to parse — logged upstream
  source: string; // e.g. "upcomingTrigger", "station:Mars"
}

export interface ValidDateIndex {
  dates: ValidDate[];
  /** Supplied dates we couldn't parse. Surfacing these catches an ephemeris
   *  date-format that our parser doesn't understand — a real bug that would
   *  otherwise cause silent false drops. */
  unparseableSupplied: string[];
}

const MS_PER_DAY = 86_400_000;

/** Default match tolerance. 0 would demand the model echo the ephemeris date to
 *  the day; 2 forgives the model rounding a station by a day while still
 *  catching a fabricated date, which is never within 2 days by accident.
 *  Tighten to 1 or 0 if you want maximum strictness. */
const DEFAULT_TOLERANCE_DAYS = 2;

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
export function buildValidDateIndex(body: DateProvenanceInput): ValidDateIndex {
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