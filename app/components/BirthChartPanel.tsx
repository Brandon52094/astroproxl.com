"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles, Compass, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { loadChart } from "@/lib/chartStore";

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

const ASPECT_GLYPHS: Record<string, string> = {
  conjunction: `☌${T}`,
  opposition: `☍${T}`,
  square: `□${T}`,
  trine: `△${T}`,
  sextile: `⚹${T}`,
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

export default function BirthChartPanel({ userStatus }: BirthChartPanelProps) {
  const shouldReduceMotion = useReducedMotion();
  const router = useRouter();

  const [natal, setNatal] = useState<NatalPlacement[]>([]);
  const [aspects, setAspects] = useState<NatalAspect[]>([]);
  const [profection, setProfection] = useState<ProfectionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  const hasProfection =
    !!profection &&
    typeof profection.profectionYear === "number" &&
    !!profection.activatedSign;

  const profectionElement = elementOf(profection?.activatedSign);
  const profectionColors = profectionElement ? ELEMENT_COLORS[profectionElement] : null;

  if (isLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#050816]">
        <div className="text-sm text-slate-400">Casting your chart…</div>
      </div>
    );
  }

  const hasChart = natal.length > 0;

  return (
    <div
      className="relative min-h-screen w-full font-sans text-slate-100"
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

        @media (prefers-reduced-motion: reduce) {
          .element-box::after { animation: none !important; opacity: 0; }
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

      <div
        className="relative z-10 mx-auto w-full max-w-[430px] px-4 pt-16"
        style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        {/* ── HERO — the Big 3, elementally outlined ── */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="mb-6"
        >
          <p className="text-center text-[10px] uppercase tracking-[0.24em] text-slate-500">
            Your Birth Chart
          </p>
          <h1 className="mt-1 text-center text-[22px] font-light tracking-tight text-white">
            The map of you
          </h1>

          {hasChart ? (
            <div className="mt-5 grid grid-cols-3 gap-2.5">
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
                    className="element-box rounded-2xl border bg-black/20 px-2 py-4 text-center"
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
                    <p className="mt-1.5 text-[17px] font-medium leading-tight text-white">{p?.sign ?? "—"}</p>
                    <p className="text-[11px] text-slate-400 tabular-nums">{p?.degree ?? ""}</p>
                    {element && colors && (
                      <p
                        className="mt-1.5 text-[9px] font-medium uppercase tracking-[0.18em]"
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
            <p className="mt-6 text-center text-[13px] leading-6 text-slate-400">
              Enter your birth details to reveal your chart.
            </p>
          )}
        </motion.header>

        {hasChart && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
            className="space-y-3"
          >
            {/* ── Profection Year — the sign/house theme of your current year ── */}
            {hasProfection && (
              <SkyCard icon={Compass} label="Your Profection Year">
                <div className="flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[26px] font-light leading-tight text-white">
                      {profection!.activatedSign} Year
                    </p>
                    <p className="mt-2 text-[12px] leading-5 text-slate-400">
                      {typeof profection!.activatedHouse === "number"
                        ? `${ordinal(profection!.activatedHouse)} house activated`
                        : `${ordinal(profection!.profectionYear)} house year`}
                      {typeof profection!.age === "number" ? ` · age ${profection!.age}` : ""}.
                    </p>
                  </div>
                  {profectionColors && (
                    <div
                      className="element-box flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border bg-black/20"
                      style={{
                        borderColor: profectionColors.border,
                        boxShadow: `0 0 22px ${profectionColors.glow}, inset 0 0 14px ${profectionColors.glow}`,
                      }}
                    >
                      <span className="text-2xl" style={{ color: profectionColors.text }}>
                        {GLYPHS[SIGN_RULER_GLYPH(profection!.activatedSign)] ?? "✦"}
                      </span>
                    </div>
                  )}
                </div>
              </SkyCard>
            )}

            {/* ── Major Aspects ── */}
            {aspects.length > 0 && (
              <SkyCard icon={Sparkles} label="Major Aspects">
                <div className="flex flex-wrap gap-2">
                  {aspects.map((asp, i) => {
                    const glyphA = GLYPHS[asp.planetA] ?? "•";
                    const glyphB = GLYPHS[asp.planetB] ?? "•";
                    const aspectGlyph = ASPECT_GLYPHS[asp.type?.toLowerCase()] ?? "•";
                    return (
                      <div
                        key={`${asp.planetA}-${asp.planetB}-${i}`}
                        className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[13px]"
                      >
                        <span className="text-slate-300">{glyphA}</span>
                        <span className="text-slate-500">{aspectGlyph}</span>
                        <span className="text-slate-300">{glyphB}</span>
                        <span className="ml-1 text-[11px] text-slate-500 tabular-nums">
                          {asp.orbDegrees}°
                        </span>
                      </div>
                    );
                  })}
                </div>
              </SkyCard>
            )}

            {/* ── Element Balance — quick "about me" read ── */}
            {elementBalance.total > 0 && (
              <SkyCard icon={Sparkles} label="Element Balance">
                <div className="space-y-2.5">
                  {ELEMENT_ORDER.map((el) => {
                    const count = elementBalance.counts[el];
                    const pct = Math.round((count / elementBalance.total) * 100);
                    const colors = ELEMENT_COLORS[el];
                    return (
                      <div key={el} className="flex items-center gap-3">
                        <span
                          className="w-14 text-[11px] font-medium uppercase tracking-[0.12em]"
                          style={{ color: colors.text }}
                        >
                          {el}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.7, ease: "easeOut" }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: colors.bar, opacity: 0.85 }}
                          />
                        </div>
                        <span className="w-6 text-right text-[12px] text-slate-400 tabular-nums">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-[12px] leading-5 text-slate-400">
                  Your chart leans{" "}
                  <span style={{ color: ELEMENT_COLORS[elementBalance.dominant].text }}>
                    {elementBalance.dominant}
                  </span>
                  .
                </p>
              </SkyCard>
            )}

            {/* ── Recalculate — heals charts built by older engine versions ── */}
            <button
              type="button"
              onClick={() => router.push("/chart-data?recalculate=true")}
              style={{
                display: "block",
                margin: "8px auto 20px",
                background: "transparent",
                border: "none",
                color: "#64748b",
                fontSize: "13px",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
                cursor: "pointer",
              }}
            >
              Recalculate chart
            </button>

            {/* ── Full placements ── */}
            <SkyCard icon={Sparkles} label="All Placements">
              <div className="divide-y divide-white/5">
                {natal.map((planet) => {
                  const element = elementOf(planet.sign);
                  const colors = element ? ELEMENT_COLORS[element] : null;
                  const displayName = planet.name === "Ascendant" ? "Rising" : planet.name;
                  return (
                    <div key={planet.name} className="flex items-center justify-between py-2.5 text-[13px]">
                      <span className="flex items-center gap-2 text-slate-300">
                        <span className="w-6 text-center text-base text-slate-500">
                          {GLYPHS[planet.name] ?? "•"}
                        </span>
                        {displayName}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-slate-200 tabular-nums">
                          {planet.sign} {planet.degree}
                          {planet.house ? (
                            <span className="ml-1 text-[11px] text-slate-500">· {ordinal(planet.house)}</span>
                          ) : null}
                        </span>
                        {colors && (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: colors.bar, boxShadow: `0 0 6px ${colors.glow}` }}
                          />
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </SkyCard>

            <p className="flex items-center justify-center gap-3 pt-2 text-center text-[10px] uppercase tracking-[0.18em] text-slate-600">
              <span className="flex items-center gap-1">
                <ChevronLeft className="h-3 w-3" /> Readings
              </span>
              <span className="text-slate-700">·</span>
              <span className="flex items-center gap-1">
                Today's Sky <ChevronRight className="h-3 w-3" />
              </span>
            </p>
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