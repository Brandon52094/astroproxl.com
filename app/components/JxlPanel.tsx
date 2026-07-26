"use client";

/**
 * JxlPanel — lives inside PagerContainer as a swipeable panel.
 *
 * POSITIONING NOTE (this is why it isn't the standalone shell):
 * The pager track has `transform: translateX(...)`. An ancestor with a
 * transform becomes the containing block for `position: fixed` descendants,
 * so anything fixed in here would anchor to the TRACK — five panels wide —
 * instead of the screen. Everything is therefore `absolute` inside a
 * `relative` root, and the content area is its own scroll container so the
 * sky and dock stay put while the answer scrolls.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { loadChart } from "@/lib/chartStore";

/* ── Minimal SpeechRecognition typings ──────────────────────────────────── */
interface SpeechRecognitionAlternative { readonly transcript: string }
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}
interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface JxlWindow {
  date: string;
  body: string;
}
interface JxlDirective {
  type: string;
  date: string | null;
  body: string;
}
interface JxlResult {
  title: string;
  answer: string;
  windows: JxlWindow[];
  directives: JxlDirective[];
  sources?: Array<{ factor: string; placements: string }>;
  confirmation: string;
  careNote?: string | null;
  isSafeResponse?: boolean;
  replyNumber: number | null;
}

interface JxlPanelProps {
  isActive?: boolean;
  onBack?: () => void;
}

const REPLIES_PER_SESSION = 3;
const MIN_HOLD_MS = 450;
const MIC_GRANTED_KEY = "jxl_mic_permission_granted";

// Waveform look
const WAVE = {
  sensitivity: 1.1,
  idle: 0.19,
  lines: 3,
  speed: 1.8,
  glow: 16,
  thickness: 2.3,
  colors: ["#22c55e", "#3b82f6", "#a855f7", "#ef4444", "#f59e0b"],
};

/* ── Haptics ────────────────────────────────────────────────────────────── */
function triggerHaptic() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(12);
    }
    const el = document.getElementById("jxl-haptic") as HTMLInputElement | null;
    if (el) el.click();
  } catch {
    // Haptics are a nicety, never a failure path.
  }
}

/* ── Shooting stars ─────────────────────────────────────────────────────── */
interface Shooter {
  id: number;
  top: number;
  left: number;
  distance: number;
  duration: number;
}

function useShootingStars(enabled: boolean) {
  const [shooters, setShooters] = useState<Shooter[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setShooters([]);
      return;
    }
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timeout = setTimeout(() => {
        const id = ++idRef.current;
        const s: Shooter = {
          id,
          top: Math.random() * 42,
          left: 5 + Math.random() * 55,
          distance: 180 + Math.random() * 160,
          duration: 700 + Math.random() * 400,
        };
        setShooters((prev) => [...prev, s]);
        setTimeout(() => setShooters((prev) => prev.filter((x) => x.id !== id)), s.duration + 200);
        schedule();
      }, 9000 + Math.random() * 8000);
    };
    schedule();
    return () => clearTimeout(timeout);
  }, [enabled]);

  return shooters;
}

type Phase =
  | "idle"
  | "holding"
  | "tooShort"
  | "composing"
  | "thinking"
  | "answered"
  | "denied";

/* ── Loading Ring Component ────────────────────────────────────────────── */
interface LoadingRingProps {
  isActive: boolean;
  apiReady: boolean;
  onComplete?: () => void;
}

function LoadingRing({ isActive, apiReady, onComplete }: LoadingRingProps) {
  const [phase, setPhase] = useState<"idle" | "running" | "complete" | "fading">("idle");
  const [progress, setProgress] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // Read apiReady live inside the RAF loop WITHOUT restarting the effect.
  const apiReadyRef = useRef(apiReady);
  useEffect(() => { apiReadyRef.current = apiReady; }, [apiReady]);

  const completingRef = useRef(false);
  const completeStartRef = useRef<number | null>(null);
  const completeFromRef = useRef(0);

  useEffect(() => {
    if (!isActive) {
      setPhase("idle");
      setProgress(0);
      completingRef.current = false;
      completeStartRef.current = null;
      startTimeRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    setPhase("running");
    setProgress(0);
    completingRef.current = false;
    completeStartRef.current = null;
    startTimeRef.current = performance.now();

    const CAP = 0.9;          // how far it crawls before the API lands
    const FILL_MS = 3000;     // time to crawl toward the cap
    const MIN_FILL_MS = 900;  // don't let a fast API make the ring blink
    const SWEEP_MS = 550;     // final sweep to 100%

    const animate = (now: number) => {
      if (startTimeRef.current == null) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;

      const t = Math.min(elapsed / FILL_MS, 1);
      const easedFill = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      // Once the API is ready (and we've filled a minimum), sweep to 100% and finish.
      if (completingRef.current || (apiReadyRef.current && elapsed >= MIN_FILL_MS)) {
        if (!completingRef.current) {
          completingRef.current = true;
          completeStartRef.current = now;
          completeFromRef.current = easedFill * CAP; // snapshot where we were
        }
        const ct = Math.min((now - (completeStartRef.current ?? now)) / SWEEP_MS, 1);
        const eased = 1 - Math.pow(1 - ct, 3); // easeOutCubic
        setProgress(completeFromRef.current + (1 - completeFromRef.current) * eased);

        if (ct >= 1) {
          setPhase("complete");
          setTimeout(() => setPhase("fading"), 300);
          if (onComplete) setTimeout(onComplete, 380); // reading fades in as edge fades out
          return; // stop the loop
        }
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      // Not ready yet: ease toward the cap and hold.
      setProgress(easedFill * CAP);
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isActive, onComplete]);

  if (phase === "idle") return null;

  const isComplete = phase === "complete" || phase === "fading";
  const isFading = phase === "fading";
  const circumference = 289;
  const dashOffset = circumference * (1 - progress);

  return (
    <div
      className={`fixed inset-0 pointer-events-none z-[80] ${isFading ? 'opacity-0 transition-opacity duration-600' : ''}`}
      aria-hidden="true"
    >
      <style jsx>{`
        @keyframes ringPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
        @keyframes flashOut {
          0% { opacity: 0.6; }
          100% { opacity: 0; }
        }
        .ring-glow {
          position: absolute;
          inset: -8px;
          border-radius: 50%;
          filter: blur(30px);
          opacity: 0.12;
          background: conic-gradient(
            from 0deg,
            transparent 0%,
            rgba(94, 234, 212, 0.6) 25%,
            rgba(129, 90, 240, 0.6) 50%,
            rgba(251, 191, 36, 0.6) 75%,
            transparent 100%
          );
          animation: ringPulse 2.4s ease-in-out infinite;
        }
        .ring-glow.complete {
          animation: none;
          opacity: 0.2;
        }
        .ring-label {
          position: absolute;
          bottom: max(env(safe-area-inset-bottom, 20px), 100px);
          left: 50%;
          transform: translateX(-50%);
          color: rgba(148, 163, 184, 0.7);
          font-size: 13px;
          font-family: var(--font-sans, ui-sans-serif);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          animation: ringPulse 1.6s ease-in-out infinite;
          text-align: center;
          transition: opacity 0.5s ease;
        }
        .ring-label.complete {
          animation: none;
          color: rgba(94, 234, 212, 0.9);
        }
        .ring-label .dots span {
          display: inline-block;
          width: 5px;
          height: 5px;
          margin: 0 2px;
          border-radius: 50%;
          background: rgba(94, 234, 212, 0.6);
          animation: dotPulse 1.2s ease-in-out infinite;
        }
        .ring-label .dots span:nth-child(2) { animation-delay: 0.2s; }
        .ring-label .dots span:nth-child(3) { animation-delay: 0.4s; }
        .ring-flash {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, rgba(94, 234, 212, 0.15), transparent 60%);
          opacity: 0;
          animation: flashOut 0.7s ease forwards;
          pointer-events: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .ring-glow,
          .ring-label,
          .ring-label .dots span {
            animation: none !important;
          }
        }
        .transition-opacity {
          transition: opacity 0.6s ease;
        }
        .duration-600 {
          transition-duration: 600ms;
        }
      `}</style>

      <div className={`ring-glow ${isComplete ? 'complete' : ''}`} />

      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ filter: 'drop-shadow(0 0 12px rgba(94, 234, 212, 0.2))' }}
      >
        <defs>
          <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5eead4" />
            <stop offset="33%" stopColor="#818cf8" />
            <stop offset="66%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#5eead4" />
          </linearGradient>
          <filter id="ringGlowFilter">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="2"
        />

        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="url(#ringGradient)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transition: isComplete ? 'stroke-dashoffset 0.6s ease' : 'stroke-dashoffset 0.05s linear',
            transform: 'rotate(-90deg)',
            transformOrigin: 'center',
            filter: 'url(#ringGlowFilter)',
            stroke: isComplete ? 'rgba(94, 234, 212, 0.8)' : 'url(#ringGradient)',
          }}
        />
      </svg>

      <div className={`ring-label ${isComplete ? 'complete' : ''}`}>
        {isComplete ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>✦</span> Ready
          </span>
        ) : (
          <>
            Reading the sky
            <span className="dots">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </>
        )}
      </div>

      {isComplete && <div className="ring-flash" />}
    </div>
  );
}

export default function JxlPanel({ isActive = true, onBack }: JxlPanelProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const [holdMs, setHoldMs] = useState(0);
  const [draft, setDraft] = useState("");
  const [reduceMotion, setReduceMotion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ question: string; answer: string }>>([]);
  const [result, setResult] = useState<JxlResult | null>(null);

  // ── Loading ring state ──
  const [isLoadingRingActive, setIsLoadingRingActive] = useState(false);
  const [apiReady, setApiReady] = useState(false);

  const holdStart = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const composeRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ── Speech recognition ──────────────────────────────────────────────
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptRef = useRef("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [heard, setHeard] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);

  // ── Audio meter ─────────────────────────────────────────────────────
  const meterStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── Mic permission state ────────────────────────────────────────────
  const [micPermission, setMicPermission] = useState<PermissionState | "unknown">("unknown");
  const micPermissionRef = useRef<PermissionState | "unknown">("unknown");
  useEffect(() => {
    micPermissionRef.current = micPermission;
  }, [micPermission]);

  // ── Persistent permission memory ────────────────────────────────────
  const [hasStoredPermission, setHasStoredPermission] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(MIC_GRANTED_KEY) === "true";
    }
    return false;
  });

  // When permission is granted, store it
  useEffect(() => {
    if (micPermission === "granted") {
      try {
        localStorage.setItem(MIC_GRANTED_KEY, "true");
        setHasStoredPermission(true);
        console.log("[jxl/mic] Stored permission grant in localStorage");
      } catch {}
    }
  }, [micPermission]);

  // Pre-flight: if we have stored permission but the browser is "prompt" status,
  // silently try to re-acquire the mic without showing the prompt.
  useEffect(() => {
    if (!hasStoredPermission) return;
    if (micPermission === "granted") return;
    if (micPermission === "denied") {
      localStorage.removeItem(MIC_GRANTED_KEY);
      setHasStoredPermission(false);
      console.log("[jxl/mic] Permission was revoked — clearing stored flag");
      return;
    }

    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
          stream.getTracks().forEach(t => t.stop());
          setMicPermission("granted");
          console.log("[jxl/mic] Pre-flight: silently re-acquired mic permission");
        })
        .catch(() => {
          console.log("[jxl/mic] Pre-flight: silent re-acquire failed, will prompt on hold");
        });
    }
  }, [hasStoredPermission, micPermission]);

  // ── Stop meter ──────────────────────────────────────────────────────
  const stopMeter = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      analyserRef.current?.disconnect();
    } catch {
      /* noop */
    }
    analyserRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (meterStreamRef.current) {
      meterStreamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch { /* noop */ }
      });
      meterStreamRef.current = null;
    }
    // Clear the canvas so it doesn't freeze mid-wave
    const canvas = canvasRef.current;
    const c2d = canvas?.getContext("2d");
    if (canvas && c2d) {
      c2d.setTransform(1, 0, 0, 1, 0, 0);
      c2d.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  // ── Start meter ─────────────────────────────────────────────────────
  const startMeter = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return;
    }

    if (phaseRef.current !== "holding") {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    meterStreamRef.current = stream;

    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);
      analyserRef.current = analyser;

      const freq = new Uint8Array(analyser.frequencyBinCount);
      const canvas = canvasRef.current;
      const c2d = canvas?.getContext("2d") ?? null;
      let smooth = 0;
      let time = 0;
      let cw = 0, ch = 0, dpr = 1;

      const fit = () => {
        if (!canvas || !c2d) return;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        const r = canvas.getBoundingClientRect();
        cw = r.width; ch = r.height;
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
        c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      fit();

      const draw = () => {
        if (!cw || !ch) fit();
        time += 0.016 * WAVE.speed;
        analyser.getByteFrequencyData(freq);
        let sum = 0, cnt = 0;
        const lo = 2, hi = Math.max(lo + 1, Math.floor(freq.length * 0.5));
        for (let i = lo; i < hi; i++) { sum += freq[i]; cnt++; }
        const energy = cnt ? (sum / cnt) / 255 : 0;
        smooth += (energy - smooth) * 0.18;

        if (c2d && cw && ch) {
          const cy = ch / 2;
          c2d.clearRect(0, 0, cw, ch);
          const grad = c2d.createLinearGradient(0, 0, cw, 0);
          WAVE.colors.forEach((col, i) => grad.addColorStop(i / (WAVE.colors.length - 1), col));
          c2d.lineCap = "round";
          c2d.lineJoin = "round";
          c2d.globalCompositeOperation = "lighter";
          const amp = (WAVE.idle + smooth * WAVE.sensitivity) * (ch * 0.44);
          for (let l = 0; l < WAVE.lines; l++) {
            const lf = WAVE.lines > 1 ? l / (WAVE.lines - 1) : 0;
            const phase = time * (1 + lf * 0.45) + l * 0.7;
            const la = amp * (1 - lf * 0.14);
            c2d.beginPath();
            for (let x = 0; x <= cw; x += 3) {
              const tx = x / cw;
              const env = Math.pow(Math.sin(tx * Math.PI), 0.85);
              const y = cy + env * la * (
                Math.sin(tx * Math.PI * 4 + phase) * 0.6 +
                Math.sin(tx * Math.PI * 7 - phase * 0.7 + l) * 0.4
              );
              x === 0 ? c2d.moveTo(x, y) : c2d.lineTo(x, y);
            }
            c2d.strokeStyle = grad;
            c2d.globalAlpha = 0.16 + (1 - lf) * 0.22;
            c2d.lineWidth = WAVE.thickness * (0.7 + (1 - lf) * 0.8);
            c2d.shadowBlur = WAVE.glow;
            c2d.shadowColor = "rgba(129,140,248,0.5)";
            c2d.stroke();
          }
          // Hot near-white core
          const coreAmp = (WAVE.idle * 0.5 + smooth * WAVE.sensitivity * 1.15) * (ch * 0.44);
          c2d.beginPath();
          for (let x = 0; x <= cw; x += 2) {
            const tx = x / cw;
            const env = Math.pow(Math.sin(tx * Math.PI), 0.9);
            const y = cy + env * coreAmp * Math.sin(tx * Math.PI * 5 + time * 1.4) * 0.9;
            x === 0 ? c2d.moveTo(x, y) : c2d.lineTo(x, y);
          }
          c2d.globalAlpha = 0.3 + smooth * 0.5;
          c2d.strokeStyle = "rgba(255,255,255,0.92)";
          c2d.lineWidth = Math.max(1, WAVE.thickness * 0.6);
          c2d.shadowBlur = WAVE.glow * 1.3;
          c2d.shadowColor = "rgba(255,255,255,0.7)";
          c2d.stroke();
          c2d.globalCompositeOperation = "source-over";
          c2d.globalAlpha = 1;
          c2d.shadowBlur = 0;
        }
        rafRef.current = requestAnimationFrame(draw);
      };
      draw();
    } catch {
      stopMeter();
    }
  }, [stopMeter]);

  // ── Feature detect ──────────────────────────────────────────────────
  const [speechSupported, setSpeechSupported] = useState<boolean | null>(null);
  useEffect(() => {
    const SR =
      (typeof window !== "undefined" &&
        ((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
          (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition)) ||
      null;
    setSpeechSupported(Boolean(SR));
  }, []);

  // ── Permission query ────────────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) {
      if (typeof window !== "undefined") {
        console.log(`[jxl/mic] Permissions API unavailable — secureContext=${window.isSecureContext} protocol=${location.protocol}`);
      }
      return;
    }
    let status: PermissionStatus | null = null;
    navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((s) => {
        status = s;
        setMicPermission(s.state);
        console.log(`[jxl/mic] secureContext=${window.isSecureContext} protocol=${location.protocol} host=${location.host} permission=${s.state}`);
        s.onchange = () => {
          console.log(`[jxl/mic] permission changed -> ${s.state}`);
          setMicPermission(s.state);
        };
      })
      .catch(() => setMicPermission("unknown"));
    return () => { if (status) status.onchange = null; };
  }, []);

  // ── Stop recognition ────────────────────────────────────────────────
  const stopRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.stop();
      } catch {
        /* already stopped */
      }
      recognitionRef.current = null;
    }
  }, []);

  // ── Reduced motion ──────────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const animate = isActive && !reduceMotion;
  const shooters = useShootingStars(animate);
  const isHolding = phase === "holding";
  const repliesUsed = history.length;
  const repliesLeft = Math.max(0, REPLIES_PER_SESSION - repliesUsed);
  const sessionOver = repliesLeft <= 0;

  useEffect(() => {
    if (phase === "composing") {
      setTimeout(() => composeRef.current?.focus(), 60);
    }
  }, [phase]);

  // ── Loading ring complete ──
  const handleLoadingComplete = useCallback(() => {
    setIsLoadingRingActive(false);
    setApiReady(false);
    setPhase("answered");
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // ── Ask ─────────────────────────────────────────────────────────────
  const ask = async (question: string) => {
    const chart = loadChart();
    if (!chart?.chartData) {
      setError("Your chart isn't loaded yet. Run a reading first, then come back.");
      setPhase("idle");
      return;
    }

    setPhase("thinking");
    setError(null);
    setApiReady(false);
    setIsLoadingRingActive(true);

    try {
      const res = await fetch("/api/jxl/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          conversationHistory: history,
          tropical: chart.chartData.tropical,
          sidereal: chart.chartData.sidereal,
          transits: chart.chartData.transits,
          transitAspects: chart.chartData.transitAspects,
          profection: chart.chartData.profection,
          progressions: chart.chartData.progressions,
          solarArcs: chart.chartData.solarArcs,
          upcomingTrigger: chart.chartData.upcomingTrigger,
          planetaryStations: chart.chartData.planetaryStations,
          solarReturn: chart.chartData.solarReturn,
          moonPhase: chart.chartData.moonPhase,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        setDraft(question);
        setPhase("composing");
        setIsLoadingRingActive(false);
        return;
      }

      setResult(data as JxlResult);
      if (!data.isSafeResponse) {
        setHistory((prev) => [...prev, { question, answer: data.answer }]);
      }
      setDraft("");
      setShowSources(false);
      setApiReady(true);
    } catch {
      setError("Something went wrong. Try again.");
      setDraft(question);
      setPhase("composing");
      setIsLoadingRingActive(false);
    }
  };

  const submitTyped = () => {
    const q = draft.trim();
    if (!q || phase === "thinking") return;
    setHeard(q);
    void ask(q);
  };

  // ── Press and hold ──────────────────────────────────────────────────
  const startHold = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (phase === "thinking" || sessionOver) return;

      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setError(null);
      setHeard(null);

      // Known-denied mic → go straight to typing
      if (micPermissionRef.current === "denied") {
        setError("Microphone access is off. Allow it in your settings, or type instead.");
        setPhase("composing");
        return;
      }

      const SR =
        (window as unknown as { SpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition })
          .webkitSpeechRecognition;

      if (!SR) {
        setPhase("composing");
        return;
      }

      transcriptRef.current = "";
      setLiveTranscript("");

      const rec = new SR();
      rec.lang = "en-US";
      rec.interimResults = true;
      rec.continuous = true;
      recognitionRef.current = rec;

      rec.onresult = (event: SpeechRecognitionEvent) => {
        let finalText = "";
        let interim = "";
        for (let i = 0; i < event.results.length; i++) {
          const r = event.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        const combined = (finalText + " " + interim).replace(/\s+/g, " ").trim();
        transcriptRef.current = combined;
        setLiveTranscript(combined);
      };

      rec.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          stopRecognition();
          stopMeter();
          if (holdTimer.current) clearInterval(holdTimer.current);
          setPhase("denied");
          setError("Microphone access is off. Allow it in your browser settings, or type instead.");
        }
      };

      rec.onend = () => {
        recognitionRef.current = null;
      };

      try {
        rec.start();
      } catch {
        setPhase("composing");
        return;
      }

      triggerHaptic();
      holdStart.current = Date.now();
      setHoldMs(0);
      setPhase("holding");
      holdTimer.current = setInterval(() => setHoldMs(Date.now() - holdStart.current), 100);

      void startMeter();
    },
    [phase, sessionOver, stopRecognition, stopMeter, startMeter]
  );

  const endHold = useCallback(() => {
    if (phase !== "holding") return;
    if (holdTimer.current) {
      clearInterval(holdTimer.current);
      holdTimer.current = null;
    }
    const elapsed = Date.now() - holdStart.current;
    triggerHaptic();
    stopRecognition();
    stopMeter();

    const said = transcriptRef.current.trim();

    if (elapsed < MIN_HOLD_MS) {
      setLiveTranscript("");
      transcriptRef.current = "";
      setPhase("tooShort");
      setTimeout(() => setPhase((p) => (p === "tooShort" ? "idle" : p)), 1500);
      return;
    }

    if (!said || said.length < 2) {
      setDraft(said);
      setLiveTranscript("");
      transcriptRef.current = "";
      setError("Didn't quite catch that — check it or type it.");
      setPhase("composing");
      return;
    }

    setLiveTranscript("");
    transcriptRef.current = "";
    setHeard(said);
    void ask(said);
  }, [phase, stopRecognition, stopMeter]);

  // ── Cleanup on unmount ──────────────────────────────────────────────
  useEffect(
    () => () => {
      if (holdTimer.current) clearInterval(holdTimer.current);
      stopRecognition();
      stopMeter();
    },
    [stopRecognition, stopMeter]
  );

  // ── Tab hidden backstop ─────────────────────────────────────────────
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden" && phaseRef.current === "holding") {
        if (holdTimer.current) clearInterval(holdTimer.current);
        stopRecognition();
        stopMeter();
        setLiveTranscript("");
        transcriptRef.current = "";
        setPhase("idle");
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [stopRecognition, stopMeter]);

  useEffect(() => {
    if (!isActive && phaseRef.current === "holding") {
      if (holdTimer.current) clearInterval(holdTimer.current);
      stopRecognition();
      stopMeter();
      setLiveTranscript("");
      transcriptRef.current = "";
      setPhase("idle");
    }
  }, [isActive, stopRecognition, stopMeter]);

  const buttonLabel = sessionOver
    ? "That's all for now"
    : isHolding
    ? "Listening…"
    : phase === "thinking"
    ? "Reading the sky…"
    : phase === "tooShort"
    ? "Hold a little longer"
    : "Press · Hold · Speak";

  const swallowTouch = (e: React.TouchEvent) => e.stopPropagation();

  return (
    <div className="jxl-panel">
      {/* Hidden control that fires a real system haptic on iOS 17.4+ */}
      {/* @ts-expect-error — `switch` is valid in iOS Safari, absent from React's types */}
      <input id="jxl-haptic" type="checkbox" switch="" aria-hidden="true" tabIndex={-1} className="haptic-proxy" />

      {/* ── Loading Ring ── */}
      <LoadingRing isActive={isLoadingRingActive} apiReady={apiReady} onComplete={handleLoadingComplete} />

      <style jsx>{`
        .jxl-panel {
          position: relative;
          height: 100%;
          width: 100%;
          overflow: hidden;
          background: #05060f;
          color: #e6e9f5;
          font-family: var(--font-sans, ui-sans-serif, system-ui);
        }
        .haptic-proxy {
          position: absolute;
          left: -9999px;
          width: 1px;
          height: 1px;
          opacity: 0;
          pointer-events: none;
        }

        /* ── SKY ── */
        .sky {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          z-index: 0;
        }
        .sky.paused :global(*) {
          animation-play-state: paused !important;
        }

        .aurora {
          position: absolute;
          inset: -30%;
        }
        .band {
          position: absolute;
          width: 80%;
          height: 55%;
          border-radius: 50%;
          will-change: transform, opacity;
          mix-blend-mode: screen;
          transition: filter 1200ms ease;
        }
        .band.a {
          top: 2%; left: -10%;
          background: radial-gradient(closest-side, rgba(45,212,191,0.30) 0%, rgba(45,212,191,0.14) 42%, rgba(45,212,191,0) 72%);
          animation: drift-a 48s ease-in-out infinite;
        }
        .band.b {
          top: 12%; left: 22%;
          background: radial-gradient(closest-side, rgba(129,90,240,0.28) 0%, rgba(129,90,240,0.12) 44%, rgba(129,90,240,0) 74%);
          animation: drift-b 62s ease-in-out infinite;
        }
        .band.c {
          top: -4%; left: 8%;
          background: radial-gradient(closest-side, rgba(56,132,255,0.22) 0%, rgba(56,132,255,0.10) 46%, rgba(56,132,255,0) 74%);
          animation: drift-c 55s ease-in-out infinite;
        }
        .band.d {
          top: 26%; left: -4%; height: 42%;
          background: radial-gradient(closest-side, rgba(251,191,36,0.10) 0%, rgba(251,191,36,0.04) 44%, rgba(251,191,36,0) 72%);
          animation: drift-d 74s ease-in-out infinite;
        }
        @keyframes drift-a {
          0%,100% { transform: translate3d(-4%,0,0) scale(1); opacity: 0.85; }
          50% { transform: translate3d(14%,4%,0) scale(1.18); opacity: 1; }
        }
        @keyframes drift-b {
          0%,100% { transform: translate3d(6%,2%,0) scale(1.1); opacity: 0.7; }
          50% { transform: translate3d(-12%,-3%,0) scale(1); opacity: 0.95; }
        }
        @keyframes drift-c {
          0%,100% { transform: translate3d(8%,-2%,0) scale(1); opacity: 0.6; }
          50% { transform: translate3d(-6%,5%,0) scale(1.22); opacity: 0.9; }
        }
        @keyframes drift-d {
          0%,100% { transform: translate3d(0,3%,0) scale(1.05); opacity: 0.5; }
          50% { transform: translate3d(10%,-4%,0) scale(1.15); opacity: 0.8; }
        }
        .sky.listening .band { filter: saturate(1.4); }

        .star { position: absolute; border-radius: 9999px; background: #fff; }
        @keyframes tw-far { 0%,100% { opacity: 0.15; } 50% { opacity: 0.5; } }
        @keyframes tw-near {
          0%,100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.95; transform: scale(1.35); }
        }

        .shooter {
          position: absolute;
          width: 2px; height: 2px;
          border-radius: 9999px;
          background: #fff;
          box-shadow: 0 0 6px 1px rgba(255,255,255,0.65);
          opacity: 0;
        }
        .shooter::after {
          content: "";
          position: absolute;
          top: 50%; right: 1px;
          width: 62px; height: 1px;
          transform: translateY(-50%) rotate(-45deg);
          transform-origin: right center;
          background: linear-gradient(to left, rgba(255,255,255,0.75), rgba(255,255,255,0));
        }

        /* ── CONTENT ── */
        .scroller {
          position: absolute;
          inset: 0;
          z-index: 10;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding: max(env(safe-area-inset-top), 52px) 20px calc(220px + env(safe-area-inset-bottom));
        }
        .inner { max-width: 560px; margin: 0 auto; }

        .topbar { display: flex; align-items: flex-start; gap: 12px; }
        .back {
          height: 44px; width: 44px; border-radius: 9999px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.04);
          color: #c7cde0;
          display: flex; align-items: center; justify-content: center;
        }
        .eyebrow {
          flex: 1; text-align: center; padding-top: 8px;
          font-size: 10px; letter-spacing: 0.28em; text-transform: uppercase;
          color: rgba(148,163,184,0.75);
        }

        .title-slot {
          min-height: 120px;
          display: flex; align-items: center; justify-content: center;
          text-align: center;
          padding: 24px 0 4px;
        }
        .title {
          font-family: var(--font-display, Georgia, serif);
          font-size: 29px; line-height: 1.16; font-weight: 600;
          color: #fff; letter-spacing: -0.01em;
          animation: titleIn 700ms cubic-bezier(0.2,0.7,0.2,1) both;
        }
        @keyframes titleIn {
          from { opacity: 0; transform: translateY(10px); filter: blur(6px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        .ghost {
          font-family: var(--font-display, Georgia, serif);
          font-size: 15px; font-style: italic;
          color: rgba(148,163,184,0.45);
          max-width: 250px; line-height: 1.6;
        }

        .answer {
          font-family: var(--font-display, Georgia, serif);
          font-size: 17px; line-height: 1.85;
          color: #d7dcea;
          white-space: pre-wrap;
          animation: fadeIn 700ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); filter: blur(4px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }

        .window {
          margin-top: 14px; padding: 13px 16px;
          border: 1px solid rgba(251,191,36,0.32);
          background: linear-gradient(135deg, rgba(251,191,36,0.09), rgba(217,119,6,0.04));
          border-radius: 16px;
          animation: rise 500ms ease both;
        }
        .window-date {
          font-size: 12px; font-weight: 700; letter-spacing: 0.14em;
          text-transform: uppercase; color: #fbbf24;
        }
        .window-body {
          font-family: var(--font-display, Georgia, serif);
          font-size: 15px; line-height: 1.7; color: #cbd2e2; margin-top: 5px;
        }

        .directive {
          margin-top: 14px; padding-left: 14px;
          border-left: 2px solid #2dd4bf;
          animation: rise 550ms ease both;
        }
        .directive.drop { border-left-color: #f87171; }
        .directive.lock { border-left-color: #fbbf24; }
        .directive-label {
          font-size: 10px; font-weight: 700; letter-spacing: 0.16em;
          text-transform: uppercase; color: #2dd4bf;
        }
        .directive.drop .directive-label { color: #f87171; }
        .directive.lock .directive-label { color: #fbbf24; }
        .directive-body {
          font-family: var(--font-display, Georgia, serif);
          font-size: 14.5px; line-height: 1.7; color: #cbd2e2; margin-top: 4px;
        }

        .confirmation {
          margin-top: 28px; padding-top: 18px;
          border-top: 1px solid rgba(255,255,255,0.07);
          font-family: var(--font-display, Georgia, serif);
          font-size: 15px; line-height: 1.75; font-style: italic;
          text-align: center; color: #aeb6cc;
          animation: rise 700ms ease both;
        }
        .care {
          margin-top: 18px; padding: 12px 15px;
          border-radius: 14px;
          background: rgba(20,29,28,0.7);
          border: 1px solid rgba(31,58,54,0.9);
          font-size: 13px; line-height: 1.65; color: #8fbfb6;
        }

        .sources {
          margin-top: 26px;
          border-top: 1px solid rgba(255,255,255,0.07);
          padding-top: 14px;
        }
        .sources-toggle {
          display: flex; align-items: center; justify-content: space-between;
          width: 100%;
          background: none; border: none; cursor: pointer;
          padding: 4px 0;
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
          color: rgba(148,163,184,0.75);
        }
        .sources-toggle:hover { color: rgba(148,163,184,1); }
        .chev {
          font-size: 15px; line-height: 1;
          transition: transform 240ms ease;
          color: rgba(94,234,212,0.7);
        }
        .chev.open { transform: rotate(180deg); }
        .sources-body {
          margin-top: 12px;
          display: flex; flex-direction: column; gap: 10px;
          animation: rise 320ms ease both;
        }
        .source-row {
          padding: 11px 14px;
          border-radius: 12px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
        }
        .source-factor {
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 10px; font-weight: 600;
          letter-spacing: 0.14em; text-transform: uppercase;
          color: rgba(94,234,212,0.85);
        }
        .source-placements {
          font-size: 13px; line-height: 1.6;
          color: #aab2c5; margin-top: 4px;
        }
        @keyframes rise {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* ── DOCK ── */
        .dock {
          position: absolute;
          left: 0; right: 0; bottom: 0;
          z-index: 30;
          padding: 16px 20px calc(18px + env(safe-area-inset-bottom));
          background: linear-gradient(180deg, rgba(5,6,15,0) 0%, rgba(5,6,15,0.88) 42%, rgba(5,6,15,0.98) 100%);
        }
        .replies {
          text-align: center; font-size: 11px; letter-spacing: 0.08em;
          color: rgba(148,163,184,0.5); margin-bottom: 10px; min-height: 14px;
        }
        .err {
          text-align: center; font-size: 12px; color: #f0a8a8; margin-bottom: 8px;
        }

        .compose {
          width: 100%;
          background: rgba(10,14,30,0.85);
          border: 1px solid rgba(94,234,212,0.28);
          border-radius: 18px;
          color: #e6e9f5;
          font-size: 16px;
          font-family: inherit;
          padding: 13px 15px;
          outline: none;
          resize: none;
        }
        .compose:focus { border-color: rgba(94,234,212,0.6); }
        .compose-row { display: flex; gap: 10px; margin-top: 10px; }
        .send {
          flex: 1; height: 50px; border-radius: 16px; border: none;
          background: #5eead4; color: #042f2e;
          font-size: 15px; font-weight: 700; cursor: pointer;
        }
        .send:disabled { opacity: 0.4; cursor: default; }
        .cancel {
          height: 50px; padding: 0 18px; border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.12);
          background: transparent; color: #8b93a7;
          font-size: 14px; cursor: pointer;
        }
        .type-instead {
          display: block;
          margin: 10px auto 0;
          background: none; border: none;
          color: rgba(148,163,184,0.55);
          font-size: 12px; font-family: inherit;
          text-decoration: underline; text-underline-offset: 3px;
          cursor: pointer;
        }
        .type-instead:disabled { opacity: 0.35; cursor: default; }
        .heard {
          margin: -6px 0 18px;
          text-align: center;
          font-family: var(--font-display, Georgia, serif);
          font-style: italic;
          font-size: 13.5px;
          line-height: 1.6;
          color: rgba(148,163,184,0.65);
        }
        .live {
          font-family: var(--font-display, Georgia, serif);
          font-size: 21px;
          line-height: 1.5;
          color: #eef2ff;
          text-align: center;
          max-width: 30ch;
          transition: opacity 200ms ease;
        }
        .live-empty {
          color: rgba(148,163,184,0.5);
          font-size: 15px;
          font-style: italic;
        }

        .wave-stage {
          position: absolute;
          inset: 0;
          z-index: 5;
          display: flex;
          align-items: center;
          justify-content: center;
          padding-bottom: 14vh;
          pointer-events: none;
        }
        .wave-canvas { width: 86%; max-width: 460px; height: 160px; display: block; }

        .hold {
          position: relative; width: 100%; height: 92px;
          border-radius: 24px;
          border: 1px solid rgba(94,234,212,0.26);
          background: rgba(13,20,44,0.72);
          color: #cfe9e4;
          font-size: 13.5px; font-weight: 600;
          letter-spacing: 0.16em; text-transform: uppercase;
          overflow: hidden; cursor: pointer;
          touch-action: none; user-select: none;
          -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
          transition: transform 220ms cubic-bezier(0.2,0.7,0.2,1),
                      border-color 260ms ease, box-shadow 320ms ease, background 260ms ease;
        }
        .hold.idle { animation: breathe 5s ease-in-out infinite; }
        @keyframes breathe {
          0%,100% { box-shadow: 0 0 0 1px rgba(94,234,212,0.10), 0 0 22px rgba(94,234,212,0.08); }
          50% { box-shadow: 0 0 0 1px rgba(94,234,212,0.20), 0 0 34px rgba(94,234,212,0.16); }
        }
        .hold.held {
          transform: scale(0.985);
          border-color: rgba(94,234,212,0.85);
          background: rgba(16,34,60,0.9);
          color: #eafffb;
          box-shadow: 0 0 0 1px rgba(94,234,212,0.55), 0 0 52px rgba(94,234,212,0.34);
          animation: none;
        }
        .hold:disabled { opacity: 0.45; cursor: default; animation: none; }
        .hold:focus-visible { outline: 2px solid rgba(94,234,212,0.9); outline-offset: 3px; }

        .ring {
          position: absolute; inset: 0; border-radius: 24px;
          border: 1px solid rgba(94,234,212,0.5);
          opacity: 0; pointer-events: none;
        }
        .hold.held .ring { animation: ringOut 1.6s ease-out infinite; }
        .hold.held .ring.d { animation-delay: 0.8s; }
        @keyframes ringOut {
          0% { opacity: 0.7; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.06); }
        }

        .btn-inner {
          position: relative; z-index: 2; height: 100%;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 6px;
        }
        .timer {
          font-size: 11px; letter-spacing: 0.14em;
          color: rgba(94,234,212,0.85); font-variant-numeric: tabular-nums;
        }
        .dots span {
          display: inline-block; width: 5px; height: 5px; margin: 0 3px;
          border-radius: 9999px; background: rgba(94,234,212,0.85);
          animation: dot 1.2s ease-in-out infinite;
        }
        .dots span:nth-child(2) { animation-delay: 0.18s; }
        .dots span:nth-child(3) { animation-delay: 0.36s; }
        @keyframes dot {
          0%,100% { opacity: 0.25; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-4px); }
        }

        @media (prefers-reduced-motion: reduce) {
          .band, .star, .hold.idle, .ring, .dots span,
          .title, .window, .directive, .confirmation {
            animation: none !important;
          }
        }
      `}</style>

      {/* ── Sky ── */}
      <div className={`sky${isHolding ? " listening" : ""}${!animate ? " paused" : ""}`} aria-hidden="true">
        <div className="aurora">
          <div className="band a" />
          <div className="band b" />
          <div className="band c" />
          <div className="band d" />
        </div>

        {Array.from({ length: 34 }).map((_, i) => (
          <span
            key={`f${i}`}
            className="star"
            style={{
              left: `${(i * 43 + 7) % 100}%`,
              top: `${(i * 29 + 11) % 100}%`,
              width: 1.5,
              height: 1.5,
              opacity: 0.35,
              animation: `tw-far ${5 + (i % 4)}s ease-in-out infinite`,
              animationDelay: `${(i * 0.53) % 6}s`,
            }}
          />
        ))}
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={`n${i}`}
            className="star"
            style={{
              left: `${(i * 71 + 19) % 100}%`,
              top: `${(i * 47 + 5) % 100}%`,
              width: 2.5,
              height: 2.5,
              opacity: 0.7,
              animation: `tw-near ${3.2 + (i % 3) * 0.7}s ease-in-out infinite`,
              animationDelay: `${(i * 0.83) % 5}s`,
            }}
          />
        ))}

        {shooters.map((s) => (
          <span
            key={s.id}
            className="shooter"
            style={{ top: `${s.top}%`, left: `${s.left}%` }}
            ref={(el) => {
              if (!el) return;
              el.animate(
                [
                  { transform: "translate3d(0,0,0)", opacity: 0 },
                  { opacity: 1, offset: 0.12 },
                  { opacity: 1, offset: 0.75 },
                  { transform: `translate3d(${s.distance}px, ${s.distance}px, 0)`, opacity: 0 },
                ],
                { duration: s.duration, easing: "linear", fill: "forwards" }
              );
            }}
          />
        ))}
      </div>

      {/* ── Waveform ── */}
      {isHolding && (
        <div className="wave-stage" aria-hidden="true">
          <canvas ref={canvasRef} className="wave-canvas" />
        </div>
      )}

      {/* ── Content ── */}
      <div className="scroller" ref={scrollRef}>
        <div className="inner">
          <div className="topbar">
            {onBack ? (
              <button type="button" className="back" onClick={onBack} aria-label="Back">
                <ArrowLeft size={20} />
              </button>
            ) : (
              <div style={{ width: 44, height: 44 }} aria-hidden="true" />
            )}
            <p className="eyebrow">Ask Jxl</p>
            <div style={{ width: 44, height: 44 }} aria-hidden="true" />
          </div>

          <div className="title-slot">
            {phase === "answered" && result ? (
              <h1 className="title">{result.title}</h1>
            ) : isHolding ? (
              <p className={`live ${liveTranscript ? "" : "live-empty"}`}>
                {liveTranscript || "Listening…"}
              </p>
            ) : phase === "thinking" ? (
              <p className="ghost" style={{ color: 'rgba(148,163,184,0.5)' }}>
                Finding it…
              </p>
            ) : (
              <p className="ghost">
                {phase === "denied"
                  ? "No mic — you can type instead."
                  : phase === "composing"
                  ? "Say the messy version, or type it."
                  : "Hold the button and say what's actually going on."}
              </p>
            )}
          </div>

          {phase === "answered" && heard && <p className="heard">“{heard}”</p>}

          {phase === "answered" && result && (
            <div>
              <div className="answer">{result.answer}</div>

              {result.windows?.map((w, i) => (
                <div key={i} className="window" style={{ animationDelay: `${240 + i * 90}ms` }}>
                  <div className="window-date">{w.date}</div>
                  <div className="window-body">{w.body}</div>
                </div>
              ))}

              {result.directives?.map((d, i) => {
                const cls = d.type === "DROP" ? "drop" : d.type === "LOCK" ? "lock" : "execute";
                const label =
                  d.type === "DROP" ? "Drop" : d.type === "LOCK" ? "Lock in by" : "Execute by";
                return (
                  <div key={i} className={`directive ${cls}`} style={{ animationDelay: `${240 + i * 90}ms` }}>
                    <div className="directive-label">
                      {label}
                      {d.date ? ` · ${d.date}` : ""}
                    </div>
                    <div className="directive-body">{d.body}</div>
                  </div>
                );
              })}

              {result.confirmation && <p className="confirmation">{result.confirmation}</p>}

              {result.sources && result.sources.length > 0 && (
                <div className="sources">
                  <button
                    type="button"
                    className="sources-toggle"
                    onClick={() => setShowSources((s) => !s)}
                    aria-expanded={showSources}
                  >
                    <span>What this reading is drawn from</span>
                    <span className={`chev ${showSources ? "open" : ""}`}>⌄</span>
                  </button>
                  {showSources && (
                    <div className="sources-body">
                      {result.sources.map((s, i) => (
                        <div key={i} className="source-row">
                          <div className="source-factor">{s.factor}</div>
                          <div className="source-placements">{s.placements}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {result.careNote && <p className="care">{result.careNote}</p>}
            </div>
          )}
        </div>
      </div>

      {/* ── Dock ── */}
      <div className="dock" onTouchStart={swallowTouch} onTouchMove={swallowTouch}>
        {error && <p className="err">{error}</p>}

        {phase === "composing" ? (
          <>
            <textarea
              ref={composeRef}
              className="compose"
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="What's actually going on?"
            />
            <div className="compose-row">
              <button type="button" className="cancel" onClick={() => setPhase("idle")}>
                Back
              </button>
              <button type="button" className="send" onClick={submitTyped} disabled={!draft.trim()}>
                Ask
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="replies">
              {sessionOver
                ? "That's all for this session"
                : `${repliesLeft} ${repliesLeft === 1 ? "reply" : "replies"} left`}
            </p>

            <button
              type="button"
              className={`hold ${isHolding ? "held" : phase === "idle" ? "idle" : ""}`}
              disabled={phase === "thinking" || sessionOver}
              onPointerDown={startHold}
              onPointerUp={endHold}
              onPointerCancel={endHold}
              onContextMenu={(e) => e.preventDefault()}
            >
              <span className="ring" />
              <span className="ring d" />
              <span className="btn-inner">
                {phase === "thinking" && (
                  <span className="dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                )}
                <span>{buttonLabel}</span>
                {isHolding && <span className="timer">{(holdMs / 1000).toFixed(1)}s</span>}
              </span>
            </button>

            <button
              type="button"
              className="type-instead"
              onClick={() => setPhase("composing")}
              disabled={sessionOver || phase === "thinking"}
            >
              {speechSupported === false ? "type your question" : "or type it instead"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}