"use client";

import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { loadChart, loadIntake, saveReading, isChartFresh } from "@/lib/chartStore";
import type { ReadingPage } from "@/lib/chartStore";

// ─── Loading messages that cycle while generating ─────────────────────────────

const LOADING_MESSAGES = [
  "Reading your natal placements…",
  "Mapping current transits to your chart…",
  "Calculating your profection year…",
  "Identifying your Time Lord…",
  "Tracing the activated house themes…",
  "Cross-referencing tropical and sidereal layers…",
  "Synthesizing your prediction…",
  "Finalizing your reading…",
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function PreparingPage() {
  const router = useRouter();
  const [messageIndex, setMessageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const hasStarted = useRef(false);

  // Cycle through loading messages every 2.8s
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) =>
        prev < LOADING_MESSAGES.length - 1 ? prev + 1 : prev
      );
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  // Generate the reading once on mount
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    async function generateReading() {
      try {
        // Load stored data
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

        // Call the readings API with full chart + intake context
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
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.reading) {
          throw new Error(data.error ?? "Failed to generate reading.");
        }

        // Save generated reading to localStorage
        saveReading({
          id: data.reading.id,
          pages: data.reading.pages as ReadingPage[],
          topic: intake.topic,
          question: intake.question,
          generatedAt: new Date().toISOString(),
        });

        // Navigate to results
        router.push("/reading/results");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again."
        );
      }
    }

    generateReading();
  }, [router]);

  return (
    <div className="min-h-screen bg-[#050816] text-slate-100 flex items-center justify-center">
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
                <h1 className="text-xl font-semibold text-white">
                  Something went wrong
                </h1>
                <p className="text-sm leading-6 text-slate-400">{error}</p>
              </div>
              <button
                onClick={() => router.push("/reading/intake")}
                className="h-12 w-full rounded-2xl bg-teal-300 text-sm font-medium text-slate-950 transition hover:bg-teal-200"
              >
                Try Again
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
              {/* Animated orb */}
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

              {/* Title */}
              <div className="space-y-3">
                <h1 className="text-2xl font-semibold tracking-tight text-white">
                  Preparing your reading
                </h1>
                <p className="text-sm leading-6 text-slate-400">
                  Your chart is being analyzed using your natal placements,
                  current transits, and annual timing patterns.
                </p>
              </div>

              {/* Cycling message */}
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

              {/* Progress dots */}
              <div className="flex items-center justify-center gap-2">
                {LOADING_MESSAGES.map((_, i) => (
                  <motion.div
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      i <= messageIndex
                        ? "w-6 bg-teal-300"
                        : "w-1.5 bg-white/10"
                    }`}
                  />
                ))}
              </div>

              {/* Value-building statement */}
              <div className="rounded-[20px] border border-white/10 bg-white/[0.03] px-5 py-4">
                <p className="text-xs leading-6 text-slate-400">
                  Your reading combines{" "}
                  <span className="text-slate-200">tropical psychology</span>,{" "}
                  <span className="text-slate-200">sidereal timing</span>, and{" "}
                  <span className="text-slate-200">annual profection cycles</span>{" "}
                  — a level of depth most apps don't offer.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
