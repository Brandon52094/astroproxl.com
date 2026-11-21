"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
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

/** Crystal ball, drawn to match lucide's 24px stroke icons. */
function CrystalBall({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <circle cx="12" cy="10" r="7" />
      <path d="M8.4 15.9 7 19.5h10l-1.4-3.6" />
      <path d="M5.5 19.5h13" />
      <path d="M8.6 7.6a3.8 3.8 0 0 1 2.4-1.9" />
      <path d="m14 9.2.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5Z" />
    </svg>
  );
}

const AREAS = [
  {
    id: "love",
    title: "Love",
    icon: Heart,
    description: "Relationships, romance, or emotional patterns",
    defaultQuestion: "What is coming for me in love over the next 30–45 days?",
  },
  {
    id: "money",
    title: "Money",
    icon: Wallet,
    description: "Income, stability, opportunities, and financial timing",
    defaultQuestion: "What is coming for me with money over the next 30–45 days?",
  },
  {
    id: "career",
    title: "Career",
    icon: Briefcase,
    description: "Work, recognition, direction, and next steps",
    defaultQuestion: "What is coming for me in my career over the next 30–45 days?",
  },
  {
    id: "other",
    title: "What's Coming",
    icon: CrystalBall,
    description: "What to expect in the next 30–45 days.",
    defaultQuestion: "What is coming for me in the next 30–45 days?",
  },
];

// Rotating line under the hero headline. Every line describes something the
// reading engine actually does, so the claims stay true.
const HERO_TAGLINES = [
  "Built from 20+ layers of your chart.",
  "Real dates, not vague horoscopes.",
  "Every prediction traced to your chart.",
  "Transits, progressions, eclipses & more.",
  "Personalized to your exact birth time.",
];

// Press-and-hold timing (ms). A short grace period keeps ordinary taps from
// darkening the screen; each following second deepens the focus one step.
const HOLD_ARM_MS = 220;
const HOLD_STEP_MS = 1000;
const HOLD_TOTAL_MS = 3000;

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

  // Locked feature soft cue / second-attempt routing.
  const [lockedFeaturePrompt, setLockedFeaturePrompt] =
    useState<LockedFeature | null>(null);

  const lockedFeatureAttemptsRef = useRef<Record<LockedFeature, number>>({
    context: 0,
    voice: 0,
  });

  // Hero: scale the fixed 374px composition to the card, play the glass sweep on entry.
  const [heroCompositionScale, setHeroCompositionScale] = useState(1);
  const heroStageRef = useRef<HTMLDivElement | null>(null);
  const [heroSweepActive, setHeroSweepActive] = useState(false);
  const heroWasActiveRef = useRef(false);
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [taglineVisible, setTaglineVisible] = useState(true);

  // Press-and-hold to begin. The reading is only "selected" while it is held.
  // holdStage: 0 = idle/pressed, 1 = dim, 2 = darkness, 3 = complete darkness.
  const [holdStage, setHoldStage] = useState<0 | 1 | 2 | 3>(0);
  const [holdingArea, setHoldingArea] = useState<string | null>(null);
  const [teaseArea, setTeaseArea] = useState<string | null>(null);
  const [sentArea, setSentArea] = useState<string | null>(null);
  const [readingFade, setReadingFade] = useState(false);
  const holdTimersRef = useRef<number[]>([]);
  const armTimerRef = useRef<number | null>(null);
  const pressStartRef = useRef(0);
  const sendingRef = useRef(false);

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

  // Streaming OpenAI transcription (WebRTC): browser receives an ephemeral token,
  // never the server API key. Keep the completed-audio Whisper route as fallback.
  const realtimePeerRef = useRef<RTCPeerConnection | null>(null);
  const realtimeChannelRef = useRef<RTCDataChannel | null>(null);
  const realtimeFinalRef = useRef("");
  const realtimePartialRef = useRef<Record<string, string>>({});
  const realtimeReadyRef = useRef(false);
  const releasedRef = useRef(false);
  const realtimeWaitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackAudioRef = useRef<Blob | null>(null);
  const awaitingRealtimeRef = useRef(false);
  const didSubmitVoiceRef = useRef(false);


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

  const handleLockedFeature = useCallback(
    (feature: LockedFeature) => {
      const nextAttempt =
        lockedFeatureAttemptsRef.current[feature] + 1;

      lockedFeatureAttemptsRef.current[feature] =
        nextAttempt;

      // First attempt: explain what is needed.
      if (nextAttempt < 2) {
        setLockedFeaturePrompt(feature);

        window.setTimeout(() => {
          setLockedFeaturePrompt((current) =>
            current === feature ? null : current
          );
        }, 3200);

        return;
      }

      // Second attempt: open Credits with intent.
      lockedFeatureAttemptsRef.current[feature] = 0;
      setLockedFeaturePrompt(null);

      onOpenCredits?.(feature);
    },
    [onOpenCredits]
  );

  // When returning from the browser back/forward cache, blur whatever was
  // previously focused so the Voice button's animated border does not repaint
  // incorrectly on iOS Safari.
  useEffect(() => {
    const resetReturnedFocus = () => {
      if (document.visibilityState !== "visible") return;

      const active = document.activeElement;

      if (active instanceof HTMLElement) {
        active.blur();
      }
    };

    document.addEventListener(
      "visibilitychange",
      resetReturnedFocus
    );

    window.addEventListener(
      "pageshow",
      resetReturnedFocus
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        resetReturnedFocus
      );

      window.removeEventListener(
        "pageshow",
        resetReturnedFocus
      );
    };
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

      router.push("/reading/preparing?source=voice");
    },
    [router, shouldReduceMotion]
  );

  const revealVoiceTranscript = useCallback((transcript: string) => {
    const clean = transcript.trim();
    setVoiceTranscript(clean);
    setVoiceTranscriptPreview(clean);
    submitAskAnything(clean);
  }, [submitAskAnything]);

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

        if (!didSubmitVoiceRef.current) {
          didSubmitVoiceRef.current = true;
          revealVoiceTranscript(data.text);
        }
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

  const closeRealtime = useCallback(() => {
    if (realtimeWaitRef.current) clearTimeout(realtimeWaitRef.current);
    realtimeWaitRef.current = null;
    realtimeChannelRef.current?.close();
    realtimeChannelRef.current = null;
    realtimePeerRef.current?.close();
    realtimePeerRef.current = null;
    realtimeReadyRef.current = false;
  }, []);

  const completeStreaming = useCallback((text: string) => {
    if (!releasedRef.current || didSubmitVoiceRef.current || text.trim().length < 2) return;
    didSubmitVoiceRef.current = true;
    closeRealtime();
    submitAskAnything(text.trim());
  }, [closeRealtime, submitAskAnything]);

  const connectRealtime = useCallback(async (stream: MediaStream) => {
    try {
      const tokenRes = await fetch("/api/reading/transcribe/session", { method: "POST" });
      if (!tokenRes.ok || !askHoldingRef.current) {
        if (!tokenRes.ok) console.error("[reading/transcribe] Session request failed:", tokenRes.status);
        return;
      }
      const tokenData = await tokenRes.json();
      const secret = tokenData?.value ?? tokenData?.client_secret?.value;
      if (typeof secret !== "string" || !secret || !askHoldingRef.current) {
        console.error("[reading/transcribe] Missing streaming token or hold released");
        return;
      }
      const pc = new RTCPeerConnection();
      realtimePeerRef.current = pc;
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) { pc.close(); return; }
      pc.addTrack(audioTrack, stream);
      const dc = pc.createDataChannel("oai-events");
      realtimeChannelRef.current = dc;
      dc.onmessage = (message) => {
        let event: {type?:string;item_id?:string;delta?:string;transcript?:string};
        try { event = JSON.parse(message.data); } catch { return; }
        const item = event.item_id || "current";
        if (event.type === "conversation.item.input_audio_transcription.delta") {
          realtimePartialRef.current[item] = (realtimePartialRef.current[item] || "") + (event.delta || "");
          if (askHoldingRef.current) setVoiceTranscriptPreview((realtimeFinalRef.current + " " + Object.values(realtimePartialRef.current).join(" ")).trim());
        } else if (event.type === "conversation.item.input_audio_transcription.completed") {
          delete realtimePartialRef.current[item];
          const phrase = (event.transcript || "").trim();
          if (phrase) realtimeFinalRef.current = (realtimeFinalRef.current + " " + phrase).trim();
          setVoiceTranscriptPreview(realtimeFinalRef.current);
          if (releasedRef.current) completeStreaming(realtimeFinalRef.current);
        }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const answerRes = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST", headers: {Authorization: `Bearer ${secret}`, "Content-Type":"application/sdp"},
        body: offer.sdp,
      });
      if (!answerRes.ok || !askHoldingRef.current) {
        if (!answerRes.ok) console.error("[reading/transcribe] WebRTC handshake failed:", answerRes.status);
        pc.close(); return;
      }
      await pc.setRemoteDescription({ type: "answer", sdp: await answerRes.text() });
      realtimeReadyRef.current = true;
    } catch (error) {
      console.error("[reading/transcribe] Streaming connection failed:", error);
      // Existing Whisper endpoint remains the fallback.
    }
  }, [completeStreaming]);

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
      realtimeFinalRef.current = "";
      realtimePartialRef.current = {};
      releasedRef.current = false;
      fallbackAudioRef.current = null;
      awaitingRealtimeRef.current = false;
      didSubmitVoiceRef.current = false;
      closeRealtime();

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

        if (cancelled || didSubmitVoiceRef.current) return;
        fallbackAudioRef.current = blob;
        // If streaming could not complete promptly, fall back to the existing
        // high-quality Whisper endpoint rather than losing the question.
        if (!awaitingRealtimeRef.current) {
          closeRealtime();
          void transcribeAskAudio(blob);
        }
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

      void connectRealtime(stream);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { void startAskMeter(); });
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
      connectRealtime, closeRealtime,
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
    closeRealtime();
    stopAskRecorder(true);
    triggerIntakeHaptic();
  }, [stopAskMeter, stopAskRecorder, closeRealtime]);

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
    releasedRef.current = true;

    if (elapsed < ASK_MIN_HOLD_MS) {
      askCancelledRef.current = true;
      setVoiceJourneyActive(false);
      setVoiceNavigating(false);
      closeRealtime();
      stopAskRecorder(true);
      setAskError("Press and hold while you speak.");
      return;
    }

    // Transition the visual immediately. The route opens only when the final
    // transcript is saved; never submit an interim/possibly incomplete phrase.
    setVoiceNavigating(true);
    stopAskRecorder(false);
    if (realtimeReadyRef.current && realtimeChannelRef.current?.readyState === "open") {
      awaitingRealtimeRef.current = true;
      // End the utterance even if VAD hasn't closed the last sentence yet.
      realtimeChannelRef.current.send(JSON.stringify({type:"input_audio_buffer.commit"}));
      // Avoid hanging forever if completion doesn't arrive.
      realtimeWaitRef.current = setTimeout(() => {
        if (didSubmitVoiceRef.current) return;
        closeRealtime();
        if (fallbackAudioRef.current) void transcribeAskAudio(fallbackAudioRef.current);
        else setAskError("Couldn't finish transcription. Please try again.");
      }, 3500);
    } else {
      // The recorder's onstop handler will send the complete audio to Whisper.
      closeRealtime();
    }
  }, [stopAskMeter, stopAskRecorder, closeRealtime, completeStreaming, transcribeAskAudio]);

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

  const needsPayment =
    Number(userStatus?.credits ?? 0) <= 0 && userStatus?.isSubscribed !== true;

  // A reading can begin once the chart is ready and nothing is already starting.
  const canBegin = chartStatus === "ready" && !isCreatingReading;
  const canBeginRef = useRef(canBegin);
  useEffect(() => {
    canBeginRef.current = canBegin;
  }, [canBegin]);

  // The single line under the reading choices: status, countdown, or the invitation.
  const hintCopy = useMemo(() => {
    if (chartStatus === "recalculating" || chartStatus === "checking") return "Loading your chart…";
    if (chartStatus === "error") return "Chart unavailable · Try again";
    if (isCreatingReading || sentArea) return "Opening your reading…";
    if (holdStage > 0) return `Keep holding · ${4 - holdStage}`;
    return needsPayment
      ? `Press & Hold to Begin · ${formatUsd(PRICING.reading.price)}`
      : "Press & Hold to Begin";
  }, [chartStatus, isCreatingReading, sentArea, holdStage, needsPayment]);

  const handleStartReading = async (areaId: string) => {
    const selectedArea = areaId;
    if (!canBeginRef.current || !selectedArea) {
      resetHoldVisuals();
      return;
    }
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
        resetHoldVisuals();
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
        resetHoldVisuals();
        return;
      }

      if (checkoutData?.url) {
        window.location.href = checkoutData.url;
        return;
      }

      setSubmitError("Couldn't start checkout. Please try again.");
      resetHoldVisuals();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Something went wrong");
      resetHoldVisuals();
    } finally {
      setIsCreatingReading(false);
    }
  };

  // ── Press-and-hold ─────────────────────────────────────────────────
  const clearHoldTimers = () => {
    holdTimersRef.current.forEach((id) => window.clearTimeout(id));
    holdTimersRef.current = [];
    if (armTimerRef.current) {
      window.clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
  };

  // Return the page to its resting state (used on release, checkout, and errors).
  function resetHoldVisuals() {
    clearHoldTimers();
    sendingRef.current = false;
    setHoldStage(0);
    setHoldingArea(null);
    setSentArea(null);
    setReadingFade(false);
    setSelectedArea(null);
  }

  const completeHold = (areaId: string) => {
    clearHoldTimers();
    sendingRef.current = true;
    setHoldingArea(null);
    setSentArea(areaId);
    triggerIntakeHaptic();
    // The tile flashes, then the screen fades to black while the reading starts.
    holdTimersRef.current.push(window.setTimeout(() => setReadingFade(true), 420));
    void handleStartReading(areaId);
  };

  const beginHold = (areaId: string) => {
    if (sendingRef.current || !canBeginRef.current) return;
    setHoldingArea(areaId);
    setHoldStage(1);
    triggerIntakeHaptic();
    holdTimersRef.current.push(
      window.setTimeout(() => { setHoldStage(2); triggerIntakeHaptic(); }, HOLD_STEP_MS),
      window.setTimeout(() => { setHoldStage(3); triggerIntakeHaptic(); }, HOLD_STEP_MS * 2),
      window.setTimeout(() => completeHold(areaId), HOLD_TOTAL_MS),
    );
  };

  const handleTilePointerDown = (event: React.PointerEvent<HTMLButtonElement>, areaId: string) => {
    if (sendingRef.current || voiceVisualActiveRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pressStartRef.current = Date.now();
    clearHoldTimers();
    setSubmitError(null);
    setSelectedArea(areaId);
    const area = AREAS.find((a) => a.id === areaId);
    trackTtq("ViewContent", { content_id: areaId, content_name: area?.title });
    armTimerRef.current = window.setTimeout(() => beginHold(areaId), HOLD_ARM_MS);
  };

  const handleTilePointerUp = (areaId: string, cancelled = false) => {
    if (sendingRef.current) return;
    const quickTap = !cancelled && Date.now() - pressStartRef.current < HOLD_ARM_MS;
    clearHoldTimers();
    setHoldStage(0);
    setHoldingArea(null);
    // Lifting the finger lets the selection go, with a smooth fade.
    setSelectedArea(null);
    if (quickTap && !shouldReduceMotion) {
      // A quick tap shows how to begin: the ring starts tracing, then slides back.
      setTeaseArea(null);
      window.requestAnimationFrame(() => setTeaseArea(areaId));
      window.setTimeout(() => setTeaseArea((current) => (current === areaId ? null : current)), 1150);
    }
  };

  const handleTileKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, areaId: string) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (sendingRef.current || !canBeginRef.current) return;
    // Keyboard: first press chooses the reading, second press begins it.
    if (selectedArea === areaId) completeHold(areaId);
    else setSelectedArea(areaId);
  };

  useEffect(() => () => clearHoldTimers(), []);

  // Tell the pager how dark the sky behind the stars should be.
  useEffect(() => {
    const root = document.documentElement;
    const level = sentArea ? 3 : holdStage;
    if (level > 0) root.dataset.astroFocus = String(level);
    else delete root.dataset.astroFocus;
    return () => {
      delete root.dataset.astroFocus;
    };
  }, [holdStage, sentArea]);

  // Rotate the hero's sales line.
  useEffect(() => {
    if (shouldReduceMotion) return;
    let swapTimer = 0;
    const interval = window.setInterval(() => {
      setTaglineVisible(false);
      swapTimer = window.setTimeout(() => {
        setTaglineIndex((index) => (index + 1) % HERO_TAGLINES.length);
        setTaglineVisible(true);
      }, 520);
    }, 3800);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(swapTimer);
    };
  }, [shouldReduceMotion]);

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
  const voiceVisualActiveRef = useRef(voiceVisualActive);
  voiceVisualActiveRef.current = voiceVisualActive;

  // Darkness level for the whole screen: 0 rest · 1 dim · 2 darkness · 3 complete darkness.
  const focusLevel = sentArea ? 3 : holdStage;
  const contextActive = !!selectedArea || contextFocused;
  // Keep the last description so it can fade out rather than vanish.
  const lastDescriptionRef = useRef("");
  if (selectedAreaConfig) lastDescriptionRef.current = selectedAreaConfig.description;
  const lastDescription = lastDescriptionRef.current;

  return (
    <div
      ref={intakeRootRef}
      className={`astro-intake focus-${focusLevel} relative h-full min-h-full w-full min-w-0 max-w-full overflow-x-hidden bg-transparent text-slate-100`}
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

        /* Typefaces: Cormorant Garamond (display, labels) and Cinzel (small capitals),
           loaded in layout.tsx as --font-display and --font-caps. */
        .astro-intake {
          --display: var(--font-display), "Cormorant Garamond", Georgia, "Times New Roman", serif;
          --caps: var(--font-caps), Cinzel, Georgia, serif;
          --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
          --ease-soft: cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* ── HERO GLASS SWEEP (on entry) ── */
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
        .hero-shine-sweep::after { animation: heroShine 2.75s var(--ease-out) 1 forwards; }
        .hero-shine > * { position: relative; z-index: 2; }

        /* ── HERO AURA ── */
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
          border: 1px solid color-mix(in srgb, var(--hero-c1-color) 90%, transparent);
          box-shadow:
            0 0 26px 2px color-mix(in srgb, var(--hero-c1-color) 70%, transparent),
            0 0 70px 10px color-mix(in srgb, var(--hero-c1-color) 42%, transparent),
            0 0 130px 26px color-mix(in srgb, var(--hero-c1-color) 26%, transparent);
          animation: heroBorderGlow 9s ease-in-out infinite;
          transition: opacity 0.7s var(--ease-soft);
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

        /* ── HERO BRAND ── */
        .brand-pill {
          position: absolute;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          white-space: nowrap;
          padding: 6px 14px 6px 18px;
          border-radius: 9999px;
          border: 1px solid rgba(165,180,252,0.32);
          background: rgba(49,46,129,0.22);
          font-family: var(--caps);
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.34em;
          text-transform: uppercase;
          color: rgba(226,232,240,0.92);
        }
        .brand-pill sup {
          position: relative;
          top: -0.55em;
          margin-left: 0.15em;
          font-size: 0.6em;
          letter-spacing: 0.16em;
          line-height: 0;
          vertical-align: baseline;
        }
        .brand-title {
          margin: 0;
          text-align: center;
          font-family: var(--display);
          font-size: 44px;
          font-weight: 600;
          line-height: 1;
          letter-spacing: -0.01em;
          color: rgba(240,242,249,0.96);
          animation: breatheTitle 5.5s ease-in-out infinite;
        }
        @keyframes breatheTitle {
          0%, 100% {
            transform: scale(1);
            text-shadow: 0 5px 6px rgba(0,0,0,0.94), 0 13px 24px rgba(0,0,0,0.78), 0 0 26px rgba(148,163,184,0.17);
          }
          50% {
            transform: scale(1.015);
            text-shadow: 0 5px 6px rgba(0,0,0,0.94), 0 13px 24px rgba(0,0,0,0.78), 0 0 30px rgba(255,236,196,0.30);
          }
        }
        .brand-foot {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .brand-rule {
          width: 82px;
          height: 1px;
          margin-bottom: 10px;
          background: linear-gradient(90deg, transparent, rgba(203,213,225,0.42), transparent);
        }
        .brand-tagline {
          margin: 0;
          white-space: nowrap;
          font-family: var(--display);
          font-style: italic;
          font-weight: 500;
          font-size: 15.5px;
          line-height: 1.3;
          letter-spacing: 0.01em;
          color: rgba(203,213,225,0.85);
          transition: opacity 0.5s ease, transform 0.6s var(--ease-out);
        }
        .brand-tagline.is-out { opacity: 0; transform: translateY(4px); }

        /* ── HEADING (swipe prompt / held reading) ── */
        .astro-heading {
          font-family: var(--caps);
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: #f1f5f9;
          text-shadow: 0 4px 5px rgba(0,0,0,0.98), 0 9px 18px rgba(0,0,0,0.78), 0 0 18px rgba(148,163,184,0.22);
        }

        /* ── READING TILES ── */
        .astro-tile {
          position: relative;
          overflow: hidden;
          height: 84px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.10);
          background-color: rgba(255,255,255,0.03);
          box-shadow: 0 18px 34px rgba(0,0,0,0.78), 0 34px 68px rgba(0,0,0,0.46);
          cursor: pointer;
          user-select: none;
          -webkit-user-select: none;
          -webkit-touch-callout: none;
          touch-action: manipulation;
          transition: border-color .9s var(--ease-soft), background-color .9s var(--ease-soft), box-shadow .9s var(--ease-soft),
            transform .9s var(--ease-soft), opacity .9s var(--ease-soft), filter .9s var(--ease-soft);
        }
        .astro-tile > * { position: relative; z-index: 1; }
        .astro-tile .tile-icon {
          width: 24px;
          height: 24px;
          color: rgba(203,213,225,0.68);
          transition: color .9s var(--ease-out), filter .9s var(--ease-out), transform .9s var(--ease-out);
        }
        .astro-tile .tile-label {
          font-family: var(--display);
          font-size: 19px;
          font-weight: 600;
          letter-spacing: 0.015em;
          color: rgba(226,232,240,0.86);
          transition: color .9s var(--ease-out);
        }
        .astro-tile.is-on {
          border-color: var(--b);
          background-color: var(--bg);
          transform: translateY(-1px);
          box-shadow: 0 0 0 1px var(--b), 0 0 18px 2px var(--g), 0 0 34px 5px var(--g), 0 18px 34px rgba(0,0,0,0.78), 0 34px 68px rgba(0,0,0,0.46);
          transition-duration: .5s;
        }
        .astro-tile.is-on .tile-icon { color: var(--t); filter: drop-shadow(0 0 7px var(--g)); transform: scale(1.035); transition-duration: .5s; }
        .astro-tile.is-on .tile-label { color: var(--t); transition-duration: .5s; }

        /* Hold: color fills from the bottom, a ring traces the edge, the tile pulses. */
        .astro-tile::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 0;
          background: linear-gradient(0deg, var(--g), transparent 110%);
          transform: scaleY(0);
          transform-origin: bottom;
          transition: transform .3s ease;
        }
        .astro-tile.is-holding::after { transform: scaleY(1); transition: transform ${HOLD_TOTAL_MS}ms linear; }
        @property --hold-progress { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
        .astro-tile::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 2;
          border-radius: inherit;
          padding: 2px;
          pointer-events: none;
          background: conic-gradient(from 0deg, var(--t) var(--hold-progress), transparent 0);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0;
          --hold-progress: 0deg;
          transition: --hold-progress .35s ease, opacity .3s ease;
        }
        .astro-tile.is-holding::before { opacity: 1; --hold-progress: 360deg; transition: --hold-progress ${HOLD_TOTAL_MS}ms linear, opacity .2s ease; }
        @keyframes tileTease { 0% { --hold-progress: 0deg; opacity: 1; } 45% { --hold-progress: 165deg; opacity: 1; } 80% { --hold-progress: 0deg; opacity: 1; } 100% { --hold-progress: 0deg; opacity: 0; } }
        .astro-tile.is-tease::before {
          background: conic-gradient(from 0deg, rgba(255,255,255,0.95) var(--hold-progress), transparent 0);
          animation: tileTease 1.1s var(--ease-out);
        }
        @keyframes holdPulse {
          0%, 100% { transform: scale(1.025); box-shadow: 0 0 0 1px var(--b), 0 0 18px 2px var(--g), 0 0 36px 6px var(--g), 0 18px 34px rgba(0,0,0,0.78); }
          50% { transform: scale(1.05); box-shadow: 0 0 0 1px var(--b), 0 0 32px 8px var(--g), 0 0 70px 18px var(--g), 0 18px 34px rgba(0,0,0,0.78); }
        }
        .astro-tile.is-holding { animation: holdPulse 1s ease-in-out infinite; z-index: 3; }
        .focus-3 .astro-tile.is-holding { animation-duration: .6s; }
        @keyframes sendFlash {
          0% { transform: scale(1.05); }
          40% { transform: scale(1.1); box-shadow: 0 0 0 2px #fff, 0 0 50px 16px var(--g), 0 0 120px 40px var(--g); }
          100% { transform: scale(1.02); opacity: 0; }
        }
        .astro-tile.is-sent { animation: sendFlash .6s var(--ease-out) forwards; z-index: 3; }
        .astro-tile.is-sent::before { opacity: 1; --hold-progress: 360deg; }

        /* ── DESCRIPTION + HINT (fixed placement) ── */
        .astro-desc p {
          min-height: 1.35em;
          margin: 0;
          font-family: var(--display);
          font-style: italic;
          font-weight: 500;
          font-size: 18.5px;
          line-height: 1.35;
          color: rgba(203,213,225,0.82);
          opacity: 0;
          transform: translateY(6px);
          transition: opacity .9s var(--ease-soft), transform .9s var(--ease-soft);
        }
        .astro-desc p.is-shown { opacity: 1; transform: none; transition: opacity .45s ease, transform .55s var(--ease-out); }
        .astro-desc small {
          display: block;
          margin-top: 8px;
          font-family: var(--caps);
          font-size: 10.5px;
          font-weight: 500;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--hint, rgba(248,250,252,0.9));
          transition: color .9s var(--ease-soft), font-size .4s ease, letter-spacing .4s ease;
        }
        .focus-1 .astro-desc small, .focus-2 .astro-desc small, .focus-3 .astro-desc small { font-size: 12px; letter-spacing: 0.24em; }

        /* ── FOCUS STEPS: dim → darkness → complete darkness (the stars stay, in the pager) ── */
        /* Opacity only: iOS Safari paints filter layers here as hard-edged dark boxes. */
        .astro-fade { transition: opacity .7s var(--ease-soft); }
        .focus-1 .astro-fade, .focus-2 .astro-fade, .focus-3 .astro-fade { transition: opacity .8s var(--ease-out); }
        .focus-1 .astro-fade { opacity: .22; }
        .focus-2 .astro-fade { opacity: .05; }
        .focus-3 .astro-fade { opacity: 0; }
        .focus-1 .astro-tile:not(.is-holding):not(.is-sent) { opacity: .22; transition-duration: .8s; }
        .focus-2 .astro-tile:not(.is-holding):not(.is-sent) { opacity: .05; transition-duration: .8s; }
        .focus-3 .astro-tile:not(.is-holding):not(.is-sent) { opacity: 0; transition-duration: .8s; }
        .focus-2 .astro-desc p.is-shown { opacity: .4; }
        .focus-3 .astro-desc p.is-shown { opacity: 0; }
        .focus-1 .hero-glow-shell::before { opacity: .3; }
        .focus-2 .hero-glow-shell::before, .focus-3 .hero-glow-shell::before { opacity: 0; }

        /* ── ADD CONTEXT — soft circulating pearl/champagne edge ── */
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
          transition: opacity .9s var(--ease-soft);
        }
        .premium-context:focus-within::before,
        .premium-context-active::before {
          opacity: 0.88;
          filter: blur(0.45px)
            drop-shadow(0 0 4px rgba(255,255,255,0.16))
            drop-shadow(0 0 8px rgba(205,164,82,0.18));
        }
        .premium-context > * { z-index: 1; }
        .context-placeholder {
          font-family: var(--display);
          font-size: 18px;
          font-weight: 500;
          letter-spacing: 0.01em;
          color: rgba(170,182,202,0.78);
        }

        /* ── ASK ANYTHING — gold/white orbiting edge with a breathing aura ── */
        @property --voice-angle {
          syntax: "<angle>";
          inherits: false;
          initial-value: 0deg;
        }
        @keyframes voiceOrbit {
          to { --voice-angle: 360deg; }
        }
        @property --voice-glow-angle {
          syntax: "<angle>";
          inherits: false;
          initial-value: 0deg;
        }
        @keyframes voiceGlowOrbit {
          to { --voice-glow-angle: 360deg; }
        }
        @keyframes voiceGlowBreathe {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 0.7; }
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
        .ask-box::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 86px;
          border-radius: 26px;
          z-index: 0;
          pointer-events: none;
          background: conic-gradient(
            from var(--voice-glow-angle),
            rgba(255,255,255,0.75),
            rgba(255,239,195,0.35) 60deg,
            rgba(218,183,104,0.85) 115deg,
            rgba(255,255,255,0.30) 175deg,
            rgba(255,255,255,0.80) 228deg,
            rgba(193,151,67,0.80) 296deg,
            rgba(255,255,255,0.75)
          );
          filter: blur(16px);
          opacity: 0.55;
          transform: scale(1.04);
          animation: voiceGlowOrbit 8s linear infinite, voiceGlowBreathe 4.5s ease-in-out infinite;
        }
        /* Gold border is painted as a layered background rather than a
         * masked pseudo-element. This keeps the animated conic gradient
         * stable across iOS Safari's back/forward cache, where the mask
         * layer could otherwise repaint incorrectly and fill the button. */
        .ask-premium {
          position: relative;
          z-index: 1;
          overflow: hidden;
          user-select: none;
          -webkit-user-select: none;
          -webkit-touch-callout: none;
          isolation: isolate;
          border: 1.25px solid transparent;
          border-radius: 24px;
          background:
            radial-gradient(circle at 50% -70%, rgba(255,255,255,0.11), transparent 66%) padding-box,
            linear-gradient(145deg, rgba(19,18,24,0.96), rgba(7,10,21,0.97)) padding-box,
            conic-gradient(
              from var(--voice-angle),
              rgba(255,255,255,0.94) 0deg,
              rgba(255,255,255,0.74) 54deg,
              rgba(218,183,104,0.88) 112deg,
              rgba(255,239,195,0.82) 172deg,
              rgba(255,255,255,0.96) 226deg,
              rgba(193,151,67,0.86) 296deg,
              rgba(255,255,255,0.94) 360deg
            ) border-box;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.10),
            0 0 0 1px rgba(255,239,195,0.10),
            0 0 18px rgba(218,183,104,0.30),
            0 0 36px rgba(255,255,255,0.10),
            0 16px 38px rgba(0,0,0,0.46);
          animation: voiceOrbit 8s linear infinite;
        }
        .ask-premium::before,
        .ask-premium::after { content: none; }
        .ask-premium:hover,
        .ask-premium:focus-visible {
          transform: translateY(-1px);
          outline: none;
        }
        .ask-premium:active { transform: translateY(0); }
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
        .ask-caption {
          font-family: var(--caps);
          font-size: 10.5px;
          font-weight: 500;
          letter-spacing: 0.2em;
          text-transform: uppercase;
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
        .mic-ready-toggle[data-enabled="false"] .mic-ready-knob { top: 39px; }
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
          .brand-title,
          .ask-premium,
          .ask-box::before,
          .ask-mic-halo,
          .astro-tile,
          .astro-tile::before { animation: none !important; }
          .mic-ready-toggle,
          .mic-ready-knob { transition: none !important; }
        }
      `}</style>

      <div
        className="relative z-10 mx-auto flex w-full min-w-0 max-w-[430px] flex-col px-[clamp(12px,4vw,16px)]"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 16px)",
          paddingBottom: "calc(2rem + env(safe-area-inset-bottom))",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex flex-col top-section"
        >
          {/* ── HERO — fixed 236px brand card; becomes the live waveform while asking aloud ── */}
          <section className="astro-fade mb-[20px] pt-0">
            <div
              className="hero-glow-shell"
              style={{
                "--hero-c1-color": `rgb(${heroPalette[0]})`,
                "--hero-c2-color": `rgb(${heroPalette[1]})`,
                "--hero-c3-color": `rgb(${heroPalette[2]})`,
                "--hero-c4-color": `rgb(${heroPalette[3]})`,
              } as React.CSSProperties}
            >
              <div
                ref={heroStageRef}
                className={`hero-shine ${heroSweepActive ? "hero-shine-sweep" : ""} relative h-[236px] select-none overflow-hidden rounded-[28px] border border-white/[0.08] bg-white/[0.03] text-center`}
                onContextMenu={(e) => e.preventDefault()}
                aria-label={voiceVisualActive ? "Ask Anything voice flow is active" : undefined}
              >
                {/* One master canvas: the composition is designed at 374 × 236 and scaled to fit. */}
                <div
                  className="absolute left-1/2 top-1/2 z-10 h-[236px] w-[374px]"
                  style={{
                    transform: `translate(-50%, -50%) scale(${heroCompositionScale})`,
                    transformOrigin: "center center",
                  }}
                >
                  {voiceVisualActive ? (
                    <div className="absolute inset-0">
                      <div className="absolute inset-0 flex items-center justify-center px-[30px]">
                        <canvas
                          ref={canvasRef}
                          aria-hidden="true"
                          className="h-[122px] w-[330px] max-w-full"
                          style={{ opacity: askHolding ? 1 : 0.42 }}
                        />
                        {voiceTranscriptPreview && (
                          <div aria-live="polite" className="pointer-events-none absolute inset-x-[30px] top-1/2 z-20 -translate-y-1/2 text-center">
                            <p
                              className="mx-auto max-h-[110px] overflow-hidden text-[18px] leading-[1.4] text-white"
                              style={{ textShadow: "0 2px 16px rgba(0,0,0,0.96)" }}
                            >
                              {voiceTranscriptPreview}
                            </p>
                          </div>
                        )}
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
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center px-[18px] text-center">
                      <span className="brand-pill" aria-label="AstroProXL">
                        AstroPro<sup aria-hidden="true">XL</sup>
                      </span>
                      <h1 className="brand-title">
                        Real Astrological
                        <br />
                        Predictions
                      </h1>
                      <div className="brand-foot">
                        <span className="brand-rule" aria-hidden="true" />
                        <p className={`brand-tagline ${taglineVisible ? "" : "is-out"}`} aria-live="polite">
                          {HERO_TAGLINES[taglineIndex]}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ── HEADING — the swipe prompt ── */}
          <button
            type="button"
            onClick={() => onSwipeLeft?.()}
            className="astro-fade astro-heading tap-fix relative mb-[14px] flex h-[26px] items-center justify-center transition-opacity duration-500"
            style={{ opacity: voiceVisualActive ? 0 : undefined }}
          >
            <ChevronLeft className="mr-[10px] h-[14px] w-[14px] opacity-80" aria-hidden="true" />
            Swipe Left To Explore
          </button>

          {/* ── READING TILES (2×2) — press and hold one for 3 seconds to begin ── */}
          <section
            className="grid grid-cols-2 gap-x-3 gap-y-4 transition-opacity duration-700"
            style={{ opacity: voiceVisualActive ? 0 : 1, pointerEvents: voiceVisualActive ? "none" : "auto" }}
            aria-label="Choose a reading. Press and hold for three seconds to begin."
          >
            {AREAS.map((area) => {
              const Icon = area.icon;
              const c = getAreaColors(area.id);
              const classes = [
                "astro-tile tap-fix",
                selectedArea === area.id ? "is-on" : "",
                holdingArea === area.id ? "is-holding" : "",
                teaseArea === area.id ? "is-tease" : "",
                sentArea === area.id ? "is-sent" : "",
              ].join(" ");
              return (
                <button
                  key={area.id}
                  type="button"
                  data-no-swipe
                  className={classes}
                  aria-pressed={selectedArea === area.id}
                  aria-label={`${area.title}. ${area.description}. Press and hold to begin.`}
                  onPointerDown={(e) => handleTilePointerDown(e, area.id)}
                  onPointerUp={() => handleTilePointerUp(area.id)}
                  onPointerCancel={() => handleTilePointerUp(area.id, true)}
                  onKeyDown={(e) => handleTileKeyDown(e, area.id)}
                  onContextMenu={(e) => e.preventDefault()}
                  style={{
                    "--t": c.text,
                    "--b": c.border,
                    "--bg": c.bg,
                    "--g": c.glow,
                  } as React.CSSProperties}
                >
                  <Icon className="tile-icon" />
                  <span className="tile-label">{area.title}</span>
                </button>
              );
            })}
          </section>

          {/* ── DESCRIPTION + HINT — fixed placement so nothing below moves ── */}
          <div
            className="astro-desc flex h-[64px] flex-col items-center justify-center px-3 text-center transition-opacity duration-700"
            aria-live="polite"
            style={{
              opacity: voiceVisualActive ? 0 : 1,
              "--hint": selectedAreaConfig ? getAreaColors(selectedAreaConfig.id).text : undefined,
            } as React.CSSProperties}
          >
            <p className={selectedAreaConfig ? "is-shown" : ""}>
              {selectedAreaConfig?.description ?? lastDescription}
            </p>
            <small>{submitError ?? hintCopy}</small>
          </div>

          {/* ── ADD DETAILS (members) — soft gold edge while a reading is held ── */}
          <div
            data-reading-context="true"
            className={`astro-fade premium-context relative h-[84px] rounded-[20px] border bg-transparent ${contextActive ? "premium-context-active" : ""}`}
            style={{
              opacity: voiceVisualActive ? 0 : undefined,
              pointerEvents: voiceVisualActive ? "none" : "auto",
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
                <div className="context-placeholder pointer-events-none absolute inset-0 flex items-center justify-center text-center">
                  {!canUseAddContext && lockedFeaturePrompt === "context"
                    ? "Become a Member"
                    : "Add Details for Deeper Insights"}
                </div>
              )}

              {!canUseAddContext && (
                <button
                  type="button"
                  className="absolute inset-0 z-20 rounded-[20px]"
                  aria-label="Add details is included with Astro Plus"
                  onClick={() => handleLockedFeature("context")}
                  style={{ background: "transparent" }}
                />
              )}

              <Textarea
                id="question"
                rows={2}
                value={question}
                disabled={!canUseAddContext}
                aria-label="Add details for deeper insights (optional)"
                onFocus={() => setContextFocused(true)}
                onBlur={() => setContextFocused(false)}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder=""
                className="h-full min-h-0 w-full resize-none rounded-[14px] !border-0 !bg-transparent px-1 py-1 text-center text-[16px] leading-6 text-white !shadow-none focus:!border-0 focus:outline-none focus:!ring-0 focus-visible:!border-0 focus-visible:!ring-0 focus-visible:!ring-offset-0 focus-visible:!shadow-none"
                style={{ backgroundColor: "transparent" }}
              />
            </div>
          </div>

          {/* ── ASK ANYTHING — centered premium voice control + subtle mic toggle ── */}
          <section className="astro-fade mt-6 pt-5">
            <div className="flex w-full items-center justify-center">
              <div className="ask-box relative h-[86px] w-[72%] max-w-[304px]">
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
                    zIndex: 2,
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
              <p className="mt-3 text-center text-[11px] text-slate-400/78">{askError}</p>
            ) : (
              <p className="ask-caption mt-3 text-center text-slate-400/78">
                {lockedFeaturePrompt === "voice"
                  ? "Get Credits"
                  : micEnabled
                    ? "Press · Hold · Speak"
                    : "Turn on the microphone"}
              </p>
            )}
          </section>
        </motion.div>
      </div>

      {/* Full-screen fade to black when a reading (voice or held tile) is opening. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[9998] bg-black"
        initial={false}
        animate={{ opacity: voiceNavigating || readingFade ? 1 : 0 }}
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