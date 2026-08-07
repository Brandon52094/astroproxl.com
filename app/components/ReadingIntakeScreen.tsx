"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Heart,
  Briefcase,
  Wallet,
  Sparkles,
  ChevronLeft,
} from "lucide-react";
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
import { SUB_TIERS } from "@/lib/paywallConfig";
import AskJxlButton from "./AskJxlButton";
import JxlPanel from "./JxlPanel";
import CreditsPanel from "./CreditsPanel";

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
    description: "What to expect in the next 30–45 days.",
    icon: Sparkles,
    placeholder: "Ask about timing, what's approaching, or what you should be ready for in the weeks ahead.",
    cta: "Begin My Reading",
  },
];

interface UserStatus {
  credits: number;
  isSubscribed: boolean;
  readingsCompleted: number;
  onCooldown: boolean;
  cooldownExpiresAt: string | null;
  canBypass: boolean;
  firstPaidReadingUsed: boolean;
  pwaFreeReadingUsed?: boolean;
}

interface ReadingIntakeScreenProps {
  userStatus: UserStatus | null;
  onSwipeLeft?: () => void;
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

const PLANET_ORDER = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];

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
  const [isSubscribeLoading, setIsSubscribeLoading] = useState(false);
  const [showJxl, setShowJxl] = useState(false);
  const [showCredits, setShowCredits] = useState(false);

  const theme = THEMES.cosmic;
  const shouldReduceMotion = useReducedMotion();

  const clusterTopRef = useRef<HTMLButtonElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const clusterBottomRef = useRef<HTMLDivElement | null>(null);
  const scrollFocusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── Install modal state ──────────────────────────────────────────────────
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false); // session-only
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null); // Android one-tap
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  // ── Platform/install detection ─────────────────────────────────────────
  useEffect(() => {
    // Detect platform + install state
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent) &&
      !(window.navigator as unknown as { standalone?: boolean }).standalone;
    setIsIOS(ios);

    // Android/Chrome: capture the install event for one-tap
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Should the teaser show at all?
  const showInstallTeaser =
    !isStandalone &&
    !installDismissed &&
    userStatus?.pwaFreeReadingUsed !== true;

  // Android one-tap trigger
  const triggerAndroidInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowInstallModal(false);
  };

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
        firstPaidReadingUsed: data.firstPaidReadingUsed === true,
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

  const buttonCopy = useMemo(() => {
    if (chartStatus === "recalculating") return "Loading your chart…";
    if (isCreatingReading) return "Preparing reading...";
    if (!selectedAreaConfig) return "Choose a reading type";
    const hasCredits = Number(userStatus?.credits ?? 0) > 0;
    const isSubscribed = userStatus?.isSubscribed === true;
    if (!hasCredits && !isSubscribed) {
      const price = userStatus?.firstPaidReadingUsed ? "$4.00" : "$2.00";
      return `${selectedAreaConfig.cta} — ${price}`;
    }
    return selectedAreaConfig.cta;
  }, [chartStatus, isCreatingReading, selectedAreaConfig, userStatus]);

  const canSubmit = useMemo(() => {
    if (!selectedArea) return false;
    if (chartStatus !== "ready") return false;
    if (selectedArea === "other") return true;
    return question.trim().length > 0;
  }, [question, selectedArea, chartStatus]);

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
        question:
          selectedArea === "other"
            ? "What is coming for me in the next 30–45 days?"
            : question.trim(),
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
            firstPaidReadingUsed: d.firstPaidReadingUsed === true,
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

      const readingValue = status.firstPaidReadingUsed ? 4.0 : 2.0;
      trackTtq("InitiateCheckout", { content_id: selectedArea, value: readingValue, currency: "USD" });

      // ── Get the current PWA state ──────────────────────────────────────────────
      const isStandalone =
        window.matchMedia?.("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;

      // ── Store PWA state before redirecting to Stripe ──────────────────────────
      localStorage.setItem('dfp_returning_from_stripe', 'true');
      localStorage.setItem('dfp_is_pwa', JSON.stringify(isStandalone));

      const checkoutRes = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnUrl: window.location.origin + "/reading/preparing",
          mode: "one_time",
          platform: isStandalone ? "pwa" : "web",
        }),
      });
      const checkoutData = await checkoutRes.json();
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

  const getGlowOverlay = useCallback((areaId: string) => {
    const c = getAreaColors(areaId);
    return `radial-gradient(circle at 50% 50%, ${c.glow}, rgba(255,255,255,0.018) 38%, transparent 72%)`;
  }, [getAreaColors]);

  const getIconTileShadow = useCallback((areaId: string) => {
    const c = getAreaColors(areaId);
    return `0 14px 28px rgba(0,0,0,0.58), 0 0 30px ${c.glow}`;
  }, [getAreaColors]);

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
        .tap-fix { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }

        @keyframes jxlAmberPulse {
          0%, 100% { box-shadow: 0 0 0 1px rgba(245,158,11,0.26), 0 14px 28px rgba(0,0,0,0.64), 0 0 22px rgba(245,158,11,0.10); }
          50% { box-shadow: 0 0 0 1px rgba(251,191,36,0.46), 0 16px 32px rgba(0,0,0,0.72), 0 0 32px rgba(251,191,36,0.18); }
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
        .nebula {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background:
            radial-gradient(ellipse 60% 40% at 20% 25%, rgba(91,33,182,0.18), transparent 60%),
            radial-gradient(ellipse 50% 35% at 80% 60%, rgba(37,99,235,0.14), transparent 60%),
            radial-gradient(ellipse 45% 40% at 55% 85%, rgba(20,120,110,0.10), transparent 60%);
          animation: nebula-drift 24s ease-in-out infinite alternate;
        }
        @keyframes nebula-drift {
          0% { transform: translate(0, 0) scale(1); opacity: 0.85; }
          100% { transform: translate(-3%, 2%) scale(1.08); opacity: 1; }
        }

        @keyframes heroShine {
          0% { transform: translateX(-140%) skewX(-18deg); }
          60% { transform: translateX(240%) skewX(-18deg); }
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
          animation: heroShine 4.6s ease-in-out infinite;
          pointer-events: none;
          z-index: 1;
        }
        .hero-shine > * { position: relative; z-index: 2; }

        .standard-shadow { box-shadow: 0 18px 44px rgba(0,0,0,0.72), 0 36px 80px rgba(0,0,0,0.56); }
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

        /* ── Membership placeholder (replaces carousel) ── */
        .membership-placeholder {
          margin-top: 16px;
          padding: 24px 20px;
          border-radius: 24px;
          border: 1px solid rgba(251,191,36,0.15);
          background: rgba(251,191,36,0.03);
          text-align: center;
          min-height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .membership-placeholder p {
          font-size: 13px;
          color: #94a3b8;
          letter-spacing: 0.05em;
        }

        @keyframes swipeCuePulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; text-shadow: 0 0 14px rgba(255,255,255,0.55); }
        }
        @keyframes swipeCueNudge {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(-4px); }
        }
        .swipe-cue { animation: swipeCuePulse 2.1s ease-in-out infinite; background: transparent; border: none; cursor: pointer; }
        .swipe-cue svg { animation: swipeCueNudge 2.1s ease-in-out infinite; }

        /* ── Install teaser — pill button ── */
        .install-teaser {
          display: inline-block;
          margin: 0 auto 8px;
          padding: 6px 18px;
          border-radius: 9999px;
          border: 1.5px solid rgba(96,165,250,0.5);
          background: rgba(96,165,250,0.10);
          backdrop-filter: blur(8px);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #93c5fd;
          text-shadow: 0 0 12px rgba(96,165,250,0.5), 0 0 4px rgba(96,165,250,0.7);
          box-shadow: 0 0 20px rgba(96,165,250,0.15), inset 0 0 20px rgba(96,165,250,0.05);
          cursor: pointer;
          animation: install-pulse 2.4s ease-in-out infinite;
          transition: background 0.2s ease, border-color 0.2s ease;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }
        .install-teaser:hover {
          background: rgba(96,165,250,0.18);
          border-color: rgba(96,165,250,0.7);
        }
        @keyframes install-pulse {
          0%, 100% { opacity: 0.8; box-shadow: 0 0 16px rgba(96,165,250,0.10), inset 0 0 16px rgba(96,165,250,0.02); }
          50% { opacity: 1; box-shadow: 0 0 28px rgba(96,165,250,0.25), inset 0 0 28px rgba(96,165,250,0.06); }
        }

        .install-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(3,7,18,0.72);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .install-modal {
          width: 100%;
          max-width: 340px;
          border-radius: 24px;
          border: 1px solid rgba(96,165,250,0.3);
          background: #0b1020;
          padding: 24px;
          box-shadow: 0 0 40px rgba(96,165,250,0.15);
        }
        .install-modal-title { font-size: 18px; font-weight: 700; color: #93c5fd; text-align: center; }
        .install-modal-sub { margin-top: 6px; font-size: 13px; color: #94a3b8; text-align: center; line-height: 1.4; }
        .install-steps { margin: 18px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 10px; }
        .install-steps li { font-size: 13px; color: #cbd5e1; line-height: 1.4; }
        .ios-share { display: inline-block; padding: 0 4px; color: #60a5fa; }
        .install-oneclick {
          width: 100%; margin-top: 18px; height: 48px;
          border-radius: 14px; border: none;
          background: #60a5fa; color: #050816; font-weight: 700; font-size: 14px;
          cursor: pointer;
        }
        .install-dismiss {
          width: 100%; margin-top: 12px;
          background: none; border: none;
          font-size: 12px; color: #64748b; cursor: pointer;
        }

        .install-teaser-wrapper {
          display: flex;
          justify-content: center;
          margin: 8px 0 4px;
        }

        @media (prefers-reduced-motion: reduce) {
          .swipe-cue, .swipe-cue svg,
          .selected-card-shell[data-selected="true"],
          .selected-card-shell[data-selected="true"] .selected-icon-wrap,
          .selected-card-shell[data-selected="true"] .selected-pill::before,
          .hero-shine::after,
          .install-teaser { animation: none !important; opacity: 0.8; box-shadow: none; }
        }
      `}</style>

      <div className="nebula" aria-hidden="true" />
      <StarfieldBackground />

      <div
        className="relative z-10 mx-auto w-full max-w-[430px] flex flex-col px-4 pt-14"
        style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex flex-col top-section"
        >
          {/* ── HERO ── */}
          <section className="mb-5 pt-1">
            <div
              className="hero-shine standard-shadow relative overflow-hidden rounded-[28px] border bg-white/[0.03] px-5 py-7 text-center"
              style={{
                borderColor: "rgba(255, 255, 255, 0.60)",
                boxShadow: "0 0 32px rgba(99, 102, 241, 0.20), inset 0 0 20px rgba(99, 102, 241, 0.12), 0 18px 44px rgba(0,0,0,0.72), 0 36px 80px rgba(0,0,0,0.56)",
              }}
            >
              <div className="relative z-10 mx-auto max-w-[560px]">
                <div className="mb-3 inline-flex items-center rounded-full border border-indigo-400/30 bg-indigo-400/10 px-3 py-1">
                  <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-indigo-200">
                    AstroProXL
                  </span>
                </div>
                <h1 className="text-[38px] font-semibold leading-[0.95] tracking-[-0.02em] text-white drop-shadow-[0_14px_34px_rgba(0,0,0,0.85)] sm:text-[48px]">
                  You Can Ask Anything
                </h1>
                <p className="mx-auto mt-3 max-w-[34ch] text-[14px] leading-6 text-slate-300/86 sm:text-[15px]">
                  Your Personal Astrological Predictions.
                </p>
              </div>
            </div>
          </section>

          {/* ── Install teaser ── */}
          {showInstallTeaser && (
            <div className="install-teaser-wrapper">
              <button
                type="button"
                className="install-teaser tap-fix"
                data-no-swipe
                onClick={(e) => { e.stopPropagation(); setShowInstallModal(true); }}
              >
                🎁 Tap for a FREE reading!
              </button>
            </div>
          )}

          {/* ── Swipe cue ── */}
          <button
            type="button"
            onClick={() => onSwipeLeft?.()}
            className="swipe-cue tap-fix mx-auto mt-1 mb-5 flex items-center justify-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-white/85"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Swipe Left to Explore
          </button>

          {/* ── AREA BUTTONS ── */}
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
                    <div className="pointer-events-none absolute inset-0 rounded-[24px]" style={{ background: getGlowOverlay(area.id), zIndex: 0 }} />
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
                        <h2 className="text-[15px] font-semibold text-white">{area.title}</h2>
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
              </motion.section>
            )}
          </AnimatePresence>

          {/* ── SUBMIT ── */}
          <div className="mt-0.5 space-y-3 pb-2" ref={clusterBottomRef}>
            {submitError && <p className="mb-2 text-center text-xs text-red-300">{submitError}</p>}
            {selectedArea && (
              <Button
                type="button"
                onClick={handleStartReading}
                disabled={!canSubmit || isCreatingReading}
                className="standard-shadow h-14 w-full rounded-2xl text-[15px] font-medium transition-all duration-300 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  background: "transparent",
                  border: "2px solid rgba(94,234,212,0.65)",
                  color: "rgba(94,234,212,0.95)",
                  boxShadow: canSubmit && !isCreatingReading
                    ? "0 0 18px rgba(45,212,191,0.22), 0 18px 44px rgba(0,0,0,0.72)"
                    : "0 18px 44px rgba(0,0,0,0.72)",
                }}
              >
                {buttonCopy}
              </Button>
            )}
          </div>

          {/* ── Ask JXL ── */}
          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-600">Ask JXL</span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>
          <div className="mt-4">
            <AskJxlButton onClick={() => setShowJxl(true)} />
          </div>

          {/* ── Get Credits (smaller, secondary) ── */}
          <div className="mt-3.5 flex justify-center">
            <button
              type="button"
              onClick={() => setShowCredits(true)}
              className="tap-fix inline-flex h-11 items-center gap-1.5 rounded-full px-5 text-[13px] font-semibold tracking-[0.02em] transition"
              style={{
                border: "1px solid rgba(251,191,36,0.4)",
                background: "rgba(251,191,36,0.08)",
                color: "#fcd34d",
              }}
            >
              <Sparkles className="h-[15px] w-[15px]" />
              Get Credits
            </button>
          </div>

        </motion.div>
      </div>

      {/* ── Install modal (portaled to body) ── */}
      {showInstallModal && typeof document !== "undefined" &&
        createPortal(
          <div
            className="install-modal-backdrop"
            onClick={() => setShowInstallModal(false)}
          >
            <div className="install-modal" onClick={(e) => e.stopPropagation()}>
              <p className="install-modal-title">Get a FREE reading</p>
              <p className="install-modal-sub">
                Add this app to your home screen and your first reading is on us.
              </p>

              {isIOS ? (
                <ol className="install-steps">
                  <li>Make sure you're in <strong>Safari</strong> (this only works in Safari on iPhone)</li>
                  <li>Tap the <strong>Share</strong> icon <span className="ios-share">⎋</span> — the square with an arrow, at the bottom of the screen</li>
                  <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
                  <li>Tap <strong>Add</strong> in the top corner</li>
                  <li>Open AstroProXL from your home screen — your free reading will be waiting</li>
                </ol>
              ) : deferredPrompt ? (
                <>
                  <button type="button" className="install-oneclick" onClick={triggerAndroidInstall}>
                    Add to Home Screen
                  </button>
                  <p className="install-hint">Tap the button, then confirm <strong>Install</strong></p>
                </>
              ) : (
                <ol className="install-steps">
                  <li>Tap the <strong>⋮</strong> menu (top-right in Chrome)</li>
                  <li>Tap <strong>Add to Home screen</strong> (or <strong>Install app</strong>)</li>
                  <li>Tap <strong>Add</strong> / <strong>Install</strong> to confirm</li>
                  <li>Open AstroProXL from your home screen — your free reading will be waiting</li>
                </ol>
              )}

              <button
                type="button"
                className="install-dismiss"
                onClick={() => { setShowInstallModal(false); setInstallDismissed(true); }}
              >
                Maybe later
              </button>
            </div>
          </div>,
          document.body
        )}

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

      {/* ── Credits overlay (portaled to body) ── */}
      {showCredits && typeof document !== "undefined" &&
        createPortal(
          <div style={{ position: "fixed", inset: 0, zIndex: 9999 }}>
            <CreditsPanel onClose={() => setShowCredits(false)} />
          </div>,
          document.body
        )}
    </div>
  );
}