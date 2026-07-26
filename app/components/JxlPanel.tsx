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
const MIC_TOGGLE_KEY = "jxl_mic_toggle";

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

/* ── Typewriter ─────────────────────────────────────────────────────────── */
function useTypewriter(full: string, active: boolean) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    if (!active || !full) {
      setShown("");
      return;
    }
    const words = full.split(" ");
    let i = 0;
    setShown("");
    const iv = setInterval(() => {
      i += 2;
      setShown(words.slice(0, i).join(" "));
      if (i >= words.length) clearInterval(iv);
    }, 55);
    return () => clearInterval(iv);
  }, [full, active]);
  return shown;
}

type Phase =
  | "idle"
  | "holding"
  | "tooShort"
  | "composing"
  | "thinking"
  | "answered"
  | "denied";

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

  // ── Persistent mic toggle ───────────────────────────────────────────
  const [micEnabled, setMicEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(MIC_TOGGLE_KEY);
      if (stored !== null) return stored === "true";
    }
    return false;
  });

  const handleMicToggle = useCallback((enabled: boolean) => {
    setMicEnabled(enabled);
    try {
      localStorage.setItem(MIC_TOGGLE_KEY, String(enabled));
    } catch {}

    if (enabled && typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      // Pre-flight: check if mic is actually accessible
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
          stream.getTracks().forEach(t => t.stop());
          setMicPermission("granted");
          console.log("[jxl/mic] Toggle ON — mic accessible");
        })
        .catch(() => {
          console.log("[jxl/mic] Toggle ON — mic not accessible, will prompt on hold");
          setMicPermission("prompt");
        });
    }
  }, []);

  // When toggle is turned OFF, stop any active mic streams
  useEffect(() => {
    if (!micEnabled && phaseRef.current === "holding") {
      stopRecognition();
      stopMeter();
      setPhase("idle");
    }
  }, [micEnabled]);

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
    if (!micEnabled) return;

    const perm = micPermissionRef.current;
    if (perm === "prompt" || perm === "denied") return;

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
  }, [micEnabled, stopMeter]);

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

  // ── Pre-flight: if toggle was ON from previous session, check permission ──
  useEffect(() => {
    if (!micEnabled) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;

    // If we already have permission, no need to pre-flight
    if (micPermission === "granted") return;

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach(t => t.stop());
        setMicPermission("granted");
        console.log("[jxl/mic] Pre-flight: mic accessible (permission restored)");
      })
      .catch(() => {
        console.log("[jxl/mic] Pre-flight: mic not accessible, will prompt on first hold");
      });
  }, [micEnabled, micPermission]);

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
  const typed = useTypewriter(result?.answer ?? "", phase === "answered");
  const typingDone = !result || typed.length >= result.answer.length;
  const repliesUsed = history.length;
  const repliesLeft = Math.max(0, REPLIES_PER_SESSION - repliesUsed);
  const sessionOver = repliesLeft <= 0;

  useEffect(() => {
    if (phase === "composing") {
      setTimeout(() => composeRef.current?.focus(), 60);
    }
  }, [phase]);

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
        return;
      }

      setResult(data as JxlResult);
      if (!data.isSafeResponse) {
        setHistory((prev) => [...prev, { question, answer: data.answer }]);
      }
      setDraft("");
      setShowSources(false);
      setPhase("answered");
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Something went wrong. Try again.");
      setDraft(question);
      setPhase("composing");
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

      // ── MIC TOGGLE GUARD ──
      if (!micEnabled) {
        setError("Mic is off. Toggle it on above to use voice.");
        return;
      }

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
    [phase, sessionOver, micEnabled, stopRecognition, stopMeter, startMeter]
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
    : micEnabled
    ? "Press · Hold · Speak"
    : "Mic off — toggle on above";

  const swallowTouch = (e: React.TouchEvent) => e.stopPropagation();

  return (
    <div className="jxl-panel">
      <input id="jxl-haptic" type="checkbox" switch="" aria-hidden="true" tabIndex={-1} className="haptic-proxy" />

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
          color: #d7dcea; white-space: pre-wrap;
        }
        .caret {
          display: inline-block; width: 2px; height: 1.05em;
          margin-left: 3px; background: rgba(94,234,212,0.9);
          vertical-align: text-bottom;
          animation: blink 1s steps(1) infinite;
        }
        @keyframes blink { 50% { opacity: 0; } }

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

        /* ── Mic Toggle ── */
        .mic-toggle-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 8px;
        }

        .mic-toggle {
          display: flex;
          align-items: center;
          gap: 10px;
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px 0;
          font-family: var(--font-sans, ui-sans-serif);
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }

        .mic-toggle:disabled {
          opacity: 0.4;
          cursor: default;
        }

        .toggle-track {
          position: relative;
          width: 44px;
          height: 26px;
          border-radius: 9999px;
          background: rgba(148, 163, 184, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.08);
          transition: background 220ms ease;
          flex-shrink: 0;
        }

        .mic-toggle.on .toggle-track {
          background: rgba(94, 234, 212, 0.35);
          border-color: rgba(94, 234, 212, 0.4);
        }

        .toggle-thumb {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 20px;
          height: 20px;
          border-radius: 9999px;
          background: rgba(148, 163, 184, 0.6);
          transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1), background 220ms ease;
        }

        .mic-toggle.on .toggle-thumb {
          transform: translateX(18px);
          background: #5eead4;
          box-shadow: 0 0 16px rgba(94, 234, 212, 0.3);
        }

        .toggle-label {
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.06em;
          color: rgba(148, 163, 184, 0.8);
          min-width: 48px;
          text-align: left;
        }

        .mic-toggle.on .toggle-label {
          color: rgba(94, 234, 212, 0.9);
        }

        .toggle-hint {
          font-size: 10px;
          letter-spacing: 0.04em;
          color: rgba(239, 68, 68, 0.6);
        }

        .toggle-hint.warning {
          color: rgba(251, 191, 36, 0.6);
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
          .caret, .title, .window, .directive, .confirmation {
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
            ) : (
              <p className="ghost">
                {phase === "thinking"
                  ? "Finding it…"
                  : phase === "denied"
                  ? "No mic — you can type instead."
                  : phase === "composing"
                  ? "Say the messy version, or type it."
                  : micEnabled
                  ? "Hold the button and say what's actually going on."
                  : "Toggle the mic on above to speak."}
              </p>
            )}
          </div>

          {phase === "answered" && heard && <p className="heard">“{heard}”</p>}

          {phase === "answered" && result && (
            <div>
              <div className="answer">
                {typed}
                {!typingDone && <span className="caret" />}
              </div>

              {typingDone &&
                result.windows?.map((w, i) => (
                  <div key={i} className="window" style={{ animationDelay: `${i * 90}ms` }}>
                    <div className="window-date">{w.date}</div>
                    <div className="window-body">{w.body}</div>
                  </div>
                ))}

              {typingDone &&
                result.directives?.map((d, i) => {
                  const cls = d.type === "DROP" ? "drop" : d.type === "LOCK" ? "lock" : "execute";
                  const label =
                    d.type === "DROP" ? "Drop" : d.type === "LOCK" ? "Lock in by" : "Execute by";
                  return (
                    <div key={i} className={`directive ${cls}`} style={{ animationDelay: `${i * 90}ms` }}>
                      <div className="directive-label">
                        {label}
                        {d.date ? ` · ${d.date}` : ""}
                      </div>
                      <div className="directive-body">{d.body}</div>
                    </div>
                  );
                })}

              {typingDone && result.confirmation && (
                <p className="confirmation">{result.confirmation}</p>
              )}

              {typingDone && result.sources && result.sources.length > 0 && (
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

              {typingDone && result.careNote && <p className="care">{result.careNote}</p>}
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
            {/* ── MIC TOGGLE ── */}
            <div className="mic-toggle-row">
              <button
                type="button"
                onClick={() => handleMicToggle(!micEnabled)}
                className={`mic-toggle ${micEnabled ? "on" : "off"}`}
                disabled={phase === "thinking" || sessionOver}
                aria-label={micEnabled ? "Microphone on" : "Microphone off"}
              >
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
                <span className="toggle-label">{micEnabled ? "Mic On" : "Mic Off"}</span>
              </button>
              {micEnabled && micPermission === "denied" && (
                <span className="toggle-hint">Permission blocked — check settings</span>
              )}
              {micEnabled && micPermission === "prompt" && (
                <span className="toggle-hint warning">Will prompt on first use</span>
              )}
            </div>

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