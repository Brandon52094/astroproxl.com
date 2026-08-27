"use client";

import React, { useEffect, useState, useRef, Suspense } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { loadChart, loadIntake, saveReading, isChartFresh } from "@/lib/chartStore";
import type { ReadingPage } from "@/lib/chartStore";

const LOADING_MESSAGES = [
  "Reading your natal placements…",
  "Mapping current transits to your chart…",
  "Calculating your profection year…",
  "Identifying your Time Lord…",
  "Tracing house rulers and themes…",
  "Checking mutual reception patterns…",
  "Mapping sensitive midpoint activations…",
  "Checking transits to your angles…",
  "Cross-referencing your solar return…",
  "Synthesizing progressions and solar arcs…",
  "Scanning planetary station points…",
  "Checking eclipse activations…",
  "Weighing the strongest timing signals…",
  "Finalizing your reading…",
];

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
        const chart = loadChart();
        const intake = loadIntake();

        if (!chart || !isChartFresh()) {
          router.push("/chart-data");
          return;
        }

        if (!intake) {
          router.push("/reading/intake");
          return;
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
          className="absolute left-1/2 top-[16%] h-[24rem] w-[24rem] -translate-x-1/2 rounded-full blur-3xl"
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
                <h1 className="text-xl font-semibold text-white">yikes</h1>
                <p className="text-sm leading-6 text-slate-400">{error}</p>
              </div>
              <button
                onClick={() => router.push("/reading/intake")}
                className="h-12 w-full rounded-2xl bg-teal-300 text-sm font-medium text-slate-950 transition hover:bg-teal-200"
              >
                Tap again
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-12"
            >
              <div className="relative mx-auto h-32 w-32">
                <motion.div
                  className="absolute inset-0 rounded-full bg-teal-400/20"
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  className="absolute inset-3 rounded-full bg-teal-400/30"
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                />
                <motion.div
                  className="absolute inset-6 rounded-full bg-teal-300/40"
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl">✦</span>
                </div>
              </div>

              <div className="space-y-3">
                <h1 className="text-2xl font-semibold tracking-tight text-white">
                  Reading the sky
                </h1>
                <p className="text-sm leading-6 text-slate-400">
                  Your chart is being traced from multiple angles. Only you can see this reading —
                  tap the download icon to keep it.
                </p>
              </div>

              <div className="h-6">
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

              <div className="flex items-center justify-center gap-2">
                {LOADING_MESSAGES.map((_, i) => (
                  <motion.div
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      i <= messageIndex ? "w-6 bg-teal-300" : "w-1.5 bg-white/10"
                    }`}
                  />
                ))}
              </div>

              {/* ── Progress Bar ── */}
              <div className="w-full">
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full bg-gradient-to-r from-teal-400 to-teal-300"
                    style={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  {progress < 95 ? `Reading ${progress}%` : "Finalizing..."}
                </p>
              </div>

              <div className="rounded-[20px] border border-white/10 bg-white/[0.03] px-5 py-4">
                <p className="text-xs leading-6 text-slate-400">
                  The sky does not repeat itself{" "}
                  <span className="text-slate-200">— this configuration is yours alone</span>,{" "}
                  read through <span className="text-slate-200">every layer your chart holds</span>,{" "}
                  weighed against <span className="text-slate-200">what is moving toward you now</span>.{" "}
                  What surfaces next may be quiet, or it may change how you see the next few weeks
                  — take note of the dates it gives.
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