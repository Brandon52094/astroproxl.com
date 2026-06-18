/**
 * chartStore.ts
 */

import type { ChartCalculateResponse } from "@/app/api/chart-calculate/route";

export interface StoredChart {
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

export interface ReadingPage {
  pageNumber: 1 | 2 | 3 | 4;
  title: string;
  content: string;
}

export interface StoredReading {
  id: string;
  pages: ReadingPage[];
  topic: string;
  question: string;
  generatedAt: string;
}

const KEYS = {
  chart: "dfp_chart",
  intake: "dfp_intake",
  reading: "dfp_reading",
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
}

export function isChartFresh(): boolean {
  const chart = loadChart();
  if (!chart) return false;
  const savedAt = new Date(chart.savedAt).getTime();
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  return now - savedAt < twentyFourHours;
}