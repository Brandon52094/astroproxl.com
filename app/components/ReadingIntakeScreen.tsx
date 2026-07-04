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

interface ReadingIntakeScreenProps {
  userStatus: UserStatus | null;
  onSwipeLeft?: () => void; // Callback to trigger swipe to next panel
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
type ThemeName = "teal" | "earth";

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
  accentLine: string;
  areaColors: {
    love: { bg: string; border: string; glow: string; text: string; gradient: string };
    money: { bg: string; border: string; glow: string; text: string; gradient: string };
    career: { bg: string; border: string; glow: string; text: string; gradient: string };
    other: { bg: string; border: string; glow: string; text: string; gradient: string };
    cta: { bg: string; border: string; glow: string; text: string; gradient: string };
    hero: { bg: string; border: string; glow: string; text: string; gradient: string };
  };
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
    accentLine: "#2DD4BF",
    areaColors: {
      love: {
        bg: "rgba(45,212,191,0.08)",
        border: "rgba(45,212,191,0.35)",
        glow: "rgba(45,212,191,0.12)",
        text: "#5EEAD4",
        gradient: "linear-gradient(135deg, rgba(45,212,191,0.12), rgba(20,184,166,0.06))"
      },
      money: {
        bg: "rgba(251,191,36,0.08)",
        border: "rgba(251,191,36,0.35)",
        glow: "rgba(251,191,36,0.12)",
        text: "#FCD34D",
        gradient: "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(245,158,11,0.06))"
      },
      career: {
        bg: "rgba(129,140,248,0.08)",
        border: "rgba(129,140,248,0.35)",
        glow: "rgba(129,140,248,0.12)",
        text: "#A5B4FC",
        gradient: "linear-gradient(135deg, rgba(129,140,248,0.12), rgba(99,102,241,0.06))"
      },
      other: {
        bg: "rgba(232,200,122,0.08)",
        border: "rgba(232,200,122,0.35)",
        glow: "rgba(232,200,122,0.12)",
        text: "#E8C87A",
        gradient: "linear-gradient(135deg, rgba(232,200,122,0.12), rgba(200,160,80,0.06))"
      },
      cta: {
        bg: "rgba(45,212,191,0.15)",
        border: "rgba(94,234,212,0.45)",
        glow: "rgba(45,212,191,0.20)",
        text: "#5EEAD4",
        gradient: "linear-gradient(180deg, rgba(45,212,191,0.25), rgba(20,184,166,0.10))"
      },
      hero: {
        bg: "rgba(45,212,191,0.05)",
        border: "rgba(45,212,191,0.20)",
        glow: "rgba(45,212,191,0.08)",
        text: "#5EEAD4",
        gradient: "linear-gradient(135deg, rgba(45,212,191,0.08), rgba(20,184,166,0.04))"
      }
    }
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
    accentLine: "#254B3A",
    areaColors: {
      love: {
        bg: "rgba(209,194,166,0.10)",
        border: "rgba(209,194,166,0.35)",
        glow: "rgba(209,194,166,0.12)",
        text: "#D1C2A6",
        gradient: "linear-gradient(135deg, rgba(209,194,166,0.14), rgba(37,75,58,0.08))"
      },
      money: {
        bg: "rgba(106,90,67,0.12)",
        border: "rgba(106,90,67,0.35)",
        glow: "rgba(106,90,67,0.12)",
        text: "#D1C2A6",
        gradient: "linear-gradient(135deg, rgba(106,90,67,0.14), rgba(37,75,58,0.08))"
      },
      career: {
        bg: "rgba(37,75,58,0.12)",
        border: "rgba(37,75,58,0.35)",
        glow: "rgba(37,75,58,0.12)",
        text: "#D1C2A6",
        gradient: "linear-gradient(135deg, rgba(37,75,58,0.14), rgba(20,50,35,0.08))"
      },
      other: {
        bg: "rgba(209,194,166,0.08)",
        border: "rgba(209,194,166,0.30)",
        glow: "rgba(209,194,166,0.10)",
        text: "#D1C2A6",
        gradient: "linear-gradient(135deg, rgba(209,194,166,0.12), rgba(106,90,67,0.08))"
      },
      cta: {
        bg: "rgba(37,75,58,0.25)",
        border: "rgba(209,194,166,0.45)",
        glow: "rgba(37,75,58,0.25)",
        text: "#D1C2A6",
        gradient: "linear-gradient(180deg, #254B3A 0%, #1E352A 100%)"
      },
      hero: {
        bg: "rgba(209,194,166,0.05)",
        border: "rgba(209,194,166,0.20)",
        glow: "rgba(209,194,166,0.08)",
        text: "#D1C2A6",
        gradient: "linear-gradient(135deg, rgba(209,194,166,0.08), rgba(37,75,58,0.04))"
      }
    }
  }
};

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

export default function ReadingIntakeScreen({ 
  userStatus: propUserStatus,
  onSwipeLeft 
}: ReadingIntakeScreenProps) {
  const router = useRouter();
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [isCreatingReading, setIsCreatingReading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [chartStatus, setChartStatus] = useState<
    "checking" | "ready" | "recalculating" | "error"
  >("checking");
  const [userStatus, setUserStatus] = useState<UserStatus | null>(propUserStatus || null);
  const [isBypassLoading, setIsBypassLoading] = useState(false);

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
  const [todayPlanets, setTodayPlanets] = useState<TodayTransitPlanet[]>([]);

  // ── Theme state ──────────────────────────────────────────────────────
  const [theme, setTheme] = useState<ThemeColors>(THEMES.teal);
  const [isSubscribed, setIsSubscribed] = useState(false);

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
      setTodaySun(todaySunPlanet);
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

    // ── Set theme ──────────────────────────────────────────────────────
    const isUserSubscribed = userStatus?.isSubscribed || false;
    setIsSubscribed(isUserSubscribed);
    setTheme(isUserSubscribed ? THEMES.earth : THEMES.teal);
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

  // ── Theme-specific helper functions ────────────────────────────────

  // Get area-specific colors
  const getAreaColors = (areaId: string) => {
    const areaMap: Record<string, keyof ThemeColors['areaColors']> = {
      love: 'love',
      money: 'money',
      career: 'career',
      other: 'other'
    };
    const key = areaMap[areaId] || 'other';
    return theme.areaColors[key];
  };

  // Get card animation based on theme and area
  const getCardAnimation = (isSelected: boolean, areaId: string) => {
    const areaColors = getAreaColors(areaId);
    
    if (!isSelected) {
      return {
        backgroundColor: "rgba(255, 255, 255, 0.03)",
        borderColor: theme.unselectedBorder,
        y: 0,
      };
    }

    return {
      backgroundColor: areaColors.bg,
      borderColor: areaColors.border,
      y: shouldReduceMotion ? 0 : -2,
    };
  };

  // Get glow overlay based on theme and area
  const getGlowOverlay = (areaId: string) => {
    const areaColors = getAreaColors(areaId);
    
    if (theme.name === "earth") {
      return `radial-gradient(circle at 50% 50%, ${areaColors.glow}, rgba(37,75,58,0.08) 38%, transparent 72%)`;
    }
    return `radial-gradient(circle at 50% 50%, ${theme.selectedGlow}, rgba(0,0,0,0) 72%)`;
  };

  // Get icon tile shadow based on area
  const getIconTileShadow = (areaId: string) => {
    const areaColors = getAreaColors(areaId);
    return `0 0 16px ${areaColors.glow}`;
  };

  // Get badge background based on theme
  const getBadgeBackground = () => {
    if (theme.name === "earth") {
      return "rgba(37,75,58,0.28)";
    }
    return theme.selectedGlow;
  };

  // Get badge shadow based on theme
  const getBadgeShadow = () => {
    if (theme.name === "earth") {
      return "inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(37,75,58,0.08)";
    }
    return undefined;
  };

  // Get CTA background based on theme
  const getCTABackground = () => {
    if (theme.name === "earth") {
      return "linear-gradient(180deg, #254B3A 0%, #1E352A 100%)";
    }
    return "rgba(0,0,0,0.40)";
  };

  // Get CTA shadow based on theme
  const getCTAShadow = () => {
    if (theme.name === "earth") {
      return "0 10px 30px rgba(37,75,58,0.28), inset 0 1px 0 rgba(255,255,255,0.06)";
    }
    return `0 4px 24px ${theme.selectedGlow}`;
  };

  // Get textarea focus styles based on theme
  const getTextareaFocusStyles = (isFocused: boolean) => {
    if (!isFocused) {
      return {
        borderColor: "rgba(255,255,255,0.10)",
        boxShadow: "none",
      };
    }

    if (theme.name === "earth") {
      return {
        borderColor: "#254B3A",
        boxShadow: "0 0 22px rgba(37,75,58,0.25)",
      };
    }
    return {
      borderColor: theme.accentLine,
      boxShadow: `0 0 22px ${theme.selectedGlow}`,
    };
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

        @keyframes swipePulse {
          0%, 100% { transform: translateX(0); opacity: 0.4; }
          50% { transform: translateX(10px); opacity: 1; }
        }

        .swipe-arrow {
          animation: swipePulse 2s ease-in-out infinite;
        }

        @keyframes swipeButtonPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.4); }
          50% { box-shadow: 0 0 0 12px rgba(251, 191, 36, 0); }
        }

        .swipe-button-glow {
          animation: swipeButtonPulse 2s ease-in-out infinite;
        }

        .swipe-hint-container {
          position: relative;
          overflow: hidden;
          border-radius: 24px;
          border: 1px solid rgba(251, 191, 36, 0.2);
          background: linear-gradient(180deg, rgba(251, 191, 36, 0.06), rgba(251, 191, 36, 0.02));
          animation: jxlAmberPulse 2.8s ease-in-out infinite;
          cursor: pointer;
        }

        .swipe-hint-container::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 16% 18%, rgba(255, 255, 255, 0.06), transparent 26%),
            radial-gradient(circle at 80% 12%, rgba(251, 191, 36, 0.12), transparent 24%);
          pointer-events: none;
          z-index: 0;
        }

        .swipe-hint-container::after {
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

        .swipe-hint-container > * {
          position: relative;
          z-index: 1;
        }

        @media (prefers-reduced-motion: reduce) {
          .drift-bg,
          .drift-bg::after,
          .jxl-sparkle,
          .jxl-teaser,
          .jxl-teaser::before,
          .glow-light-bar,
          .swipe-arrow,
          .swipe-button-glow,
          .swipe-hint-container,
          .swipe-hint-container::after {
            animation: none !important;
            opacity: 0.4 !important;
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
        className="relative z-10 mx-auto w-full max-w-[430px] flex flex-col px-4 pt-1"
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
                <div className="mb-3 inline-flex items-center rounded-full px-3 py-1" style={{ border: `1px solid ${theme.accentLine}`, backgroundColor: theme.areaColors.hero.bg }}>
                  <span className="text-[10px] font-medium uppercase tracking-[0.22em]" style={{ color: theme.areaColors.hero.text }}>
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
                  const areaColors = getAreaColors(area.id);
                  const cardAnimation = getCardAnimation(isSelected, area.id);

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
                        '--selected-wash': areaColors.gradient,
                        '--selected-shadow': `0 0 0 1px ${areaColors.border}, 0 10px 30px ${areaColors.glow}, 0 0 24px ${areaColors.glow}`,
                      } as React.CSSProperties}
                    >
                      {isSelected && (
                        <div
                          className="pointer-events-none absolute inset-0 rounded-[24px]"
                          style={{
                            background: getGlowOverlay(area.id),
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
                            borderColor: isSelected ? areaColors.border : undefined,
                            backgroundColor: isSelected ? areaColors.glow : undefined,
                            color: isSelected ? areaColors.text : undefined,
                            boxShadow: isSelected ? getIconTileShadow(area.id) : undefined,
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
                    borderColor: theme.areaColors.cta.border,
                    color: theme.areaColors.cta.text,
                    background: getCTABackground(),
                    boxShadow: getCTAShadow(),
                  }}
                >
                  {buttonCopy}
                </Button>
              </motion.div>
            )}
          </div>

          {/* ── SWIPE HINT: Explore Unlimited Access ── */}
<motion.div
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
  className="mt-4"
>
  {/* Header */}
  <div className="flex items-center justify-center gap-2 mb-3">
    <Sparkles className="h-3.5 w-3.5 text-amber-300/60" />
    <span className="text-[13px] font-medium text-amber-200/80 tracking-wide">
      Explore Unlimited Access
    </span>
  </div>

  {/* Swipe Button - only this is clickable/swipeable */}
  <motion.button
    whileTap={{ scale: 0.97 }}
    transition={{ duration: 0.12 }}
    onClick={(e) => {
      e.stopPropagation();
      onSwipeLeft?.();
    }}
    className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-400/15 to-amber-500/5 border border-amber-300/20 text-amber-200/80 text-[14px] font-medium transition hover:bg-amber-300/10 flex items-center justify-center gap-3"
  >
    <svg className="w-4 h-4 swipe-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
    <span>Swipe left to explore</span>
  </motion.button>

  {/* Dot indicators */}
  <div className="flex justify-center gap-1.5 mt-3">
    {[0, 1, 2, 3, 4].map((i) => (
      <div 
        key={i} 
        className={cn(
          "h-1 rounded-full transition-all",
          i === 0 ? "w-4 bg-amber-300/40" : "w-1.5 bg-white/10"
        )}
      />
    ))}
  </div>
  <p className="text-center text-[10px] text-slate-500/40 mt-1.5">
    5 screens · swipe to navigate
  </p>
</motion.div>

          {/* ── COMING SOON — Static ── */}
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
              className="relative overflow-hidden rounded-[28px] border border-indigo-400/20 bg-black/30 pointer-events-none select-none"
              aria-hidden="true"
            >
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
              
              {/* ── Lock overlay ── */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-indigo-400/30 bg-indigo-400/10"
                  >
                    <Lock className="h-4 w-4 text-indigo-300/70" />
                  </div>
                  <span className="text-[11px] tracking-wide text-indigo-300/60">
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