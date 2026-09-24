"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Heart,
  Briefcase,
  Wallet,
  Mic,
  Crown,
  ChevronLeft,
} from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import StarfieldBackground from "./StarfieldBackground";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import {
  saveIntake,
  loadChart,
  saveChart,
  isChartFresh,
  clearIntake,
  clearReading,
} from "@/lib/chartStore";
import { PRICING, formatUsd } from "@/lib/paywallConfig";
import JxlPanel from "./JxlPanel";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

declare global {
  interface Window {
    ttq?: {
      track: (event: string, params?: Record<string, unknown>) => void;
    };
  }
}

function trackTtq(event: string, params?: Record<string, unknown>) {
  try {
    if (typeof window !== "undefined" && window.ttq) {
      window.ttq.track(event, params);
    }
  } catch {
    // silent
  }
}

const AREAS = [
  {
    id: "love",
    title: "Love",
    description: "Relationships, romance, or emotional patterns",
    icon: Heart,
    placeholder: "Ask something specific about love, timing, or where this connection is headed.",
    defaultQuestion: "What is coming for me in love over the next 30–45 days?",
  },
  {
    id: "money",
    title: "Money",
    description: "Income, stability, opportunities, and financial timing",
    icon: Wallet,
    placeholder: "Ask something specific about money, stability, or the opportunities opening next.",
    defaultQuestion: "What is coming for me with money over the next 30–45 days?",
  },
  {
    id: "career",
    title: "Career",
    description: "Work, recognition, direction, and next steps",
    icon: Briefcase,
    placeholder: "Ask something specific about work, momentum, or the direction your career is moving.",
    defaultQuestion: "What is coming for me in my career over the next 30–45 days?",
  },
  {
    id: "other",
    title: "What's Coming",
    description: "What to expect in the next 30–45 days.",
    icon: null,
    marker: "30–45",
    placeholder: "Ask about timing, what's approaching, or what you should be ready for in the weeks ahead.",
    defaultQuestion: "What is coming for me in the next 30–45 days?",
  },
];

// One luminous cosmic aura for the current app theme. Personalized theme
// palettes can be introduced later as an intentional Astro Plus experience.
const HERO_PALETTE: [string, string, string, string] = [
  "52, 211, 153",  // emerald
  "34, 211, 238",  // cyan
  "56, 189, 248",  // sky
  "168, 85, 247",  // violet
];

// The hero's information is designed once at this width, then the entire
// composition scales together to fit the live card.
const HERO_CANVAS_WIDTH = 374;
const HERO_HORIZONTAL_INSET = 20;


interface UserStatus {
  credits: number;
  isSubscribed: boolean;
  readingsCompleted: number;
  onCooldown: boolean;
  cooldownExpiresAt: string | null;
  canBypass: boolean;
  pwaFreeReadingUsed?: boolean;
}

interface ReadingIntakeScreenProps {
  userStatus: UserStatus | null;
  onSwipeLeft?: () => void;
  /** Set false while this panel is offscreen, then true when the user swipes back. */
  isActive?: boolean;
}

/* ── Chart shapes used by the hero information system ─────────────── */
interface Placement {
  name: string;
  sign: string;
  degree?: string;
  house?: number;
  isRetrograde?: boolean;
}

interface MoonPhaseData {
  phaseName?: string;
  illuminationPercent: number;
  nextEventName?: "New Moon" | "Full Moon";
  daysUntilNextEvent?: number;
  moonSign?: string;
  moonDegree?: string;
}

type ElementName = "Earth" | "Fire" | "Water" | "Air";

const SIGN_ELEMENTS: Record<string, ElementName> = {
  Taurus: "Earth", Virgo: "Earth", Capricorn: "Earth",
  Aries: "Fire", Leo: "Fire", Sagittarius: "Fire",
  Cancer: "Water", Scorpio: "Water", Pisces: "Water",
  Gemini: "Air", Libra: "Air", Aquarius: "Air",
};

// Keep the intake hero aligned with the elemental language already used by BirthChartPanel.
const HERO_ELEMENT_COLORS: Record<ElementName, { text: string; bar: string; glow: string }> = {
  Earth: { text: "#6EE7B7", bar: "#34D399", glow: "rgba(16,185,129,0.30)" },
  Fire:  { text: "#FDBA74", bar: "#F97316", glow: "rgba(239,68,68,0.32)" },
  Water: { text: "#93C5FD", bar: "#60A5FA", glow: "rgba(59,130,246,0.30)" },
  Air:   { text: "#BAE6FD", bar: "#7DD3FC", glow: "rgba(125,211,252,0.26)" },
};

const HERO_ELEMENT_ORDER: ElementName[] = ["Earth", "Fire", "Water", "Air"];

function signAccentColor(sign: string): string {
  const element = SIGN_ELEMENTS[sign];
  return element ? HERO_ELEMENT_COLORS[element].text : "rgba(203,213,225,0.72)";
}

function signAccentGlow(sign: string): string {
  const element = SIGN_ELEMENTS[sign];
  return element ? HERO_ELEMENT_COLORS[element].glow : "rgba(148,163,184,0.12)";
}

function MoonDisc({ illumination, waxing, size = 58 }: { illumination: number; waxing: boolean; size?: number }) {
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
        <radialGradient id="intakeMoonLit" cx="38%" cy="34%" r="75%">
          <stop offset="0%" stopColor="#F1EFF7" />
          <stop offset="55%" stopColor="#C9C7D6" />
          <stop offset="100%" stopColor="#9A98AC" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={r} fill="#151A30" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      {f > 0.995 ? (
        <circle cx={c} cy={c} r={r} fill="url(#intakeMoonLit)" />
      ) : f > 0.005 ? (
        <path d={litPath} fill="url(#intakeMoonLit)" />
      ) : null}
      <circle cx="38" cy="40" r="7" fill="rgba(0,0,0,0.10)" />
      <circle cx="60" cy="58" r="5" fill="rgba(0,0,0,0.09)" />
      <circle cx="52" cy="30" r="3.5" fill="rgba(0,0,0,0.08)" />
      <circle cx="42" cy="66" r="4" fill="rgba(0,0,0,0.08)" />
    </svg>
  );
}

function SunDisc({ size = 58 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id="intakeSunCore" cx="38%" cy="34%" r="72%">
          <stop offset="0%" stopColor="#FFFCE8" />
          <stop offset="48%" stopColor="#FDE68A" />
          <stop offset="78%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#D97706" />
        </radialGradient>
        <radialGradient id="intakeSunHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(253,230,138,0.34)" />
          <stop offset="68%" stopColor="rgba(245,158,11,0.12)" />
          <stop offset="100%" stopColor="rgba(245,158,11,0)" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="49" fill="url(#intakeSunHalo)" />
      <circle cx="50" cy="50" r="46" fill="url(#intakeSunCore)" stroke="rgba(255,248,214,0.45)" strokeWidth="1" />
      <circle cx="40" cy="38" r="5.5" fill="rgba(255,255,255,0.12)" />
      <circle cx="61" cy="58" r="4" fill="rgba(180,83,9,0.10)" />
      <circle cx="56" cy="31" r="2.8" fill="rgba(255,255,255,0.10)" />
    </svg>
  );
}

type ThemeName = "cosmic";

interface ThemeColors {
  name: ThemeName;
  areaColors: {
    love: { bg: string; border: string; glow: string; text: string; gradient: string; iconBg: string };
    money: { bg: string; border: string; glow: string; text: string; gradient: string; iconBg: string };
    career: { bg: string; border: string; glow: string; text: string; gradient: string; iconBg: string };
    other: { bg: string; border: string; glow: string; text: string; gradient: string; iconBg: string };
  };
}

const THEMES: Record<ThemeName, ThemeColors> = {
  cosmic: {
    name: "cosmic",
    areaColors: {
      love: {
        bg: "rgba(131, 24, 67, 0.18)",
        border: "rgba(251, 113, 133, 0.78)",
        glow: "rgba(244, 114, 182, 0.20)",
        text: "#FDA4AF",
        iconBg: "rgba(131, 24, 67, 0.46)",
        gradient: "linear-gradient(135deg, rgba(131,24,67,0.78) 0%, rgba(190,24,93,0.56) 38%, rgba(244,114,182,0.16) 100%)",
      },
      money: {
        bg: "rgba(20, 83, 45, 0.22)",
        border: "rgba(52, 211, 153, 0.74)",
        glow: "rgba(34, 197, 94, 0.22)",
        text: "#86EFAC",
        iconBg: "rgba(20, 83, 45, 0.55)",
        gradient: "linear-gradient(135deg, rgba(20,83,45,0.85) 0%, rgba(22,101,52,0.70) 32%, rgba(34,197,94,0.20) 100%)",
      },
      career: {
        bg: "rgba(30, 58, 138, 0.22)",
        border: "rgba(147, 197, 253, 0.76)",
        glow: "rgba(59, 130, 246, 0.22)",
        text: "#93C5FD",
        iconBg: "rgba(30, 58, 138, 0.55)",
        gradient: "linear-gradient(135deg, rgba(30,58,138,0.85) 0%, rgba(37,99,235,0.70) 32%, rgba(59,130,246,0.20) 100%)",
      },
      other: {
        bg: "rgba(49, 46, 129, 0.22)",
        border: "rgba(139, 92, 246, 0.76)",
        glow: "rgba(139, 92, 246, 0.22)",
        text: "#C4B5FD",
        iconBg: "rgba(49, 46, 129, 0.55)",
        gradient: "linear-gradient(135deg, rgba(49,46,129,0.85) 0%, rgba(91,33,182,0.70) 32%, rgba(139,92,246,0.20) 100%)",
      },
    },
  },
};

// Topic-adjacent CTA colors: connected to the selected reading without simply
// duplicating the card color. Add Context keeps its separate gold/white role.
const BEGIN_READING_STYLES = {
  love: {
    background: "linear-gradient(180deg, rgba(162,28,175,0.18), rgba(88,28,135,0.08))",
    border: "rgba(240,171,252,0.80)",
    text: "#F5D0FE",
    glow: "rgba(217,70,239,0.25)",
    ring: "rgba(240,171,252,0.12)",
  },
  money: {
    background: "linear-gradient(180deg, rgba(13,148,136,0.17), rgba(15,118,110,0.07))",
    border: "rgba(94,234,212,0.80)",
    text: "#99F6E4",
    glow: "rgba(45,212,191,0.25)",
    ring: "rgba(94,234,212,0.12)",
  },
  career: {
    background: "linear-gradient(180deg, rgba(79,70,229,0.17), rgba(49,46,129,0.07))",
    border: "rgba(165,180,252,0.80)",
    text: "#C7D2FE",
    glow: "rgba(99,102,241,0.25)",
    ring: "rgba(165,180,252,0.12)",
  },
  other: {
    background: "linear-gradient(180deg, rgba(147,51,234,0.17), rgba(88,28,135,0.07))",
    border: "rgba(216,180,254,0.80)",
    text: "#E9D5FF",
    glow: "rgba(192,132,252,0.25)",
    ring: "rgba(216,180,254,0.12)",
  },
} as const;

export default function ReadingIntakeScreen({
  userStatus: propUserStatus,
  onSwipeLeft,
  isActive = true,
}: ReadingIntakeScreenProps) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [contextFocused, setContextFocused] = useState(false);
  const [isCreatingReading, setIsCreatingReading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [chartStatus, setChartStatus] = useState<"checking" | "ready" | "recalculating" | "error">("checking");
  const [userStatus, setUserStatus] = useState<UserStatus | null>(propUserStatus || null);
  useEffect(() => {
    if (propUserStatus) setUserStatus(propUserStatus);
  }, [propUserStatus]);
  const [showJxl, setShowJxl] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const theme = THEMES.cosmic;

  // Chart-derived data for the hero information circles.
  const [natal, setNatal] = useState<Placement[]>([]);
  const [transits, setTransits] = useState<Placement[]>([]);
  const [moonPhase, setMoonPhase] = useState<MoonPhaseData | null>(null);
  // Four compact information slides share the same locked hero stage.
  const [heroInfoMode, setHeroInfoMode] = useState<"personal" | "sky" | "mercury" | "elements">("personal");
  const [heroInspecting, setHeroInspecting] = useState(false);
  const [heroCycleReset, setHeroCycleReset] = useState(0);
  const [heroCompositionScale, setHeroCompositionScale] = useState(1);
  const heroStageRef = useRef<HTMLDivElement | null>(null);
  const heroHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heroHoldActivatedRef = useRef(false);
  const suppressNextHeroTapRef = useRef(false);
  const [heroSweepActive, setHeroSweepActive] = useState(false);
  const heroWasActiveRef = useRef(false);
  const previousSelectedAreaRef = useRef<string | null>(null);

  // Play the glass sweep once on entry, and once again whenever the swipe
  // container marks this panel active after the user returns to it.
  useEffect(() => {
    if (!isActive) {
      heroWasActiveRef.current = false;
      setHeroSweepActive(false);
      return;
    }
    if (heroWasActiveRef.current || shouldReduceMotion) return;

    heroWasActiveRef.current = true;
    setHeroSweepActive(false);
    const frame = window.requestAnimationFrame(() => setHeroSweepActive(true));
    return () => window.cancelAnimationFrame(frame);
  }, [isActive, shouldReduceMotion]);

  // When the user dismisses a reading choice, sweep once as the full page
  // returns. Switching directly between reading choices does not retrigger it.
  useEffect(() => {
    const hadReadingFocus = previousSelectedAreaRef.current !== null;
    const hasReadingFocus = selectedArea !== null;
    previousSelectedAreaRef.current = selectedArea;

    if (!hadReadingFocus || hasReadingFocus || !isActive || shouldReduceMotion) return;

    setHeroSweepActive(false);
    const frame = window.requestAnimationFrame(() => setHeroSweepActive(true));
    return () => window.cancelAnimationFrame(frame);
  }, [selectedArea, isActive, shouldReduceMotion]);

  useEffect(() => {
    const stage = heroStageRef.current;
    if (!stage) return;

    const updateHeroScale = (stageWidth: number) => {
      const availableWidth = Math.max(0, stageWidth - HERO_HORIZONTAL_INSET * 2);
      setHeroCompositionScale(Math.min(1, availableWidth / HERO_CANVAS_WIDTH));
    };

    updateHeroScale(stage.getBoundingClientRect().width);

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      updateHeroScale(entry.contentRect.width);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // If a reading is selected but the user does not continue into context or Begin Reading,
  // gently return the interface to its neutral state.
  const selectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearSelectionTimeout = useCallback(() => {
    if (selectionTimeoutRef.current) {
      clearTimeout(selectionTimeoutRef.current);
      selectionTimeoutRef.current = null;
    }
  }, []);

  const clearReadingFocus = useCallback(() => {
    clearSelectionTimeout();
    setSelectedArea(null);
    setQuestion("");
    setContextFocused(false);
  }, [clearSelectionTimeout]);

  const beginHeroHold = useCallback(() => {
    if (heroHoldTimerRef.current) clearTimeout(heroHoldTimerRef.current);
    heroHoldActivatedRef.current = false;
    heroHoldTimerRef.current = setTimeout(() => {
      heroHoldActivatedRef.current = true;
      setHeroInspecting(true);
      heroHoldTimerRef.current = null;
    }, 420);
  }, []);

  const endHeroHold = useCallback(() => {
    if (heroHoldTimerRef.current) {
      clearTimeout(heroHoldTimerRef.current);
      heroHoldTimerRef.current = null;
    }
    if (heroHoldActivatedRef.current) {
      suppressNextHeroTapRef.current = true;
      setHeroInspecting(false);
      heroHoldActivatedRef.current = false;
    }
  }, []);

  const cycleHeroInfo = useCallback(() => {
    if (suppressNextHeroTapRef.current) {
      suppressNextHeroTapRef.current = false;
      return;
    }

    const modes: Array<"personal" | "sky" | "mercury" | "elements"> = [
      "personal",
      "sky",
      "mercury",
      "elements",
    ];

    setHeroInfoMode((mode) => modes[(modes.indexOf(mode) + 1) % modes.length]);
    // Give the newly selected slide a full viewing interval before auto-rotation resumes.
    setHeroCycleReset((value) => value + 1);
  }, []);

  useEffect(() => {
    async function ensureChart() {
      if (isChartFresh()) { setChartStatus("ready"); return; }
      try {
        const response = await fetch("/api/user/get-chart");
        const data = await response.json();
        if (!data.chart) { router.push("/chart-data"); return; }
        setChartStatus("recalculating");
        const calcResponse = await fetch("/api/chart-calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            birthDate: data.chart.birthDate,
            birthTime: data.chart.birthTime,
            birthPlace: data.chart.birthPlace,
            lat: data.chart.lat,
            lng: data.chart.lng,
            timezone: data.chart.timezone,
          }),
        });
        const calcData = await calcResponse.json();
        if (!calcResponse.ok || !calcData.success) { setChartStatus("error"); return; }
        saveChart({
          birthDate: data.chart.birthDate,
          birthTime: data.chart.birthTime,
          birthPlace: data.chart.birthPlace,
          lat: data.chart.lat,
          lng: data.chart.lng,
          timezone: data.chart.timezone,
          // Current location fields — required by StoredChart
          currentLat: data.chart.currentLat ?? undefined,
          currentLng: data.chart.currentLng ?? undefined,
          currentPlace: data.chart.currentPlace ?? "",
          currentTimezone: data.chart.currentTimezone ?? "",
          chartData: calcData,
        });
        setChartStatus("ready");
      } catch { setChartStatus("error"); }
    }
    ensureChart();
  }, [router]);

  // Once the chart is ready, read natal placements/angles + current transits.
  // Chart payloads are not guaranteed to store `angles` as an array, so normalize
  // arrays and keyed objects before putting them into React state.
  useEffect(() => {
    if (chartStatus !== "ready") return;

    const normalizePlacements = (value: unknown): Placement[] => {
      if (Array.isArray(value)) {
        return value.flatMap((raw) => {
          if (!raw || typeof raw !== "object") return [];
          const item = raw as Record<string, unknown>;
          if (typeof item.sign !== "string") return [];
          return [{
            name: typeof item.name === "string" ? item.name : "",
            sign: item.sign,
            degree: typeof item.degree === "string" ? item.degree : undefined,
            house: typeof item.house === "number" ? item.house : undefined,
            isRetrograde: typeof item.isRetrograde === "boolean" ? item.isRetrograde : undefined,
          }];
        });
      }

      if (value && typeof value === "object") {
        return Object.entries(value as Record<string, unknown>).flatMap(([key, raw]) => {
          if (!raw || typeof raw !== "object") return [];
          const item = raw as Record<string, unknown>;
          if (typeof item.sign !== "string") return [];
          return [{
            name: typeof item.name === "string" && item.name ? item.name : key,
            sign: item.sign,
            degree: typeof item.degree === "string" ? item.degree : undefined,
            house: typeof item.house === "number" ? item.house : undefined,
            isRetrograde: typeof item.isRetrograde === "boolean" ? item.isRetrograde : undefined,
          }];
        });
      }

      return [];
    };

    const chart = loadChart();
    const data = chart?.chartData as unknown as {
      tropical?: { planets?: unknown; angles?: unknown };
      transits?: unknown;
      moonPhase?: MoonPhaseData;
    } | undefined;

    if (!data) return;

    setNatal([
      ...normalizePlacements(data.tropical?.planets),
      ...normalizePlacements(data.tropical?.angles),
    ]);
    setTransits(normalizePlacements(data.transits));
    setMoonPhase(data.moonPhase ?? null);
  }, [chartStatus]);

  const fetchInFlight = useRef(false);
  const fetchStatus = useCallback(async () => {
    if (fetchInFlight.current) return;
    fetchInFlight.current = true;
    try {
      const response = await fetch("/api/user/credits");
      const data = await response.json();
      setUserStatus({
        credits: Number(data.credits ?? 0),
        isSubscribed: data.isSubscribed === true,
        readingsCompleted: Number(data.readingsCompleted ?? 0),
        onCooldown: data.onCooldown === true,
        cooldownExpiresAt: data.cooldownExpiresAt ?? null,
        canBypass: data.canBypass === true,
        pwaFreeReadingUsed: data.pwaFreeReadingUsed === true,
      });
    } catch { }
    finally { setTimeout(() => { fetchInFlight.current = false; }, 2000); }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchStatus();
        setTimeout(() => fetchStatus(), 2000);
        setTimeout(() => fetchStatus(), 5000);
        setTimeout(() => fetchStatus(), 10000);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchStatus]);

  const selectedAreaConfig = useMemo(() => AREAS.find(a => a.id === selectedArea) ?? null, [selectedArea]);
  const heroPalette = HERO_PALETTE;
  const beginReadingStyle = selectedArea
    ? BEGIN_READING_STYLES[selectedArea as keyof typeof BEGIN_READING_STYLES]
    : null;

  /* ── Hero information — four quiet slides, one fixed stage ───────── */
  const heroData = useMemo(() => {
    const find = (arr: Placement[], names: string[]) =>
      arr.find((p) =>
        typeof p?.name === "string" &&
        names.some((name) => p.name.toLowerCase() === name.toLowerCase())
      );

    const natalSun = find(natal, ["Sun"]);
    const natalMoon = find(natal, ["Moon"]);
    const natalRising = find(natal, ["Ascendant", "Rising", "ASC"]);
    const currentSun = find(transits, ["Sun"]);
    const currentMoon = find(transits, ["Moon"]);
    const mercury = find(transits, ["Mercury"]);

    const counts: Record<ElementName, number> = { Earth: 0, Fire: 0, Water: 0, Air: 0 };
    natal.forEach((placement) => {
      const element = SIGN_ELEMENTS[placement.sign];
      if (element) counts[element] += 1;
    });
    const maxElementCount = Math.max(1, ...Object.values(counts));

    return {
      personal: [
        { role: "Sun", sign: natalSun?.sign ?? "—", degree: natalSun?.degree },
        { role: "Moon", sign: natalMoon?.sign ?? "—", degree: natalMoon?.degree },
        { role: "Rising", sign: natalRising?.sign ?? "—", degree: natalRising?.degree },
      ],
      currentSun,
      currentMoon,
      mercury,
      counts,
      maxElementCount,
    };
  }, [natal, transits]);

  const moonWaxing = moonPhase?.nextEventName === "Full Moon";

  useEffect(() => {
    // Keep the current slide still while a reading is focused or this panel is
    // offscreen. The timer restarts from that same slide when focus returns.
    if (heroInspecting || selectedArea || !isActive) return;

    const modes: Array<"personal" | "sky" | "mercury" | "elements"> = [
      "personal",
      "sky",
      "mercury",
      "elements",
    ];
    const id = window.setInterval(() => {
      setHeroInfoMode((mode) => modes[(modes.indexOf(mode) + 1) % modes.length]);
    }, 4800);
    return () => window.clearInterval(id);
  }, [heroInspecting, selectedArea, isActive, heroCycleReset]);

  const buttonCopy = useMemo(() => {
    if (chartStatus === "recalculating") return "Loading your chart…";
    if (isCreatingReading) return "Preparing reading...";
    if (!selectedAreaConfig) return "Begin Reading";
    const hasCredits = Number(userStatus?.credits ?? 0) > 0;
    const isSubscribed = userStatus?.isSubscribed === true;
    if (!hasCredits && !isSubscribed) {
      return `Begin Reading — ${formatUsd(PRICING.reading.price)}`;
    }
    return "Begin Reading";
  }, [chartStatus, isCreatingReading, selectedAreaConfig, userStatus]);

  // Context is optional now — only a selection + a ready chart are required.
  const canSubmit = useMemo(() => {
    if (!selectedArea) return false;
    if (chartStatus !== "ready") return false;
    return true;
  }, [selectedArea, chartStatus]);

  const selectArea = useCallback((id: string) => {
    clearSelectionTimeout();
    setSelectedArea(id);
    setQuestion("");
    const area = AREAS.find((a) => a.id === id);
    trackTtq("ViewContent", { content_id: id, content_name: area?.title });

    selectionTimeoutRef.current = setTimeout(() => {
      setSelectedArea(null);
      setQuestion("");
      selectionTimeoutRef.current = null;
    }, 8000);
  }, [clearSelectionTimeout]);

  useEffect(() => {
    return () => {
      clearSelectionTimeout();
      if (heroHoldTimerRef.current) clearTimeout(heroHoldTimerRef.current);
    };
  }, [clearSelectionTimeout]);

  const handleStartReading = async () => {
    if (!canSubmit || !selectedArea) return;
    clearSelectionTimeout();
    setIsCreatingReading(true);
    setSubmitError(null);
    trackTtq("AddToCart", { content_id: selectedArea });
    try {
      clearIntake();
      clearReading();
      localStorage.removeItem("dfp_followup_return");
      localStorage.removeItem("dfp_followup_question");
      const topic = selectedArea === "love" ? "love" : selectedArea === "career" ? "career" : selectedArea === "money" ? "money" : "general";
      const areaCfg = AREAS.find((a) => a.id === selectedArea);
      const trimmed = question.trim();
      const finalQuestion = trimmed || areaCfg?.defaultQuestion || "What is coming for me in the next 30–45 days?";
      saveIntake({
        topic: topic as "love" | "career" | "money" | "general",
        area: selectedArea,
        question: finalQuestion,
        timeframeType: "month",
        timeframeValue: "next-45-days",
      });

      let status: UserStatus | null = null;
      try {
        const res = await fetch("/api/user/credits", { cache: "no-store" });
        if (res.ok) {
          const d = await res.json();
          status = {
            credits: Number(d.credits ?? 0),
            isSubscribed: d.isSubscribed === true,
            readingsCompleted: Number(d.readingsCompleted ?? 0),
            onCooldown: d.onCooldown === true,
            cooldownExpiresAt: d.cooldownExpiresAt ?? null,
            canBypass: d.canBypass === true,
            pwaFreeReadingUsed: d.pwaFreeReadingUsed === true,
          };
          setUserStatus(status);
        }
      } catch { }

      if (!status) {
        setSubmitError("Couldn't verify your credits. Please try again.");
        return;
      }

      const CREDITS_PER_READING = 1;
      const hasCredits = status.credits >= CREDITS_PER_READING;

      if (hasCredits || status.isSubscribed) {
        router.push("/reading/preparing");
        return;
      }

      const readingValue = PRICING.reading.price / 100;
      trackTtq("InitiateCheckout", { content_id: selectedArea, value: readingValue, currency: "USD" });

      const checkoutRes = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "one_time",
          // Still sent only to satisfy the route's `if (!returnUrl)` guard.
          // The embedded flow never navigates to it — we stay in the app.
          returnUrl: window.location.origin + "/reading/preparing",
        }),
      });
      const checkoutData = await checkoutRes.json();

      // Support both Stripe checkout styles:
      // - embedded checkout returns clientSecret
      // - hosted checkout returns url
      if (checkoutData?.clientSecret) {
        setClientSecret(checkoutData.clientSecret);
        return;
      }

      if (checkoutData?.url) {
        window.location.href = checkoutData.url;
        return;
      }

      setSubmitError("Couldn't start checkout. Please try again.");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setIsCreatingReading(false);
    }
  };

  const getAreaColors = useCallback((areaId: string) => {
    const key = (["love", "money", "career", "other"].includes(areaId) ? areaId : "other") as keyof ThemeColors["areaColors"];
    return theme.areaColors[key];
  }, [theme]);

  return (
    <div
      className="no-scrollbar relative min-h-[100dvh] w-full min-w-0 max-w-full overflow-x-hidden text-slate-100"
      style={{
        background: "linear-gradient(180deg, #061120 0%, #050816 44%, #040611 100%)",
      }}
    >
      <style jsx>{`
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; width: 0; height: 0; }
        .tap-fix { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }

        .nebula {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background:
            radial-gradient(ellipse 60% 40% at 20% 25%, rgba(91,33,182,0.18), transparent 60%),
            radial-gradient(ellipse 50% 35% at 80% 60%, rgba(37,99,235,0.14), transparent 60%),
            radial-gradient(ellipse 45% 40% at 55% 85%, rgba(20,120,110,0.10), transparent 60%);
          opacity: 0.94;
        }

        @keyframes heroShine {
          0% { transform: translateX(-140%) skewX(-18deg); }
          100% { transform: translateX(240%) skewX(-18deg); }
        }
        .hero-shine { position: relative; overflow: hidden; isolation: isolate; }
        .hero-shine::after {
          content: "";
          position: absolute;
          top: 0; bottom: 0; left: 0;
          width: 45%;
          background: linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.09) 45%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0.09) 55%, transparent 100%);
          transform: translateX(-140%) skewX(-18deg);
          pointer-events: none;
          z-index: 1;
        }
        .hero-shine-sweep::after {
          animation: heroShine 2.75s cubic-bezier(0.22, 1, 0.36, 1) 1 forwards;
        }
        .hero-shine > * { position: relative; z-index: 2; }

        /* ── HERO AURA — separate from hero content so focus can remove only the glow ── */
        @property --hero-c1-color { syntax: "<color>"; inherits: true; initial-value: rgb(52, 211, 153); }
        @property --hero-c2-color { syntax: "<color>"; inherits: true; initial-value: rgb(34, 211, 238); }
        @property --hero-c3-color { syntax: "<color>"; inherits: true; initial-value: rgb(56, 189, 248); }
        @property --hero-c4-color { syntax: "<color>"; inherits: true; initial-value: rgb(168, 85, 247); }

        .hero-glow-shell {
          position: relative;
          border-radius: 28px;
          box-shadow: 0 18px 44px rgba(0,0,0,0.72), 0 36px 80px rgba(0,0,0,0.56);
        }
        .hero-glow-shell::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 0;
          border-radius: inherit;
          pointer-events: none;
          opacity: 1;
          border: 1px solid color-mix(in srgb, var(--hero-c1-color) 90%, transparent);
          box-shadow:
            0 0 26px 2px color-mix(in srgb, var(--hero-c1-color) 70%, transparent),
            0 0 70px 10px color-mix(in srgb, var(--hero-c1-color) 42%, transparent),
            0 0 130px 26px color-mix(in srgb, var(--hero-c1-color) 26%, transparent);
          animation: heroBorderGlow 9s ease-in-out infinite;
          /* Focus release: return quickly, without a hard snap. */
          transition: opacity 350ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .hero-glow-shell-focus::before {
          opacity: 0;
          /* Enter focus responsively; the reverse transition uses 350ms above. */
          transition-duration: 900ms;
        }
        @keyframes heroBorderGlow {
          0%, 100% {
            border-color: color-mix(in srgb, var(--hero-c1-color) 90%, transparent);
            box-shadow: 0 0 26px 2px color-mix(in srgb, var(--hero-c1-color) 70%, transparent), 0 0 70px 10px color-mix(in srgb, var(--hero-c1-color) 42%, transparent), 0 0 130px 26px color-mix(in srgb, var(--hero-c1-color) 26%, transparent);
          }
          25% {
            border-color: color-mix(in srgb, var(--hero-c2-color) 90%, transparent);
            box-shadow: 0 0 26px 2px color-mix(in srgb, var(--hero-c2-color) 70%, transparent), 0 0 70px 10px color-mix(in srgb, var(--hero-c2-color) 42%, transparent), 0 0 130px 26px color-mix(in srgb, var(--hero-c2-color) 26%, transparent);
          }
          50% {
            border-color: color-mix(in srgb, var(--hero-c3-color) 90%, transparent);
            box-shadow: 0 0 26px 2px color-mix(in srgb, var(--hero-c3-color) 70%, transparent), 0 0 70px 10px color-mix(in srgb, var(--hero-c3-color) 42%, transparent), 0 0 130px 26px color-mix(in srgb, var(--hero-c3-color) 26%, transparent);
          }
          75% {
            border-color: color-mix(in srgb, var(--hero-c4-color) 90%, transparent);
            box-shadow: 0 0 26px 2px color-mix(in srgb, var(--hero-c4-color) 70%, transparent), 0 0 70px 10px color-mix(in srgb, var(--hero-c4-color) 42%, transparent), 0 0 130px 26px color-mix(in srgb, var(--hero-c4-color) 26%, transparent);
          }
        }

        .standard-shadow {
          box-shadow:
            0 18px 38px rgba(0,0,0,0.78),
            0 34px 72px rgba(0,0,0,0.58),
            0 48px 96px rgba(0,0,0,0.34);
        }

        /* ── PREMIUM CONTEXT — soft circulating pearl/champagne invitation ── */
        @property --context-orbit {
          syntax: "<angle>";
          inherits: false;
          initial-value: 0deg;
        }

        @keyframes contextOrbit {
          to { --context-orbit: 360deg; }
        }

        .premium-context {
          position: relative;
          isolation: isolate;
          border-color: rgba(255,255,255,0.10);
          background: transparent;
          box-shadow:
            0 18px 34px rgba(0,0,0,0.78),
            0 34px 68px rgba(0,0,0,0.46);
        }

        /* The visible edge: intentionally soft, not a hard metallic stroke. */
        .premium-context::before {
          content: "";
          position: absolute;
          inset: -2px;
          z-index: 0;
          border-radius: 22px;
          padding: 2px;
          pointer-events: none;
          background: conic-gradient(
            from var(--context-orbit) at 50% 50%,
            rgba(255,255,255,0.92) 0deg,
            rgba(255,255,255,0.52) 62deg,
            rgba(224,195,132,0.84) 90deg,
            rgba(191,148,67,0.64) 152deg,
            rgba(255,255,255,0.88) 180deg,
            rgba(255,255,255,0.48) 242deg,
            rgba(221,188,116,0.82) 270deg,
            rgba(191,148,67,0.62) 332deg,
            rgba(255,255,255,0.92) 360deg
          );
          -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0;
          filter: blur(0.35px);
          animation: contextOrbit 8s linear infinite;
          transition:
            opacity 700ms cubic-bezier(0.22,1,0.36,1),
            filter 700ms cubic-bezier(0.22,1,0.36,1);
        }

        /* A blurred aura beneath the edge makes the motion read as light, not a border. */
        .premium-context::after {
          content: "";
          position: absolute;
          inset: -5px;
          z-index: -1;
          border-radius: 25px;
          pointer-events: none;
          background: conic-gradient(
            from var(--context-orbit) at 50% 50%,
            rgba(255,255,255,0.24) 0deg,
            rgba(255,255,255,0.08) 62deg,
            rgba(218,183,105,0.30) 90deg,
            rgba(185,139,55,0.12) 152deg,
            rgba(255,255,255,0.22) 180deg,
            rgba(255,255,255,0.07) 242deg,
            rgba(218,183,105,0.28) 270deg,
            rgba(185,139,55,0.11) 332deg,
            rgba(255,255,255,0.24) 360deg
          );
          opacity: 0;
          filter: blur(10px);
          animation: contextOrbit 8s linear infinite;
          transition: opacity 700ms cubic-bezier(0.22,1,0.36,1);
        }

        .premium-context:focus-within::before,
        .premium-context-active::before {
          opacity: 0.88;
          filter: blur(0.45px)
            drop-shadow(0 0 4px rgba(255,255,255,0.16))
            drop-shadow(0 0 8px rgba(205,164,82,0.18));
        }

        .premium-context:focus-within::after,
        .premium-context-active::after {
          opacity: 0.78;
        }

        .premium-context > * {
          z-index: 1;
        }

        @media (prefers-reduced-motion: reduce) {
          .premium-context::before,
          .premium-context::after {
            animation: none;
          }
        }

        /* Focus mode: Ask Anything recedes as one unit, including the microphone. */
        .ask-focus-veil {
          position: absolute !important;
          inset: 0;
          z-index: 5 !important;
          border-radius: 24px;
          pointer-events: none;
          background: rgba(0, 2, 9, 0.72);
          transition: opacity 950ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        /* ── ASK ANYTHING — flagship showpiece ── */
        @keyframes askPremiumPulse {
          0%, 100% {
            box-shadow:
              0 0 0 1px rgba(34,211,238,0.14),
              0 0 26px rgba(34,211,238,0.13),
              0 0 54px rgba(99,102,241,0.08),
              0 20px 42px rgba(0,0,0,0.82),
              0 38px 78px rgba(0,0,0,0.46);
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(168,85,247,0.16),
              0 0 30px rgba(139,92,246,0.14),
              0 0 58px rgba(34,211,238,0.08),
              0 20px 42px rgba(0,0,0,0.82),
              0 38px 78px rgba(0,0,0,0.46);
          }
        }

        @keyframes askMicBreathe {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 14px rgba(34,211,238,0.14), 0 0 24px rgba(139,92,246,0.07);
          }
          50% {
            transform: scale(1.045);
            box-shadow: 0 0 20px rgba(34,211,238,0.22), 0 0 32px rgba(139,92,246,0.10);
          }
        }

        .ask-premium {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          border: 1px solid transparent;
          background:
            radial-gradient(circle at 16% 18%, rgba(34,211,238,0.085), transparent 34%) padding-box,
            radial-gradient(circle at 84% 84%, rgba(139,92,246,0.11), transparent 42%) padding-box,
            linear-gradient(145deg, rgba(10,14,32,0.985), rgba(5,8,20,0.985)) padding-box,
            linear-gradient(118deg,
              rgba(34,211,238,0.74) 0%,
              rgba(99,102,241,0.74) 46%,
              rgba(168,85,247,0.78) 100%) border-box;
          animation: askPremiumPulse 5.2s ease-in-out infinite;
        }

        .ask-premium::after {
          content: "";
          position: absolute;
          inset: 1px;
          border-radius: 23px;
          pointer-events: none;
          background: linear-gradient(180deg, rgba(255,255,255,0.032), transparent 42%);
          z-index: 1;
        }

        .ask-premium > * { position: relative; z-index: 2; }

        .ask-mic-halo {
          display: flex;
          height: 42px;
          width: 42px;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          border: 1px solid transparent;
          background:
            radial-gradient(circle, rgba(8,15,32,0.98), rgba(7,10,24,0.99)) padding-box,
            linear-gradient(135deg, rgba(34,211,238,0.74), rgba(139,92,246,0.76)) border-box;
          animation: askMicBreathe 3.4s ease-in-out infinite;
        }

        .ask-title {
          color: #f8fafc;
          text-shadow: 0 1px 14px rgba(34,211,238,0.10), 0 0 20px rgba(168,85,247,0.07);
        }

        .ask-subtitle {
          color: rgba(203,213,225,0.72);
          text-shadow: 0 2px 8px rgba(0,0,0,0.82);
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-shine::after,
          .ask-premium,
          .ask-mic-halo { animation: none !important; }
        }
      `}</style>

      <div className="nebula" aria-hidden="true" />
      <StarfieldBackground />

      {/* Match the Birth Chart focus depth: selected readings sit against a
          near-black sky while the active card and controls remain above it. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[5] bg-black"
        initial={false}
        animate={{ opacity: selectedArea ? 0.78 : 0 }}
        transition={{
          duration: shouldReduceMotion ? 0 : selectedArea ? 0.95 : 0.3,
          ease: [0.22, 1, 0.36, 1],
        }}
      />

      <div
        className="relative z-10 mx-auto flex w-full min-w-0 max-w-[430px] flex-col px-[clamp(12px,4vw,16px)]"
        onClickCapture={(e) => {
          if (!selectedArea) return;
          const target = e.target as HTMLElement;
          if (
            target.closest('[data-reading-choice="true"]') ||
            target.closest('[data-reading-context="true"]') ||
            target.closest('[data-begin-reading="true"]')
          ) return;
          clearReadingFocus();
          e.stopPropagation();
        }}
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 8px)",
          paddingBottom: "calc(2rem + env(safe-area-inset-bottom))",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex flex-col top-section"
        >
          {/* ── Swipe cue — integrated above hero ── */}
          <button
            type="button"
            onClick={() => onSwipeLeft?.()}
            className="tap-fix mx-auto mb-2 mt-1 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-300/85 transition-[opacity,filter] duration-[950ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              opacity: selectedArea || heroInspecting ? 0.52 : 1,
              filter: selectedArea || heroInspecting ? "grayscale(1) brightness(0.24) saturate(0)" : "brightness(1) saturate(1)",
              transitionDuration: selectedArea || heroInspecting ? "950ms" : "350ms",
              textShadow: "0 2px 10px rgba(0,0,0,0.85), 0 0 12px rgba(148,163,184,0.14)",
            }}
          >
            Swipe Left To Explore
          </button>

          {/* ── HERO (animated color-cycling outline glow) ── */}
          <section className="mb-[14px] pt-0">
            <div
              className={`hero-glow-shell ${selectedArea && !heroInspecting ? "hero-glow-shell-focus" : ""}`}
              style={{
                "--hero-c1-color": `rgb(${heroPalette[0]})`,
                "--hero-c2-color": `rgb(${heroPalette[1]})`,
                "--hero-c3-color": `rgb(${heroPalette[2]})`,
                "--hero-c4-color": `rgb(${heroPalette[3]})`,
              } as React.CSSProperties}
            >
            <div
              ref={heroStageRef}
              className={`hero-shine ${heroSweepActive ? "hero-shine-sweep" : ""} relative h-[236px] touch-none select-none overflow-hidden rounded-[28px] border border-white/[0.08] bg-white/[0.03] text-center transition-[opacity,filter] ease-[cubic-bezier(0.22,1,0.36,1)]`}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId);
                beginHeroHold();
              }}
              onPointerUp={endHeroHold}
              onPointerCancel={endHeroHold}
              onClick={cycleHeroInfo}
              onContextMenu={(e) => e.preventDefault()}
              aria-label="Tap to cycle hero information. Press and hold to pause."
              style={{
                opacity: heroInspecting ? 1 : selectedArea ? 0.48 : 1,
                filter: heroInspecting
                  ? "brightness(1) saturate(1)"
                  : selectedArea
                    ? "grayscale(1) brightness(0.30) saturate(0)"
                    : "grayscale(0) brightness(1) saturate(1)",
                transitionDuration: selectedArea || heroInspecting ? "950ms" : "350ms",
                "--hero-c4": heroPalette[3],
              } as React.CSSProperties}
            >
              {/* One master canvas: every informational element scales and moves together. */}
              <div
                className="absolute left-1/2 top-1/2 z-10 h-[236px] w-[374px]"
                style={{
                  transform: `translate(-50%, -50%) scale(${heroCompositionScale})`,
                  transformOrigin: "center center",
                }}
              >
                {/* Hero statement */}
                <div className="absolute inset-x-0 top-[20px] px-[2px] text-left">
                  <p
                    className="mb-[1px] text-center text-[25px] font-normal leading-none tracking-[0.015em] text-slate-100/88"
                    style={{
                      fontFamily:
                        '"Snell Roundhand", "Segoe Script", "Brush Script MT", cursive',
                      textShadow:
                        "0 3px 13px rgba(0,0,0,0.92), 0 0 18px rgba(199,210,254,0.18)",
                    }}
                  >
                    Personalized
                  </p>

                  <h1
                    className="whitespace-nowrap text-[39px] font-semibold leading-[0.98] tracking-[-0.048em] text-white"
                    style={{
                      transform: "scaleY(1.045)",
                      transformOrigin: "left bottom",
                      textShadow:
                        "0 5px 6px rgba(0,0,0,0.94), 0 13px 24px rgba(0,0,0,0.78), 0 0 26px rgba(148,163,184,0.17)",
                    }}
                  >
                    Astrological Predictions
                  </h1>
                </div>

                {/* Product identity — supportive, not competing with the H1 */}
                <p
                  className="absolute inset-x-0 top-[96px] whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.24em] text-slate-300/52"
                  style={{ textShadow: "0 2px 10px rgba(0,0,0,0.72)" }}
                >
                  <span className="text-indigo-200/72">AstroProXL</span>
                  <span className="mx-2 text-slate-500/70">|</span>
                  <span>The Astrology Engine</span>
                </p>

                {/* Four-slide information display: Birth Chart → Today → Mercury → Elements */}
                <div className="absolute inset-x-0 top-[133px] h-[91px]">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={heroInfoMode}
                      initial={{ opacity: 0, y: 4, filter: "blur(3px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -3, filter: "blur(3px)" }}
                      transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      {heroInfoMode === "personal" && (
                        <div className="flex items-center justify-center gap-8">
                          {heroData.personal.map((item) => (
                            <div
                              key={`personal-${item.role}`}
                              className="flex h-[62px] w-[62px] flex-col items-center justify-center rounded-full border bg-white/[0.018] px-1"
                              style={{
                                borderColor: signAccentColor(item.sign),
                                boxShadow: `inset 0 0 16px rgba(255,255,255,0.025), 0 0 18px ${signAccentGlow(item.sign)}`,
                              }}
                            >
                              <span className="mb-[3px] text-[7px] font-semibold leading-none tabular-nums text-slate-300/72">
                                {item.degree ?? "—"}
                              </span>
                              <span
                                className="max-w-full truncate text-[10.5px] font-semibold leading-none"
                                style={{
                                  color: signAccentColor(item.sign),
                                  textShadow: `0 0 9px ${signAccentGlow(item.sign)}`,
                                }}
                              >
                                {item.sign}
                              </span>
                              <span className="mt-[4px] text-[6.5px] font-medium uppercase leading-none tracking-[0.14em] text-slate-400/70">
                                {item.role}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {heroInfoMode === "sky" && (
                        <div className="flex items-center justify-center gap-12">
                          <div className="flex w-[78px] flex-col items-center">
                            <div style={{ filter: "drop-shadow(0 0 18px rgba(245,158,11,0.20))" }}>
                              <SunDisc size={62} />
                            </div>
                            <span className="mt-1 text-[9px] font-semibold leading-none text-slate-100/90">
                              {heroData.currentSun?.sign ?? "—"}
                            </span>
                            <span className="mt-[3px] text-[6.5px] font-medium uppercase tracking-[0.15em] text-slate-400/65">Sun</span>
                          </div>

                          <div className="flex w-[78px] flex-col items-center">
                            <div style={{ filter: "drop-shadow(0 0 18px rgba(226,223,240,0.16))" }}>
                              <MoonDisc
                                illumination={moonPhase?.illuminationPercent ?? 50}
                                waxing={moonWaxing}
                                size={62}
                              />
                            </div>
                            <span className="mt-1 text-[9px] font-semibold leading-none text-slate-100/90">
                              {moonPhase?.moonSign ?? heroData.currentMoon?.sign ?? "—"}
                            </span>
                            <span className="mt-[3px] text-[6.5px] font-medium uppercase tracking-[0.15em] text-slate-400/65">Moon</span>
                          </div>
                        </div>
                      )}

                      {heroInfoMode === "mercury" && (
                        <div className="flex flex-col items-center justify-center text-center">
                          <span className="text-[9px] font-medium uppercase tracking-[0.28em] text-slate-400/68">Mercury</span>
                          <span
                            className="mt-1 text-[25px] font-semibold uppercase leading-none tracking-[-0.025em] text-white"
                            style={{ textShadow: "0 5px 14px rgba(0,0,0,0.88), 0 0 18px rgba(148,163,184,0.12)" }}
                          >
                            {heroData.mercury?.isRetrograde ? "Retrograde ℞" : "Direct"}
                          </span>
                          <span className="mt-2 text-[8px] font-medium uppercase tracking-[0.17em] text-slate-400/62">
                            {heroData.mercury?.sign ?? "Current status"}
                          </span>
                        </div>
                      )}

                      {heroInfoMode === "elements" && (
                        <div className="flex h-[84px] items-end justify-center gap-5">
                          {HERO_ELEMENT_ORDER.map((element) => {
                            const count = heroData.counts[element];
                            const ratio = count / heroData.maxElementCount;
                            const height = count === 0 ? 5 : 12 + ratio * 38;
                            const colors = HERO_ELEMENT_COLORS[element];
                            return (
                              <div key={element} className="flex w-[38px] flex-col items-center justify-end">
                                <div className="relative flex h-[52px] w-full items-end justify-center">
                                  <motion.div
                                    initial={{ height: 4, opacity: 0.4 }}
                                    animate={{ height, opacity: 0.95 }}
                                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                                    className="w-[5px] rounded-full"
                                    style={{
                                      backgroundColor: colors.bar,
                                      boxShadow: `0 0 10px ${colors.glow}`,
                                    }}
                                  />
                                  <span
                                    className="absolute bottom-[-3px] h-[6px] w-[6px] rounded-full"
                                    style={{ backgroundColor: colors.bar, boxShadow: `0 0 8px ${colors.glow}` }}
                                  />
                                </div>
                                <span
                                  className="mt-[7px] text-[6.5px] font-semibold uppercase tracking-[0.10em]"
                                  style={{ color: colors.text }}
                                >
                                  {element}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>
            </div>
          </section>

          {/* ── Dynamic reading header ──
              The heading keeps one visual treatment; selection only changes the word. */}
          <div
            className="relative mb-[14px] h-[26px] text-center transition-[opacity,filter] duration-[950ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              opacity: heroInspecting ? 0.52 : 1,
              filter: heroInspecting ? "brightness(0.34) saturate(0.55)" : "brightness(1) saturate(1)",
            }}
          >
            <AnimatePresence mode="sync" initial={false}>
              <motion.p
                key={selectedAreaConfig ? `reading-title-${selectedAreaConfig.id}` : "select-reading"}
                initial={{ opacity: 0, y: 2, filter: "blur(2px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -2, filter: "blur(2px)" }}
                transition={{ duration: selectedAreaConfig ? 0.38 : 0.58, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-x-0 top-0 flex h-[26px] items-center justify-center text-[14px] font-semibold uppercase leading-[20px] tracking-[0.245em] text-slate-100 sm:text-[14.5px]"
                style={{
                  textShadow:
                    "0 4px 5px rgba(0,0,0,0.98), 0 9px 18px rgba(0,0,0,0.78), 0 0 18px rgba(148,163,184,0.22)",
                }}
              >
                {selectedAreaConfig ? selectedAreaConfig.title : "Select A Reading"}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* ── READING GRID (2×2) — symbols only ── */}
          <section className="grid grid-cols-2 gap-x-3 gap-y-4">
            {AREAS.map((area) => {
              const Icon = area.icon;
              const isSelected = selectedArea === area.id;
              const c = getAreaColors(area.id);
              return (
                <button
                  key={area.id}
                  type="button"
                  data-reading-choice="true"
                  onClick={() => selectArea(area.id)}
                  aria-pressed={isSelected}
                  aria-label={area.title}
                  className="tap-fix flex h-[84px] flex-col items-center justify-center gap-2 rounded-[20px] border transition-[border-color,background-color,box-shadow,transform,opacity,filter] duration-[950ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{
                    borderColor: isSelected ? c.border : "rgba(255,255,255,0.10)",
                    backgroundColor: isSelected ? c.bg : "rgba(255,255,255,0.03)",
                    boxShadow: isSelected
                      ? `0 0 0 1px ${c.border}, 0 0 18px 2px ${c.glow}, 0 0 34px 5px ${c.glow}, 0 18px 34px rgba(0,0,0,0.78), 0 34px 68px rgba(0,0,0,0.46)`
                      : "0 0 0 0 rgba(255,255,255,0), 0 0 0 0 rgba(255,255,255,0), 0 0 0 0 rgba(255,255,255,0), 0 18px 34px rgba(0,0,0,0.78), 0 34px 68px rgba(0,0,0,0.46)",
                    transform: isSelected ? "translateY(-1px)" : "translateY(0px)",
                    opacity: heroInspecting ? 0.52 : selectedArea && !isSelected ? 0.58 : 1,
                    filter: heroInspecting
                      ? "grayscale(1) brightness(0.24) saturate(0)"
                      : selectedArea && !isSelected
                        ? "grayscale(1) brightness(0.24) saturate(0)"
                        : "brightness(1) saturate(1)",
                    transitionDuration: selectedArea || heroInspecting ? "950ms" : "350ms",
                  }}
                >
                  {Icon ? (
                    <Icon
                      className="h-7 w-7 transition-[color,filter,transform] duration-[950ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                      style={{
                        color: isSelected ? c.text : "rgba(203,213,225,0.68)",
                        filter: isSelected ? `drop-shadow(0 0 7px ${c.glow})` : "none",
                        transform: isSelected ? "scale(1.035)" : "scale(1)",
                      }}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="text-[19px] font-semibold leading-6 tracking-[-0.025em] transition-[color,filter,transform] duration-[950ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                      style={{
                        color: isSelected ? c.text : "rgba(203,213,225,0.72)",
                        filter: isSelected ? `drop-shadow(0 0 7px ${c.glow})` : "none",
                        transform: isSelected ? "scale(1.035)" : "scale(1)",
                      }}
                    >
                      {area.marker}
                    </span>
                  )}
                </button>
              );
            })}
          </section>

          {/* ── OPTIONAL CONTEXT / PREMIUM ACCENT ── */}
          <div
            data-reading-context="true"
            className={`premium-context relative mt-3 h-[84px] rounded-[20px] border bg-transparent standard-shadow transition-[border-color,box-shadow,background,opacity,filter] duration-[950ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${selectedArea ? "premium-context-active" : ""}`}
            style={{
              opacity: heroInspecting ? 0.52 : 1,
              filter: heroInspecting ? "brightness(0.30) saturate(0.45)" : "brightness(1) saturate(1)",
              transitionDuration: selectedArea || heroInspecting ? "950ms" : "350ms",
            }}
          >
            <div
              className="pointer-events-none absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full"
              style={{
                border: "1px solid rgba(248,250,252,0.28)",
                background: "rgba(248,250,252,0.035)",
                boxShadow: "0 0 10px rgba(248,250,252,0.10), 0 0 18px rgba(191,219,254,0.06)",
              }}
              aria-hidden="true"
            >
              <Crown className="h-3.5 w-3.5" style={{ color: "rgba(248,250,252,0.88)", filter: "drop-shadow(0 0 5px rgba(255,255,255,0.20))" }} />
            </div>

            <div className="relative h-full rounded-[20px] bg-transparent px-4 py-2 pr-12">
              {!contextFocused && question.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-[14px] font-medium text-slate-400/72">
                  Add Context (Optional)
                </div>
              )}
              <Textarea
                id="question"
                rows={2}
                value={question}
                onFocus={() => {
                  clearSelectionTimeout();
                  setContextFocused(true);
                }}
                onBlur={() => {
                  setContextFocused(false);
                  if (selectedArea) {
                    clearSelectionTimeout();
                    selectionTimeoutRef.current = setTimeout(() => {
                      setSelectedArea(null);
                      setQuestion("");
                      selectionTimeoutRef.current = null;
                    }, 8000);
                  }
                }}
                onChange={(e) => {
                  clearSelectionTimeout();
                  setQuestion(e.target.value);
                }}
                placeholder=""
                className="h-full min-h-0 w-full resize-none rounded-[14px] !border-0 !bg-transparent px-1 py-1 text-[16px] leading-6 text-white !shadow-none focus:!border-0 focus:outline-none focus:!ring-0 focus-visible:!border-0 focus-visible:!ring-0 focus-visible:!ring-offset-0 focus-visible:!shadow-none"
                style={{ backgroundColor: "transparent" }}
              />
            </div>
          </div>

          <div>
          {/* ── BEGIN READING (always present) ── */}
          <div
            className="mt-3 flex flex-col items-center transition-[opacity,filter] duration-[950ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              opacity: heroInspecting ? 0.48 : 1,
              filter: heroInspecting ? "brightness(0.28) saturate(0.42)" : "brightness(1) saturate(1)",
              transitionDuration: heroInspecting ? "950ms" : "350ms",
            }}
          >
            {submitError && <p className="mb-2 text-center text-xs text-red-300">{submitError}</p>}
            <Button
              type="button"
              data-begin-reading="true"
              onClick={handleStartReading}
              disabled={!canSubmit || isCreatingReading}
              className="standard-shadow h-12 w-[calc(50%_-_6px)] rounded-[20px] text-[14px] font-medium transition-all duration-500 ease-out hover:-translate-y-[1px] hover:opacity-95 active:translate-y-0 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              style={{
                background: canSubmit && !isCreatingReading && beginReadingStyle
                  ? beginReadingStyle.background
                  : "rgba(255,255,255,0.012)",
                border: canSubmit && !isCreatingReading && beginReadingStyle
                  ? `1px solid ${beginReadingStyle.border}`
                  : "1px solid rgba(203,213,225,0.16)",
                color: canSubmit && !isCreatingReading && beginReadingStyle
                  ? beginReadingStyle.text
                  : "rgba(203,213,225,0.34)",
                opacity: canSubmit && !isCreatingReading ? 1 : 0.58,
                transform: canSubmit && !isCreatingReading ? "scale(1)" : "scale(0.975)",
                boxShadow: canSubmit && !isCreatingReading && beginReadingStyle
                  ? `0 0 0 1px ${beginReadingStyle.ring}, 0 0 18px 2px ${beginReadingStyle.glow}, 0 18px 34px rgba(0,0,0,0.78), 0 34px 68px rgba(0,0,0,0.46)`
                  : "0 14px 28px rgba(0,0,0,0.56)",
              }}
            >
              {buttonCopy}
            </Button>
          </div>

          {/* ── ASK ANYTHING — flagship premium feature, intentionally separate from readings ── */}
          <section className="mt-3">
            <button
              type="button"
              onClick={() => setShowJxl(true)}
              className="ask-premium tap-fix relative flex h-[108px] w-full items-center rounded-[24px] px-5 text-left transition-[transform,opacity,filter] duration-[950ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-[1px] active:translate-y-0"
              style={{
                opacity: heroInspecting ? 0.48 : selectedArea ? 0.62 : 1,
                filter: heroInspecting
                  ? "grayscale(1) brightness(0.24) saturate(0)"
                  : selectedArea
                    ? "grayscale(1) brightness(0.24) saturate(0)"
                    : "brightness(1) saturate(1)",
                transitionDuration: selectedArea || heroInspecting ? "950ms" : "350ms",
              }}
            >
              <span className="ask-mic-halo mr-4 shrink-0">
                <Mic className="h-[20px] w-[20px]" style={{ color: "rgba(207,250,254,0.98)" }} />
              </span>

              <span className="min-w-0">
                <span className="ask-title block text-[20px] font-semibold leading-6 tracking-[-0.01em]">
                  Ask Anything
                </span>
                <span className="ask-subtitle mt-1 block text-[11px] leading-4">
                  Real-time astrological guidance on your current situation
                </span>
                <span className="mt-1.5 block text-[9.5px] font-semibold uppercase tracking-[0.13em] text-teal-200/85">
                  Press &amp; hold · Speak what’s on your mind
                </span>
              </span>

              {/* During a reading selection, the entire Ask Anything card recedes together. */}
              <span
                aria-hidden="true"
                className="ask-focus-veil"
                style={{ opacity: heroInspecting ? 0.58 : selectedArea ? 0.48 : 0 }}
              />
            </button>
          </section>
          </div>


        </motion.div>
      </div>

      {/* ── JXL overlay (portaled to body) ── */}
      {showJxl && typeof document !== "undefined" &&
        createPortal(
          <div style={{ position: "fixed", inset: 0, zIndex: 9999 }}>
            <button
              type="button"
              onClick={() => setShowJxl(false)}
              style={{
                position: "fixed",
                top: "calc(12px + env(safe-area-inset-top))",
                left: "16px",
                zIndex: 100,
                display: "flex",
                alignItems: "center",
                gap: "4px",
                background: "rgba(5,8,22,0.6)",
                border: "1px solid rgba(148,163,184,0.2)",
                borderRadius: "999px",
                padding: "6px 12px 6px 8px",
                color: "#cbd5e1",
                fontSize: "13px",
                cursor: "pointer",
                backdropFilter: "blur(8px)",
              }}
            >
              <ChevronLeft size={16} />
              Back
            </button>
            <JxlPanel isActive={showJxl} />
          </div>,
          document.body
        )}

      {/* ── Embedded Stripe checkout (portaled) ── */}
      {clientSecret && typeof document !== "undefined" &&
        createPortal(
          <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(4,6,17,0.85)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "24px 16px calc(24px + env(safe-area-inset-bottom))" }}>
            <div style={{ width: "100%", maxWidth: 480 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => { setClientSecret(null); setIsCreatingReading(false); }}
                  style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#e2e8f0", borderRadius: 9999, width: 36, height: 36, cursor: "pointer", fontSize: 18, lineHeight: 1 }}
                  aria-label="Close checkout"
                >
                  ✕
                </button>
              </div>
              <div style={{ borderRadius: 16, overflow: "hidden", background: "#fff" }}>
                <EmbeddedCheckoutProvider
                  stripe={stripePromise}
                  options={{
                    clientSecret,
                    onComplete: async () => {
                      // Payment succeeded in-app. The Stripe webhook grants the
                      // reading credit asynchronously, so poll until it lands
                      // before generating — otherwise /api/readings sees 0 credits.
                      for (let i = 0; i < 10; i++) {
                        try {
                          const res = await fetch("/api/user/credits", { cache: "no-store" });
                          const d = await res.json();
                          if (Number(d.credits ?? 0) >= 1 || d.isSubscribed === true) break;
                        } catch { /* keep polling */ }
                        await new Promise((r) => setTimeout(r, 800));
                      }
                      setClientSecret(null);
                      router.push("/reading/preparing");
                    },
                  }}
                >
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
