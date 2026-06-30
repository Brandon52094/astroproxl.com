"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Heart,
  Briefcase,
  Wallet,
  Sparkles,
  RefreshCw,
  Lock,
  Timer,
  Pencil,
  ChevronRight,
} from "lucide-react";
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

// TikTok pixel global
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
    // silent — never let pixel tracking break the actual flow
  }
}

const AREAS = [
  {
    id: "love",
    title: "Love",
    description: "Relationships, romance, or emotional patterns",
    icon: Heart,
    placeholder:
      "Ask something specific about love, timing, or where this connection is headed.",
    cta: "Begin My Love Reading",
  },
  {
    id: "money",
    title: "Money",
    description: "Income, stability, opportunities, and financial timing",
    icon: Wallet,
    placeholder:
      "Ask something specific about money, stability, or the opportunities opening next.",
    cta: "Begin My Money Reading",
  },
  {
    id: "career",
    title: "Career",
    description: "Work, recognition, direction, and next steps",
    icon: Briefcase,
    placeholder:
      "Ask something specific about work, momentum, or the direction your career is moving.",
    cta: "Begin My Career Reading",
  },
  {
    id: "other",
    title: "What's Coming",
    description:
      "The next 30–45 days — timing, shifts, and what your chart says is moving toward you.",
    icon: Sparkles,
    placeholder:
      "Ask about timing, what's approaching, or what you should be ready for in the weeks ahead.",
    cta: "Begin My Reading",
  },
];

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

interface NatalPlacement {
  name: string;
  sign: string;
  degree: string;
}

interface MoonPhaseData {
  phaseName: string;
  illuminationPercent: number;
  nextEventName: "New Moon" | "Full Moon";
  daysUntilNextEvent: number;
  moonSign: string;
  moonDegree: string;
}

interface TodayTransitPlanet {
  name: string;
  sign: string;
  degree: string;
  isRetrograde: boolean;
}

// ── THEME SYSTEM ──────────────────────────────────────────────────────
type ThemeName = "teal" | "earth" | "water" | "fire" | "air";

interface ThemeColors {
  name: ThemeName;
  tagBg: string;
  tagText: string;
  gradientEnd: string;
  progressBar: string;
  unselectedBorder: string;
  selectedBorder: string;
  selectedGlow: string;
  selectedIcon: string;
  selectedTag: string;
  tickerTagBg: string;
  tickerTagText: string;
  tickerDataText: string;
  accentLine: string;
}

const THEMES: Record<ThemeName, ThemeColors> = {
  teal: {
    name: "teal",
    tagBg: "rgba(45, 212, 191, 0.05)",
    tagText: "#5EEAD4",
    gradientEnd: "#2DD4BF",
    progressBar: "#5EEAD4",
    unselectedBorder: "rgba(255,255,255,0.10)",
    selectedBorder: "#2DD4BF",
    selectedGlow: "rgba(45,212,191,0.15)",
    selectedIcon: "#5EEAD4",
    selectedTag: "#5EEAD4",
    tickerTagBg: "rgba(45,212,191,0.10)",
    tickerTagText: "#5EEAD4",
    tickerDataText: "rgba(226,232,240,0.88)",
    accentLine: "#2DD4BF",
  },
  earth: {
    name: "earth",
    tagBg: "#254B3A",
    tagText: "#D1C2A6",
    gradientEnd: "#D1C2A6",
    progressBar: "#6A5A43",
    unselectedBorder: "#6A5A43",
    selectedBorder: "#D1C2A6",
    selectedGlow: "rgba(37,75,58,0.15)",
    selectedIcon: "#D1C2A6",
    selectedTag: "#D1C2A6",
    tickerTagBg: "#3A2B24",
    tickerTagText: "#D1C2A6",
    tickerDataText: "rgba(226,232,240,0.88)",
    accentLine: "#254B3A",
  },
  water: {
    name: "water",
    tagBg: "#123C66",
    tagText: "#FFF3E6",
    gradientEnd: "#123C66",
    progressBar: "#2E6FB6",
    unselectedBorder: "#123C66",
    selectedBorder: "#FFF3E6",
    selectedGlow: "rgba(46,111,182,0.15)",
    selectedIcon: "#FFF3E6",
    selectedTag: "#FFF3E6",
    tickerTagBg: "#071A33",
    tickerTagText: "#FFF3E6",
    tickerDataText: "rgba(226,232,240,0.88)",
    accentLine: "#2E6FB6",
  },
  fire: {
    name: "fire",
    tagBg: "#4A1A1A",
    tagText: "#F5E6D3",
    gradientEnd: "#E8C87A",
    progressBar: "#C44A2A",
    unselectedBorder: "#C44A2A",
    selectedBorder: "#E8C87A",
    selectedGlow: "rgba(196,74,42,0.15)",
    selectedIcon: "#E8C87A",
    selectedTag: "#E8C87A",
    tickerTagBg: "#2E0F0F",
    tickerTagText: "#F5E6D3",
    tickerDataText: "rgba(226,232,240,0.88)",
    accentLine: "#C44A2A",
  },
  air: {
    name: "air",
    tagBg: "#A2A9B3",
    tagText: "#F7F8FA",
    gradientEnd: "#D6DBE2",
    progressBar: "#F2B705",
    unselectedBorder: "#A2A9B3",
    selectedBorder: "#F2B705",
    selectedGlow: "rgba(214,219,226,0.15)",
    selectedIcon: "#F2B705",
    selectedTag: "#F2B705",
    tickerTagBg: "#2B2D3A",
    tickerTagText: "#F7F8FA",
    tickerDataText: "rgba(226,232,240,0.88)",
    accentLine: "#F2B705",
  },
};

function getElementFromSign(sign: string): ThemeName {
  const earthSigns = ["Taurus", "Virgo", "Capricorn"];
  const waterSigns = ["Cancer", "Scorpio", "Pisces"];
  const fireSigns = ["Aries", "Leo", "Sagittarius"];
  const airSigns = ["Gemini", "Libra", "Aquarius"];

  if (earthSigns.includes(sign)) return "earth";
  if (waterSigns.includes(sign)) return "water";
  if (fireSigns.includes(sign)) return "fire";
  if (airSigns.includes(sign)) return "air";
  return "teal"; // fallback to teal
}

function getMoonGlyph(phaseName: string): string {
  const glyphs: Record<string, string> = {
    "New Moon": "🌑",
    "Waxing Crescent": "🌒",
    "First Quarter": "🌓",
    "Waxing Gibbous": "🌔",
    "Full Moon": "🌕",
    "Waning Gibbous": "🌖",
    "Last Quarter": "🌗",
    "Waning Crescent": "🌘",
  };
  return glyphs[phaseName] ?? "🌙";
}

function formatTimeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "soon";
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

export default function ReadingIntakeScreen() {
  const router = useRouter();
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [isCreatingReading, setIsCreatingReading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [chartStatus, setChartStatus] = useState<
    "checking" | "ready" | "recalculating" | "error"
  >("checking");
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [isBypassLoading, setIsBypassLoading] = useState(false);
  const [isSubscribeLoading, setIsSubscribeLoading] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isCarouselOpen, setIsCarouselOpen] = useState(false);
  const [touchStartX, setTouchStartX] = useState(0);
  const [touchEndX, setTouchEndX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // ── Profile module state ────────────────────────────────────────────
  const [natalSun, setNatalSun] = useState<NatalPlacement | null>(null);
  const [natalMoon, setNatalMoon] = useState<NatalPlacement | null>(null);
  const [natalRising, setNatalRising] = useState<NatalPlacement | null>(null);
  const [allPlanets, setAllPlanets] = useState<NatalPlacement[]>([]);
  const [nickname, setNickname] = useState<string | null>(null);
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const nicknameInputRef = useRef<HTMLInputElement | null>(null);

  // ── Transit & Moon state ────────────────────────────────────────────
  const [moonPhase, setMoonPhase] = useState<MoonPhaseData | null>(null);
  const [todaySun, setTodaySun] = useState<TodayTransitPlanet | null>(null);
  const [todayMoon, setTodayMoon] = useState<TodayTransitPlanet | null>(null);
  const [todayPlanets, setTodayPlanets] = useState<TodayTransitPlanet[]>([]);
  const [chartData, setChartDataState] = useState<any>(null);

  // ── Theme state ──────────────────────────────────────────────────────
  const [theme, setTheme] = useState<ThemeColors>(THEMES.teal);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // ── Scrub state ──────────────────────────────────────────────────────
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [scrubOffset, setScrubOffset] = useState(0);
  const statusBarRef = useRef<HTMLDivElement | null>(null);
  const dragStartX = useRef<number | null>(null);
  const dragStartOffset = useRef<number>(0);
  const autoResumeTimer = useRef<NodeJS.Timeout | null>(null);
  const carouselRef = useRef<HTMLDivElement | null>(null);

  // ── Glitch state ─────────────────────────────────────────────────────
  const [glitchActive, setGlitchActive] = useState(false);
  const [glitchOffset, setGlitchOffset] = useState(0);
  const [glitchColor, setGlitchColor] = useState<"cyan" | "magenta" | "yellow" | null>(null);
  const glitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const shouldReduceMotion = useReducedMotion();

  // ── Live ticking clock ──────────────────────────────────────────────
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // ── Refs for scroll-then-focus ──────────────────────────────────────
  const clusterTopRef = useRef<HTMLButtonElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const clusterBottomRef = useRef<HTMLDivElement | null>(null);
  const scrollFocusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── Glitch effect handler ───────────────────────────────────────────
  const triggerGlitch = useCallback(() => {
    if (shouldReduceMotion) return;
    const offset = (Math.random() - 0.5) * 6;
    const colors: ("cyan" | "magenta" | "yellow")[] = ["cyan", "magenta", "yellow"];
    const color = colors[Math.floor(Math.random() * colors.length)];
    setGlitchOffset(offset);
    setGlitchColor(color);
    setGlitchActive(true);
    if (glitchTimeoutRef.current) {
      clearTimeout(glitchTimeoutRef.current);
    }
    glitchTimeoutRef.current = setTimeout(() => {
      setGlitchActive(false);
      setGlitchOffset(0);
      setGlitchColor(null);
    }, 80 + Math.random() * 70);
  }, [shouldReduceMotion]);

  useEffect(() => {
    if (shouldReduceMotion) return;
    const intervals: NodeJS.Timeout[] = [];
    const randomGlitch = setInterval(() => {
      if (Math.random() > 0.4) {
        triggerGlitch();
      }
    }, 3000 + Math.random() * 5000);
    intervals.push(randomGlitch);
    const doubleGlitch = setInterval(() => {
      if (Math.random() > 0.7) {
        triggerGlitch();
        setTimeout(() => triggerGlitch(), 150 + Math.random() * 200);
      }
    }, 8000 + Math.random() * 4000);
    intervals.push(doubleGlitch);
    return () => {
      intervals.forEach(clearInterval);
      if (glitchTimeoutRef.current) clearTimeout(glitchTimeoutRef.current);
    };
  }, [triggerGlitch, shouldReduceMotion]);

  const stars = useMemo(
    () =>
      Array.from({ length: 28 }).map((_, i) => {
        const left = `${(i * 41) % 100}%`;
        const top = `${(i * 23 + 7) % 100}%`;
        const size = i % 7 === 0 ? 3 : 1.6;
        const opacity = i % 5 === 0 ? 0.85 : 0.4;
        const delay = (i * 0.41) % 4;
        return { left, top, size, opacity, delay, id: i };
      }),
    []
  );

  const comingSoonSparkles = useMemo(
    () => [
      { left: "12%", top: "22%", size: 7, delay: 0.1, color: "indigo" as const },
      { left: "28%", top: "62%", size: 5, delay: 0.7, color: "gold" as const },
      { left: "46%", top: "30%", size: 6, delay: 1.5, color: "indigo" as const },
      { left: "62%", top: "70%", size: 5, delay: 2.3, color: "gold" as const },
      { left: "78%", top: "38%", size: 7, delay: 3.1, color: "indigo" as const },
      { left: "90%", top: "58%", size: 5, delay: 3.9, color: "gold" as const },
    ],
    []
  );

  const getIconPulseAnimation = (isSelected = false) => {
    if (shouldReduceMotion) return {};
    if (!isSelected) {
      return {
        scale: 1,
        transition: { duration: 0.2 },
      };
    }
    return {
      scale: [1, 1.08, 1],
      transition: {
        duration: 2.8,
        repeat: Infinity,
        ease: "easeInOut" as const,
      },
    };
  };

  useEffect(() => {
    async function ensureChart() {
      if (isChartFresh()) {
        setChartStatus("ready");
        return;
      }
      try {
        const response = await fetch("/api/user/get-chart");
        const data = await response.json();
        if (!data.chart) {
          router.push("/chart-data");
          return;
        }
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
        if (!calcResponse.ok || !calcData.success) {
          setChartStatus("error");
          return;
        }
        saveChart({
          birthDate: data.chart.birthDate,
          birthTime: data.chart.birthTime,
          birthPlace: data.chart.birthPlace,
          lat: data.chart.lat,
          lng: data.chart.lng,
          timezone: data.chart.timezone,
          chartData: calcData,
        });
        setChartStatus("ready");
      } catch {
        setChartStatus("error");
      }
    }
    ensureChart();
  }, [router]);

  // ── Load chart data ──────────────────────────────────────────────────
  useEffect(() => {
    if (chartStatus !== "ready") return;
    const chart = loadChart();
    if (!chart?.chartData) return;

    const data = chart.chartData as unknown as {
      tropical?: { planets?: Array<{ name: string; sign: string; degree: string }> };
      moonPhase?: MoonPhaseData;
      transits?: TodayTransitPlanet[];
    };

    setChartDataState(data);

    const planets = data.tropical?.planets ?? [];

    const planetOrder = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
    const allPlanetsData: NatalPlacement[] = [];
    planetOrder.forEach(name => {
      const found = planets.find(p => p.name === name);
      if (found) {
        allPlanetsData.push(found);
      }
    });
    const rising = planets.find(p => p.name === "Ascendant");
    if (rising) {
      allPlanetsData.push({ ...rising, name: "Rising" });
    }
    setAllPlanets(allPlanetsData);

    const sun = planets.find((p) => p.name === "Sun") ?? null;
    const moon = planets.find((p) => p.name === "Moon") ?? null;
    const risingData = planets.find((p) => p.name === "Ascendant") ?? null;
    setNatalSun(sun);
    setNatalMoon(moon);
    setNatalRising(risingData);

    if (data.moonPhase) {
      setMoonPhase(data.moonPhase);
    }

    if (data.transits) {
      const todaySunPlanet = data.transits.find((p) => p.name === "Sun") ?? null;
      const todayMoonPlanet = data.transits.find((p) => p.name === "Moon") ?? null;
      setTodaySun(todaySunPlanet);
      setTodayMoon(todayMoonPlanet);
      const transitOrder = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
      const allTransits: TodayTransitPlanet[] = [];
      transitOrder.forEach(name => {
        const found = data.transits?.find(p => p.name === name);
        if (found) {
          allTransits.push(found);
        }
      });
      setTodayPlanets(allTransits);
    }

    // ── Set theme based on Sun sign ──────────────────────────────────
    const isUserSubscribed = userStatus?.isSubscribed || false;
    setIsSubscribed(isUserSubscribed);

    if (sun && isUserSubscribed) {
      const element = getElementFromSign(sun.sign);
      setTheme(THEMES[element]);
    } else {
      setTheme(THEMES.teal);
    }
  }, [chartStatus, userStatus]);

  // ── Load nickname ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/user/nickname");
        const data = await response.json();
        if (data.nickname) {
          setNickname(data.nickname);
        }
      } catch {
        // silent
      }
    })();
  }, []);

  const handleStartEditingNickname = useCallback(() => {
    setNicknameInput(nickname ?? natalSun?.sign ?? "");
    setIsEditingNickname(true);
    setTimeout(() => {
      nicknameInputRef.current?.focus();
      nicknameInputRef.current?.select();
    }, 50);
  }, [nickname, natalSun]);

  const handleSaveNickname = useCallback(async () => {
    const trimmed = nicknameInput.trim();
    if (!trimmed) {
      setIsEditingNickname(false);
      return;
    }
    setIsSavingNickname(true);
    try {
      const response = await fetch("/api/user/nickname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: trimmed }),
      });
      const data = await response.json();
      if (response.ok && data.nickname) {
        setNickname(data.nickname);
      }
    } catch {
      // silent
    } finally {
      setIsSavingNickname(false);
      setIsEditingNickname(false);
    }
  }, [nicknameInput]);

  const displayName = nickname ?? natalSun?.sign ?? "there";

  const fetchInFlight = useRef(false);

  const fetchStatus = useCallback(async (): Promise<number> => {
    if (fetchInFlight.current) return 0;
    fetchInFlight.current = true;
    try {
      const response = await fetch("/api/user/credits");
      const data = await response.json();
      const rawPaywalls = Number(data.paywallsCompleted ?? 0);
      const activePaywallIndex = rawPaywalls >= 4 ? 0 : rawPaywalls;
      setUserStatus({
        firstReadingUsed: data.firstReadingUsed === true,
        paywallsCompleted: activePaywallIndex,
        isSubscribed: data.isSubscribed === true,
        readingsCompleted: Number(data.readingsCompleted ?? 0),
        onCooldown: data.onCooldown === true,
        cooldownExpiresAt: data.cooldownExpiresAt ?? null,
        canBypass: data.canBypass === true,
        freeReadingResetAt: data.freeReadingResetAt ?? null,
        freeReadingAvailable: data.freeReadingAvailable === true,
      });
      return activePaywallIndex;
    } catch {
      return 0;
    } finally {
      setTimeout(() => {
        fetchInFlight.current = false;
      }, 2000);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const initialPaywalls = await fetchStatus();
      if (initialPaywalls === 0) {
        let attempts = 0;
        const poll = async () => {
          const paywalls = await fetchStatus();
          attempts++;
          if (paywalls === 0 && attempts < 4) {
            setTimeout(poll, 3000);
          }
        };
        setTimeout(poll, 3000);
      }
    })();
  }, [fetchStatus]);

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

  const selectedAreaConfig = useMemo(() => {
    return AREAS.find((area) => area.id === selectedArea) ?? null;
  }, [selectedArea]);

  const buttonCopy = useMemo(() => {
    if (chartStatus === "recalculating") return "Loading your chart…";
    if (isCreatingReading) return "Preparing reading...";
    if (!selectedAreaConfig) return "Choose a reading type";
    if (userStatus?.firstReadingUsed && !userStatus?.isSubscribed) {
      return `${selectedAreaConfig.cta} — $4.00`;
    }
    return selectedAreaConfig.cta;
  }, [chartStatus, isCreatingReading, selectedAreaConfig, userStatus]);

  const canSubmit = useMemo(() => {
    if (!selectedArea) return false;
    if (chartStatus !== "ready") return false;
    if (userStatus?.onCooldown) return false;
    if (selectedArea === "other") return true;
    return question.trim().length > 0;
  }, [question, selectedArea, chartStatus, userStatus]);

  const scrollClusterIntoViewThenFocus = useCallback(() => {
    if (scrollFocusTimeoutRef.current) {
      clearTimeout(scrollFocusTimeoutRef.current);
    }
    requestAnimationFrame(() => {
      const topEl = clusterTopRef.current;
      if (!topEl) return;
      const topRect = topEl.getBoundingClientRect();
      const currentScrollY = window.scrollY || document.documentElement.scrollTop;
      const topOffset = 12;
      const targetScrollY = currentScrollY + topRect.top - topOffset;
      window.scrollTo({
        top: Math.max(0, targetScrollY),
        behavior: "smooth",
      });
      scrollFocusTimeoutRef.current = setTimeout(() => {
        textareaRef.current?.focus();
      }, 420);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (scrollFocusTimeoutRef.current) clearTimeout(scrollFocusTimeoutRef.current);
    };
  }, []);

  const handleStartReading = async () => {
    if (!canSubmit || !selectedArea) return;
    setIsCreatingReading(true);
    setSubmitError(null);
    trackTtq("AddToCart", { content_id: selectedArea });
    try {
      clearIntake();
      clearReading();
      localStorage.removeItem("dfp_followup_return");
      localStorage.removeItem("dfp_followup_question");
      const topic =
        selectedArea === "love"
          ? "love"
          : selectedArea === "career"
            ? "career"
            : selectedArea === "money"
              ? "money"
              : "general";
      saveIntake({
        topic: topic as "love" | "career" | "money" | "general",
        area: selectedArea,
        question:
          selectedArea === "other"
            ? "What is coming for me in the next 30–45 days?"
            : question.trim(),
        timeframeType: "month",
        timeframeValue: "next-45-days",
      });
      if (userStatus?.firstReadingUsed && !userStatus?.isSubscribed) {
        const creditsRes = await fetch("/api/user/credits");
        const creditsData = await creditsRes.json();
        if (Number(creditsData.credits ?? 0) <= 0) {
          const paywallsCompleted = Number(creditsData.paywallsCompleted ?? 0);
          const paywallIndex = Math.min(paywallsCompleted + 1, 4);
          trackTtq("InitiateCheckout", { content_id: selectedArea, value: 4.00, currency: "USD" });
          const checkoutRes = await fetch("/api/stripe/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              returnUrl: window.location.origin + "/reading/preparing",
              mode: "one_time",
              paywallIndex,
            }),
          });
          const checkoutData = await checkoutRes.json();
          if (checkoutData.url) {
            window.location.href = checkoutData.url;
            return;
          }
        }
      }
      router.push("/reading/preparing");
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Something went wrong"
      );
    } finally {
      setIsCreatingReading(false);
    }
  };

  const handleBypass = async () => {
    setIsBypassLoading(true);
    trackTtq("InitiateCheckout", { content_id: "bypass", value: 6.00, currency: "USD" });
    try {
      await fetch("/api/user/bypass-reset", { method: "POST" });
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/reading/intake`,
          mode: "bypass",
        }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
    } finally {
      setIsBypassLoading(false);
    }
  };

  const onCooldown = userStatus?.onCooldown ?? false;
  const readingsCompleted = userStatus?.readingsCompleted ?? 0;

  const freeReadingCooldownLine = useMemo(() => {
    if (!userStatus?.freeReadingResetAt) return null;
    if (onCooldown) return null;
    if (userStatus?.isSubscribed) return null;
    const ms = new Date(userStatus.freeReadingResetAt).getTime() - now;
    if (ms <= 0) return null;
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    parts.push(`${hours}h`, `${minutes}m`);
    return `Free reading resets in ${parts.join(" ")}`;
  }, [userStatus, onCooldown, now]);

  // ── Scrub handlers ───────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    dragStartX.current = e.clientX;
    dragStartOffset.current = scrubOffset;
    setIsScrubbing(true);
    setIsPaused(true);
    if (autoResumeTimer.current) {
      clearTimeout(autoResumeTimer.current);
      autoResumeTimer.current = null;
    }
  }, [scrubOffset]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing || dragStartX.current === null) return;
    const delta = e.clientX - dragStartX.current;
    const newOffset = dragStartOffset.current + delta * 0.3;
    setScrubOffset(newOffset);
  }, [isScrubbing]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    target.releasePointerCapture(e.pointerId);
    setIsScrubbing(false);
    if (autoResumeTimer.current) {
      clearTimeout(autoResumeTimer.current);
    }
    autoResumeTimer.current = setTimeout(() => {
      setIsPaused(false);
      autoResumeTimer.current = null;
    }, 1500);
  }, []);

  const handleTap = useCallback(() => {
    if (isScrubbing) return;
    setIsPaused(!isPaused);
  }, [isPaused, isScrubbing]);

  // ── Carousel navigation ─────────────────────────────────────────────
  const totalCards = 5;
  const cardTitles = [
    "Unlimited Access",
    "Your Natal Chart",
    "Today's Astrological Calendar",
    "Current Important Transits",
    "Coming Soon"
  ];

  const goToPrevious = useCallback(() => {
    setCurrentCardIndex((prev) => (prev === 0 ? totalCards - 1 : prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentCardIndex((prev) => (prev === totalCards - 1 ? 0 : prev + 1));
  }, []);

  // ── Swipe handlers ──────────────────────────────────────────────────
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setTouchEndX(e.touches[0].clientX);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    setTouchEndX(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    const swipeDistance = touchStartX - touchEndX;
    const minSwipeDistance = 50;
    
    if (swipeDistance > minSwipeDistance) {
      goToNext();
    } else if (swipeDistance < -minSwipeDistance) {
      goToPrevious();
    }
    
    setTouchStartX(0);
    setTouchEndX(0);
  };

  // ── Mouse drag for desktop swipe ────────────────────────────────────
  const [mouseStartX, setMouseStartX] = useState(0);
  const [mouseEndX, setMouseEndX] = useState(0);
  const [isMouseDragging, setIsMouseDragging] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    setMouseStartX(e.clientX);
    setMouseEndX(e.clientX);
    setIsMouseDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDragging) return;
    setMouseEndX(e.clientX);
  };

  const handleMouseUp = () => {
    setIsMouseDragging(false);
    const swipeDistance = mouseStartX - mouseEndX;
    const minSwipeDistance = 50;
    
    if (swipeDistance > minSwipeDistance) {
      goToNext();
    } else if (swipeDistance < -minSwipeDistance) {
      goToPrevious();
    }
    
    setMouseStartX(0);
    setMouseEndX(0);
  };

  // ── Cleanup ──────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (autoResumeTimer.current) {
        clearTimeout(autoResumeTimer.current);
        autoResumeTimer.current = null;
      }
    };
  }, []);

  // ── Get the ticker content ──────────────────────────────────────────
  const getDailyTickerContent = useCallback(() => {
    return (
      <span className="flex items-center gap-3 text-[11px]" style={{ color: theme.tickerDataText }}>
        <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ 
          color: theme.tickerTagText, 
          backgroundColor: theme.tickerTagBg,
          borderColor: theme.accentLine,
          borderWidth: 1
        }}>
          Daily
        </span>
        {todayPlanets.map((planet, idx) => (
          <React.Fragment key={idx}>
            <span style={{ color: theme.tickerTagText, opacity: 0.45 }}>{planet.name}</span>
            <span style={{ color: theme.tickerDataText }}>
              {planet.sign} {planet.degree}
            </span>
            {planet.isRetrograde && (
              <span style={{ color: theme.accentLine }}>℞</span>
            )}
            {idx < todayPlanets.length - 1 && (
              <span className="text-white/16">•</span>
            )}
          </React.Fragment>
        ))}
      </span>
    );
  }, [todayPlanets, theme]);

  const getNatalTickerContent = useCallback(() => {
    return (
      <span className="flex items-center gap-3 text-[11px]" style={{ color: theme.tickerDataText }}>
        <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ 
          color: theme.tickerTagText, 
          backgroundColor: theme.tickerTagBg,
          borderColor: theme.accentLine,
          borderWidth: 1
        }}>
          Natal
        </span>
        {allPlanets.map((planet, idx) => (
          <React.Fragment key={idx}>
            <span style={{ color: theme.tickerTagText, opacity: 0.45 }}>{planet.name}</span>
            <span style={{ color: theme.tickerDataText }}>
              {planet.sign} {planet.degree}
            </span>
            {idx < allPlanets.length - 1 && (
              <span className="text-white/16">•</span>
            )}
          </React.Fragment>
        ))}
      </span>
    );
  }, [allPlanets, theme]);

  // ── Render individual card content ──────────────────────────────────
  const renderCardContent = (index: number) => {
    switch (index) {
      case 0: // Unlimited Access
        return (
          <div className="space-y-4 flex-1">
            <div>
              <h3 className="text-[15px] font-semibold leading-snug text-white">
                {userStatus?.isSubscribed ? "You're Subscribed! 🎉" : "More Readings, No Waiting."}
              </h3>
              {!userStatus?.isSubscribed && (
                <p className="mt-1.5 text-[12px] leading-5 text-slate-400">
                  Need more than one reading a week? This is the best route. Financially & mathematically. See what you get below!
                </p>
              )}
            </div>

            {!userStatus?.isSubscribed ? (
              <>
                <div className="space-y-2">
                  {[
                    "8 Readings, not 1",
                    "Ask Follow Ups Free",
                    "No 2-week wait, no $6 to skip it",
                    "Downloads Always Free.",
                    "Unlimited Access Features",
                  ].map((perk) => (
                    <div key={perk} className="flex items-center gap-2.5">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-[9px] text-amber-300">
                        ✓
                      </span>
                      <span className="text-[12px] text-slate-300">{perk}</span>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-amber-300/60">
                  More, for less, still premium.
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-4 flex-1">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">
                  <Sparkles className="h-6 w-6" />
                </div>
                <p className="mt-3 text-center text-sm text-slate-300">
                  You have full access to all features.
                </p>
                <p className="text-center text-xs text-slate-500 mt-1">
                  Enjoy your premium experience.
                </p>
              </div>
            )}
          </div>
        );
      case 1: // Your Natal Chart
        return (
          <div className="space-y-3 flex-1">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                <span className="text-xs text-slate-400">Sun</span>
                <p className="text-sm text-white font-medium">{natalSun ? `${natalSun.sign} ${natalSun.degree}` : "—"}</p>
              </div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                <span className="text-xs text-slate-400">Moon</span>
                <p className="text-sm text-white font-medium">{natalMoon ? `${natalMoon.sign} ${natalMoon.degree}` : "—"}</p>
              </div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                <span className="text-xs text-slate-400">Rising</span>
                <p className="text-sm text-white font-medium">{natalRising ? `${natalRising.sign} ${natalRising.degree}` : "—"}</p>
              </div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                <span className="text-xs text-slate-400">Planets</span>
                <p className="text-sm text-white font-medium">{allPlanets.length}</p>
              </div>
            </div>
            <div className="max-h-[100px] overflow-y-auto space-y-1">
              {allPlanets.slice(0, 5).map((planet) => (
                <div key={planet.name} className="flex justify-between text-xs">
                  <span className="text-slate-400">{planet.name}</span>
                  <span className="text-white">{planet.sign} {planet.degree}</span>
                </div>
              ))}
              {allPlanets.length > 5 && (
                <div className="text-xs text-slate-500">+{allPlanets.length - 5} more</div>
              )}
            </div>
          </div>
        );
      case 2: // Today's Astrological Calendar
        return (
          <div className="space-y-3 flex-1">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                <span className="text-xs text-slate-400">Moon Phase</span>
                <p className="text-sm text-white font-medium">{moonPhase?.phaseName || "—"}</p>
              </div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                <span className="text-xs text-slate-400">Illumination</span>
                <p className="text-sm text-white font-medium">{moonPhase?.illuminationPercent || "—"}%</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                <span className="text-xs text-slate-400">Moon Sign</span>
                <p className="text-sm text-white font-medium">{moonPhase?.moonSign || "—"}</p>
              </div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                <span className="text-xs text-slate-400">Retrogrades</span>
                <p className="text-sm text-white font-medium">
                  {todayPlanets.filter(p => p.isRetrograde).length || 0}
                </p>
              </div>
            </div>
            <div className="space-y-1 max-h-[80px] overflow-y-auto">
              {todayPlanets.slice(0, 4).map((planet) => (
                <div key={planet.name} className="flex justify-between text-xs">
                  <span className="text-slate-400">{planet.name}</span>
                  <span className="text-white">{planet.sign} {planet.degree}{planet.isRetrograde ? " ℞" : ""}</span>
                </div>
              ))}
            </div>
          </div>
        );
      case 3: // Current Important Transits
        const majorPlanets = ["Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
        const majorTransits = todayPlanets.filter(p => majorPlanets.includes(p.name));
        return (
          <div className="space-y-3 flex-1">
            <div className="text-xs text-slate-400 mb-2">Major planetary transits</div>
            {majorTransits.length > 0 ? (
              <div className="space-y-2">
                {majorTransits.map((planet) => (
                  <div key={planet.name} className="flex justify-between items-center rounded-xl bg-white/[0.03] px-3 py-2">
                    <span className="text-sm text-slate-300">{planet.name}</span>
                    <span className="text-sm text-white">
                      {planet.sign} {planet.degree}
                      {planet.isRetrograde && " ℞"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-sm text-slate-500 py-4">Loading transits...</div>
            )}
          </div>
        );
      case 4: // Coming Soon
        return (
          <div className="flex flex-col items-center justify-center h-full py-8 flex-1">
            <Sparkles className="h-12 w-12 text-amber-300/40 mb-4" />
            <p className="text-center text-sm text-slate-400">More features coming soon</p>
            <p className="text-center text-xs text-slate-500 mt-2">Stay tuned for updates</p>
          </div>
        );
      default:
        return null;
    }
  };

  // ── Theme-specific helper functions ────────────────────────────────

  // Get card animation based on theme
  const getCardAnimation = (isSelected: boolean) => {
    if (!isSelected) {
      return {
        backgroundColor: "rgba(255, 255, 255, 0.03)",
        borderColor: theme.name === "fire" ? "rgba(196, 74, 42, 0.35)" : theme.unselectedBorder,
        y: 0,
      };
    }

    const baseAnimation = {
      borderColor: theme.selectedBorder,
      y: shouldReduceMotion ? 0 : -2,
    };

    switch (theme.name) {
      case "water":
        return {
          ...baseAnimation,
          backgroundColor: shouldReduceMotion ? "rgba(7, 26, 51, 0.58)" : "rgba(7, 26, 51, 0.68)",
        };
      case "earth":
        return {
          ...baseAnimation,
          backgroundColor: shouldReduceMotion ? "rgba(209, 194, 166, 0.08)" : "rgba(209, 194, 166, 0.10)",
        };
      case "air":
        return {
          ...baseAnimation,
          backgroundColor: shouldReduceMotion ? "rgba(43, 45, 58, 0.72)" : "rgba(43, 45, 58, 0.78)",
        };
      case "fire":
        return {
          ...baseAnimation,
          backgroundColor: shouldReduceMotion ? "rgba(46, 15, 15, 0.72)" : "rgba(46, 15, 15, 0.80)",
        };
      default:
        return {
          ...baseAnimation,
          backgroundColor: shouldReduceMotion ? "rgba(45, 212, 191, 0.08)" : "rgba(45, 212, 191, 0.10)",
        };
    }
  };

  // Get glow overlay based on theme
  const getGlowOverlay = () => {
    switch (theme.name) {
      case "water":
        return "radial-gradient(circle at 50% 45%, rgba(255,243,230,0.10), rgba(46,111,182,0.10) 34%, rgba(18,60,102,0.06) 54%, transparent 74%)";
      case "earth":
        return "radial-gradient(circle at 50% 50%, rgba(209,194,166,0.12), rgba(37,75,58,0.08) 38%, transparent 72%)";
      case "air":
        return "radial-gradient(circle at 50% 45%, rgba(214,219,226,0.16), rgba(214,219,226,0.08) 34%, rgba(242,183,5,0.05) 56%, transparent 74%)";
      case "fire":
        return "radial-gradient(circle at 50% 45%, rgba(196,74,42,0.18), rgba(196,74,42,0.09) 34%, rgba(232,200,122,0.06) 58%, transparent 76%)";
      default:
        return `radial-gradient(circle at 50% 50%, ${theme.selectedGlow}, rgba(0,0,0,0) 72%)`;
    }
  };

  // Get selected wash based on theme
  const getSelectedWash = () => {
    switch (theme.name) {
      case "water":
        return "radial-gradient(circle at 20% 18%, rgba(255,243,230,0.10), transparent 34%), radial-gradient(circle at 78% 28%, rgba(46,111,182,0.14), transparent 42%), linear-gradient(180deg, rgba(18,60,102,0.14), rgba(7,26,51,0.12))";
      case "earth":
        return "radial-gradient(circle at 20% 20%, rgba(209,194,166,0.14), transparent 42%), radial-gradient(circle at 80% 30%, rgba(37,75,58,0.10), transparent 46%), linear-gradient(180deg, rgba(209,194,166,0.07), rgba(37,75,58,0.03))";
      case "air":
        return "radial-gradient(circle at 20% 18%, rgba(214,219,226,0.16), transparent 34%), radial-gradient(circle at 78% 28%, rgba(242,183,5,0.07), transparent 42%), linear-gradient(180deg, rgba(214,219,226,0.10), rgba(43,45,58,0.06))";
      case "fire":
        return "radial-gradient(circle at 20% 18%, rgba(196,74,42,0.18), transparent 36%), radial-gradient(circle at 78% 24%, rgba(232,200,122,0.10), transparent 34%), linear-gradient(180deg, rgba(196,74,42,0.10), rgba(74,26,26,0.05))";
      default:
        return "radial-gradient(circle at 20% 20%, rgba(45,212,191,0.14), transparent 42%), radial-gradient(circle at 80% 30%, rgba(45,212,191,0.08), transparent 46%), linear-gradient(180deg, rgba(45,212,191,0.08), rgba(20,184,166,0.03))";
    }
  };

  // Get selected shadow based on theme
  const getSelectedShadow = () => {
    switch (theme.name) {
      case "water":
        return "0 0 0 1px rgba(255,243,230,0.16), 0 10px 30px rgba(46,111,182,0.20), 0 0 26px rgba(46,111,182,0.10)";
      case "earth":
        return "0 0 0 1px rgba(209,194,166,0.16), 0 10px 30px rgba(37,75,58,0.18), 0 0 24px rgba(209,194,166,0.08)";
      case "air":
        return "0 0 0 1px rgba(242,183,5,0.16), 0 10px 30px rgba(214,219,226,0.12), 0 0 24px rgba(214,219,226,0.08)";
      case "fire":
        return "0 0 0 1px rgba(232,200,122,0.16), 0 10px 30px rgba(196,74,42,0.16), 0 0 24px rgba(196,74,42,0.10)";
      default:
        return `0 0 0 1px ${theme.selectedBorder}, 0 10px 30px ${theme.selectedGlow}, 0 0 24px ${theme.selectedGlow}`;
    }
  };

  // Get icon tile shadow based on theme
  const getIconTileShadow = () => {
    switch (theme.name) {
      case "water":
        return "0 0 16px rgba(46,111,182,0.18)";
      case "earth":
        return "0 0 12px rgba(37,75,58,0.18)";
      case "air":
        return "0 0 16px rgba(214,219,226,0.16)";
      case "fire":
        return "0 0 16px rgba(196,74,42,0.18)";
      default:
        return `0 0 12px ${theme.selectedGlow}`;
    }
  };

  // Get badge background based on theme
  const getBadgeBackground = () => {
    switch (theme.name) {
      case "water":
        return "#071A33";
      case "earth":
        return "rgba(37,75,58,0.28)";
      case "air":
        return "#2B2D3A";
      case "fire":
        return "#2E0F0F";
      default:
        return theme.selectedGlow;
    }
  };

  // Get badge shadow based on theme
  const getBadgeShadow = () => {
    switch (theme.name) {
      case "water":
        return "inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(46,111,182,0.08)";
      case "air":
        return "inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(214,219,226,0.05)";
      case "fire":
        return "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(196,74,42,0.08)";
      default:
        return undefined;
    }
  };

  // Get CTA background based on theme
  const getCTABackground = () => {
    switch (theme.name) {
      case "water":
        return "linear-gradient(180deg, #123C66 0%, #0B2D4B 100%)";
      case "earth":
        return "linear-gradient(180deg, #254B3A 0%, #1E352A 100%)";
      case "air":
        return "linear-gradient(180deg, #2B2D3A 0%, #1F222D 100%)";
      case "fire":
        return "linear-gradient(180deg, #4A1A1A 0%, #2E0F0F 100%)";
      default:
        return "rgba(0,0,0,0.40)";
    }
  };

  // Get CTA shadow based on theme
  const getCTAShadow = () => {
    switch (theme.name) {
      case "water":
        return "0 10px 30px rgba(46,111,182,0.24), inset 0 1px 0 rgba(255,255,255,0.08)";
      case "earth":
        return "0 10px 30px rgba(37,75,58,0.28), inset 0 1px 0 rgba(255,255,255,0.06)";
      case "air":
        return "0 10px 28px rgba(214,219,226,0.10), inset 0 1px 0 rgba(255,255,255,0.08)";
      case "fire":
        return "0 10px 28px rgba(196,74,42,0.14), inset 0 1px 0 rgba(255,255,255,0.06)";
      default:
        return `0 4px 24px ${theme.selectedGlow}`;
    }
  };

  // Get textarea focus styles based on theme
  const getTextareaFocusStyles = (isFocused: boolean) => {
    if (!isFocused) {
      return {
        borderColor: "rgba(255,255,255,0.10)",
        boxShadow: "none",
      };
    }

    switch (theme.name) {
      case "water":
        return {
          borderColor: "#2E6FB6",
          boxShadow: "0 0 22px rgba(46,111,182,0.18)",
        };
      case "earth":
        return {
          borderColor: "#254B3A",
          boxShadow: "0 0 22px rgba(37,75,58,0.18)",
        };
      case "air":
        return {
          borderColor: "#F2B705",
          boxShadow: "0 0 20px rgba(214,219,226,0.12)",
        };
      case "fire":
        return {
          borderColor: "rgba(232,200,122,0.42)",
          boxShadow: "0 0 22px rgba(196,74,42,0.14)",
        };
      default:
        return {
          borderColor: theme.accentLine,
          boxShadow: `0 0 22px ${theme.selectedGlow}`,
        };
    }
  };

  return (
    <div
      className="no-scrollbar h-screen overflow-y-auto overscroll-none bg-[#050816] text-slate-100"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <style jsx>{`
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }

        @keyframes jxlAmberPulse {
          0%, 100% {
            box-shadow:
              0 0 0 1px rgba(245, 158, 11, 0.18),
              0 0 20px rgba(245, 158, 11, 0.08),
              0 0 40px rgba(245, 158, 11, 0.04);
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(251, 191, 36, 0.38),
              0 0 28px rgba(251, 191, 36, 0.18),
              0 0 56px rgba(251, 191, 36, 0.08);
          }
        }

        @keyframes cooldownPulse {
          0%, 100% {
            box-shadow:
              0 0 0 1px rgba(99, 102, 241, 0.2),
              0 0 20px rgba(99, 102, 241, 0.08);
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(99, 102, 241, 0.4),
              0 0 28px rgba(99, 102, 241, 0.16);
          }
        }

        @keyframes whiteGlowPulse {
          0%, 100% {
            opacity: 0.4;
          }
          50% {
            opacity: 0.9;
          }
        }

        @keyframes shimmerFlow {
          0% {
            background-position: -200% center;
          }
          100% {
            background-position: 200% center;
          }
        }

        .jxl-teaser {
          animation: jxlAmberPulse 2.8s ease-in-out infinite;
          position: relative;
          overflow: hidden;
        }

        .jxl-teaser::before {
          content: "";
          position: absolute;
          inset: -40%;
          background-image: linear-gradient(
            120deg,
            rgba(253, 230, 138, 0) 0%,
            rgba(253, 230, 138, 0.12) 40%,
            rgba(250, 204, 21, 0.3) 50%,
            rgba(253, 230, 138, 0.12) 60%,
            rgba(253, 230, 138, 0) 100%
          );
          mix-blend-mode: screen;
          pointer-events: none;
          opacity: 0.85;
          transform: translateX(-60%);
          animation: jxlShimmer 3.5s linear infinite;
        }

        @keyframes jxlShimmer {
          0% { transform: translateX(-60%); }
          50% { transform: translateX(40%); }
          100% { transform: translateX(120%); }
        }

        .cooldown-glow {
          animation: cooldownPulse 3s ease-in-out infinite;
        }

        .jxl-teaser--subtle::before {
          opacity: 0.55;
          animation-duration: 5s;
        }

        .jxl-teaser--indigo {
          animation: cooldownPulse 2.8s ease-in-out infinite;
        }

        .jxl-teaser--indigo::before {
          background-image: linear-gradient(
            120deg,
            rgba(165, 180, 252, 0) 0%,
            rgba(165, 180, 252, 0.12) 40%,
            rgba(129, 140, 248, 0.3) 50%,
            rgba(165, 180, 252, 0.12) 60%,
            rgba(165, 180, 252, 0) 100%
          );
        }

        @keyframes jxlGlint {
          0%, 78%, 100% { opacity: 0; transform: scale(0.3); }
          88% { opacity: 1; transform: scale(1.4); }
          94% { opacity: 0.7; transform: scale(1); }
        }

        .jxl-sparkle {
          position: absolute;
          border-radius: 9999px;
          pointer-events: none;
          z-index: 5;
          opacity: 0;
          animation: jxlGlint 5s ease-in-out infinite;
        }

        .jxl-sparkle--indigo {
          background: rgb(199, 210, 254);
          box-shadow:
            0 0 8px 2px rgba(129, 140, 248, 0.9),
            0 0 16px 4px rgba(129, 140, 248, 0.5);
        }

        .jxl-sparkle--gold {
          background: rgb(253, 230, 138);
          box-shadow:
            0 0 8px 2px rgba(250, 204, 21, 0.9),
            0 0 16px 4px rgba(250, 204, 21, 0.5);
        }

        @keyframes glitchFlicker {
          0%, 100% { opacity: 0; }
          10% { opacity: 1; }
          20% { opacity: 0; }
          30% { opacity: 1; }
          32% { opacity: 0; }
          35% { opacity: 1; }
          40% { opacity: 0; }
          100% { opacity: 0; }
        }

        @keyframes glitchScanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }

        .glitch-container {
          position: relative;
          overflow: hidden;
          transition: all 0.05s ease;
        }

        .glitch-container::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 10;
          background: repeating-linear-gradient(
            0deg,
            rgba(0, 0, 0, 0) 0px,
            rgba(0, 0, 0, 0) 3px,
            rgba(255, 255, 255, 0.03) 3px,
            rgba(255, 255, 255, 0.03) 4px,
            rgba(0, 0, 0, 0) 4px,
            rgba(0, 0, 0, 0) 6px
          );
          opacity: 0;
          animation: none;
        }

        .glitch-container.glitching::after {
          opacity: 0.4;
          animation: glitchScanline 0.4s linear infinite;
        }

        .glitch-layer {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 5;
          mix-blend-mode: screen;
          opacity: 0;
          transition: opacity 0.05s ease;
        }

        .glitch-layer.active {
          opacity: 0.35;
        }

        .glitch-layer-cyan {
          background: rgba(0, 255, 255, 0.15);
          transform: translateX(var(--glitch-offset, 0px));
          clip-path: inset(20% 0 60% 0);
        }

        .glitch-layer-magenta {
          background: rgba(255, 0, 255, 0.12);
          transform: translateX(calc(var(--glitch-offset, 0px) * -0.7));
          clip-path: inset(50% 0 10% 0);
        }

        .glitch-layer-yellow {
          background: rgba(255, 255, 0, 0.1);
          transform: translateX(calc(var(--glitch-offset, 0px) * 0.5));
          clip-path: inset(70% 0 5% 0);
        }

        .glitch-text {
          position: relative;
          z-index: 2;
          transition: all 0.05s ease;
        }

        .glitch-text.glitching {
          text-shadow:
            2px 0 rgba(0, 255, 255, 0.6),
            -2px 0 rgba(255, 0, 255, 0.6),
            0 0 20px rgba(129, 140, 248, 0.3);
          letter-spacing: 0.5px;
        }

        @keyframes glitchPulse {
          0%, 100% {
            box-shadow:
              0 0 0 1px rgba(129, 140, 248, 0.2),
              0 0 30px rgba(129, 140, 248, 0.06),
              0 0 60px rgba(129, 140, 248, 0.03);
          }
          25% {
            box-shadow:
              0 0 0 1px rgba(0, 255, 255, 0.4),
              0 0 40px rgba(0, 255, 255, 0.15),
              0 0 80px rgba(0, 255, 255, 0.06);
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(255, 0, 255, 0.4),
              0 0 40px rgba(255, 0, 255, 0.15),
              0 0 80px rgba(255, 0, 255, 0.06);
          }
          75% {
            box-shadow:
              0 0 0 1px rgba(255, 255, 0, 0.4),
              0 0 40px rgba(255, 255, 0, 0.15),
              0 0 80px rgba(255, 255, 0, 0.06);
          }
        }

        .glitch-border {
          animation: glitchPulse 3.2s ease-in-out infinite;
          position: relative;
        }

        @keyframes sparkleBurst {
          0% { opacity: 0; transform: scale(0) rotate(0deg); }
          50% { opacity: 1; transform: scale(1.8) rotate(180deg); }
          100% { opacity: 0; transform: scale(0.5) rotate(360deg); }
        }

        .sparkle-burst {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          z-index: 8;
          animation: sparkleBurst 0.8s ease-out forwards;
        }

        @keyframes driftGradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        .drift-bg {
          position: absolute;
          inset: -10%;
          background: linear-gradient(
            120deg,
            #040611 0%,
            #061120 25%,
            #050816 50%,
            #061120 75%,
            #040611 100%
          );
          background-size: 200% 200%;
          animation: driftGradient 26s ease-in-out infinite;
        }

        .drift-bg::after {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 30% 20%, rgba(45, 212, 191, 0.05), transparent 45%),
            radial-gradient(circle at 75% 70%, rgba(251, 191, 36, 0.04), transparent 45%);
          animation: driftGradient 26s ease-in-out infinite reverse;
        }

        .cosmic-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.018) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.018) 1px, transparent 1px);
          background-size: 36px 36px;
          mask-image: linear-gradient(to bottom, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0));
          opacity: 0.18;
        }

        .aurora-orb--violet {
          position: absolute;
          top: 8rem;
          right: -4rem;
          width: 14rem;
          height: 14rem;
          border-radius: 9999px;
          filter: blur(60px);
          background: radial-gradient(circle, rgba(129, 140, 248, 0.18) 0%, rgba(129, 140, 248, 0.06) 48%, transparent 74%);
          will-change: transform, opacity;
        }

        .glow-light-bar {
          position: relative;
          height: 2.5px;
          width: 100%;
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.4) 0%,
            rgba(255, 255, 255, 0.8) 30%,
            rgba(255, 255, 255, 0.9) 50%,
            rgba(255, 255, 255, 0.8) 70%,
            rgba(255, 255, 255, 0.4) 100%
          );
          box-shadow: 0 0 30px rgba(255, 255, 255, 0.15);
          animation: whiteGlowPulse 3.5s ease-in-out infinite;
        }

        .selected-card-shell {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          will-change: transform, opacity;
        }

        .selected-card-shell::before {
          content: "";
          position: absolute;
          inset: -1px;
          border-radius: 24px;
          background: var(--selected-wash, radial-gradient(circle at 20% 20%, rgba(45, 212, 191, 0.14), transparent 42%), radial-gradient(circle at 80% 30%, rgba(45, 212, 191, 0.08), transparent 46%), linear-gradient(180deg, rgba(45, 212, 191, 0.08), rgba(20, 184, 166, 0.03)));
          opacity: 0;
          z-index: 0;
          pointer-events: none;
          transition: opacity 260ms ease;
        }

        .selected-card-shell::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 24px;
          opacity: 0;
          z-index: 0;
          pointer-events: none;
          box-shadow: var(--selected-shadow, 0 0 0 1px rgba(45, 212, 191, 0.14), 0 10px 30px rgba(20, 184, 166, 0.14), 0 0 24px rgba(45, 212, 191, 0.08));
          transition: opacity 260ms ease;
        }

        .selected-card-shell[data-selected="true"]::before,
        .selected-card-shell[data-selected="true"]::after {
          opacity: 1;
        }

        .profile-name-button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: opacity 180ms ease;
        }

        .profile-name-button:hover {
          opacity: 0.82;
        }

        /* ── CAROUSEL STYLES ── */
        .carousel-container {
          position: relative;
          overflow: hidden;
          border-radius: 24px;
          border: 1px solid rgba(251, 191, 36, 0.2);
          background: linear-gradient(180deg, rgba(251, 191, 36, 0.06), rgba(251, 191, 36, 0.02));
          animation: jxlAmberPulse 2.8s ease-in-out infinite;
        }

        .carousel-container::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 16% 18%, rgba(255, 255, 255, 0.06), transparent 26%),
            radial-gradient(circle at 80% 12%, rgba(251, 191, 36, 0.12), transparent 24%);
          pointer-events: none;
          z-index: 0;
        }

        .carousel-container::after {
          content: "";
          position: absolute;
          inset: -40%;
          background-image: linear-gradient(
            120deg,
            rgba(253, 230, 138, 0) 0%,
            rgba(253, 230, 138, 0.12) 40%,
            rgba(250, 204, 21, 0.3) 50%,
            rgba(253, 230, 138, 0.12) 60%,
            rgba(253, 230, 138, 0) 100%
          );
          mix-blend-mode: screen;
          pointer-events: none;
          opacity: 0.55;
          transform: translateX(-60%);
          animation: jxlShimmer 5s linear infinite;
          z-index: 0;
        }

        .carousel-container > * {
          position: relative;
          z-index: 1;
        }

        .carousel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          cursor: pointer;
          transition: background 0.15s ease;
          width: 100%;
          text-align: left;
          background: transparent;
          border: none;
          color: inherit;
          font: inherit;
        }

        .carousel-header:hover {
          background: rgba(255, 255, 255, 0.02);
        }

        .carousel-content {
          border-top: 1px solid rgba(251, 191, 36, 0.1);
          padding: 0;
          display: flex;
          flex-direction: column;
        }

        .carousel-track {
          display: flex;
          height: 100%;
          transition: transform 0.4s ease;
          will-change: transform;
          cursor: grab;
          user-select: none;
        }

        .carousel-track:active {
          cursor: grabbing;
        }

        .carousel-card {
          min-width: 100%;
          padding: 0;
          height: 100%;
        }

        .locked-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(5, 8, 22, 0.7);
          backdrop-filter: blur(8px);
          border-radius: 16px;
          z-index: 10;
        }

        .blur-content {
          filter: blur(6px);
          opacity: 0.4;
          pointer-events: none;
          user-select: none;
        }

        @media (prefers-reduced-motion: reduce) {
          .drift-bg,
          .drift-bg::after,
          .jxl-sparkle,
          .glitch-container::after,
          .glitch-layer,
          .glitch-text,
          .glitch-border,
          .jxl-teaser,
          .jxl-teaser::before,
          .glow-light-bar,
          .carousel-container::after {
            animation: none !important;
            opacity: 0.4 !important;
          }
          .glitch-container.glitching::after {
            opacity: 0 !important;
          }
          .carousel-track {
            transition: none !important;
          }
        }
      `}</style>

      <div className="pointer-events-none fixed inset-0">
        <div className="drift-bg" />
        <div className="cosmic-grid" />
        <motion.div
          className="aurora-orb--violet"
          animate={
            shouldReduceMotion
              ? undefined
              : { y: [0, -8, 0], x: [0, -6, 0], opacity: [0.12, 0.2, 0.12] }
          }
          transition={
            shouldReduceMotion
              ? undefined
              : { duration: 10, repeat: Infinity, ease: "easeInOut" }
          }
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
                    duration: 1.6 + (star.id % 5) * 0.35,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: star.delay,
                  }
            }
          />
        ))}
      </div>

      <div
        className="relative z-10 mx-auto w-full max-w-[430px] flex flex-col px-4 pt-6"
        style={{ paddingBottom: "calc(3rem + env(safe-area-inset-bottom))" }}
      >
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex flex-col top-section"
        >
          {/* ── GLOWING LIGHT BAR ── */}
          <div className="glow-light-bar mb-6 opacity-80" />

          {/* ── HERO: Future Direct Insights ─────────────────────────── */}
          <section className="mb-5 pt-1">
            <div className="relative overflow-hidden rounded-[28px] border border-white/[0.06] bg-white/[0.02] px-5 py-7 text-center shadow-[0_8px_32px_rgba(0,0,0,0.5),0_20px_60px_rgba(0,0,0,0.3)]">
              <div className="hero-halo opacity-70" aria-hidden="true" />

              <div className="relative z-10 mx-auto max-w-[560px]">
                <div className="mb-3 inline-flex items-center rounded-full px-3 py-1" style={{ border: `1px solid ${theme.accentLine}`, backgroundColor: theme.tagBg }}>
                  <span className="text-[10px] font-medium uppercase tracking-[0.22em]" style={{ color: theme.tagText }}>
                    Your Year Ahead
                  </span>
                </div>

                <h1 
                  className="bg-gradient-to-b from-white via-white bg-clip-text text-[38px] font-semibold leading-[0.95] tracking-[-0.02em] text-transparent drop-shadow-[0_10px_24px_rgba(0,0,0,0.45)] sm:text-[48px]"
                  style={{ 
                    backgroundImage: `linear-gradient(to bottom, #ffffff, #ffffff, ${theme.gradientEnd})` 
                  }}
                >
                  Future Direct Insights
                </h1>

                <p className="mx-auto mt-3 max-w-[34ch] text-[14px] leading-6 text-slate-300/78 sm:text-[15px]">
                  A focused look at the patterns, timing, and momentum shaping your next chapter.
                </p>
              </div>
            </div>
          </section>

          {/* ── Reading cycle — centered ─────────────────────────────── */}
          {(userStatus?.firstReadingUsed || (userStatus?.readingsCompleted ?? 0) > 0 || onCooldown) && (
            <div className="mb-1 mx-auto w-full max-w-[280px] space-y-2">
              <div className="flex items-center justify-center gap-2">
                <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  Reading cycle
                </span>
                <span className="text-[10px] text-slate-600">
                  {onCooldown ? 4 : readingsCompleted} / 4
                </span>
              </div>
              <div className="flex gap-1.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]"
                  >
                    {(onCooldown || i < readingsCompleted) && (
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 0.6, delay: i * 0.1, ease: "easeOut" }}
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          backgroundColor: theme.progressBar,
                          boxShadow: `0 0 8px ${theme.progressBar}`,
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {freeReadingCooldownLine && (
            <div className="mb-8 flex items-center justify-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-indigo-400/80" />
              <span className="text-[11px] text-indigo-300/70">{freeReadingCooldownLine}</span>
            </div>
          )}

          {onCooldown ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="relative"
            >
              <div className="space-y-3 blur-[5px] pointer-events-none select-none opacity-30">
                {AREAS.map((area) => {
                  const Icon = area.icon;
                  return (
                    <div
                      key={area.id}
                      className="w-full rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4"
                    >
                      <div className="flex items-start gap-3">
                        <motion.div
                          animate={getIconPulseAnimation(false)}
                          className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-slate-300"
                        >
                          <Icon className="h-4 w-4" />
                        </motion.div>
                        <div>
                          <h2 className="text-[15px] font-semibold text-white">{area.title}</h2>
                          <p className="mt-1 text-sm text-slate-400">{area.description}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="absolute inset-0 flex items-center justify-center px-2">
                <div className="cooldown-glow w-full rounded-[28px] border border-indigo-400/20 bg-[#050816]/95 px-6 py-6 text-center backdrop-blur-sm">
                  <div className="mb-3 flex justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-indigo-400/30 bg-indigo-400/10">
                      <Timer className="h-5 w-5 text-indigo-300" />
                    </div>
                  </div>
                  <h2 className="mb-2 text-[16px] font-semibold text-white">
                    Cooldown period active
                  </h2>
                  <p className="mb-1 text-[13px] leading-5 text-slate-400">
                    Due to safety concerns and us caring about your wellbeing, we've implemented a cooldown period between reading cycles.
                  </p>
                  {userStatus?.cooldownExpiresAt && (
                    <p className="mt-2 text-[12px] text-indigo-300/80">
                      Resets in {formatTimeRemaining(userStatus.cooldownExpiresAt)}
                    </p>
                  )}
                  <div className="mt-5 border-t border-white/10 pt-8">
                    <p className="mb-3 text-[12px] leading-5 text-slate-400">
                      You can do this one time per cycle.
                    </p>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.12 }}
                      type="button"
                      onClick={handleBypass}
                      disabled={isBypassLoading}
                      className="rounded-2xl bg-indigo-400 px-6 py-2.5 text-[13px] font-semibold text-slate-950 transition hover:bg-indigo-300 disabled:opacity-60"
                    >
                      {isBypassLoading ? "Loading…" : "Skip cooldown — $6.00"}
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <>
              <section className="space-y-3">
                {AREAS.map((area) => {
                  const Icon = area.icon;
                  const isSelected = selectedArea === area.id;
                  const cardAnimation = getCardAnimation(isSelected);

                  return (
                    <motion.button
                      key={area.id}
                      ref={isSelected ? clusterTopRef : undefined}
                      whileTap={{ scale: 0.985 }}
                      transition={{ duration: 0.12 }}
                      type="button"
                      onClick={() => {
                        const isFirstSelection = selectedArea !== area.id;
                        setSelectedArea(area.id);
                        setQuestion("");
                        trackTtq("ViewContent", { content_id: area.id, content_name: area.title });

                        if (isFirstSelection && area.id !== "other") {
                          scrollClusterIntoViewThenFocus();
                        }
                      }}
                      animate={cardAnimation}
                      data-selected={isSelected ? "true" : "false"}
                      className="selected-card-shell w-full rounded-[24px] border px-4 py-4 text-left backdrop-blur-sm shadow-[0_18px_40px_rgba(0,0,0,0.5)]"
                      style={{ 
                        willChange: "transform, opacity",
                        '--selected-wash': getSelectedWash(),
                        '--selected-shadow': getSelectedShadow(),
                      } as React.CSSProperties}
                    >
                      {isSelected && (
                        <div
                          className="pointer-events-none absolute inset-0 rounded-[24px]"
                          style={{
                            background: getGlowOverlay(),
                            zIndex: 0,
                          }}
                        />
                      )}

                      <div className="relative z-[1] flex items-start gap-3">
                        <motion.div
                          animate={getIconPulseAnimation(isSelected)}
                          className={cn(
                            "mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors duration-300",
                            isSelected
                              ? ""
                              : "border-white/10 bg-black/20 text-slate-300"
                          )}
                          style={{
                            borderColor: isSelected ? theme.selectedBorder : undefined,
                            backgroundColor: isSelected ? theme.selectedGlow : undefined,
                            color: isSelected ? theme.selectedIcon : undefined,
                            boxShadow: isSelected ? getIconTileShadow() : undefined,
                          }}
                        >
                          <Icon className="h-4 w-4" />
                        </motion.div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <h2 className="text-[15px] font-semibold text-white">
                              {area.title}
                            </h2>

                            <AnimatePresence>
                              {isSelected && (
                                <motion.span
                                  initial={{ opacity: 0, scale: 0.92, y: 4 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.92, y: 4 }}
                                  transition={{ duration: 0.18, ease: "easeOut" }}
                                  className="relative overflow-hidden rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em]"
                                  style={{
                                    color: theme.selectedTag,
                                    borderColor: theme.selectedBorder,
                                    backgroundColor: getBadgeBackground(),
                                    borderWidth: 1,
                                    borderStyle: "solid",
                                    boxShadow: getBadgeShadow(),
                                  }}
                                >
                                  {!shouldReduceMotion && (
                                    <motion.span
                                      aria-hidden="true"
                                      className="pointer-events-none absolute inset-0"
                                      style={{
                                        background:
                                          "linear-gradient(115deg, transparent 0%, transparent 35%, rgba(255,255,255,0.18) 50%, transparent 65%, transparent 100%)",
                                      }}
                                      initial={{ x: "-140%" }}
                                      animate={{ x: ["-140%", "140%"] }}
                                      transition={{
                                        duration: 1.1,
                                        ease: "easeOut",
                                        delay: 0.2,
                                      }}
                                    />
                                  )}
                                  <span className="relative z-[1]">Selected</span>
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </div>

                          <motion.p
                            className="mt-1 text-sm leading-5"
                            animate={{
                              color: isSelected
                                ? "rgba(226, 232, 240, 0.92)"
                                : "rgba(148, 163, 184, 1)",
                            }}
                            transition={{ duration: 0.24, ease: "easeOut" }}
                          >
                            {area.description}
                          </motion.p>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </section>

              <AnimatePresence>
                {selectedArea && selectedArea !== "other" && (
                  <motion.section
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="mt-6 space-y-2"
                  >
                    <Textarea
                      id="question"
                      ref={textareaRef}
                      rows={5}
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder={
                        AREAS.find((a) => a.id === selectedArea)?.placeholder ??
                        "Ask something specific so your reading can go deeper."
                      }
                      className="min-h-[132px] rounded-[24px] border px-4 py-4 text-[16px] leading-6 text-white placeholder:text-slate-400/80 transition-all duration-300 focus:outline-none focus:ring-1"
                      style={{
                        borderColor: "rgba(255,255,255,0.10)",
                        backgroundColor: "rgba(0,0,0,0.20)",
                        outlineColor: theme.accentLine,
                      }}
                      onFocus={(e) => {
                        const styles = getTextareaFocusStyles(true);
                        e.currentTarget.style.borderColor = styles.borderColor;
                        e.currentTarget.style.boxShadow = styles.boxShadow;
                      }}
                      onBlur={(e) => {
                        const styles = getTextareaFocusStyles(false);
                        e.currentTarget.style.borderColor = styles.borderColor;
                        e.currentTarget.style.boxShadow = styles.boxShadow;
                      }}
                    />
                    <p className="text-xs leading-5 text-slate-400">
                      Be specific. The clearer your question, the sharper the reading.
                    </p>
                  </motion.section>
                )}
              </AnimatePresence>
            </>
          )}

          <div className="mt-6 space-y-3 pb-2" ref={clusterBottomRef}>
            {submitError && (
              <p className="mb-2 text-center text-xs text-red-300">{submitError}</p>
            )}

            {!onCooldown && (
              <motion.div whileTap={{ scale: 0.985 }} transition={{ duration: 0.12 }}>
                <Button
                  type="button"
                  onClick={handleStartReading}
                  disabled={!canSubmit || isCreatingReading}
                  className="h-14 w-full rounded-2xl border text-[15px] font-medium transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-slate-900/60 disabled:text-slate-500"
                  style={{
                    borderColor: theme.selectedBorder,
                    color: theme.tagText,
                    background: getCTABackground(),
                    boxShadow: getCTAShadow(),
                  }}
                >
                  {buttonCopy}
                </Button>
              </motion.div>
            )}
          </div>

          <div className="mt-8 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-600">
              Unlimited Access
            </span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>

          {/* ── CAROUSEL: Unlimited Access Dashboard ── */}
          <div className="mt-4">
            <div className="carousel-container">
              {/* Header */}
              <button
                type="button"
                onClick={() => setIsCarouselOpen(!isCarouselOpen)}
                className="carousel-header"
                aria-expanded={isCarouselOpen}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/10 text-amber-200">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-[15px] font-semibold text-amber-200">Unlimited Access Dashboard</h2>
                    <p className="text-[11px] text-slate-400">Your astrological data at a glance</p>
                  </div>
                </div>
                <div className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-300/20 bg-black/20 text-amber-300/70 transition-transform duration-200",
                  isCarouselOpen && "rotate-180"
                )}>
                  <ChevronRight className="h-4 w-4" />
                </div>
              </button>

              <AnimatePresence>
                {isCarouselOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    {/* ── CAROUSEL - Fills entire space with no padding ── */}
                    <div className="carousel-content">
                      <div 
                        className="relative" 
                        style={{ padding: 0, overflow: "hidden", flex: 1 }}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                      >
                        <div 
                          className="carousel-track"
                          style={{ 
                            display: "flex",
                            height: "100%",
                            transform: `translateX(-${currentCardIndex * 100}%)`,
                            transition: isDragging || isMouseDragging ? "none" : "transform 0.4s ease"
                          }}
                        >
                          {[0, 1, 2, 3, 4].map((index) => {
                            const shouldBlur = !userStatus?.isSubscribed && index !== 0;
                            return (
                              <div key={index} className="carousel-card" style={{ minWidth: "100%", padding: 0, height: "100%" }}>
                                <div className="relative w-full h-full min-h-[220px] bg-black/20 p-6 flex flex-col">
                                  {/* Card Title */}
                                  <h3 className="text-sm font-semibold text-amber-200 mb-3">
                                    {cardTitles[index]}
                                  </h3>
                                  
                                  {/* Content - blurred if not subscribed and not card 0 */}
                                  <div className={shouldBlur ? "blur-content flex-1" : "flex-1"}>
                                    {renderCardContent(index)}
                                  </div>

                                  {/* Lock Overlay (only for non-subscribers, cards 1-4) */}
                                  {shouldBlur && (
                                    <div className="locked-overlay">
                                      <Lock className="h-8 w-8 text-amber-300/60 mb-2" />
                                      <p className="text-xs text-amber-200/60 font-medium">Premium Feature</p>
                                      <p className="text-[10px] text-slate-400 mt-1">Subscribe to unlock</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Bottom CTA - only shows when NOT subscribed */}
                      {!userStatus?.isSubscribed && (
                        <div className="p-4 pt-3 border-t border-amber-300/10">
                          <motion.button
                            whileTap={{ scale: 0.985 }}
                            transition={{ duration: 0.12 }}
                            type="button"
                            onClick={() => {
                              setIsSubscribeLoading(true);
                              trackTtq("InitiateCheckout", { content_id: "subscription", value: 12.99, currency: "USD" });
                              (async () => {
                                try {
                                  const res = await fetch("/api/stripe/checkout", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      returnUrl: `${window.location.origin}/reading/intake`,
                                      mode: "subscription",
                                      paywallIndex: 1,
                                    }),
                                  });
                                  const data = await res.json();
                                  if (data.url) window.location.href = data.url;
                                } finally {
                                  setIsSubscribeLoading(false);
                                }
                              })();
                            }}
                            className="h-10 w-full rounded-xl bg-amber-300/20 border border-amber-300/30 text-amber-200 text-[13px] font-semibold transition hover:bg-amber-300/30"
                          >
                            {isSubscribeLoading ? "Loading…" : "Unlock All Features — $12.99/mo"}
                          </motion.button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* ── ENHANCED COMING SOON WITH GLITCH ────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
            className="mt-4"
          >
            <div className="mb-2 flex items-center justify-center">
              <span className="flex items-center gap-1.5 rounded-full border border-indigo-400/25 bg-indigo-400/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-indigo-300/80">
                <Lock className="h-2.5 w-2.5" />
                In Development
              </span>
            </div>
            <div
              className={cn(
                "glitch-border glitch-container relative overflow-hidden rounded-[28px] border border-indigo-400/20 bg-black/30 pointer-events-none select-none",
                glitchActive && "glitching"
              )}
              style={{
                "--glitch-offset": `${glitchOffset}px`,
              } as React.CSSProperties}
              aria-hidden="true"
            >
              {/* ── Glitch layers ── */}
              <div
                className={cn(
                  "glitch-layer glitch-layer-cyan",
                  glitchActive && glitchColor === "cyan" && "active"
                )}
              />
              <div
                className={cn(
                  "glitch-layer glitch-layer-magenta",
                  glitchActive && glitchColor === "magenta" && "active"
                )}
              />
              <div
                className={cn(
                  "glitch-layer glitch-layer-yellow",
                  glitchActive && glitchColor === "yellow" && "active"
                )}
              />

              {/* ── Sparkles ── */}
              {comingSoonSparkles.map((sparkle, i) => (
                <span
                  key={i}
                  className={cn(
                    "jxl-sparkle",
                    sparkle.color === "indigo" ? "jxl-sparkle--indigo" : "jxl-sparkle--gold"
                  )}
                  style={{
                    left: sparkle.left,
                    top: sparkle.top,
                    width: `${sparkle.size}px`,
                    height: `${sparkle.size}px`,
                    animationDelay: `${sparkle.delay}s`,
                  }}
                />
              ))}

              {/* ── Blurred preview content ── */}
              <div className="blur-[6px] px-5 py-5 opacity-60">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-300" />
                  <span className="text-[14px] font-semibold text-indigo-200">
                    Ask Jxl
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-3/4 rounded-full bg-slate-400/30" />
                  <div className="h-3 w-1/2 rounded-full bg-slate-400/20" />
                  <div className="mt-4 h-16 rounded-2xl border border-white/10 bg-white/5" />
                </div>
              </div>

              {/* ── Gradient overlay ── */}
              <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/10 via-transparent to-indigo-950/20 rounded-[28px]" />
              {/* ── Lock overlay with glitch text ── */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border border-indigo-400/30 bg-indigo-400/10 transition-all duration-100",
                      glitchActive && "border-cyan-400/60 bg-cyan-400/20"
                    )}
                  >
                    <Lock
                      className={cn(
                        "h-4 w-4 text-indigo-300/70 transition-all duration-100",
                        glitchActive && "text-cyan-300"
                      )}
                    />
                  </div>
                  <span
                    className={cn(
                      "glitch-text text-[11px] tracking-wide text-indigo-300/60 transition-all duration-100",
                      glitchActive && "glitching"
                    )}
                  >
                    Something Great is in Development — Coming Soon
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}