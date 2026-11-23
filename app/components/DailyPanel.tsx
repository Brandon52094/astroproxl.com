"use client";

import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import { loadChart } from "@/lib/chartStore";

/**
 * YOUR DAY — a daily view, its own panel in PagerContainer.
 *
 *   Profection Year + Today's Sky   (one card)
 *   Daily Horoscope                 (fills the space; scrolls inside if long)
 *   Elemental Balance               (74px slot)
 *   Big Three                       (one card)
 *
 * The panel fills its pager slot exactly (height: 100%) and never scrolls the
 * page, so nothing sits under the status bar or Safari's toolbar. Built from
 * the approved mockup; the short-screen rules at the bottom of the styles keep
 * iPhone SE in a browser (375×548) on one screen.
 */

interface UserStatus {
  credits: number;
  isSubscribed: boolean;
  readingsCompleted: number;
  onCooldown: boolean;
  cooldownExpiresAt: string | null;
  canBypass: boolean;
}

interface DailyPanelProps {
  userStatus?: UserStatus | null;
  /** True while this panel is the one on screen. The horoscope is fetched the first time it becomes active. */
  isActive?: boolean;
  dailyHoroscope?: string | null;
  onOpenHoroscope?: () => Promise<string | null | void> | string | null | void;
}

interface NatalPlacement { name: string; sign: string; degree: string; house?: number }
interface UpgradeChartPoint { name: string; sign: string; degree: string; house: string }
interface TransitPlanet { name: string; sign: string; degree: string; isRetrograde: boolean; house?: number }
interface MoonPhaseData {
  phaseName: string;
  illuminationPercent: number;
  nextEventName: "New Moon" | "Full Moon";
  daysUntilNextEvent: number;
  moonSign: string;
  moonDegree: string;
}
interface ProfectionData { profectionYear: number; age: number; activatedSign: string; activatedHouse?: number; timeLord: string }

/* ── Vocabulary ─────────────────────────────────────────────────────── */
// U+FE0E forces text presentation so iOS never swaps these for emoji.
const T = "︎";
const GLYPHS: Record<string, string> = {
  Sun: `☉${T}`, Moon: `☽${T}`, Mercury: `☿${T}`, Venus: `♀${T}`, Mars: `♂${T}`,
  Jupiter: `♃${T}`, Saturn: `♄${T}`, Uranus: `♅${T}`, Neptune: `♆${T}`, Pluto: `♇${T}`,
};

const SIGN_RULERS: Record<string, string> = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon",
  Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Mars",
  Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter",
};

// Keep element balance anchored to the original natal set (no angles or calculated points).
const ELEMENT_BALANCE_ORDER = ["Sun", "Moon", "Ascendant", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];

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
const NEUTRAL = "#94A3B8";

const elementOf = (sign?: string): Element | null => (sign ? SIGN_ELEMENTS[sign] ?? null : null);
const colorsOf = (sign?: string) => { const el = elementOf(sign); return el ? ELEMENT_COLORS[el] : null; };
const ordinal = (n: number) => { const s = ["th", "st", "nd", "rd"]; const v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`; };
const rulerPhrase = (planet: string) => (planet === "Sun" || planet === "Moon" ? `the ${planet}` : planet);

function localDayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
const horoscopeKey = () => `astroproxl:daily-horoscope:${localDayKey()}`;

function nextEventLine(m: MoonPhaseData): string {
  const d = Math.round(m.daysUntilNextEvent);
  if (d <= 0) return `${m.nextEventName} today`;
  return `${m.nextEventName} in ${d} ${d === 1 ? "day" : "days"}`;
}

/* ── Moon drawn from the real illumination percent (same geometry as TodaySkyPanel) ── */
function MoonDisc({ illumination, waxing, size = 46 }: { illumination: number; waxing: boolean; size?: number }) {
  const gradientId = useId().replace(/:/g, "");
  const f = Math.min(1, Math.max(0, illumination / 100));
  const r = 46, c = 50;
  const top = `${c} ${c - r}`, bottom = `${c} ${c + r}`;
  const rx = Math.abs(1 - 2 * f) * r;
  const outerSweep = waxing ? 1 : 0;
  const terminatorSweep = f >= 0.5 ? (waxing ? 1 : 0) : (waxing ? 0 : 1);
  const litPath = `M ${top} A ${r} ${r} 0 0 ${outerSweep} ${bottom} A ${rx} ${r} 0 0 ${terminatorSweep} ${top}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id={`dpMoon${gradientId}`} cx="38%" cy="34%" r="75%">
          <stop offset="0%" stopColor="#F1EFF7" />
          <stop offset="55%" stopColor="#C9C7D6" />
          <stop offset="100%" stopColor="#9A98AC" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={r} fill="#151A30" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
      {f > 0.995 ? (
        <circle cx={c} cy={c} r={r} fill={`url(#dpMoon${gradientId})`} />
      ) : f > 0.005 ? (
        <path d={litPath} fill={`url(#dpMoon${gradientId})`} />
      ) : null}
      <circle cx="38" cy="40" r="7" fill="rgba(0,0,0,0.10)" />
      <circle cx="60" cy="58" r="5" fill="rgba(0,0,0,0.09)" />
      <circle cx="52" cy="30" r="3.5" fill="rgba(0,0,0,0.08)" />
    </svg>
  );
}

/* ── Panel ──────────────────────────────────────────────────────────── */
export default function DailyPanel({ isActive = true, dailyHoroscope: horoscopeProp, onOpenHoroscope }: DailyPanelProps) {
  const [natal, setNatal] = useState<NatalPlacement[]>([]);
  const [transits, setTransits] = useState<TransitPlanet[]>([]);
  const [moonPhase, setMoonPhase] = useState<MoonPhaseData | null>(null);
  const [profection, setProfection] = useState<ProfectionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [horoscope, setHoroscope] = useState<string | null>(null);
  const [horoscopeLoading, setHoroscopeLoading] = useState(false);
  const [horoscopeError, setHoroscopeError] = useState<string | null>(null);
  // Built on the client only, so server and client render the same markup.
  const [dateLine, setDateLine] = useState("");

  /* Load the chart (retry briefly while it is being calculated). */
  useEffect(() => {
    let cancelled = false;
    const tryLoad = () => {
      const chart = loadChart();
      if (!chart?.chartData) return false;
      const data = chart.chartData as unknown as {
        tropical?: { planets?: NatalPlacement[] };
        upgradeChartPoints?: UpgradeChartPoint[];
        transits?: TransitPlanet[];
        moonPhase?: MoonPhaseData;
        profection?: ProfectionData;
      };
      const upgrade = data.upgradeChartPoints ?? [];
      setNatal(
        upgrade.length
          ? upgrade.map((p) => ({ name: p.name, sign: p.sign, degree: p.degree, house: p.house ? Number(p.house) : undefined }))
          : data.tropical?.planets ?? [],
      );
      setTransits(data.transits ?? []);
      setMoonPhase(data.moonPhase ?? null);
      setProfection(data.profection ?? null);
      setIsLoading(false);
      return true;
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

  /* Today's date + the cached horoscope for today. */
  useEffect(() => {
    setDateLine(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }));
    try {
      const cached = window.localStorage.getItem(horoscopeKey());
      if (cached) setHoroscope(cached);
    } catch { /* storage unavailable */ }
  }, []);

  /* A horoscope passed in from the parent wins and is cached for the day. */
  useEffect(() => {
    const h = horoscopeProp?.trim();
    if (!h) return;
    setHoroscope(h);
    try { window.localStorage.setItem(horoscopeKey(), h); } catch { /* storage unavailable */ }
  }, [horoscopeProp]);

  const fetchHoroscope = useCallback(async () => {
    if (horoscopeLoading) return;
    setHoroscopeLoading(true);
    setHoroscopeError(null);
    try {
      let result: string | null | void;
      if (onOpenHoroscope) {
        result = await onOpenHoroscope();
      } else {
        const chartData = loadChart()?.chartData as unknown as {
          tropical?: { planets?: unknown[] };
          transits?: unknown[];
          transitAspects?: unknown[];
          profection?: unknown;
          moonPhase?: unknown;
        } | undefined;
        if (!chartData?.tropical?.planets?.length) throw new Error("Your chart is still loading. Please try again.");
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
        const payload = (await response.json().catch(() => null)) as { horoscope?: string; error?: string } | null;
        if (!response.ok) throw new Error(payload?.error || "Today’s horoscope could not be prepared.");
        result = payload?.horoscope ?? null;
      }
      if (typeof result === "string" && result.trim()) {
        const h = result.trim();
        setHoroscope(h);
        try { window.localStorage.setItem(horoscopeKey(), h); } catch { /* storage unavailable */ }
      } else if (!onOpenHoroscope) {
        throw new Error("Today’s horoscope returned without a message. Please try again.");
      }
    } catch (error) {
      setHoroscopeError(error instanceof Error ? error.message : "Today’s horoscope could not be prepared.");
    } finally {
      setHoroscopeLoading(false);
    }
  }, [horoscopeLoading, onOpenHoroscope]);

  /* Fetch only once the panel is actually on screen, so swiping past costs nothing. */
  useEffect(() => {
    if (!isActive || isLoading || horoscope || horoscopeLoading || horoscopeError) return;
    if (!natal.length) return;
    void fetchHoroscope();
  }, [isActive, isLoading, horoscope, horoscopeLoading, horoscopeError, natal.length, fetchHoroscope]);

  /* ── Derived ── */
  const find = useCallback((n: string) => natal.find((p) => p.name === n), [natal]);
  const bigThree = useMemo(
    () => [
      { label: "Sun", p: find("Sun") },
      { label: "Moon", p: find("Moon") },
      { label: "Rising", p: find("Ascendant") },
    ],
    [find],
  );

  const elementCounts = useMemo(() => {
    const counts: Record<Element, number> = { Fire: 0, Earth: 0, Air: 0, Water: 0 };
    natal.forEach((p) => {
      if (!ELEMENT_BALANCE_ORDER.includes(p.name)) return;
      const el = elementOf(p.sign);
      if (el) counts[el] += 1;
    });
    return counts;
  }, [natal]);
  const maxCount = Math.max(...ELEMENT_ORDER.map((el) => elementCounts[el]), 1);

  const sunNow = transits.find((p) => p.name === "Sun");
  const moonNow = transits.find((p) => p.name === "Moon");
  const retrogrades = transits.filter((p) => p.isRetrograde === true).map((p) => p.name);
  const moonSign = moonPhase?.moonSign ?? moonNow?.sign;
  const waxing = moonPhase?.nextEventName === "Full Moon";

  const profSign = profection?.activatedSign ?? "";
  const profColors = colorsOf(profSign);
  const profRuler = profection?.timeLord || SIGN_RULERS[profSign] || "";
  const profHouse =
    typeof profection?.activatedHouse === "number"
      ? profection.activatedHouse
      : typeof profection?.profectionYear === "number"
        ? profection.profectionYear
        : null;

  if (isLoading) {
    return (
      <div className="dp dp-center">
        <p className="dp-quiet">Reading today’s sky…</p>
        <style jsx global>{`.dp-center { align-items: center; justify-content: center; } .dp-quiet { font-size: 13px; color: #94A3B8; }`}</style>
      </div>
    );
  }

  const hasChart = natal.length > 0;
  const tint = bigThree.map(({ p }) => colorsOf(p?.sign)?.bar ?? NEUTRAL);

  return (
    <div className="dp">
      <style jsx global>{`
        .dp {
          --dp-display: var(--font-display), "Cormorant Garamond", Georgia, serif;
          --dp-caps: var(--font-caps), Cinzel, Georgia, serif;
          --dp-gold: rgba(241, 214, 148, 0.9);
          --s100: #F1F5F9; --s200: #E2E8F0; --s300: #CBD5E1; --s400: #94A3B8; --s500: #64748B; --s600: #475569;
          position: relative;
          box-sizing: border-box;
          height: 100%;
          width: 100%;
          max-width: 430px;
          margin: 0 auto;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          gap: 12px;
          /* Lines up with Reading Intake: the Profection card's top meets the hero's top
             (Intake's 6px + its swipe line), and the Big Three card's bottom meets the mic
             button's bottom (Intake's 10px + caption gap + 14px caption). Keep these tokens
             and tiers in step with ReadingIntakeScreen. */
          --swipe-h: 32px;
          --cap-mt: 14px;
          padding:
            calc(env(safe-area-inset-top) + 6px + var(--swipe-h))
            clamp(12px, 4vw, 16px)
            calc(env(safe-area-inset-bottom) + 10px + var(--cap-mt) + 14px);
          color: var(--s100);
          font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
        }
        .dp * { box-sizing: border-box; }
        :where(.dp) :where(p, h2) { margin: 0; }
        .dp-display { font-family: var(--dp-display); }
        .dp-caps { font-family: var(--dp-caps); text-transform: uppercase; }

        /* Shine sweep (symbol box, Big Three) */
        @keyframes dpShine { 0% { transform: translateX(-140%) skewX(-18deg); } 60%, 100% { transform: translateX(240%) skewX(-18deg); } }
        .dp-shine { position: relative; overflow: hidden; isolation: isolate; }
        .dp-shine::after {
          content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 45%; pointer-events: none; z-index: 1;
          background: linear-gradient(105deg, transparent 0%, rgba(255,255,255,.09) 45%, rgba(255,255,255,.16) 50%, rgba(255,255,255,.09) 55%, transparent 100%);
          transform: translateX(-140%) skewX(-18deg);
          animation: dpShine 4.6s ease-in-out infinite;
        }
        .dp-shine > * { position: relative; z-index: 2; }

        /* Card: static light edge, dark fill, no glow */
        .dp-card { flex-shrink: 0; padding: 1.5px; border-radius: 22px; background: linear-gradient(160deg, rgba(255,255,255,.16), rgba(255,255,255,.06) 50%, rgba(255,255,255,.12)); }
        .dp-card-in { border-radius: 20.5px; overflow: hidden; background: linear-gradient(170deg, rgba(10,13,28,.97), rgba(5,8,20,.97)); }

        /* ── Profection + Today's Sky ── */
        .dp-today .dp-card-in { padding: 9px 14px 8px; }
        .dp-prof { position: relative; height: 74px; padding: 0 58px 2px; display: flex; align-items: center; justify-content: center; }
        .dp-symbol { position: absolute; left: 2px; top: 50%; margin-top: -23px; width: 46px; height: 46px; border-radius: 14px; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.2); display: flex; align-items: center; justify-content: center; font-family: var(--dp-display); font-size: 21px; }
        .dp-prof-text { min-width: 0; text-align: center; }
        .dp-eyebrow { font-size: 8.5px; font-weight: 500; letter-spacing: .28em; color: var(--dp-gold); white-space: nowrap; }
        .dp-prof-title { margin-top: 2px !important; font-size: 28px; font-weight: 500; line-height: 1.05; color: #fff; }
        .dp-prof-sub { margin-top: 3px !important; font-size: 10.5px; color: var(--s400); white-space: nowrap; }

        .dp-sky { margin-top: 6px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,.06); }
        .dp-sky .dp-eyebrow { text-align: center; }
        .dp-sky-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px; margin-top: 4px; }
        .dp-sky-col { min-width: 0; text-align: center; }
        .dp-sky-label { font-size: 7.5px; font-weight: 600; letter-spacing: .18em; color: var(--s500); white-space: nowrap; }
        .dp-sky-sign { margin-top: 1px !important; font-size: 22px; font-weight: 500; line-height: 1.05; }
        .dp-sky-detail { margin-top: 1px !important; font-size: 10.5px; color: var(--s400); white-space: nowrap; font-variant-numeric: tabular-nums; }
        .dp-moon { display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0 0 16px rgba(226,223,240,.16)); }
        .dp-moon-pct { margin-top: 1px !important; font-size: 9.5px; color: var(--s400); font-variant-numeric: tabular-nums; }
        .dp-sky-foot { margin-top: 5px !important; padding-top: 6px; border-top: 1px solid rgba(255,255,255,.06); text-align: center; font-size: 10.5px; color: var(--s400); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dp-sky-foot .dp-dot { margin: 0 6px; color: var(--s600); }
        .dp-sky-foot .dp-rx { color: rgba(252,211,77,.8); }

        /* ── Daily Horoscope ── */
        .dp-horo { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .dp-horo-title { text-align: center; font-size: clamp(25px, 7.4vw, 30px); font-weight: 500; line-height: 1.05; color: #fff; }
        .dp-horo-date { margin-top: 4px !important; min-height: 11px; text-align: center; font-size: 8.5px; font-weight: 600; letter-spacing: .22em; color: var(--dp-gold); }
        .dp-horo-body {
          margin-top: 8px !important; flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: none; padding: 0 2px;
          font-size: 16.5px; line-height: 1.42; color: var(--s200);
          -webkit-mask-image: linear-gradient(#000 84%, transparent); mask-image: linear-gradient(#000 84%, transparent);
        }
        .dp-horo-body::-webkit-scrollbar { display: none; }
        .dp-horo-status { margin-top: 10px !important; text-align: center; font-family: var(--dp-display); font-style: italic; font-size: 15px; color: var(--s400); }
        .dp-retry { border: 0; background: none; padding: 0; color: inherit; font: inherit; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }

        /* ── Elemental Balance (74px slot, title under the bars) ── */
        .dp-elements { flex-shrink: 0; height: 74px; margin-bottom: -6px; display: flex; flex-direction: column; justify-content: flex-end; }
        .dp-els { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 2px 22px 5px; }
        .dp-el { height: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 9px; }
        @keyframes dpGrow { from { transform: scaleY(0); opacity: 0; } to { transform: scaleY(1); opacity: 1; } }
        @keyframes dpBreath { 0%, 100% { box-shadow: 0 0 8px var(--eb); } 50% { box-shadow: 0 0 18px var(--eb), 0 0 4px var(--eb); } }
        @keyframes dpFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .dp-el-bar { display: block; width: 5px; height: calc(14% + var(--r) * 80%); border-radius: 3px; transform-origin: bottom;
          animation: dpGrow .8s cubic-bezier(.22,1,.36,1) var(--d) both, dpBreath 3.2s ease-in-out calc(var(--d) + .8s) infinite; }
        .dp-el-name { font-size: 7.5px; font-weight: 600; letter-spacing: .12em; line-height: 1.12; animation: dpFadeUp .6s ease-out calc(var(--d) + .25s) both; }
        .dp-elements-title { text-align: center; font-size: 7.5px; font-weight: 500; letter-spacing: .26em; color: var(--s500); }

        /* ── Big Three ── */
        .dp-b3-row { height: 90px; display: flex; }
        .dp-b3-cell { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
        .dp-vdiv { width: 1px; align-self: stretch; margin: 14px 0; background: linear-gradient(180deg, transparent, rgba(255,255,255,.14), transparent); }
        .dp-b3-label { font-size: 8.5px; font-weight: 500; letter-spacing: .2em; color: var(--s500); }
        .dp-b3-sign { margin-top: 3px !important; font-size: clamp(19px, 5.6vw, 23px); font-weight: 600; line-height: 1.05; color: #fff; }
        .dp-b3-deg { margin-top: 1px !important; font-size: 10.5px; color: var(--s400); font-variant-numeric: tabular-nums; }
        .dp-b3-el { margin-top: 4px !important; font-size: 8px; font-weight: 600; letter-spacing: .22em; }

        .dp-empty { margin: auto; padding: 32px 0; text-align: center; font-size: 13px; line-height: 1.6; color: var(--s400); }

        /* Short screens: the horoscope absorbs the difference */
        @media (max-height: 870px) {
          .dp { --swipe-h: 28px; --cap-mt: 12px; }
        }
        @media (max-height: 680px) {
          .dp { gap: 10px; --cap-mt: 10px; }
          .dp-b3-row { height: 76px; }
          .dp-b3-sign { font-size: 20px; }
          .dp-b3-el { display: none; }
        }
        @media (max-height: 560px) {
          .dp { --swipe-h: 26px; }
          .dp-b3-sign { font-size: 19px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .dp-shine::after { animation: none !important; opacity: 0; }
          .dp-el-bar, .dp-el-name { animation: none !important; }
        }
      `}</style>

      {!hasChart ? (
        <p className="dp-empty">Enter your birth details to reveal your day.</p>
      ) : (
        <>
          {/* ── Profection Year + Today's Sky ── */}
          <section className="dp-card dp-today" aria-label="Profection year and today's sky">
            <div className="dp-card-in">
              <div className="dp-prof">
                <div
                  className="dp-symbol dp-shine"
                  aria-hidden="true"
                  style={profColors ? { borderColor: profColors.border, boxShadow: `0 0 18px ${profColors.glow}, inset 0 0 12px ${profColors.glow}` } : undefined}
                >
                  <span style={{ color: profColors?.text ?? NEUTRAL }}>{GLYPHS[profRuler] ?? "✦"}</span>
                </div>
                <div className="dp-prof-text">
                  <p className="dp-caps dp-eyebrow">Profection Year</p>
                  <p className="dp-display dp-prof-title" style={{ color: profColors?.text ?? "#fff" }}>{profSign || "—"}</p>
                  <p className="dp-prof-sub">
                    {profHouse ? `${ordinal(profHouse)} house` : ""}
                    {profHouse && profRuler ? " · " : ""}
                    {profRuler ? `ruled by ${rulerPhrase(profRuler)}` : ""}
                  </p>
                </div>
              </div>

              <div className="dp-sky">
                <p className="dp-caps dp-eyebrow">Today’s Sky</p>
                <div className="dp-sky-row">
                  <div className="dp-sky-col">
                    <p className="dp-caps dp-sky-label">{GLYPHS.Sun} Sun Season</p>
                    <p className="dp-display dp-sky-sign" style={{ color: colorsOf(sunNow?.sign)?.text ?? "#fff" }}>{sunNow?.sign ?? "—"}</p>
                    <p className="dp-sky-detail">{sunNow?.degree ?? ""}</p>
                  </div>
                  {moonPhase ? (
                    <div className="dp-moon">
                      <MoonDisc illumination={moonPhase.illuminationPercent} waxing={waxing} size={46} />
                      <p className="dp-moon-pct">{moonPhase.illuminationPercent}%</p>
                    </div>
                  ) : (
                    <span aria-hidden="true" />
                  )}
                  <div className="dp-sky-col">
                    <p className="dp-caps dp-sky-label">{GLYPHS.Moon} Moon</p>
                    <p className="dp-display dp-sky-sign" style={{ color: colorsOf(moonSign)?.text ?? "#fff" }}>{moonSign ?? "—"}</p>
                    <p className="dp-sky-detail">{moonPhase?.phaseName ?? moonNow?.degree ?? ""}</p>
                  </div>
                </div>
                <p className="dp-sky-foot">
                  {moonPhase ? nextEventLine(moonPhase) : "Today’s sky"}
                  <span className="dp-dot">·</span>
                  <span className="dp-rx">℞</span> {retrogrades.length ? retrogrades.join(", ") : "All direct"}
                </p>
              </div>
            </div>
          </section>

          {/* ── Daily Horoscope ── */}
          <section className="dp-horo" aria-live="polite">
            <h2 className="dp-display dp-horo-title">Daily Horoscope</h2>
            <p className="dp-caps dp-horo-date">{dateLine}</p>
            {horoscope ? (
              <p className="dp-display dp-horo-body">{horoscope}</p>
            ) : horoscopeError ? (
              <p className="dp-horo-status">
                {horoscopeError}{" "}
                <button type="button" className="dp-retry" onClick={() => void fetchHoroscope()}>Try again</button>
              </p>
            ) : (
              <p className="dp-horo-status">Preparing today’s horoscope…</p>
            )}
          </section>

          {/* ── Elemental Balance ── */}
          <section
            className="dp-elements"
            role="img"
            aria-label={`Elemental balance: ${ELEMENT_ORDER.map((el) => `${el} ${elementCounts[el]}`).join(", ")}`}
          >
            <div className="dp-els" aria-hidden="true">
              {ELEMENT_ORDER.map((el, i) => {
                const c = ELEMENT_COLORS[el];
                return (
                  <div key={el} className="dp-el">
                    <span
                      className="dp-el-bar"
                      style={{ background: c.bar, ["--r" as string]: (elementCounts[el] / maxCount).toFixed(3), ["--eb" as string]: c.glow, ["--d" as string]: `${i * 0.14}s` } as React.CSSProperties}
                    />
                    <span className="dp-caps dp-el-name" style={{ color: c.text, ["--d" as string]: `${i * 0.14}s` } as React.CSSProperties}>{el}</span>
                  </div>
                );
              })}
            </div>
            <p className="dp-caps dp-elements-title">Elemental Balance</p>
          </section>

          {/* ── Big Three ── */}
          <section className="dp-card" aria-label="Big Three">
            <div
              className="dp-card-in dp-shine"
              style={{ background: `linear-gradient(90deg, ${tint[0]}1F, ${tint[1]}1A 50%, ${tint[2]}1F), linear-gradient(170deg, rgba(10,13,28,.97), rgba(5,8,20,.97))` }}
            >
              <div className="dp-b3-row">
                {bigThree.map(({ label, p }, i) => {
                  const c = colorsOf(p?.sign);
                  return (
                    <React.Fragment key={label}>
                      {i > 0 && <span className="dp-vdiv" aria-hidden="true" />}
                      <div className="dp-b3-cell">
                        <p className="dp-caps dp-b3-label">{label}</p>
                        <p className="dp-display dp-b3-sign" style={{ color: c?.text ?? "#fff" }}>{p?.sign ?? "—"}</p>
                        <p className="dp-b3-deg">{p?.degree ?? ""}</p>
                        {p && c && <p className="dp-caps dp-b3-el" style={{ color: c.text }}>{elementOf(p.sign)}</p>}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}