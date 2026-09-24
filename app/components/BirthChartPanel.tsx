"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Compass, ChevronRight } from "lucide-react";
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
}: BirthChartPanelProps) {
  const shouldReduceMotion = useReducedMotion();

  const [natal, setNatal] = useState<NatalPlacement[]>([]);
  const [aspects, setAspects] = useState<NatalAspect[]>([]);
  const [aspectsOpen, setAspectsOpen] = useState(false);
  const [showWeaker, setShowWeaker] = useState(false);
  const [openPlacement, setOpenPlacement] = useState<string | null>(null);
  const [chartOpen, setChartOpen] = useState(false);
  const [profection, setProfection] = useState<ProfectionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dailyHoroscope, setDailyHoroscope] = useState<string | null>(null);
  const [horoscopeLoading, setHoroscopeLoading] = useState(false);
  const [horoscopeError, setHoroscopeError] = useState<string | null>(null);

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

  // Same star recipe as the other panels — continuous sky across swipes.
  const stars = useMemo(
    () =>
      Array.from({ length: 68 }).map((_, i) => ({
        id: i,
        left: `${(i * 37) % 100}%`,
        top: `${(i * 19 + 13) % 100}%`,
        size: i % 7 === 0 ? 3.5 : i % 5 === 0 ? 2.5 : 1.5,
        opacity: i % 7 === 0 ? 0.72 : i % 5 === 0 ? 0.55 : 0.34,
        delay: (i * 0.37) % 4,
      })),
    []
  );

  const bigThree = useMemo(() => {
    const find = (n: string) => natal.find((p) => p.name === n);
    return { sun: find("Sun"), moon: find("Moon"), rising: find("Ascendant") };
  }, [natal]);

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

  const STRONG_ORB = 4;

  const groupedAspects = useMemo(() => {
    const strong = aspects.filter((a) => a.orbDegrees <= STRONG_ORB);
    const weak = aspects
      .filter((a) => a.orbDegrees > STRONG_ORB)
      .sort((a, b) => a.orbDegrees - b.orbDegrees);

    // Bucket strong aspects by type, then order sections by rank.
    const sections = Object.keys(ASPECT_META)
      .map((type) => ({
        type,
        meta: ASPECT_META[type],
        items: strong
          .filter((a) => a.type?.toLowerCase() === type)
          .sort((a, b) => a.orbDegrees - b.orbDegrees),
      }))
      .filter((s) => s.items.length > 0)
      .sort((a, b) => a.meta.rank - b.meta.rank);

    return { sections, weak };
  }, [aspects]);

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
    opacity: chartOpen ? 0.44 : 1,
    filter: chartOpen
      ? "grayscale(1) brightness(0.30) saturate(0)"
      : "grayscale(0) brightness(1) saturate(1)",
    transitionProperty: "opacity, filter",
    transitionDuration: chartOpen ? "950ms" : "420ms",
    transitionDelay: chartOpen ? "0ms" : "60ms",
    transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
    pointerEvents: chartOpen ? "none" : "auto",
  };

  const outsideFocusStyle: React.CSSProperties = {
    // Lower profile sections disappear immediately when the chart opens, but
    // remain mounted so their layout and state are preserved. On close, wait
    // until the chart has fully retracted before fading them back into place.
    opacity: chartOpen ? 0 : 1,
    filter: chartOpen
      ? "grayscale(1) brightness(0.28) saturate(0)"
      : "grayscale(0) brightness(1) saturate(1)",
    transitionProperty: "opacity, filter",
    transitionDuration: chartOpen ? "0ms" : "420ms",
    transitionDelay: chartOpen ? "0ms" : "235ms",
    transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
    pointerEvents: chartOpen ? "none" : "auto",
  };

  return (
    <div
      className="relative min-h-full w-full min-w-0 max-w-full overflow-x-hidden font-sans text-slate-100"
      style={{
        background: "linear-gradient(180deg, #061120 0%, #050816 44%, #040611 100%)",
      }}
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

        @keyframes readingsOrbit {
          to { --readings-angle: 360deg; }
        }

        @media (prefers-reduced-motion: reduce) {
          .element-box::after { animation: none !important; opacity: 0; }
          .your-readings-shell::before, .your-readings-shell::after { animation: none !important; }
        }
      `}</style>

      {/* ── Starfield ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {stars.map((star) => (
          <motion.span
            key={star.id}
            className="absolute rounded-full bg-white"
            style={{ left: star.left, top: star.top, width: star.size, height: star.size, opacity: star.opacity }}
            animate={
              shouldReduceMotion
                ? undefined
                : { opacity: [star.opacity * 0.4, star.opacity * 1.6, star.opacity * 0.4], scale: [1, 1.6, 1] }
            }
            transition={
              shouldReduceMotion
                ? undefined
                : { duration: 2.34 + (star.id % 5) * 0.54, repeat: Infinity, ease: "easeInOut", delay: star.delay }
            }
          />
        ))}
      </div>

      {/* Deepens the entire sky during chart focus without dimming the chart UI itself. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[5] bg-black"
        initial={false}
        animate={{ opacity: chartOpen ? 0.64 : 0 }}
        transition={{
          duration: shouldReduceMotion ? 0 : chartOpen ? 0.95 : 0.3,
          delay: shouldReduceMotion || chartOpen ? 0 : 0.06,
          ease: [0.22, 1, 0.36, 1],
        }}
      />

      <div
  className="relative z-10 mx-auto w-full min-w-0 max-w-[430px] px-[clamp(12px,4vw,16px)]"
  style={{
    paddingTop: "calc(env(safe-area-inset-top) + 8px)",
    paddingBottom: "calc(4rem + env(safe-area-inset-bottom))",
  }}
  onClickCapture={(event) => {
    if (!chartOpen) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-birth-chart-focus]")) return;

    // While focused, any tap on the faded interface quietly dismisses the
    // chart. Capture prevents a muted control beneath the tap from firing.
    event.preventDefault();
    event.stopPropagation();
    setChartOpen(false);
  }}
>
        {/* ── PROFILE IDENTITY — Big Three first, no extra hero copy ── */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{
            opacity: chartOpen ? 0.44 : 1,
            y: 0,
            filter: chartOpen
              ? "grayscale(1) brightness(0.30) saturate(0)"
              : "grayscale(0) brightness(1) saturate(1)",
          }}
          transition={{
            duration: shouldReduceMotion ? 0 : chartOpen ? 0.95 : 0.42,
            delay: shouldReduceMotion || chartOpen ? 0 : 0.06,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="mb-3"
          style={{ pointerEvents: identityFocusStyle.pointerEvents }}
        >
          <h1 className="mb-3 text-center text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500">
            Your Astrology
          </h1>

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
            {/* ── PERSONAL CONTEXT — Profection + Element Balance combined ── */}
            {(hasProfection || elementBalance.total > 0) && (
              <div
                className="standard-shadow order-2 rounded-[22px] border border-white/10 bg-white/[0.03] p-3.5 backdrop-blur-sm"
                style={outsideFocusStyle}
              >
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
                                style={{
                                  backgroundColor: colors.bar,
                                  boxShadow: `0 0 10px ${colors.glow}`,
                                }}
                              />
                            </div>
                            <span
                              className="mt-1 text-[8px] font-medium uppercase tracking-[0.13em]"
                              style={{ color: colors.text }}
                            >
                              {el}
                            </span>
                            <span className="mt-0.5 text-[9px] text-slate-600 tabular-nums">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── VIEW MY CHART — technical chart data lives behind one disclosure ── */}
            <div
              data-birth-chart-focus
              className={cn(
                "standard-shadow relative order-1 overflow-hidden rounded-[18px] border border-white/10 bg-transparent",
                chartOpen && "z-20 border-white/[0.14]"
              )}
            >
              <button
                type="button"
                onClick={() => setChartOpen((v) => !v)}
                aria-expanded={chartOpen}
                className="chart-focus-surface flex w-full items-center justify-center px-4 py-[13px] text-[13px] font-medium uppercase tracking-[0.18em] text-slate-200 transition-[color,filter,background] duration-500 hover:text-white"
              >
                <span>{chartOpen ? "Close Chart" : "View My Chart"}</span>
              </button>

              <motion.div
                initial={false}
                animate={{ height: chartOpen ? "auto" : 0, opacity: chartOpen ? 1 : 0 }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : chartOpen
                      ? {
                          height: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
                          opacity: { duration: 0.2, delay: 0.04, ease: "easeOut" },
                        }
                      : {
                          opacity: { duration: 0.1, ease: "easeOut" },
                          height: { duration: 0.2, delay: 0.035, ease: [0.4, 0, 0.2, 1] },
                        }
                }
                className={cn("overflow-hidden", chartOpen && "border-t border-white/[0.06]")}
              >
                <div className="pt-3">
                  <div className="px-4 pb-3">
                  {/* Full placements live directly inside the chart container. */}
                  <div className="mb-3 text-center">
                    <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                      Tap Each Placement To Learn
                    </span>
                  </div>

                  <div className="space-y-3">
                    {natal.map((planet, index) => {
                      const element = elementOf(planet.sign);
                      const colors = element ? ELEMENT_COLORS[element] : null;
                      const displayName = planet.name === "Ascendant" ? "Rising" : planet.name;
                      const isOpen = openPlacement === planet.name;

                      return (
                        <div
                          key={planet.name}
                          className={cn(index < natal.length - 1 && "border-b border-white/5 pb-3")}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setOpenPlacement((current) => current === planet.name ? null : planet.name)
                            }
                            aria-expanded={isOpen}
                            className="flex w-full items-center gap-3 text-left"
                          >
                            <span
                              className="w-8 shrink-0 text-center text-xl transition-all"
                              style={
                                colors
                                  ? {
                                      color: colors.text,
                                      textShadow: isOpen ? `0 0 10px ${colors.glow}` : "none",
                                    }
                                  : { color: "#64748b" }
                              }
                            >
                              {GLYPHS[planet.name] ?? "•"}
                            </span>

                            <span
                              className={cn(
                                "w-24 shrink-0 text-[12px] font-medium uppercase tracking-wide transition-colors",
                                isOpen ? "text-white" : "text-slate-300"
                              )}
                            >
                              {displayName}
                            </span>

                            <span
                              className={cn(
                                "min-w-0 flex-1 text-[15px] transition-colors",
                                isOpen ? "text-white" : "text-slate-300"
                              )}
                            >
                              {planet.sign}
                            </span>

                            <span
                              className={cn(
                                "shrink-0 whitespace-nowrap text-[13px] tabular-nums transition-colors",
                                isOpen ? "text-slate-300" : "text-slate-400"
                              )}
                            >
                              {planet.degree}
                              {planet.house ? (
                                <span className="ml-1 text-slate-500">· {ordinal(planet.house)}</span>
                              ) : null}
                            </span>
                          </button>

                          <motion.div
                            initial={false}
                            animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
                            transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: "easeOut" }}
                            className="overflow-hidden"
                          >
                            <div className="pt-3 pl-1">
                              <div
                                className="border-l pl-3"
                                style={{ borderColor: colors?.border ?? "rgba(255,255,255,0.10)" }}
                              >
                                <p
                                  className="text-[10px] font-medium uppercase tracking-[0.16em]"
                                  style={{ color: colors?.text ?? "#94A3B8" }}
                                >
                                  {planet.name === "Ascendant"
                                    ? `${planet.sign} Rising`
                                    : `${planet.name} in ${planet.sign}`}
                                </p>

                                {PLANET_MEANING[planet.name] && (
                                  <div className="mt-2">
                                    <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-600">
                                      The Planet
                                    </p>
                                    <p className="mt-1 text-[12px] leading-5 text-slate-400">
                                      {PLANET_MEANING[planet.name]}
                                    </p>
                                  </div>
                                )}

                                {SIGN_MEANING[planet.sign] && (
                                  <div className="mt-3">
                                    <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-600">
                                      The Sign
                                    </p>
                                    <p className="mt-1 text-[12px] leading-5 text-slate-400">
                                      {SIGN_MEANING[planet.sign]}
                                    </p>
                                  </div>
                                )}

                                {planet.house && HOUSE_MEANING[String(planet.house)] && (
                                  <div className="mt-3">
                                    <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-600">
                                      The {ordinal(planet.house)} House
                                    </p>
                                    <p className="mt-1 text-[12px] leading-5 text-slate-400">
                                      {HOUSE_MEANING[String(planet.house)]}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        </div>
                      );
                    })}
                  </div>
                  </div>

                {/* Major Aspects stay inside View My Chart. */}
                {aspects.length > 0 && (
                  <div className="chart-focus-surface mt-1 border-t border-white/[0.09] px-4 pt-1">
                    <button
                      type="button"
                      onClick={() => setAspectsOpen((v) => !v)}
                      className="flex w-full items-center justify-between py-3"
                    >
                      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
                        Major Aspects
                      </span>
                      <span className="flex items-center gap-2 text-slate-500">
                        <span className="text-[11px] tabular-nums">{aspects.length}</span>
                        <ChevronRight
                          className={cn("h-4 w-4 transition-transform", aspectsOpen && "rotate-90")}
                        />
                      </span>
                    </button>

                    {aspectsOpen && (
                      <div className="pb-1">
                        {groupedAspects.sections.map((section) => (
                          <div key={section.type} className="mb-3 last:mb-1">
                            <div className="mb-1.5 flex items-center gap-2">
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{
                                  backgroundColor: section.meta.text,
                                  boxShadow: `0 0 6px ${section.meta.glow}`,
                                }}
                              />
                              <span
                                className="text-[10px] font-medium uppercase tracking-[0.16em]"
                                style={{ color: section.meta.text }}
                              >
                                {section.meta.header}
                              </span>
                            </div>

                            <div className="divide-y divide-white/5">
                              {section.items.map((asp, i) => {
                                const nameA = asp.planetA === "Ascendant" ? "Rising" : asp.planetA;
                                const nameB = asp.planetB === "Ascendant" ? "Rising" : asp.planetB;
                                return (
                                  <div
                                    key={`${asp.planetA}-${asp.planetB}-${i}`}
                                    className="flex items-center justify-between py-2 text-[13px]"
                                  >
                                    <span className="text-slate-200">
                                      {nameA} <span className="italic text-slate-500">{asp.type}</span> {nameB}
                                    </span>
                                    <span className="text-[11px] text-slate-500 tabular-nums">
                                      {asp.orbDegrees}°
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}

                        {groupedAspects.sections.length === 0 && (
                          <p className="py-2 text-[12px] text-slate-500">
                            No tight aspects within {STRONG_ORB}°.
                          </p>
                        )}

                        {groupedAspects.weak.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => setShowWeaker((v) => !v)}
                              className="mt-1 w-full text-left text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500"
                            >
                              {showWeaker ? "Hide weaker aspects" : "Show weaker aspects"} →
                            </button>

                            {showWeaker && (
                              <div className="mt-2 divide-y divide-white/5 opacity-70">
                                {groupedAspects.weak.map((asp, i) => {
                                  const nameA = asp.planetA === "Ascendant" ? "Rising" : asp.planetA;
                                  const nameB = asp.planetB === "Ascendant" ? "Rising" : asp.planetB;
                                  return (
                                    <div
                                      key={`weak-${asp.planetA}-${asp.planetB}-${i}`}
                                      className="flex items-center justify-between py-2 text-[13px]"
                                    >
                                      <span className="text-slate-400">
                                        {nameA} <span className="italic text-slate-600">{asp.type}</span> {nameB}
                                      </span>
                                      <span className="text-[11px] text-slate-600 tabular-nums">
                                        {asp.orbDegrees}°
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
                </div>
              </motion.div>
            </div>

            {/* ── DAILY HOROSCOPE — the prompt is replaced by today's saved result ── */}
            <section
              className="standard-shadow order-3 flex min-h-[84px] w-full items-center justify-center rounded-[20px] border px-5 py-4 text-center"
              style={{
                background:
                  "radial-gradient(circle at 50% -45%, rgba(255,236,183,0.15), transparent 62%), linear-gradient(145deg, rgba(24,21,22,0.96), rgba(9,12,24,0.96))",
                borderColor: "rgba(225,195,126,0.76)",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.10), 0 0 0 1px rgba(255,255,255,0.045), 0 0 24px rgba(203,164,78,0.16), 0 18px 44px rgba(0,0,0,0.48)",
                ...outsideFocusStyle,
              }}
              aria-live="polite"
              aria-busy={horoscopeLoading}
            >
              {dailyHoroscope ? (
                <p className="text-[13px] leading-[1.55] text-slate-200">
                  {dailyHoroscope}
                </p>
              ) : (
                <div className="flex w-full flex-col items-center justify-center">
                  <button
                    type="button"
                    onClick={revealDailyHoroscope}
                    disabled={horoscopeLoading}
                    className="flex min-h-[52px] w-full items-center justify-center text-[13px] font-medium uppercase tracking-[0.15em] text-[#E8D5A5] transition-[color,opacity,text-shadow] duration-300 enabled:hover:text-[#FFF1C9] disabled:cursor-wait disabled:opacity-65"
                    style={{ textShadow: "0 0 16px rgba(218,183,105,0.20)" }}
                  >
                    {horoscopeLoading ? "Preparing Today’s Horoscope…" : horoscopeError ? "Try Daily Horoscope Again" : "Tap For Daily Horoscope"}
                  </button>
                  {horoscopeError && (
                    <p className="-mt-1 max-w-[310px] text-[10px] leading-4 text-rose-200/75">
                      {horoscopeError}
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* ── YOUR READINGS — compact doorway to the saved-reading archive ── */}
            <button
              type="button"
              onClick={() => {
                if (onOpenReadings) {
                  onOpenReadings();
                  return;
                }
                window.location.assign("/readings");
              }}
              className="your-readings-shell order-4 flex min-h-[68px] w-[78%] self-center items-center justify-center px-6 text-center transition-[transform,box-shadow,opacity,filter] duration-300"
              aria-label="Open your saved readings"
              style={outsideFocusStyle}
            >
              <span
                className="relative z-10 text-[14px] font-semibold uppercase tracking-[0.22em] text-slate-100"
                style={{
                  textShadow:
                    "0 2px 10px rgba(0,0,0,0.92), 0 0 18px rgba(255,255,255,0.16), 0 0 24px rgba(218,183,105,0.16)",
                }}
              >
                Your Readings
              </span>
            </button>
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
