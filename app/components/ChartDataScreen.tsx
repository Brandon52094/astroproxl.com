"use client";

import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  MapPin,
  Calculator,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { cn } from "@/lib/utils";
import type { ChartCalculateResponse } from "@/app/api/chart-calculate/route";
import { saveChart, loadChart } from "@/lib/chartStore";

type SectionId = "birth" | "chart";

type ResolvedPlace = {
  label: string;
  lat: number;
  lon: number;
  timezone: string;
};

// ─── Normalize any date format to MM/DD/YYYY ──────────────────────────────────
function normalizeBirthDate(raw: string): string {
  const s = raw.trim();

  // Already MM/DD/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;

  // YYYY-MM-DD or YYYYMMDD
  const isoMatch = s.match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}`;
  }

  // MM-DD-YYYY
  const mdyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (mdyDash) {
    return `${mdyDash[1]}/${mdyDash[2]}/${mdyDash[3]}`;
  }

  // DD/MM/YYYY (European) — only if day > 12 makes it unambiguous
  const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1]);
    const m = parseInt(dmyMatch[2]);
    if (d > 12 && m <= 12) {
      return `${dmyMatch[2]}/${dmyMatch[1]}/${dmyMatch[3]}`;
    }
    return s; // ambiguous — return as-is
  }

  return s;
}

function Section({
  id, title, subtitle, status, isOpen, onToggle, children,
}: {
  id: SectionId; title: string; subtitle: string; status: React.ReactNode;
  isOpen: boolean; onToggle: (id: SectionId) => void; children: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-white/[0.03]">
      <button type="button" onClick={() => onToggle(id)} aria-expanded={isOpen}
        className="w-full text-left transition hover:bg-white/[0.02]">
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-white">{title}</h2>
              {status}
            </div>
            <p className="mt-1 pr-4 text-sm leading-5 text-slate-400">{subtitle}</p>
          </div>
          <div className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/20 text-slate-400 transition",
            isOpen && "rotate-180"
          )}>
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden">
            <div className="border-t border-white/10 px-4 pb-4 pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function getStatus(type: "complete" | "missing" | "calculating", count?: number) {
  if (type === "complete") return (
    <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-emerald-200">Complete</span>
  );
  if (type === "calculating") return (
    <span className="rounded-full border border-teal-300/20 bg-teal-300/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-teal-100">Calculating…</span>
  );
  return (
    <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-amber-200">
      {count ? `Missing ${count}` : "Missing"}
    </span>
  );
}

export default function ChartDataScreen() {
  const router = useRouter();
  const [openSections, setOpenSections] = useState<SectionId[]>(["birth"]);
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [resolvedPlace, setResolvedPlace] = useState<ResolvedPlace | null>(null);
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<ChartCalculateResponse | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const previousCompletionRef = useRef({ birth: false, chart: false });

  useEffect(() => {
    const saved = loadChart();
    if (saved && !birthDate && !birthTime && !birthPlace) {
      setBirthDate(saved.birthDate);
      setBirthTime(saved.birthTime);
      setBirthPlace(saved.birthPlace);
      setResolvedPlace({ label: saved.birthPlace, lat: saved.lat, lon: saved.lng, timezone: saved.timezone });
      setChartData(saved.chartData);
    }
  }, []);

  const toggleSection = useCallback((id: SectionId) => {
    setOpenSections((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  }, []);

  const geocodeBirthPlace = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) { setResolvedPlace(null); return; }
    setGeocodeLoading(true);
    setGeocodeError(null);
    setResolvedPlace(null);
    setChartData(null);
    try {
      const response = await fetch("/api/places/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = await response.json();
      if (!response.ok || !data?.place) throw new Error(data?.error ?? "Couldn't verify that birth place.");
      setResolvedPlace({ label: data.place.label, lat: data.place.lat, lon: data.place.lon, timezone: data.place.timezone ?? "UTC" });
      setBirthPlace(data.place.label);
    } catch (err) {
      setGeocodeError(err instanceof Error ? err.message : "Couldn't verify that birth place.");
    } finally {
      setGeocodeLoading(false);
    }
  }, []);

  const handleCalculateChart = useCallback(async () => {
    if (!birthDate.trim() || !birthTime.trim() || !resolvedPlace) return;
    setCalculating(true);
    setCalcError(null);
    setChartData(null);

    // Normalize date format before sending
    const normalizedDate = normalizeBirthDate(birthDate.trim());

    try {
      const response = await fetch("/api/chart-calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthDate: normalizedDate,
          birthTime: birthTime.trim(),
          birthPlace: resolvedPlace.label,
          lat: resolvedPlace.lat,
          lng: resolvedPlace.lon,
          timezone: resolvedPlace.timezone,
        }),
      });
      const data: ChartCalculateResponse = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error ?? "Chart calculation failed.");
      setChartData(data);
      setBirthDate(normalizedDate); // update display to normalized format

      saveChart({
        birthDate: normalizedDate,
        birthTime: birthTime.trim(),
        birthPlace: resolvedPlace.label,
        lat: resolvedPlace.lat,
        lng: resolvedPlace.lon,
        timezone: resolvedPlace.timezone,
        chartData: data,
      });

      await fetch("/api/user/save-chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthDate: normalizedDate,
          birthTime: birthTime.trim(),
          birthPlace: resolvedPlace.label,
          lat: resolvedPlace.lat,
          lng: resolvedPlace.lon,
          timezone: resolvedPlace.timezone,
        }),
      });

      setOpenSections((prev) => { const next = new Set(prev); next.add("chart"); return Array.from(next); });
    } catch (err) {
      setCalcError(err instanceof Error ? err.message : "Chart calculation failed. Please try again.");
    } finally {
      setCalculating(false);
    }
  }, [birthDate, birthTime, resolvedPlace]);

  const birthMissing = useMemo(() => [birthDate, birthTime, birthPlace].filter((v) => !v.trim()).length, [birthDate, birthTime, birthPlace]);
  const birthComplete = birthMissing === 0 && !!resolvedPlace;
  const chartComplete = !!chartData;
  const canContinue = birthComplete && chartComplete;
  const canCalculate = birthComplete && !calculating;

  useEffect(() => {
    const completion = { birth: birthComplete, chart: chartComplete };
    const justCompleted = (Object.keys(completion) as SectionId[]).filter(
      (key) => completion[key] && !previousCompletionRef.current[key]
    );
    if (justCompleted.length > 0) setOpenSections((prev) => prev.filter((s) => !justCompleted.includes(s)));
    previousCompletionRef.current = completion;
  }, [birthComplete, chartComplete]);

  const tropicalPlanets = useMemo(() => {
    if (!chartData) return [];
    const order = ["Sun", "Moon", "Ascendant", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node", "Midheaven"];
    return chartData.tropical.planets.filter((p) => order.includes(p.name)).sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  }, [chartData]);

  const confirmationItems = useMemo(() => {
    const sun = tropicalPlanets.find((p) => p.name === "Sun");
    const moon = tropicalPlanets.find((p) => p.name === "Moon");
    const asc = tropicalPlanets.find((p) => p.name === "Ascendant");
    return [
      { label: "Birth Date", value: birthDate.trim() || "—" },
      { label: "Birth Time", value: birthTime.trim() || "—" },
      { label: "Birth Place", value: resolvedPlace?.label || birthPlace.trim() || "—" },
      { label: "Sun", value: sun ? `${sun.sign} ${sun.degree}` : "—" },
      { label: "Moon", value: moon ? `${moon.sign} ${moon.degree}` : "—" },
      { label: "Rising", value: asc ? `${asc.sign} ${asc.degree}` : "—" },
    ];
  }, [birthDate, birthTime, birthPlace, resolvedPlace, tropicalPlanets]);

  const handleContinue = useCallback(() => {
    setSubmitError(null);
    router.push("/reading/intake");
  }, [router]);

  return (
    // iOS-safe scroll container — no rubber-band snap
    <div className="h-screen overflow-y-auto overscroll-none bg-[#050816] text-slate-100"
      style={{ WebkitOverflowScrolling: "touch" }}>
      <div className="mx-auto w-full max-w-md px-4 pb-32 pt-4">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }} className="flex flex-col">

          <header className="mb-5 flex items-center justify-between py-2">
            <button type="button" onClick={() => router.back()}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300 transition hover:border-teal-300/30 hover:text-white">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Direct Future Predictions</p>
              <p className="mt-1 text-xs text-slate-400">Your Chart</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-[11px] font-medium text-slate-400">2/4</div>
          </header>

          <div className="mb-4 space-y-1">
            <h1 className="text-[26px] font-semibold leading-tight text-white">Enter your birth details</h1>
            <p className="text-sm text-slate-400">Accepts any date format — MM/DD/YYYY, YYYY-MM-DD, or YYYYMMDD.</p>
          </div>

          <section className="space-y-3">
            <Section id="birth" title="Birth Details"
              subtitle="Enter your birth date, time, and place."
              isOpen={openSections.includes("birth")} onToggle={toggleSection}
              status={birthComplete ? getStatus("complete") : getStatus("missing", birthMissing)}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="birth-date" className="text-sm font-medium text-slate-200">Birth Date</Label>
                  <Input id="birth-date" type="text" inputMode="numeric" autoComplete="bday"
                    value={birthDate} onChange={(e) => setBirthDate(e.target.value ?? "")}
                    placeholder="05/20/1994 or 19940520"
                    className="h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-slate-500 focus-visible:ring-1 focus-visible:ring-teal-300" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="birth-time" className="text-sm font-medium text-slate-200">Birth Time</Label>
                  <Input id="birth-time" type="text" autoComplete="off"
                    value={birthTime} onChange={(e) => setBirthTime(e.target.value ?? "")}
                    placeholder="2:22 AM or 14:22"
                    className="h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-slate-500 focus-visible:ring-1 focus-visible:ring-teal-300" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="birth-place" className="text-sm font-medium text-slate-200">Birth Place</Label>
                  <div className="relative">
                    <Input id="birth-place" type="text" autoComplete="off"
                      value={birthPlace}
                      onChange={(e) => { setBirthPlace(e.target.value ?? ""); setResolvedPlace(null); setGeocodeError(null); setChartData(null); }}
                      onBlur={() => geocodeBirthPlace(birthPlace)}
                      placeholder="City, state, country"
                      className="h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-slate-500 focus-visible:ring-1 focus-visible:ring-teal-300" />
                    {geocodeLoading && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2">
                        <span className="h-3 w-3 animate-pulse rounded-full bg-teal-300 block" />
                      </div>
                    )}
                  </div>
                  {geocodeError && <p className="text-[12px] text-amber-200">{geocodeError}</p>}
                  {resolvedPlace && (
                    <div className="flex items-center gap-2 text-[11px] text-teal-200">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span>Verified: {resolvedPlace.label}</span>
                    </div>
                  )}
                </div>

                <Button type="button" onClick={handleCalculateChart} disabled={!canCalculate}
                  className={cn(
                    "h-12 w-full rounded-2xl font-medium transition",
                    canCalculate
                      ? "bg-teal-300 text-slate-950 shadow-[0_10px_30px_rgba(45,212,191,0.22)] hover:bg-teal-200 active:scale-[0.99]"
                      : "border border-white/10 bg-slate-800 text-slate-400 shadow-none"
                  )}>
                  <span className="flex items-center justify-center gap-2">
                    <Calculator className="h-4 w-4" />
                    {calculating ? "Calculating…" : "Calculate Chart"}
                  </span>
                </Button>

                {calculating && (
                  <div className="flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/10 px-3 py-1.5 text-[11px] text-teal-100">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-teal-300" />
                    Calculating your tropical and sidereal charts…
                  </div>
                )}

                {calcError && (
                  <div className="flex items-start gap-2 rounded-[18px] border border-rose-300/30 bg-rose-500/10 p-3 text-[12px] text-rose-100">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <p>{calcError}</p>
                  </div>
                )}
              </div>
            </Section>

            <Section id="chart" title="Your Chart"
              subtitle="Tropical placements, sidereal timing, and current transits."
              isOpen={openSections.includes("chart")} onToggle={toggleSection}
              status={calculating ? getStatus("calculating") : chartComplete ? getStatus("complete") : getStatus("missing")}>
              {chartData ? (
                <div className="space-y-4">
                  <div className="rounded-[20px] border border-teal-300/20 bg-teal-400/[0.06] p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-teal-300/20 bg-teal-300/10 text-teal-200">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-teal-100">{chartData.profection.profectionYear}th House Profection Year</p>
                        <p className="mt-1 text-xs leading-5 text-teal-100/70">
                          Age {chartData.profection.age} · {chartData.profection.activatedSign} activated ·{" "}
                          <span className="text-teal-200 font-medium">{chartData.profection.timeLord}</span> is your Time Lord
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400">Tropical Placements</p>
                    <div className="space-y-1.5">
                      {tropicalPlanets.map((planet) => (
                        <div key={planet.name} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
                          <span className="text-[12px] font-medium text-slate-400">{planet.name}</span>
                          <span className="text-sm text-slate-100">{planet.sign} {planet.degree}{planet.house ? ` · H${planet.house}` : ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400">Current Transits</p>
                    <div className="space-y-1.5">
                      {chartData.transits.filter((p) => ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"].includes(p.name)).map((planet) => (
                        <div key={planet.name} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
                          <span className="text-[12px] font-medium text-slate-400">{planet.name}</span>
                          <span className="text-sm text-slate-100">{planet.sign} {planet.degree}{planet.isRetrograde ? " Rx" : ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-sm text-slate-500">
                  Fill in your birth details and tap Calculate Chart to see your placements.
                </div>
              )}
            </Section>
          </section>

          <section className="mt-4">
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-teal-200" />
                <h3 className="text-sm font-semibold text-white">Confirm your main chart details</h3>
              </div>
              <p className="mb-4 text-xs leading-5 text-slate-400">Review your core details before continuing to the reading.</p>
              <div className="grid gap-2">
                {confirmationItems.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                    <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">{item.label}</span>
                    <span className="max-w-[60%] truncate text-right text-sm text-slate-100">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </motion.div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#050816]/90 px-4 pb-5 pt-3 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-md">
          {submitError && (
            <div className="mb-3 flex items-start gap-2 rounded-2xl border border-rose-300/30 bg-rose-500/10 p-3 text-xs text-rose-100">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>{submitError}</p>
            </div>
          )}
          <Button type="button" disabled={!canContinue} onClick={handleContinue}
            className="h-14 w-full rounded-2xl bg-teal-300 text-slate-950 shadow-lg shadow-teal-500/20 transition hover:bg-teal-200 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500">
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
