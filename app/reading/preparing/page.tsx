"use client";

import React, { useEffect, useState, useRef, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { loadChart, loadIntake, saveReading, isChartFresh } from "@/lib/chartStore";
import type { ReadingPage } from "@/lib/chartStore";

const LOADING_MESSAGES = [
  "Reading your natal placements…",
  "Mapping current transits to your chart…",
  "Calculating your profection year…",
  "Identifying your Time Lord…",
  "Tracing the activated house themes…",
  "Cross-referencing tropical and sidereal layers…",
  "Synthesizing progressions and solar arcs…",
  "Scanning for planetary station points…",
  "Finalizing your reading…",
];

function PreparingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [messageIndex, setMessageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const hasStarted = useRef(false);

  useEffect(() => {
    // Fix 1 — if user cancelled Stripe, send them back to intake immediately
    // This closes the bypass where they could exit Stripe and get a free reading
    const paymentStatus = searchParams.get("payment");
    if (paymentStatus === "cancelled") {
      router.replace("/reading/intake");
      return;
    }

    // Clean up any other payment params from the URL
    if (searchParams.get("payment")) {
      window.history.replaceState({}, "", "/reading/preparing");
    }
  }, [searchParams, router]);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) =>
        prev < LOADING_MESSAGES.length - 1 ? prev + 1 : prev
      );
    }, 2300);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (hasStarted.current) return;

    // Don't start generating if payment was cancelled
    const paymentStatus = searchParams.get("payment");
    if (paymentStatus === "cancelled") return;

    hasStarted.current = true;

    async function generateReading() {
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
            topic: intake.topic,
            question: intake.question,
            timeframeType: intake.timeframeType,
            timeframeValue: intake.timeframeValue,
            birthDate: chart.birthDate,
            birthTime: chart.birthTime,
            birthPlace: chart.birthPlace,
            tropical: chart.chartData.tropical,
            sidereal: chart.chartData.sidereal,
            transits: chart.chartData.transits,
            profection: chart.chartData.profection,
            progressions: chart.chartData.progressions,
            solarArcs: chart.chartData.solarArcs,
            upcomingTrigger: chart.chartData.upcomingTrigger,
            planetaryStations: chart.chartData.planetaryStations,
            solarReturn: chart.chartData.solarReturn,
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.reading) {
          throw new Error(data.error ?? "Failed to generate reading.");
        }

        saveReading({
          id: data.reading.id,
          pages: data.reading.pages as ReadingPage[],
          topic: intake.topic,
          question: intake.question,
          generatedAt: new Date().toISOString(),
        });

        // Fix 2 — replace instead of push so preparing never appears in history
        // This prevents the back button on results from re-triggering the AI
        router.replace("/reading/results");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong. Please try again."
        );
      }
    }

    generateReading();
  }, [router, searchParams]);

  return (
    <div className="h-screen bg-[#050816] text-slate-100 flex items-center justify-center overflow-hidden">
      <div className="mx-auto w-full max-w-md px-6 text-center">
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
                  Preparing .....
                </h1>
                <p className="text-sm leading-6 text-slate-400">
                  Your chart is being analyzed in mulitple ways. Only you can see this information. 
                  Tap the Download icon to save your reading
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

              <div className="rounded-[20px] border border-white/10 bg-white/[0.03] px-5 py-4">
                <p className="text-xs leading-6 text-slate-400">
                  A lot is being caculated{" "}
                  <span className="text-slate-200">from every angle possible</span>,{" "}
                  <span className="text-slate-200"> and every way imaginable </span>,{" "}
                  <span className="text-slate-200"> still, your authentic action is needed </span>, or {" "}
                  <span className="text-slate-200"></span>{" "}
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
      <div className="h-screen bg-[#050816] flex items-center justify-center">
        <div className="h-2 w-2 animate-pulse rounded-full bg-teal-300" />
      </div>
    }>
      <PreparingPageInner />
    </Suspense>
  );
}