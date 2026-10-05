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
} from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
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

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

declare global {
  interface Window {
    ttq?: {
      track: (event: string, params?: Record<string, unknown>) => void;
    };
  }
}

/* ── Recorded voice capture for Ask Anything ────────────────────────── */
const ASK_MIN_HOLD_MS = 450;

const ASK_WAVE = {
  sensitivity: 1.5,
  idle: 0.18,
  lines: 3,
  speed: 2.2,
  glow: 18,
  thickness: 2.45,
  colors: ["#22c55e", "#3b82f6", "#a855f7", "#ef4444", "#f59e0b"],
};

function triggerIntakeHaptic() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(12);
    }
  } catch {
    // Haptics are optional.
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
    icon: Heart,
    defaultQuestion: "What is coming for me in love over the next 30–45 days?",
  },
  {
    id: "money",
    title: "Money",
    icon: Wallet,
    defaultQuestion: "What is coming for me with money over the next 30–45 days?",
  },
  {
    id: "career",
    title: "Career",
    icon: Briefcase,
    defaultQuestion: "What is coming for me in my career over the next 30–45 days?",
  },
  {
  id: "other",
  title: "What's Coming",
  icon: null,
  marker: "✦",
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

type CheckoutIntent =
  | "reading"
  | "voice"
  | "subscription"
  | null;

type LockedFeature = "context" | "voice";

interface UserStatus {
  credits: number;
  jxlCredits: number;

  isSubscribed: boolean;

  effectiveMembershipPlan:
    | "plus"
    | "plus_xl"
    | null;

  membershipJxlUsed: number;

  membershipEntitlements: {
    readingsPerMonth: number | null;
    jxlPerMonth: number | null;

    voiceReading: boolean;
    addContext: boolean;
    extendedSavedReading: boolean;
    customThemes: boolean;
    commissionAccess: boolean;
  } | null;
}

interface ReadingIntakeScreenProps {
  userStatus: UserStatus | null;
  onSwipeLeft?: () => void;
  onOpenCredits?: (
    intent: "context" | "voice"
  ) => void;
  /** Set false while this panel is offscreen, then true when the user swipes back. */
  isActive?: boolean;
}

/* ── Chart shapes used by the hero information system ─────────────── */
interface Placement {
  name: string;
  sign: string;
  degree?: string;
  house?: number;
}

interface MoonPhaseData {
  phaseName?: string;
  illuminationPercent: number;
  nextEventName?: "New Moon" | "Full Moon";
  daysUntilNextEvent?: number;
  moonSign?: string;
  moonDegree?: string;
  nextSignName?: string;
  nextSignIngressAt?: string;
}

type ElementName = "Earth" | "Fire" | "Water" | "Air";

const SIGN_ELEMENTS: Record<string, ElementName> = {
  Taurus: "Earth", Virgo: "Earth", Capricorn: "Earth",
  Aries: "Fire", Leo: "Fire", Sagittarius: "Fire",
  Cancer: "Water", Scorpio: "Water", Pisces: "Water",
  Gemini: "Air", Libra: "Air", Aquarius: "Air",
};

// Keep the intake hero aligned with the elemental language already used by BirthChartPanel.
const HERO_ELEMENT_COLORS: Record<
  ElementName,
  { text: string; bar: string; glow: string; border: string }
> = {
  Earth: {
    text: "#6EE7B7",
    bar: "#34D399",
    glow: "rgba(16,185,129,0.30)",
    border: "rgba(52,211,153,0.65)",
  },
  Fire: {
    text: "#FDBA74",
    bar: "#F97316",
    glow: "rgba(239,68,68,0.32)",
    border: "rgba(249,115,22,0.75)",
  },
  Water: {
    text: "#93C5FD",
    bar: "#60A5FA",
    glow: "rgba(59,130,246,0.30)",
    border: "rgba(96,165,250,0.70)",
  },
  Air: {
    text: "#BAE6FD",
    bar: "#7DD3FC",
    glow: "rgba(125,211,252,0.26)",
    border: "rgba(186,230,253,0.60)",
  },
};

function signAccentColor(sign: string): string {
  const element = SIGN_ELEMENTS[sign];
  return element ? HERO_ELEMENT_COLORS[element].text : "rgba(203,213,225,0.72)";
}

function signAccentGlow(sign: string): string {
  const element = SIGN_ELEMENTS[sign];
  return element ? HERO_ELEMENT_COLORS[element].glow : "rgba(148,163,184,0.12)";
}

interface ThemeColors {
  areaColors: {
    love: { bg: string; border: string; glow: string; text: string };
    money: { bg: string; border: string; glow: string; text: string };
    career: { bg: string; border: string; glow: string; text: string };
    other: { bg: string; border: string; glow: string; text: string };
  };
}

const THEMES: Record<"cosmic", ThemeColors> = {
  cosmic: {
    areaColors: {
      love: {
        bg: "rgba(131, 24, 67, 0.18)",
        border: "rgba(251, 113, 133, 0.78)",
        glow: "rgba(244, 114, 182, 0.20)",
        text: "#FDA4AF",
      },
      money: {
        bg: "rgba(20, 83, 45, 0.22)",
        border: "rgba(52, 211, 153, 0.74)",
        glow: "rgba(34, 197, 94, 0.22)",
        text: "#86EFAC",
      },
      career: {
        bg: "rgba(30, 58, 138, 0.22)",
        border: "rgba(147, 197, 253, 0.76)",
        glow: "rgba(59, 130, 246, 0.22)",
        text: "#93C5FD",
      },
      other: {
        bg: "rgba(49, 46, 129, 0.22)",
        border: "rgba(139, 92, 246, 0.76)",
        glow: "rgba(139, 92, 246, 0.22)",
        text: "#C4B5FD",
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
  onOpenCredits,
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
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [checkoutIntent, setCheckoutIntent] =
    useState<CheckoutIntent>(null);
  const theme = THEMES.cosmic;

  // Locked feature soft cue / third-attempt routing.
  const [lockedFeaturePrompt, setLockedFeaturePrompt] =
    useState<LockedFeature | null>(null);

  const lockedFeatureAttemptsRef = useRef<Record<LockedFeature, number>>({
    context: 0,
    voice: 0,
  });

  // Chart-derived data for the hero information system.
  const [natal, setNatal] = useState<Placement[]>([]);
  const [transits, setTransits] = useState<Placement[]>([]);
  const [moonPhase, setMoonPhase] = useState<MoonPhaseData | null>(null);

  // The hero is informational only now — no user-facing toggle.
  // Ask Anything temporarily replaces it with a listening state.
  const [heroCompositionScale, setHeroCompositionScale] = useState(1);
  const heroStageRef = useRef<HTMLDivElement | null>(null);
  const [heroSweepActive, setHeroSweepActive] = useState(false);
  const heroWasActiveRef = useRef(false);
  const previousSelectedAreaRef = useRef<string | null>(null);

  // Ask Anything live-listening state.
  const [micEnabled, setMicEnabled] = useState(false);
  const [micConnecting, setMicConnecting] = useState(false);
  const [askHolding, setAskHolding] = useState(false);
  const askHoldingRef = useRef(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [isTranscribingAsk, setIsTranscribingAsk] = useState(false);
  const [voiceJourneyActive, setVoiceJourneyActive] = useState(false);
  const [voiceNavigating, setVoiceNavigating] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const askHoldStartRef = useRef(0);
  const askPointerStartYRef = useRef(0);
  const askCancelledRef = useRef(false);
  const meterStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Premium voice transcript reveal.
  const [voiceTranscript, setVoiceTranscript] =
    useState("");

  const [voiceTranscriptPreview, setVoiceTranscriptPreview] =
    useState("");

  const transcriptTimersRef =
    useRef<number[]>([]);

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

  const handleLockedFeature = useCallback(
    (feature: LockedFeature) => {
      const nextAttempt =
        lockedFeatureAttemptsRef.current[feature] + 1;

      lockedFeatureAttemptsRef.current[feature] =
        nextAttempt;

      // First + second attempt:
      // quietly explain where access comes from.
      if (nextAttempt < 3) {
        setLockedFeaturePrompt(feature);

        window.setTimeout(() => {
          setLockedFeaturePrompt((current) =>
            current === feature ? null : current
          );
        }, 3200);

        return;
      }

      // Third attempt:
      // send them to Credits with the requested
      // product/membership intent preserved.
      lockedFeatureAttemptsRef.current[feature] = 0;
      setLockedFeaturePrompt(null);

      onOpenCredits?.(feature);
    },
    [onOpenCredits]
  );

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
        jxlCredits: Number(data.jxlCredits ?? 0),

        isSubscribed: data.isSubscribed === true,

        effectiveMembershipPlan:
          data.effectiveMembershipPlan === "plus" ||
          data.effectiveMembershipPlan === "plus_xl"
            ? data.effectiveMembershipPlan
            : null,

        membershipJxlUsed:
          Number(data.membershipJxlUsed ?? 0),

        membershipEntitlements:
          data.membershipEntitlements ?? null,
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

  // ── Access flags derived from the expanded userStatus ─────────────────────

  const canUseAddContext =
    userStatus?.membershipEntitlements?.addContext === true;

  const jxlAllowance =
    userStatus?.membershipEntitlements?.jxlPerMonth ?? null;

  const hasIncludedVoiceReading =
    userStatus?.isSubscribed === true &&
    (
      jxlAllowance === null ||
      Number(userStatus?.membershipJxlUsed ?? 0) < jxlAllowance
    );

  const hasPurchasedVoiceReading =
    Number(userStatus?.jxlCredits ?? 0) > 0;

  const hasVoiceReadingAccess =
    hasIncludedVoiceReading ||
    hasPurchasedVoiceReading;

  /* ── Hero information — Brand + Big Three + current sky context ─── */
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

    return {
      personal: [
        { role: "Sun", sign: natalSun?.sign ?? "—", degree: natalSun?.degree, house: natalSun?.house },
        { role: "Moon", sign: natalMoon?.sign ?? "—", degree: natalMoon?.degree, house: natalMoon?.house },
        { role: "Rising", sign: natalRising?.sign ?? "—", degree: natalRising?.degree, house: natalRising?.house },
      ],
      currentSun,
      currentMoon,
    };
  }, [natal, transits]);

  const stopAskRecorder = useCallback((discard = false) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    if (discard) askCancelledRef.current = true;

    try {
      if (recorder.state !== "inactive") recorder.stop();
    } catch {
      // already stopped
    }
  }, []);

  const stopAskMeter = useCallback(() => {
    if (meterRafRef.current != null) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    try {
      analyserRef.current?.disconnect();
    } catch {}
    analyserRef.current = null;

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    for (const canvas of [canvasRef.current]) {
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, []);

  const disconnectMicrophone = useCallback(() => {
    stopAskRecorder(true);
    stopAskMeter();

    if (meterStreamRef.current) {
      meterStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      meterStreamRef.current = null;
    }

    askHoldingRef.current = false;
    setAskHolding(false);
    setMicEnabled(false);
    setMicConnecting(false);
  }, [stopAskMeter, stopAskRecorder]);

  const enableMicrophone = useCallback(async () => {
    if (micEnabled || micConnecting) return;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setAskError("Microphone access isn't available in this browser.");
      return;
    }

    setMicConnecting(true);
    setAskError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      if (!stream.getAudioTracks().some((track) => track.readyState === "live")) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("Microphone stream is not live.");
      }

      meterStreamRef.current?.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });

      meterStreamRef.current = stream;

      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (meterStreamRef.current === stream) {
            meterStreamRef.current = null;
            stopAskRecorder(true);
            stopAskMeter();
            askHoldingRef.current = false;
            setAskHolding(false);
            setMicEnabled(false);
          }
        };
      });

      setMicEnabled(true);
    } catch {
      setAskError("Microphone access was not enabled.");
      setMicEnabled(false);
    } finally {
      setMicConnecting(false);
    }
  }, [micConnecting, micEnabled, stopAskMeter, stopAskRecorder]);

  const toggleMicrophone = useCallback(() => {
    if (micEnabled) {
      disconnectMicrophone();
      return;
    }
    void enableMicrophone();
  }, [disconnectMicrophone, enableMicrophone, micEnabled]);

  const startAskMeter = useCallback(async () => {
    const stream = meterStreamRef.current;
    if (!stream || !micEnabled) return;

    const hasLiveAudio = stream
      .getAudioTracks()
      .some((track) => track.readyState === "live" && track.enabled);

    if (!hasLiveAudio || !askHoldingRef.current) return;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.66;
      source.connect(analyser);
      analyserRef.current = analyser;

      const freq = new Uint8Array(analyser.frequencyBinCount);
      let smooth = 0;
      let time = 0;

      const drawWave = (canvas: HTMLCanvasElement | null) => {
        if (!canvas) return;

        const c2d = canvas.getContext("2d");
        if (!c2d) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const r = canvas.getBoundingClientRect();
        const cw = r.width;
        const ch = r.height;
        if (!cw || !ch) return;

        const targetWidth = Math.round(cw * dpr);
        const targetHeight = Math.round(ch * dpr);
        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
          canvas.width = targetWidth;
          canvas.height = targetHeight;
        }

        c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        c2d.clearRect(0, 0, cw, ch);

        const cy = ch / 2;
        const grad = c2d.createLinearGradient(0, 0, cw, 0);
        ASK_WAVE.colors.forEach((color, i) =>
          grad.addColorStop(i / (ASK_WAVE.colors.length - 1), color)
        );

        c2d.lineCap = "round";
        c2d.lineJoin = "round";
        c2d.globalCompositeOperation = "lighter";

        const speakingBoost = 1 + smooth * 0.95;
        const amp =
          (ASK_WAVE.idle + smooth * ASK_WAVE.sensitivity) *
          (ch * 0.42) *
          speakingBoost;

        for (let line = 0; line < ASK_WAVE.lines; line++) {
          const lf = ASK_WAVE.lines > 1 ? line / (ASK_WAVE.lines - 1) : 0;
          const phase = time * (1 + lf * 0.45) + line * 0.7;
          const lineAmp = amp * (1 - lf * 0.14);

          c2d.beginPath();
          for (let x = 0; x <= cw; x += 3) {
            const tx = x / cw;
            const env = Math.pow(Math.sin(tx * Math.PI), 0.85);
            const y =
              cy +
              env *
                lineAmp *
                (Math.sin(tx * Math.PI * 4 + phase) * 0.6 +
                  Math.sin(tx * Math.PI * 7 - phase * 0.7 + line) * 0.4);
            x === 0 ? c2d.moveTo(x, y) : c2d.lineTo(x, y);
          }

          c2d.strokeStyle = grad;
          c2d.globalAlpha = 0.16 + (1 - lf) * 0.22;
          c2d.lineWidth = ASK_WAVE.thickness * (0.7 + (1 - lf) * 0.8);
          c2d.shadowBlur = ASK_WAVE.glow;
          c2d.shadowColor = "rgba(129,140,248,0.5)";
          c2d.stroke();
        }

        const coreBoost = 1 + smooth * 0.8;
        const coreAmp =
          (ASK_WAVE.idle * 0.5 + smooth * ASK_WAVE.sensitivity * 1.15) *
          (ch * 0.42) *
          coreBoost;
        c2d.beginPath();
        for (let x = 0; x <= cw; x += 2) {
          const tx = x / cw;
          const env = Math.pow(Math.sin(tx * Math.PI), 0.9);
          const y =
            cy +
            env *
              coreAmp *
              Math.sin(tx * Math.PI * 5 + time * 1.4) *
              0.9;
          x === 0 ? c2d.moveTo(x, y) : c2d.lineTo(x, y);
        }

        c2d.globalAlpha = 0.3 + smooth * 0.5;
        c2d.strokeStyle = "rgba(255,255,255,0.92)";
        c2d.lineWidth = Math.max(1, ASK_WAVE.thickness * 0.6);
        c2d.shadowBlur = ASK_WAVE.glow * 1.3;
        c2d.shadowColor = "rgba(255,255,255,0.7)";
        c2d.stroke();

        c2d.globalCompositeOperation = "source-over";
        c2d.globalAlpha = 1;
        c2d.shadowBlur = 0;
      };

      const draw = () => {
        if (!askHoldingRef.current) return;

        time += 0.016 * ASK_WAVE.speed;
        analyser.getByteFrequencyData(freq);

        let sum = 0;
        let count = 0;
        const lo = 2;
        const hi = Math.max(lo + 1, Math.floor(freq.length * 0.5));
        for (let i = lo; i < hi; i++) {
          sum += freq[i];
          count++;
        }

        const energy = count ? (sum / count) / 255 : 0;
        smooth += (energy - smooth) * 0.26;

        drawWave(canvasRef.current);

        meterRafRef.current = requestAnimationFrame(draw);
      };

      draw();
    } catch {
      stopAskMeter();
    }
  }, [micEnabled, stopAskMeter]);

  const submitAskAnything = useCallback(
    (transcript: string) => {
      const spokenQuestion = transcript.trim();

      if (spokenQuestion.length < 2) {
        setAskError("We didn't catch that. Hold the button and try again.");
        return;
      }

      clearIntake();
      clearReading();
      localStorage.removeItem("dfp_followup_return");
      localStorage.removeItem("dfp_followup_question");

      saveIntake({
        topic: "ask-anything",
        area: "ask-anything",
        question: spokenQuestion,
        timeframeType: "month",
        timeframeValue: "next-45-days",
      });

      setVoiceNavigating(true);

      // Keep the voice experience on screen long enough to hand off cleanly.
      // The full-screen black veil prevents the intake UI from flashing back
      // before the Preparing route mounts.
      window.setTimeout(() => {
        router.push("/reading/preparing?source=voice");
      }, shouldReduceMotion ? 80 : 520);
    },
    [router, shouldReduceMotion]
  );

  const revealVoiceTranscript = useCallback(
    (transcript: string) => {
      const clean = transcript.trim();

      setVoiceTranscript(clean);
      setVoiceTranscriptPreview("");

      transcriptTimersRef.current.forEach(
        window.clearTimeout
      );

      transcriptTimersRef.current = [];

      if (shouldReduceMotion) {
        setVoiceTranscriptPreview(clean);

        const timer = window.setTimeout(() => {
          submitAskAnything(clean);
        }, 450);

        transcriptTimersRef.current.push(timer);
        return;
      }

      const words = clean.split(/\s+/);

      // Reveal the finished Whisper transcript in small groups so it
      // feels alive without pretending we're doing streaming STT.
      const groups: string[] = [];

      for (let i = 0; i < words.length; i += 3) {
        groups.push(
          words.slice(0, i + 3).join(" ")
        );
      }

      const totalRevealMs = 900;

      groups.forEach((value, index) => {
        const delay =
          groups.length <= 1
            ? 0
            : Math.round(
                (index / (groups.length - 1)) *
                totalRevealMs
              );

        const timer = window.setTimeout(() => {
          setVoiceTranscriptPreview(value);
        }, delay);

        transcriptTimersRef.current.push(timer);
      });

      const submitTimer = window.setTimeout(() => {
        submitAskAnything(clean);
      }, totalRevealMs + 900);

      transcriptTimersRef.current.push(
        submitTimer
      );
    },
    [shouldReduceMotion, submitAskAnything]
  );

  const transcribeAskAudio = useCallback(
    async (blob: Blob) => {
      if (blob.size === 0) {
        setAskError("We didn't catch that. Hold the button and try again.");
        return;
      }

      setIsTranscribingAsk(true);
      setAskError(null);

      try {
        const form = new FormData();
        form.append("audio", blob, "speech");

        const response = await fetch("/api/jxl/transcribe", {
          method: "POST",
          body: form,
        });

        const data = await response.json();

        if (!response.ok || typeof data?.text !== "string" || !data.text.trim()) {
          setAskError(data?.error || "Couldn't hear that clearly. Try again.");
          return;
        }

        revealVoiceTranscript(data.text);
      } catch {
        setVoiceJourneyActive(false);
        setVoiceNavigating(false);
        setAskError("Something went wrong with voice input. Try again.");
      } finally {
        setIsTranscribingAsk(false);
      }
    },
    [revealVoiceTranscript]
  );

  const startAskHold = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);

      if (!hasVoiceReadingAccess) {
        handleLockedFeature("voice");
        return;
      }

      if (!micEnabled || isTranscribingAsk) return;

      const stream = meterStreamRef.current;
      if (!stream) {
        setAskError("Microphone access isn't available right now.");
        return;
      }

      if (typeof MediaRecorder === "undefined") {
        setAskError("Voice recording isn't available in this browser yet.");
        return;
      }

      setAskError(null);
      setVoiceJourneyActive(true);
      setVoiceNavigating(false);
      askPointerStartYRef.current = e.clientY;
      askCancelledRef.current = false;
      audioChunksRef.current = [];

      // Clear any previous transcript reveal for the new recording.
      setVoiceTranscript("");
      setVoiceTranscriptPreview("");

      transcriptTimersRef.current.forEach(
        window.clearTimeout
      );

      transcriptTimersRef.current = [];

      const preferredType = [
        "audio/mp4",
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));

      let recorder: MediaRecorder;
      try {
        recorder = preferredType
          ? new MediaRecorder(stream, { mimeType: preferredType })
          : new MediaRecorder(stream);
      } catch {
        setAskError("Voice recording couldn't start. Try again.");
        return;
      }

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        askCancelledRef.current = true;
        askHoldingRef.current = false;
        setAskHolding(false);
        setVoiceJourneyActive(false);
        setVoiceNavigating(false);
        stopAskMeter();
        setAskError("Voice recording was interrupted. Try again.");
      };

      recorder.onstop = () => {
        mediaRecorderRef.current = null;

        const cancelled = askCancelledRef.current;
        askCancelledRef.current = false;

        const mimeType =
          recorder.mimeType ||
          (audioChunksRef.current[0] instanceof Blob
            ? (audioChunksRef.current[0] as Blob).type
            : "") ||
          "audio/webm";

        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];

        if (cancelled) return;
        void transcribeAskAudio(blob);
      };

      askHoldStartRef.current = Date.now();
      askHoldingRef.current = true;
      setAskHolding(true);
      triggerIntakeHaptic();

      try {
        recorder.start(250);
      } catch {
        askHoldingRef.current = false;
        setAskHolding(false);
        setVoiceJourneyActive(false);
        setVoiceNavigating(false);
        mediaRecorderRef.current = null;
        setAskError("Voice recording couldn't start. Try again.");
        return;
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void startAskMeter();
        });
      });
    },
    [
      handleLockedFeature,
      hasVoiceReadingAccess,
      isTranscribingAsk,
      micEnabled,
      startAskMeter,
      stopAskMeter,
      transcribeAskAudio,
    ]
  );

  const cancelAskHold = useCallback(() => {
    if (!askHoldingRef.current) return;

    askCancelledRef.current = true;
    askHoldingRef.current = false;
    setAskHolding(false);
    setVoiceJourneyActive(false);
    setVoiceNavigating(false);
    setAskError(null);

    stopAskMeter();
    stopAskRecorder(true);
    triggerIntakeHaptic();
  }, [stopAskMeter, stopAskRecorder]);

  const moveAskHold = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!askHoldingRef.current || askCancelledRef.current) return;

      const upwardDistance = askPointerStartYRef.current - e.clientY;
      if (upwardDistance >= 56) {
        cancelAskHold();
      }
    },
    [cancelAskHold]
  );

  const endAskHold = useCallback(() => {
    if (askCancelledRef.current || !askHoldingRef.current) return;

    const elapsed = Date.now() - askHoldStartRef.current;

    askHoldingRef.current = false;
    setAskHolding(false);
    triggerIntakeHaptic();
    stopAskMeter();

    if (elapsed < ASK_MIN_HOLD_MS) {
      askCancelledRef.current = true;
      setVoiceJourneyActive(false);
      setVoiceNavigating(false);
      stopAskRecorder(true);
      setAskError("Press and hold while you speak.");
      return;
    }

    stopAskRecorder(false);
  }, [stopAskMeter, stopAskRecorder]);

  useEffect(() => {
    return () => {
      transcriptTimersRef.current.forEach(
        window.clearTimeout
      );
    };
  }, []);

  useEffect(() => {
    const shutMicDownForPageExit = () => {
      if (document.visibilityState === "hidden") {
        disconnectMicrophone();
      }
    };

    const handlePageHide = () => {
      disconnectMicrophone();
    };

    document.addEventListener("visibilitychange", shutMicDownForPageExit);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", shutMicDownForPageExit);
      window.removeEventListener("pagehide", handlePageHide);
      disconnectMicrophone();
    };
  }, [disconnectMicrophone]);

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
            jxlCredits: Number(d.jxlCredits ?? 0),

            isSubscribed: d.isSubscribed === true,

            effectiveMembershipPlan:
              d.effectiveMembershipPlan === "plus" ||
              d.effectiveMembershipPlan === "plus_xl"
                ? d.effectiveMembershipPlan
                : null,

            membershipJxlUsed:
              Number(d.membershipJxlUsed ?? 0),

            membershipEntitlements:
              d.membershipEntitlements ?? null,
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
        setCheckoutIntent("reading");
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

  // The pager owns the viewport and vertical scrolling. Do not lock <html> or
  // <body> here: on iOS Safari that can freeze a stale visual viewport height
  // until the user performs a pull/bounce gesture. Hide only the pager panel's
  // scrollbar and let Safari continue updating the viewport normally.
  const intakeRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = intakeRootRef.current;
    if (!root) return;

    const panel = root.closest<HTMLElement>("[data-pager-panel]");
    if (!panel) return;

    panel.classList.add("astro-intake-panel-no-scrollbar");

    // A tiny reflow on the owning panel ensures its percentage height is
    // resolved against the pager's current viewport on first paint.
    panel.style.minHeight = "100%";
    void panel.offsetHeight;

    return () => {
      panel.classList.remove("astro-intake-panel-no-scrollbar");
      panel.style.minHeight = "";
    };
  }, []);

  const voiceVisualActive = voiceJourneyActive || askHolding || isTranscribingAsk || voiceNavigating;

  return (
      <div
      ref={intakeRootRef}
      className="relative h-full min-h-full w-full min-w-0 max-w-full overflow-x-hidden bg-transparent text-slate-100"
      style={{
        height: "100%",
        minHeight: "100%",
        background: "transparent",
      }}
    >
      <style jsx>{`
        :global(.astro-intake-panel-no-scrollbar) { -ms-overflow-style: none; scrollbar-width: none; }
        :global(.astro-intake-panel-no-scrollbar::-webkit-scrollbar) { display: none !important; width: 0 !important; height: 0 !important; }
        .tap-fix { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }

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

        /* ── ASK ANYTHING — premium voice control, borrowing the Your Readings visual language ── */
        @property --voice-angle {
          syntax: "<angle>";
          inherits: false;
          initial-value: 0deg;
        }

        @keyframes voiceOrbit {
          to { --voice-angle: 360deg; }
        }

        @keyframes askMicBreathe {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 12px rgba(218,183,104,0.12), 0 0 22px rgba(255,255,255,0.06);
          }
          50% {
            transform: scale(1.035);
            box-shadow: 0 0 18px rgba(218,183,104,0.18), 0 0 28px rgba(255,255,255,0.08);
          }
        }

        .ask-premium {
          position: relative;
          overflow: hidden;
          user-select: none;
          -webkit-user-select: none;
          -webkit-touch-callout: none;
          isolation: isolate;
          border: 0;
          border-radius: 24px;
          background:
            radial-gradient(circle at 50% -70%, rgba(255,255,255,0.11), transparent 66%),
            linear-gradient(145deg, rgba(19,18,24,0.96), rgba(7,10,21,0.97));
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.08),
            0 0 22px rgba(203,164,78,0.12),
            0 16px 38px rgba(0,0,0,0.46);
        }

        .ask-premium::before,
        .ask-premium::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          padding: 1.25px;
          background:
            conic-gradient(
              from var(--voice-angle),
              rgba(255,255,255,0.94) 0deg,
              rgba(255,255,255,0.74) 54deg,
              rgba(218,183,104,0.88) 112deg,
              rgba(255,239,195,0.82) 172deg,
              rgba(255,255,255,0.96) 226deg,
              rgba(193,151,67,0.86) 296deg,
              rgba(255,255,255,0.94) 360deg
            );
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          animation: voiceOrbit 8s linear infinite;
        }

        .ask-premium::before {
          z-index: 0;
          opacity: 0.82;
        }

        .ask-premium::after {
          inset: -1px;
          z-index: -1;
          padding: 2px;
          opacity: 0.52;
          filter: blur(8px);
        }

        .ask-premium:hover,
        .ask-premium:focus-visible {
          transform: translateY(-1px);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.11),
            0 0 28px rgba(203,164,78,0.18),
            0 18px 42px rgba(0,0,0,0.50);
          outline: none;
        }

        .ask-premium:active {
          transform: translateY(0);
        }

        .ask-premium > * { position: relative; z-index: 2; }

        .ask-mic-halo {
          display: flex;
          height: 42px;
          width: 42px;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          border: 1px solid rgba(255,255,255,0.22);
          background:
            radial-gradient(circle at 50% 35%, rgba(255,255,255,0.055), transparent 56%),
            linear-gradient(145deg, rgba(15,16,23,0.98), rgba(7,9,18,0.99));
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.07),
            0 0 14px rgba(218,183,104,0.12);
          animation: askMicBreathe 3.4s ease-in-out infinite;
        }

        .mic-ready-toggle {
          position: relative;
          width: 34px;
          height: 66px;
          border-radius: 9999px;
          border: 1px solid rgba(203,213,225,0.14);
          background:
            radial-gradient(circle at 50% 12%, rgba(255,255,255,0.055), transparent 42%),
            linear-gradient(180deg, rgba(15,19,34,0.94), rgba(5,8,19,0.98));
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.055),
            0 12px 28px rgba(0,0,0,0.38);
          transition:
            opacity 520ms cubic-bezier(0.22,1,0.36,1),
            border-color 420ms cubic-bezier(0.22,1,0.36,1),
            box-shadow 420ms cubic-bezier(0.22,1,0.36,1),
            filter 420ms cubic-bezier(0.22,1,0.36,1);
        }

        .mic-ready-toggle[data-enabled="true"] {
          border-color: rgba(165,180,252,0.16);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.035),
            0 0 10px rgba(99,102,241,0.05),
            0 10px 22px rgba(0,0,0,0.24);
        }

        .mic-ready-toggle[data-enabled="true"]:hover,
        .mic-ready-toggle[data-enabled="true"]:focus-visible {
          opacity: 0.44 !important;
          filter: brightness(0.9) saturate(0.65) !important;
        }

        .mic-ready-knob {
          position: absolute;
          left: 50%;
          width: 20px;
          height: 20px;
          border-radius: 9999px;
          transform: translateX(-50%);
          background: linear-gradient(145deg, rgba(226,232,240,0.96), rgba(148,163,184,0.88));
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.62),
            0 0 0 1px rgba(255,255,255,0.08),
            0 3px 9px rgba(0,0,0,0.46);
          transition:
            top 420ms cubic-bezier(0.22,1,0.36,1),
            background 420ms cubic-bezier(0.22,1,0.36,1),
            box-shadow 420ms cubic-bezier(0.22,1,0.36,1);
        }

        .mic-ready-toggle[data-enabled="false"] .mic-ready-knob {
          top: 39px;
        }

        .mic-ready-toggle[data-enabled="true"] .mic-ready-knob {
          top: 7px;
          background: linear-gradient(145deg, rgba(255,246,218,0.98), rgba(218,183,104,0.92));
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.72),
            0 0 0 1px rgba(255,239,195,0.14),
            0 0 14px rgba(218,183,104,0.24),
            0 3px 9px rgba(0,0,0,0.42);
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-shine::after,
          .ask-premium::before,
          .ask-premium::after,
          .ask-mic-halo { animation: none !important; }
          .mic-ready-toggle,
          .mic-ready-knob { transition: none !important; }
        }
      `}</style>

      {/* Match the Birth Chart focus depth: selected readings sit against a
          near-black sky while the active card and controls remain above it. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[5] bg-black"
        initial={false}
        animate={{ opacity: selectedArea ? 0.48 : 0 }}
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
          {/* ── HERO — locked at exactly 236px for every state ── */}
          <section className="mb-[14px] pt-0">
            <div
              className={`hero-glow-shell ${selectedArea && !voiceVisualActive ? "hero-glow-shell-focus" : ""}`}
              style={{
                "--hero-c1-color": `rgb(${heroPalette[0]})`,
                "--hero-c2-color": `rgb(${heroPalette[1]})`,
                "--hero-c3-color": `rgb(${heroPalette[2]})`,
                "--hero-c4-color": `rgb(${heroPalette[3]})`,
              } as React.CSSProperties}
            >
              <div
                ref={heroStageRef}
                className={`hero-shine ${heroSweepActive ? "hero-shine-sweep" : ""} relative h-[236px] select-none overflow-hidden rounded-[28px] border border-white/[0.08] bg-white/[0.03] text-center transition-[opacity,filter] ease-[cubic-bezier(0.22,1,0.36,1)]`}
                onContextMenu={(e) => e.preventDefault()}
                aria-label={
                  voiceVisualActive
                    ? "Ask Anything voice flow is active"
                    : "Personalized astrological predictions"
                }
                style={{
                  cursor: "default",
                  opacity: voiceVisualActive ? 1 : selectedArea ? 0.68 : 1,
                  filter: voiceVisualActive
                    ? "brightness(1) saturate(1)"
                    : selectedArea
                      ? "grayscale(0.72) brightness(0.56) saturate(0.42)"
                      : "grayscale(0) brightness(1) saturate(1)",
                  transitionDuration: voiceVisualActive || selectedArea ? "700ms" : "350ms",
                }}
              >
                {/* One master canvas: every hero uses the exact same 374 × 236 composition. */}
                <div
                  className="absolute left-1/2 top-1/2 z-10 h-[236px] w-[374px]"
                  style={{
                    transform: `translate(-50%, -50%) scale(${heroCompositionScale})`,
                    transformOrigin: "center center",
                  }}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={voiceVisualActive ? "listening" : "brand"}
                      initial={
                        shouldReduceMotion
                          ? { opacity: 0 }
                          : { opacity: 0, y: 5, filter: "blur(3px)" }
                      }
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={
                        shouldReduceMotion
                          ? { opacity: 0 }
                          : { opacity: 0, y: -4, filter: "blur(3px)" }
                      }
                      transition={{
                        duration: shouldReduceMotion ? 0.12 : 0.34,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="absolute inset-0"
                    >
                      {voiceVisualActive ? (
                        /* HERO — waveform-only listening state */
                        <div className="absolute inset-0 flex items-center justify-center px-[30px]">
                          <canvas
                            ref={canvasRef}
                            aria-hidden="true"
                            className="h-[122px] w-[330px] max-w-full"
                            style={{ opacity: askHolding ? 1 : 0.42 }}
                          />
                          {!askHolding && (isTranscribingAsk || voiceNavigating) ? (
                            <motion.p
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="absolute bottom-[31px] left-0 right-0 text-[9px] font-medium uppercase tracking-[0.2em] text-slate-300/72"
                            >
                              {voiceNavigating ? "Opening your reading…" : "Understanding your question…"}
                            </motion.p>
                          ) : null}
                        </div>
                      ) : (
                        /* HERO — brand identity + Big Three + current sky context */
                        <div className="absolute inset-0 flex flex-col items-center px-[18px] pt-[15px] pb-[10px] text-center">

                          {/* Brand block — shifted down about 2px */}
                          <p
                            className="text-[22px] font-normal leading-none tracking-[0.015em] text-slate-100/88"
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
                            className="mt-[1px] whitespace-nowrap text-[39px] font-semibold leading-[0.98] tracking-[-0.048em] text-white"
                            style={{
                              transform: "scaleY(1.045)",
                              transformOrigin: "center bottom",
                              textShadow:
                                "0 5px 6px rgba(0,0,0,0.94), 0 13px 24px rgba(0,0,0,0.78), 0 0 26px rgba(148,163,184,0.17)",
                            }}
                          >
                            Astrological Predictions
                          </h1>

                          <p
                            className="mt-[6px] whitespace-nowrap text-[8px] font-medium uppercase tracking-[0.22em] text-slate-300/52"
                            style={{
                              textShadow:
                                "0 2px 10px rgba(0,0,0,0.72)",
                            }}
                          >
                            <span className="text-indigo-200/72">
                              AstroProXL
                            </span>

                            <span className="mx-2 text-slate-500/70">
                              |
                            </span>

                            <span>The Astrology Engine</span>
                          </p>

                          {/* Divider moved BELOW AstroProXL / The Astrology Engine */}
                          <span
                            className="mt-[7px] h-px w-[82px]"
                            style={{
                              background:
                                "linear-gradient(90deg, transparent, rgba(203,213,225,0.42), transparent)",
                            }}
                            aria-hidden="true"
                          />

                          {/* Big Three — slightly larger */}
                          <div className="mt-[11px] grid w-full grid-cols-3 gap-[10px] px-[8px]">
                            {heroData.personal.map((item) => (
                              <div
                                key={`brand-${item.role}`}
                                className="flex min-w-0 flex-col items-center text-center"
                              >
                                <span className="text-[8px] font-semibold uppercase tracking-[0.15em] text-slate-400/66">
                                  {item.role}
                                </span>

                                <span
                                  className="mt-[4px] max-w-full truncate text-[18px] font-medium leading-none"
                                  style={{
                                    color: signAccentColor(item.sign),
                                    textShadow: `0 0 12px ${signAccentGlow(
                                      item.sign
                                    )}`,
                                  }}
                                >
                                  {item.sign}
                                </span>

                                <span className="mt-[4px] text-[9px] font-medium tabular-nums text-slate-300/70">
                                  {item.degree ?? "—"}
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Current-sky context moved from old second hero */}
                          <div className="absolute inset-x-[22px] bottom-[9px] flex flex-col items-center text-center">
                            <span
                              className="mb-[6px] h-px w-[56px]"
                              style={{
                                background:
                                  "linear-gradient(90deg, transparent, rgba(34,211,238,0.62), transparent)",
                                boxShadow:
                                  "0 0 7px rgba(34,211,238,0.10)",
                              }}
                              aria-hidden="true"
                            />

                            <span className="max-w-full truncate text-[10px] font-medium leading-[1.3] tracking-[0.01em] text-slate-200/86">
                              Sun in {heroData.currentSun?.sign ?? "—"} · Moon in{" "}
                              {moonPhase?.moonSign ??
                                heroData.currentMoon?.sign ??
                                "—"}{" "}
                              · {moonPhase?.phaseName ?? "Moon"}
                            </span>

                            <span className="mt-[3px] max-w-full truncate text-[10px] font-medium leading-[1.3] tracking-[0.01em] text-sky-100/82">
                              {moonPhase?.nextEventName === "Full Moon" &&
                              typeof moonPhase.daysUntilNextEvent === "number"
                                ? moonPhase.daysUntilNextEvent === 0
                                  ? "Full Moon today"
                                  : `Full Moon in ${moonPhase.daysUntilNextEvent} day${
                                      moonPhase.daysUntilNextEvent === 1 ? "" : "s"
                                    }`
                                : "Full Moon timing updating"}
                            </span>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </section>

          {/* ── Voice transcript preview — appears above the reading-choice
              cards during Ask Anything reveal. Kept separate from the hero so
              the waveform inside the hero remains untouched. ── */}
          <AnimatePresence>
            {voiceVisualActive &&
              voiceTranscriptPreview && (
                <motion.div
                  key="voice-transcript"
                  initial={{
                    opacity: 0,
                    y: 8,
                    filter: "blur(4px)",
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    filter: "blur(0px)",
                  }}
                  exit={{
                    opacity: 0,
                    y: -10,
                    filter: "blur(5px)",
                  }}
                  transition={{
                    duration: shouldReduceMotion
                      ? 0.08
                      : 0.38,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="pointer-events-none relative z-20 mx-auto mb-3 mt-1 w-[88%] max-w-[360px] text-center"
                >
                  <div
                    className="mx-auto max-h-[72px] overflow-hidden px-3"
                    style={{
                      WebkitMaskImage:
                        "linear-gradient(to bottom, transparent 0%, black 18%, black 88%, transparent 100%)",
                      maskImage:
                        "linear-gradient(to bottom, transparent 0%, black 18%, black 88%, transparent 100%)",
                    }}
                  >
                    <motion.p
                      key={voiceTranscriptPreview}
                      initial={{
                        opacity: 0.38,
                        y: 5,
                      }}
                      animate={{
                        opacity: 0.94,
                        y: 0,
                      }}
                      transition={{
                        duration: shouldReduceMotion
                          ? 0
                          : 0.22,
                      }}
                      className="line-clamp-3 text-[15px] font-normal leading-[1.55] tracking-[0.01em] text-slate-100/90"
                      style={{
                        fontFamily:
                          'var(--font-display, Georgia, "Times New Roman", serif)',
                        textShadow:
                          "0 2px 14px rgba(0,0,0,0.95), 0 0 18px rgba(199,210,254,0.08)",
                      }}
                    >
                      {voiceTranscriptPreview}
                    </motion.p>
                  </div>

                  <motion.div
                    aria-hidden="true"
                    animate={{
                      opacity: [0.22, 0.52, 0.22],
                    }}
                    transition={{
                      duration: 1.8,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="mx-auto mt-2 h-px w-12"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, rgba(226,232,240,0.52), transparent)",
                    }}
                  />
                </motion.div>
              )}
          </AnimatePresence>

          {/* ── Dynamic reading header ──
              The heading keeps one visual treatment; selection only changes the word. */}
          <div
            className="relative mb-[14px] h-[26px] overflow-hidden text-center"
            aria-live="polite"
          >
            <p
              className="absolute inset-x-0 top-0 flex h-[26px] items-center justify-center text-[14px] font-semibold uppercase leading-[20px] tracking-[0.245em] text-slate-100 transition-[opacity,filter] duration-500 sm:text-[14.5px]"
              style={{
                opacity: voiceVisualActive ? 0 : 1,
                filter: voiceVisualActive ? "blur(4px)" : "blur(0px)",
                textShadow:
                  "0 4px 5px rgba(0,0,0,0.98), 0 9px 18px rgba(0,0,0,0.78), 0 0 18px rgba(148,163,184,0.22)",
              }}
            >
              {selectedAreaConfig ? selectedAreaConfig.title : "Select A Reading"}
            </p>
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
                    opacity: voiceVisualActive ? 0 : selectedArea && !isSelected ? 0.74 : 1,
                    filter: askHolding
                      ? "blur(4px) brightness(0.18)"
                      : selectedArea && !isSelected
                        ? "grayscale(0.70) brightness(0.54) saturate(0.45)"
                        : "brightness(1) saturate(1)",
                    transitionDuration: selectedArea || voiceVisualActive ? "700ms" : "350ms",
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
              opacity: voiceVisualActive ? 0 : 1,
              filter: voiceVisualActive ? "blur(4px) brightness(0.18)" : "brightness(1) saturate(1)",
              pointerEvents: voiceVisualActive ? "none" : "auto",
              transitionDuration: selectedArea || voiceVisualActive ? "700ms" : "350ms",
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
                  {!canUseAddContext && lockedFeaturePrompt === "context"
                    ? "Become a Member"
                    : "Add Context (Optional)"}
                </div>
              )}

              {!canUseAddContext && (
                <button
                  type="button"
                  className="absolute inset-0 z-20 rounded-[20px]"
                  aria-label="Add Context is included with Astro Plus"
                  onClick={() => handleLockedFeature("context")}
                  style={{
                    background: "transparent",
                  }}
                />
              )}

              <Textarea
                id="question"
                rows={2}
                value={question}
                disabled={!canUseAddContext}
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
              opacity: voiceVisualActive ? 0 : 1,
              filter: voiceVisualActive ? "blur(4px) brightness(0.18)" : "brightness(1) saturate(1)",
              pointerEvents: voiceVisualActive ? "none" : "auto",
              transitionDuration: voiceVisualActive ? "700ms" : "350ms",
            }}
          >
            {submitError && <p className="mb-2 text-center text-xs text-red-300">{submitError}</p>}
            <Button
              type="button"
              data-begin-reading="true"
              onClick={handleStartReading}
              disabled={!canSubmit || isCreatingReading}
              className="standard-shadow relative h-12 w-[calc(50%_-_6px)] overflow-hidden rounded-[20px] text-[14px] font-medium transition-[border-color,color,opacity,transform,box-shadow] duration-500 ease-out hover:-translate-y-[1px] hover:opacity-95 active:translate-y-0 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              style={{
                background: "rgba(255,255,255,0.012)",
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
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 transition-opacity duration-500 ease-out"
                style={{
                  background: beginReadingStyle?.background ?? "transparent",
                  opacity: canSubmit && !isCreatingReading && beginReadingStyle ? 1 : 0,
                }}
              />
              <span className="relative z-10">{buttonCopy}</span>
            </Button>
          </div>

          {/* ── ASK ANYTHING — centered premium voice control + subtle mic toggle ── */}
          <section className="mt-3">
  <div className="flex w-full items-center justify-center">
    <div className="relative h-[86px] w-[72%] max-w-[304px]">
      <button
        type="button"
        onPointerDown={startAskHold}
        onPointerMove={moveAskHold}
        onPointerUp={endAskHold}
        onPointerCancel={endAskHold}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        onSelect={(e) => e.preventDefault()}
        className="ask-premium tap-fix relative flex h-[86px] w-full items-center justify-center touch-none select-none transition-[transform,opacity,filter,box-shadow] duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        aria-label="Press and hold to speak. Swipe up to cancel."
        style={{
          opacity: selectedArea && !voiceVisualActive ? 0.76 : 1,
          filter: selectedArea && !voiceVisualActive
            ? "grayscale(0.68) brightness(0.54) saturate(0.46)"
            : "brightness(1) saturate(1)",
          transform: voiceVisualActive ? "scale(1.012)" : undefined,
          WebkitUserSelect: "none",
          userSelect: "none",
          WebkitTouchCallout: "none",
        }}
      >
        <span className="ask-mic-halo h-[48px] w-[48px]">
          <Mic
            className="h-[24px] w-[24px]"
            style={{
              color: "rgba(248,250,252,0.96)",
              filter: "drop-shadow(0 0 6px rgba(218,183,104,0.16))",
            }}
          />
        </span>

        <span
          aria-hidden="true"
          className="ask-focus-veil"
          style={{ opacity: selectedArea && !voiceVisualActive ? 0.48 : 0 }}
        />
      </button>

      <button
  type="button"
  className="mic-ready-toggle tap-fix"
  data-enabled={micEnabled ? "true" : "false"}
  aria-pressed={micEnabled}
  aria-label={micEnabled ? "Turn microphone off" : "Turn microphone on"}
  onClick={toggleMicrophone}
  disabled={micConnecting || isTranscribingAsk}
  style={{
    position: "absolute",
    left: "calc(100% + 6px)",
    top: "8px",
    cursor: micConnecting || isTranscribingAsk ? "wait" : "pointer",
    opacity: micEnabled ? 0.18 : 0.74,
    filter: micEnabled
      ? "grayscale(0.9) brightness(0.72) saturate(0.35)"
      : "brightness(0.92) saturate(0.82)",
  }}
>
  <span className="mic-ready-knob" />
</button>
    </div>
  </div>

  {askError && !voiceVisualActive ? (
    <p className="mt-2 text-center text-[11px] text-slate-400/78">
      {askError}
    </p>
  ) : (
    <p className="mt-2 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400/78">
      {lockedFeaturePrompt === "voice"
        ? "Become a Member"
        : micEnabled
          ? "Press · Hold · Speak"
          : "Turn on the microphone"}
    </p>
  )}
</section>
          </div>

        </motion.div>
      </div>

      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[9998] bg-black"
        initial={false}
        animate={{ opacity: voiceNavigating ? 1 : 0 }}
        transition={{ duration: shouldReduceMotion ? 0.08 : 0.5, ease: [0.22, 1, 0.36, 1] }}
      />

      {/* ── Embedded Stripe checkout (portaled) ── */}
      {clientSecret && typeof document !== "undefined" &&
        createPortal(
          <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(4,6,17,0.85)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "24px 16px calc(24px + env(safe-area-inset-bottom))" }}>
            <div style={{ width: "100%", maxWidth: 480 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setClientSecret(null);
                    setCheckoutIntent(null);
                    setIsCreatingReading(false);
                  }}
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
                      if (checkoutIntent === "reading") {
                        // Normal Reading purchase: wait for the webhook to
                        // grant the reading credit, then continue into the
                        // preparing route.
                        for (let i = 0; i < 10; i++) {
                          try {
                            const res = await fetch(
                              "/api/user/credits",
                              { cache: "no-store" }
                            );

                            const d = await res.json();

                            if (
                              Number(d.credits ?? 0) >= 1 ||
                              d.isSubscribed === true
                            ) {
                              break;
                            }
                          } catch {}

                          await new Promise((r) =>
                            setTimeout(r, 800)
                          );
                        }

                        setClientSecret(null);
                        setCheckoutIntent(null);

                        router.push("/reading/preparing");
                        return;
                      }

                      // Voice purchase or new subscription:
                      // wait briefly for Stripe webhook → refresh status → remain on Intake.
                      for (let i = 0; i < 10; i++) {
                        try {
                          await fetchStatus();

                          if (checkoutIntent === "voice") {
                            const res = await fetch(
                              "/api/user/credits",
                              { cache: "no-store" }
                            );

                            const d = await res.json();

                            if (
                              Number(d.jxlCredits ?? 0) > 0 ||
                              d.isSubscribed === true
                            ) {
                              break;
                            }
                          }

                          if (checkoutIntent === "subscription") {
                            const res = await fetch(
                              "/api/user/credits",
                              { cache: "no-store" }
                            );

                            const d = await res.json();

                            if (d.isSubscribed === true) {
                              break;
                            }
                          }
                        } catch {}

                        await new Promise((r) =>
                          setTimeout(r, 800)
                        );
                      }

                      await fetchStatus();

                      setClientSecret(null);
                      setCheckoutIntent(null);
                      setIsCreatingReading(false);
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