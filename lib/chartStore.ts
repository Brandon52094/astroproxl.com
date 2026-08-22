/**
 * chartStore.ts
 */

import type { ChartCalculateResponse } from "@/app/api/chart-calculate/route";

export interface StoredChart {
  currentTimezone: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  lat: number;
  lng: number;
  timezone: string;
  // Current location for Solar Return calculation
  currentLat?: number;
  currentLng?: number;
  currentPlace?: string;
  chartData: ChartCalculateResponse;
  savedAt: string;
}

export interface StoredIntake {
  topic: "love" | "career" | "money" | "general";
  area: string;
  question: string;
  timeframeType: "date" | "month";
  timeframeValue: string;
  savedAt: string;
}

export interface StoredDraft {
  area: string;
  question: string;
  savedAt: string;
}

export interface ReadingSource {
  section: string;
  placements: string;
}

export interface ReadingPage {
  pageNumber: 1 | 2 | 3 | 4;
  title: string;
  content: string;
  sources?: ReadingSource[];
}

export interface StoredReading {
  id: string;
  pages: ReadingPage[];
  topic: string;
  question: string;
  generatedAt: string;
  // Set when the reading is a crisis safe-response, not a real reading. The
  // results page reads this to skip reading-complete (never bill a crisis).
  isSafeResponse?: boolean;
  riskLevel?: string | null;
}

const KEYS = {
  chart: "dfp_chart",
  intake: "dfp_intake",
  reading: "dfp_reading",
  draftQuestion: "dfp_draft_question",
} as const;

function safeGet<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: unknown): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function safeRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // silent
  }
}

export function saveChart(params: Omit<StoredChart, "savedAt">): boolean {
  return safeSet(KEYS.chart, {
    ...params,
    savedAt: new Date().toISOString(),
  });
}

export function loadChart(): StoredChart | null {
  return safeGet<StoredChart>(KEYS.chart);
}

export function clearChart(): void {
  safeRemove(KEYS.chart);
}

export function saveIntake(params: Omit<StoredIntake, "savedAt">): boolean {
  return safeSet(KEYS.intake, {
    ...params,
    savedAt: new Date().toISOString(),
  });
}

export function loadIntake(): StoredIntake | null {
  return safeGet<StoredIntake>(KEYS.intake);
}

export function clearIntake(): void {
  safeRemove(KEYS.intake);
}

export function saveDraftQuestion(area: string, question: string): boolean {
  return safeSet(KEYS.draftQuestion, {
    area,
    question,
    savedAt: new Date().toISOString(),
  });
}

export function loadDraftQuestion(): StoredDraft | null {
  return safeGet<StoredDraft>(KEYS.draftQuestion);
}

export function clearDraftQuestion(): void {
  safeRemove(KEYS.draftQuestion);
}

export function saveReading(reading: StoredReading): boolean {
  return safeSet(KEYS.reading, reading);
}

export function loadReading(): StoredReading | null {
  return safeGet<StoredReading>(KEYS.reading);
}

export function clearReading(): void {
  safeRemove(KEYS.reading);
}

export function clearSession(): void {
  safeRemove(KEYS.chart);
  safeRemove(KEYS.intake);
  safeRemove(KEYS.reading);
  safeRemove(KEYS.draftQuestion);
}

export function isChartFresh(): boolean {
  const chart = loadChart();
  if (!chart) return false;
  const savedAt = new Date(chart.savedAt).getTime();
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  return now - savedAt < twentyFourHours;
}

/* ── V2 MIGRATION — silent, guarded, one-time ────────────────────────────
 *
 * Why this exists: charts saved before the SEFLG_SPEED fix have transits
 * with isRetrograde stuck at false (every planet reads "direct"). This
 * recalculates the stored chart ONCE, using the exact same birth inputs,
 * so retrograde flags heal without the user doing anything.
 *
 * Safety contract:
 *   - Runs at most once ever (guarded by a flag key).
 *   - Only fires when the stored inputs are COMPLETE and VALID — if
 *     anything is missing or malformed, it bails and leaves the old
 *     chart untouched (no recalc on bad data = no wrong readings).
 *   - Re-sends the SAME inputs, so the chart is identical except for the
 *     now-correct retrograde data. It cannot produce a "different" chart.
 *   - On any failure (network, bad response, throw) it does NOT set the
 *     flag, so it can safely retry on the next visit.
 */

const MIGRATION_V2_KEY = "dfp_chart_migrated_v2";

function hasMigratedV2(): boolean {
  if (typeof window === "undefined") return true; // never run server-side
  try {
    return localStorage.getItem(MIGRATION_V2_KEY) === "1";
  } catch {
    return true; // if storage is unreadable, don't attempt
  }
}

function markMigratedV2(): void {
  try {
    localStorage.setItem(MIGRATION_V2_KEY, "1");
  } catch {
    // silent — worst case it retries next visit, which is harmless
  }
}

/** Validate that a stored chart has everything needed to recalc safely. */
function chartInputsAreValid(chart: StoredChart | null): chart is StoredChart {
  if (!chart) return false;
  if (typeof chart.birthDate !== "string" || chart.birthDate.trim() === "") return false;
  if (typeof chart.birthTime !== "string" || chart.birthTime.trim() === "") return false;
  if (typeof chart.lat !== "number" || !Number.isFinite(chart.lat)) return false;
  if (typeof chart.lng !== "number" || !Number.isFinite(chart.lng)) return false;
  if (chart.lat === 0 && chart.lng === 0) return false; // null-island guard
  return true;
}

/**
 * Fire-and-forget. Call once on app mount. Resolves to true if it
 * performed a migration, false if it skipped (already done, no chart,
 * invalid inputs) or failed. Never throws.
 */
export async function migrateChartV2(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (hasMigratedV2()) return false;

  const chart = loadChart();

  // No chart to migrate — mark done so we never re-check. New users will
  // calculate fresh under the fixed code anyway.
  if (!chart) {
    markMigratedV2();
    return false;
  }

  // Incomplete/malformed inputs — DO NOT recalc, DO NOT set the flag.
  // Leave the old chart exactly as-is; retry on a future visit.
  if (!chartInputsAreValid(chart)) {
    return false;
  }

  try {
    const response = await fetch("/api/chart-calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        birthDate: chart.birthDate,
        birthTime: chart.birthTime,
        birthPlace: chart.birthPlace,
        lat: chart.lat,
        lng: chart.lng,
        timezone: chart.timezone,
        // preserve Solar Return current-location inputs if present
        ...(typeof chart.currentLat === "number" && typeof chart.currentLng === "number"
          ? { currentLat: chart.currentLat, currentLng: chart.currentLng }
          : {}),
      }),
    });

    const data = (await response.json()) as ChartCalculateResponse;

    // Only overwrite on a genuine success. Anything else → leave old chart,
    // don't set the flag, retry later.
    if (!response.ok || !data.success) return false;

    saveChart({
      birthDate: chart.birthDate,
      birthTime: chart.birthTime,
      birthPlace: chart.birthPlace,
      lat: chart.lat,
      lng: chart.lng,
      timezone: chart.timezone,
      // Current location fields — required by StoredChart
      currentLat: chart.currentLat ?? undefined,
      currentLng: chart.currentLng ?? undefined,
      currentPlace: chart.currentPlace ?? "",
      currentTimezone: chart.currentTimezone ?? "",
      chartData: data,
    });

    markMigratedV2();
    return true;
  } catch {
    // Network/parse failure — safe to retry next visit.
    return false;
  }
}