"use client";

import React, { useEffect, useState, useRef, Suspense } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { loadChart, loadIntake, saveReading, saveChart, isChartFresh, isSkyFresh } from "@/lib/chartStore";
import type { ReadingPage, StoredChart } from "@/lib/chartStore";

const LOADING_MESSAGES = [
  "Reading your natal structure…",
  "Weighing the transits active around you now…",
  "Tracing your profection year and Time Lord…",
  "Following the house rulers shaping this question…",
  "Checking for reinforcing planetary patterns…",
  "Reviewing sensitive midpoint activations…",
  "Weighing contacts to your chart angles…",
  "Cross-checking your solar return themes…",
  "Comparing progressions and solar arcs…",
  "Reviewing planetary station pressure points…",
  "Checking eclipse activations around your chart…",
  "Comparing the strongest predictive layers…",
  "Identifying the central thread of your reading…",
  "Finalizing the interpretation…",
];

/**
 * Recompute the chart's time-sensitive layers so the "current sky" matches the
 * moment the reading is generated. Re-sends the EXACT stored birth + location
 * inputs (identical to migrateChartV3), so the natal half is unchanged and only
 * the sky moves. Returns the refreshed StoredChart on success, or the original
 * chart on any failure — this only ever tightens freshness, never blocks a
 * reading that would otherwise have proceeded on cached data.
 */
async function refreshSky(chart: StoredChart): Promise<StoredChart> {
  // Guard: without valid birth inputs a recalc can't run — keep the cached chart.
  const inputsValid =
    typeof chart.birthDate === "string" && chart.birthDate.trim() !== "" &&
    typeof chart.birthTime === "string" && chart.birthTime.trim() !== "" &&
    typeof chart.timezone === "string" && chart.timezone.trim() !== "" &&
    typeof chart.lat === "number" && Number.isFinite(chart.lat) &&
    typeof chart.lng === "number" && Number.isFinite(chart.lng) &&
    !(chart.lat === 0 && chart.lng === 0);

  if (!inputsValid) return chart;

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
        ...(typeof chart.currentLat === "number" && typeof chart.currentLng === "number"
          ? { currentLat: chart.currentLat, currentLng: chart.currentLng }
          : {}),
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) return chart;

    const refreshed: StoredChart = {
      ...chart,
      chartData: data,
      savedAt: new Date().toISOString(),
    };

    // Persist so a retry / results reload sees the fresh sky too. saveChart
    // stamps its own savedAt; our object mirrors it for the in-memory return.
    saveChart({
      birthDate: chart.birthDate,
      birthTime: chart.birthTime,
      birthPlace: chart.birthPlace,
      lat: chart.lat,
      lng: chart.lng,
      timezone: chart.timezone,
      currentLat: chart.currentLat ?? undefined,
      currentLng: chart.currentLng ?? undefined,
      currentPlace: chart.currentPlace ?? "",
      currentTimezone: chart.currentTimezone ?? "",
      chartData: data,
    });

    return refreshed;
  } catch {
    return chart;
  }
}

function PreparingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [messageIndex, setMessageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [estimatedDuration, setEstimatedDuration] = useState<number>(88000); // ~88s baseline
  const hasStarted = useRef(false);
  const shouldReduceMotion = useReducedMotion();

  const stars = React.useMemo(
    () =>
      Array.from({ length: 28 }).map((_, i) => {
        const left = `${(i * 37) % 100}%`;
        const top = `${(i * 19 + 13) % 100}%`;
        const size = i % 7 === 0 ? 2 : 1;
        const opacity = i % 5 === 0 ? 0.72 : 0.34;
        const delay = (i * 0.37) % 4;
        return { left, top, size, opacity, delay, id: i };
      }),
    []
  );

  // ── 1. Load rolling average duration on mount ──
  useEffect(() => {
    try {
      const historyJson = localStorage.getItem("reading_speed_history");
      if (historyJson) {
        const history: number[] = JSON.parse(historyJson);
        if (history.length > 0) {
          const avg = history.reduce((a, b) => a + b, 0) / history.length;
          // Clamp between 45 seconds min and 150 seconds max
          setEstimatedDuration(Math.min(Math.max(avg, 45000), 150000));
        }
      }
    } catch {
      // Fallback to default
    }
  }, []);

  // ── 2. Smooth progress bar runner ──
  useEffect(() => {
    const startTime = Date.now();

    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const percentage = Math.min(Math.floor((elapsed / estimatedDuration) * 95), 95);
      setProgress(percentage);
    }, 250);

    return () => clearInterval(progressInterval);
  }, [estimatedDuration]);

  // ── 3. Slower message rotation interval (7 seconds) ──
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) =>
        prev < LOADING_MESSAGES.length - 1 ? prev + 1 : prev
      );
    }, 7000);
    return () => clearInterval(interval);
  }, []);

  // ── 4. Handle payment cancellation ──
  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    if (paymentStatus === "cancelled") {
      router.replace("/reading/intake");
      return;
    }

    if (searchParams.get("payment")) {
      window.history.replaceState({}, "", "/reading/preparing");
    }
  }, [searchParams, router]);

  // ── 5. Generate reading with timing tracking ──
  useEffect(() => {
    if (hasStarted.current) return;

    const paymentStatus = searchParams.get("payment");
    if (paymentStatus === "cancelled") return;

    hasStarted.current = true;

    async function generateReading() {
      const startTime = Date.now();

      try {
        let chart = loadChart();
        const intake = loadIntake();

        if (!chart || !isChartFresh()) {
          router.push("/chart-data");
          return;
        }

        if (!intake) {
          router.push("/reading/intake");
          return;
        }

        // Sky-freshness gate (#1): the natal half is fine for 24h (isChartFresh),
        // but the time-sensitive layers drift. If the sky is older than the
        // tight window, recompute it so the prompt's "TODAY" and the transit /
        // trigger / station / moon data refer to the same moment. On failure,
        // refreshSky returns the cached chart and we proceed as before.
        if (!isSkyFresh()) {
          chart = await refreshSky(chart);
        }

        const response = await fetch("/api/readings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // ── USER QUESTION ──
            topic: intake.topic,
            question: intake.question,
            timeframeType: intake.timeframeType,
            timeframeValue: intake.timeframeValue,

            // ── BIRTH DATA ──
            birthDate: chart.birthDate,
            birthTime: chart.birthTime,
            birthPlace: chart.birthPlace,

            // ── CORE CHART ──
            tropical: chart.chartData.tropical,
            sidereal: chart.chartData.sidereal,

            // ── CURRENT SKY ──
            transits: chart.chartData.transits,
            transitAspects: chart.chartData.transitAspects,

            // ── PRIMARY PREDICTIVE TECHNIQUES ──
            profection: chart.chartData.profection,
            progressions: chart.chartData.progressions,
            solarArcs: chart.chartData.solarArcs,
            upcomingTrigger: chart.chartData.upcomingTrigger,
            planetaryStations: chart.chartData.planetaryStations,
            solarReturn: chart.chartData.solarReturn,

            // ── SHORT-TERM / SUPPORTING DATA ──
            moonPhase: chart.chartData.moonPhase,
            extendedPoints: chart.chartData.extendedPoints,

            // ── ADVANCED CALCULATIONS ──
            houseRulers: chart.chartData.houseRulers,
            mutualReceptions: chart.chartData.mutualReceptions,
            essentialDignities: chart.chartData.essentialDignities,
            synodicCycles: chart.chartData.synodicCycles,
            midpoints: chart.chartData.midpoints,
            lunarReturn: chart.chartData.lunarReturn,
            eclipseActivations: chart.chartData.eclipseActivations,
            transitsToAngles: chart.chartData.transitsToAngles,
            dispositorTree: chart.chartData.dispositorTree,
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.reading) {
          if (response.status === 403) {
            router.replace("/reading/intake?openCredits=1");
            return;
          }
          throw new Error(data.error ?? "Failed to generate reading.");
        }

        // ── 6. Record actual duration ──
        const actualDuration = Date.now() - startTime;
        try {
          const historyJson = localStorage.getItem("reading_speed_history");
          const history: number[] = historyJson ? JSON.parse(historyJson) : [];
          const updatedHistory = [...history, actualDuration].slice(-3); // Keep last 3
          localStorage.setItem("reading_speed_history", JSON.stringify(updatedHistory));
        } catch {
          // Ignore storage errors
        }

        saveReading({
          id: data.reading.id,
          pages: data.reading.pages as ReadingPage[],
          topic: intake.topic,
          question: intake.question,
          generatedAt: new Date().toISOString(),
        });

        setProgress(100);
        setTimeout(() => {
          router.replace("/reading/results");
        }, 400);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong. Please try again."
        );
      }
    }

    generateReading();
  }, [router, searchParams]);

  return (
    <div 
      className="relative h-screen bg-[#050816] text-slate-100 flex items-center justify-center overflow-hidden"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        touchAction: "manipulation",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 18%, rgba(94,234,212,0.10), transparent 34%), radial-gradient(circle at 85% 82%, rgba(251,191,36,0.07), transparent 28%), linear-gradient(180deg, #061120 0%, #050816 44%, #040611 100%)",
          }}
        />

        <motion.div
          className="absolute left-1/2 top-[42%] h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          animate={
            shouldReduceMotion
              ? undefined
              : { opacity: [0.14, 0.24, 0.14], scale: [1, 1.05, 1] }
          }
          transition={
            shouldReduceMotion
              ? undefined
              : { duration: 8, repeat: Infinity, ease: "easeInOut" }
          }
          style={{
            background: "radial-gradient(circle, rgba(45,212,191,0.28), transparent 70%)",
          }}
        />

        {stars.map((star) => (
          <motion.span
            key={star.id}
            className="absolute rounded-full bg-white"
            style={{
              left: star.left,
              top: star.top,
              width: star.size,
              height: star.size,
              opacity: star.opacity,
            }}
            animate={
              shouldReduceMotion
                ? undefined
                : {
                    opacity: [star.opacity * 0.4, star.opacity * 1.6, star.opacity * 0.4],
                    scale: [1, 1.6, 1],
                  }
            }
            transition={
              shouldReduceMotion
                ? undefined
                : {
                    duration: 2.6 + (star.id % 5) * 0.6,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: star.delay,
                  }
            }
          />
        ))}
      </div>

      <div className="relative z-10 mx-auto w-full max-w-md px-6 text-center">
        <AnimatePresence mode="wait">
          {error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-rose-300/20 bg-rose-500/10">
                <span className="text-2xl">✕</span>
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-semibold text-white">
                  Something interrupted the reading
                </h1>
                <p className="text-sm leading-6 text-slate-400">
                  {error}
                </p>
              </div>
              <button
                onClick={() => router.push("/reading/intake")}
                className="h-12 w-full rounded-2xl bg-teal-300 text-sm font-medium text-slate-950 transition hover:bg-teal-200"
              >
                Try again
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center"
            >
              {/* Header + subhead */}
              <div className="space-y-3">
                <h1 className="text-2xl font-semibold tracking-tight text-white">
                  Building your reading
                </h1>
                <p className="mx-auto max-w-sm text-sm leading-6 text-slate-400">
                  Your chart is being weighed across multiple predictive layers to
                  find the strongest development active for you now.
                </p>
              </div>

              {/* Orb with live percentage */}
              <div className="relative mx-auto my-14 h-36 w-36">
                <motion.div
                  className="absolute inset-0 rounded-full bg-teal-400/20"
                  animate={{ scale: [1, 1.12, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  className="absolute inset-[0.85rem] rounded-full bg-teal-400/30"
                  animate={{ scale: [1, 1.12, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                />
                <motion.div
                  className="absolute inset-[1.7rem] rounded-full bg-teal-300/40"
                  animate={{ scale: [1, 1.12, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className="text-[2rem] font-semibold tracking-tight text-white"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {progress < 95 ? `${progress}%` : "…"}
                  </span>
                </div>
              </div>

              {/* Rotating status line */}
              <div className="mb-5 flex h-6 items-center justify-center">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={messageIndex}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.4 }}
                    className="text-[13px] text-teal-200/80"
                  >
                    {LOADING_MESSAGES[messageIndex]}
                  </motion.p>
                </AnimatePresence>
              </div>

              {/* Info card */}
              <div className="w-full rounded-[20px] border border-white/10 bg-white/[0.03] px-5 py-4">
                <p className="text-xs leading-6 text-slate-400">
                  This reading is built from{" "}
                  <span className="text-slate-200">your natal chart</span>,{" "}
                  <span className="text-slate-200">the timing active around you now</span>, and{" "}
                  <span className="text-slate-200">multiple predictive techniques weighed together</span>.{" "}
                  The goal is not to give you more astrology — it is to identify the
                  signal that matters most.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function PreparingPage() {
  return (
    <Suspense fallback={
      <div 
        className="h-screen bg-[#050816] flex items-center justify-center"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="h-2 w-2 animate-pulse rounded-full bg-teal-300" />
      </div>
    }>
      <PreparingPageInner />
    </Suspense>
  );
}