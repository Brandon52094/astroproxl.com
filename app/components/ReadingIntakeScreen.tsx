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
    cta: "Begin My Love Reading",
  },
  {
    id: "money",
    title: "Money",
    description: "Income, stability, opportunities, and financial timing",
    icon: Wallet,
    placeholder: "Ask something specific about money, stability, or the opportunities opening next.",
    cta: "Begin My Money Reading",
  },
  {
    id: "career",
    title: "Career",
    description: "Work, recognition, direction, and next steps",
    icon: Briefcase,
    placeholder: "Ask something specific about work, momentum, or the direction your career is moving.",
    cta: "Begin My Career Reading",
  },
  {
    id: "other",
    title: "What's Coming",
    description: "The next 30–45 days — timing, shifts, and what your chart says is moving toward you.",
    icon: Sparkles,
    placeholder: "Ask about timing, what's approaching, or what you should be ready for in the weeks ahead.",
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
  onSwipeLeft?: () => void;
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

type ThemeName = "cosmic";

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
  nextStepBorder: string;
  nextStepGlow: string;
  areaColors: {
    love: { bg: string; border: string; glow: string; text: string; gradient: string; iconBg: string };
    money: { bg: string; border: string; glow: string; text: string; gradient: string; iconBg: string };
    career: { bg: string; border: string; glow: string; text: string; gradient: string; iconBg: string };
    other: { bg: string; border: string; glow: string; text: string; gradient: string; iconBg: string };
    cta: { bg: string; border: string; glow: string; text: string; gradient: string; iconBg: string };
    hero: { bg: string; border: string; glow: string; text: string; gradient: string; iconBg: string };
  };
}

const THEMES: Record<ThemeName, ThemeColors> = {
  cosmic: {
    name: "cosmic",
    tagBg: "rgba(255,255,255,0.06)",
    tagText: "#F8FAFC",
    gradientEnd: "#FFFFFF",
    progressBar: "#F8FAFC",
    unselectedBorder: "rgba(255,255,255,0.10)",
    selectedBorder: "rgba(255,255,255,0.22)",
    selectedGlow: "rgba(255,255,255,0.16)",
    selectedIcon: "#FFFFFF",
    selectedTag: "#FFFFFF",
    accentLine: "rgba(255,255,255,0.72)",
    nextStepBorder: "rgba(255,255,255,0.65)",
    nextStepGlow: "rgba(255,255,255,0.24)",
    areaColors: {
      love: {
        bg: "rgba(127, 29, 29, 0.30)",
        border: "#F97316",
        glow: "rgba(239, 68, 68, 0.30)",
        text: "#FCA5A5",
        iconBg: "rgba(127, 29, 29, 0.55)",
        gradient: "linear-gradient(135deg, rgba(127,29,29,0.85) 0%, rgba(153,27,27,0.70) 32%, rgba(239,68,68,0.20) 100%)",
      },
      money: {
        bg: "rgba(20, 83, 45, 0.30)",
        border: "#D4A574",
        glow: "rgba(34, 197, 94, 0.30)",
        text: "#86EFAC",
        iconBg: "rgba(20, 83, 45, 0.55)",
        gradient: "linear-gradient(135deg, rgba(20,83,45,0.85) 0%, rgba(22,101,52,0.70) 32%, rgba(34,197,94,0.20) 100%)",
      },
      career: {
        bg: "rgba(30, 58, 138, 0.30)",
        border: "#FFFFFF",
        glow: "rgba(59, 130, 246, 0.30)",
        text: "#93C5FD",
        iconBg: "rgba(30, 58, 138, 0.55)",
        gradient: "linear-gradient(135deg, rgba(30,58,138,0.85) 0%, rgba(37,99,235,0.70) 32%, rgba(59,130,246,0.20) 100%)",
      },
      other: {
        bg: "rgba(49, 46, 129, 0.30)",
        border: "#4F46E5",
        glow: "rgba(139, 92, 246, 0.30)",
        text: "#C4B5FD",
        iconBg: "rgba(49, 46, 129, 0.55)",
        gradient: "linear-gradient(135deg, rgba(49,46,129,0.85) 0%, rgba(91,33,182,0.70) 32%, rgba(139,92,246,0.20) 100%)",
      },
      cta: {
        bg: "rgba(255,255,255,0.08)",
        border: "rgba(255,255,255,0.22)",
        glow: "rgba(0,0,0,0.4)",
        text: "#F8FAFC",
        iconBg: "rgba(255,255,255,0.06)",
        gradient: "linear-gradient(180deg, #161A26 0%, #0A0D16 100%)",
      },
      hero: {
        bg: "rgba(255,255,255,0.04)",
        border: "rgba(255,255,255,0.14)",
        glow: "rgba(255,255,255,0.08)",
        text: "#FFFFFF",
        iconBg: "rgba(255,255,255,0.05)",
        gradient: "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
      },
    },
  },
};

function formatTimeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "soon";
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

const PLANET_ORDER = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const MAJOR_PLANETS = ["Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const TOTAL_CARDS = 5;
const CARD_TITLES = [
  "Unlimited Access",
  "Your Natal Chart",
  "Today's Astrological Calendar",
  "Current Important Transits",
  "Coming Soon",
];

export default function ReadingIntakeScreen({
  userStatus: propUserStatus,
  onSwipeLeft,
}: ReadingIntakeScreenProps) {
  const router = useRouter();
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [isCreatingReading, setIsCreatingReading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [chartStatus, setChartStatus] = useState<"checking" | "ready" | "recalculating" | "error">("checking");
  const [userStatus, setUserStatus] = useState<UserStatus | null>(propUserStatus || null);
  const [isBypassLoading, setIsBypassLoading] = useState(false);
  const [isSubscribeLoading, setIsSubscribeLoading] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isCarouselOpen, setIsCarouselOpen] = useState(false);
  const [touchStartX, setTouchStartX] = useState(0);
  const [touchEndX, setTouchEndX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const [natalSun, setNatalSun] = useState<NatalPlacement | null>(null);
  const [natalMoon, setNatalMoon] = useState<NatalPlacement | null>(null);
  const [natalRising, setNatalRising] = useState<NatalPlacement | null>(null);
  const [allPlanets, setAllPlanets] = useState<NatalPlacement[]>([]);

  const [moonPhase, setMoonPhase] = useState<MoonPhaseData | null>(null);
  const [todaySun, setTodaySun] = useState<TodayTransitPlanet | null>(null);
  const [todayPlanets, setTodayPlanets] = useState<TodayTransitPlanet[]>([]);

  const theme = THEMES.cosmic;
  const shouldReduceMotion = useReducedMotion();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const clusterTopRef = useRef<HTMLButtonElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const clusterBottomRef = useRef<HTMLDivElement | null>(null);
  const scrollFocusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const stars = useMemo(
    () =>
      Array.from({ length: 68 }).map((_, i) => {
        const left = `${((i * 37) % 100)}%`;
        const top = `${((i * 19 + 13) % 100)}%`;
        const size = i % 7 === 0 ? 3.5 : i % 5 === 0 ? 2.5 : 1.5;
        const opacity = i % 7 === 0 ? 0.72 : i % 5 === 0 ? 0.55 : 0.34;
        const delay = (i * 0.37) % 4;
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

  const getIconPulseAnimation = useCallback((isSelected = false) => {
    if (shouldReduceMotion) return {};
    if (!isSelected) return { scale: 1, transition: { duration: 0.2 } };
    return {
      scale: [1, 1.12, 1],
      transition: { duration: 2.1, repeat: Infinity, ease: "easeInOut" as const },
    };
  }, [shouldReduceMotion]);

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
          chartData: calcData,
        });
        setChartStatus("ready");
      } catch { setChartStatus("error"); }
    }
    ensureChart();
  }, [router]);

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
    const allPlanetsData: NatalPlacement[] = [];
    PLANET_ORDER.forEach(name => {
      const found = planets.find(p => p.name === name);
      if (found) allPlanetsData.push(found);
    });
    const rising = planets.find(p => p.name === "Ascendant");
    if (rising) allPlanetsData.push({ ...rising, name: "Rising" });
    setAllPlanets(allPlanetsData);
    setNatalSun(planets.find(p => p.name === "Sun") ?? null);
    setNatalMoon(planets.find(p => p.name === "Moon") ?? null);
    setNatalRising(planets.find(p => p.name === "Ascendant") ?? null);
    if (data.moonPhase) setMoonPhase(data.moonPhase);
    if (data.transits) {
      setTodaySun(data.transits.find(p => p.name === "Sun") ?? null);
      const allTransits: TodayTransitPlanet[] = [];
      PLANET_ORDER.forEach(name => {
        const found = data.transits?.find(p => p.name === name);
        if (found) allTransits.push(found);
      });
      setTodayPlanets(allTransits);
    }
  }, [chartStatus]);

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
    } catch { return 0; }
    finally { setTimeout(() => { fetchInFlight.current = false; }, 2000); }
  }, []);

  useEffect(() => {
    (async () => {
      const initialPaywalls = await fetchStatus();
      if (initialPaywalls === 0) {
        let attempts = 0;
        const poll = async () => {
          const paywalls = await fetchStatus();
          attempts++;
          if (paywalls === 0 && attempts < 4) setTimeout(poll, 3000);
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

  const selectedAreaConfig = useMemo(() => AREAS.find(a => a.id === selectedArea) ?? null, [selectedArea]);

  const buttonCopy = useMemo(() => {
    if (chartStatus === "recalculating") return "Loading your chart…";
    if (isCreatingReading) return "Preparing reading...";
    if (!selectedAreaConfig) return "Choose a reading type";
    if (userStatus?.firstReadingUsed && !userStatus?.isSubscribed) return `${selectedAreaConfig.cta} — $4.00`;
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
    if (scrollFocusTimeoutRef.current) clearTimeout(scrollFocusTimeoutRef.current);
    requestAnimationFrame(() => {
      const topEl = clusterTopRef.current;
      if (!topEl) return;
      const topRect = topEl.getBoundingClientRect();
      const currentScrollY = window.scrollY || document.documentElement.scrollTop;
      window.scrollTo({ top: Math.max(0, currentScrollY + topRect.top - 12), behavior: "smooth" });
      scrollFocusTimeoutRef.current = setTimeout(() => { textareaRef.current?.focus(); }, 420);
    });
  }, []);

  useEffect(() => () => { if (scrollFocusTimeoutRef.current) clearTimeout(scrollFocusTimeoutRef.current); }, []);

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
      const topic = selectedArea === "love" ? "love" : selectedArea === "career" ? "career" : selectedArea === "money" ? "money" : "general";
      saveIntake({
        topic: topic as "love" | "career" | "money" | "general",
        area: selectedArea,
        question: selectedArea === "other" ? "What is coming for me in the next 30–45 days?" : question.trim(),
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
            body: JSON.stringify({ returnUrl: window.location.origin + "/reading/preparing", mode: "one_time", paywallIndex }),
          });
          const checkoutData = await checkoutRes.json();
          if (checkoutData.url) { window.location.href = checkoutData.url; return; }
        }
      }
      router.push("/reading/preparing");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Something went wrong");
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
        body: JSON.stringify({ returnUrl: `${window.location.origin}/reading/intake`, mode: "bypass" }),
      });
      const data = await response.json();
      if (data.url) window.location.href = data.url;
    } catch { }
    finally { setIsBypassLoading(false); }
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
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    parts.push(`${hours}h`, `${minutes}m`);
    return `Free reading resets in ${parts.join(" ")}`;
  }, [userStatus, onCooldown, now]);

  const goToPrevious = useCallback(() => setCurrentCardIndex(p => (p === 0 ? TOTAL_CARDS - 1 : p - 1)), []);
  const goToNext = useCallback(() => setCurrentCardIndex(p => (p === TOTAL_CARDS - 1 ? 0 : p + 1)), []);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setTouchEndX(e.touches[0].clientX);
    setIsDragging(true);
  };
  const handleTouchMove = (e: React.TouchEvent) => { if (isDragging) setTouchEndX(e.touches[0].clientX); };
  const handleTouchEnd = () => {
    setIsDragging(false);
    const dist = touchStartX - touchEndX;
    if (dist > 50) goToNext();
    else if (dist < -50) goToPrevious();
    setTouchStartX(0); setTouchEndX(0);
  };

  const [mouseStartX, setMouseStartX] = useState(0);
  const [mouseEndX, setMouseEndX] = useState(0);
  const [isMouseDragging, setIsMouseDragging] = useState(false);
  const handleMouseDown = (e: React.MouseEvent) => { setMouseStartX(e.clientX); setMouseEndX(e.clientX); setIsMouseDragging(true); };
  const handleMouseMove = (e: React.MouseEvent) => { if (isMouseDragging) setMouseEndX(e.clientX); };
  const handleMouseUp = () => {
    setIsMouseDragging(false);
    const dist = mouseStartX - mouseEndX;
    if (dist > 50) goToNext();
    else if (dist < -50) goToPrevious();
    setMouseStartX(0); setMouseEndX(0);
  };

  const getAreaColors = useCallback((areaId: string) => {
    const key = (["love", "money", "career", "other"].includes(areaId) ? areaId : "other") as keyof ThemeColors["areaColors"];
    return theme.areaColors[key];
  }, [theme]);

  const getCardAnimation = useCallback((isSelected: boolean, areaId: string) => {
    const areaColors = getAreaColors(areaId);
    if (!isSelected) return { backgroundColor: "rgba(255, 255, 255, 0.03)", borderColor: theme.unselectedBorder, y: 0 };
    return { backgroundColor: areaColors.bg, borderColor: areaColors.border, y: shouldReduceMotion ? 0 : -2 };
  }, [getAreaColors, theme.unselectedBorder, shouldReduceMotion]);

  const getGlowOverlay = useCallback((areaId: string) => {
    const c = getAreaColors(areaId);
    return `radial-gradient(circle at 50% 50%, ${c.glow}, rgba(255,255,255,0.018) 38%, transparent 72%)`;
  }, [getAreaColors]);

  const getIconTileShadow = useCallback((areaId: string) => {
    const c = getAreaColors(areaId);
    return `0 14px 28px rgba(0,0,0,0.58), 0 0 30px ${c.glow}`;
  }, [getAreaColors]);

  const renderCardContent = useCallback((index: number) => {
    switch (index) {
      case 0:
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
                  {["Unlimited Readings", "Unlimited Replies", "Daily Transits & Moon Cycles", "Free Reading Downloads.", "New Premium Feature in Development", "Lock in a Low Price Now"].map(perk => (
                    <div key={perk} className="flex items-center gap-2.5">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-[9px] text-amber-300">✓</span>
                      <span className="text-[12px] text-slate-300">{perk}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-amber-300/60">More, still premium.</p>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-4 flex-1">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">
                  <Sparkles className="h-6 w-6" />
                </div>
                <p className="mt-3 text-center text-sm text-slate-300">You have full access to all features.</p>
                <p className="text-center text-xs text-slate-500 mt-1">Enjoy your Unlimited Access.</p>
              </div>
            )}
          </div>
        );
      case 1:
        return (
          <div className="space-y-3 flex-1">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/[0.03] px-3 py-2"><span className="text-xs text-slate-400">Sun</span><p className="text-sm text-white font-medium">{natalSun ? `${natalSun.sign} ${natalSun.degree}` : "—"}</p></div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2"><span className="text-xs text-slate-400">Moon</span><p className="text-sm text-white font-medium">{natalMoon ? `${natalMoon.sign} ${natalMoon.degree}` : "—"}</p></div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2"><span className="text-xs text-slate-400">Rising</span><p className="text-sm text-white font-medium">{natalRising ? `${natalRising.sign} ${natalRising.degree}` : "—"}</p></div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2"><span className="text-xs text-slate-400">Planets</span><p className="text-sm text-white font-medium">{allPlanets.length}</p></div>
            </div>
            <div className="max-h-[100px] overflow-y-auto space-y-1">
              {allPlanets.slice(0, 5).map(planet => (
                <div key={planet.name} className="flex justify-between text-xs">
                  <span className="text-slate-400">{planet.name}</span>
                  <span className="text-white">{planet.sign} {planet.degree}</span>
                </div>
              ))}
              {allPlanets.length > 5 && <div className="text-xs text-slate-500">+{allPlanets.length - 5} more</div>}
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-3 flex-1">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/[0.03] px-3 py-2"><span className="text-xs text-slate-400">Moon Phase</span><p className="text-sm text-white font-medium">{moonPhase?.phaseName || "—"}</p></div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2"><span className="text-xs text-slate-400">Illumination</span><p className="text-sm text-white font-medium">{moonPhase?.illuminationPercent || "—"}%</p></div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2"><span className="text-xs text-slate-400">Moon Sign</span><p className="text-sm text-white font-medium">{moonPhase?.moonSign || "—"}</p></div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2"><span className="text-xs text-slate-400">Retrogrades</span><p className="text-sm text-white font-medium">{todayPlanets.filter(p => p.isRetrograde).length || 0}</p></div>
            </div>
            <div className="space-y-1 max-h-[80px] overflow-y-auto">
              {todayPlanets.slice(0, 4).map(planet => (
                <div key={planet.name} className="flex justify-between text-xs">
                  <span className="text-slate-400">{planet.name}</span>
                  <span className="text-white">{planet.sign} {planet.degree}{planet.isRetrograde ? " ℞" : ""}</span>
                </div>
              ))}
            </div>
          </div>
        );
      case 3: {
        const majorTransits = todayPlanets.filter(p => MAJOR_PLANETS.includes(p.name));
        return (
          <div className="space-y-3 flex-1">
            <div className="text-xs text-slate-400 mb-2">Major planetary transits</div>
            {majorTransits.length > 0 ? (
              <div className="space-y-2">
                {majorTransits.map(planet => (
                  <div key={planet.name} className="flex justify-between items-center rounded-xl bg-white/[0.03] px-3 py-2">
                    <span className="text-sm text-slate-300">{planet.name}</span>
                    <span className="text-sm text-white">{planet.sign} {planet.degree}{planet.isRetrograde && " ℞"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-sm text-slate-500 py-4">Loading transits...</div>
            )}
          </div>
        );
      }
      case 4:
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
  }, [userStatus, natalSun, natalMoon, natalRising, allPlanets, moonPhase, todayPlanets]);

  return (
    <div
      className="no-scrollbar relative h-screen overflow-y-auto overscroll-none text-slate-100"
      style={{
        WebkitOverflowScrolling: "touch",
        background: "linear-gradient(180deg, #061120 0%, #050816 44%, #040611 100%)",
      }}
    >
      <style jsx>{`
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; width: 0; height: 0; }

        /* ── kills 300ms tap delay on the area buttons ── */
        .tap-fix { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }

        @keyframes jxlAmberPulse {
          0%, 100% { box-shadow: 0 0 0 1px rgba(245,158,11,0.26), 0 14px 28px rgba(0,0,0,0.64), 0 0 22px rgba(245,158,11,0.10); }
          50% { box-shadow: 0 0 0 1px rgba(251,191,36,0.46), 0 16px 32px rgba(0,0,0,0.72), 0 0 32px rgba(251,191,36,0.18); }
        }
        @keyframes cooldownPulse {
          0%, 100% { box-shadow: 0 0 0 1px rgba(99,102,241,0.2), 0 0 20px rgba(99,102,241,0.08); }
          50% { box-shadow: 0 0 0 1px rgba(99,102,241,0.4), 0 0 28px rgba(99,102,241,0.16); }
        }
        @keyframes whiteGlowPulse {
          0%, 100% { box-shadow: 0 0 30px rgba(255,255,255,0.08), 0 18px 34px rgba(0,0,0,0.55); }
          50% { box-shadow: 0 0 50px rgba(255,255,255,0.20), 0 22px 40px rgba(0,0,0,0.65); }
        }
        @keyframes selectedWhiteGlow {
          0%, 100% { box-shadow: 0 0 40px rgba(255,255,255,0.15), 0 0 80px rgba(255,255,255,0.08), 0 18px 36px rgba(0,0,0,0.65); }
          50% { box-shadow: 0 0 60px rgba(255,255,255,0.30), 0 0 100px rgba(255,255,255,0.12), 0 22px 40px rgba(0,0,0,0.70); }
        }
        @keyframes jxlShimmer {
          0% { transform: translateX(-60%); }
          50% { transform: translateX(40%); }
          100% { transform: translateX(120%); }
        }
        @keyframes jxlGlint {
          0%, 76%, 100% { opacity: 0; transform: scale(0.35); }
          86% { opacity: 1; transform: scale(1.5); }
          94% { opacity: 0.78; transform: scale(1); }
        }

        .jxl-sparkle { position: absolute; border-radius: 9999px; pointer-events: none; z-index: 5; opacity: 0; animation: jxlGlint 5s ease-in-out infinite; }
        .jxl-sparkle--indigo { background: rgb(199,210,254); box-shadow: 0 0 8px 2px rgba(129,140,248,0.9), 0 0 16px 4px rgba(129,140,248,0.5); }
        .jxl-sparkle--gold { background: rgb(253,230,138); box-shadow: 0 0 8px 2px rgba(250,204,21,0.9), 0 0 16px 4px rgba(250,204,21,0.5); }

        .cooldown-glow { animation: cooldownPulse 3s ease-in-out infinite; }
        .standard-shadow { box-shadow: 0 18px 44px rgba(0,0,0,0.72), 0 36px 80px rgba(0,0,0,0.56); }
        .hero-card-shadow { box-shadow: 0 18px 44px rgba(0,0,0,0.72), 0 36px 80px rgba(0,0,0,0.56); }
        .selected-card-glow { animation: selectedWhiteGlow 2.8s ease-in-out infinite; }

        .gold-shimmer { position: relative; overflow: hidden; border-radius: 18px; border: 2px solid rgba(251,191,36,0.6); background: linear-gradient(180deg, rgba(120,84,18,0.45), rgba(50,34,10,0.25)); box-shadow: 0 0 60px rgba(251,191,36,0.25), 0 18px 36px rgba(0,0,0,0.65); cursor: pointer; }
        .gold-shimmer::before { content: ""; position: absolute; inset: -40%; background-image: linear-gradient(120deg, rgba(253,230,138,0) 0%, rgba(253,230,138,0.3) 35%, rgba(250,204,21,0.7) 50%, rgba(253,230,138,0.3) 65%, rgba(253,230,138,0) 100%); mix-blend-mode: screen; pointer-events: none; opacity: 1; transform: translateX(-60%); animation: jxlShimmer 3s linear infinite; z-index: 0; }
        .gold-shimmer > * { position: relative; z-index: 1; }

        .selected-card-shell { position: relative; overflow: hidden; isolation: isolate; will-change: transform, opacity; }
        .selected-card-shell::before { content: ""; position: absolute; inset: -1px; border-radius: 24px; background: var(--selected-wash); opacity: 0; z-index: 0; pointer-events: none; transition: opacity 260ms ease; }
        .selected-card-shell::after { content: ""; position: absolute; inset: 0; border-radius: 24px; opacity: 0; z-index: 0; pointer-events: none; box-shadow: var(--selected-shadow); transition: opacity 260ms ease; }
        .selected-card-shell[data-selected="true"]::before,
        .selected-card-shell[data-selected="true"]::after { opacity: 1; }
        .selected-card-shell[data-selected="true"] { animation: selectedWhiteGlow 2.8s ease-in-out infinite; }
        .selected-card-shell[data-selected="true"] .selected-pill::before { animation: selectedSweep 1.6s ease-in-out infinite; }
        .selected-card-shell[data-selected="true"] .selected-icon-wrap { animation: whiteGlowPulse 2.2s ease-in-out infinite; }
        @keyframes selectedSweep { 0% { transform: translateX(-155%); } 100% { transform: translateX(155%); } }

        .carousel-container { position: relative; overflow: hidden; border-radius: 24px; border: 1px solid rgba(251,191,36,0.2); background: linear-gradient(180deg, rgba(251,191,36,0.06), rgba(251,191,36,0.02)); animation: jxlAmberPulse 2.8s ease-in-out infinite; }
        .carousel-container::before { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 16% 18%, rgba(255,255,255,0.06), transparent 26%), radial-gradient(circle at 80% 12%, rgba(251,191,36,0.12), transparent 24%); pointer-events: none; z-index: 0; }
        .carousel-container::after { content: ""; position: absolute; inset: -40%; background-image: linear-gradient(120deg, rgba(253,230,138,0) 0%, rgba(253,230,138,0.12) 40%, rgba(250,204,21,0.3) 50%, rgba(253,230,138,0.12) 60%, rgba(253,230,138,0) 100%); mix-blend-mode: screen; pointer-events: none; opacity: 0.55; transform: translateX(-60%); animation: jxlShimmer 5s linear infinite; z-index: 0; }
        .carousel-container > * { position: relative; z-index: 1; }
        .carousel-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; cursor: pointer; transition: background 0.15s ease; width: 100%; text-align: left; background: transparent; border: none; color: inherit; font: inherit; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
        .carousel-header:hover { background: rgba(255,255,255,0.02); }
        .carousel-content { border-top: 1px solid rgba(251,191,36,0.1); padding: 0; display: flex; flex-direction: column; }
        .carousel-track { display: flex; height: 100%; transition: transform 0.4s ease; will-change: transform; cursor: grab; user-select: none; }
        .carousel-track:active { cursor: grabbing; }
        .carousel-card { min-width: 100%; padding: 0; height: 100%; }
        .locked-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(5,8,22,0.7); backdrop-filter: blur(8px); border-radius: 16px; z-index: 10; }
        .blur-content { filter: blur(6px); opacity: 0.4; pointer-events: none; user-select: none; }

        @media (prefers-reduced-motion: reduce) {
          .jxl-sparkle, .gold-shimmer::before,
          .selected-card-shell[data-selected="true"],
          .selected-card-shell[data-selected="true"] .selected-icon-wrap,
          .selected-card-shell[data-selected="true"] .selected-pill::before,
          .carousel-container::after { animation: none !important; }
        }
      `}</style>

      {/* ── STARS ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
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
                    duration: 2.34 + (star.id % 5) * 0.54,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: star.delay,
                  }
            }
          />
        ))}
      </div>

      <div
        className="relative z-10 mx-auto w-full max-w-[430px] flex flex-col px-4 pt-4"
        style={{ paddingBottom: "calc(3rem + env(safe-area-inset-bottom))" }}
      >
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex flex-col top-section"
        >
          {/* ── HERO ── */}
          <section className="mb-5 pt-1">
            <div className="hero-card-shadow relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-white/[0.03] px-5 py-7 text-center">
              <div className="relative z-10 mx-auto max-w-[560px]">
                <div className="mb-3 inline-flex items-center rounded-full border border-white/15 bg-white/[0.04] px-3 py-1">
                  <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-white">
                    Real Astrological Predictions
                  </span>
                </div>
                <h1 className="text-[38px] font-semibold leading-[0.95] tracking-[-0.02em] text-white drop-shadow-[0_14px_34px_rgba(0,0,0,0.85)] sm:text-[48px]">
                  Ask Anything
                </h1>
                <p className="mx-auto mt-3 max-w-[34ch] text-[14px] leading-6 text-slate-300/86 sm:text-[15px]">
                  Many things being calculated to give you the perfect, unbiased results.
                </p>
              </div>
            </div>
          </section>

          {/* ── Reading cycle ── */}
          {(userStatus?.firstReadingUsed || (userStatus?.readingsCompleted ?? 0) > 0 || onCooldown) && (
            <div className="mb-1 flex w-full justify-center">
              <div className="w-full max-w-[280px] space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-white/90">Reading cycle</span>
                  <span className="text-[10px] text-white/90">{onCooldown ? 4 : readingsCompleted} / 4</span>
                </div>
                <div className="flex gap-1.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                      {(onCooldown || i < readingsCompleted) && (
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: "100%" }}
                          transition={{ duration: 0.6, delay: i * 0.1, ease: "easeOut" }}
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{ backgroundColor: "#2DD4BF" }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {freeReadingCooldownLine && (
            <div className="mb-8 mt-2 flex items-center justify-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-white/85" />
              <span className="text-[11px] text-white/74">{freeReadingCooldownLine}</span>
            </div>
          )}

          {onCooldown ? (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="relative">
              <div className="pointer-events-none select-none space-y-3 blur-[5px] opacity-30">
                {AREAS.map((area) => {
                  const Icon = area.icon;
                  return (
                    <div key={area.id} className="standard-shadow w-full rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4">
                      <div className="flex items-start gap-3">
                        <motion.div
                          animate={getIconPulseAnimation(false)}
                          className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-slate-300"
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
                  <h2 className="mb-2 text-[16px] font-semibold text-white">Cooldown period active</h2>
                  <p className="mb-1 text-[13px] leading-5 text-slate-400">
                    We care about your wellbeing, we've implemented a cooldown period between reading cycles.
                  </p>
                  {userStatus?.cooldownExpiresAt && (
                    <p className="mt-2 text-[12px] text-indigo-300/80">Resets in {formatTimeRemaining(userStatus.cooldownExpiresAt)}</p>
                  )}
                  <div className="mt-5 border-t border-white/10 pt-8">
                    <p className="mb-3 text-[12px] leading-5 text-slate-400">Once per cycle.</p>
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
              {/* ── AREA BUTTONS — animate prop removed, CSS transitions handle color/border ── */}
              <section className="space-y-3">
                {AREAS.map((area) => {
                  const Icon = area.icon;
                  const isSelected = selectedArea === area.id;
                  const areaColors = getAreaColors(area.id);

                  return (
                    <motion.button
                      key={area.id}
                      ref={isSelected ? clusterTopRef : undefined}
                      transition={{ duration: 0.12 }}
                      type="button"
                      onClick={() => {
                        const isFirstSelection = selectedArea !== area.id;
                        setSelectedArea(area.id);
                        setQuestion("");
                        trackTtq("ViewContent", { content_id: area.id, content_name: area.title });
                        if (isFirstSelection && area.id !== "other") scrollClusterIntoViewThenFocus();
                      }}
                      data-selected={isSelected ? "true" : "false"}
                      className={cn(
                        "tap-fix selected-card-shell standard-shadow w-full rounded-[24px] border px-4 py-4 text-left backdrop-blur-sm transition-all duration-300",
                        isSelected && "selected-card-glow",
                        !isSelected && "hover:border-white/20 hover:bg-white/[0.06]"
                      )}
                      style={{
                        willChange: "transform, opacity",
                        ["--selected-wash" as string]: areaColors.gradient,
                        ["--selected-shadow" as string]: `0 0 0 1px ${areaColors.border}, 0 18px 44px rgba(0,0,0,0.72), 0 36px 80px rgba(0,0,0,0.56), 0 0 40px ${areaColors.glow}`,
                        backgroundColor: isSelected ? areaColors.bg : "rgba(255, 255, 255, 0.04)",
                        borderColor: isSelected ? areaColors.border : "rgba(255, 255, 255, 0.08)",
                      } as React.CSSProperties}
                    >
                      {isSelected && (
                        <div
                          className="pointer-events-none absolute inset-0 rounded-[24px]"
                          style={{ background: getGlowOverlay(area.id), zIndex: 0 }}
                        />
                      )}
                      <div className="relative z-[1] flex items-start gap-3">
                        <motion.div
                          animate={getIconPulseAnimation(isSelected)}
                          className={cn(
                            "selected-icon-wrap mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors duration-300",
                            isSelected ? "" : "border-white/10 bg-black/28 text-slate-300"
                          )}
                          style={{
                            borderColor: isSelected ? areaColors.border : undefined,
                            background: isSelected ? areaColors.gradient : undefined,
                            color: isSelected ? areaColors.text : undefined,
                            boxShadow: isSelected ? getIconTileShadow(area.id) : "0 14px 28px rgba(0,0,0,0.58)",
                          }}
                        >
                          <Icon className="h-4 w-4" />
                        </motion.div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <h2 className={cn("text-[15px] font-semibold transition-colors duration-300", isSelected ? "text-white" : "text-white")}>
                              {area.title}
                            </h2>
                            <AnimatePresence>
                              {isSelected && (
                                <motion.span
                                  initial={{ opacity: 0, scale: 0.92, y: 4 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.92, y: 4 }}
                                  transition={{ duration: 0.18, ease: "easeOut" }}
                                  className="selected-pill relative overflow-hidden rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-white"
                                  style={{ borderColor: "rgba(255,255,255,0.3)", backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderStyle: "solid", boxShadow: "0 0 20px rgba(255,255,255,0.08)" }}
                                >
                                  <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(115deg, transparent 0%, transparent 35%, rgba(255,255,255,0.34) 50%, transparent 65%, transparent 100%)", transform: "translateX(-155%)" }} />
                                  <span className="relative z-[1]">Selected</span>
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </div>
                          <motion.p
                            className="mt-1 text-sm leading-5"
                            animate={{ color: isSelected ? "rgba(241, 245, 249, 0.92)" : "rgba(148, 163, 184, 1)" }}
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

              {/* ── TEXTAREA ── */}
              <AnimatePresence>
                {selectedArea && selectedArea !== "other" && (
                  <motion.section
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="mt-6 space-y-2"
                  >
                    <div
                      className="rounded-[26px] border border-white/18 bg-white/[0.035] p-[1px] standard-shadow"
                      style={{ transition: "box-shadow 0.3s ease, border-color 0.3s ease" }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.5)"; e.currentTarget.style.boxShadow = "0 0 50px rgba(255,255,255,0.15), 0 18px 44px rgba(0,0,0,0.72), 0 36px 80px rgba(0,0,0,0.56)"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.boxShadow = "0 18px 44px rgba(0,0,0,0.72), 0 36px 80px rgba(0,0,0,0.56)"; }}
                    >
                      <div className="rounded-[25px] bg-white/[0.03] px-4 py-3">
                        <Textarea
                          id="question"
                          ref={textareaRef}
                          rows={5}
                          value={question}
                          onChange={(e) => setQuestion(e.target.value)}
                          placeholder={AREAS.find(a => a.id === selectedArea)?.placeholder ?? "Ask something specific so your reading can go deeper."}
                          className="min-h-[132px] w-full rounded-[20px] border-0 bg-transparent px-3 py-3 text-[16px] leading-6 text-white placeholder:text-slate-400/80 focus:outline-none focus:ring-0"
                          style={{ backgroundColor: "transparent" }}
                        />
                      </div>
                    </div>
                    <p className="text-xs leading-5 text-slate-300/80">Be specific. The clearer your question, the sharper the reading.</p>
                  </motion.section>
                )}
              </AnimatePresence>
            </>
          )}

          {/* ── SUBMIT ── */}
          <div className="mt-6 space-y-3 pb-2" ref={clusterBottomRef}>
            {submitError && <p className="mb-2 text-center text-xs text-red-300">{submitError}</p>}
            {!onCooldown && (
              <Button
                type="button"
                onClick={handleStartReading}
                disabled={!canSubmit || isCreatingReading}
                className="standard-shadow h-14 w-full rounded-2xl border border-indigo-400/30 bg-gradient-to-b from-indigo-500 to-indigo-700 text-white text-[15px] font-medium transition-all duration-300 hover:scale-[1.01] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-slate-900/60 disabled:text-slate-500"
              >
                {buttonCopy}
              </Button>
            )}
          </div>

          <div className="mt-8 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-600">Unlimited Access</span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>

          {/* ── CAROUSEL ── */}
          <div className="mt-4">
            <div className="carousel-container">
              <button type="button" onClick={() => setIsCarouselOpen(!isCarouselOpen)} className="carousel-header" aria-expanded={isCarouselOpen}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/10 text-amber-200">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-[15px] font-semibold text-amber-200">Unlimited Access Dashboard</h2>
                    <p className="text-[11px] text-slate-400">The Astrological Data, in your hands</p>
                  </div>
                </div>
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-300/20 bg-black/20 text-amber-300/70 transition-transform duration-200", isCarouselOpen && "rotate-180")}>
                  <ChevronRight className="h-4 w-4" />
                </div>
              </button>

              <AnimatePresence>
                {isCarouselOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: "easeOut" }} className="overflow-hidden">
                    <div className="carousel-content">
                      <div className="relative" style={{ padding: 0, overflow: "hidden", flex: 1 }}
                        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
                        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
                      >
                        <div className="carousel-track" style={{ display: "flex", height: "100%", transform: `translateX(-${currentCardIndex * 100}%)`, transition: isDragging || isMouseDragging ? "none" : "transform 0.4s ease" }}>
                          {Array.from({ length: TOTAL_CARDS }).map((_, index) => {
                            const shouldBlur = !userStatus?.isSubscribed && index !== 0;
                            return (
                              <div key={index} className="carousel-card" style={{ minWidth: "100%", padding: 0, height: "100%" }}>
                                <div className="relative w-full h-full min-h-[220px] bg-black/20 p-6 flex flex-col">
                                  <h3 className="text-sm font-semibold text-amber-200 mb-3">{CARD_TITLES[index]}</h3>
                                  <div className={shouldBlur ? "blur-content flex-1" : "flex-1"}>{renderCardContent(index)}</div>
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
                                  const res = await fetch("/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnUrl: `${window.location.origin}/reading/intake`, mode: "subscription", paywallIndex: 1 }) });
                                  const data = await res.json();
                                  if (data.url) window.location.href = data.url;
                                } finally { setIsSubscribeLoading(false); }
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

          {/* ── COMING SOON ── */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }} className="mt-4">
            <div className="mb-2 flex items-center justify-center">
              <span className="flex items-center gap-1.5 rounded-full border border-indigo-400/25 bg-indigo-400/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-indigo-300/80">
                <Lock className="h-2.5 w-2.5" />
                In Development
              </span>
            </div>
            <div className="relative overflow-hidden rounded-[28px] border border-indigo-400/20 bg-black/30 pointer-events-none select-none" style={{ overflow: "hidden" }} aria-hidden="true">
              {comingSoonSparkles.map((sparkle, i) => (
                <span key={i} className={cn("jxl-sparkle", sparkle.color === "indigo" ? "jxl-sparkle--indigo" : "jxl-sparkle--gold")} style={{ left: sparkle.left, top: sparkle.top, width: `${sparkle.size}px`, height: `${sparkle.size}px`, animationDelay: `${sparkle.delay}s` }} />
              ))}
              <div className="blur-[6px] px-5 py-5 opacity-60">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-300" />
                  <span className="text-[14px] font-semibold text-indigo-200">Ask Jxl</span>
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-3/4 rounded-full bg-slate-400/30" />
                  <div className="h-3 w-1/2 rounded-full bg-slate-400/20" />
                  <div className="mt-4 h-16 rounded-2xl border border-white/10 bg-white/5" />
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/10 via-transparent to-indigo-950/20 rounded-[28px]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-indigo-400/30 bg-indigo-400/10">
                    <Lock className="h-4 w-4 text-indigo-300/70" />
                  </div>
                  <span className="text-[11px] tracking-wide text-indigo-300/60">Something Great is in Development for you</span>
                </div>
              </div>
            </div>
          </motion.div>

        </motion.div>
      </div>
    </div>
  );
}


