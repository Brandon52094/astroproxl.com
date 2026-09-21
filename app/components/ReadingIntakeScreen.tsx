"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useUser } from "@clerk/nextjs";
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
        bg: "rgba(127, 29, 29, 0.30)",
        border: "#F97316",
        glow: "rgba(239, 68, 68, 0.30)",
        text: "#FCA5A5",
        iconBg: "rgba(127, 29, 29, 0.55)",
        gradient: "linear-gradient(135deg, rgba(127,29,29,0.85) 0%, rgba(153,27,27,0.70) 32%, rgba(239,68,68,0.20) 100%)",
      },
      money: {
        bg: "rgba(20, 83, 45, 0.30)",
        border: "#34D399",
        glow: "rgba(34, 197, 94, 0.30)",
        text: "#86EFAC",
        iconBg: "rgba(20, 83, 45, 0.55)",
        gradient: "linear-gradient(135deg, rgba(20,83,45,0.85) 0%, rgba(22,101,52,0.70) 32%, rgba(34,197,94,0.20) 100%)",
      },
      career: {
        bg: "rgba(30, 58, 138, 0.30)",
        border: "#93C5FD",
        glow: "rgba(59, 130, 246, 0.30)",
        text: "#93C5FD",
        iconBg: "rgba(30, 58, 138, 0.55)",
        gradient: "linear-gradient(135deg, rgba(30,58,138,0.85) 0%, rgba(37,99,235,0.70) 32%, rgba(59,130,246,0.20) 100%)",
      },
      other: {
        bg: "rgba(49, 46, 129, 0.30)",
        border: "#8B5CF6",
        glow: "rgba(139, 92, 246, 0.30)",
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
  const { user } = useUser();
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

  // Dashboard identity. The display name is synced to Clerk unsafe metadata so
  // it follows the signed-in user instead of living only on this device.
  const [displayName, setDisplayName] = useState("Your Name");
  const [nameDraft, setNameDraft] = useState("Your Name");
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);

  useEffect(() => {
    if (!user) return;
    const metadataName = user.unsafeMetadata?.astroProDisplayName;
    const nextName =
      typeof metadataName === "string" && metadataName.trim()
        ? metadataName.trim()
        : user.firstName?.trim() || "Your Name";
    setDisplayName(nextName);
    setNameDraft(nextName);
  }, [user]);

  const saveDisplayName = useCallback(async () => {
    const nextName = nameDraft.trim() || displayName || "Your Name";
    setDisplayName(nextName);
    setNameDraft(nextName);
    setIsEditingName(false);

    if (!user) return;
    setIsSavingName(true);
    try {
      await user.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          astroProDisplayName: nextName,
        },
      });
    } catch {
      // Keep the optimistic display name in-session if profile sync fails.
    } finally {
      setIsSavingName(false);
    }
  }, [displayName, nameDraft, user]);

  // Chart-derived data for the dashboard.
  const [natal, setNatal] = useState<Placement[]>([]);
  const [transits, setTransits] = useState<Placement[]>([]);

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

  // Once the chart is ready, read natal placements + current transits for the dashboard.
  useEffect(() => {
    if (chartStatus !== "ready") return;
    const chart = loadChart();
    const data = chart?.chartData as unknown as {
      tropical?: { planets?: Placement[] };
      transits?: Placement[];
    } | undefined;
    if (!data) return;
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

  /* ── Dashboard identity + today's transit snapshot ───────────────── */
  const dashboard = useMemo(() => {
    const find = (arr: Placement[], name: string) => arr.find((p) => p.name === name);

    const natalSun = find(natal, "Sun");
    const natalMoon = find(natal, "Moon");
    const natalRising = find(natal, "Ascendant");

    const transitSun = find(transits, "Sun");
    const transitMoon = find(transits, "Moon");
    const mercury = find(transits, "Mercury");
    const venus = find(transits, "Venus");

    const lineOneParts = [
      transitSun?.sign ? `Sun in ${transitSun.sign}` : null,
      transitMoon?.sign ? `Moon in ${transitMoon.sign}` : null,
    ].filter(Boolean) as string[];

    const lineTwoParts = [
      mercury?.sign
        ? `Mercury ${mercury.isRetrograde ? "Retrograde" : `in ${mercury.sign}`}`
        : null,
      venus?.sign ? `Venus in ${venus.sign}` : null,
    ].filter(Boolean) as string[];

    return {
      sunSign: natalSun?.sign || "Sun",
      moonSign: natalMoon?.sign || "Moon",
      risingSign: natalRising?.sign || "Rising",
      transitLineOne: lineOneParts.length ? lineOneParts.join(" · ") : "Today's transits are loading",
      transitLineTwo: lineTwoParts.length ? lineTwoParts.join(" · ") : "Your daily sky is being prepared",
    };
  }, [natal, transits]);

  const buttonCopy = useMemo(() => {
    if (chartStatus === "recalculating") return "Loading your chart…";
    if (isCreatingReading) return "Preparing reading...";
    if (!selectedAreaConfig) return "Select a Reading";
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
    setSelectedArea(id);
    setQuestion("");
    const area = AREAS.find((a) => a.id === id);
    trackTtq("ViewContent", { content_id: id, content_name: area?.title });
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

        /* ── HERO DASHBOARD ── */
        .dashboard-symbol {
          display: flex;
          min-width: 70px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .dashboard-glyph {
          display: flex;
          height: 28px;
          align-items: center;
          justify-content: center;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 25px;
          line-height: 1;
          color: rgba(241,245,249,0.96);
          text-shadow:
            0 0 12px rgba(var(--hero-c2), 0.34),
            0 5px 16px rgba(0,0,0,0.78);
        }

        .dashboard-glyph-asc {
          font-family: inherit;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.18em;
        }

        .dashboard-name-input {
          width: min(240px, 82%);
          border: 0;
          border-bottom: 1px solid rgba(226,232,240,0.34);
          background: transparent;
          color: #ffffff;
          text-align: center;
          outline: none;
          box-shadow: none;
        }

        .standard-shadow {
          box-shadow:
            0 18px 38px rgba(0,0,0,0.78),
            0 34px 72px rgba(0,0,0,0.58),
            0 48px 96px rgba(0,0,0,0.34);
        }

        /* ── ASK ANYTHING — flagship treatment (gold stays reserved for subscriber-only UI) ── */
        @keyframes askPremiumPulse {
          0%, 100% {
            box-shadow:
              0 0 0 1px rgba(129,140,248,0.12),
              0 0 22px rgba(99,102,241,0.16),
              0 18px 34px rgba(0,0,0,0.78),
              0 34px 68px rgba(0,0,0,0.46);
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(94,234,212,0.22),
              0 0 34px rgba(94,234,212,0.18),
              0 18px 34px rgba(0,0,0,0.78),
              0 34px 68px rgba(0,0,0,0.46);
          }
        }

        @keyframes askPremiumSweep {
          0% { transform: translateX(-160%) skewX(-18deg); opacity: 0; }
          18% { opacity: 0.7; }
          48%, 100% { transform: translateX(260%) skewX(-18deg); opacity: 0; }
        }

        @keyframes askMicBreathe {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 14px rgba(94,234,212,0.14);
          }
          50% {
            transform: scale(1.06);
            box-shadow: 0 0 22px rgba(94,234,212,0.28);
          }
        }

        .ask-premium {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          border: 1px solid transparent;
          background:
            linear-gradient(145deg, rgba(11,15,34,0.96), rgba(6,8,22,0.96)) padding-box,
            linear-gradient(120deg, rgba(129,140,248,0.82), rgba(94,234,212,0.72), rgba(196,181,253,0.86)) border-box;
          animation: askPremiumPulse 3.6s ease-in-out infinite;
        }

        .ask-premium::before {
          content: "";
          position: absolute;
          inset: -30% auto -30% -32%;
          width: 28%;
          background: linear-gradient(105deg, transparent, rgba(255,255,255,0.16), transparent);
          transform: translateX(-160%) skewX(-18deg);
          animation: askPremiumSweep 4.8s ease-in-out infinite;
          pointer-events: none;
          z-index: 1;
        }

        .ask-premium > * { position: relative; z-index: 2; }

        .ask-mic-halo {
          display: flex;
          height: 30px;
          width: 30px;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          border: 1px solid rgba(94,234,212,0.28);
          background: radial-gradient(circle, rgba(94,234,212,0.12), rgba(99,102,241,0.06) 70%, transparent);
          animation: askMicBreathe 2.8s ease-in-out infinite;
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
          {/* ── HERO DASHBOARD ── */}
          <section className="mb-5 pt-1">
            <button
              type="button"
              onClick={() => onSwipeLeft?.()}
              className="tap-fix mx-auto mb-1.5 block text-[10px] font-medium uppercase tracking-[0.22em] text-slate-300/80"
              style={{ textShadow: "0 2px 10px rgba(0,0,0,0.88)" }}
            >
              Swipe Left To Explore
            </button>

            <div
              className="hero-shine hero-outline relative h-[220px] overflow-hidden rounded-[28px] bg-white/[0.03] px-5 text-center"
              style={{
                "--hero-c1": heroPalette[0],
                "--hero-c2": heroPalette[1],
                "--hero-c3": heroPalette[2],
                "--hero-c4": heroPalette[3],
              } as React.CSSProperties}
            >
              <div className="relative z-10 flex h-full flex-col items-center px-1 pb-3 pt-2.5">
                <div className="inline-flex items-center rounded-full border border-indigo-400/30 bg-indigo-400/10 px-3 py-1">
                  <span className="text-[9.5px] font-medium uppercase tracking-[0.22em] text-indigo-200">
                    AstroProXL
                  </span>
                </div>

                <div className="mt-2.5 text-center">
                  <div className="text-[13px] font-medium leading-4 text-slate-300/90">Hello,</div>

                  {isEditingName ? (
                    <input
                      autoFocus
                      value={nameDraft}
                      maxLength={32}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onBlur={saveDisplayName}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void saveDisplayName();
                        }
                        if (e.key === "Escape") {
                          setNameDraft(displayName);
                          setIsEditingName(false);
                        }
                      }}
                      className="dashboard-name-input mt-0.5 text-[30px] font-semibold leading-[34px] tracking-[-0.02em]"
                      aria-label="Your AstroProXL display name"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setNameDraft(displayName);
                        setIsEditingName(true);
                      }}
                      className="tap-fix mt-0.5 block text-[30px] font-semibold leading-[34px] tracking-[-0.02em] text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.72)]"
                    >
                      {displayName}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isSavingName}
                    onClick={() => {
                      setNameDraft(displayName);
                      setIsEditingName(true);
                    }}
                    className="tap-fix mt-0.5 text-[9px] font-medium uppercase tracking-[0.18em] text-slate-400/80 disabled:opacity-50"
                  >
                    {isSavingName ? "Saving…" : "Tap to edit"}
                  </button>
                </div>

                <div className="mt-2.5 flex w-full max-w-[290px] items-start justify-between px-1">
                  <div className="dashboard-symbol">
                    <span className="dashboard-glyph" aria-hidden="true">☉</span>
                    <span className="mt-1 text-[9.5px] font-medium tracking-[0.04em] text-slate-300/90">
                      {dashboard.sunSign} Sun
                    </span>
                  </div>

                  <div className="dashboard-symbol">
                    <span className="dashboard-glyph" aria-hidden="true">☽</span>
                    <span className="mt-1 text-[9.5px] font-medium tracking-[0.04em] text-slate-300/90">
                      {dashboard.moonSign} Moon
                    </span>
                  </div>

                  <div className="dashboard-symbol">
                    <span className="dashboard-glyph dashboard-glyph-asc" aria-hidden="true">ASC</span>
                    <span className="mt-1 text-[9.5px] font-medium tracking-[0.04em] text-slate-300/90">
                      {dashboard.risingSign} Rising
                    </span>
                  </div>
                </div>

                <div className="mt-auto w-full max-w-[34ch] border-t border-white/[0.08] pt-2 text-center">
                  <p className="text-[11px] leading-4 text-slate-300/86">
                    {dashboard.transitLineOne}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-400/80">
                    {dashboard.transitLineTwo}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ── Prompt ── */}
          <p
            className="mb-4 text-center text-[12.5px] font-semibold uppercase tracking-[0.22em] text-slate-100"
            style={{
              textShadow:
                "0 3px 12px rgba(0,0,0,0.98), 0 0 14px rgba(148,163,184,0.16)",
            }}
          >
            Please Select a Reading
          </p>

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
                  className="tap-fix flex h-[84px] flex-col items-center justify-center gap-2 rounded-[20px] border transition-all duration-300"
                  style={{
                    borderColor: isSelected ? c.border : "rgba(255,255,255,0.10)",
                    background: isSelected ? c.bg : "rgba(255,255,255,0.03)",
                    boxShadow: isSelected
                      ? `0 0 26px ${c.glow}, 0 18px 34px rgba(0,0,0,0.78), 0 34px 68px rgba(0,0,0,0.46)`
                      : "0 18px 34px rgba(0,0,0,0.78), 0 34px 68px rgba(0,0,0,0.46)",
                  }}
                >
                  <Icon className="h-6 w-6" style={{ color: c.text }} />
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

          {/* ── ASK ANYTHING (flagship feature; centered beneath the reading grid) ── */}
          <button
            type="button"
            onClick={() => setShowJxl(true)}
            className="ask-premium tap-fix mt-4 flex h-[84px] w-[calc(50%_-_6px)] self-center items-center justify-center gap-2.5 rounded-[20px] px-3"
          >
            <span className="ask-mic-halo shrink-0">
              <Mic className="h-[17px] w-[17px]" style={{ color: "rgba(167,243,208,0.98)" }} />
            </span>
            <span className="min-w-0 text-left">
              <span className="block text-[13px] font-semibold leading-4 tracking-[0.025em] text-slate-100">
                Ask Anything
              </span>
              <span className="mt-1 block whitespace-nowrap text-[8.5px] font-medium uppercase leading-3 tracking-[0.08em] text-slate-400">
                Tap · Press &amp; Hold · Speak
              </span>
            </span>
          </button>

          {/* ── READING INFO (compact, centered, one line) ── */}
          <div className="mt-3 min-h-[22px] text-center">
            <AnimatePresence mode="wait">
              {selectedAreaConfig ? (
                <motion.p
                  key={selectedAreaConfig.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="whitespace-nowrap text-[10.5px] leading-[22px] text-slate-400"
                >
                  <span
                    className="text-[11.5px] font-semibold"
                    style={{ color: getAreaColors(selectedAreaConfig.id).text }}
                  >
                    {selectedAreaConfig.title}
                  </span>
                  <span className="mx-1.5 text-slate-600">·</span>
                  <span>{selectedAreaConfig.description}</span>
                </motion.p>
              ) : (
                <motion.p
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-[11px] leading-[22px] text-slate-500"
                >
                  Tap a reading above to see what it covers.
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* ── OPTIONAL CONTEXT / PREMIUM ACCENT ── */}
          <div
            className="relative mt-3 rounded-[22px] border bg-white/[0.035] standard-shadow"
            style={{
              borderColor: "rgba(202, 162, 38, 0.72)",
              boxShadow:
                "0 0 22px rgba(202,162,38,0.08), 0 18px 44px rgba(0,0,0,0.72), 0 36px 80px rgba(0,0,0,0.56)",
              transition: "border-color 0.3s ease, box-shadow 0.3s ease",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "rgba(234, 190, 63, 0.95)";
              e.currentTarget.style.boxShadow =
                "0 0 30px rgba(202,162,38,0.16), 0 18px 44px rgba(0,0,0,0.72), 0 36px 80px rgba(0,0,0,0.56)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "rgba(202, 162, 38, 0.72)";
              e.currentTarget.style.boxShadow =
                "0 0 22px rgba(202,162,38,0.08), 0 18px 44px rgba(0,0,0,0.72), 0 36px 80px rgba(0,0,0,0.56)";
            }}
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

            <div className="rounded-[22px] bg-white/[0.02] px-4 py-3 pr-12">
              <Textarea
                id="question"
                rows={3}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={
                  selectedArea
                    ? "Tap to add context (optional)"
                    : "Select a reading, then add context (optional)"
                }
                className="min-h-[84px] w-full resize-none rounded-[16px] !border-0 !bg-transparent px-1 py-1 text-[16px] leading-6 text-white !shadow-none placeholder:text-slate-500 focus:!border-0 focus:outline-none focus:!ring-0 focus-visible:!border-0 focus-visible:!ring-0 focus-visible:!ring-offset-0 focus-visible:!shadow-none"
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
              className="standard-shadow h-12 w-[calc(50%_-_6px)] rounded-2xl text-[14px] font-semibold tracking-[0.015em] transition-all duration-300 hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(20,184,166,0.08) 0%, rgba(6,78,79,0.035) 100%)",
                border: "2px solid rgba(94,234,212,0.72)",
                color: "rgba(153,246,228,0.98)",
                boxShadow: canSubmit && !isCreatingReading
                  ? "inset 0 1px 0 rgba(255,255,255,0.06), 0 0 22px rgba(45,212,191,0.22), 0 18px 34px rgba(0,0,0,0.78), 0 34px 68px rgba(0,0,0,0.46)"
                  : "inset 0 1px 0 rgba(255,255,255,0.04), 0 18px 34px rgba(0,0,0,0.78), 0 34px 68px rgba(0,0,0,0.46)",
              }}
            >
              {buttonCopy}
            </Button>
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