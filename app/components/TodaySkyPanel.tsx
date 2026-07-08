"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles, RotateCcw, Crown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadChart } from "@/lib/chartStore";

/**
 * TODAY'S SKY — v3
 *
 * - Weather card removed. "Next New/Full Moon" card removed — that info
 *   now lives in the hero, directly under the moon disc.
 * - Section order: HERO → Retrogrades | Time Lord → YOUR BIRTH CHART →
 *   TRANSITS (last on the page).
 * - Big 3 boxes are outlined in their sign's ELEMENT color (fire, earth,
 *   air, water) with a soft glow and a slow shine sweep — outline only,
 *   the box fill stays dark. Element name sits under the degree.
 *
 * This panel has NO overflow of its own — PagerContainer's wrapper
 * scrolls it. Keep it that way.
 */

interface UserStatus {
  firstReadingUsed: boolean;
  paywallsCompleted: number;
  isSubscribed: boolean;
  readingsCompleted: number;
  onCooldown: boolean;
  cooldownExpiresAt: string | null;
  canBypass: boolean;
  freeReadingResetAt: string | null;
  freeReadingAvailable: boolean;
}

interface TodaySkyPanelProps {
  userStatus: UserStatus | null;
}

interface TransitPlanet {
  name: string;
  sign: string;
  degree: string;
  isRetrograde: boolean;
  house?: number;
}

interface NatalPlacement {
  name: string;
  sign: string;
  degree: string;
  house?: number;
}

interface MoonPhaseData {
  phaseName: string;
  illuminationPercent: number;
  nextEventName: "New Moon" | "Full Moon";
  daysUntilNextEvent: number;
  moonSign: string;
  moonDegree: string;
}

interface ProfectionData {
  profectionYear: number;
  age: number;
  activatedSign: string;
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

const IMPORTANT_PLANETS = ["Moon", "Mercury", "Venus", "Mars", "North Node", "South Node"];
const NATAL_ORDER = ["Sun", "Moon", "Ascendant", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const TRANSIT_ORDER = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node", "South Node"];

/* ── The four elements ─────────────────────────────────────────────── */

type Element = "Fire" | "Earth" | "Air" | "Water";

const SIGN_ELEMENTS: Record<string, Element> = {
  Aries: "Fire", Leo: "Fire", Sagittarius: "Fire",
  Taurus: "Earth", Virgo: "Earth", Capricorn: "Earth",
  Gemini: "Air", Libra: "Air", Aquarius: "Air",
  Cancer: "Water", Scorpio: "Water", Pisces: "Water",
};

const ELEMENT_COLORS: Record<Element, { border: string; glow: string; text: string }> = {
  Fire:  { border: "rgba(249, 115, 22, 0.75)", glow: "rgba(239, 68, 68, 0.28)",  text: "#FDBA74" },
  Earth: { border: "rgba(52, 211, 153, 0.65)", glow: "rgba(16, 185, 129, 0.24)", text: "#6EE7B7" },
  Air:   { border: "rgba(186, 230, 253, 0.60)", glow: "rgba(125, 211, 252, 0.22)", text: "#BAE6FD" },
  Water: { border: "rgba(96, 165, 250, 0.70)",  glow: "rgba(59, 130, 246, 0.26)",  text: "#93C5FD" },
};

function elementOf(sign?: string): Element | null {
  if (!sign) return null;
  return SIGN_ELEMENTS[sign] ?? null;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/* ── Card chrome — matches Reading Intake surfaces ─────────────────── */

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

/* ── SVG moon drawn from the real illumination percent ─────────────── */

function MoonDisc({ illumination, waxing, size = 108 }: { illumination: number; waxing: boolean; size?: number }) {
  const f = Math.min(1, Math.max(0, illumination / 100));
  const r = 46;
  const c = 50;
  const top = `${c} ${c - r}`;
  const bottom = `${c} ${c + r}`;
  const rx = Math.abs(1 - 2 * f) * r;

  const outerSweep = waxing ? 1 : 0;
  const terminatorSweep = f >= 0.5 ? (waxing ? 1 : 0) : (waxing ? 0 : 1);
  const litPath = `M ${top} A ${r} ${r} 0 0 ${outerSweep} ${bottom} A ${rx} ${r} 0 0 ${terminatorSweep} ${top}`;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id="moonlit" cx="38%" cy="34%" r="75%">
          <stop offset="0%" stopColor="#F1EFF7" />
          <stop offset="55%" stopColor="#C9C7D6" />
          <stop offset="100%" stopColor="#9A98AC" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={r} fill="#151A30" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
      {f > 0.995 ? (
        <circle cx={c} cy={c} r={r} fill="url(#moonlit)" />
      ) : f > 0.005 ? (
        <path d={litPath} fill="url(#moonlit)" />
      ) : null}
      <circle cx="38" cy="40" r="7" fill="rgba(0,0,0,0.10)" />
      <circle cx="60" cy="58" r="5" fill="rgba(0,0,0,0.09)" />
      <circle cx="52" cy="30" r="3.5" fill="rgba(0,0,0,0.08)" />
      <circle cx="42" cy="66" r="4" fill="rgba(0,0,0,0.08)" />
    </svg>
  );
}

/* ── Panel ──────────────────────────────────────────────────────────── */

export default function TodaySkyPanel({ userStatus }: TodaySkyPanelProps) {
  const shouldReduceMotion = useReducedMotion();

  const [transits, setTransits] = useState<TransitPlanet[]>([]);
  const [natal, setNatal] = useState<NatalPlacement[]>([]);
  const [moonPhase, setMoonPhase] = useState<MoonPhaseData | null>(null);
  const [profection, setProfection] = useState<ProfectionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const chart = loadChart();
    if (!chart?.chartData) {
      setIsLoading(false);
      return;
    }
    const data = chart.chartData as unknown as {
      transits?: TransitPlanet[];
      moonPhase?: MoonPhaseData;
      profection?: ProfectionData;
      tropical?: { planets?: NatalPlacement[] };
    };
    if (data.transits) {
      setTransits(
        [...data.transits].sort(
          (a, b) => TRANSIT_ORDER.indexOf(a.name) - TRANSIT_ORDER.indexOf(b.name)
        )
      );
    }
    if (data.moonPhase) setMoonPhase(data.moonPhase);
    if (data.profection) setProfection(data.profection);
    const planets = data.tropical?.planets ?? [];
    setNatal(
      planets
        .filter((p) => NATAL_ORDER.includes(p.name))
        .sort((a, b) => NATAL_ORDER.indexOf(a.name) - NATAL_ORDER.indexOf(b.name))
    );
    setIsLoading(false);
  }, []);

  // Same star recipe as ReadingIntakeScreen — 68 stars, same seeds.
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

  const sunNow = useMemo(() => transits.find((p) => p.name === "Sun"), [transits]);
  const moonNow = useMemo(() => transits.find((p) => p.name === "Moon"), [transits]);
  const retrogrades = useMemo(() => transits.filter((p) => p.isRetrograde), [transits]);
  const bigThree = useMemo(() => {
    const find = (n: string) => natal.find((p) => p.name === n);
    return { sun: find("Sun"), moon: find("Moon"), rising: find("Ascendant") };
  }, [natal]);

  const hasProfection =
    !!profection &&
    typeof profection.profectionYear === "number" &&
    !!profection.timeLord &&
    !!profection.activatedSign;

  const waxing = moonPhase?.nextEventName === "Full Moon";

  const dateLine = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const heroDetail = (p: TransitPlanet | undefined, fallbackDegree?: string) => {
    const degree = p?.degree ?? fallbackDegree;
    if (!degree) return null;
    return (
      <p className="mt-0.5 text-[13px] text-slate-400 tabular-nums">
        {degree}
        {p?.house ? <span className="text-slate-500"> · {ordinal(p.house)} house</span> : null}
        {p?.isRetrograde ? <span className="ml-1 text-amber-300/80">℞</span> : null}
      </p>
    );
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#050816]">
        <div className="text-sm text-slate-400">Reading the sky…</div>
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen w-full font-sans text-slate-100"
      style={{
        background: "linear-gradient(180deg, #061120 0%, #050816 44%, #040611 100%)",
      }}
    >
      <style jsx>{`
        /* Slow shine sweep across the Big 3 element boxes */
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
        className="relative z-10 mx-auto w-full max-w-[430px] px-4 pt-5"
        style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        {/* ── HERO — Sun + Moon, borderless, data-first ── */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="mb-6"
        >
          <p className="text-center text-[10px] uppercase tracking-[0.24em] text-slate-500">
            {dateLine}
          </p>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  {GLYPHS.Sun} Sun Season
                </p>
                <p className="text-[34px] font-light leading-tight text-white">
                  {sunNow?.sign ?? "—"}
                </p>
                {heroDetail(sunNow)}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  {GLYPHS.Moon} Moon
                </p>
                <p className="text-[34px] font-light leading-tight text-white">
                  {moonPhase?.moonSign ?? moonNow?.sign ?? "—"}
                </p>
                {heroDetail(moonNow, moonPhase?.moonDegree)}
              </div>
            </div>

            {moonPhase && (
              <div className="shrink-0 text-center">
                <div style={{ filter: "drop-shadow(0 0 26px rgba(226,223,240,0.16))" }}>
                  <MoonDisc illumination={moonPhase.illuminationPercent} waxing={waxing} />
                </div>
                {/* Next event — surplus info, right under the moon */}
                <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  {moonPhase.nextEventName}
                </p>
                <p className="text-[13px] font-medium text-slate-200 tabular-nums">
                  in {moonPhase.daysUntilNextEvent} days
                </p>
              </div>
            )}
          </div>

          {/* Phase stats — borderless, right under the hero */}
          {moonPhase && (
            <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Phase</p>
                <p className="mt-0.5 text-[13px] font-medium text-slate-200">{moonPhase.phaseName}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Illumination</p>
                <p className="mt-0.5 text-[13px] font-medium text-slate-200 tabular-nums">
                  {moonPhase.illuminationPercent}%
                </p>
              </div>
            </div>
          )}
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
          className="space-y-3"
        >
          {/* ── ROW: Retrogrades | Time Lord ── */}
          <div className="grid grid-cols-2 gap-3">
            <SkyCard icon={RotateCcw} label="Retrogrades">
              <p className="text-[38px] font-extralight leading-none text-white tabular-nums">
                {retrogrades.length}
              </p>
              <p className="mt-4 text-[12px] leading-5 text-slate-400">
                {retrogrades.length > 0
                  ? retrogrades.map((p) => p.name).join(", ")
                  : "Every planet is moving direct."}
              </p>
            </SkyCard>
            <SkyCard icon={Crown} label="Time Lord">
              {hasProfection ? (
                <>
                  <p className="text-[26px] font-light leading-tight text-white">
                    {profection!.timeLord}
                  </p>
                  <p className="mt-4 text-[12px] leading-5 text-slate-400">
                    {ordinal(profection!.profectionYear)} house year — {profection!.activatedSign} activated.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[26px] font-light leading-tight text-slate-500">—</p>
                  <p className="mt-4 text-[12px] leading-5 text-slate-500">
                    Recalculate your chart to reveal this year's ruler.
                  </p>
                </>
              )}
            </SkyCard>
          </div>

          {/* ── FULL: Your birth chart — Big 3 outlined in their element ── */}
          <SkyCard icon={Sparkles} label="Your Birth Chart">
            <div className="mb-4 grid grid-cols-3 gap-2">
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
                    className="element-box rounded-2xl border bg-black/20 px-3 py-3 text-center"
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
                    <p className="mt-1 text-[15px] font-medium text-white">{p?.sign ?? "—"}</p>
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
            <div className="divide-y divide-white/5">
              {natal
                .filter((p) => !["Sun", "Moon", "Ascendant"].includes(p.name))
                .map((planet) => (
                  <div key={planet.name} className="flex items-center justify-between py-2.5 text-[13px]">
                    <span className="flex items-center gap-2 text-slate-300">
                      <span className="w-6 text-center text-base text-slate-500">
                        {GLYPHS[planet.name] ?? "•"}
                      </span>
                      {planet.name}
                    </span>
                    <span className="text-slate-200 tabular-nums">
                      {planet.sign} {planet.degree}
                      {planet.house ? (
                        <span className="ml-1 text-[11px] text-slate-500">· {ordinal(planet.house)}</span>
                      ) : null}
                    </span>
                  </div>
                ))}
              {natal.length === 0 && (
                <p className="py-4 text-center text-[12px] text-slate-500">
                  Enter your birth details to see your placements here.
                </p>
              )}
            </div>
          </SkyCard>

          {/* ── FULL: Transits — last on the page ── */}
          <SkyCard icon={Sparkles} label="Transits">
            <div className="space-y-3">
              {transits.map((planet, index) => {
                const important = IMPORTANT_PLANETS.includes(planet.name);
                return (
                  <div
                    key={planet.name}
                    className={cn(
                      "flex items-center gap-3",
                      index < transits.length - 1 && "border-b border-white/5 pb-3"
                    )}
                  >
                    <span
                      className={cn(
                        "w-8 text-center text-xl",
                        important ? "text-amber-300/80" : "text-slate-500"
                      )}
                    >
                      {GLYPHS[planet.name] ?? "•"}
                    </span>
                    <span
                      className={cn(
                        "w-24 text-[12px] font-medium uppercase tracking-wide",
                        important ? "text-slate-300" : "text-slate-500"
                      )}
                    >
                      {planet.name}
                    </span>
                    <span
                      className={cn(
                        "flex-1 text-[15px]",
                        important ? "font-medium text-white" : "text-slate-300"
                      )}
                    >
                      {planet.sign}
                    </span>
                    <span
                      className={cn(
                        "text-[13px] tabular-nums",
                        important ? "text-amber-300/70" : "text-slate-400"
                      )}
                    >
                      {planet.degree}
                      {planet.isRetrograde && <span className="ml-1">℞</span>}
                    </span>
                  </div>
                );
              })}
              {transits.length === 0 && (
                <p className="py-3 text-center text-[12px] text-slate-500">
                  Calculate your chart to see today's transits.
                </p>
              )}
            </div>
          </SkyCard>

          <p className="flex items-center justify-center gap-1 pt-2 text-center text-[10px] uppercase tracking-[0.18em] text-slate-600">
            Swipe right for readings <ChevronRight className="h-3 w-3" />
          </p>
        </motion.div>
      </div>
    </div>
  );
}
