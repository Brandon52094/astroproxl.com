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

const ERROR_MESSAGES = {
  credits: "You don't have enough credits for a reading. Please purchase more or subscribe.",
  cooldown: "You're on cooldown. Please wait before starting a new reading.",
  generic: "Something went wrong. Please try again.",
  timeout: "The reading is taking longer than expected. Please try again.",
  network: "Network error. Please check your connection and try again.",
};

function PreparingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [messageIndex, setMessageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<"credits" | "cooldown" | "generic" | "timeout" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0); // simple 0-100 for visual feedback

  const isMounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  // ── Handle payment cancellation ──
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

  // ── Rotate loading messages ──
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) =>
        prev < LOADING_MESSAGES.length - 1 ? prev + 1 : prev
      );
    }, 2300);
    return () => clearInterval(interval);
  }, []);

  // ── Start generation when component mounts ──
  useEffect(() => {
    if (generating) return; // prevent double-trigger

    const paymentStatus = searchParams.get("payment");
    if (paymentStatus === "cancelled") return;

    console.log("[Preparing] Starting reading generation...");
    setGenerating(true);

    async function generate() {
      try {
        // 1. Load chart and intake
        console.log("[Preparing] Loading chart data...");
        const chart = loadChart();
        const intake = loadIntake();

        if (!chart || !isChartFresh()) {
          console.warn("[Preparing] Chart missing or stale, redirecting to /chart-data");
          router.push("/chart-data");
          return;
        }

        if (!intake) {
          console.warn("[Preparing] Intake missing, redirecting to /reading/intake");
          router.push("/reading/intake");
          return;
        }

        console.log("[Preparing] Chart and intake loaded successfully.");

        // 2. Validate chart data
        if (!chart.chartData?.tropical?.planets?.length) {
          console.warn("[Preparing] Invalid chart data, redirecting to /chart-data");
          router.push("/chart-data");
          return;
        }

        // 3. Set up AbortController
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        // 4. Set timeout (60 seconds)
        console.log("[Preparing] Setting 60s timeout...");
        timeoutRef.current = setTimeout(() => {
          if (!isMounted.current) return;
          console.warn("[Preparing] Timeout reached (60s)");
          setError(ERROR_MESSAGES.timeout);
          setErrorType("timeout");
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
          }
        }, 60000);

        // 5. Start progress simulation (just for UI feedback)
        progressIntervalRef.current = setInterval(() => {
          setProgress((p) => (p < 95 ? p + 2 : p));
        }, 300);

        // 6. Make the API call
        console.log("[Preparing] Calling /api/readings...");
        const response = await fetch("/api/readings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            topic: intake.topic,
            question: intake.question,
            birthDate: chart.birthDate,
            birthTime: chart.birthTime,
            birthPlace: chart.birthPlace,
            tropical: chart.chartData.tropical,
            sidereal: chart.chartData.sidereal,
            transits: chart.chartData.transits,
            transitAspects: chart.chartData.transitAspects,
            profection: chart.chartData.profection,
            progressions: chart.chartData.progressions,
            solarArcs: chart.chartData.solarArcs,
            upcomingTrigger: chart.chartData.upcomingTrigger,
            planetaryStations: chart.chartData.planetaryStations,
            solarReturn: chart.chartData.solarReturn,
            moonPhase: chart.chartData.moonPhase,
            extendedPoints: chart.chartData.extendedPoints,
          }),
        });

        // Clear timeout and progress interval
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        setProgress(100);

        // Check if still mounted
        if (!isMounted.current) return;

        console.log("[Preparing] API response status:", response.status);

        const data = await response.json();

        // Handle non-OK responses
        if (!response.ok) {
          const errorMsg = data.error || data.message || ERROR_MESSAGES.generic;
          console.error("[Preparing] API error:", errorMsg);
          if (response.status === 403) {
            if (errorMsg.includes("cooldown")) {
              setError(ERROR_MESSAGES.cooldown);
              setErrorType("cooldown");
            } else if (errorMsg.includes("credit") || errorMsg.includes("purchase")) {
              setError(ERROR_MESSAGES.credits);
              setErrorType("credits");
            } else {
              setError(errorMsg);
              setErrorType("generic");
            }
          } else if (response.status === 502 || response.status === 504) {
            setError(ERROR_MESSAGES.timeout);
            setErrorType("timeout");
          } else {
            setError(errorMsg || ERROR_MESSAGES.generic);
            setErrorType("generic");
          }
          setGenerating(false);
          return;
        }

        if (!data.reading) {
          console.error("[Preparing] No reading data received");
          throw new Error("No reading data received.");
        }

        // 7. Save reading
        console.log("[Preparing] Saving reading...");
        try {
          if (data.isSafeResponse) {
            saveReading({
              id: data.reading.id,
              pages: data.reading.pages as ReadingPage[],
              topic: intake.topic,
              question: intake.question,
              generatedAt: new Date().toISOString(),
              isSafeResponse: true,
              riskLevel: data.riskLevel,
            });
          } else {
            saveReading({
              id: data.reading.id,
              pages: data.reading.pages as ReadingPage[],
              topic: intake.topic,
              question: intake.question,
              generatedAt: new Date().toISOString(),
            });
          }
        } catch (saveErr) {
          console.error("[Preparing] Failed to save reading:", saveErr);
          // Continue anyway
        }

        // 8. Navigate to results
        console.log("[Preparing] Reading saved, redirecting to /reading/results");
        if (isMounted.current) {
          router.replace("/reading/results");
        }
      } catch (err) {
        // Handle AbortError (timeout or unmount)
        if ((err as Error).name === "AbortError") {
          console.warn("[Preparing] Request aborted (timeout or unmount)");
          return;
        }

        console.error("[Preparing] Unexpected error:", err);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }

        if (isMounted.current) {
          if (err instanceof TypeError && err.message.includes("fetch")) {
            setError(ERROR_MESSAGES.network);
          } else {
            setError(err instanceof Error ? err.message : ERROR_MESSAGES.generic);
          }
          setErrorType("generic");
          setGenerating(false);
        }
      } finally {
        abortControllerRef.current = null;
        setGenerating(false);
      }
    }

    generate();
  }, [router, searchParams, generating]);

  // ── Handle retry ──
  const handleRetry = () => {
    console.log("[Preparing] Retry clicked");
    setError(null);
    setErrorType(null);
    setProgress(0);
    setMessageIndex(0);
    setGenerating(false); // this will re-trigger the effect
    // The effect will run again because generating becomes false, then true in the effect
    // Small delay to allow state to settle
    setTimeout(() => {
      setGenerating(true);
    }, 50);
  };

  // ── Navigation helpers ──
  const handleErrorAction = () => {
    if (errorType === "credits") {
      router.push("/pricing");
    } else if (errorType === "cooldown") {
      router.push("/dashboard");
    } else {
      router.push("/reading/intake");
    }
  };

  // ── Render ──
  return (
    <div className="relative h-screen bg-[#050816] text-slate-100 flex items-center justify-center overflow-hidden">
      {/* (Background / stars / gradient — same as before, omitted for brevity) */}

      <div className="relative z-10 mx-auto w-full max-w-md px-6 text-center">
        <AnimatePresence mode="wait">
          {error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-6"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-rose-300/20 bg-rose-500/10">
                <span className="text-2xl">✕</span>
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-semibold text-white">
                  {errorType === "credits" ? "Credits Needed" :
                   errorType === "cooldown" ? "Cooling Down" :
                   "Something Went Wrong"}
                </h1>
                <p className="text-sm leading-6 text-slate-400">{error}</p>
              </div>
              <div className="flex flex-col gap-3">
                {errorType === "credits" && (
                  <button onClick={handleErrorAction} className="h-12 w-full rounded-2xl bg-amber-400 text-sm font-medium text-slate-950">
                    View Pricing
                  </button>
                )}
                {errorType === "cooldown" && (
                  <button onClick={handleErrorAction} className="h-12 w-full rounded-2xl bg-slate-700 text-sm font-medium text-white">
                    Go to Dashboard
                  </button>
                )}
                {(errorType === "generic" || errorType === "timeout") && (
                  <>
                    <button onClick={handleRetry} className="h-12 w-full rounded-2xl bg-teal-300 text-sm font-medium text-slate-950">
                      Try Again
                    </button>
                    <button onClick={() => router.push("/reading/intake")} className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 text-sm font-medium text-slate-300">
                      Go Back
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-10"
            >
              {/* Loading spinner (same as before) */}
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
                <h1 className="text-2xl font-semibold tracking-tight text-white">Reading the sky</h1>
                <p className="text-sm leading-6 text-slate-400">
                  Your chart is being traced from multiple angles. Only you can see this reading.
                </p>
              </div>

              {/* Simple progress bar (optional) */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-teal-300 transition-all duration-500" style={{ width: `${progress}%` }} />
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
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      i <= messageIndex ? "w-6 bg-teal-300" : "w-1.5 bg-white/10"
                    }`}
                  />
                ))}
              </div>

              <div className="rounded-[20px] border border-white/10 bg-white/[0.03] px-5 py-4">
                <p className="text-xs leading-6 text-slate-400">
                  The sky does not repeat itself{" "}
                  <span className="text-slate-200">— this configuration is yours alone</span>.
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
    <Suspense fallback={<div className="h-screen bg-[#050816] flex items-center justify-center"><div className="h-2 w-2 animate-pulse rounded-full bg-teal-300" /></div>}>
      <PreparingPageInner />
    </Suspense>
  );
}