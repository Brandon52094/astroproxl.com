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
} from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { Textarea } from "./ui/textarea";
import { useRouter } from "next/navigation";
import {
  saveIntake,
  saveChart,
  isChartFresh,
  clearIntake,
  clearReading,
} from "@/lib/chartStore";
import { PRICING } from "@/lib/paywallConfig";
import ReadingAmbience from "./ReadingAmbience";
import type { ThemeKey } from "./ReadingAmbience";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

declare global {
  interface Window {
    ttq?: {
      track: (event: string, params?: Record<string, unknown>) => void;
    };
  }
}

/* ── Voice capture for Ask Anything ───────────────────────────────────
 * The browser's own speech recognition starts the instant the button is
 * pressed (the feel of the original JXL panel). A recording runs alongside it
 * as a backup and goes to Whisper only when the browser can't help (Firefox,
 * an error, or nothing heard). Nothing is shown on screen while speaking. */
const ASK_MIN_HOLD_MS = 450;

// Waveform: follows the speaker's voice. Loudness drives the height (normalized
// to each person's own speaking level, so quiet voices still move it), a fast
// attack / slower release makes it rise with each syllable and settle naturally,
// and brighter, more animated speech speeds the motion and lifts the glow.
const ASK_WAVE = {
  sensitivity: 0.95, // how tall the wave gets at the speaker's own loudest
  idle: 0.12,        // gentle movement during silence
  lines: 3,
  speed: 1.8,
  glow: 16,
  thickness: 2.3,
  attack: 0.45,      // how fast it rises when the voice gets louder (0–1)
  release: 0.12,     // how fast it settles when the voice drops (0–1)
  noiseGate: 0.012,  // ignore room hiss below this loudness
  colors: ["#22c55e", "#3b82f6", "#a855f7", "#ef4444", "#f59e0b"],
};

/* ── Minimal SpeechRecognition typings (not in every TS DOM lib) ── */
interface AskSpeechAlternative { readonly transcript: string }
interface AskSpeechResult { readonly isFinal: boolean; readonly length: number; [index: number]: AskSpeechAlternative }
interface AskSpeechResultList { readonly length: number; [index: number]: AskSpeechResult }
interface AskSpeechEvent extends Event { readonly results: AskSpeechResultList }
interface AskSpeechErrorEvent extends Event { readonly error: string }
interface AskSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: AskSpeechEvent) => void) | null;
  onerror: ((e: AskSpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognition(): (new () => AskSpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => AskSpeechRecognition;
    webkitSpeechRecognition?: new () => AskSpeechRecognition;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

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
// darkening the screen; then the screen fades to dark in one continuous ease
// over the full hold. Haptic ticks still mark each second.
const HOLD_ARM_MS = 220;
const HOLD_STEP_MS = 1000;
const HOLD_TOTAL_MS = 3000;
// The chosen reading's ambience (its themed symbols) fades in at 75% of the hold.
const HOLD_AMBIENCE_MS = Math.round(HOLD_TOTAL_MS * 0.75);

// The hero's information is designed once at this width, then the entire
// composition scales together to fit the live card.
const HERO_CANVAS_WIDTH = 374;
const HERO_HORIZONTAL_INSET = 20;

type LockedFeature = "context" | "voice";

interface UserStatus {
  credits: number;
  jxlCredits: number;

  isSubscribed: boolean;

  membershipJxlUsed: number;

  membershipEntitlements: {
    jxlPerMonth: number | null;
    addContext: boolean;
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
  // ambienceArea: the held reading once the hold passes 75% (its symbols show).
  const [ambienceArea, setAmbienceArea] = useState<string | null>(null);
  const [holdingArea, setHoldingArea] = useState<string | null>(null);
  const [teaseArea, setTeaseArea] = useState<string | null>(null);
  const [sentArea, setSentArea] = useState<string | null>(null);
  const [readingFade, setReadingFade] = useState(false);
  const [fadePortalReady, setFadePortalReady] = useState(false);
  useEffect(() => { setFadePortalReady(true); }, []);
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

  // Browser speech recognition: words are collected here silently (never shown).
  const recognitionRef = useRef<AskSpeechRecognition | null>(null);
  const transcriptRef = useRef("");      // everything heard so far this hold
  const speechBaseRef = useRef("");      // text kept across an automatic restart
  const speechStoppingRef = useRef(false);
  const didSubmitVoiceRef = useRef(false);
  const lastSpeechAtRef = useRef(0);      // when the browser last heard words (wave fallback)

  // The mic toggle shakes when someone presses the mic while it's still off.
  const [micNudge, setMicNudge] = useState(false);


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

  const stopSpeechRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (!rec) return;
    speechStoppingRef.current = true;
    try {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.stop();
    } catch {
      // already stopped
    }
  }, []);

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
    stopSpeechRecognition();
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
  }, [stopAskMeter, stopAskRecorder, stopSpeechRecognition]);

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
            stopSpeechRecognition();
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
  }, [micConnecting, micEnabled, stopAskMeter, stopAskRecorder, stopSpeechRecognition]);

  const toggleMicrophone = useCallback(() => {
    if (micEnabled) {
      disconnectMicrophone();
      return;
    }
    void enableMicrophone();
  }, [disconnectMicrophone, enableMicrophone, micEnabled]);

  // Creates the audio analyser. Called straight from the press handler: iOS only
  // lets an AudioContext run if it is created (or resumed) during a tap, and a
  // suspended context reads pure silence, which left the wave flat.
  const primeAskMeter = useCallback((stream: MediaStream) => {
    try {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      void ctx.resume?.().catch(() => {});
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      analyserRef.current = analyser;
    } catch {
      analyserRef.current = null;
    }
  }, []);

  const startAskMeter = useCallback(async () => {
    const stream = meterStreamRef.current;
    if (!stream || !micEnabled) return;

    const hasLiveAudio = stream
      .getAudioTracks()
      .some((track) => track.readyState === "live" && track.enabled);

    if (!hasLiveAudio || !askHoldingRef.current) return;

    try {
      // Normally primed during the press; create it here only as a fallback.
      if (!analyserRef.current) primeAskMeter(stream);
      const analyser = analyserRef.current;
      if (!analyser) return;
      void audioCtxRef.current?.resume?.().catch(() => {});

      const timeData = new Uint8Array(analyser.fftSize);
      const freq = new Uint8Array(analyser.frequencyBinCount);
      let level = 0;       // how loud they are right now, 0–1, relative to their own voice
      let bright = 0;      // how animated/bright the voice sounds, 0–1
      let peak = 0.06;     // the speaker's recent loudest, for automatic gain
      let silentFrames = 0;
      let time = 0;

      // Size the canvas once per hold (and on resize), not on every frame.
      let cw = 0;
      let ch = 0;
      let dpr = 1;
      const fitCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        const r = canvas.getBoundingClientRect();
        cw = r.width;
        ch = r.height;
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
      };
      fitCanvas();

      const drawWave = (canvas: HTMLCanvasElement | null) => {
        if (!canvas) return;
        if (!cw || !ch) fitCanvas();
        if (!cw || !ch) return;

        const c2d = canvas.getContext("2d");
        if (!c2d) return;

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

        // Height follows loudness; glow and line weight swell a little with it.
        const amp = (ASK_WAVE.idle + level * ASK_WAVE.sensitivity) * (ch * 0.44);
        const glow = ASK_WAVE.glow * (0.6 + level * 0.9 + bright * 0.3);

        for (let line = 0; line < ASK_WAVE.lines; line++) {
          const lf = ASK_WAVE.lines > 1 ? line / (ASK_WAVE.lines - 1) : 0;
          const phase = time * (1 + lf * 0.45) + line * 0.7;
          const lineAmp = amp * (1 - lf * 0.14);
          // Brighter speech adds a little more ripple to the shape.
          const ripple = 7 + bright * 3;

          c2d.beginPath();
          for (let x = 0; x <= cw; x += 3) {
            const tx = x / cw;
            const env = Math.pow(Math.sin(tx * Math.PI), 0.85);
            const y =
              cy +
              env *
                lineAmp *
                (Math.sin(tx * Math.PI * 4 + phase) * 0.6 +
                  Math.sin(tx * Math.PI * ripple - phase * 0.7 + line) * 0.4);
            x === 0 ? c2d.moveTo(x, y) : c2d.lineTo(x, y);
          }

          c2d.strokeStyle = grad;
          c2d.globalAlpha = 0.16 + (1 - lf) * 0.22 + level * 0.12;
          c2d.lineWidth = ASK_WAVE.thickness * (0.7 + (1 - lf) * 0.8) * (0.9 + level * 0.3);
          c2d.shadowBlur = glow;
          c2d.shadowColor = "rgba(129,140,248,0.5)";
          c2d.stroke();
        }

        const coreAmp =
          (ASK_WAVE.idle * 0.5 + level * ASK_WAVE.sensitivity * 1.1) *
          (ch * 0.44);
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

        c2d.globalAlpha = 0.25 + level * 0.65;
        c2d.strokeStyle = "rgba(255,255,255,0.92)";
        c2d.lineWidth = Math.max(1, ASK_WAVE.thickness * 0.6);
        c2d.shadowBlur = glow * 1.3;
        c2d.shadowColor = "rgba(255,255,255,0.7)";
        c2d.stroke();

        c2d.globalCompositeOperation = "source-over";
        c2d.globalAlpha = 1;
        c2d.shadowBlur = 0;
      };

      const draw = () => {
        if (!askHoldingRef.current) return;

        // Loudness: RMS of the raw waveform (what the ear hears as volume).
        analyser.getByteTimeDomainData(timeData);
        let sumSq = 0;
        for (let i = 0; i < timeData.length; i++) {
          const v = (timeData[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / timeData.length);

        // Excitement: how much of the voice's energy sits in the brighter, upper range.
        analyser.getByteFrequencyData(freq);
        const n = freq.length;
        let low = 0;
        let high = 0;
        const split = Math.floor(n * 0.06);
        const top = Math.floor(n * 0.35);
        for (let i = 2; i < split; i++) low += freq[i];
        for (let i = split; i < top; i++) high += freq[i];
        const brightTarget = low + high > 0 ? Math.min(1, (high / (low + high)) * 1.6) : 0;

        let target: number;
        if (rms < 0.002) {
          // Digital silence. On some phones the browser's speech recognition takes
          // the microphone; if words are still arriving, move the wave with them.
          silentFrames += 1;
          const speaking = performance.now() - lastSpeechAtRef.current < 700;
          target =
            silentFrames > 30 && speaking
              ? 0.45 + 0.4 * Math.abs(Math.sin(performance.now() / 110)) * (0.6 + Math.random() * 0.4)
              : 0;
        } else {
          silentFrames = 0;
          // Automatic gain: compare to their own recent loudest, so a soft voice
          // still fills the wave and a loud one doesn't just max out.
          peak = Math.max(rms, peak * 0.996, 0.02);
          target = rms < ASK_WAVE.noiseGate ? 0 : Math.pow(Math.min(1, rms / peak), 0.75);
        }

        // Rise quickly with each syllable, settle a little more slowly.
        level += (target - level) * (target > level ? ASK_WAVE.attack : ASK_WAVE.release);
        bright += (brightTarget - bright) * 0.08;

        // Livelier, louder speech moves the wave faster.
        time += 0.016 * ASK_WAVE.speed * (1 + level * 1.1 + bright * 0.5);

        drawWave(canvasRef.current);

        meterRafRef.current = requestAnimationFrame(draw);
      };

      window.addEventListener("resize", fitCanvas, { once: true });
      draw();
    } catch {
      stopAskMeter();
    }
  }, [micEnabled, primeAskMeter, stopAskMeter]);

  const submitAskAnything = useCallback(
    (transcript: string) => {
      const spokenQuestion = transcript.trim();

      if (spokenQuestion.length < 2) {
        setVoiceJourneyActive(false);
        setVoiceNavigating(false);
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
    [router]
  );

  const transcribeAskAudio = useCallback(
    async (blob: Blob) => {
      if (blob.size === 0) {
        setVoiceJourneyActive(false);
        setVoiceNavigating(false);
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
          setVoiceJourneyActive(false);
          setVoiceNavigating(false);
          setAskError(data?.error || "Couldn't hear that clearly. Try again.");
          return;
        }

        if (!didSubmitVoiceRef.current) {
          didSubmitVoiceRef.current = true;
          submitAskAnything(data.text);
        }
      } catch {
        setVoiceJourneyActive(false);
        setVoiceNavigating(false);
        setAskError("Something went wrong with voice input. Try again.");
      } finally {
        setIsTranscribingAsk(false);
      }
    },
    [submitAskAnything]
  );

  // Starts the browser's speech recognition. Must run synchronously inside the
  // press handler (no awaits before it) so browsers allow it. Returns false when
  // the browser doesn't offer it; the Whisper recording then carries the hold.
  const startSpeechRecognition = useCallback((): boolean => {
    const SR = getSpeechRecognition();
    if (!SR) return false;

    let rec: AskSpeechRecognition;
    try {
      rec = new SR();
    } catch {
      return false;
    }
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event) => {
      lastSpeechAtRef.current = performance.now();
      let heard = "";
      for (let i = 0; i < event.results.length; i++) {
        heard += " " + event.results[i][0].transcript;
      }
      transcriptRef.current = (speechBaseRef.current + " " + heard).replace(/\s+/g, " ").trim();
    };

    rec.onerror = (event) => {
      // Blocked or failing: stop quietly. The backup recording still has the audio.
      if (event.error !== "no-speech" && event.error !== "aborted") {
        speechStoppingRef.current = true;
      }
    };

    rec.onend = () => {
      // Some browsers end recognition after a pause even mid-hold; pick it back up.
      if (askHoldingRef.current && !speechStoppingRef.current && recognitionRef.current === rec) {
        speechBaseRef.current = transcriptRef.current;
        try {
          rec.start();
          return;
        } catch {
          // fall through: the recording backup covers the rest
        }
      }
      if (recognitionRef.current === rec) recognitionRef.current = null;
    };

    try {
      rec.start();
    } catch {
      return false;
    }
    speechStoppingRef.current = false;
    recognitionRef.current = rec;
    return true;
  }, []);

  // Shake the mic toggle to say "turn me on first".
  const nudgeMicToggle = useCallback(() => {
    setMicNudge(false);
    window.requestAnimationFrame(() => setMicNudge(true));
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate([10, 40, 10]);
      }
    } catch {
      // Haptics are optional.
    }
  }, []);

  const startAskHold = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);

      if (!hasVoiceReadingAccess) {
        handleLockedFeature("voice");
        return;
      }

      if (isTranscribingAsk) return;

      // Mic still off: the toggle shakes to ask for a response.
      if (!micEnabled) {
        nudgeMicToggle();
        return;
      }

      const stream = meterStreamRef.current;
      if (!stream) {
        setAskError("Microphone access isn't available right now.");
        return;
      }

      setAskError(null);
      askPointerStartYRef.current = e.clientY;
      askCancelledRef.current = false;
      audioChunksRef.current = [];
      transcriptRef.current = "";
      speechBaseRef.current = "";
      didSubmitVoiceRef.current = false;
      stopSpeechRecognition();
      lastSpeechAtRef.current = 0;

      // Audio analyser for the waveform: created during the press so iOS lets it run.
      primeAskMeter(stream);

      // 1) Browser speech recognition, started right away so the first words are caught.
      const speechStarted = startSpeechRecognition();

      // 2) Backup recording for Whisper.
      let recorder: MediaRecorder | null = null;
      if (typeof MediaRecorder !== "undefined") {
        const preferredType = [
          "audio/mp4",
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/ogg;codecs=opus",
        ].find((type) => MediaRecorder.isTypeSupported(type));

        try {
          recorder = preferredType
            ? new MediaRecorder(stream, { mimeType: preferredType })
            : new MediaRecorder(stream);
        } catch {
          recorder = null;
        }
      }

      if (!speechStarted && !recorder) {
        setAskError("Voice input isn't available in this browser yet.");
        return;
      }

      if (recorder) {
        const rec = recorder;
        mediaRecorderRef.current = rec;

        rec.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };

        rec.onerror = () => {
          // The backup failed; speech recognition (if running) can still carry the hold.
          if (mediaRecorderRef.current === rec) mediaRecorderRef.current = null;
          if (!recognitionRef.current) {
            askCancelledRef.current = true;
            askHoldingRef.current = false;
            setAskHolding(false);
            setVoiceJourneyActive(false);
            setVoiceNavigating(false);
            stopAskMeter();
            setAskError("Voice recording was interrupted. Try again.");
          }
        };

        rec.onstop = () => {
          if (mediaRecorderRef.current === rec) mediaRecorderRef.current = null;

          const cancelled = askCancelledRef.current;
          askCancelledRef.current = false;

          const mimeType =
            rec.mimeType ||
            (audioChunksRef.current[0] instanceof Blob
              ? (audioChunksRef.current[0] as Blob).type
              : "") ||
            "audio/webm";

          const blob = new Blob(audioChunksRef.current, { type: mimeType });
          audioChunksRef.current = [];

          // Only reached when the browser didn't catch the question: send it to Whisper.
          if (cancelled || didSubmitVoiceRef.current) return;
          void transcribeAskAudio(blob);
        };
      }

      setVoiceJourneyActive(true);
      setVoiceNavigating(false);
      askHoldStartRef.current = Date.now();
      askHoldingRef.current = true;
      setAskHolding(true);
      triggerIntakeHaptic();

      if (recorder) {
        try {
          recorder.start(250);
        } catch {
          mediaRecorderRef.current = null;
          if (!speechStarted) {
            askHoldingRef.current = false;
            setAskHolding(false);
            setVoiceJourneyActive(false);
            setAskError("Voice recording couldn't start. Try again.");
            return;
          }
        }
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => { void startAskMeter(); });
      });
    },
    [
      handleLockedFeature,
      hasVoiceReadingAccess,
      isTranscribingAsk,
      micEnabled,
      nudgeMicToggle,
      primeAskMeter,
      startAskMeter,
      startSpeechRecognition,
      stopAskMeter,
      stopSpeechRecognition,
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
    stopSpeechRecognition();
    stopAskRecorder(true);
    triggerIntakeHaptic();
  }, [stopAskMeter, stopAskRecorder, stopSpeechRecognition]);

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

    // Take what the browser heard before stopping it.
    const heard = transcriptRef.current.trim();
    stopSpeechRecognition();

    if (elapsed < ASK_MIN_HOLD_MS) {
      askCancelledRef.current = true;
      setVoiceJourneyActive(false);
      setVoiceNavigating(false);
      stopAskRecorder(true);
      setAskError("Press and hold while you speak.");
      return;
    }

    if (heard.length >= 2) {
      // The browser caught it: send immediately and discard the backup recording.
      didSubmitVoiceRef.current = true;
      stopAskRecorder(true);
      submitAskAnything(heard);
      return;
    }

    if (mediaRecorderRef.current) {
      // The browser didn't catch it (or isn't available): the recorder's onstop
      // sends the full recording to Whisper.
      stopAskRecorder(false);
      return;
    }

    setVoiceJourneyActive(false);
    setVoiceNavigating(false);
    setAskError("We didn't catch that. Hold the button and try again.");
  }, [stopAskMeter, stopAskRecorder, stopSpeechRecognition, submitAskAnything]);

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

  // A reading can begin once the chart is ready and nothing is already starting.
  const canBegin = chartStatus === "ready" && !isCreatingReading;
  const canBeginRef = useRef(canBegin);
  useEffect(() => {
    canBeginRef.current = canBegin;
  }, [canBegin]);

  // The line above the reading choices: "Please Select" at rest, or a
  // short status when something is happening. No countdown: the ring and the
  // fade show the timing.
  const directiveCopy = useMemo(() => {
    if (chartStatus === "recalculating" || chartStatus === "checking") return "Loading your chart…";
    if (chartStatus === "error") return "Chart unavailable · Try again";
    if (isCreatingReading || sentArea) return "Opening your reading…";
    return "Please Select";
  }, [chartStatus, isCreatingReading, sentArea]);

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
    setAmbienceArea(null);
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
    setAmbienceArea(areaId);
    triggerIntakeHaptic();
    // The tile flashes, then the screen fades to black while the reading starts.
    holdTimersRef.current.push(window.setTimeout(() => setReadingFade(true), 420));
    void handleStartReading(areaId);
  };

  const beginHold = (areaId: string) => {
    if (sendingRef.current || !canBeginRef.current) return;
    // Setting holdingArea starts the one continuous fade (see .focus-hold).
    setHoldingArea(areaId);
    triggerIntakeHaptic();
    holdTimersRef.current.push(
      window.setTimeout(triggerIntakeHaptic, HOLD_STEP_MS),
      window.setTimeout(triggerIntakeHaptic, HOLD_STEP_MS * 2),
      window.setTimeout(() => setAmbienceArea(areaId), HOLD_AMBIENCE_MS),
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
    setAmbienceArea(null);
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

  // Tell the pager to fade the sky behind the stars to black (one continuous
  // fade over the hold; releasing early brings it back).
  const focusActive = !!holdingArea || !!sentArea;
  useEffect(() => {
    const root = document.documentElement;
    if (focusActive) root.dataset.astroFocus = "hold";
    else delete root.dataset.astroFocus;
    return () => {
      delete root.dataset.astroFocus;
    };
  }, [focusActive]);

  // Tell the pager to fade in the aurora while voice is active
  // ("holding" makes it a little richer while the button is held).
  useEffect(() => {
    const root = document.documentElement;
    if (askHolding) root.dataset.astroVoice = "holding";
    else if (voiceJourneyActive || isTranscribingAsk || voiceNavigating) root.dataset.astroVoice = "on";
    else delete root.dataset.astroVoice;
    return () => {
      delete root.dataset.astroVoice;
    };
  }, [askHolding, voiceJourneyActive, isTranscribingAsk, voiceNavigating]);

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

  // Reading ambience: the held tile's theme from 75% of the hold, or the gold
  // Ask Anything theme once a voice question is sent. Keep the last theme so
  // the symbols fade out rather than vanish.
  const ambienceKey: ThemeKey | null = ambienceArea
    ? (ambienceArea as ThemeKey)
    : voiceNavigating
      ? "ask"
      : null;
  const lastAmbienceKeyRef = useRef<ThemeKey>("default");
  if (ambienceKey) lastAmbienceKeyRef.current = ambienceKey;

  const contextActive = !!selectedArea || contextFocused;
  // Keep the last description so it can fade out rather than vanish.
  const lastDescriptionRef = useRef("");
  if (selectedAreaConfig) lastDescriptionRef.current = selectedAreaConfig.description;
  const lastDescription = lastDescriptionRef.current;

  return (
    <div
      ref={intakeRootRef}
      className={`astro-intake ${focusActive ? "focus-hold" : ""} ${ambienceArea ? "ambience-on" : ""} ${askHolding ? "ask-holding" : ""} relative h-full min-h-full w-full min-w-0 max-w-full overflow-x-hidden bg-transparent text-slate-100`}
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
          /* Gentle in, gentle out: the hold's fade to dark has no visible steps. */
          --ease-hold: cubic-bezier(0.37, 0, 0.63, 1);
        }

        /* ── HERO GLASS SWEEP (on entry) ── */
        @keyframes heroShine {
          0% { transform: translateX(-140%) skewX(-18deg); }
          100% { transform: translateX(240%) skewX(-18deg); }
        }
        .hero-shine { position: relative; overflow: hidden; }
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

        /* ── HERO SHELL — no glow ring (the glow lives on the AstroProXL pill), just the shadow ── */
        .hero-glow-shell {
          position: relative;
          border-radius: 28px;
          box-shadow: 0 18px 44px rgba(0,0,0,0.72), 0 36px 80px rgba(0,0,0,0.56);
          transition: box-shadow .8s var(--ease-out);
        }
        .hero-glow-shell::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 0;
          border-radius: inherit;
          pointer-events: none;
          opacity: 0;
        }
        /* Twilight fill: deep indigo at the top settling into near-black, like dusk turning to night */
        .hero-twilight {
          background:
            radial-gradient(120% 70% at 50% -10%, rgba(99,102,241,0.22), transparent 70%),
            linear-gradient(180deg, rgba(30,27,75,0.55) 0%, rgba(10,12,28,0.75) 60%, rgba(5,7,17,0.85) 100%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
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
          border: 1px solid transparent;
          background: rgba(49,46,129,0.14);
          font-family: var(--caps);
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.34em;
          text-transform: uppercase;
          color: rgb(246,248,255);
          text-shadow: 0 0 12px rgba(236,241,255,0.40);
        }
        /* The pill shares the page outline's Edge Trace glow (outline glow 1.05 × pill balance 1.00). */
        .brand-pill::before {
          content: "";
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          pointer-events: none;
          box-shadow:
            0 0 10.5px 1.05px rgba(129,140,248,0.63),
            0 0 27.3px 3.15px rgba(94,234,212,0.315);
        }
        .brand-pill::after {
          content: "";
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          padding: 1px;
          pointer-events: none;
          background: linear-gradient(45deg, #5eead4, #818cf8 50%, #fbbf24);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0.75;
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

        /* ── SWIPE PROMPT — sits above the hero ── */
        .swipe-top {
          height: 32px;
          margin: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-family: var(--caps);
          font-size: 10.5px;
          font-weight: 500;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(203,213,225,0.7);
        }
        .swipe-arrow {
          font-family: var(--font-geist-sans, system-ui), sans-serif;
          font-size: 15px;
          letter-spacing: 0;
          animation: swipeNudge 2.8s ease-in-out infinite;
        }
        @keyframes swipeNudge {
          0%, 60%, 100% { transform: translateX(0); opacity: .6; }
          30% { transform: translateX(4px); opacity: 1; }
        }

        /* ── INFO SPACE — "Please Select" at rest; the pressed reading's description ── */
        .info-space { position: relative; height: 52px; }
        .info-layer {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0;
          padding: 0 8px;
          text-align: center;
          transition: opacity .9s var(--ease-soft) .15s, transform .9s var(--ease-soft) .15s;
        }
        .info-select {
          font-family: var(--caps);
          font-size: 12.5px;
          font-weight: 500;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(248,250,252,0.9);
        }
        .info-select:not(.is-error) { color: rgb(250,251,255); text-shadow: 0 0 12px rgba(236,241,255,0.40); }
        .info-select.is-error { color: rgba(253,164,175,0.92); font-size: 10.5px; letter-spacing: 0.2em; }
        .info-select.is-hidden { opacity: 0; transform: translateY(-4px); transition: opacity .3s ease, transform .3s ease; }
        .info-desc {
          font-family: var(--display);
          font-style: italic;
          font-weight: 500;
          font-size: 17px;
          line-height: 1.25;
          color: var(--hint, rgba(226,232,240,0.88));
          opacity: 0;
          transform: translateY(5px);
          pointer-events: none;
          transition: opacity .9s var(--ease-soft), transform .9s var(--ease-soft), color .9s var(--ease-soft);
        }
        /* The description shows softer than "Please Select" (60%). */
        .info-desc.is-shown { opacity: 0.6; transform: none; transition: opacity .45s ease, transform .55s var(--ease-out); }

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
          /* Nebula: a soft indigo light in one corner and teal in the other, like the sky behind. */
          background: radial-gradient(circle at 18% 0%, rgba(129,140,248,0.16), transparent 58%), radial-gradient(circle at 92% 110%, rgba(45,212,191,0.09), transparent 55%), linear-gradient(rgba(8,11,24,0.55), rgba(8,11,24,0.55));
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 34px rgba(0,0,0,0.78), 0 34px 68px rgba(0,0,0,0.46);
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
          background: linear-gradient(var(--bg), var(--bg)), radial-gradient(circle at 18% 0%, rgba(129,140,248,0.16), transparent 58%), radial-gradient(circle at 92% 110%, rgba(45,212,191,0.09), transparent 55%), linear-gradient(rgba(8,11,24,0.55), rgba(8,11,24,0.55));
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
        .ambience-on .astro-tile.is-holding { animation-duration: .6s; }
        @keyframes sendFlash {
          0% { transform: scale(1.05); }
          40% { transform: scale(1.1); box-shadow: 0 0 0 2px #fff, 0 0 50px 16px var(--g), 0 0 120px 40px var(--g); }
          100% { transform: scale(1.02); opacity: 0; }
        }
        .astro-tile.is-sent { animation: sendFlash .6s var(--ease-out) forwards; z-index: 3; }
        .astro-tile.is-sent::before { opacity: 1; --hold-progress: 360deg; }

        /* ── FOCUS: one continuous fade to dark across the whole hold (the stars stay, in the pager) ── */
        /* Opacity only: iOS Safari paints filter layers here as hard-edged dark boxes.
           Releasing early uses the shorter resting transitions to come back. */
        .astro-fade { transition: opacity .7s var(--ease-soft), text-shadow .7s var(--ease-soft); }
        .focus-hold .astro-fade,
        .focus-hold .astro-tile:not(.is-holding):not(.is-sent) {
          opacity: 0;
          transition: opacity ${HOLD_TOTAL_MS}ms var(--ease-hold), text-shadow ${HOLD_TOTAL_MS}ms var(--ease-hold);
        }
        /* The reading's description stays readable through the whole hold. */
        .focus-hold .info-space { opacity: 1; }
        /* Context the user typed doesn't fade: it's part of what's being sent. */
        .focus-hold .astro-fade.has-context { opacity: 1; }
        .focus-hold .hero-glow-shell { box-shadow: none; transition: box-shadow ${HOLD_TOTAL_MS}ms var(--ease-hold); }
        .focus-hold .hero-glow-shell::before { opacity: 0; transition: opacity ${HOLD_TOTAL_MS}ms var(--ease-hold); }

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
          font-family: var(--caps);
          font-size: 10.5px;
          font-weight: 500;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.96);
          animation: contextPulse 3.6s ease-in-out infinite;
        }
        /* A slow breath of white glow on the Add Context label. */
        @keyframes contextPulse {
          0%, 100% { opacity: 0.84; text-shadow: 0 0 6px rgba(255,255,255,0.18); }
          50%      { opacity: 1;    text-shadow: 0 0 12px rgba(255,255,255,0.55), 0 0 26px rgba(255,255,255,0.22); }
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
          height: 104px;
          border-radius: 28px;
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
          letter-spacing: 0.34em;
          text-transform: uppercase;
          color: rgba(236,214,170,0.72);
        }

        .mic-ready-toggle {
          position: relative;
          width: 34px;
          height: 80px;
          border-radius: 9999px;
          border: 1px solid rgba(203,213,225,0.14);
          background:
            radial-gradient(circle at 50% 12%, rgba(255,255,255,0.055), transparent 42%),
            linear-gradient(180deg, rgba(15,19,34,0.94), rgba(5,8,19,0.98));
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.055),
            0 12px 28px rgba(0,0,0,0.38);
          opacity: 0.74;
          filter: brightness(0.92) saturate(0.82);
          transition:
            opacity 520ms cubic-bezier(0.22,1,0.36,1),
            border-color 420ms cubic-bezier(0.22,1,0.36,1),
            box-shadow 420ms cubic-bezier(0.22,1,0.36,1),
            filter 420ms cubic-bezier(0.22,1,0.36,1);
        }
        /* Once on, the knob slides up and then the whole toggle fades away and stops
           taking taps. It returns when the mic switches off (e.g. leaving the app). */
        .mic-ready-toggle[data-enabled="true"] {
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transition:
            opacity 520ms cubic-bezier(0.22,1,0.36,1) 320ms,
            visibility 0s linear 840ms;
        }
        /* Pressing the mic while the toggle is off: a short shake with a gold edge. */
        @keyframes micNeedsYou {
          0%, 100% { transform: translateX(0) rotate(0); }
          12% { transform: translateX(-3px) rotate(-2deg); }
          25% { transform: translateX(3px) rotate(2deg); }
          37% { transform: translateX(-3px) rotate(-1.5deg); }
          50% { transform: translateX(2.4px) rotate(1deg); }
          62% { transform: translateX(-1.5px); }
          75% { transform: translateX(0.9px); }
        }
        .mic-ready-toggle.is-nudging {
          opacity: 1;
          filter: none;
          border-color: rgba(218,183,104,0.55);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.055),
            0 0 14px rgba(218,183,104,0.35),
            0 12px 28px rgba(0,0,0,0.38);
          animation: micNeedsYou 560ms cubic-bezier(.36,.07,.19,.97) 1;
        }
        .mic-ready-toggle.is-nudging .mic-ready-knob {
          box-shadow: 0 0 10px rgba(218,183,104,0.6), 0 3px 9px rgba(0,0,0,0.46);
        }

        /* Gold rings rolling out from the mic button while it's held (the button itself is unchanged). */
        @keyframes askRingOut {
          0%   { opacity: 0;    transform: scale(1); }
          12%  { opacity: 0.55; }
          100% { opacity: 0;    transform: scale(1.24); }
        }
        .ask-ring {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 104px;
          border-radius: 24px;
          z-index: 0;
          pointer-events: none;
          opacity: 0;
          border: 1px solid rgba(218,183,104,0.8);
          box-shadow: 0 0 14px rgba(218,183,104,0.28), inset 0 0 10px rgba(218,183,104,0.14);
        }
        .ask-holding .ask-ring { animation: askRingOut 2800ms cubic-bezier(0.2, 0.6, 0.35, 1) infinite; }
        .ask-holding .ask-ring.ring-2 { animation-delay: 933ms; }
        .ask-holding .ask-ring.ring-3 { animation-delay: 1867ms; }

        /* Center-stage waveform: 50% down the screen, 10% in on each side. */
        .ask-wave-stage {
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          height: 100px;
          transform: translateY(-50%);
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          opacity: 0;
          transition: opacity .5s var(--ease-soft);
        }
        .ask-wave-stage.is-on { opacity: 1; }
        .ask-wave-canvas { width: 80%; max-width: 460px; height: 100%; display: block; transition: opacity .3s ease; }
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
        .mic-ready-toggle[data-enabled="false"] .mic-ready-knob { top: 53px; }
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
          .swipe-arrow,
          .astro-tile,
          .astro-tile::before { animation: none !important; }
          .mic-ready-toggle,
          .mic-ready-knob { transition: none !important; }
          .ask-ring,
          .mic-ready-toggle.is-nudging,
          .context-placeholder { animation: none !important; }
        }
      `}</style>

      {/* Reading ambience: the chosen reading's themed symbols, behind the content.
          Same component and spots as the preparing screen, so the handoff is seamless. */}
      <ReadingAmbience
        themeKey={ambienceKey ?? lastAmbienceKeyRef.current}
        visible={!!ambienceKey}
        glow
      />

      <div
        className="relative z-10 mx-auto flex w-full min-w-0 max-w-[430px] flex-col justify-start px-[clamp(12px,4vw,16px)]"
        style={{
          minHeight: "100%",
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
          {/* ── SWIPE PROMPT — above the hero ── */}
          <button
            type="button"
            onClick={() => onSwipeLeft?.()}
            className="astro-fade swipe-top tap-fix"
            style={{ opacity: voiceVisualActive ? 0 : undefined }}
          >
            Swipe Left to Explore
            <span className="swipe-arrow" aria-hidden="true">&rsaquo;</span>
          </button>

          {/* ── HERO — fixed 236px brand card; fades out while asking aloud ── */}
          <section className="astro-fade mb-0 pt-0" style={{ opacity: voiceVisualActive ? 0 : undefined }}>
            <div className="hero-glow-shell">
              <div
                ref={heroStageRef}
                className={`hero-shine ${heroSweepActive ? "hero-shine-sweep" : ""} relative h-[236px] select-none overflow-hidden rounded-[28px] border border-white/[0.08] hero-twilight text-center`}
                onContextMenu={(e) => e.preventDefault()}
              >
                {/* One master canvas: the composition is designed at 374 × 236 and scaled to fit. */}
                <div
                  className="absolute left-1/2 top-1/2 z-10 h-[236px] w-[374px]"
                  style={{
                    transform: `translate(-50%, -50%) scale(${heroCompositionScale})`,
                    transformOrigin: "center center",
                  }}
                >
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
                </div>
              </div>
            </div>
          </section>

          {/* ── INFO SPACE — "Please Select" at rest; the pressed reading's description ── */}
          <div
            className="info-space transition-opacity duration-700"
            aria-live="polite"
            style={{
              opacity: voiceVisualActive ? 0 : undefined,
              "--hint": selectedAreaConfig ? getAreaColors(selectedAreaConfig.id).text : undefined,
            } as React.CSSProperties}
          >
            <p className={`info-layer info-select ${submitError ? "is-error" : ""} ${selectedAreaConfig ? "is-hidden" : ""}`}>
              {submitError ?? directiveCopy}
            </p>
            <p className={`info-layer info-desc ${selectedAreaConfig ? "is-shown" : ""}`}>
              {selectedAreaConfig?.description ?? lastDescription}
            </p>
          </div>

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

          {/* ── ADD CONTEXT (members) — soft gold edge while a reading is held ── */}
          <div
            data-reading-context="true"
            className={`astro-fade premium-context relative mt-6 h-[84px] rounded-[20px] border bg-transparent ${contextActive ? "premium-context-active" : ""} ${question.trim().length > 0 ? "has-context" : ""}`}
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

            <div className="relative h-full rounded-[20px] bg-transparent px-4 py-2 pr-16">
              {!contextFocused && question.length === 0 && (
                <div className="context-placeholder pointer-events-none absolute inset-0 flex items-center justify-center text-center">
                  {!canUseAddContext && lockedFeaturePrompt === "context"
                    ? "Become a Member"
                    : "Add Context"}
                </div>
              )}

              {!canUseAddContext && (
                <button
                  type="button"
                  className="absolute inset-0 z-20 rounded-[20px]"
                  aria-label="Adding context is included with Astro Plus"
                  onClick={() => handleLockedFeature("context")}
                  style={{ background: "transparent" }}
                />
              )}

              <Textarea
                id="question"
                rows={2}
                value={question}
                disabled={!canUseAddContext}
                aria-label="Add context for a detailed reading (optional)"
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
          <section className="astro-fade mt-[26px] pt-0">
            <div className="flex w-full items-center justify-center">
              <div className="ask-box relative h-[104px] w-[72%] max-w-[304px]">
                <span className="ask-ring" aria-hidden="true" />
                <span className="ask-ring ring-2" aria-hidden="true" />
                <span className="ask-ring ring-3" aria-hidden="true" />
                <button
                  type="button"
                  onPointerDown={startAskHold}
                  onPointerMove={moveAskHold}
                  onPointerUp={endAskHold}
                  onPointerCancel={endAskHold}
                  onContextMenu={(e) => e.preventDefault()}
                  onDragStart={(e) => e.preventDefault()}
                  onSelect={(e) => e.preventDefault()}
                  className="ask-premium tap-fix relative flex h-[104px] w-full items-center justify-center touch-none select-none transition-[transform,opacity,filter,box-shadow] duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
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
                  className={`mic-ready-toggle tap-fix ${micNudge ? "is-nudging" : ""}`}
                  data-enabled={micEnabled ? "true" : "false"}
                  aria-pressed={micEnabled}
                  aria-label={micEnabled ? "Turn microphone off" : "Turn microphone on"}
                  onClick={toggleMicrophone}
                  onAnimationEnd={() => setMicNudge(false)}
                  disabled={micConnecting || isTranscribingAsk}
                  style={{
                    position: "absolute",
                    left: "calc(100% + 6px)",
                    top: "12px",
                    zIndex: 2,
                    cursor: micConnecting || isTranscribingAsk ? "wait" : "pointer",
                  }}
                >
                  <span className="mic-ready-knob" />
                </button>
              </div>
            </div>

            {askError && !voiceVisualActive ? (
              <p className="mt-3 text-center text-[11px] text-slate-400/78">{askError}</p>
            ) : (
              <p className="ask-caption mt-[14px] text-center">
                {lockedFeaturePrompt === "voice" ? "Get Credits" : "Press · Hold · Speak"}
              </p>
            )}
          </section>
        </motion.div>
      </div>

      {/* ── Center-stage waveform while asking aloud ── */}
      <div className={`ask-wave-stage ${voiceVisualActive ? "is-on" : ""}`} aria-hidden="true">
        <canvas
          ref={canvasRef}
          className="ask-wave-canvas"
          style={{ opacity: askHolding ? 1 : 0.42 }}
        />
      </div>

      {/* Full-screen fade to black when a reading (voice or held tile) is opening. */}
      {fadePortalReady && createPortal(
        <motion.div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[9998] bg-black"
          initial={false}
          animate={{ opacity: voiceNavigating || readingFade ? 1 : 0 }}
          transition={{ duration: shouldReduceMotion ? 0.08 : 0.5, ease: [0.22, 1, 0.36, 1] }}
        />,
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
                  onClick={() => {
                    setClientSecret(null);
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
                      // Reading purchase: wait for the webhook to grant the
                      // reading credit, then continue into the preparing route.
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