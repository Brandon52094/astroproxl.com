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
 *
 * VOICE BRIDGE: press-and-hold runs its full animation, but there is no mic
 * yet, so on release it opens a text field to type what you'd have said. The
 * API call is real. Step 5 replaces the field with actual recording and
 * transcription — nothing else in this file needs to change.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { loadChart } from "@/lib/chartStore";

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
  confirmation: string;
  careNote?: string | null;
  isSafeResponse?: boolean;
  replyNumber: number | null;
}

interface JxlPanelProps {
  /** Pager tells us when this panel is on screen so animations can pause. */
  isActive?: boolean;
  /** Standalone route passes this to show a back button. */
  onBack?: () => void;
}

const REPLIES_PER_SESSION = 3;
const MIN_HOLD_MS = 450;

/* ── Haptics ──────────────────────────────────────────────────────────────
 * iOS Safari has no navigator.vibrate. The only real system haptic available
 * to mobile Safari is a programmatic click on an <input type="checkbox" switch>
 * (iOS 17.4+). Isolated here so swapping in Capacitor's Haptics plugin later
 * is a one-function change. */
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

/* ── Shooting stars ───────────────────────────────────────────────────────
 * Rarity is what makes a sky read as real. One at a time, irregular 9–17s
 * gaps, falling DOWN and ACROSS. */
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

/* ── Typewriter ───────────────────────────────────────────────────────────
 * Reveals by word, not character — per-letter on a long answer reads slow and
 * costs a render per keystroke. */
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
  | "arming"       // asking the OS for mic permission
  | "holding"      // actively recording
  | "tooShort"
  | "transcribing"
  | "composing"    // typing fallback
  | "thinking"
  | "answered"
  | "denied";      // mic blocked or unsupported

export default function JxlPanel({ isActive = true, onBack }: JxlPanelProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  // Mirror of phase for async callbacks (getUserMedia resolves after a delay,
  // by which point the closed-over `phase` is stale).
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

  // ── Recording ────────────────────────────────────────────────────────
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  // Set when the user lets go before the recorder has finished flushing, so
  // the onstop handler knows whether to transcribe or discard.
  const wantsResultRef = useRef(false);
  // True once the OS has granted mic access this session. The first hold only
  // warms permission up (iOS suspends JS during the prompt, so the release can
  // land before the stream arrives — recording on that first hold is what left
  // the mic stuck on). Subsequent holds record normally.
  const micReadyRef = useRef(false);
  const [heard, setHeard] = useState<string | null>(null);

  /**
   * Hard mic-off. Stops the recorder AND every track, unconditionally. This is
   * the single source of truth for releasing the microphone — every exit path
   * (release, too-short, error, permission denial, unmount) calls it, so the
   * OS "mic in use" indicator can never stay lit after the button is released.
   */
  const releaseMic = useCallback(() => {
    try {
      const r = recorderRef.current;
      if (r && r.state !== "inactive") r.stop();
    } catch {
      /* already stopped */
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* noop */
        }
      });
      streamRef.current = null;
    }
  }, []);

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

  /* ── Press and hold ──────────────────────────────────────────────────
   * Holding starts a real recording. The first hold triggers the OS
   * permission prompt, which interrupts that hold — expected, and handled by
   * telling the person to hold again once they've allowed it. */
  const startHold = useCallback(
    async (e: React.PointerEvent<HTMLButtonElement>) => {
      if (phase === "thinking" || phase === "transcribing" || sessionOver) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setError(null);
      setHeard(null);

      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setPhase("denied");
        setError("This browser can't reach the microphone. You can type instead.");
        return;
      }

      // ── First hold: request permission, then immediately release. ────────
      // We do NOT record on the grant. iOS suspends JS while the prompt is up,
      // so by the time the stream resolves the finger may already be up — which
      // is exactly what left the mic stuck open. So the first hold's only job is
      // to get permission; the person then holds again to actually speak.
      if (!micReadyRef.current) {
        setPhase("arming");
        try {
          const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
          probe.getTracks().forEach((t) => t.stop()); // release instantly
          micReadyRef.current = true;
          setPhase("idle");
          setError(null);
          // Gentle nudge — they need to hold once more, now that it's allowed.
          setHeard(null);
        } catch {
          releaseMic();
          setPhase("denied");
          setError("Microphone access is off. Allow it in your browser settings, or type instead.");
        }
        return;
      }

      setPhase("arming");

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        // Permission was revoked between holds.
        micReadyRef.current = false;
        releaseMic();
        setPhase("denied");
        setError("Microphone access is off. Allow it in your browser settings, or type instead.");
        return;
      }

      // If the user already let go (or navigated) during the permission
      // prompt, the stream is arriving too late — shut it down immediately so
      // the indicator doesn't linger.
      if (phaseRef.current !== "arming") {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      triggerHaptic();

      // Safari records audio/mp4, Chrome audio/webm. Let the browser pick what
      // it actually supports rather than forcing a type it will silently ignore.
      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType = preferred.find((t) => MediaRecorder.isTypeSupported?.(t));

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      wantsResultRef.current = false;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        // Free the mic first, always — before any async work.
        releaseMic();
        if (wantsResultRef.current) void transcribeAndAsk(blob);
      };

      recorder.start();
      holdStart.current = Date.now();
      setHoldMs(0);
      setPhase("holding");
      holdTimer.current = setInterval(() => setHoldMs(Date.now() - holdStart.current), 100);
    },
    // transcribeAndAsk is stable enough for this; defined below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, sessionOver]
  );

  const endHold = useCallback(() => {
    if (phase !== "holding") return;
    if (holdTimer.current) {
      clearInterval(holdTimer.current);
      holdTimer.current = null;
    }
    const elapsed = Date.now() - holdStart.current;
    triggerHaptic();

    if (elapsed < MIN_HOLD_MS) {
      // Discard and free the mic immediately — no transcription.
      wantsResultRef.current = false;
      releaseMic();
      setPhase("tooShort");
      setTimeout(() => setPhase((p) => (p === "tooShort" ? "idle" : p)), 1500);
      return;
    }

    // Keep the clip. Stopping the recorder fires onstop, which frees the mic
    // via releaseMic and then transcribes.
    wantsResultRef.current = true;
    setPhase("transcribing");
    try {
      const r = recorderRef.current;
      if (r && r.state !== "inactive") r.stop();
      else {
        releaseMic();
        setPhase("idle");
      }
    } catch {
      releaseMic();
      setPhase("idle");
    }
  }, [phase, releaseMic]);

  // Free the mic if the component unmounts mid-recording.
  useEffect(
    () => () => {
      if (holdTimer.current) clearInterval(holdTimer.current);
      wantsResultRef.current = false;
      releaseMic();
    },
    [releaseMic]
  );

  // Backstop: if the tab is hidden (app switch, screen lock) or this panel
  // swipes out of view while holding, the pointer never releases — so kill the
  // mic on those events too. Nobody should see the indicator lit on a screen
  // they've navigated away from.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden" && phaseRef.current === "holding") {
        if (holdTimer.current) clearInterval(holdTimer.current);
        wantsResultRef.current = false;
        releaseMic();
        setPhase("idle");
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [releaseMic]);

  useEffect(() => {
    // isActive flips false when the pager moves to another panel.
    if (!isActive && phaseRef.current === "holding") {
      if (holdTimer.current) clearInterval(holdTimer.current);
      wantsResultRef.current = false;
      releaseMic();
      setPhase("idle");
    }
  }, [isActive, releaseMic]);

  /* ── Ask ───────────────────────────────────────────────────────────── */
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
        setDraft(question); // don't lose what they said
        setPhase("composing");
        return;
      }

      setResult(data as JxlResult);
      // A safe response is not a turn — it never costs a reply.
      if (!data.isSafeResponse) {
        setHistory((prev) => [...prev, { question, answer: data.answer }]);
      }
      setDraft("");
      setPhase("answered");
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Something went wrong. Try again.");
      setDraft(question);
      setPhase("composing");
    }
  };

  /* Audio → text → answer. A failed transcription drops into the typing
   * fallback rather than dead-ending, so a bad mic moment never costs a reply. */
  const transcribeAndAsk = async (blob: Blob) => {
    try {
      const form = new FormData();
      form.append("audio", blob, "speech");

      const res = await fetch("/api/jxl/transcribe", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok || !data.text) {
        setError(data.error ?? "Couldn't hear that. Try again, or type it.");
        setPhase("composing");
        return;
      }

      setHeard(data.text as string);
      await ask(data.text as string);
    } catch {
      setError("Couldn't hear that. Try again, or type it.");
      setPhase("composing");
    }
  };

  const submitTyped = () => {
    const q = draft.trim();
    if (!q || phase === "thinking") return;
    setHeard(q);
    void ask(q);
  };

  const buttonLabel = sessionOver
    ? "That's all for now"
    : phase === "arming"
    ? "Allow the mic…"
    : isHolding
    ? "Listening…"
    : phase === "transcribing"
    ? "Hearing you…"
    : phase === "thinking"
    ? "Reading the sky…"
    : phase === "tooShort"
    ? "Hold a little longer"
    : "Press · Hold · Speak";

  /* Stop touch events reaching the pager so a hold never becomes a swipe. */
  const swallowTouch = (e: React.TouchEvent) => e.stopPropagation();

  return (
    <div className="jxl-panel">
      {/* Hidden control that fires a real system haptic on iOS 17.4+ */}
      {/* @ts-expect-error — `switch` is valid in iOS Safari, absent from React's types */}
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

        /* ── SKY — absolute, not fixed. See file header. ── */
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
        /* Pre-softened gradients instead of filter: blur() — blur is what
           destroys framerate on phones. */
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

        /* The sky leans in while you speak. */
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

        /* ── CONTENT — its own scroller so sky and dock stay put ── */
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
          font-size: 16px; /* >=16px stops iOS zooming on focus */
          font-family: inherit;
          padding: 13px 15px;
          outline: none; resize: none;
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
        .bridge-note {
          margin-top: 8px; text-align: center;
          font-size: 10px; color: rgba(148,163,184,0.4);
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

        .hold {
          position: relative; width: 100%; height: 76px;
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
        .wave { display: flex; align-items: center; gap: 4px; height: 18px; }
        .wave span {
          display: block; width: 3px; border-radius: 9999px; background: #5eead4;
          animation: bar 900ms ease-in-out infinite;
        }
        @keyframes bar {
          0%,100% { height: 5px; opacity: 0.55; }
          50% { height: 18px; opacity: 1; }
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
          .band, .star, .hold.idle, .ring, .wave span, .dots span,
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

        {/* Per-meteor distance varies, which a shared @keyframes can't express,
            so these are driven by the Web Animations API. */}
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
            ) : (
              <p className="ghost">
                {phase === "thinking"
                  ? "Finding it…"
                  : phase === "transcribing"
                  ? "Hearing you…"
                  : phase === "arming"
                  ? "Allow the microphone…"
                  : phase === "denied"
                  ? "No mic — you can type instead."
                  : phase === "composing"
                  ? "Say the messy version."
                  : micReadyRef.current
                  ? "Hold and speak — let go when you're done."
                  : "Hold the button and say what's actually going on."}
              </p>
            )}
          </div>

          {/* What we heard. Shown so a mishearing is obvious rather than
              mysterious — if the answer is odd, the reason is right here. */}
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
            <p className="replies">
              {sessionOver
                ? "That's all for this session"
                : `${repliesLeft} ${repliesLeft === 1 ? "reply" : "replies"} left`}
            </p>
            <button
              type="button"
              className={`hold ${isHolding ? "held" : phase === "idle" ? "idle" : ""}`}
              disabled={phase === "thinking" || phase === "transcribing" || phase === "arming" || sessionOver}
              onPointerDown={startHold}
              onPointerUp={endHold}
              onPointerCancel={endHold}
              /* No onPointerLeave: setPointerCapture keeps events on this
                 element, and treating leave as a release ended the hold on the
                 smallest finger drift. */
              onContextMenu={(e) => e.preventDefault()}
            >
              <span className="ring" />
              <span className="ring d" />
              <span className="btn-inner">
                {isHolding && (
                  <span className="wave" aria-hidden="true">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <span key={i} style={{ animationDelay: `${i * 90}ms` }} />
                    ))}
                  </span>
                )}
                {(phase === "thinking" || phase === "transcribing") && (
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

            {/* Always reachable — a denied mic must never be a dead end. */}
            <button
              type="button"
              className="type-instead"
              onClick={() => setPhase("composing")}
              disabled={sessionOver || phase === "thinking" || phase === "transcribing"}
            >
              or type it instead
            </button>
          </>
        )}
      </div>
    </div>
  );
}