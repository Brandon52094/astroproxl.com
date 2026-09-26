"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Compass, Crown, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadChart } from "@/lib/chartStore";
import {
  PLANET_MEANING,
  SIGN_MEANING,
  HOUSE_MEANING,
} from "@/lib/chartMeanings";

/**
 * YOUR BIRTH CHART — sibling panel to Today's Sky.
 *
 * Where Today's Sky is present-tense ("what's the sky doing now"), this
 * panel is timeless ("who you are"): the Big 3 elementally outlined as
 * the hero, an element-balance strip, the profection YEAR (the sign/house
 * theme coloring your current year — Time Lord stays on Today's Sky), and
 * the full placement list.
 *
 * Shares Today's Sky's visual language exactly — same starfield, same card
 * chrome, same elemental colors and shine — so the two read as brother and
 * sister. This panel has NO overflow of its own; PagerContainer's wrapper
 * scrolls it.
 */
interface UserStatus {
  credits: number;
  isSubscribed: boolean;
  readingsCompleted: number;
  onCooldown: boolean;
  cooldownExpiresAt: string | null;
  canBypass: boolean;
}

interface BirthChartPanelProps {
  userStatus: UserStatus | null;
  dailyHoroscope?: string | null;
  onOpenHoroscope?: () => Promise<string | null | void> | string | null | void;
  onOpenReadings?: () => void;
  onOpenUpgradeChart?: () => void;
}

interface NatalPlacement {
  name: string;
  sign: string;
  degree: string;
  house?: number;
}

interface NatalAspect {
  type: string;
  planetA: string;
  planetB: string;
  orbDegrees: number;
}

interface ProfectionData {
  profectionYear: number;
  age: number;
  activatedSign: string;
  activatedHouse?: number;
  timeLord: string;
}

// U+FE0E forces text presentation so iOS never swaps these for emoji.
const T = "\uFE0E";
const GLYPHS: Record<string, string> = {
  Sun: `☉${T}`, Moon: `☽${T}`, Mercury: `☿${T}`, Venus: `♀${T}`, Mars: `♂${T}`,
  Jupiter: `♃${T}`, Saturn: `♄${T}`, Uranus: `♅${T}`, Neptune: `♆${T}`,
  Pluto: `♇${T}`, "North Node": `☊${T}`, "South Node": `☋${T}`,
  Ascendant: `↑${T}`,
};

// Aspect sections, ordered most-harmonious → most-tense.
// rank sets display order; color fades green → amber → dark red.
const ASPECT_META: Record<
  string,
  { header: string; rank: number; text: string; border: string; glow: string }
> = {
  trine:       { header: "Harmony",     rank: 1, text: "#6EE7B7", border: "rgba(52,211,153,0.55)",  glow: "rgba(16,185,129,0.20)" },
  sextile:     { header: "Opportunity", rank: 2, text: "#A7F3D0", border: "rgba(110,231,183,0.45)", glow: "rgba(16,185,129,0.14)" },
  conjunction: { header: "Intensity",   rank: 3, text: "#FCD34D", border: "rgba(251,191,36,0.45)",  glow: "rgba(245,158,11,0.16)" },
  square:      { header: "Challenge",   rank: 4, text: "#FDBA74", border: "rgba(249,115,22,0.50)",  glow: "rgba(249,115,22,0.18)" },
  opposition:  { header: "Tension",     rank: 5, text: "#F87171", border: "rgba(239,68,68,0.50)",   glow: "rgba(239,68,68,0.20)" },
};

const NATAL_ORDER = ["Sun", "Moon", "Ascendant", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];

/* ── The four elements ─────────────────────────────────────────────── */
type Element = "Fire" | "Earth" | "Air" | "Water";

const SIGN_ELEMENTS: Record<string, Element> = {
  Aries: "Fire", Leo: "Fire", Sagittarius: "Fire",
  Taurus: "Earth", Virgo: "Earth", Capricorn: "Earth",
  Gemini: "Air", Libra: "Air", Aquarius: "Air",
  Cancer: "Water", Scorpio: "Water", Pisces: "Water",
};

const ELEMENT_COLORS: Record<Element, { border: string; glow: string; text: string; bar: string }> = {
  Fire:  { border: "rgba(249, 115, 22, 0.75)", glow: "rgba(239, 68, 68, 0.28)",  text: "#FDBA74", bar: "#F97316" },
  Earth: { border: "rgba(52, 211, 153, 0.65)", glow: "rgba(16, 185, 129, 0.24)", text: "#6EE7B7", bar: "#34D399" },
  Air:   { border: "rgba(186, 230, 253, 0.60)", glow: "rgba(125, 211, 252, 0.22)", text: "#BAE6FD", bar: "#7DD3FC" },
  Water: { border: "rgba(96, 165, 250, 0.70)",  glow: "rgba(59, 130, 246, 0.26)",  text: "#93C5FD", bar: "#60A5FA" },
};

const ELEMENT_ORDER: Element[] = ["Fire", "Earth", "Air", "Water"];

function elementOf(sign?: string): Element | null {
  if (!sign) return null;
  return SIGN_ELEMENTS[sign] ?? null;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

type ChartViewMode = "birthchart" | "aspects";
type SharedScrollClock = {
  initialized: boolean;
  offsetMs: number;
  startedAt: number;
};

const SHARED_SCROLL_CLOCKS: Record<ChartViewMode, SharedScrollClock> = {
  birthchart: { initialized: false, offsetMs: 0, startedAt: 0 },
  aspects: { initialized: false, offsetMs: 0, startedAt: 0 },
};

function getSharedScrollTime(mode: ChartViewMode, durationMs: number): number {
  if (durationMs <= 0) return 0;
  const clock = SHARED_SCROLL_CLOCKS[mode];
  const now = Date.now();

  if (!clock.initialized) {
    clock.initialized = true;
    clock.offsetMs = 0;
    clock.startedAt = now;
    return 0;
  }

  return (clock.offsetMs + (now - clock.startedAt)) % durationMs;
}

function setSharedScrollTime(mode: ChartViewMode, currentTimeMs: number, durationMs: number) {
  const clock = SHARED_SCROLL_CLOCKS[mode];
  clock.initialized = true;
  clock.offsetMs = durationMs > 0 ? ((currentTimeMs % durationMs) + durationMs) % durationMs : 0;
  clock.startedAt = Date.now();
}

function localDayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/* ── Card chrome — identical to Today's Sky ────────────────────────── */
function SkyCard({
  icon: Icon,
  label,
  className,
  children,
}: {
  icon: React.ElementType;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "standard-shadow rounded-[24px] border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm",
        className
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-slate-400" strokeWidth={2.2} />
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

/* ── Panel ──────────────────────────────────────────────────────────── */
export default function BirthChartPanel({
  userStatus,
  dailyHoroscope: dailyHoroscopeProp,
  onOpenHoroscope,
  onOpenReadings,
  onOpenUpgradeChart,
}: BirthChartPanelProps) {
  const shouldReduceMotion = useReducedMotion();
  const [natal, setNatal] = useState<NatalPlacement[]>([]);
  const [aspects, setAspects] = useState<NatalAspect[]>([]);
  const [openPlacement, setOpenPlacement] = useState<string | null>(null);
  const [chartOpen, setChartOpen] = useState(false);
  const [chartView, setChartView] = useState<ChartViewMode>("birthchart");
  const [contextMode, setContextMode] = useState<0 | 1 | 2>(0);
  const [selectedContext, setSelectedContext] = useState<
    | { kind: "placement"; planetName: string }
    | { kind: "aspect"; aspect: NatalAspect }
    | null
  >(null);
  const [profection, setProfection] = useState<ProfectionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dailyHoroscope, setDailyHoroscope] = useState<string | null>(null);
  const [horoscopeLoading, setHoroscopeLoading] = useState(false);
  const [horoscopeError, setHoroscopeError] = useState<string | null>(null);
  const [chartPaused, setChartPaused] = useState(false);
  const chartTrackRef = useRef<HTMLDivElement | null>(null);
  const chartDragRef = useRef({
    pointerId: null as number | null,
    startY: 0,
    startTime: 0,
  });

  useEffect(() => {
    const storageKey = `astroproxl:daily-horoscope:${localDayKey()}`;
    const cached = window.localStorage.getItem(storageKey);
    if (cached) setDailyHoroscope(cached);
  }, []);

  useEffect(() => {
    const horoscope = dailyHoroscopeProp?.trim();
    if (!horoscope) return;
    setDailyHoroscope(horoscope);
    window.localStorage.setItem(`astroproxl:daily-horoscope:${localDayKey()}`, horoscope);
  }, [dailyHoroscopeProp]);

  const revealDailyHoroscope = async () => {
    if (dailyHoroscope || horoscopeLoading) return;
    setHoroscopeLoading(true);
    setHoroscopeError(null);
    try {
      let result: string | null | void;
      if (onOpenHoroscope) {
        result = await onOpenHoroscope();
      } else {
        const chart = loadChart();
        const chartData = chart?.chartData as unknown as {
          tropical?: { planets?: unknown[] };
          transits?: unknown[];
          transitAspects?: unknown[];
          profection?: unknown;
          moonPhase?: unknown;
        } | undefined;
        if (!chartData?.tropical?.planets?.length) {
          throw new Error("Your chart is still loading. Please try again.");
        }
        const response = await fetch("/api/daily-horoscope", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            localDate: localDayKey(),
            tropicalPlanets: chartData.tropical.planets,
            currentTransits: chartData.transits ?? [],
            transitAspects: chartData.transitAspects ?? [],
            profection: chartData.profection ?? null,
            moonPhase: chartData.moonPhase ?? null,
          }),
        });
        const payload = await response.json().catch(() => null) as {
          horoscope?: string;
          error?: string;
        } | null;
        if (!response.ok) {
          throw new Error(payload?.error || "Today’s horoscope could not be prepared.");
        }
        result = payload?.horoscope ?? null;
      }
      if (typeof result === "string" && result.trim()) {
        const horoscope = result.trim();
        setDailyHoroscope(horoscope);
        window.localStorage.setItem(`astroproxl:daily-horoscope:${localDayKey()}`, horoscope);
      } else if (!onOpenHoroscope) {
        throw new Error("Today’s horoscope returned without a message. Please try again.");
      }
    } catch (error) {
      setHoroscopeError(error instanceof Error ? error.message : "Today’s horoscope could not be prepared.");
    } finally {
      setHoroscopeLoading(false);
    }
  };

  const advanceContextCard = () => {
    if (selectedContext) {
      setSelectedContext(null);
      setContextMode(0);
      return;
    }

    const next = ((contextMode + 1) % 3) as 0 | 1 | 2;
    setContextMode(next);

    if (next === 1 && !dailyHoroscope && !horoscopeLoading) {
      void revealDailyHoroscope();
    }
  };

  useEffect(() => {
    let cancelled = false;
    const tryLoad = () => {
      const chart = loadChart();
      if (!chart?.chartData) return false; // not ready yet
      const data = chart.chartData as unknown as {
        profection?: ProfectionData;
        tropical?: { planets?: NatalPlacement[]; aspects?: NatalAspect[] };
      };
      if (data.profection) setProfection(data.profection);
      const planets = data.tropical?.planets ?? [];
      setNatal(
        planets
          .filter((p) => NATAL_ORDER.includes(p.name))
          .sort((a, b) => NATAL_ORDER.indexOf(a.name) - NATAL_ORDER.indexOf(b.name))
      );
      // Major aspects only — the five your engine computes
      setAspects(data.tropical?.aspects ?? []);
      setIsLoading(false);
      return true; // loaded
    };
    if (tryLoad()) return;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (cancelled || tryLoad() || attempts > 20) {
        clearInterval(interval);
        if (attempts > 20) setIsLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const bigThree = useMemo(() => {
    const find = (n: string) => natal.find((p) => p.name === n);
    return { sun: find("Sun"), moon: find("Moon"), rising: find("Ascendant") };
  }, [natal]);

  const rotatingNatal = useMemo(
    () => (natal.length ? [...natal, ...natal] : []),
    [natal]
  );

  const STRONG_ORB = 4;

  const orderedAspects = useMemo(() => {
    const typeRank = (type?: string) => ASPECT_META[type?.toLowerCase() ?? ""]?.rank ?? 99;
    return [...aspects].sort((a, b) => {
      const aStrong = a.orbDegrees <= STRONG_ORB ? 0 : 1;
      const bStrong = b.orbDegrees <= STRONG_ORB ? 0 : 1;
      if (aStrong !== bStrong) return aStrong - bStrong;
      if (a.orbDegrees !== b.orbDegrees) return a.orbDegrees - b.orbDegrees;
      return typeRank(a.type) - typeRank(b.type);
    });
  }, [aspects]);

  const rotatingAspects = useMemo(
    () => (orderedAspects.length ? [...orderedAspects, ...orderedAspects] : []),
    [orderedAspects]
  );

  const activeItemCount = chartView === "birthchart" ? natal.length : orderedAspects.length;

  const getChartAnimation = () => chartTrackRef.current?.getAnimations()[0] ?? null;

  useEffect(() => {
    if (shouldReduceMotion || activeItemCount <= 6) return;

    const frame = window.requestAnimationFrame(() => {
      const animation = getChartAnimation();
      if (!animation) return;
      const duration = activeItemCount * 3000;
      animation.currentTime = getSharedScrollTime(chartView, duration);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [chartView, activeItemCount, shouldReduceMotion]);

  const beginChartDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activeItemCount <= 6) return;

    const animation = getChartAnimation();
    const duration = activeItemCount * 3000;
    const currentTime =
      animation && typeof animation.currentTime === "number"
        ? animation.currentTime
        : getSharedScrollTime(chartView, duration);

    chartDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTime: currentTime,
    };

    setSharedScrollTime(chartView, currentTime, duration);
    event.currentTarget.setPointerCapture(event.pointerId);
    setChartPaused(true);
  };

  const moveChartDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = chartDragRef.current;
    if (drag.pointerId !== event.pointerId || activeItemCount <= 6) return;

    const animation = getChartAnimation();
    if (!animation) return;

    const rowHeight = 52;
    const rowDurationMs = 3000;
    const totalDuration = activeItemCount * rowDurationMs;

    const deltaY = event.clientY - drag.startY;
    let nextTime = drag.startTime - (deltaY / rowHeight) * rowDurationMs;

    nextTime %= totalDuration;
    if (nextTime < 0) nextTime += totalDuration;

    animation.currentTime = nextTime;
    setSharedScrollTime(chartView, nextTime, totalDuration);
  };

  const endChartDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (chartDragRef.current.pointerId !== event.pointerId) return;

    const animation = getChartAnimation();
    const totalDuration = activeItemCount * 3000;
    if (animation && typeof animation.currentTime === "number") {
      setSharedScrollTime(chartView, animation.currentTime, totalDuration);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    chartDragRef.current.pointerId = null;
    setChartPaused(false);
  };

  // Element balance across all placements (planets + rising).
  const elementBalance = useMemo(() => {
    const counts: Record<Element, number> = { Fire: 0, Earth: 0, Air: 0, Water: 0 };
    natal.forEach((p) => {
      const el = elementOf(p.sign);
      if (el) counts[el] += 1;
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const dominant = ELEMENT_ORDER.reduce((top, el) => (counts[el] > counts[top] ? el : top), "Fire");
    return { counts, total, dominant };
  }, [natal]);

  const hasProfection =
    !!profection &&
    typeof profection.profectionYear === "number" &&
    !!profection.activatedSign;

  const profectionElement = elementOf(profection?.activatedSign);
  const profectionColors = profectionElement ? ELEMENT_COLORS[profectionElement] : null;

  if (isLoading) {
    return (
      <div className="flex min-h-full w-full min-w-0 max-w-full items-center justify-center bg-[#050816]">
        <div className="text-sm text-slate-400">Casting your chart…</div>
      </div>
    );
  }

  const hasChart = natal.length > 0;

  // Birth-chart focus mode mirrors the Reading Intake selection treatment:
  // surrounding content stays visible, but drains into the background so the
  // open chart becomes the only active layer.
  const identityFocusStyle: React.CSSProperties = {
    opacity: 1,
    filter: chartOpen
      ? "grayscale(1) brightness(0.30) saturate(0)"
      : "grayscale(0) brightness(1) saturate(1)",
    transitionProperty: "opacity, filter",
    transitionDuration: chartOpen ? "950ms" : "420ms",
    transitionDelay: chartOpen ? "0ms" : "60ms",
    transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
    pointerEvents: "auto",
  };

  const outsideFocusStyle: React.CSSProperties = {
    // Lower profile sections disappear immediately when the chart opens, but
    // remain mounted so their layout and state are preserved. On close, wait
    // until the chart has fully retracted before fading them back into place.
    opacity: 1,
    filter: chartOpen
      ? "grayscale(1) brightness(0.28) saturate(0)"
      : "grayscale(0) brightness(1) saturate(1)",
    transitionProperty: "opacity, filter",
    transitionDuration: "420ms",
    transitionDelay: "0ms",
    transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
    pointerEvents: "auto",
  };

  return (
    <div
      className="relative min-h-full w-full min-w-0 max-w-full overflow-x-hidden font-sans text-slate-100"
    >
      <style jsx>{`
        @keyframes elementShine {
          0% { transform: translateX(-140%) skewX(-18deg); }
          60% { transform: translateX(240%) skewX(-18deg); }
          100% { transform: translateX(240%) skewX(-18deg); }
        }
        .element-box { position: relative; overflow: hidden; isolation: isolate; }
        .element-box::after {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          width: 45%;
          background: linear-gradient(
            105deg,
            transparent 0%,
            rgba(255, 255, 255, 0.09) 45%,
            rgba(255, 255, 255, 0.16) 50%,
            rgba(255, 255, 255, 0.09) 55%,
            transparent 100%
          );
          transform: translateX(-140%) skewX(-18deg);
          animation: elementShine 4.6s ease-in-out infinite;
          pointer-events: none;
          z-index: 1;
        }
        .element-box > * { position: relative; z-index: 2; }
        .chart-focus-surface {
          background:
            radial-gradient(circle at 18% 0%, rgba(96,165,250,0.10), transparent 44%),
            linear-gradient(145deg, rgba(17,29,52,0.92), rgba(8,13,28,0.88));
          -webkit-backdrop-filter: blur(14px);
          backdrop-filter: blur(14px);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.055),
            inset 0 -1px 0 rgba(255,255,255,0.025);
        }
        @property --readings-angle {
          syntax: "<angle>";
          inherits: false;
          initial-value: 0deg;
        }
        .your-readings-shell {
          position: relative;
          isolation: isolate;
          border: 0;
          border-radius: 22px;
          background:
            radial-gradient(circle at 50% -70%, rgba(255,255,255,0.11), transparent 66%),
            linear-gradient(145deg, rgba(19,18,24,0.96), rgba(7,10,21,0.97));
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.08),
            0 0 22px rgba(203,164,78,0.12),
            0 16px 38px rgba(0,0,0,0.46);
          cursor: pointer;
        }
        .your-readings-shell::before,
        .your-readings-shell::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          padding: 1.25px;
          background:
            conic-gradient(
              from var(--readings-angle),
              rgba(255,255,255,0.94) 0deg,
              rgba(255,255,255,0.74) 54deg,
              rgba(218,183,104,0.88) 112deg,
              rgba(255,239,195,0.82) 172deg,
              rgba(255,255,255,0.96) 226deg,
              rgba(193,151,67,0.86) 296deg,
              rgba(255,255,255,0.94) 360deg
            );
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          animation: readingsOrbit 8s linear infinite;
        }
        .your-readings-shell::before {
          z-index: 0;
          opacity: 0.82;
        }
        .your-readings-shell::after {
          inset: -1px;
          z-index: -1;
          padding: 2px;
          opacity: 0.52;
          filter: blur(8px);
        }
        .your-readings-shell:hover,
        .your-readings-shell:focus-visible {
          transform: translateY(-1px);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.11),
            0 0 28px rgba(203,164,78,0.18),
            0 18px 42px rgba(0,0,0,0.50);
          outline: none;
        }
        .your-readings-shell:active {
          transform: translateY(0);
        }
        .upgrade-chart-shell {
          position: relative;
          isolation: isolate;
          border: 0;
          border-radius: 22px;
          background:
            radial-gradient(circle at 50% -70%, rgba(218,183,104,0.10), transparent 68%),
            linear-gradient(145deg, rgba(12,10,8,0.98), rgba(3,4,8,0.99));
          box-shadow:
            inset 0 1px 0 rgba(255,231,169,0.055),
            0 0 24px rgba(203,164,78,0.16),
            0 14px 34px rgba(0,0,0,0.46);
          cursor: pointer;
        }
        .upgrade-chart-shell::before,
        .upgrade-chart-shell::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          padding: 1.25px;
          background:
            conic-gradient(
              from var(--readings-angle),
              rgba(126,88,24,0.72) 0deg,
              rgba(235,201,119,0.98) 62deg,
              rgba(158,112,35,0.78) 128deg,
              rgba(255,226,154,0.96) 188deg,
              rgba(174,128,46,0.82) 252deg,
              rgba(238,202,116,0.96) 316deg,
              rgba(126,88,24,0.72) 360deg
            );
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          animation: readingsOrbit 8s linear infinite;
        }
        .upgrade-chart-shell::before {
          z-index: 0;
          opacity: 0.92;
        }
        .upgrade-chart-shell::after {
          inset: -1px;
          z-index: -1;
          padding: 2px;
          opacity: 0.72;
          filter: blur(9px);
        }
        .upgrade-chart-shell:hover,
        .upgrade-chart-shell:focus-visible {
          transform: translateY(-1px);
          box-shadow:
            inset 0 1px 0 rgba(255,231,169,0.08),
            0 0 30px rgba(203,164,78,0.24),
            0 18px 42px rgba(0,0,0,0.50);
          outline: none;
        }
        .upgrade-chart-shell:active {
          transform: translateY(0);
        }
        .upgrade-chart-shimmer {
          position: absolute;
          inset: 0;
          z-index: 1;
          overflow: hidden;
          border-radius: inherit;
          pointer-events: none;
        }
        .upgrade-chart-shimmer::after {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          width: 45%;
          background: linear-gradient(
            105deg,
            transparent 0%,
            rgba(218,183,104,0.04) 43%,
            rgba(255,226,154,0.15) 50%,
            rgba(218,183,104,0.05) 57%,
            transparent 100%
          );
          transform: translateX(-145%) skewX(-18deg);
          animation: readingsShimmer 2.75s cubic-bezier(0.22, 1, 0.36, 1) 1 forwards;
        }
        .chart-action-side {
          position: relative;
          z-index: 2;
          display: flex;
          min-width: 0;
          height: 100%;
          align-items: center;
          justify-content: center;
          border: 0;
          background: transparent;
          color: inherit;
          cursor: pointer;
          transition: background 180ms ease, opacity 180ms ease;
        }
        .chart-action-side:hover,
        .chart-action-side:focus-visible {
          background: rgba(255,255,255,0.035);
          outline: none;
        }
        .chart-action-side:active {
          background: rgba(255,255,255,0.055);
        }
        .chart-action-divider {
          position: absolute;
          left: 50%;
          top: -10%;
          z-index: 3;
          width: 1px;
          height: 120%;
          transform: rotate(14deg);
          transform-origin: center;
          background: linear-gradient(
            180deg,
            transparent 0%,
            rgba(255,255,255,0.30) 18%,
            rgba(218,183,104,0.44) 50%,
            rgba(255,255,255,0.26) 82%,
            transparent 100%
          );
          box-shadow: 0 0 10px rgba(218,183,104,0.12);
          pointer-events: none;
        }
        @keyframes readingsShimmer {
          0% { transform: translateX(-145%) skewX(-18deg); }
          100% { transform: translateX(245%) skewX(-18deg); }
        }
        .your-readings-shimmer {
          position: absolute;
          inset: 0;
          z-index: 1;
          overflow: hidden;
          border-radius: inherit;
          pointer-events: none;
        }
        .your-readings-shimmer::after {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          width: 45%;
          background: linear-gradient(
            105deg,
            transparent 0%,
            rgba(255,255,255,0.08) 45%,
            rgba(255,255,255,0.17) 50%,
            rgba(255,255,255,0.08) 55%,
            transparent 100%
          );
          transform: translateX(-145%) skewX(-18deg);
          animation: readingsShimmer 2.75s cubic-bezier(0.22, 1, 0.36, 1) 1 forwards;
        }
        @keyframes readingsOrbit {
          to { --readings-angle: 360deg; }
        }
        @keyframes chartEscalator {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(0, calc(var(--chart-count) * -52px), 0); }
        }
        .chart-viewport {
          height: 312px;
          overflow: hidden;
          contain: layout paint;
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
          touch-action: none;
          cursor: grab;
        }
        .chart-viewport[data-paused="true"] {
          cursor: grabbing;
        }
        .chart-track {
          will-change: transform;
          animation: chartEscalator calc(var(--chart-count) * 3s) linear infinite;
        }
        .chart-track[data-paused="true"] {
          animation-play-state: paused;
        }
        .chart-row {
          height: 52px;
        }
        @media (prefers-reduced-motion: reduce) {
          .element-box::after { animation: none !important; opacity: 0; }
          .your-readings-shell::before, .your-readings-shell::after, .upgrade-chart-shell::before, .upgrade-chart-shell::after { animation: none !important; }
          .your-readings-shimmer::after, .upgrade-chart-shimmer::after { animation: none !important; opacity: 0; }
          .chart-track { animation: none !important; transform: none !important; }
        }
      `}</style>

      {/* Deepens the entire sky during chart focus without dimming the chart UI itself. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[5] bg-black"
        initial={false}
        animate={{ opacity: 0 }}
        transition={{
          duration: shouldReduceMotion ? 0 : 0.3,
          delay: 0,
          ease: [0.22, 1, 0.36, 1],
        }}
      />

      <div
        className="relative z-10 mx-auto w-full min-w-0 max-w-[430px] px-[clamp(12px,4vw,16px)]"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 8px)",
          paddingBottom: "calc(4rem + env(safe-area-inset-bottom))",
        }}
      >
        {/* ── PROFILE IDENTITY — Big Three first, no extra hero copy ── */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{
            opacity: 1,
            y: 0,
            filter: chartOpen
              ? "grayscale(1) brightness(0.30) saturate(0)"
              : "grayscale(0) brightness(1) saturate(1)",
          }}
          transition={{
            duration: shouldReduceMotion ? 0 : chartOpen ? 0.95 : 0.42,
            delay: 0,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="mb-3"
          style={{ pointerEvents: identityFocusStyle.pointerEvents }}
        >
          {hasChart ? (
            <div className="grid grid-cols-3 gap-[clamp(6px,2.5vw,10px)]">
              {(
                [
                  { label: "Sun", p: bigThree.sun },
                  { label: "Moon", p: bigThree.moon },
                  { label: "Rising", p: bigThree.rising },
                ] as const
              ).map(({ label, p }) => {
                const element = elementOf(p?.sign);
                const colors = element ? ELEMENT_COLORS[element] : null;
                return (
                  <div
                    key={label}
                    className="element-box rounded-2xl border bg-black/20 px-2 py-3 text-center"
                    style={
                      colors
                        ? {
                            borderColor: colors.border,
                            boxShadow: `0 0 22px ${colors.glow}, inset 0 0 14px ${colors.glow}`,
                          }
                        : { borderColor: "rgba(255,255,255,0.10)" }
                    }
                  >
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
                    <p className="mt-1.5 text-[clamp(15px,4.4vw,17px)] font-medium leading-tight text-white">{p?.sign ?? "—"}</p>
                    <p className="text-[11px] text-slate-400 tabular-nums">{p?.degree ?? ""}</p>
                    {element && colors && (
                      <p
                        className="mt-1 text-[9px] font-medium uppercase tracking-[0.18em]"
                        style={{ color: colors.text }}
                      >
                        {element}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-8 text-center text-[13px] leading-6 text-slate-400">
              Enter your birth details to reveal your chart.
            </p>
          )}
        </motion.header>

        {hasChart && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
            className="flex flex-col gap-3"
          >
            {/* ── INTERACTIVE CONTEXT CARD — fixed footprint, three normal states + chart override ── */}
            {(hasProfection || elementBalance.total > 0 || dailyHoroscope || selectedContext) && (
              <button
                type="button"
                onClick={advanceContextCard}
                className="standard-shadow order-1 h-[200px] w-full overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.03] p-3.5 text-left backdrop-blur-sm"
                style={outsideFocusStyle}
                aria-label="Cycle personal astrology context"
              >
                <motion.div
                  key={selectedContext ? `selected-${selectedContext.kind}` : `context-${contextMode}`}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: "easeOut" }}
                  className="h-full overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {selectedContext?.kind === "placement" ? (() => {
                    const planet = natal.find((item) => item.name === selectedContext.planetName);
                    if (!planet) return null;
                    const element = elementOf(planet.sign);
                    const colors = element ? ELEMENT_COLORS[element] : null;
                    const displayName = planet.name === "Ascendant" ? "Rising" : planet.name;

                    return (
                      <div>
                        <div className="flex items-center justify-between gap-3 pt-1">
                          <p className="text-[21px] font-light leading-none" style={{ color: colors?.text ?? "#F8FAFC" }}>
                            {displayName} in {planet.sign}
                          </p>
                          <span
                            className="mt-[2px] shrink-0 self-center text-[22px] leading-none"
                            style={{ color: colors?.text ?? "#94A3B8" }}
                          >
                            {GLYPHS[planet.name] ?? "✦"}
                          </span>
                        </div>

                        <div className="my-3 h-px bg-white/[0.06]" />

                        <p className="text-[14px] leading-[1.6] text-slate-300">
                          {[
                            PLANET_MEANING[planet.name],
                            SIGN_MEANING[planet.sign],
                            planet.house ? HOUSE_MEANING[String(planet.house)] : null,
                          ].filter(Boolean).join(" ")}
                        </p>
                      </div>
                    );
                  })() : selectedContext?.kind === "aspect" ? (() => {
                    const asp = selectedContext.aspect;
                    const type = asp.type?.toLowerCase() ?? "";
                    const meta = ASPECT_META[type];
                    const nameA = asp.planetA === "Ascendant" ? "Rising" : asp.planetA;
                    const nameB = asp.planetB === "Ascendant" ? "Rising" : asp.planetB;

                    return (
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                              Aspect Context
                            </span>
                            <p className="mt-1 text-[19px] font-light leading-tight text-white">
                              {nameA} {asp.type} {nameB}
                            </p>
                          </div>
                          <span
                            className="shrink-0 text-[10px] font-medium uppercase tracking-[0.14em]"
                            style={{ color: meta?.text ?? "#94A3B8" }}
                          >
                            {meta?.header ?? "Aspect"}
                          </span>
                        </div>

                        <div className="my-2.5 h-px bg-white/[0.06]" />

                        <p className="text-[14px] leading-[1.6] text-slate-300">
                          This {asp.type.toLowerCase()} connects {nameA} and {nameB} with a {asp.orbDegrees}° orb.
                          {meta ? ` In this chart it is categorized as ${meta.header.toLowerCase()}.` : ""}
                        </p>
                      </div>
                    );
                  })() : contextMode === 0 ? (
                    <>
                      {hasProfection && (
                        <>
                          <div className="grid grid-cols-[minmax(0,1fr)_auto_48px] items-center gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Compass className="h-3 w-3 text-slate-500" strokeWidth={2.2} />
                                <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-slate-500">
                                  Profection Year
                                </span>
                              </div>
                              <p className="mt-1 text-[22px] font-light leading-none text-white">
                                {profection!.activatedSign} Year
                              </p>
                              <p className="mt-1 text-[10px] leading-4 text-slate-500">
                                {typeof profection!.activatedHouse === "number"
                                  ? `${ordinal(profection!.activatedHouse)} house activated`
                                  : `${ordinal(profection!.profectionYear)} house year`}.
                              </p>
                            </div>
                            <div className="text-center">
                              <span className="block whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500 tabular-nums">
                                Age {profection!.age}
                              </span>
                            </div>
                            {profectionColors && (
                              <div
                                className="element-box flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] border bg-black/20"
                                style={{
                                  borderColor: profectionColors.border,
                                  boxShadow: `0 0 18px ${profectionColors.glow}, inset 0 0 12px ${profectionColors.glow}`,
                                }}
                              >
                                <span className="text-[20px]" style={{ color: profectionColors.text }}>
                                  {GLYPHS[SIGN_RULER_GLYPH(profection!.activatedSign)] ?? "✦"}
                                </span>
                              </div>
                            )}
                          </div>
                          {elementBalance.total > 0 && <div className="my-2.5 h-px bg-white/[0.06]" />}
                        </>
                      )}

                      {elementBalance.total > 0 && (
                        <div>
                          <div className="mb-1 text-center">
                            <span className="text-[8px] font-medium uppercase tracking-[0.19em] text-slate-500">
                              Elemental Balance
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {ELEMENT_ORDER.map((el) => {
                              const count = elementBalance.counts[el];
                              const maxCount = Math.max(...ELEMENT_ORDER.map((key) => elementBalance.counts[key]), 1);
                              const height = 8 + Math.round((count / maxCount) * 20);
                              const colors = ELEMENT_COLORS[el];
                              return (
                                <div key={el} className="flex flex-col items-center">
                                  <div className="flex h-8 items-end justify-center">
                                    <motion.span
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height, opacity: 1 }}
                                      transition={{ duration: 0.65, ease: "easeOut" }}
                                      className="w-[3px] rounded-full"
                                      style={{ backgroundColor: colors.bar, boxShadow: `0 0 10px ${colors.glow}` }}
                                    />
                                  </div>
                                  <span className="mt-1 text-[8px] font-medium uppercase tracking-[0.13em]" style={{ color: colors.text }}>
                                    {el}
                                  </span>
                                  <span className="mt-0.5 text-[9px] text-slate-600 tabular-nums">{count}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  ) : contextMode === 1 ? (
                    <div className="flex h-full flex-col justify-center text-center">
                      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                        Your Horoscope
                      </span>
                      {dailyHoroscope ? (
                        <p className="mx-auto mt-3 max-w-[355px] text-[15px] leading-[1.65] text-slate-200">{dailyHoroscope}</p>
                      ) : (
                        <p className="mx-auto mt-3 max-w-[355px] text-[14px] leading-6 text-slate-400">
                          {horoscopeLoading ? "Preparing today’s horoscope…" : horoscopeError ? "Tap again to retry today’s horoscope." : "Preparing your horoscope…"}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-full flex-col justify-center text-center">
                      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                        Personal Context
                      </span>
                      <p className="mt-2 text-[24px] font-light leading-tight text-white">
                        Tap any placement below
                      </p>
                      <p className="mx-auto mt-3 max-w-[355px] text-[14px] leading-[1.6] text-slate-400">
                        Explore your chart one placement at a time.
                      </p>
                    </div>
                  )}
                </motion.div>
              </button>
            )}

            {/* ── CHART / ASPECTS — one continuous six-row surface ── */}
            <section className="order-2 py-1" data-birth-chart-focus>
              <div className="mb-2 flex items-center justify-center gap-2 text-center">
                <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-300">
                  {chartView === "birthchart" ? "My Chart" : "My Aspects"}
                </span>
                <span className="text-[9px] text-slate-600">•</span>
                <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-slate-500">
                  {chartView === "birthchart"
                    ? "Tap Each Placement To Learn"
                    : "Tap Each Aspect To Learn"}
                </span>
              </div>

              <div
                className="chart-viewport"
                data-paused={chartPaused ? "true" : "false"}
                onPointerDown={beginChartDrag}
                onPointerMove={moveChartDrag}
                onPointerUp={endChartDrag}
                onPointerCancel={endChartDrag}
              >
                <div
                  ref={chartTrackRef}
                  data-chart-track
                  className="chart-track"
                  data-paused={chartPaused ? "true" : "false"}
                  style={{ ["--chart-count" as string]: activeItemCount }}
                >
                  {chartView === "birthchart" ? (
                    rotatingNatal.map((planet, index) => {
                      const element = elementOf(planet.sign);
                      const colors = element ? ELEMENT_COLORS[element] : null;
                      const displayName = planet.name === "Ascendant" ? "Rising" : planet.name;
                      const isSelected = selectedContext?.kind === "placement" && selectedContext.planetName === planet.name;
                      const isDuplicate = index >= natal.length;

                      return (
                        <div key={`${planet.name}-${index}`} className="chart-row border-b border-white/5" aria-hidden={isDuplicate ? true : undefined}>
                          <button
                            type="button"
                            onClick={() => {
                              if (isDuplicate) return;
                              setOpenPlacement(planet.name);
                              setSelectedContext({ kind: "placement", planetName: planet.name });
                            }}
                            tabIndex={isDuplicate ? -1 : 0}
                            className="flex h-full w-full items-center gap-3 px-1 text-left"
                          >
                            <span
                              className="w-8 shrink-0 text-center text-xl transition-all"
                              style={colors ? { color: colors.text, textShadow: isSelected ? `0 0 10px ${colors.glow}` : "none" } : { color: "#64748b" }}
                            >
                              {GLYPHS[planet.name] ?? "•"}
                            </span>
                            <span className={cn("w-24 shrink-0 text-[12px] font-medium uppercase tracking-wide", isSelected ? "text-white" : "text-slate-300")}>
                              {displayName}
                            </span>
                            <span className="min-w-0 flex-1 text-[15px]" style={{ color: colors?.text ?? "#CBD5E1" }}>
                              {planet.sign}
                            </span>
                            <span className="shrink-0 whitespace-nowrap text-[13px] text-slate-400 tabular-nums">
                              {planet.degree}
                              {planet.house ? <span className="ml-1 text-slate-500">· {ordinal(planet.house)}</span> : null}
                            </span>
                          </button>
                        </div>
                      );
                    })
                  ) : rotatingAspects.length > 0 ? (
                    rotatingAspects.map((asp, index) => {
                      const sourceIndex = index % orderedAspects.length;
                      const isDuplicate = index >= orderedAspects.length;
                      const type = asp.type?.toLowerCase() ?? "";
                      const meta = ASPECT_META[type];
                      const nameA = asp.planetA === "Ascendant" ? "Rising" : asp.planetA;
                      const nameB = asp.planetB === "Ascendant" ? "Rising" : asp.planetB;
                      const isMajor = asp.orbDegrees <= STRONG_ORB;

                      return (
                        <div key={`${asp.planetA}-${asp.type}-${asp.planetB}-${sourceIndex}-${index}`} className="chart-row border-b border-white/5" aria-hidden={isDuplicate ? true : undefined}>
                          <button
                            type="button"
                            onClick={() => {
                              if (isDuplicate) return;
                              setSelectedContext({ kind: "aspect", aspect: asp });
                            }}
                            tabIndex={isDuplicate ? -1 : 0}
                            className="flex h-full w-full items-center gap-3 px-1 text-left"
                          >
                            <span
                              className="w-8 shrink-0 text-center text-[14px]"
                              style={{ color: meta?.text ?? "#94A3B8" }}
                            >
                              {isMajor ? "●" : "○"}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[13px] text-slate-200">
                              {nameA} <span className="italic text-slate-500">{asp.type}</span> {nameB}
                            </span>
                            <span className="shrink-0 text-[11px] text-slate-500 tabular-nums">
                              {asp.orbDegrees}°
                            </span>
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex h-[312px] items-center justify-center text-[12px] text-slate-500">
                      No aspects available yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setChartView("birthchart");
                    setSelectedContext(null);
                  }}
                  className={cn(
                    "text-[10px] font-medium uppercase tracking-[0.16em] transition-colors",
                    chartView === "birthchart" ? "text-slate-100" : "text-slate-600"
                  )}
                >
                  Birth Chart
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setChartView((current) =>
                      current === "birthchart" ? "aspects" : "birthchart"
                    );
                    setSelectedContext(null);
                  }}
                  aria-label={`Switch to ${chartView === "birthchart" ? "My Aspects" : "Birth Chart"}`}
                  className="relative h-[18px] w-[34px] rounded-full border border-white/10 bg-white/[0.035] p-[2px]"
                >
                  <motion.span
                    animate={{ x: chartView === "birthchart" ? 0 : 16 }}
                    transition={{
                      duration: shouldReduceMotion ? 0 : 0.18,
                      ease: "easeOut",
                    }}
                    className="block h-3 w-3 rounded-full bg-slate-200 shadow-[0_0_8px_rgba(255,255,255,0.22)]"
                  />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setChartView("aspects");
                    setSelectedContext(null);
                  }}
                  className={cn(
                    "text-[10px] font-medium uppercase tracking-[0.16em] transition-colors",
                    chartView === "aspects" ? "text-slate-100" : "text-slate-600"
                  )}
                >
                  My Aspects
                </button>
              </div>
            </section>

            {/* ── CHART ACTIONS — separate premium destinations ── */}
            <div className="order-3 flex w-[80%] self-center items-stretch gap-2.5">
              <button
                type="button"
                onClick={() => {
                  if (onOpenUpgradeChart) {
                    onOpenUpgradeChart();
                    return;
                  }

                  window.location.assign("/upgrade-chart");
                }}
                className="upgrade-chart-shell flex min-h-[50px] min-w-0 flex-1 items-center justify-center px-3 text-center transition-[transform,box-shadow,opacity,filter] duration-300"
                aria-label="Upgrade your chart"
                style={outsideFocusStyle}
              >
                <span className="upgrade-chart-shimmer" aria-hidden="true" />
                <span
                  className="pointer-events-none absolute left-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full"
                  style={{
                    border: "1px solid rgba(218,183,104,0.42)",
                    background: "rgba(8,8,10,0.72)",
                    boxShadow:
                      "0 0 10px rgba(218,183,104,0.20), 0 0 20px rgba(193,151,67,0.12)",
                  }}
                  aria-hidden="true"
                >
                  <Maximize2
                    className="h-3.5 w-3.5"
                    style={{
                      color: "rgba(238,207,133,0.96)",
                      filter: "drop-shadow(0 0 5px rgba(218,183,104,0.35))",
                    }}
                  />
                </span>

                <span
                  className="relative z-10 ml-5 whitespace-nowrap text-[12px] font-semibold uppercase tracking-[0.14em]"
                  style={{
                    color: "#F1D694",
                    textShadow:
                      "0 2px 10px rgba(0,0,0,0.95), 0 0 16px rgba(218,183,104,0.22)",
                  }}
                >
                  Upgrade Chart
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onOpenReadings) {
                    onOpenReadings();
                    return;
                  }

                  window.location.assign("/readings");
                }}
                className="your-readings-shell flex min-h-[50px] min-w-0 flex-1 items-center justify-center px-3 text-center transition-[transform,box-shadow,opacity,filter] duration-300"
                aria-label="Open your saved readings"
                style={outsideFocusStyle}
              >
                <span className="your-readings-shimmer" aria-hidden="true" />
                <span
                  className="pointer-events-none absolute right-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full"
                  style={{
                    border: "1px solid rgba(248,250,252,0.28)",
                    background: "rgba(248,250,252,0.035)",
                    boxShadow:
                      "0 0 10px rgba(248,250,252,0.10), 0 0 18px rgba(191,219,254,0.06)",
                  }}
                  aria-hidden="true"
                >
                  <Crown
                    className="h-3.5 w-3.5"
                    style={{
                      color: "rgba(248,250,252,0.88)",
                      filter: "drop-shadow(0 0 5px rgba(255,255,255,0.20))",
                    }}
                  />
                </span>

                <span
                  className="relative z-10 mr-5 whitespace-nowrap text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-100"
                  style={{
                    textShadow:
                      "0 2px 10px rgba(0,0,0,0.92), 0 0 18px rgba(255,255,255,0.16), 0 0 24px rgba(218,183,105,0.16)",
                  }}
                >
                  Your Readings
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

/* Maps a sign to its ruling planet's name (for the profection glyph). */
function SIGN_RULER_GLYPH(sign: string): string {
  const rulers: Record<string, string> = {
    Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon",
    Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Mars",
    Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter",
  };
  return rulers[sign] ?? "Sun";
}