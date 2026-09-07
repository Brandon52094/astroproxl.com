"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, Download, ChevronDown, CalendarDays } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import {
  loadReading,
  saveReading,
  loadChart,
  clearIntake,
  type StoredReading,
} from "@/lib/chartStore";
import {
  isReadingDelivery,
  type ReadingAlignment,
  type DirectAlignAnswer,
} from "@/lib/reading/contracts";
import { REGULAR_READING_REPLIES, SUBSCRIBER_READING_REPLIES } from "@/lib/reading/usage-policy";

const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripeKey ? loadStripe(stripeKey) : null;

interface FollowupEntry {
  id: string;
  question: string;
  title: string;
  content: string;
}

interface UserCredits {
  credits: number;
  isSubscribed: boolean;
  freeRepliesRemaining: number;
}

/**
 * AstroProXL results — production TSX conversion of reading-deck-prototype.jsx.
 * Keeps the prototype's page order and carries the original closing experience.
 * Staged readings use generated questions and one authenticated continuation.
 * Older saved readings remain readable without a pretend alignment quiz.
 */

type ParsedSection =
  | { kind: "prediction"; label: string; body: string }
  | { kind: "currentState"; label: string; body: string }
  | { kind: "whyNow"; label: string; body: string }
  | { kind: "manifestation"; label: string; body: string }
  | { kind: "prose"; label: string; body: string }
  | {
      kind: "window";
      date: string | null;
      note: string | null;
      body: string;
    }
  | {
      kind: "directive";
      directive: "GENERAL" | "DROP" | "EXECUTE" | "LOCK";
      label: string;
      date: string | null;
      body: string;
    }
  | { kind: "closing"; body: string };

function ResultsStarfield({ reduceMotion = false }: { reduceMotion?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    type PStar = { x: number; y: number; r: number };
    type TStar = {
      x: number;
      y: number;
      r: number;
      ph: number;
      sp: number;
    };
    type Shooter = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
      len: number;
    };

    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = w * dpr;
      canvas.height = h * dpr;

      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    // Three depth layers.
    const parallax: PStar[][] = [];
    const counts = [26, 16, 9];
    const speeds = [0.04, 0.09, 0.16];
    const sizes = [0.5, 0.8, 1.2];
    const alphas = [0.28, 0.5, 0.75];

    for (let layer = 0; layer < 3; layer++) {
      const stars: PStar[] = [];

      for (let i = 0; i < counts[layer]; i++) {
        stars.push({
          x: Math.random(),
          y: Math.random(),
          r: Math.random() * sizes[layer] + 0.3,
        });
      }

      parallax.push(stars);
    }

    // Independent twinkling stars.
    const twinkling: TStar[] = [];

    for (let i = 0; i < 34; i++) {
      twinkling.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 1.1 + 0.4,
        ph: Math.random() * Math.PI * 2,
        sp: Math.random() * 0.025 + 0.008,
      });
    }

    // Rare shooting stars.
    const shooters: Shooter[] = [];
    let tick = 0;
    let nextShoot = 360;

    let raf = 0;

    const frame = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.clearRect(0, 0, w, h);

      // Parallax stars.
      for (let layer = 0; layer < 3; layer++) {
        for (const star of parallax[layer]) {
          star.x -= speeds[layer] / w;

          if (star.x < 0) {
            star.x = 1;
            star.y = Math.random();
          }

          ctx.fillStyle = `rgba(219,234,254,${alphas[layer]})`;
          ctx.beginPath();
          ctx.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Twinkling stars.
      for (const star of twinkling) {
        star.ph += star.sp;

        const twinkle = (Math.sin(star.ph) + 1) / 2;

        ctx.fillStyle = `rgba(226,232,240,${0.2 + twinkle * 0.6})`;
        ctx.beginPath();
        ctx.arc(star.x * w, star.y * h, star.r * (0.7 + twinkle * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }

      // Shooting stars.
      tick++;

      if (tick >= nextShoot) {
        shooters.push({
          x: Math.random() * w * 0.7,
          y: Math.random() * h * 0.35,
          vx: Math.random() * 2 + 3,
          vy: Math.random() * 1.5 + 1.5,
          life: 0,
          maxLife: 60 + Math.random() * 20,
          len: Math.random() * 40 + 50,
        });

        nextShoot = tick + 360 + Math.random() * 240;
      }

      for (let i = shooters.length - 1; i >= 0; i--) {
        const shooter = shooters[i];

        shooter.x += shooter.vx;
        shooter.y += shooter.vy;
        shooter.life++;

        let fade = 1;

        if (shooter.life < 10) {
          fade = shooter.life / 10;
        } else if (shooter.life > shooter.maxLife - 15) {
          fade = Math.max(0, (shooter.maxLife - shooter.life) / 15);
        }

        const magnitude = Math.sqrt(shooter.vx * shooter.vx + shooter.vy * shooter.vy);

        const tailX = shooter.x - (shooter.vx / magnitude) * shooter.len;
        const tailY = shooter.y - (shooter.vy / magnitude) * shooter.len;

        const gradient = ctx.createLinearGradient(shooter.x, shooter.y, tailX, tailY);

        gradient.addColorStop(0, `rgba(226,232,240,${0.9 * fade})`);
        gradient.addColorStop(1, "rgba(147,197,253,0)");

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.6;
        ctx.lineCap = "round";

        ctx.beginPath();
        ctx.moveTo(shooter.x, shooter.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();

        ctx.fillStyle = `rgba(255,255,255,${0.95 * fade})`;
        ctx.beginPath();
        ctx.arc(shooter.x, shooter.y, 1.5, 0, Math.PI * 2);
        ctx.fill();

        if (shooter.life >= shooter.maxLife || shooter.x > w + 60 || shooter.y > h + 60) {
          shooters.splice(i, 1);
        }
      }

      if (!reduceMotion) raf = requestAnimationFrame(frame);
    };

    frame();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [reduceMotion]);

  return <canvas ref={canvasRef} aria-hidden="true" className="results-starfield" />;
}

// Parse the existing engine's headings without requiring an engine change.
const HUMAN_HEADERS = [
  "The Prediction",
  "Where You Are Now",
  "Why This Is Active Now",
  "Why This Is Active",
  "How This Is Most Likely To Show Up",
  "Dated Windows",
  "Timing",
  "The Read",
  "The Directive",
  "Your Move",
  "Bottom Line",
] as const;
const DATE_LEAD_RE = /^\s*\[\[DATE:\s*([^\]]+)\]\]\s*[—–-]?\s*/i;
const DROP_RE = /^\s*DROP\s*:\s*/i;
const EXECUTE_RE = /^\s*EXECUTE\s+BY\s+(\[\[DATE:\s*[^\]]+\]\]|[^:\n]+)\s*:\s*/i;
const LOCK_RE = /^\s*LOCK\s+IN\s+BY\s+(\[\[DATE:\s*[^\]]+\]\]|[^:\n]+)\s*:\s*/i;

function hashKey(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function extractDateText(raw: string): string {
  return (raw.match(/\[\[DATE:\s*([^\]]+)\]\]/i)?.[1] ?? raw).trim();
}

function splitHumanHeader(paragraph: string): {
  label: string | null;
  body: string;
} {
  const cleaned = paragraph
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/^Part\s*\d+\s*[:—–-]\s*/i, "");
  for (const header of HUMAN_HEADERS) {
    const match = cleaned.match(
      new RegExp(`^${header}(?:\\s*[:—–-]\\s*|\\s*\\n+|\\s*$)([\\s\\S]*)$`, "i"),
    );
    if (match) return { label: header, body: match[1].trim() };
  }
  return { label: null, body: paragraph.trim() };
}

function parseReadingSections(content: string): ParsedSection[] | null {
  // Also accept headings separated by one newline, and Markdown headings.
  const normalized = content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => (splitHumanHeader(line).label ? `\n${line}\n` : line))
    .join("\n");
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const sections: ParsedSection[] = [];
  let phase: "opening" | "windows" | "directives" | "closing" = "opening";
  let activeLabel = "";
  let sawHeader = false;

  for (const paragraph of paragraphs) {
    const { label, body } = splitHumanHeader(paragraph);
    if (label) {
      sawHeader = true;
      activeLabel = label;
      phase =
        label === "Bottom Line"
          ? "closing"
          : label === "Dated Windows" || label === "Timing"
            ? "windows"
            : label === "The Directive" || label === "Your Move"
              ? "directives"
              : "opening";
    }
    if (!body) continue;
    if (phase === "closing") {
      sections.push({ kind: "closing", body });
      continue;
    }
    const execute = body.match(EXECUTE_RE);
    const lock = body.match(LOCK_RE);
    if (DROP_RE.test(body) || execute || lock) {
      phase = "directives";
      const directive = execute ? "EXECUTE" : lock ? "LOCK" : "DROP";
      sections.push({
        kind: "directive",
        directive,
        label: execute ? "Execute by" : lock ? "Lock in by" : "Drop",
        date: execute || lock ? extractDateText((execute ?? lock)![1]) : null,
        body: body.replace(execute ? EXECUTE_RE : lock ? LOCK_RE : DROP_RE, "").trim(),
      });
      continue;
    }
    if (phase === "directives") {
      // A date-led directive is still a directive, not a timing card.
      sections.push({
        kind: "directive",
        directive: "GENERAL",
        label: "Directive",
        date: null,
        body,
      });
      continue;
    }
    if (phase === "windows" || (!activeLabel && DATE_LEAD_RE.test(body))) {
      phase = "windows";
      const date = body.match(DATE_LEAD_RE);
      const rest = date ? body.slice(date[0].length).trim() : body;
      sections.push({
        kind: "window",
        date: date?.[1].trim() ?? null,
        note: null,
        body: rest,
      });
      continue;
    }
    const kind =
      activeLabel === "Where You Are Now"
        ? "currentState"
        : activeLabel === "Why This Is Active" || activeLabel === "Why This Is Active Now"
          ? "whyNow"
          : activeLabel === "How This Is Most Likely To Show Up"
            ? "manifestation"
            : activeLabel === "The Prediction" || (!activeLabel && sections.length === 0)
              ? "prediction"
              : "prose";
    sections.push({ kind, label: activeLabel, body });
  }
  return sawHeader && sections.length ? sections : null;
}

function renderWithDates(content: string): React.ReactNode {
  return content.split(/(\[\[DATE:\s*[^\]]+\]\])/gi).map((part, i) => {
    const match = part.match(/\[\[DATE:\s*([^\]]+)\]\]/i);
    return match ? (
      <span key={i} className="date-badge">
        {match[1].trim()}
      </span>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    );
  });
}

type CalendarDate = { y: number; m: number; d: number };
type CalendarWindow = { date: string; start: CalendarDate; end: CalendarDate };
type TimingSection = Extract<ParsedSection, { kind: "window" }>;
type DirectiveSection = Extract<ParsedSection, { kind: "directive" }>;
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const dayValue = (date: CalendarDate) => Date.UTC(date.y, date.m, date.d);

function validCalendarDate(date: CalendarDate): boolean {
  const parsed = new Date(dayValue(date));
  return (
    date.y >= 1900 &&
    date.y <= 2200 &&
    parsed.getUTCFullYear() === date.y &&
    parsed.getUTCMonth() === date.m &&
    parsed.getUTCDate() === date.d
  );
}

function parseCalendarWindow(date: string): CalendarWindow | null {
  const text = date.replace(/(\d)(st|nd|rd|th)\b/gi, "$1").trim();
  let start: CalendarDate;
  let end: CalendarDate;
  const iso = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:\s*(?:to|[–—-])\s*(\d{4})-(\d{2})-(\d{2}))?$/i,
  );
  if (iso) {
    start = { y: +iso[1], m: +iso[2] - 1, d: +iso[3] };
    end = iso[4] ? { y: +iso[4], m: +iso[5] - 1, d: +iso[6] } : start;
  } else {
    const named = text.match(
      /^([A-Za-z]+)\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?(?:\s*(?:to|[–—-])\s*(?:([A-Za-z]+)\.?\s+)?(\d{1,2})(?:,?\s+(\d{4}))?)?$/i,
    );
    // Keep unclear/yearless text visible in Timing; never invent calendar dates.
    if (!named || (!named[3] && !named[6])) return null;
    const monthIndex = (name: string) =>
      MONTHS.findIndex((month) => {
        const lower = name.toLowerCase();
        return (
          lower === month ||
          lower === month.slice(0, 3) ||
          (lower === "sept" && month === "september")
        );
      });
    const startMonth = monthIndex(named[1]);
    const endMonth = named[4] ? monthIndex(named[4]) : startMonth;
    if (startMonth < 0 || endMonth < 0) return null;
    let startYear = Number(named[3] ?? named[6]);
    let endYear = Number(named[6] ?? named[3]);
    if (endMonth < startMonth) {
      if (!named[3]) startYear--;
      else if (!named[6]) endYear++;
    }
    start = { y: startYear, m: startMonth, d: +named[2] };
    end = { y: endYear, m: endMonth, d: Number(named[5] ?? named[2]) };
  }
  const duration = dayValue(end) - dayValue(start);
  if (
    !validCalendarDate(start) ||
    !validCalendarDate(end) ||
    duration < 0 ||
    duration > 366 * 86400000
  )
    return null;
  return { date, start, end };
}

function calendarMonths(windows: CalendarWindow[]): { key: string; y: number; m: number }[] {
  const months = new Map<string, { key: string; y: number; m: number }>();
  for (const window of windows) {
    for (
      let serial = window.start.y * 12 + window.start.m;
      serial <= window.end.y * 12 + window.end.m;
      serial++
    ) {
      const y = Math.floor(serial / 12),
        m = serial % 12,
        key = `${y}-${m}`;
      months.set(key, { key, y, m });
    }
  }
  return [...months.values()].sort((a, b) => a.y - b.y || a.m - b.m);
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function useTyped(text: string, play: boolean, instant: boolean, speed: number): string {
  // Date tokens arrive together so unfinished [[DATE: ...]] markup never flashes.
  const units = useMemo(() => text.match(/\[\[DATE:\s*[^\]]+\]\]|[\s\S]/gi) ?? [], [text]);
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (instant) {
      setCount(units.length);
      return;
    }
    setCount(0);
    if (!play) return;
    let i = 0;
    const timer = setInterval(() => {
      setCount(++i);
      if (i >= units.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [units, play, instant, speed]);
  return instant ? text : units.slice(0, count).join("");
}

function HeroReveal({
  label,
  body,
  active,
  seen,
  onSeen,
  speed = 22,
  titleDelay = 520,
}: {
  label: string;
  body: string;
  active: boolean;
  seen: boolean;
  onSeen: () => void;
  speed?: number;
  titleDelay?: number;
}) {
  const [phase, setPhase] = useState<"hidden" | "title" | "typing" | "done">("hidden");
  useEffect(() => {
    if (!active) {
      setPhase("hidden");
      return;
    }
    if (seen) {
      setPhase("done");
      return;
    }
    setPhase("title");
    const timer = setTimeout(() => setPhase("typing"), titleDelay);
    return () => clearTimeout(timer);
  }, [active, seen, titleDelay]);
  const typed = useTyped(body, phase === "typing", phase === "done", speed);
  useEffect(() => {
    if (phase === "typing" && typed.length === body.length) {
      setPhase("done");
      onSeen();
    }
  }, [phase, typed, body, onSeen]);
  if (!active) return null;
  const titleOn = phase !== "hidden";
  return (
    <div className="hero">
      <div className="hero-head">
        <span className="hero-glow" aria-hidden="true" />
        <div className={`hero-title-wrap ${titleOn ? "shine" : ""}`}>
          <h2 className={`hero-title ${titleOn ? "on" : ""}`}>{label}</h2>
        </div>
      </div>
      <p className="hero-body" aria-hidden="true">
        {renderWithDates(phase === "done" ? body : phase === "typing" ? typed : "")}
        {phase === "typing" && <span className="caret" />}
      </p>
      <p className="sr-only">{extractPlainText(body)}</p>
    </div>
  );
}

function extractPlainText(text: string): string {
  return text.replace(/\[\[DATE:\s*([^\]]+)\]\]/gi, "$1");
}

function FadeIn({
  active,
  delay = 0,
  children,
  className = "",
}: {
  active: boolean;
  delay?: number;
  children: React.ReactNode;
  className?: string;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(timer);
  }, [active, delay]);
  return <div className={`fade ${shown ? "on" : ""} ${className}`}>{children}</div>;
}

function ZoneReveal({ label, body, active }: { label: string; body: string; active: boolean }) {
  return active ? (
    <FadeIn active={active} className="zone on">
      <p className="zone-label">{label}</p>
      <p className="zone-body">{renderWithDates(body)}</p>
    </FadeIn>
  ) : null;
}

function Calendar({
  windows,
  active,
  reduceMotion,
}: {
  windows: CalendarWindow[];
  active: boolean;
  reduceMotion: boolean;
}) {
  const months = useMemo(() => calendarMonths(windows), [windows]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const month = months[Math.min(index, Math.max(0, months.length - 1))];
  const monthWindows = useMemo(
    () =>
      month
        ? windows.filter(
            (w) =>
              dayValue(w.start) <= Date.UTC(month.y, month.m + 1, 0) &&
              dayValue(w.end) >= Date.UTC(month.y, month.m, 1),
          )
        : [],
    [windows, month],
  );
  useEffect(() => {
    if (!active) setIndex(0);
  }, [active]);
  useEffect(() => {
    setRevealed(reduceMotion ? monthWindows.length : 0);
    if (!active || reduceMotion) return;
    const timers = monthWindows.map((_, i) =>
      setTimeout(() => setRevealed(i + 1), (index === 0 ? 850 : 300) + i * 950),
    );
    return () => timers.forEach(clearTimeout);
  }, [active, index, monthWindows, reduceMotion]);
  if (!month) return null;
  const monthName = new Date(month.y, month.m, 1).toLocaleString("en-US", {
    month: "long",
  });
  return (
    <div className={`cal-card ${active ? "on" : ""}`}>
      <div className="cal-head">
        <button
          type="button"
          className={`cal-nav ${index === 0 ? "hidden" : ""}`}
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="cal-title" aria-live="polite">
          {monthName} {month.y}
        </span>
        <button
          type="button"
          className={`cal-nav ${index >= months.length - 1 ? "hidden" : ""}`}
          disabled={index >= months.length - 1}
          onClick={() => setIndex((i) => Math.min(months.length - 1, i + 1))}
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <MonthGrid y={month.y} m={month.m} windows={monthWindows} revealed={revealed} />
      <p className="sr-only">Highlighted windows: {monthWindows.map((w) => w.date).join("; ")}</p>
    </div>
  );
}

function MonthGrid({
  y,
  m,
  windows,
  revealed,
}: {
  y: number;
  m: number;
  windows: CalendarWindow[];
  revealed: number;
}) {
  const cells: (number | null)[] = Array.from({ length: new Date(y, m, 1).getDay() }, () => null);
  for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) cells.push(d);
  return (
    <>
      <div className="cal-grid cal-dow" aria-hidden="true">
        {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
          <span key={i} className="cal-dow-cell">
            {day}
          </span>
        ))}
      </div>
      <div className="cal-grid" aria-hidden="true">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="cal-cell empty" />;
          const value = Date.UTC(y, m, day);
          const lit = windows
            .slice(0, revealed)
            .some((w) => value >= dayValue(w.start) && value <= dayValue(w.end));
          return (
            <div key={i} className={`cal-cell ${lit ? "ring" : ""}`}>
              <span className="cal-num">{day}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function WindowCard({ section }: { section: TimingSection }) {
  return (
    <div className="act-card">
      <div className="act-head">
        <CalendarDays className="act-icon" aria-hidden="true" />
        <span className="act-label">{section.date ? "Dated Window" : "Timing"}</span>
        {section.date && <span className="date-badge">{section.date}</span>}
        {section.note && <span className="act-note">— {section.note}</span>}
      </div>
      <p className="act-body">{renderWithDates(section.body)}</p>
    </div>
  );
}

function DirectiveCard({ section }: { section: DirectiveSection }) {
  return (
    <div className="act-card">
      <div className="act-head">
        <span className="act-label">{section.label}</span>
        {section.date && <span className="date-badge">{section.date}</span>}
      </div>
      <p className="act-body">{renderWithDates(section.body)}</p>
    </div>
  );
}

function Quiz({
  alignment,
  busy,
  error,
  onAnswer,
  onSubmit,
}: {
  alignment: ReadingAlignment;
  busy: boolean;
  error: string | null;
  onAnswer: (questionId: string, answer: "yes" | "no") => void;
  onSubmit: () => Promise<void>;
}) {
  const completed = alignment.phase === "complete";
  const locked = busy || completed || !!alignment.submittedAnswers;
  const answers = alignment.submittedAnswers ?? alignment.answers;
  const allAnswered = alignment.directAlign.every((q) =>
    answers.some((a) => a.questionId === q.id),
  );
  return (
    <div className="quiz-list" aria-busy={busy}>
      <p className="align-intro">
        Five questions to bring your reading closer to where you are now.
      </p>
      {alignment.directAlign.map((question, i) => (
        <div className="quiz-item" key={question.id}>
          <p className="quiz-q" id={`align-question-${i}`}>
            <span className="quiz-n">{i + 1}</span>
            <span>{question.question}</span>
          </p>
          <div className="quiz-btns" role="group" aria-labelledby={`align-question-${i}`}>
            {(["yes", "no"] as const).map((value) => (
              <button
                type="button"
                key={value}
                className={`quiz-btn ${answers.some((a) => a.questionId === question.id && a.answer === value) ? "sel" : ""}`}
                aria-pressed={answers.some(
                  (a) => a.questionId === question.id && a.answer === value,
                )}
                disabled={locked}
                onClick={() => onAnswer(question.id, value)}
              >
                {value === "yes" ? "Yes" : "No"}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="align-action">
        {completed ? (
          <p role="status">Your answers are included in The Read.</p>
        ) : (
          <>
            <p className="align-progress" role="status">
              {busy
                ? "Bringing your answers into your reading…"
                : `${answers.length} of 5 answered`}
            </p>
            <button
              type="button"
              className="align-submit"
              disabled={!allAnswered || busy}
              onClick={onSubmit}
            >
              {busy
                ? "Aligning your reading…"
                : error || alignment.submittedAnswers
                  ? "Continue My Reading"
                  : "Reveal My Reading"}
            </button>
            {error && (
              <p className="align-error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

type PanelKind =
  | "topic"
  | "prediction"
  | "context"
  | "calendar"
  | "timing"
  | "quiz"
  | "prose"
  | "directive"
  | "closing";
type DeckStep = {
  panelIndex: number;
  label: string;
  contextStage?: "where" | "why" | "how";
};

function ReadingDeck({
  topic,
  content,
  sections,
  alignment,
  alignmentBusy,
  alignmentError,
  onAlignmentAnswer,
  onAlignmentSubmit,
  credits,
  isDownloading,
  onDownload,
  onDone,
  checkoutOpen,
  isSafeResponse,
  children,
}: {
  topic: string;
  content: string;
  sections: ParsedSection[] | null;
  alignment?: ReadingAlignment;
  alignmentBusy: boolean;
  alignmentError: string | null;
  onAlignmentAnswer: (questionId: string, answer: "yes" | "no") => void;
  onAlignmentSubmit: () => Promise<void>;
  credits: UserCredits | null;
  isDownloading: boolean;
  onDownload: () => Promise<void>;
  onDone: () => void;
  checkoutOpen: boolean;
  isSafeResponse: boolean;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [seenPrediction, setSeenPrediction] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const deckRef = useRef<HTMLDivElement | null>(null);
  const stepRef = useRef(0);
  const lock = useRef(false);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const groups = useMemo(() => {
    const join = (kind: ParsedSection["kind"]) =>
      (sections ?? [])
        .filter((s) => s.kind === kind)
        .map((s) => s.body)
        .join("\n\n");
    const timing = (sections ?? []).filter((s): s is TimingSection => s.kind === "window");
    const directives = (sections ?? []).filter(
      (s): s is DirectiveSection => s.kind === "directive",
    );
    const windows = alignment
      ? alignment.calendar.flatMap((anchor) => {
          const window = parseCalendarWindow(anchor.isoDate);
          return window ? [{ ...window, date: anchor.date }] : [];
        })
      : timing
          .flatMap((s) => {
            const window = s.date ? parseCalendarWindow(s.date) : null;
            return window ? [window] : [];
          })
          .sort((a, b) => dayValue(a.start) - dayValue(b.start));
    return {
      prediction: join("prediction"),
      where: join("currentState"),
      why: join("whyNow"),
      how: join("manifestation"),
      prose: sections ? sections.filter((s) => s.kind === "prose").map((s) => s.body) : [content],
      timing,
      directives,
      windows,
    };
  }, [sections, content, alignment]);

  const panels = useMemo<PanelKind[]>(() => {
    if (alignment && !isSafeResponse)
      return [
        "topic",
        "prediction",
        "context",
        "calendar",
        "timing",
        "quiz",
        "prose",
        "directive",
        "closing",
      ];
    const result: PanelKind[] = ["topic"];
    if (groups.prediction) result.push("prediction");
    if (groups.where || groups.why || groups.how) result.push("context");
    if (groups.windows.length) result.push("calendar");
    if (groups.timing.length) result.push("timing");
    if (groups.prose.length) result.push("prose");
    if (groups.directives.length) result.push("directive");
    result.push("closing");
    // Legacy readings retain their existing content, without static questions.
    return result;
  }, [groups, alignment, isSafeResponse]);

  const steps = useMemo<DeckStep[]>(
    () =>
      panels.flatMap((kind, panelIndex): DeckStep[] => {
        if (kind === "context") {
          return (["where", "why", "how"] as const)
            .filter((stage) => !!groups[stage])
            .map((contextStage) => ({
              panelIndex,
              contextStage,
              label: contextStage === "where" ? "Where" : contextStage === "why" ? "Why" : "How",
            }));
        }
        const labels: Record<Exclude<PanelKind, "context">, string> = {
          topic,
          prediction: "The Prediction",
          calendar: "Dated Windows",
          timing: "Timing",
          quiz: "Direct Align",
          prose: "The Read",
          directive: "Your Move",
          closing: "Bottom Line",
        };
        return [{ panelIndex, label: labels[kind] }];
      }),
    [panels, groups, topic],
  );
  const waitingForAlignment = alignment?.phase === "awaiting_alignment";
  const maxStep = waitingForAlignment
    ? steps.findIndex((item) => panels[item.panelIndex] === "quiz")
    : steps.length - 1;
  const wasWaiting = useRef(waitingForAlignment);
  useEffect(() => {
    if (
      wasWaiting.current &&
      !waitingForAlignment &&
      panels[steps[stepRef.current]?.panelIndex] === "quiz"
    ) {
      const next = steps.findIndex((item) => panels[item.panelIndex] === "prose");
      if (next >= 0) {
        stepRef.current = next;
        setStep(next);
      }
    }
    wasWaiting.current = waitingForAlignment;
  }, [waitingForAlignment, panels, steps]);
  const current = steps[Math.min(step, steps.length - 1)];
  const pageIndex = current.panelIndex;
  const bottomActive = panels[pageIndex] === "closing";
  const markPredictionSeen = useCallback(() => setSeenPrediction(true), []);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 80);
    return () => {
      clearTimeout(timer);
      if (lockTimer.current) clearTimeout(lockTimer.current);
    };
  }, []);

  const navigate = useCallback(
    (next: number) => {
      if (checkoutOpen || lock.current) return;
      const bounded = Math.min(maxStep, Math.max(0, next));
      if (bounded === stepRef.current) return;
      stepRef.current = bounded;
      setStep(bounded);
      lock.current = true;
      if (lockTimer.current) clearTimeout(lockTimer.current);
      lockTimer.current = setTimeout(
        () => {
          lock.current = false;
        },
        reduceMotion ? 120 : 740,
      );
    },
    [maxStep, reduceMotion, checkoutOpen],
  );
  const go = useCallback((direction: number) => navigate(stepRef.current + direction), [navigate]);

  useEffect(() => {
    const panel = deckRef.current?.children[pageIndex] as HTMLElement | undefined;
    if (panel) panel.scrollTop = 0;
    // Only page changes reset scroll; Where/Why/How reveals keep their scroll position.
  }, [pageIndex]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || checkoutOpen) return;
    const activePanel = () =>
      deckRef.current?.children[steps[stepRef.current]?.panelIndex] as HTMLElement | undefined;
    const edge = (direction: number) => {
      const panel = activePanel();
      if (!panel || panel.scrollHeight <= panel.clientHeight + 2) return true;
      return direction > 0
        ? panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 2
        : panel.scrollTop <= 2;
    };
    const interactive = (target: EventTarget | null) =>
      target instanceof Element &&
      !!target.closest(
        "input, textarea, select, button, a, [contenteditable]:not([contenteditable='false']), [role='dialog']",
      );

    let wheelTime = 0,
      wheelTotal = 0,
      wheelHandled = false,
      wheelDirection = 0;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX))
        return;
      if (
        event.target instanceof Element &&
        event.target.closest("textarea, select, [contenteditable]")
      )
        return;
      const now = performance.now();
      const direction = event.deltaY > 0 ? 1 : -1;
      if (now - wheelTime > 180 || direction !== wheelDirection) {
        wheelTotal = 0;
        // A gesture that starts inside a tall page belongs to its native scroll.
        wheelHandled = !edge(direction);
      }
      wheelTime = now;
      wheelDirection = direction;
      if (!edge(direction)) return;
      event.preventDefault();
      if (wheelHandled || lock.current) return;
      wheelTotal +=
        Math.abs(event.deltaY) *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
      if (wheelTotal >= 40) {
        wheelHandled = true;
        go(direction);
      }
    };

    let touch: {
      x: number;
      y: number;
      atTop: boolean;
      atBottom: boolean;
    } | null = null;
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || interactive(event.target)) {
        touch = null;
        return;
      }
      touch = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
        atTop: edge(-1),
        atBottom: edge(1),
      };
    };
    const onTouchEnd = (event: TouchEvent) => {
      const start = touch;
      touch = null;
      if (!start || !event.changedTouches[0]) return;
      const dy = event.changedTouches[0].clientY - start.y;
      const dx = event.changedTouches[0].clientX - start.x;
      if (Math.abs(dy) <= 45 || Math.abs(dy) <= Math.abs(dx)) return;
      const direction = dy < 0 ? 1 : -1;
      if ((direction > 0 ? start.atBottom : start.atTop) && edge(direction)) go(direction);
    };
    const onTouchCancel = () => {
      touch = null;
    };
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        interactive(event.target)
      )
        return;
      const forward =
        ["ArrowDown", "PageDown"].includes(event.key) || (event.key === " " && !event.shiftKey);
      const backward =
        ["ArrowUp", "PageUp"].includes(event.key) || (event.key === " " && event.shiftKey);
      if (!forward && !backward) return;
      event.preventDefault();
      const direction = forward ? 1 : -1;
      if (edge(direction)) go(direction);
      else {
        const panel = activePanel();
        panel?.scrollBy({
          top: direction * (event.key.startsWith("Arrow") ? 60 : panel.clientHeight * 0.8),
          behavior: "auto",
        });
      }
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchend", onTouchEnd, { passive: true });
    viewport.addEventListener("touchcancel", onTouchCancel, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("touchcancel", onTouchCancel);
      window.removeEventListener("keydown", onKey);
    };
  }, [go, steps, checkoutOpen]);

  const contextVisible = (stage: "where" | "why" | "how") => {
    const index = steps.findIndex((s) => s.contextStage === stage);
    return index >= 0 && step >= index;
  };
  return (
    <div className="reading-results deck-viewport" ref={viewportRef} aria-label="Your reading">
      <style>{css}</style>
      <ResultsStarfield reduceMotion={reduceMotion} />
      <div className="deck" ref={deckRef} style={{ transform: `translateY(${-pageIndex * 100}%)` }}>
        {panels.map((kind, index) => {
          const active = index === pageIndex;
          const centered = kind === "topic" || kind === "prediction" || kind === "calendar";
          return (
            <section
              key={kind}
              data-panel={kind}
              className={`panel ${centered ? "panel-center" : kind === "context" ? "panel-top" : "panel-scroll"}`}
              aria-hidden={!active}
              aria-label={steps.find((s) => s.panelIndex === index)?.label}
              ref={(node) => {
                node?.toggleAttribute("inert", !active || checkoutOpen);
              }}
            >
              {kind === "topic" && (
                <div className={`career ${mounted ? "in" : ""}`}>
                  <span className="career-mark" aria-hidden="true">
                    ✦
                  </span>
                  <h1 className="career-word">{topic}</h1>
                </div>
              )}
              {kind === "prediction" && (
                <HeroReveal
                  label="The Prediction"
                  body={groups.prediction}
                  active={active}
                  seen={seenPrediction || reduceMotion}
                  onSeen={markPredictionSeen}
                />
              )}
              {kind === "context" && (
                <div className="card">
                  <ZoneReveal label="Where" body={groups.where} active={contextVisible("where")} />
                  <ZoneReveal label="Why" body={groups.why} active={contextVisible("why")} />
                  <ZoneReveal label="How" body={groups.how} active={contextVisible("how")} />
                </div>
              )}
              {kind === "calendar" && (
                <div className="cal-page">
                  <p className="cal-page-heading">Dated Windows</p>
                  {groups.windows.length ? (
                    <Calendar
                      windows={groups.windows}
                      active={active}
                      reduceMotion={reduceMotion}
                    />
                  ) : (
                    <p className="calendar-empty">
                      No exact dates are supported for this question. Timing explains the broader
                      pattern.
                    </p>
                  )}
                </div>
              )}
              {kind === "timing" && (
                <div className="framed-page">
                  <p className="page-eyebrow">Timing</p>
                  <FadeIn active={active} delay={100}>
                    <div className="zone-frame">
                      {groups.timing.map((section, i) => (
                        <WindowCard key={i} section={section} />
                      ))}
                    </div>
                  </FadeIn>
                </div>
              )}
              {kind === "quiz" && alignment && (
                <div className="framed-page">
                  <p className="page-eyebrow">Direct Align</p>
                  <FadeIn active={active} delay={100}>
                    <Quiz
                      alignment={alignment}
                      busy={alignmentBusy}
                      error={alignmentError}
                      onAnswer={onAlignmentAnswer}
                      onSubmit={onAlignmentSubmit}
                    />
                  </FadeIn>
                </div>
              )}
              {kind === "prose" && (
                <div className="framed-page prose-page">
                  <p className="page-eyebrow">The Read</p>
                  <FadeIn active={active} delay={100}>
                    <div className="prose-body">
                      {groups.prose.map((body, i) => (
                        <p key={i}>{renderWithDates(body)}</p>
                      ))}
                    </div>
                  </FadeIn>
                </div>
              )}
              {kind === "directive" && (
                <div className="framed-page">
                  <p className="page-eyebrow">Your Move</p>
                  <FadeIn active={active} delay={100}>
                    <div className="zone-frame">
                      {groups.directives.map((section, i) => (
                        <DirectiveCard key={i} section={section} />
                      ))}
                    </div>
                  </FadeIn>
                </div>
              )}
              {kind === "closing" && (
                <div className={`framed-page closing-page ${bottomActive ? "bottom-focus" : ""}`}>
                  {!waitingForAlignment && children}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <div className={`cue ${step === 0 ? "show" : ""}`} aria-hidden="true">
        <ChevronUp className="cue-chev" />
        <span>swipe up</span>
      </div>
      <nav className="dots" aria-label="Reading sections">
        {steps.map((item, i) => (
          <button
            type="button"
            key={i}
            className={`dot ${i === step ? "on" : ""} ${i < step ? "past" : ""}`}
            onClick={() => navigate(i)}
            aria-label={item.label}
            aria-current={i === step ? "step" : undefined}
            disabled={checkoutOpen || i > maxStep}
          />
        ))}
      </nav>
      {mounted &&
        createPortal(
          <div className="reading-results results-fixed-controls">
            <div
              className={`bottom-bar ${bottomActive ? "show" : ""}`}
              aria-hidden={!bottomActive}
              ref={(node) => {
                node?.toggleAttribute("inert", !bottomActive || checkoutOpen);
              }}
            >
              <div className="bottom-row">
                <button
                  type="button"
                  className="download-btn"
                  aria-label="Download reading"
                  onClick={onDownload}
                  disabled={isDownloading || waitingForAlignment}
                >
                  <Download />
                </button>
                <button type="button" className="done-btn" onClick={onDone}>
                  Done
                </button>
              </div>
              {credits && !credits.isSubscribed && (
                <p className="bottom-credits">{credits.credits} credits remaining</p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export default function ReadingResultsPage() {
  const router = useRouter();
  const [reading, setReading] = useState<StoredReading | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSources, setShowSources] = useState(false);
  const [followups, setFollowups] = useState<FollowupEntry[]>([]);
  const [followupQuestion, setFollowupQuestion] = useState("");
  const [isGeneratingFollowup, setIsGeneratingFollowup] = useState(false);
  const [followupError, setFollowupError] = useState<string | null>(null);
  const [creditsRefresh, setCreditsRefresh] = useState(0);
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isAligning, setIsAligning] = useState(false);
  const [alignmentError, setAlignmentError] = useState<string | null>(null);
  const alignmentRequest = useRef(false);
  const followupRequestId = useRef<string | null>(null);

  // ── Reply system state ──
  const [freeRepliesUsed, setFreeRepliesUsed] = useState(0);
  const [replyCreditsRemaining, setReplyCreditsRemaining] = useState<number | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [justPurchased, setJustPurchased] = useState(false);
  const [tailMode, setTailMode] = useState<"reply_pack" | "sub_reply_tail_regular">("reply_pack");

  const followupEndRef = useRef<HTMLDivElement | null>(null);
  const hasMarkedComplete = useRef(false);

  const readingKey = useMemo(() => {
    // Completion adds content; it is still the same reading and credit event.
    if (reading?.alignment) return reading.id;
    const p = reading?.pages?.[0];
    return p ? hashKey(p.title + "::" + p.content) : "";
  }, [reading]);

  useEffect(() => {
    try {
      const stored = loadReading();
      if (!stored) {
        router.replace("/reading/intake");
        return;
      }
      setReading(stored);
    } catch {
      // The recovery view below handles an unreadable stored reading.
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!reading?.alignment || reading.alignment.phase === "complete") return;
    const expected = reading;
    let active = true;
    alignmentRequest.current = true;
    setIsAligning(true);
    fetch(`/api/readings/direct-align?readingId=${encodeURIComponent(expected.id)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error || "Couldn’t restore your reading. Try continuing below.");
        if (
          !isReadingDelivery(data.reading) ||
          data.reading.id !== expected.id ||
          data.reading.alignment?.initialId !== expected.alignment?.initialId
        )
          throw new Error("The saved reading did not match. Reload and try again.");
        if (!active) return;
        // A fresh server snapshot has no unsubmitted draft answers.
        const restored: StoredReading = data.reading;
        if (
          restored.alignment?.phase === "awaiting_alignment" &&
          !restored.alignment.submittedAnswers
        ) {
          restored.alignment.answers = expected.alignment?.answers ?? [];
        }
        saveReading(restored);
        setReading(restored);
      })
      .catch((error: unknown) => {
        if (active)
          setAlignmentError(
            error instanceof Error
              ? error.message
              : "Couldn’t restore your reading. Try continuing below.",
          );
      })
      .finally(() => {
        if (active) {
          alignmentRequest.current = false;
          setIsAligning(false);
        }
      });
    return () => {
      active = false;
    };
    // Recover once per reading, not again every time an answer changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading?.id]);

  const handleAlignmentAnswer = (questionId: string, answer: "yes" | "no") => {
    if (
      !reading?.alignment ||
      alignmentRequest.current ||
      reading.alignment.phase === "complete" ||
      reading.alignment.submittedAnswers ||
      !reading.alignment.directAlign.some((q) => q.id === questionId)
    )
      return;
    const values = new Map(
      reading.alignment.answers.map((entry) => [entry.questionId, entry.answer]),
    );
    values.set(questionId, answer);
    const answers = reading.alignment.directAlign.flatMap((question): DirectAlignAnswer[] => {
      const value = values.get(question.id);
      return value ? [{ questionId: question.id, answer: value }] : [];
    });
    const next = { ...reading, alignment: { ...reading.alignment, answers } };
    saveReading(next);
    setReading(next);
    setAlignmentError(null);
  };

  const handleAlignmentSubmit = async () => {
    if (!reading?.alignment || alignmentRequest.current || reading.alignment.phase === "complete")
      return;
    const alignment = reading.alignment;
    const answers = alignment.submittedAnswers ?? alignment.answers;
    if (answers.length !== alignment.directAlign.length) return;
    const pending = { ...reading, alignment: { ...alignment, answers, submittedAnswers: answers } };
    // Persist the exact submission before sending it so refresh/retry can recover it.
    saveReading(pending);
    setReading(pending);
    alignmentRequest.current = true;
    setIsAligning(true);
    setAlignmentError(null);
    try {
      const response = await fetch("/api/readings/direct-align", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingId: reading.id, initialId: alignment.initialId, answers }),
      });
      const data = await response.json();
      // Conflict/pending responses may carry the owned server snapshot for recovery.
      if (
        isReadingDelivery(data.reading) &&
        data.reading.id === reading.id &&
        data.reading.alignment?.initialId === alignment.initialId
      ) {
        saveReading(data.reading);
        setReading(data.reading);
        if (data.reading.alignment.phase === "complete") return;
      }
      if (!response.ok || response.status === 202) {
        throw new Error(
          data.error || "Your reading is still being prepared. Continue again in a moment.",
        );
      }
      throw new Error(
        "The completed reading couldn’t be verified. Your answers are saved; try again.",
      );
    } catch (error) {
      setAlignmentError(
        error instanceof Error
          ? error.message
          : "Couldn’t complete your reading. Your answers are saved; try again.",
      );
    } finally {
      alignmentRequest.current = false;
      setIsAligning(false);
    }
  };

  useEffect(() => {
    if (!reading || !readingKey) return;

    if ((reading as { isSafeResponse?: boolean }).isSafeResponse) {
      hasMarkedComplete.current = true;
      return;
    }

    const completedFlag = "dfp_reading_done_" + readingKey;

    try {
      if (localStorage.getItem(completedFlag) === "1") {
        hasMarkedComplete.current = true;
        return;
      }
    } catch {
      // localStorage unavailable — fall through to the in-session guard.
    }

    if (!hasMarkedComplete.current) {
      hasMarkedComplete.current = true;
      fetch(
        "/api/user/reading-complete",
        reading.alignment
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ readingId: reading.id }),
            }
          : { method: "POST" },
      )
        .then((res) => {
          if (!res.ok) throw new Error("reading-complete failed");
          try {
            localStorage.setItem(completedFlag, "1");
          } catch {
            // ignore persistence failure
          }
        })
        .catch(() => {
          hasMarkedComplete.current = false;
        });
    }
  }, [reading, readingKey]);

  useEffect(() => {
    if (!reading || !readingKey) return;

    try {
      const prev = localStorage.getItem("dfp_last_reading_key") ?? "";
      if (prev && prev !== readingKey) {
        localStorage.removeItem(`dfp_followups_${prev}`);
        localStorage.removeItem(`dfp_free_used_${prev}`);
        localStorage.removeItem(`dfp_paywall_${prev}`);
      }
      localStorage.setItem("dfp_last_reading_key", readingKey);
    } catch {
      // ignore
    }

    try {
      const used = Number(localStorage.getItem(`dfp_free_used_${readingKey}`) ?? 0);
      setFreeRepliesUsed(Number.isFinite(used) ? Math.max(0, used) : 0);
    } catch {
      setFreeRepliesUsed(0);
    }

    try {
      const raw = localStorage.getItem(`dfp_followups_${readingKey}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed))
          setFollowups(
            parsed.filter(
              (entry): entry is FollowupEntry =>
                !!entry &&
                typeof entry.id === "string" &&
                typeof entry.question === "string" &&
                typeof entry.title === "string" &&
                typeof entry.content === "string",
            ),
          );
      }
    } catch {
      // ignore malformed cache
    }

    let cameFromSuccess = false;
    try {
      const params = new URLSearchParams(window.location.search);
      const returnedMode = params.get("mode");
      cameFromSuccess =
        params.get("payment") === "success" &&
        (returnedMode === "reply_pack" || returnedMode === "sub_reply_tail_regular");
    } catch {
      // ignore
    }

    if (cameFromSuccess) {
      setJustPurchased(true);
      setShowPaywall(false);
      try {
        localStorage.removeItem(`dfp_paywall_${readingKey}`);
      } catch {
        // ignore
      }
    } else {
      try {
        setShowPaywall(localStorage.getItem(`dfp_paywall_${readingKey}`) === "1");
      } catch {
        setShowPaywall(false);
      }
    }

    try {
      if (new URLSearchParams(window.location.search).has("payment")) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch {
      // ignore
    }

    setReplyCreditsRemaining(null);
  }, [reading, readingKey]);

  useEffect(() => {
    const fetchCredits = async () => {
      try {
        const res = await fetch("/api/user/credits");
        if (!res.ok) return;
        const data = await res.json();
        setCredits({
          credits: Number(data.credits ?? 0),
          isSubscribed: data.isSubscribed === true,
          freeRepliesRemaining: Number(data.freeRepliesRemaining ?? 0),
        });
      } catch {
        // silent
      }
    };
    fetchCredits();
  }, [followups.length, creditsRefresh]);

  // The parser accepts the existing engine output and the new The Read heading.

  const page = reading?.pages?.[0] ?? null;

  const parsedSections = useMemo(
    () => (page?.content ? parseReadingSections(page.content) : null),
    [page?.content],
  );

  const closingSections = parsedSections?.filter((section) => section.kind === "closing") ?? [];

  const handleDownload = async () => {
    if (!reading || !page || reading.alignment?.phase === "awaiting_alignment") return;
    setIsDownloading(true);
    try {
      const plain = page.content.replace(/\[\[DATE:\s*([^\]]+)\]\]/g, "$1");
      const text = `${page.title}\n\n${plain}\n\n— Generated by AstroXL`;
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reading-${reading.topic}-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFollowup = async () => {
    const question = followupQuestion.trim();
    if (
      !question ||
      isGeneratingFollowup ||
      !reading ||
      !page ||
      reading.alignment?.phase === "awaiting_alignment"
    )
      return;

    setIsGeneratingFollowup(true);
    setFollowupError(null);
    followupRequestId.current ??= crypto.randomUUID();

    try {
      const chart = loadChart();
      if (!chart?.chartData) {
        setFollowupError("Chart data missing. Please recalculate your chart.");
        return;
      }

      const conversationHistory = followups
        .map((f) => `Q: ${f.question}\nA: ${f.content}`)
        .join("\n\n");

      const response = await fetch("/api/readings/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          readingId: reading.id,
          requestId: followupRequestId.current,
          question,
          originalReading: page.content,
          originalTitle: page.title,
          topic: reading.topic,
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
          extendedPoints: chart.chartData.extendedPoints,
          houseRulers: chart.chartData.houseRulers,
          mutualReceptions: chart.chartData.mutualReceptions,
          synodicCycles: chart.chartData.synodicCycles,
          midpoints: chart.chartData.midpoints,
          transitsToAngles: chart.chartData.transitsToAngles,
          essentialDignities: chart.chartData.essentialDignities,
          lunarReturn: chart.chartData.lunarReturn,
          eclipseActivations: chart.chartData.eclipseActivations,
          dispositorTree: chart.chartData.dispositorTree,
          conversationHistory: conversationHistory || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (response.status === 402 || data.code === "NEEDS_REPLY_PACK") {
          if (data.tailMode === "reply_pack" || data.tailMode === "sub_reply_tail_regular")
            setTailMode(data.tailMode);
          setShowPaywall(true);
          try {
            if (readingKey) localStorage.setItem(`dfp_paywall_${readingKey}`, "1");
          } catch {
            // ignore
          }
          return;
        }
        setFollowupError(data.error || "Something went wrong. Please try again.");
        return;
      }

      if (typeof data.content !== "string" || !data.content.trim()) {
        setFollowupError("The reply came back empty. Please try again.");
        return;
      }
      const meta = data.replyMeta;
      if (meta?.usedIncludedReply) {
        const nextUsed = freeRepliesUsed + 1;
        setFreeRepliesUsed(nextUsed);
        try {
          if (readingKey) localStorage.setItem(`dfp_free_used_${readingKey}`, String(nextUsed));
        } catch {
          // ignore
        }
      }
      if (meta && typeof meta.replyCreditsRemaining === "number") {
        setReplyCreditsRemaining(meta.replyCreditsRemaining);
      }
      setShowPaywall(false);
      try {
        if (readingKey) localStorage.removeItem(`dfp_paywall_${readingKey}`);
      } catch {
        // ignore
      }

      const newEntry: FollowupEntry = {
        id: crypto.randomUUID(),
        question,
        title: typeof data.title === "string" ? data.title : "Going Deeper",
        content: data.content,
      };
      followupRequestId.current = null;
      const nextFollowups = [...followups, newEntry];
      setFollowups(nextFollowups);
      try {
        if (readingKey)
          localStorage.setItem(`dfp_followups_${readingKey}`, JSON.stringify(nextFollowups));
      } catch {
        // ignore
      }
      setFollowupQuestion("");
      setTimeout(() => {
        const end = followupEndRef.current;
        const panel = end?.closest<HTMLElement>(".panel");
        if (end && panel) {
          panel.scrollTo({
            top:
              panel.scrollTop +
              end.getBoundingClientRect().bottom -
              panel.getBoundingClientRect().top -
              panel.clientHeight +
              140,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
          });
        }
      }, 120);
    } catch {
      setFollowupError("Something went wrong. Please try again.");
    } finally {
      setIsGeneratingFollowup(false);
    }
  };

  const startCheckout = async (mode: "reply_pack" | "sub_reply_tail_regular" | "subscription") => {
    if (isPurchasing) return;
    if (!stripePromise) {
      setFollowupError("Checkout is unavailable right now. Please try again later.");
      return;
    }
    setIsPurchasing(true);
    setFollowupError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (data?.clientSecret) {
        setClientSecret(data.clientSecret);
      } else {
        setFollowupError(data?.error || "Couldn't start checkout. Please try again.");
        setIsPurchasing(false);
      }
    } catch {
      setFollowupError("Couldn't start checkout. Please try again.");
      setIsPurchasing(false);
    }
  };

  const handleBuyReplyPack = () => startCheckout(tailMode);
  const handleSubscribe = () => startCheckout("subscription");

  const handleDone = () => {
    clearIntake();
    router.push("/reading/intake");
  };

  if (isLoading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: "#0a0e27" }}
      >
        <p className="text-sm text-slate-400" role="status">
          Loading your reading…
        </p>
      </div>
    );
  }
  if (!reading || !page || typeof page.content !== "string" || !page.content.trim()) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4"
        style={{ background: "#0a0e27", color: "#e2e8f0" }}
      >
        <p>This reading couldn’t load.</p>
        <button
          type="button"
          onClick={handleDone}
          className="rounded-xl border border-teal-400/30 px-5 py-3 text-teal-200"
        >
          Start a new reading
        </button>
      </div>
    );
  }

  // Existing reply allowances and purchase modes are carried over from the source.
  const isSubscribed = credits?.isSubscribed === true;
  const freeBand = isSubscribed ? SUBSCRIBER_READING_REPLIES : REGULAR_READING_REPLIES;
  const freeRemainingClient = Math.max(0, freeBand - freeRepliesUsed);
  const outOfReplies =
    !isSubscribed &&
    freeRemainingClient <= 0 &&
    replyCreditsRemaining !== null &&
    replyCreditsRemaining <= 0;
  const paywallVisible = !isSubscribed && (showPaywall || outOfReplies);

  return (
    <>
      <ReadingDeck
        key={readingKey}
        alignment={reading.alignment}
        alignmentBusy={isAligning}
        alignmentError={alignmentError}
        onAlignmentAnswer={handleAlignmentAnswer}
        onAlignmentSubmit={handleAlignmentSubmit}
        topic={reading.topic}
        content={page.content}
        sections={parsedSections}
        credits={credits}
        isDownloading={isDownloading}
        onDownload={handleDownload}
        onDone={handleDone}
        checkoutOpen={!!clientSecret}
        isSafeResponse={
          (reading as StoredReading & { isSafeResponse?: boolean }).isSafeResponse === true
        }
      >
        {closingSections.length > 0 && (
          <div className="bottom-line-wrap">
            <p className="bottom-line-label">Bottom Line</p>

            {closingSections.map((section, i) => (
              <p key={i} className="closing-line">
                {renderWithDates(section.body)}
              </p>
            ))}
          </div>
        )}
        {/* ── Astrological Sources ── */}
        {page.sources && page.sources.length > 0 && (
          <div className="sources-wrap">
            <button
              type="button"
              className={`sources-toggle ${showSources ? "open" : ""}`}
              onClick={() => setShowSources((s) => !s)}
              aria-expanded={showSources}
              aria-controls="reading-sources"
            >
              <span>Astrological Sources</span>

              <ChevronDown className="sources-chevron h-3.5 w-3.5" />
            </button>

            <AnimatePresence>
              {showSources && (
                <motion.div
                  id="reading-sources"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{
                    height: "auto",
                    opacity: 1,
                  }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    duration: 0.22,
                    ease: "easeOut",
                  }}
                  className="overflow-hidden text-left"
                >
                  <div className="mt-3 space-y-2.5">
                    {page.sources.map((src, i) => {
                      const hasDate = src.placements.includes("exact on");

                      return (
                        <div key={i} className="rounded-xl bg-black/25 px-3.5 py-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-300/80">
                            {src.section}

                            {hasDate && (
                              <span className="ml-2 text-[9px] text-yellow-400/60">⚡ dated</span>
                            )}
                          </p>

                          <p className="mt-1 text-[12px] leading-5 text-slate-400">
                            {src.placements}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        {/* ── GOING DEEPER — follow-ups ── */}
        <section className="mt-10">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.07]" />
            <span className="text-[11px] uppercase tracking-[0.24em] text-teal-300/90">
              Going Deeper
            </span>
            <div className="h-px flex-1 bg-white/[0.07]" />
          </div>

          {followups.map((f) => (
            <div key={f.id} className="mb-5">
              <p className="mb-2 px-1 text-[13px] italic leading-6 text-slate-500">
                "{f.question}"
              </p>
              <h3 className="reading-title mb-2 text-[18px] text-white">{f.title}</h3>
              <div className="reading-body" style={{ fontSize: 15 }}>
                {renderWithDates(f.content)}
              </div>
            </div>
          ))}
          <div ref={followupEndRef} />

          {justPurchased && (
            <div className="purchase-success">
              ✓ {isSubscribed ? "4" : "2"} replies added — ask away.
            </div>
          )}

          {paywallVisible ? (
            <div className="paywall-card">
              <p className="paywall-title">
                {isSubscribed ? "You've used your 4 free replies" : "You've used your free replies"}
              </p>
              <p className="paywall-sub">
                {isSubscribed
                  ? "As a subscriber, 4 more are half-price."
                  : "Keep the conversation going and get even more clarity."}
              </p>
              <button
                type="button"
                className="paywall-buy"
                onClick={handleBuyReplyPack}
                disabled={isPurchasing}
              >
                {isPurchasing
                  ? "Opening checkout…"
                  : isSubscribed
                    ? "Get 4 more replies · $2"
                    : "Get 2 more replies · $2"}
              </button>
              {!isSubscribed && (
                <button
                  type="button"
                  className="paywall-sub-link"
                  onClick={handleSubscribe}
                  disabled={isPurchasing}
                >
                  or subscribe for more each month
                </button>
              )}
              {followupError && <p className="mt-2 text-[12px] text-red-300">{followupError}</p>}
            </div>
          ) : (
            <>
              <p className="mb-2 px-1 text-[12px] text-slate-500">
                Don't overthink this. Just say what's on your mind.
              </p>
              <textarea
                className="followup-input"
                aria-label="Ask a follow-up question"
                rows={3}
                value={followupQuestion}
                onChange={(e) => setFollowupQuestion(e.target.value)}
                placeholder="Ask a follow up…"
                disabled={isGeneratingFollowup}
              />
              {followupError && <p className="mt-2 text-[12px] text-red-300">{followupError}</p>}
              <button
                type="button"
                onClick={handleFollowup}
                disabled={isGeneratingFollowup || !followupQuestion.trim()}
                className="mt-3 h-12 w-full rounded-2xl border border-teal-400/30 bg-teal-400/[0.08] text-[14px] font-semibold text-teal-200 transition disabled:opacity-40"
              >
                {isGeneratingFollowup ? "Reading the sky…" : "Ask"}
              </button>

              {isSubscribed ? (
                <p className="mt-2 text-center text-[11px] text-slate-500">
                  {freeRemainingClient > 0
                    ? `${freeRemainingClient} free ${freeRemainingClient === 1 ? "reply" : "replies"} this reading`
                    : "Half-price replies available"}
                </p>
              ) : freeRemainingClient > 0 ? (
                <p className="mt-2 text-center text-[11px] text-slate-500">
                  {freeRemainingClient} free {freeRemainingClient === 1 ? "reply" : "replies"}{" "}
                  remaining
                </p>
              ) : replyCreditsRemaining && replyCreditsRemaining > 0 ? (
                <p className="mt-2 text-center text-[11px] text-slate-500">
                  {replyCreditsRemaining} {replyCreditsRemaining === 1 ? "reply" : "replies"}{" "}
                  remaining
                </p>
              ) : null}
            </>
          )}
        </section>
      </ReadingDeck>
      {/* ── Embedded Stripe checkout modal ── */}
      {clientSecret && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reply checkout"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setClientSecret(null);
              setIsPurchasing(false);
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(4, 6, 17, 0.85)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            overflowY: "auto",
            padding: "24px 16px calc(24px + env(safe-area-inset-bottom))",
          }}
        >
          <div style={{ width: "100%", maxWidth: 480 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: 8,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setClientSecret(null);
                  setIsPurchasing(false);
                }}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#e2e8f0",
                  borderRadius: 9999,
                  width: 36,
                  height: 36,
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                }}
                aria-label="Close checkout"
                autoFocus
              >
                ✕
              </button>
            </div>
            <div
              style={{
                borderRadius: 16,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              <EmbeddedCheckoutProvider
                stripe={stripePromise}
                options={{
                  clientSecret,
                  onComplete: () => {
                    setClientSecret(null);
                    setIsPurchasing(false);
                    setJustPurchased(true);
                    setShowPaywall(false);
                    setReplyCreditsRemaining(null);
                    setCreditsRefresh((value) => value + 1);
                    try {
                      if (readingKey) localStorage.removeItem(`dfp_paywall_${readingKey}`);
                    } catch {
                      // ignore
                    }
                  },
                }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const css = `

  .reading-results, .reading-results * { box-sizing: border-box; }

  .reading-results.deck-viewport {
    position: fixed;
    inset: 0;
    z-index: 40;
    height: 100dvh;
    width: 100%;
    overflow: hidden;
    background: linear-gradient(180deg,#0a0e27 0%,#0b1030 12%,#080c24 24%,#050718 36%,#02030c 48%,#000 62%,#000 100%);
    color: #e2e8f0;
    font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
    -webkit-tap-highlight-color: transparent;
    user-select: text;
    touch-action: pan-y;
  }

  .reading-results .results-starfield { position: absolute; inset: 0; z-index: 0; pointer-events: none; }

  .reading-results .deck {
    height: 100%;
    position: relative;
    z-index: 1;
    transition: transform 0.72s cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform;
  }

  .reading-results .panel {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    overscroll-behavior-y: contain;
    overflow-x: hidden;
    padding: 0 26px;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
    scrollbar-width: none;
  }
  .reading-results .panel::-webkit-scrollbar { display: none; }
  .reading-results .panel-center { align-items: center; justify-content: center; }
  .reading-results .panel-scroll {
    align-items: center;
    justify-content: flex-start;
    padding-top: calc(env(safe-area-inset-top) + 28px);
    padding-bottom: calc(env(safe-area-inset-bottom) + 132px);
  }
  .reading-results .panel-top {
    align-items: flex-start;
    justify-content: center;
    padding-top: calc(env(safe-area-inset-top) + 22px);
    padding-bottom: calc(env(safe-area-inset-bottom) + 26px);
  }

  /* ── Page 1 — CAREER ── */
  .reading-results .career {
    text-align: center;
    opacity: 0;
    transform: translateY(8px);
    letter-spacing: 0.42em;
    transition: opacity 1.7s ease, transform 1.7s ease, letter-spacing 1.7s ease;
  }
  .reading-results .career.in { opacity: 1; transform: none; letter-spacing: 0.12em; }
  .reading-results .career-mark {
    display: block;
    color: rgba(94,234,212,0.55);
    font-size: 15px;
    margin-bottom: 22px;
    text-shadow: 0 0 16px rgba(94,234,212,0.4);
  }
  .reading-results .career-word {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-weight: 600;
    font-size: clamp(46px, 15vw, 96px);
    text-transform: uppercase;
    color: #fff;
    text-shadow: 0 0 44px rgba(94,234,212,0.22), 0 0 100px rgba(94,234,212,0.10);
  }

  /* ── Hero (Page 2 prediction) ── */
  .reading-results .hero { max-width: 32rem; margin: 0 auto; }
  .reading-results .hero-head { position: relative; display: flex; justify-content: center; margin-bottom: 26px; }
  .reading-results .hero-glow {
    position: absolute;
    top: 50%; left: 50%;
    width: 320px; height: 150px;
    transform: translate(-50%, -50%);
    background: radial-gradient(ellipse at center, rgba(94,234,212,0.22), rgba(94,234,212,0) 68%);
    filter: blur(26px);
    opacity: 0;
    transition: opacity 1s ease;
    pointer-events: none;
  }
  .reading-results .hero-head:has(.hero-title.on) .hero-glow { opacity: 1; }
  .reading-results .hero-title-wrap { position: relative; display: inline-block; overflow: hidden; padding: 2px 8px; }
  .reading-results .hero-title {
    margin: 0;
    font-family: Georgia, serif;
    font-weight: 600;
    font-size: clamp(32px, 8.5vw, 46px);
    color: #fff;
    letter-spacing: -0.01em;
    text-shadow: 0 0 30px rgba(94,234,212,0.15);
    opacity: 0;
    transform: translateY(5px);
    transition: opacity 0.45s ease, transform 0.45s ease;
  }
  .reading-results .hero-title.on { opacity: 1; transform: none; }
  .reading-results .hero-title-wrap::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(115deg, transparent 32%, rgba(255,255,255,0.55) 50%, transparent 68%);
    transform: translateX(-130%);
    pointer-events: none;
  }
  .reading-results .hero-title-wrap.shine::after { animation: reading-sweep 1.15s ease-out 0.25s 1 forwards; }
  @keyframes reading-sweep { to { transform: translateX(130%); } }
  .reading-results .hero-body {
    margin: 0;
    font-family: Georgia, serif;
    font-size: 19px;
    line-height: 1.72;
    color: #dbe4f0;
    text-align: left;
    min-height: 1.72em;
  }

  /* ── Page 3 card + zones ── */
  .reading-results .card {
    width: 100%;
    max-width: 30rem;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(148,163,184,0.16);
    border-radius: 26px;
    background: rgba(5,8,24,0.22);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.03), 0 30px 80px rgba(0,0,0,0.25);
    backdrop-filter: blur(4px);
    padding: 24px 22px 26px;
  }
  .reading-results .zone {
    display: flex;
    flex-direction: column;
    opacity: 0;
    transform: translateY(7px);
    transition: opacity 0.7s ease, transform 0.7s ease;
  }
  .reading-results .zone.on { opacity: 1; transform: none; }
  .reading-results .zone + .zone { margin-top: 18px; }
  .reading-results .zone-label {
    margin: 0 0 7px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(94,234,212,0.9);
  }
  .reading-results .zone-body {
    margin: 0;
    font-family: Georgia, serif;
    font-size: 15.5px;
    line-height: 1.6;
    color: #cdd7e6;
  }

  /* ── Page 4 / 5 — Calendar + Windows ── */
  .reading-results .fade {
    opacity: 0;
    transform: translateY(8px);
    transition: opacity 0.7s ease, transform 0.7s ease;
  }
  .reading-results .fade.on { opacity: 1; transform: none; }
  .reading-results .fade + .fade { margin-top: 12px; }

  /* Calendar page — standalone, centered, no wrapping card */
  .reading-results .cal-page { width: 100%; max-width: 22rem; margin: 0 auto; text-align: center; }
  .reading-results .cal-page-heading {
    margin: 0 0 22px;
    font-size: 11px; font-weight: 700; letter-spacing: 0.22em;
    text-transform: uppercase; color: rgba(94,234,212,0.9);
  }
  .reading-results .cal-card {
    border: 1px solid rgba(148,163,184,0.16);
    border-radius: 24px;
    background: rgba(9,13,33,0.5);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.03), 0 30px 80px rgba(0,0,0,0.3);
    backdrop-filter: blur(4px);
    padding: 18px 16px 20px;
    opacity: 0;
    transform: translateY(10px) scale(0.965);
    transition: opacity 0.85s ease, transform 0.85s cubic-bezier(0.22,1,0.36,1);
  }
  .reading-results .cal-card.on { opacity: 1; transform: none; }
  .reading-results .cal-head {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 14px; padding: 0 2px;
  }
  .reading-results .cal-title {
    margin: 0;
    font-family: Georgia, serif;
    font-size: 17px; color: #eaf1fd; letter-spacing: 0.01em;
  }
  .reading-results .cal-nav {
    width: 30px; height: 30px;
    border-radius: 9999px;
    border: 1px solid rgba(148,163,184,0.2);
    background: transparent;
    color: #9fb0c8;
    font-size: 18px; line-height: 1;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    -webkit-tap-highlight-color: transparent;
    transition: color 0.2s ease, border-color 0.2s ease;
  }
  .reading-results .cal-nav:hover { color: #e2e8f0; border-color: rgba(94,234,212,0.45); }
  .reading-results .cal-nav.hidden { visibility: hidden; }
  .reading-results .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
  .reading-results .cal-dow { margin-bottom: 5px; }
  .reading-results .cal-dow-cell {
    text-align: center;
    font-family: ui-sans-serif, system-ui;
    font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
    color: #5b6b83; text-transform: uppercase;
  }
  .reading-results .cal-cell {
    position: relative;
    aspect-ratio: 1 / 1;
    display: flex; align-items: center; justify-content: center;
    font-family: ui-sans-serif, system-ui;
    font-size: 13.5px; color: #aeb9cc;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
    outline: none;
  }
  .reading-results .cal-cell.empty { visibility: hidden; }
  .reading-results .cal-num { position: relative; z-index: 1; }
  .reading-results .cal-cell.ring .cal-num { color: #f2f8ff; font-weight: 600; }
  .reading-results .cal-cell.ring::before {
    content: "";
    position: absolute;
    inset: 10%;
    border-radius: 9999px;
    border: 1.5px solid rgba(94,234,212,0.9);
    animation: reading-ringIn 0.5s ease both, reading-ringGlow 2.6s ease-in-out 0.5s infinite;
  }
  @keyframes reading-ringIn {
    from { opacity: 0; transform: scale(0.55); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes reading-ringGlow {
    0%, 100% { box-shadow: 0 0 7px rgba(94,234,212,0.4), inset 0 0 5px rgba(94,234,212,0.18); }
    50% { box-shadow: 0 0 16px rgba(94,234,212,0.75), inset 0 0 8px rgba(94,234,212,0.3); }
  }

  /* Framed card pages (Timing + Your Move) */
  .reading-results .framed-page { width: 100%; max-width: 30rem; margin: 0 auto; }
  .reading-results .page-eyebrow {
    margin: 0 0 16px;
    text-align: center;
    font-size: 11px; font-weight: 700; letter-spacing: 0.22em;
    text-transform: uppercase; color: rgba(94,234,212,0.9);
  }
  .reading-results .zone-frame {
    border: 1px solid rgba(148,163,184,0.18);
    border-radius: 24px;
    padding: 10px;
    background: rgba(5,8,24,0.28);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.03),
      0 22px 70px rgba(0,0,0,0.18),
      0 0 44px rgba(94,234,212,0.05);
    backdrop-filter: blur(5px);
  }
  .reading-results .act-card {
    border: 1px solid rgba(255,255,255,0.075);
    border-radius: 18px;
    padding: 16px 17px;
    background: rgba(17,22,51,0.5);
  }
  .reading-results .act-card + .act-card { margin-top: 9px; }
  .reading-results .act-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
  .reading-results .act-icon { width: 15px; height: 15px; color: rgba(94,234,212,0.85); flex-shrink: 0; }
  .reading-results .act-label {
    font-family: ui-sans-serif, system-ui;
    font-size: 10px; font-weight: 700; letter-spacing: 0.16em;
    text-transform: uppercase; color: #5eead4;
  }
  .reading-results .act-label-block { display: block; margin: 0 0 8px; }
  .reading-results .act-body {
    margin: 0;
    font-family: Georgia, serif;
    font-size: 15px; line-height: 1.8; color: #cbd5e1;
  }

  .reading-results .date-badge {
    display: inline-block;
    padding: 1px 10px;
    border-radius: 9999px;
    background: linear-gradient(135deg, rgba(251,191,36,0.18), rgba(217,119,6,0.12));
    border: 1px solid rgba(251,191,36,0.35);
    color: #fbbf24;
    font-family: ui-sans-serif, system-ui;
    font-size: 12px; font-weight: 600; letter-spacing: 0.04em;
    text-transform: uppercase; white-space: nowrap;
    box-shadow: 0 0 18px rgba(251,191,36,0.12);
    vertical-align: baseline;
  }

  /* Direct Align quiz */
  .reading-results .align-intro, .reading-results .calendar-empty {
    color: #94a3b8; font-size: 14px; line-height: 1.7; margin: 0 0 24px;
  }
  .reading-results .calendar-empty { max-width: 380px; text-align: center; }
  .reading-results .align-action { margin-top: 28px; color: #94a3b8; font-size: 13px; line-height: 1.6; }
  .reading-results .align-progress { margin: 0 0 12px; }
  .reading-results .align-submit {
    width: 100%; padding: 14px 20px; border-radius: 12px;
    border: 1px solid rgba(94,234,212,0.45); background: rgba(94,234,212,0.12);
    color: #ccfbf1; font: inherit; cursor: pointer;
  }
  .reading-results .align-submit:disabled { opacity: 0.5; cursor: default; }
  .reading-results .align-error { color: #fda4af; margin-top: 14px; }
  .reading-results .quiz-btn:disabled { cursor: default; }
  .reading-results .dot:disabled { opacity: 0.25; cursor: default; }
  .reading-results .quiz-item {
    border-top: 1px solid rgba(255,255,255,0.08);
    padding-top: 16px;
  }
  .reading-results .quiz-item:first-child { border-top: none; padding-top: 0; }
  .reading-results .quiz-item + .quiz-item { margin-top: 16px; }
  .reading-results .quiz-q {
    display: flex;
    gap: 11px;
    margin: 0;
    font-family: Georgia, serif;
    font-size: 15px; line-height: 1.45; color: #dbe4f0;
  }
  .reading-results .quiz-n {
    flex-shrink: 0;
    font-family: ui-sans-serif, system-ui;
    font-size: 13px; font-weight: 700; color: #5eead4;
    padding-top: 1px;
  }
  .reading-results .quiz-btns { display: flex; gap: 10px; margin-top: 11px; }
  .reading-results .quiz-btn {
    flex: 1;
    height: 42px;
    border-radius: 13px;
    border: 1px solid rgba(148,163,184,0.25);
    background: rgba(17,22,51,0.4);
    color: #cbd5e1;
    font-family: ui-sans-serif, system-ui;
    font-size: 13px; font-weight: 600; letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
  }
  .reading-results .quiz-btn:hover { border-color: rgba(94,234,212,0.4); }
  .reading-results .quiz-btn.sel {
    border-color: rgba(94,234,212,0.7);
    background: linear-gradient(135deg, rgba(94,234,212,0.92), rgba(45,212,191,0.82));
    color: #04231f;
    box-shadow: 0 0 22px rgba(94,234,212,0.3);
  }

  /* The Read — prose page */
  .reading-results .prose-body p {
    margin: 0 0 16px;
    font-family: Georgia, serif;
    font-size: 16px; line-height: 1.85; color: #dbe4f0;
  }
  .reading-results .prose-body p:last-child { margin-bottom: 0; }

  /* Portaled to document.body so animated or scrolling app containers cannot move it. */
  .reading-results.results-fixed-controls {
    font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  }
  /* Fixed bottom bar (pinned to the screen) */
  .reading-results .bottom-bar {
    position: fixed;
    left: 0; right: 0; bottom: 0;
    z-index: 50;
    padding: 12px 16px calc(10px + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 7px;
    background: linear-gradient(180deg, rgba(2,3,12,0) 0%, rgba(2,3,12,0.85) 34%, rgba(2,3,12,0.96) 100%);
    opacity: 0;
    transform: translateY(8px);
    transition: opacity 0.5s ease, transform 0.5s ease;
    pointer-events: none;
  }
  .reading-results .bottom-bar.show { opacity: 1; transform: none; pointer-events: auto; }
  .reading-results .bottom-row { display: flex; gap: 12px; align-items: center; }
  .reading-results .download-btn {
    width: 52px; height: 52px; flex-shrink: 0;
    border-radius: 16px;
    border: 1px solid rgba(251,191,36,0.5);
    background: rgba(251,191,36,0.08);
    color: #fbbf24;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    animation: reading-dlPulse 2.6s ease-in-out infinite;
  }
  .reading-results .download-btn svg { width: 20px; height: 20px; }
  @keyframes reading-dlPulse {
    0%, 100% { box-shadow: 0 0 0 1px rgba(251,191,36,0.35), 0 0 20px rgba(251,191,36,0.16); }
    50% { box-shadow: 0 0 0 1px rgba(251,191,36,0.6), 0 0 30px rgba(251,191,36,0.3); }
  }
  .reading-results .done-btn {
    flex: 1; height: 52px;
    border-radius: 16px; border: none;
    background: #5eead4; color: #042f2e;
    font-family: ui-sans-serif, system-ui;
    font-size: 16px; font-weight: 700;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    box-shadow: 0 0 34px rgba(94,234,212,0.3);
  }
  .reading-results .bottom-credits {
    margin: 0;
    text-align: center;
    font-family: ui-sans-serif, system-ui;
    font-size: 11px; color: #64748b;
  }

  /* ── Typing caret ── */
  .reading-results .caret {
    display: inline-block;
    width: 2px;
    height: 1.05em;
    margin-left: 2px;
    vertical-align: -0.15em;
    background: rgba(94,234,212,0.9);
    animation: reading-blink 1s steps(1) infinite;
  }
  @keyframes reading-blink { 50% { opacity: 0; } }

  /* ── Swipe cue ── */
  .reading-results .cue {
    position: absolute;
    left: 0; right: 0;
    bottom: calc(env(safe-area-inset-bottom) + 30px);
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    color: rgba(148,163,184,0.8);
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    opacity: 0;
    transition: opacity 0.6s ease;
    pointer-events: none;
  }
  .reading-results .cue.show { opacity: 1; }
  .reading-results .cue-chev { width: 20px; height: 20px; animation: reading-bob 1.9s ease-in-out infinite; }
  @keyframes reading-bob { 0%,100% { transform: translateY(0); opacity: 0.6; } 50% { transform: translateY(-6px); opacity: 1; } }

  /* ── Step dots ── */
  .reading-results .dots {
    position: absolute;
    right: 14px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .reading-results .dot {
    width: 6px; height: 6px;
    border-radius: 9999px;
    background: rgba(148,163,184,0.25);
    transition: all 0.4s ease;
  }
  .reading-results .dot.past { background: rgba(94,234,212,0.4); }
  .reading-results .dot.on {
    background: rgba(94,234,212,0.95);
    box-shadow: 0 0 10px rgba(94,234,212,0.6);
    height: 16px;
  }

  @media (prefers-reduced-motion: reduce) {
    .reading-results .deck { transition: none; }
    .reading-results .career, .reading-results .hero-title, .reading-results .zone, .reading-results .fade, .reading-results .cal-card { transition: none; }
    .reading-results .cue-chev, .reading-results .caret, .reading-results .cal-cell.ring::before { animation: none; }
    .reading-results .hero-title-wrap.shine::after { animation: none; }
  }

        .reading-results .reading-title {
          font-family: var(--font-display, Georgia, serif);
          font-weight: 600;
          letter-spacing: -0.01em;
          line-height: 1.15;
        }

        .reading-results .reading-body {
          width: 100%;
          font-family: var(--font-display, Georgia, serif);
          font-size: 16px;
          line-height: 1.9;
          color: #e2e8f0;
          white-space: pre-wrap;
        }

        .reading-results .bottom-line-wrap {
          position: relative;
          margin-top: 54px;
          padding: 52px 10px 48px;
          text-align: center;
          transition:
            transform 0.72s ease,
            opacity 0.72s ease;
        }

        .reading-results .bottom-line-wrap::before {
          content: "";
          position: absolute;
          top: 0;
          left: 16%;
          right: 16%;
          height: 1px;
          background:
            linear-gradient(
              90deg,
              transparent,
              rgba(94, 234, 212, 0.28),
              transparent
            );
        }

        .reading-results .bottom-line-label {
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(94, 234, 212, 0.9);
        }

        .reading-results .closing-line {
          max-width: 540px;
          margin: 15px auto 0;
          font-family: var(--font-display, Georgia, serif);
          font-size: 18px;
          line-height: 1.8;
          color: #f8fafc;
          font-style: italic;
          text-align: center;
          white-space: pre-wrap;
          text-shadow: 0 0 24px rgba(226, 232, 240, 0.08);
        }

        .reading-results .sources-wrap {
          margin-top: 34px;
          padding-top: 22px;
          border-top: 1px solid rgba(255, 255, 255, 0.07);
          text-align: center;
          transition:
            filter 0.72s ease,
            opacity 0.72s ease;
        }

        .reading-results .sources-toggle {
          position: relative;
          overflow: hidden;
          margin: 0 auto;
          padding: 8px 14px;
          border: none;
          background: transparent;
          cursor: pointer;

          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;

          font-family: var(--font-sans, ui-sans-serif);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.16em;
          text-transform: uppercase;

          color: #94a3b8;
          transition:
            color 0.25s ease,
            text-shadow 0.25s ease;
        }

        .reading-results .sources-toggle::before {
          content: "";
          position: absolute;
          top: -50%;
          bottom: -50%;
          width: 34%;
          left: -45%;
          transform: skewX(-18deg);
          background:
            linear-gradient(
              90deg,
              transparent,
              rgba(191, 219, 254, 0.26),
              rgba(94, 234, 212, 0.38),
              transparent
            );
          filter: blur(4px);
          animation: reading-sourceStarlight 5.4s ease-in-out infinite;
          pointer-events: none;
        }

        .reading-results .sources-toggle:hover {
          color: #cbd5e1;
          text-shadow: 0 0 18px rgba(94, 234, 212, 0.28);
        }

        .reading-results .sources-toggle.open {
          color: #bae6fd;
          text-shadow: 0 0 18px rgba(94, 234, 212, 0.24);
        }

        .reading-results .sources-chevron {
          transition:
            transform 0.3s ease,
            filter 0.3s ease;
        }

        .reading-results .sources-toggle.open .sources-chevron {
          transform: rotate(180deg);
          filter: drop-shadow(0 0 5px rgba(94, 234, 212, 0.5));
        }

        @keyframes reading-sourceStarlight {
          0%, 68% {
            left: -45%;
            opacity: 0;
          }

          74% {
            opacity: 1;
          }

          92% {
            left: 115%;
            opacity: 0.85;
          }

          100% {
            left: 115%;
            opacity: 0;
          }
        }

        /* ─── Follow-up styles ──────────────────────────────────────────── */

        .reading-results .followup-input {
          width: 100%;
          background: rgba(10, 14, 39, 0.6);
          border: 1px solid rgba(45, 212, 191, 0.25);
          border-radius: 18px;
          color: #e2e8f0;
          font-size: 16px;
          padding: 14px 16px;
          outline: none;
          resize: none;
          transition: border-color 0.25s ease, box-shadow 0.25s ease;
        }
        .reading-results .followup-input:focus {
          border-color: rgba(45, 212, 191, 0.6);
          box-shadow: 0 0 30px rgba(45, 212, 191, 0.12);
        }

        .reading-results .purchase-success {
          margin-bottom: 12px;
          padding: 10px 14px;
          border-radius: 12px;
          background: rgba(45, 212, 191, 0.1);
          border: 1px solid rgba(45, 212, 191, 0.3);
          color: #5eead4;
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 13px;
          text-align: center;
        }

        .reading-results .paywall-card {
          background: rgba(20, 25, 55, 0.5);
          border: 1px solid rgba(251, 191, 36, 0.28);
          border-radius: 20px;
          padding: 22px 18px;
          text-align: center;
          backdrop-filter: blur(8px);
        }
        .reading-results .paywall-title {
          font-family: var(--font-display, Georgia, serif);
          font-size: 19px;
          color: #ffffff;
          font-weight: 600;
        }
        .reading-results .paywall-sub {
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 13px;
          line-height: 1.6;
          color: #94a3b8;
          margin-top: 8px;
        }
        .reading-results .paywall-buy {
          margin-top: 18px;
          width: 100%;
          height: 54px;
          border-radius: 16px;
          border: none;
          background: linear-gradient(135deg, #fbbf24, #d97706);
          color: #1a1206;
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 0 34px rgba(251, 191, 36, 0.22);
        }
        .reading-results .paywall-buy:disabled { opacity: 0.6; cursor: default; }
        .reading-results .paywall-sub-link {
          margin-top: 12px;
          background: none;
          border: none;
          color: #5eead4;
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 13px;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .reading-results .paywall-sub-link:disabled { opacity: 0.6; cursor: default; }


  .reading-results .panel-center, .reading-results .panel-top, .reading-results .panel-scroll {
    align-items: center;
    justify-content: flex-start;
    padding-top: calc(env(safe-area-inset-top) + 28px);
    padding-bottom: calc(env(safe-area-inset-bottom) + 132px);
  }
  .reading-results .panel > * { flex-shrink: 0; max-width: 100%; }
  .reading-results .panel-center > *, .reading-results .panel-scroll > .framed-page { margin-top: auto; margin-bottom: auto; }
  .reading-results .panel[data-panel="topic"] { padding-bottom: calc(env(safe-area-inset-bottom) + 28px); }
  .reading-results .panel .card { max-width: 30rem; }
  .reading-results .panel .hero { width: 100%; max-width: 32rem; }
  .reading-results .panel .cal-page { max-width: 22rem; }
  .reading-results .panel .framed-page { max-width: 30rem; }
  .reading-results .panel .closing-page { max-width: 34rem; margin-top: 0; margin-bottom: 0; }
  .reading-results .career-word { overflow-wrap: anywhere; }
  .reading-results .hero-body, .reading-results .zone-body, .reading-results .act-body, .reading-results .prose-body p { white-space: pre-wrap; overflow-wrap: anywhere; }
  .reading-results .date-badge { max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
  .reading-results .act-note { color: #94a3b8; font-size: 12px; }
  .reading-results .bottom-line-wrap { margin-top: 0; padding: 40px 10px 34px; }
  .reading-results .closing-page.bottom-focus .bottom-line-wrap { transform: scale(1.025); }
  .reading-results .bottom-line-label { margin: 0; }
  .reading-results .sources-chevron { width: 14px; height: 14px; }
  .reading-results .dots { gap: 7px; }
  .reading-results .dot { position: relative; padding: 0; border: 0; cursor: pointer; flex-shrink: 0; }
  .reading-results .dot::after { content: ""; position: absolute; inset: -3px -7px; }
  .reading-results .download-btn:disabled { opacity: 0.5; cursor: default; }
  .reading-results button:focus-visible, .reading-results textarea:focus-visible { outline: 2px solid #5eead4; outline-offset: 4px; }
  .reading-results .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  @media (prefers-reduced-motion: reduce) {
    .reading-results, .reading-results *, .reading-results *::before, .reading-results *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
    .reading-results .closing-page.bottom-focus .bottom-line-wrap { transform: none; }
  }

`;
