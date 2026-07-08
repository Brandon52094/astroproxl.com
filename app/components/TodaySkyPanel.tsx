"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Moon,
  Sun,
  Sparkles,
  Orbit,
  RotateCcw,
  Crown,
  CalendarDays,
  CloudSun,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { loadChart } from "@/lib/chartStore";

/**
 * TODAY'S SKY — one scrollable, weather-app-style page.
 *
 * Merges Daily Transits + Moon Cycles + Birth Chart into a single
 * vertical scroll, modeled on the iOS Weather detail view:
 *
 *   HERO      → date + live clock (the "temperature"), moon-in-sign
 *               as the "condition" line
 *   CARD GRID → 2-col small cards + full-width cards, each with the
 *               icon + small-caps label header, hairline dividers,
 *               big light numerals
 *
 * This panel intentionally has NO overflow of its own — it grows to
 * natural height and lets PagerContainer's panel wrapper
 * (overflow-y-auto) do the scrolling, so vertical swipes scroll and
 * horizontal swipes page. Keep it that way.
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

interface WeatherNow {
  temp: number;
  label: string;
}

const GLYPHS: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂",
  Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
  "North Node": "☊", "South Node": "☋", Ascendant: "↑", Midheaven: "⟂",
};

const SIGN_GLYPHS: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
  Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑",
  Aquarius: "♒", Pisces: "♓",
};

const IMPORTANT_PLANETS = ["Moon", "Mercury", "Venus", "Mars", "North Node", "South Node"];
const NATAL_ORDER = ["Sun", "Moon", "Ascendant", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];

// Open-Meteo WMO weather codes → short labels
const WEATHER_LABELS: Record<number, string> = {
  0: "Clear", 1: "Mostly Clear", 2: "Partly Cloudy", 3: "Overcast",
  45: "Fog", 48: "Fog", 51: "Drizzle", 53: "Drizzle", 55: "Drizzle",
  61: "Rain", 63: "Rain", 65: "Heavy Rain", 71: "Snow", 73: "Snow",
  75: "Heavy Snow", 80: "Showers", 81: "Showers", 82: "Heavy Showers",
  95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm",
};

/* ── Weather-style card chrome ─────────────────────────────────────── */

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
        "rounded-[22px] border border-white/[0.07] p-4 backdrop-blur-md",
        className
      )}
      style={{
        background:
          "linear-gradient(180deg, rgba(42,48,84,0.42) 0%, rgba(30,35,64,0.38) 100%)",
        boxShadow: "0 14px 34px rgba(0,0,0,0.42)",
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-slate-400" strokeWidth={2.2} />
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

/* ── SVG moon drawn from the real illumination percent ─────────────── */

function MoonDisc({ illumination, waxing, size = 96 }: { illumination: number; waxing: boolean; size?: number }) {
  const f = Math.min(1, Math.max(0, illumination / 100));
  const r = 46;
  const c = 50;
  const top = `${c} ${c - r}`;
  const bottom = `${c} ${c + r}`;
  const rx = Math.abs(1 - 2 * f) * r;

  // Outer limb arc goes around the lit side; terminator ellipse closes it.
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
      {/* dark side */}
      <circle cx={c} cy={c} r={r} fill="#1B2038" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
      {/* lit side */}
      {f > 0.995 ? (
        <circle cx={c} cy={c} r={r} fill="url(#moonlit)" />
      ) : f > 0.005 ? (
        <path d={litPath} fill="url(#moonlit)" />
      ) : null}
      {/* craters, kept faint so they read on both lit + dark */}
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
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Live clock — ticks every second so the hero reads like a clock face.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

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
    if (data.transits) setTransits(data.transits);
    if (data.moonPhase) setMoonPhase(data.moonPhase);
    if (data.profection) setProfection(data.profection);
    const planets = data.tropical?.planets ?? [];
    setNatal(
      planets
        .filter((p) => NATAL_ORDER.includes(p.name))
        .sort((a, b) => NATAL_ORDER.indexOf(a.name) - NATAL_ORDER.indexOf(b.name))
    );
    setIsLoading(false);

    // Mini weather — best effort, silently hidden if it fails.
    const saved = chart as unknown as { currentLat?: number; currentLng?: number; lat?: number; lng?: number };
    const lat = saved.currentLat ?? saved.lat;
    const lng = saved.currentLng ?? saved.lng;
    if (typeof lat === "number" && typeof lng === "number") {
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((w) => {
          const temp = w?.current?.temperature_2m;
          const code = w?.current?.weather_code;
          if (typeof temp === "number") {
            setWeather({ temp: Math.round(temp), label: WEATHER_LABELS[code] ?? "—" });
          }
        })
        .catch(() => {});
    }
  }, []);

  const stars = useMemo(
    () =>
      Array.from({ length: 44 }).map((_, i) => ({
        id: i,
        left: `${(i * 37) % 100}%`,
        top: `${(i * 19 + 13) % 100}%`,
        size: i % 7 === 0 ? 2.8 : 1.5,
        opacity: i % 5 === 0 ? 0.7 : 0.35,
        delay: (i * 0.37) % 4,
      })),
    []
  );

  const sunNow = useMemo(() => transits.find((p) => p.name === "Sun"), [transits]);
  const moonNow = useMemo(() => transits.find((p) => p.name === "Moon"), [transits]);
  const retrogrades = useMemo(() => transits.filter((p) => p.isRetrograde), [transits]);
  const importantTransits = useMemo(
    () => transits.filter((p) => IMPORTANT_PLANETS.includes(p.name)),
    [transits]
  );
  const bigThree = useMemo(() => {
    const find = (n: string) => natal.find((p) => p.name === n);
    return { sun: find("Sun"), moon: find("Moon"), rising: find("Ascendant") };
  }, [natal]);

  const waxing = moonPhase?.nextEventName === "Full Moon";

  const dateLine = now.toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });
  const timeLine = now.toLocaleTimeString(undefined, {
    hour: "numeric", minute: "2-digit",
  });
  const seconds = now.toLocaleTimeString(undefined, { second: "2-digit" }).padStart(2, "0");

  const conditionLine = [
    moonPhase ? `Moon in ${moonPhase.moonSign}` : moonNow ? `Moon in ${moonNow.sign}` : null,
    moonPhase?.phaseName ?? null,
  ]
    .filter(Boolean)
    .join("  |  ");

  if (isLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#050816]">
        <div className="text-sm text-slate-400">Reading the sky…</div>
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen w-full text-slate-100"
      style={{
        background:
          "linear-gradient(180deg, #0B0F26 0%, #0A0D20 30%, #050816 72%, #040611 100%)",
      }}
    >
      {/* ── Starfield + ambient glow ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-24 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full blur-[110px]"
          style={{ background: "radial-gradient(circle, rgba(129,140,248,0.14), transparent 70%)" }}
        />
        {stars.map((star) => (
          <motion.span
            key={star.id}
            className="absolute rounded-full bg-white"
            style={{ left: star.left, top: star.top, width: star.size, height: star.size, opacity: star.opacity }}
            animate={
              shouldReduceMotion
                ? undefined
                : { opacity: [star.opacity * 0.4, star.opacity * 1.5, star.opacity * 0.4] }
            }
            transition={
              shouldReduceMotion
                ? undefined
                : { duration: 2.4 + (star.id % 5) * 0.5, repeat: Infinity, ease: "easeInOut", delay: star.delay }
            }
          />
        ))}
      </div>

      <div
        className="relative z-10 mx-auto w-full max-w-[430px] px-4 pt-14"
        style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        {/* ── HERO — date, live clock, sky condition ── */}
        <motion.header
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="mb-7 text-center"
        >
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{dateLine}</p>
          <div className="mt-2 flex items-end justify-center gap-1.5">
            <h1 className="text-[64px] font-extralight leading-none tracking-tight text-white tabular-nums">
              {timeLine.replace(/\s?(AM|PM)/i, "")}
            </h1>
            <div className="mb-2 flex flex-col items-start leading-none">
              <span className="text-[13px] font-medium text-slate-300">
                {/AM/i.test(timeLine) ? "AM" : "PM"}
              </span>
              <span className="mt-0.5 text-[11px] text-slate-500 tabular-nums">:{seconds}</span>
            </div>
          </div>
          {conditionLine && (
            <p className="mt-2 text-[15px] text-slate-300">{conditionLine}</p>
          )}
          <p className="mt-4 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-slate-600">
            Swipe right for readings <ChevronRight className="h-3 w-3" />
          </p>
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
          className="space-y-3"
        >
          {/* ── ROW: Sun season | Moon sign ── */}
          <div className="grid grid-cols-2 gap-3">
            <SkyCard icon={Sun} label="Sun Season">
              <p className="text-[28px] font-light leading-tight text-white">
                {sunNow ? sunNow.sign : "—"}
              </p>
              <p className="mt-6 text-[12px] leading-5 text-slate-400">
                {sunNow ? `${SIGN_GLYPHS[sunNow.sign] ?? ""} ${sunNow.degree} — where the Sun sits today.` : "Calculate your chart to see today's sky."}
              </p>
            </SkyCard>
            <SkyCard icon={Moon} label="Moon Sign">
              <p className="text-[28px] font-light leading-tight text-white">
                {moonPhase?.moonSign ?? moonNow?.sign ?? "—"}
              </p>
              <p className="mt-6 text-[12px] leading-5 text-slate-400">
                {moonPhase
                  ? `${SIGN_GLYPHS[moonPhase.moonSign] ?? ""} ${moonPhase.moonDegree} — the day's emotional weather.`
                  : "The day's emotional weather."}
              </p>
            </SkyCard>
          </div>

          {/* ── FULL: Moon cycle (mirrors the iOS "Last Quarter" card) ── */}
          {moonPhase && (
            <SkyCard icon={Moon} label={moonPhase.phaseName}>
              <div className="flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                    <span className="text-[13px] text-slate-300">Illumination</span>
                    <span className="text-[13px] font-medium text-white tabular-nums">
                      {moonPhase.illuminationPercent}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/[0.06] py-3">
                    <span className="text-[13px] text-slate-300">Moon Sign</span>
                    <span className="text-[13px] font-medium text-white">
                      {moonPhase.moonSign} {moonPhase.moonDegree}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-3">
                    <span className="text-[13px] text-slate-300">Next {moonPhase.nextEventName}</span>
                    <span className="text-[13px] font-medium text-white">
                      {moonPhase.daysUntilNextEvent} <span className="text-[11px] uppercase tracking-wide text-slate-400">days</span>
                    </span>
                  </div>
                </div>
                <div className="shrink-0" style={{ filter: "drop-shadow(0 0 22px rgba(226,223,240,0.18))" }}>
                  <MoonDisc illumination={moonPhase.illuminationPercent} waxing={waxing} />
                </div>
              </div>
            </SkyCard>
          )}

          {/* ── FULL: What matters today ── */}
          <SkyCard icon={Sparkles} label="What Matters Today">
            <div className="space-y-3">
              {importantTransits.map((planet, index) => (
                <div
                  key={planet.name}
                  className={cn(
                    "flex items-center gap-3",
                    index < importantTransits.length - 1 && "border-b border-white/[0.06] pb-3"
                  )}
                >
                  <span className="w-7 text-center text-xl text-slate-300">
                    {GLYPHS[planet.name] ?? "•"}
                  </span>
                  <span className="w-24 text-[12px] font-medium uppercase tracking-wide text-slate-400">
                    {planet.name}
                  </span>
                  <span className="flex-1 text-[15px] font-medium text-white">
                    {planet.sign}
                  </span>
                  <span className="text-[13px] text-slate-300 tabular-nums">
                    {planet.degree}
                    {planet.isRetrograde && <span className="ml-1 text-amber-300/80">℞</span>}
                  </span>
                </div>
              ))}
              {importantTransits.length === 0 && (
                <p className="py-3 text-center text-[12px] text-slate-500">
                  No major transits to show yet.
                </p>
              )}
            </div>
          </SkyCard>

          {/* ── ROW: Retrogrades | Time Lord ── */}
          <div className="grid grid-cols-2 gap-3">
            <SkyCard icon={RotateCcw} label="Retrogrades">
              <p className="text-[40px] font-extralight leading-none text-white tabular-nums">
                {retrogrades.length}
              </p>
              <p className="mt-5 text-[12px] leading-5 text-slate-400">
                {retrogrades.length > 0
                  ? retrogrades.map((p) => p.name).join(", ")
                  : "Every planet is moving direct."}
              </p>
            </SkyCard>
            <SkyCard icon={Crown} label="Time Lord">
              <p className="text-[28px] font-light leading-tight text-white">
                {profection?.timeLord ?? "—"}
              </p>
              <p className="mt-6 text-[12px] leading-5 text-slate-400">
                {profection
                  ? `${profection.profectionYear}th house year — ${profection.activatedSign} activated.`
                  : "Calculate your chart to reveal this year's ruler."}
              </p>
            </SkyCard>
          </div>

          {/* ── FULL: All transits ── */}
          <SkyCard icon={Orbit} label="All Transits">
            <div className="grid grid-cols-3 gap-1 border-b border-white/[0.06] pb-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">
              <span>Planet</span>
              <span>Sign</span>
              <span className="text-right">Degree</span>
            </div>
            <div className="divide-y divide-white/[0.05]">
              {transits.map((planet) => {
                const highlighted = IMPORTANT_PLANETS.includes(planet.name);
                return (
                  <div key={planet.name} className="grid grid-cols-3 gap-1 py-2.5 text-[13px]">
                    <span className="flex items-center gap-2">
                      <span className={cn("text-base", highlighted ? "text-slate-200" : "text-slate-500")}>
                        {GLYPHS[planet.name] ?? "•"}
                      </span>
                      <span className={highlighted ? "font-medium text-white" : "text-slate-300"}>
                        {planet.name}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <span>{SIGN_GLYPHS[planet.sign] ?? ""}</span>
                      <span>{planet.sign}</span>
                    </span>
                    <span className="text-right text-slate-300 tabular-nums">
                      {planet.degree}
                      {planet.isRetrograde && <span className="ml-1 text-amber-300/80">℞</span>}
                    </span>
                  </div>
                );
              })}
              {transits.length === 0 && (
                <p className="py-4 text-center text-[12px] text-slate-500">
                  Calculate your chart to see today's transits.
                </p>
              )}
            </div>
          </SkyCard>

          {/* ── FULL: Your birth chart ── */}
          <SkyCard icon={Sparkles} label="Your Birth Chart">
            <div className="mb-4 grid grid-cols-3 gap-2">
              {(
                [
                  { label: "Sun", p: bigThree.sun },
                  { label: "Moon", p: bigThree.moon },
                  { label: "Rising", p: bigThree.rising },
                ] as const
              ).map(({ label, p }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/[0.06] bg-black/20 px-3 py-3 text-center"
                >
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
                  <p className="mt-1 text-[15px] font-medium text-white">{p?.sign ?? "—"}</p>
                  <p className="text-[11px] text-slate-400 tabular-nums">{p?.degree ?? ""}</p>
                </div>
              ))}
            </div>
            <div className="divide-y divide-white/[0.05]">
              {natal
                .filter((p) => !["Sun", "Moon", "Ascendant"].includes(p.name))
                .map((planet) => (
                  <div key={planet.name} className="flex items-center justify-between py-2.5 text-[13px]">
                    <span className="flex items-center gap-2 text-slate-300">
                      <span className="text-base text-slate-500">{GLYPHS[planet.name] ?? "•"}</span>
                      {planet.name}
                    </span>
                    <span className="text-slate-200 tabular-nums">
                      {planet.sign} {planet.degree}
                      {planet.house ? <span className="ml-1 text-[11px] text-slate-500">H{planet.house}</span> : null}
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

          {/* ── ROW: Next moon event | mini weather (weather hides itself if unavailable) ── */}
          <div className={cn("grid gap-3", weather ? "grid-cols-2" : "grid-cols-1")}>
            {moonPhase && (
              <SkyCard icon={CalendarDays} label={`Next ${moonPhase.nextEventName}`}>
                <p className="text-[40px] font-extralight leading-none text-white tabular-nums">
                  {moonPhase.daysUntilNextEvent}
                  <span className="ml-1 align-baseline text-[14px] font-normal uppercase tracking-wide text-slate-400">
                    days
                  </span>
                </p>
                <p className="mt-5 text-[12px] leading-5 text-slate-400">
                  {waxing ? "The Moon is building toward fullness." : "The Moon is emptying toward a reset."}
                </p>
              </SkyCard>
            )}
            {weather && (
              <SkyCard icon={CloudSun} label="Weather">
                <p className="text-[40px] font-extralight leading-none text-white tabular-nums">
                  {weather.temp}°
                </p>
                <p className="mt-5 text-[12px] leading-5 text-slate-400">{weather.label} where you are now.</p>
              </SkyCard>
            )}
          </div>

          <p className="pt-2 text-center text-[10px] text-slate-600">
            {transits.length} transits · {retrogrades.length} retrograde · updated live
          </p>
        </motion.div>
      </div>
    </div>
  );
}