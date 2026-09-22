"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart,
  Briefcase,
  Wallet,
  Eye,
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

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
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
    icon: Eye,
    placeholder: "Ask about timing, what's approaching, or what you should be ready for in the weeks ahead.",
    defaultQuestion: "What is coming for me in the next 30–45 days?",
  },
];

// Hero glow palettes respond to the selected reading topic.
// Gold is intentionally excluded so it remains reserved for subscriber-only UI.
const HERO_PALETTES: Record<string, [string, string, string, string]> = {
  default: [
    "52, 211, 153",  // emerald
    "34, 211, 238",  // cyan
    "56, 189, 248",  // sky
    "168, 85, 247",  // violet
  ],
  love: [
    "244, 114, 182", // blush pink
    "251, 113, 133", // rose
    "225, 29, 72",   // raspberry
    "192, 132, 252", // soft violet
  ],
  money: [
    "52, 211, 153",  // emerald
    "16, 185, 129",  // jade
    "110, 231, 183", // mint
    "45, 212, 191",  // teal
  ],
  career: [
    "125, 211, 252", // ice blue
    "56, 189, 248",  // electric blue
    "37, 99, 235",   // cobalt
    "99, 102, 241",  // indigo
  ],
  other: [
    "216, 180, 254", // lavender
    "192, 132, 252", // violet
    "139, 92, 246",  // deep purple
    "96, 165, 250",  // cool blue
  ],
};


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
}

/* ── Chart shapes we read for the fade line ────────────────────────── */
interface Placement {
  name: string;
  sign: string;
  degree?: string;
  house?: number;
  isRetrograde?: boolean;
}
interface Profection {
  profectionYear: number;
  age: number;
  activatedSign: string;
  activatedHouse?: number;
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
  useEffect(() => {
    if (propUserStatus) setUserStatus(propUserStatus);
  }, [propUserStatus]);
  const [showJxl, setShowJxl] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const theme = THEMES.cosmic;

  // Chart-derived data for the hero fade line.
  const [natal, setNatal] = useState<Placement[]>([]);
  const [transits, setTransits] = useState<Placement[]>([]);
  const [profection, setProfection] = useState<Profection | null>(null);

  // Fade line state.
  const [factIndex, setFactIndex] = useState(0);
  const [factPaused, setFactPaused] = useState(false);

  // If a reading is selected but the user does not continue into context or Begin Reading,
  // gently return the interface to its neutral state.
  const selectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearSelectionTimeout = useCallback(() => {
    if (selectionTimeoutRef.current) {
      clearTimeout(selectionTimeoutRef.current);
      selectionTimeoutRef.current = null;
    }
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

  // Once the chart is ready, read placements + profection + transits for the fade line.
  useEffect(() => {
    if (chartStatus !== "ready") return;
    const chart = loadChart();
    const data = chart?.chartData as unknown as {
      profection?: Profection;
      tropical?: { planets?: Placement[] };
      transits?: Placement[];
    } | undefined;
    if (!data) return;
    if (data.profection) setProfection(data.profection);
    setNatal(data.tropical?.planets ?? []);
    setTransits(data.transits ?? []);
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
  const heroPalette = HERO_PALETTES[selectedArea ?? "default"] ?? HERO_PALETTES.default;

  /* ── Hero anchor line — current sky only (daily-news behavior) ───── */
  const facts = useMemo(() => {
    const out: string[] = [];
    const find = (arr: Placement[], n: string) => arr.find((p) => p.name === n);

    // Keep this line focused on what is happening now. Natal Big Three and
    // annual profection context belong elsewhere in the hero/product.
    const tMoon = find(transits, "Moon");
    if (tMoon?.sign) out.push(`Moon in ${tMoon.sign}${tMoon.degree ? ` · ${tMoon.degree}` : ""}`);

    const tSun = find(transits, "Sun");
    if (tSun?.sign) out.push(`Sun in ${tSun.sign}${tSun.degree ? ` · ${tSun.degree}` : ""}`);

    const merc = find(transits, "Mercury");
    if (merc) out.push(merc.isRetrograde ? "Mercury Retrograde" : "Mercury Direct");

    return out.length ? out : ["Current sky updating…"];
  }, [transits]);

  // Keep the index in range whenever the fact set changes.
  useEffect(() => { setFactIndex(0); }, [facts.length]);

  // Auto-advance slowly enough to be read at a glance; press-and-hold pauses it.
  useEffect(() => {
    if (factPaused || facts.length <= 1) return;
    const id = setInterval(() => {
      setFactIndex((i) => (i + 1) % facts.length);
    }, 6000);
    return () => clearInterval(id);
  }, [factPaused, facts.length]);

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
    }, 10000);
  }, [clearSelectionTimeout]);

  useEffect(() => {
    return () => clearSelectionTimeout();
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
      className="no-scrollbar relative min-h-[100dvh] overflow-x-hidden text-slate-100"
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
          animation: nebula-drift 24s ease-in-out infinite alternate;
        }
        @keyframes nebula-drift {
          0% { transform: translate(0, 0) scale(1); opacity: 0.85; }
          100% { transform: translate(-3%, 2%) scale(1.08); opacity: 1; }
        }

        @keyframes heroShine {
          0% { transform: translateX(-140%) skewX(-18deg); }
          32% { transform: translateX(240%) skewX(-18deg); }
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
          animation: heroShine 8.6s ease-in-out infinite;
          pointer-events: none;
          z-index: 1;
        }
        .hero-shine > * { position: relative; z-index: 2; }

        /* ── Aurora OUTLINE glow — palette responds to selected reading ── */
        .hero-outline {
          border: 1px solid rgba(var(--hero-c1), 0.9);
          box-shadow:
            0 0 26px 2px rgba(var(--hero-c1), 0.70),
            0 0 70px 10px rgba(var(--hero-c1), 0.42),
            0 0 130px 26px rgba(var(--hero-c1), 0.26),
            0 18px 44px rgba(0,0,0,0.72),
            0 36px 80px rgba(0,0,0,0.56);
          animation: heroBorderGlow 9s ease-in-out infinite;
        }
        @keyframes heroBorderGlow {
          0%, 100% {
            border-color: rgba(var(--hero-c1), 0.9);
            box-shadow: 0 0 26px 2px rgba(var(--hero-c1), 0.70), 0 0 70px 10px rgba(var(--hero-c1), 0.42), 0 0 130px 26px rgba(var(--hero-c1), 0.26), 0 18px 44px rgba(0,0,0,0.72), 0 36px 80px rgba(0,0,0,0.56);
          }
          25% {
            border-color: rgba(var(--hero-c2), 0.9);
            box-shadow: 0 0 26px 2px rgba(var(--hero-c2), 0.70), 0 0 70px 10px rgba(var(--hero-c2), 0.42), 0 0 130px 26px rgba(var(--hero-c2), 0.26), 0 18px 44px rgba(0,0,0,0.72), 0 36px 80px rgba(0,0,0,0.56);
          }
          50% {
            border-color: rgba(var(--hero-c3), 0.9);
            box-shadow: 0 0 26px 2px rgba(var(--hero-c3), 0.70), 0 0 70px 10px rgba(var(--hero-c3), 0.42), 0 0 130px 26px rgba(var(--hero-c3), 0.26), 0 18px 44px rgba(0,0,0,0.72), 0 36px 80px rgba(0,0,0,0.56);
          }
          75% {
            border-color: rgba(var(--hero-c4), 0.9);
            box-shadow: 0 0 26px 2px rgba(var(--hero-c4), 0.70), 0 0 70px 10px rgba(var(--hero-c4), 0.42), 0 0 130px 26px rgba(var(--hero-c4), 0.26), 0 18px 44px rgba(0,0,0,0.72), 0 36px 80px rgba(0,0,0,0.56);
          }
        }

        .standard-shadow {
          box-shadow:
            0 18px 38px rgba(0,0,0,0.78),
            0 34px 72px rgba(0,0,0,0.58),
            0 48px 96px rgba(0,0,0,0.34);
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

        @keyframes askPremiumSweep {
          0% { transform: translateX(-175%) skewX(-18deg); opacity: 0; }
          12% { opacity: 0; }
          20% { opacity: 0.56; }
          34% { transform: translateX(330%) skewX(-18deg); opacity: 0; }
          100% { transform: translateX(330%) skewX(-18deg); opacity: 0; }
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

        .ask-premium::before {
          content: "";
          position: absolute;
          inset: -34% auto -34% -34%;
          width: 24%;
          background: linear-gradient(105deg, transparent, rgba(255,255,255,0.15), rgba(255,255,255,0.055), transparent);
          transform: translateX(-175%) skewX(-18deg);
          animation: askPremiumSweep 9.2s ease-in-out infinite;
          pointer-events: none;
          z-index: 1;
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
          .hero-outline,
          .ask-premium,
          .ask-premium::before,
          .ask-mic-halo { animation: none !important; }
        }
      `}</style>

      <div className="nebula" aria-hidden="true" />
      <StarfieldBackground />

      <div
        className="relative z-10 mx-auto w-full max-w-[430px] flex flex-col px-4"
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
            className="tap-fix mx-auto mb-2 mt-1 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-300/85"
            style={{
              textShadow: "0 2px 10px rgba(0,0,0,0.85), 0 0 12px rgba(148,163,184,0.14)",
            }}
          >
            Swipe Left To Explore
          </button>

          {/* ── HERO (animated color-cycling outline glow) ── */}
          <section className="mb-[18px] pt-0">
            <div
              className="hero-shine hero-outline relative h-[236px] overflow-hidden rounded-[28px] bg-white/[0.03] px-5 text-center"
              style={{
                "--hero-c1": heroPalette[0],
                "--hero-c2": heroPalette[1],
                "--hero-c3": heroPalette[2],
                "--hero-c4": heroPalette[3],
              } as React.CSSProperties}
            >
              <div className="relative z-10 mx-auto h-full max-w-[560px]">
                {/* Daily anchor — current sky, no extra label */}
                <div
                  data-no-swipe
                  onPointerDown={() => setFactPaused(true)}
                  onPointerUp={() => setFactPaused(false)}
                  onPointerLeave={() => setFactPaused(false)}
                  onPointerCancel={() => setFactPaused(false)}
                  className="absolute inset-x-0 top-[13px] mx-auto h-5 max-w-[34ch] select-none"
                >
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={factIndex}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.5, ease: "easeInOut" }}
                      className="absolute inset-0 text-[12.5px] leading-5 text-slate-300/78 sm:text-[13px]"
                    >
                      {facts[factIndex] ?? facts[0]}
                    </motion.p>
                  </AnimatePresence>
                </div>

                {/* Hero statement — this is what the product does */}
                <p
                  className="absolute inset-x-0 top-[48px] text-[10px] font-medium uppercase tracking-[0.24em] text-slate-300/58"
                  style={{ textShadow: "0 2px 10px rgba(0,0,0,0.72)" }}
                >
                  Your
                </p>

                <h1
                  className="absolute inset-x-0 top-[63px] whitespace-nowrap text-[35px] font-semibold leading-none tracking-[-0.04em] text-white drop-shadow-[0_14px_34px_rgba(0,0,0,0.88)] sm:text-[46px]"
                  style={{ textShadow: "0 0 30px rgba(148,163,184,0.20)" }}
                >
                  Astrological Predictions
                </h1>

                {/* Product identity — supportive, not competing with the H1 */}
                <p
                  className="absolute inset-x-0 top-[108px] text-[9.5px] font-medium uppercase tracking-[0.24em] text-slate-300/52 sm:text-[10px]"
                  style={{ textShadow: "0 2px 10px rgba(0,0,0,0.72)" }}
                >
                  <span className="text-indigo-200/72">AstroProXL</span>
                  <span className="mx-2 text-slate-500/70">|</span>
                  <span>The Astrology Engine</span>
                </p>

                {/* Big Three placeholders — large, permanent personal layer */}
                <div
                  className="absolute inset-x-0 top-[139px] flex items-center justify-center gap-7 sm:gap-8"
                  aria-hidden="true"
                >
                  {[0, 1, 2].map((index) => (
                    <span
                      key={index}
                      className="block h-[58px] w-[58px] rounded-full border border-slate-200/30 bg-white/[0.018] shadow-[inset_0_0_16px_rgba(255,255,255,0.025),0_0_18px_rgba(148,163,184,0.05)] sm:h-[62px] sm:w-[62px]"
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── Dynamic reading header ──
              Before selection: "Select A Reading".
              After selection: reuse this exact space for the reading context. */}
          <div className="relative mb-[14px] h-[26px] text-center">
            {/* Keep both states in the same fixed-height layer so the swap never nudges layout.
                mode=sync lets the old copy fade out while the new copy fades in. */}
            <AnimatePresence mode="sync" initial={false}>
              {selectedAreaConfig ? (
                <motion.p
                  key={`reading-context-${selectedAreaConfig.id}`}
                  initial={{ opacity: 0, y: 3, filter: "blur(2px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -2, filter: "blur(1.5px)" }}
                  transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-x-0 top-0 flex h-[26px] items-center justify-center whitespace-nowrap text-[12px] leading-[20px] text-slate-300/80 sm:text-[12.5px]"
                  style={{
                    textShadow: "0 3px 14px rgba(0,0,0,0.92)",
                  }}
                >
                  <span
                    className="text-[12.5px] font-semibold sm:text-[13px]"
                    style={{ color: getAreaColors(selectedAreaConfig.id).text }}
                  >
                    {selectedAreaConfig.title}
                  </span>
                  <span className="mx-2 text-slate-600">·</span>
                  <span>{selectedAreaConfig.description}</span>
                </motion.p>
              ) : (
                <motion.p
                  key="select-reading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, y: -2 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-x-0 top-0 flex h-[26px] items-center justify-center text-[14px] font-semibold uppercase leading-[20px] tracking-[0.245em] text-slate-100 sm:text-[14.5px]"
                  style={{
                    textShadow:
                      "0 3px 14px rgba(0,0,0,0.98), 0 0 18px rgba(148,163,184,0.24)",
                  }}
                >
                  Select A Reading
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* ── READING GRID (2×2) ── */}
          <section className="grid grid-cols-2 gap-x-3 gap-y-4">
            {AREAS.map((area) => {
              const Icon = area.icon;
              const isSelected = selectedArea === area.id;
              const c = getAreaColors(area.id);
              return (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => selectArea(area.id)}
                  aria-pressed={isSelected}
                  className="tap-fix flex h-[84px] flex-col items-center justify-center gap-2 rounded-[20px] border transition-[border-color,background-color,box-shadow,transform] duration-500 ease-out"
                  style={{
                    borderColor: isSelected ? c.border : "rgba(255,255,255,0.10)",
                    backgroundColor: isSelected ? c.bg : "rgba(255,255,255,0.03)",
                    boxShadow: isSelected
                      ? `0 0 22px ${c.glow}, 0 18px 34px rgba(0,0,0,0.78), 0 34px 68px rgba(0,0,0,0.46)`
                      : "0 18px 34px rgba(0,0,0,0.78), 0 34px 68px rgba(0,0,0,0.46)",
                    transform: isSelected ? "translateY(-1px)" : "translateY(0px)",
                  }}
                >
                  <Icon
                    className="h-6 w-6 transition-[color,filter,transform] duration-500 ease-out"
                    style={{
                      color: isSelected ? c.text : "rgba(203,213,225,0.68)",
                      filter: isSelected ? `drop-shadow(0 0 7px ${c.glow})` : "none",
                      transform: isSelected ? "scale(1.035)" : "scale(1)",
                    }}
                  />
                  <span
                    className="text-[13px] font-semibold"
                    style={{ color: isSelected ? "#ffffff" : "rgba(226,232,240,0.9)" }}
                  >
                    {area.title}
                  </span>
                </button>
              );
            })}
          </section>

          {/* ── OPTIONAL CONTEXT / PREMIUM ACCENT ── */}
          <div
            className="relative mt-3 h-[84px] rounded-[20px] border border-white/[0.10] bg-white/[0.035] standard-shadow transition-[border-color,box-shadow] duration-300 focus-within:border-white/[0.16]"
          >
            <div
              className="pointer-events-none absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full"
              style={{
                border: "1px solid rgba(202,162,38,0.46)",
                background: "rgba(202,162,38,0.07)",
                boxShadow: "0 0 12px rgba(202,162,38,0.10)",
              }}
              aria-hidden="true"
            >
              <Crown className="h-3.5 w-3.5" style={{ color: "rgba(234,190,63,0.92)" }} />
            </div>

            <div className="h-full rounded-[20px] bg-white/[0.02] px-4 py-2 pr-12">
              <Textarea
                id="question"
                rows={2}
                value={question}
                onFocus={clearSelectionTimeout}
                onChange={(e) => {
                  clearSelectionTimeout();
                  setQuestion(e.target.value);
                }}
                placeholder={
                  selectedArea
                    ? "Tap to add context (optional)"
                    : "Select a reading, then add context (optional)"
                }
                className="h-full min-h-0 w-full resize-none rounded-[14px] !border-0 !bg-transparent px-1 py-1 text-[16px] leading-6 text-white !shadow-none placeholder:text-slate-500 focus:!border-0 focus:outline-none focus:!ring-0 focus-visible:!border-0 focus-visible:!ring-0 focus-visible:!ring-offset-0 focus-visible:!shadow-none"
                style={{ backgroundColor: "transparent" }}
              />
            </div>
          </div>

          {/* ── BEGIN READING (always present) ── */}
          <div className="mt-3 flex flex-col items-center">
            {submitError && <p className="mb-2 text-center text-xs text-red-300">{submitError}</p>}
            <Button
              type="button"
              onClick={handleStartReading}
              disabled={!canSubmit || isCreatingReading}
              className="standard-shadow h-12 w-[calc(50%_-_6px)] rounded-2xl text-[14px] font-medium transition-all duration-500 ease-out hover:opacity-90 disabled:cursor-not-allowed"
              style={{
                background: canSubmit && !isCreatingReading
                  ? "linear-gradient(180deg, rgba(45,212,191,0.055), rgba(45,212,191,0.015))"
                  : "rgba(255,255,255,0.012)",
                border: canSubmit && !isCreatingReading
                  ? "2px solid rgba(94,234,212,0.72)"
                  : "1px solid rgba(203,213,225,0.16)",
                color: canSubmit && !isCreatingReading
                  ? "rgba(94,234,212,0.98)"
                  : "rgba(203,213,225,0.34)",
                opacity: canSubmit && !isCreatingReading ? 1 : 0.58,
                transform: canSubmit && !isCreatingReading ? "scale(1)" : "scale(0.975)",
                boxShadow: canSubmit && !isCreatingReading
                  ? "0 0 0 1px rgba(94,234,212,0.08), 0 0 22px rgba(45,212,191,0.24), 0 18px 34px rgba(0,0,0,0.78), 0 34px 68px rgba(0,0,0,0.46)"
                  : "0 14px 28px rgba(0,0,0,0.56)",
              }}
            >
              {buttonCopy}
            </Button>
          </div>

          {/* ── ASK ANYTHING — flagship premium feature, intentionally separate from readings ── */}
          <section className="mt-3 border-t border-white/[0.06] pt-4">
            <button
              type="button"
              onClick={() => setShowJxl(true)}
              className="ask-premium tap-fix relative flex h-[108px] w-full items-center rounded-[24px] px-5 text-left transition-transform duration-300 hover:-translate-y-[1px] active:translate-y-0"
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
            </button>
          </section>


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