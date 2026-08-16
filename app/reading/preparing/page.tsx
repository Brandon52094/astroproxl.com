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
  "Tracing the activated house themes…",
  "Cross-referencing tropical and sidereal layers…",
  "Synthesizing progressions and solar arcs…",
  "Scanning for planetary station points…",
  "Finalizing your reading…",
];

// Additional error messages for specific scenarios
const ERROR_MESSAGES = {
  credits: "You don't have enough credits for a reading. Please purchase more or subscribe.",
  cooldown: "You're on cooldown. Please wait before starting a new reading.",
  generic: "Something went wrong. Please try again.",
  timeout: "The reading is taking longer than expected. Please try again.",
};

function PreparingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [messageIndex, setMessageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<"credits" | "cooldown" | "generic" | "timeout" | null>(null);
  const hasStarted = useRef(false);
  const shouldReduceMotion = useReducedMotion();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Handle payment cancellation
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

  // Rotate loading messages
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) =>
        prev < LOADING_MESSAGES.length - 1 ? prev + 1 : prev
      );
    }, 2300);
    return () => clearInterval(interval);
  }, []);

  // Generate the reading
  useEffect(() => {
    if (hasStarted.current) return;

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

        // Set a timeout to prevent infinite loading (60 seconds)
        timeoutRef.current = setTimeout(() => {
          setError(ERROR_MESSAGES.timeout);
          setErrorType("timeout");
        }, 60000);

        const response = await fetch("/api/readings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: intake.topic,
            question: intake.question,
            // REMOVED: timeframeType and timeframeValue - not used by API
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

        // Clear the timeout since we got a response
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        const data = await response.json();

        // Handle specific error codes
        if (!response.ok) {
          // Check for credit/cooldown errors from the API
          if (response.status === 403) {
            const errorMsg = data.error || ERROR_MESSAGES.generic;
            if (errorMsg.includes("cooldown")) {
              setError(ERROR_MESSAGES.cooldown);
              setErrorType("cooldown");
            } else if (errorMsg.includes("credits") || errorMsg.includes("purchase")) {
              setError(ERROR_MESSAGES.credits);
              setErrorType("credits");
            } else {
              setError(errorMsg);
              setErrorType("generic");
            }
            return;
          }

          // Handle other errors
          throw new Error(data.error ?? `Failed to generate reading (${response.status})`);
        }

        if (!data.reading) {
          throw new Error("No reading data received.");
        }

        // Check if this is a safe response (crisis detection triggered)
        if (data.isSafeResponse) {
          // The API returned a safe response instead of a real reading
          // We still save it as a reading but with a flag
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
          // Normal reading
          saveReading({
            id: data.reading.id,
            pages: data.reading.pages as ReadingPage[],
            topic: intake.topic,
            question: intake.question,
            generatedAt: new Date().toISOString(),
          });
        }

        // Redirect to results
        router.replace("/reading/results");
      } catch (err) {
        // Clear timeout on error
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        const errorMessage = err instanceof Error ? err.message : ERROR_MESSAGES.generic;
        setError(errorMessage);
        setErrorType("generic");
      }
    }

    generateReading();
  }, [router, searchParams]);

  // Handle retry
  const handleRetry = () => {
    setError(null);
    setErrorType(null);
    hasStarted.current = false;
    // Reset message index
    setMessageIndex(0);
    // Re-trigger the generation
    setTimeout(() => {
      hasStarted.current = true;
      // The effect will run again since hasStarted is false
    }, 100);
  };

  // Handle navigation based on error type
  const handleErrorAction = () => {
    if (errorType === "credits") {
      router.push("/pricing");
    } else if (errorType === "cooldown") {
      router.push("/dashboard");
    } else {
      router.push("/reading/intake");
    }
  };

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
                <h1 className="text-xl font-semibold text-white">
                  {errorType === "credits" ? "Credits Needed" :
                   errorType === "cooldown" ? "Cooling Down" :
                   "Something Went Wrong"}
                </h1>
                <p className="text-sm leading-6 text-slate-400">{error}</p>
              </div>
              <div className="flex flex-col gap-3">
                {errorType === "credits" && (
                  <button
                    onClick={handleErrorAction}
                    className="h-12 w-full rounded-2xl bg-amber-400 text-sm font-medium text-slate-950 transition hover:bg-amber-300"
                  >
                    View Pricing
                  </button>
                )}
                {errorType === "cooldown" && (
                  <button
                    onClick={handleErrorAction}
                    className="h-12 w-full rounded-2xl bg-slate-700 text-sm font-medium text-white transition hover:bg-slate-600"
                  >
                    Go to Dashboard
                  </button>
                )}
                {(errorType === "generic" || errorType === "timeout") && (
                  <>
                    <button
                      onClick={handleRetry}
                      className="h-12 w-full rounded-2xl bg-teal-300 text-sm font-medium text-slate-950 transition hover:bg-teal-200"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={() => router.push("/reading/intake")}
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 text-sm font-medium text-slate-300 transition hover:bg-white/10"
                    >
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