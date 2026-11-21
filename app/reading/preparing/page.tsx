"use client";

import React, { useEffect, useState, useRef, Suspense } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { loadChart, loadIntake, saveReading, saveChart, isChartFresh, isSkyFresh } from "@/lib/chartStore";
import type { ReadingPage, StoredChart } from "@/lib/chartStore";

// Rotating line under the heading. Each line names a real technique or what the
// user gets — never how the engine weighs things internally.
const LOADING_MESSAGES = [
  "Mapping your natal chart — the exact sky you were born under, down to the degree and the house.",
  "Locating your profection year and Time Lord, the planet steering this chapter of your life.",
  "Measuring today’s transits against your chart to see which planets are pressing on you right now.",
  "Advancing your progressions and solar arcs to reveal how you’ve been quietly evolving.",
  "Checking planetary stations and eclipse points — the moments when the sky turns up the volume.",
  "Tracing the house rulers behind your question to the parts of life it truly touches.",
  "Finding the strongest signal in your chart — the one development that matters most right now.",
  "Pinpointing the dates when this is most likely to surface in your life.",
  "Writing your reading in clear, personal language, so every insight lands.",
];

// ~9.5s per line × 9 lines ≈ 86s, close to the typical reading time. The last
// line holds if a reading runs long.
const MESSAGE_INTERVAL_MS = 9500;

// ─────────────────────────────────────────────────────────────────────────────
// Reading themes — the same colors as the reading tiles and the gold mic on the
// intake screen. Values are "r,g,b" so they can be used at any opacity.
//   c — main color (glow, orb rings)
//   l — light color (inner ring, labels, button, symbols)
// ─────────────────────────────────────────────────────────────────────────────
type ThemeKey = "love" | "money" | "career" | "other" | "ask" | "default";

const THEMES: Record<ThemeKey, { c: string; l: string; label: string }> = {
  love:    { c: "251,113,133", l: "253,164,175", label: "Love Reading" },
  money:   { c: "52,211,153",  l: "134,239,172", label: "Money Reading" },
  career:  { c: "59,130,246",  l: "147,197,253", label: "Career Reading" },
  other:   { c: "139,92,246",  l: "196,181,253", label: "What’s Coming" },
  ask:     { c: "218,183,104", l: "255,239,195", label: "Ask Anything" },
  default: { c: "45,212,191",  l: "94,234,212",  label: "Your Reading" },
};

/**
 * The intake saves `area` as the tile id ("love" | "money" | "career" | "other")
 * or "ask-anything". `topic` is the engine topic, where What's Coming is
 * "general" — so read `area` first and fall back to `topic`.
 */
function resolveThemeKey(intake: unknown): ThemeKey {
  const rec = (intake ?? {}) as { area?: unknown; topic?: unknown };
  const pick = (v: unknown): ThemeKey | null => {
    if (typeof v !== "string") return null;
    switch (v.trim().toLowerCase()) {
      case "love": return "love";
      case "money": return "money";
      case "career": return "career";
      case "other":
      case "general": return "other";
      case "ask-anything": return "ask";
      default: return null;
    }
  };
  return pick(rec.area) ?? pick(rec.topic) ?? "default";
}

// Small themed symbols that twinkle with the stars. 24×24 paths.
const SYMBOL_PATHS: Record<Exclude<ThemeKey, "default">, { d: string; stroke?: boolean }> = {
  love:   { d: "M12 21s-7.5-4.6-9.6-9.1C1 8.8 2.9 5 6.6 5c2.1 0 3.6 1.2 4.4 2.5.8-1.3 2.3-2.5 4.4-2.5 3.7 0 5.6 3.8 4.2 6.9C19.5 16.4 12 21 12 21z" },
  money:  { d: "M12 2.5v19M16.5 7.3c0-1.9-2-3-4.5-3s-4.5 1.2-4.5 3.3c0 4.6 9 2.6 9 7.4 0 2-2 3.3-4.5 3.3s-4.5-1.2-4.5-3.1", stroke: true },
  career: { d: "M3 17l6-6 4 4 8-8M15 7h6v6", stroke: true },
  other:  { d: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" },
  ask:    { d: "M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" },
};

// [left %, top %, size px, rotation deg] — kept toward the edges, behind the content.
const SYMBOL_SPOTS: Array<[number, number, number, number]> = [
  [9, 11, 14, -12], [87, 8, 11, 10], [20, 29, 10, 8], [91, 36, 13, -8], [6, 56, 12, 6],
  [82, 61, 10, -14], [15, 80, 13, 12], [72, 87, 11, -6], [94, 76, 9, 4],
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
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);
  const [themeKey, setThemeKey] = useState<ThemeKey>("default");
  const [estimatedDuration, setEstimatedDuration] = useState<number>(88000); // ~88s baseline
  const hasStarted = useRef(false);
  const shouldReduceMotion = useReducedMotion();
  const theme = THEMES[themeKey];
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

  // ── 0. Pick the theme, then fade in from the intake screen's black ──
  useEffect(() => {
    try {
      setThemeKey(resolveThemeKey(loadIntake()));
    } catch {
      // Keep the default theme
    }
    const frame = window.requestAnimationFrame(() => setHasEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

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

  // ── 2. Smooth progress runner ──
  useEffect(() => {
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const percentage = Math.min(Math.floor((elapsed / estimatedDuration) * 95), 95);
      setProgress(percentage);
    }, 250);

    return () => clearInterval(progressInterval);
  }, [estimatedDuration]);

  // ── 3. Rotating line under the heading ──
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) =>
        prev < LOADING_MESSAGES.length - 1 ? prev + 1 : prev
      );
    }, MESSAGE_INTERVAL_MS);

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

        // Keep time-sensitive chart layers fresh for BOTH regular readings and Ask Anything.
        if (!isSkyFresh()) {
          chart = await refreshSky(chart);
        }

        // All reading topics, including Ask Anything, use the shared reading engine.
        // getTopic("ask-anything") resolves to the open-context Ask Anything config.
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

        // Let the completed state land, then ease the content out and the
        // screen down to black before handing off to results.
        setTimeout(() => {
          setIsFadingOut(true);
          setTimeout(() => {
            router.replace("/reading/results");
          }, shouldReduceMotion ? 160 : 1200);
        }, shouldReduceMotion ? 80 : 320);

      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong. Please try again."
        );
      }
    }

    generateReading();
  }, [router, searchParams, shouldReduceMotion]);

  const symbol = themeKey === "default" ? null : SYMBOL_PATHS[themeKey];

  return (
    <div
      className="prep relative h-screen bg-[#050816] text-slate-100 flex items-center justify-center overflow-hidden"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        touchAction: "manipulation",
        WebkitOverflowScrolling: "touch",
        "--c": `rgb(${theme.c})`,
        "--l": `rgb(${theme.l})`,
      } as React.CSSProperties}
    >
      <style jsx>{`
        /* Typefaces come from layout.tsx (same as the intake screen). */
        .prep {
          --display: var(--font-display), "Cormorant Garamond", Georgia, serif;
          --caps: var(--font-caps), Cinzel, Georgia, serif;
        }

        .wash {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 50% 18%, color-mix(in srgb, var(--c) 12%, transparent), transparent 34%),
            radial-gradient(circle at 85% 82%, color-mix(in srgb, var(--l) 7%, transparent), transparent 28%),
            linear-gradient(180deg, #061120 0%, #050816 44%, #040611 100%);
        }

        /* Themed symbols — twinkle like the stars, subtle unless you look */
        .sym {
          position: absolute;
          color: var(--l);
          opacity: var(--o1);
          transform: translate(-50%, -50%) rotate(var(--r));
          animation: symTwinkle ease-in-out infinite;
        }
        .sym svg { display: block; width: 100%; height: 100%; overflow: visible; }
        @keyframes symTwinkle {
          0%, 100% { opacity: var(--o1); transform: translate(-50%, -50%) rotate(var(--r)) scale(1); }
          50% { opacity: var(--o2); transform: translate(-50%, -50%) rotate(var(--r)) scale(1.15); }
        }

        .eyebrow {
          margin: 0 0 14px;
          font-family: var(--caps);
          font-size: 10.5px;
          font-weight: 500;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: color-mix(in srgb, var(--l) 85%, transparent);
        }
        .title {
          margin: 0;
          font-family: var(--display);
          font-size: 34px;
          font-weight: 400;
          line-height: 1.1;
          letter-spacing: 0.005em;
          color: #fff;
        }
        .rotator {
          margin: 14px auto 0;
          max-width: 22rem;
          min-height: 69px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .rotator-line {
          margin: 0;
          font-size: 13.5px;
          font-weight: 300;
          line-height: 23px;
          letter-spacing: 0.01em;
          color: #94a3b8;
        }
        .orb-number {
          font-family: var(--display);
          font-size: 52px;
          font-weight: 300;
          line-height: 1;
          font-variant-numeric: lining-nums tabular-nums;
          color: #fff;
        }

        /* Ask Anything: the mic button's orbiting gold/pearl edge + breathing aura */
        @property --voice-angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
        @keyframes voiceOrbit { to { --voice-angle: 360deg; } }
        @keyframes voiceBreathe { 0%, 100% { opacity: 0.28; } 50% { opacity: 0.46; } }
        .gold-ring,
        .gold-aura {
          position: absolute;
          border-radius: 9999px;
          pointer-events: none;
          background: conic-gradient(
            from var(--voice-angle),
            rgba(255,255,255,0.94),
            rgba(255,255,255,0.6) 54deg,
            rgba(218,183,104,0.88) 112deg,
            rgba(255,239,195,0.82) 172deg,
            rgba(255,255,255,0.96) 226deg,
            rgba(193,151,67,0.86) 296deg,
            rgba(255,255,255,0.94)
          );
          animation: voiceOrbit 8s linear infinite;
        }
        .gold-ring {
          inset: -14px;
          padding: 1.25px;
          opacity: 0.9;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          filter: drop-shadow(0 0 6px rgba(218,183,104,0.4));
        }
        .gold-aura {
          inset: -22px;
          filter: blur(18px);
          animation: voiceOrbit 8s linear infinite, voiceBreathe 4.5s ease-in-out infinite;
        }

        .card-tag {
          margin: 12px 0 0;
          font-family: var(--display);
          font-size: 18px;
          line-height: 22px;
          color: #fff;
        }
        .card-enjoy {
          margin: 2px 0 0;
          font-size: 11.5px;
          color: color-mix(in srgb, var(--l) 80%, transparent);
        }

        .err-title {
          font-family: var(--display);
          font-size: 28px;
          font-weight: 400;
          line-height: 1.15;
        }

        @media (prefers-reduced-motion: reduce) {
          .sym, .gold-ring, .gold-aura { animation: none; }
          .gold-aura { opacity: 0.36; }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0">
        <div className="wash" />

        <motion.div
          className="absolute left-1/2 top-[42%] h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          animate={
            shouldReduceMotion
              ? undefined
              : { opacity: [0.14, 0.26, 0.14], scale: [1, 1.05, 1] }
          }
          transition={
            shouldReduceMotion
              ? undefined
              : { duration: 8, repeat: Infinity, ease: "easeInOut" }
          }
          style={{
            background: `radial-gradient(circle, rgba(${theme.c},0.28), transparent 70%)`,
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
                    opacity: [star.opacity * 0.4, Math.min(1, star.opacity * 1.6), star.opacity * 0.4],
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

        {symbol &&
          SYMBOL_SPOTS.map(([left, top, size, rotate], j) => {
            const lo = 0.1 + (j % 3) * 0.03;
            return (
              <span
                key={`${themeKey}-${j}`}
                className="sym"
                aria-hidden="true"
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: size,
                  height: size,
                  "--r": `${rotate}deg`,
                  "--o1": lo,
                  "--o2": lo + 0.26,
                  animationDuration: `${3.4 + (j % 4) * 0.8}s`,
                  animationDelay: `${(j * 0.9) % 4}s`,
                } as React.CSSProperties}
              >
                <svg viewBox="0 0 24 24">
                  {symbol.stroke ? (
                    <path d={symbol.d} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                  ) : (
                    <path d={symbol.d} fill="currentColor" />
                  )}
                </svg>
              </span>
            );
          })}
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
                <h1 className="err-title text-white">
                  Something interrupted the reading
                </h1>
                <p className="text-sm leading-6 text-slate-400">
                  {error}
                </p>
              </div>
              <button
                onClick={() => router.push("/reading/intake")}
                className="h-12 w-full rounded-2xl text-sm font-medium text-slate-950 transition hover:brightness-110"
                style={{ backgroundColor: `rgb(${theme.l})` }}
              >
                Try again
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 18 }}
              animate={
                isFadingOut
                  ? { opacity: 0, y: -6, scale: 0.98 }
                  : { opacity: 1, y: 0, scale: 1 }
              }
              transition={
                isFadingOut
                  ? { duration: shouldReduceMotion ? 0.1 : 0.6, ease: [0.4, 0, 0.2, 1] }
                  : { duration: 0.6, delay: shouldReduceMotion ? 0 : 0.15 }
              }
              className="flex flex-col items-center"
            >
              {/* Eyebrow + heading + rotating line */}
              <p className="eyebrow">AstroProXL · {theme.label}</p>
              <h1 className="title">Calculating Your Reading</h1>
              <div className="rotator" aria-live="polite">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={messageIndex}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.4 }}
                    className="rotator-line"
                  >
                    {LOADING_MESSAGES[messageIndex]}
                  </motion.p>
                </AnimatePresence>
              </div>

              {/* Orb with live number */}
              <div className="relative mx-auto my-14 h-36 w-36">
                {themeKey === "ask" && (
                  <>
                    <span className="gold-aura" aria-hidden="true" />
                    <span className="gold-ring" aria-hidden="true" />
                  </>
                )}
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ backgroundColor: `rgba(${theme.c},0.2)` }}
                  animate={{ scale: [1, 1.12, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  className="absolute inset-[0.85rem] rounded-full"
                  style={{ backgroundColor: `rgba(${theme.c},0.3)` }}
                  animate={{ scale: [1, 1.12, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                />
                <motion.div
                  className="absolute inset-[1.7rem] rounded-full"
                  style={{ backgroundColor: `rgba(${theme.l},0.4)` }}
                  animate={{ scale: [1, 1.12, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="orb-number">
                    {progress < 95 ? progress : "…"}
                  </span>
                </div>
              </div>

              {/* Info card */}
              <div className="w-full rounded-[20px] border border-white/10 bg-white/[0.03] px-5 py-4">
                <p className="text-xs font-light leading-[22px] tracking-[0.01em] text-slate-400">
                  Most readings are general, copy-and-paste, and basic.{" "}
                  <span className="text-slate-200">AstroProXL is deeply personal.</span>{" "}
                  It reads your chart from every major angle and merges it with the
                  current transits to deliver calculated predictions.
                </p>
                <p className="card-tag">
                  The Astrology Engine, in your <em>pocket</em>.
                </p>
                <p className="card-enjoy">Please enjoy your reading!</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Black layer: fades out on arrival (matching the intake's fade to black),
          and back in once the reading is ready, a beat after the content eases out. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[100] bg-black"
        initial={{ opacity: 1 }}
        animate={{ opacity: isFadingOut || !hasEntered ? 1 : 0 }}
        transition={
          isFadingOut
            ? { duration: shouldReduceMotion ? 0.14 : 1.0, delay: shouldReduceMotion ? 0 : 0.15, ease: [0.65, 0, 0.35, 1] }
            : { duration: shouldReduceMotion ? 0.12 : 0.7, ease: [0.22, 1, 0.36, 1] }
        }
      />
    </div>
  );
}

export default function PreparingPage() {
  return (
    // Plain black so the handoff from the intake's fade-to-black stays seamless.
    <Suspense fallback={<div className="h-screen bg-black" />}>
      <PreparingPageInner />
    </Suspense>
  );
}