"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Heart,
  Briefcase,
  Wallet,
  Sparkles,
  Eye,
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
    icon: Eye,
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
  pwaFreeReadingUsed?: boolean;
}

interface ReadingIntakeScreenProps {
  userStatus: UserStatus | null;
  onSwipeLeft?: () => void;
}

/* ── Chart types (mirrors BirthChartPanel) ─────────────────────────── */

interface NatalPlacement {
  name: string;
  sign: string;
  degree: string;
  house?: number;
}

interface ProfectionData {
  profectionYear: number;
  age: number;
  activatedSign: string;
  activatedHouse?: number;
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

const NATAL_ORDER = ["Sun", "Moon", "Ascendant", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];

/* ── The four elements (from BirthChartPanel) ──────────────────────── */

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

function elementOf(sign?: string): Element | null {
  if (!sign) return null;
  return SIGN_ELEMENTS[sign] ?? null;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/* Maps a sign to its ruling planet's name (for the profection glyph). */
function SIGN_RULER_GLYPH(sign: string): string {
  const rulers: Record<string, string> = {
    Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon",
    Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Mars",
    Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter",
  };
  return rulers[sign] ?? "Sun";
}

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

  // Chart-derived data for the Big 3 tiles, element balance, profection pill.
  const [natal, setNatal] = useState<NatalPlacement[]>([]);
  const [profection, setProfection] = useState<ProfectionData | null>(null);

  const shouldReduceMotion = useReducedMotion();
  const clusterTopRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollFocusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const getIconPulseAnimation = useCallback((isSelected = false) => {
    if (shouldReduceMotion) return {};
    if (!isSelected) return { scale: 1, transition: { duration: 0.2 } };
    return {
      scale: [1, 1.1, 1],
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

  // Once the chart is ready, read the placements + profection for the header.
  useEffect(() => {
    if (chartStatus !== "ready") return;
    const chart = loadChart();
    const data = chart?.chartData as unknown as {
      profection?: ProfectionData;
      tropical?: { planets?: NatalPlacement[] };
    } | undefined;
    if (!data) return;
    if (data.profection) setProfection(data.profection);
    const planets = data.tropical?.planets ?? [];
    setNatal(
      planets
        .filter((p) => NATAL_ORDER.includes(p.name))
        .sort((a, b) => NATAL_ORDER.indexOf(a.name) - NATAL_ORDER.indexOf(b.name))
    );
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

  /* ── Derived chart values ─────────────────────────────────────────── */

  const hasChart = natal.length > 0;

  const bigThree = useMemo(() => {
    const find = (n: string) => natal.find((p) => p.name === n);
    return { sun: find("Sun"), moon: find("Moon"), rising: find("Ascendant") };
  }, [natal]);

  const elementBalance = useMemo(() => {
    const counts: Record<Element, number> = { Fire: 0, Earth: 0, Air: 0, Water: 0 };
    natal.forEach((p) => {
      const el = elementOf(p.sign);
      if (el) counts[el] += 1;
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const dominant = ELEMENT_ORDER.reduce((top, el) => (counts[el] > counts[top] ? el : top), "Fire");
    return { counts, total, dominant };
  }, [natal]);

  const hasProfection =
    !!profection &&
    typeof profection.profectionYear === "number" &&
    !!profection.activatedSign;

  const profectionElement = elementOf(profection?.activatedSign);
  const profectionColors = profectionElement ? ELEMENT_COLORS[profectionElement] : null;

  const buttonCopy = useMemo(() => {
    if (chartStatus === "recalculating") return "Loading your chart…";
    if (isCreatingReading) return "Preparing reading...";
    if (!selectedAreaConfig) return "Choose a reading type";
    const hasCredits = Number(userStatus?.credits ?? 0) > 0;
    const isSubscribed = userStatus?.isSubscribed === true;
    if (!hasCredits && !isSubscribed) {
      return `${selectedAreaConfig.cta} — ${formatUsd(PRICING.reading.price)}`;
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

  const selectArea = useCallback((id: string) => {
    setSelectedArea(id);
    setQuestion("");
    const area = AREAS.find((a) => a.id === id);
    trackTtq("ViewContent", { content_id: id, content_name: area?.title });
    if (id !== "other") scrollClusterIntoViewThenFocus();
  }, [scrollClusterIntoViewThenFocus]);

  // NOTE: sign tiles + profection pill currently navigate via onSwipeLeft
  // (the pager prop this screen already receives). Point me at the real
  // route/pager target for the birth-chart page and I'll wire it exactly.
  const goToChart = useCallback(() => { onSwipeLeft?.(); }, [onSwipeLeft]);

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
          returnUrl: window.location.origin + "/reading/preparing",
        }),
      });
      const checkoutData = await checkoutRes.json();

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
    const map: Record<string, { bg: string; border: string; glow: string; text: string }> = {
      love:   { bg: "rgba(127, 29, 29, 0.22)", border: "rgba(249,115,22,0.55)", glow: "rgba(239,68,68,0.28)",  text: "#FCA5A5" },
      money:  { bg: "rgba(20, 83, 45, 0.22)",  border: "rgba(52,211,153,0.55)", glow: "rgba(34,197,94,0.28)",  text: "#86EFAC" },
      career: { bg: "rgba(30, 58, 138, 0.22)", border: "rgba(147,197,253,0.55)", glow: "rgba(59,130,246,0.28)", text: "#93C5FD" },
      other:  { bg: "rgba(49, 46, 129, 0.22)", border: "rgba(139,92,246,0.55)", glow: "rgba(139,92,246,0.28)",  text: "#C4B5FD" },
    };
    return map[areaId] ?? map.other;
  }, []);

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

        .standard-shadow { box-shadow: 0 18px 44px rgba(0,0,0,0.72), 0 36px 80px rgba(0,0,0,0.56); }

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

        @keyframes elementShine {
          0% { transform: translateX(-140%) skewX(-18deg); }
          60% { transform: translateX(240%) skewX(-18deg); }
          100% { transform: translateX(240%) skewX(-18deg); }
        }
        .element-box { position: relative; overflow: hidden; isolation: isolate; }
        .element-box::after {
          content: "";
          position: absolute;
          top: 0; bottom: 0; left: 0;
          width: 45%;
          background: linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.09) 45%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0.09) 55%, transparent 100%);
          transform: translateX(-140%) skewX(-18deg);
          animation: elementShine 4.6s ease-in-out infinite;
          pointer-events: none;
          z-index: 1;
        }
        .element-box > * { position: relative; z-index: 2; }

        @media (prefers-reduced-motion: reduce) {
          .hero-shine::after,
          .element-box::after { animation: none !important; opacity: 0; }
        }
      `}</style>

      <div className="nebula" aria-hidden="true" />
      <StarfieldBackground />

      <div
        className="relative z-10 mx-auto flex w-full max-w-[430px] flex-col px-4 pt-14"
        style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex flex-col gap-4"
        >
          {/* ── HERO ── */}
          <section className="pt-1">
            <div
              className="hero-shine standard-shadow relative overflow-hidden rounded-[28px] border bg-white/[0.03] px-5 py-7 text-center"
              style={{
                borderColor: "rgba(255, 255, 255, 0.60)",
                boxShadow: "0 0 32px rgba(99, 102, 241, 0.20), inset 0 0 20px rgba(99, 102, 241, 0.12), 0 18px 44px rgba(0,0,0,0.72), 0 36px 80px rgba(0,0,0,0.56)",
              }}
            >
              <div className="relative z-10 mx-auto max-w-[560px]">
                <div className="mb-3 inline-flex items-center rounded-full border border-indigo-400/30 bg-indigo-400/10 px-4 py-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-[0.20em] text-indigo-200">
                    The Astrology Engine
                  </span>
                </div>
                <h1 className="text-[44px] font-semibold leading-[0.95] tracking-[-0.02em] text-white drop-shadow-[0_14px_34px_rgba(0,0,0,0.85)] sm:text-[54px]">
                  ASTROPRO
                  <span
                    className="font-semibold"
                    style={{ fontSize: "0.34em", verticalAlign: "super", letterSpacing: "0.04em", marginLeft: "0.04em" }}
                  >
                    XL
                  </span>
                </h1>
                <p className="mx-auto mt-3 max-w-[30ch] text-[13px] font-medium leading-6 text-slate-300/86 sm:text-[14px]">
                  What's Coming. What's Changing. What You Need to Know.
                </p>
              </div>
            </div>
          </section>

          {/* ── Pager dots ── */}
          <div className="flex items-center justify-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-white/85" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
          </div>

          {/* ── Big 3 tiles — tap to open the full chart ── */}
          {hasChart && (
            <div className="grid grid-cols-3 gap-2.5">
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
                  <button
                    type="button"
                    key={label}
                    onClick={goToChart}
                    aria-label={`${label} sign — open your birth chart`}
                    className="element-box tap-fix rounded-2xl border bg-black/20 px-2 py-3.5 text-center"
                    style={
                      colors
                        ? { borderColor: colors.border, boxShadow: `0 0 18px ${colors.glow}, inset 0 0 12px ${colors.glow}` }
                        : { borderColor: "rgba(255,255,255,0.10)" }
                    }
                  >
                    <span className="block text-[9px] uppercase tracking-[0.14em] text-slate-500">{label}</span>
                    <span className="mt-1 block text-[15px] font-medium leading-tight text-white">{p?.sign ?? "—"}</span>
                    {element && colors && (
                      <span
                        className="mt-1 block text-[8px] font-medium uppercase tracking-[0.16em]"
                        style={{ color: colors.text }}
                      >
                        {element}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Element Balance (condensed) ── */}
          {elementBalance.total > 0 && (
            <div className="standard-shadow rounded-[20px] border border-white/10 bg-white/[0.03] p-3.5 backdrop-blur-sm">
              <div className="mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-slate-500" strokeWidth={2.2} />
                <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-slate-500">
                  Element Balance
                </span>
              </div>
              <div className="space-y-1.5">
                {ELEMENT_ORDER.map((el) => {
                  const count = elementBalance.counts[el];
                  const pct = elementBalance.total ? Math.round((count / elementBalance.total) * 100) : 0;
                  const colors = ELEMENT_COLORS[el];
                  return (
                    <div key={el} className="flex items-center gap-2.5">
                      <span
                        className="w-12 text-[9px] font-medium uppercase tracking-[0.10em]"
                        style={{ color: colors.text }}
                      >
                        {el}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.7, ease: "easeOut" }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: colors.bar, opacity: 0.85 }}
                        />
                      </div>
                      <span className="w-4 text-right text-[11px] text-slate-400 tabular-nums">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Profection pill — tap to open the full chart ── */}
          {hasProfection && (
            <button
              type="button"
              onClick={goToChart}
              aria-label="Open your profection year"
              className="tap-fix standard-shadow flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-left"
            >
              {profectionColors && (
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-black/20"
                  style={{ borderColor: profectionColors.border, boxShadow: `0 0 14px ${profectionColors.glow}` }}
                >
                  <span className="text-[15px]" style={{ color: profectionColors.text }}>
                    {GLYPHS[SIGN_RULER_GLYPH(profection!.activatedSign)] ?? "✦"}
                  </span>
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold leading-tight text-white">
                  {profection!.activatedSign} Year
                </span>
                <span className="mt-0.5 block text-[11px] leading-tight text-slate-400">
                  {typeof profection!.activatedHouse === "number"
                    ? `${ordinal(profection!.activatedHouse)} house activated`
                    : `${ordinal(profection!.profectionYear)} house year`}
                  {typeof profection!.age === "number" ? ` · age ${profection!.age}` : ""}
                </span>
              </span>
            </button>
          )}

          {/* ── Reading icons — tap one to begin that reading ── */}
          <div ref={clusterTopRef} className="grid grid-cols-4 gap-2.5">
            {AREAS.map((area) => {
              const Icon = area.icon;
              const isSelected = selectedArea === area.id;
              const c = getAreaColors(area.id);
              return (
                <motion.button
                  key={area.id}
                  type="button"
                  onClick={() => selectArea(area.id)}
                  aria-label={`${area.title} reading`}
                  aria-pressed={isSelected}
                  className="tap-fix flex h-[60px] items-center justify-center rounded-2xl border transition-all duration-300"
                  style={{
                    borderColor: isSelected ? c.border : "rgba(255,255,255,0.10)",
                    background: isSelected ? c.bg : "rgba(255,255,255,0.03)",
                    boxShadow: isSelected
                      ? `0 0 24px ${c.glow}, 0 14px 28px rgba(0,0,0,0.5)`
                      : "0 10px 22px rgba(0,0,0,0.4)",
                  }}
                >
                  <motion.span animate={getIconPulseAnimation(isSelected)} className="flex">
                    <Icon className="h-5 w-5" style={{ color: isSelected ? c.text : "#94a3b8" }} />
                  </motion.span>
                </motion.button>
              );
            })}
          </div>

          {/* ── Selected label + textarea ── */}
          <AnimatePresence>
            {selectedArea && (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-2"
              >
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                  {selectedAreaConfig?.title}
                </p>

                {selectedArea !== "other" && (
                  <div
                    className="standard-shadow rounded-[26px] border border-white/18 bg-white/[0.035] p-[1px]"
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
                        placeholder={selectedAreaConfig?.placeholder ?? "Ask something specific so your reading can go deeper."}
                        className="min-h-[132px] w-full rounded-[20px] border-0 bg-transparent px-3 py-3 text-[16px] leading-6 text-white placeholder:text-slate-400/80 focus:outline-none focus:ring-0"
                        style={{ backgroundColor: "transparent" }}
                      />
                    </div>
                  </div>
                )}
              </motion.section>
            )}
          </AnimatePresence>

          {/* ── SUBMIT ── */}
          {selectedArea && (
            <div className="space-y-3 pb-1">
              {submitError && <p className="text-center text-xs text-red-300">{submitError}</p>}
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
            </div>
          )}

          {/* ── Ask JXL (compact) ── */}
          <button
            type="button"
            onClick={() => setShowJxl(true)}
            className="tap-fix standard-shadow mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-full border"
            style={{
              borderColor: "rgba(94,234,212,0.5)",
              background: "linear-gradient(180deg, rgba(20,120,110,0.14), rgba(6,20,18,0.10))",
              color: "rgba(94,234,212,0.95)",
            }}
          >
            <Sparkles className="h-4 w-4" />
            <span className="text-[14px] font-semibold tracking-[0.02em]">Ask JXL</span>
          </button>
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