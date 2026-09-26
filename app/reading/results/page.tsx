"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Bookmark, ChevronDown, CalendarDays, Crown } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { loadReading, loadChart, clearIntake, type StoredReading } from "@/lib/chartStore";
import {
  getSavedReading,
  saveReadingLocally,
} from "@/lib/savedReadingsStore";

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
 * AstroProXL results — streamlined single scrolling reading.
 * Matches the eight-part engine contract while preserving saved-reading compatibility,
 * timing calendar, context cards, follow-ups, sources, and checkout behavior.
 */

type ParsedSection =
  | { kind: "confirmation"; body: string }
  | { kind: "focus"; body: string }
  | { kind: "prediction"; body: string }
  | { kind: "currentState"; body: string }
  | { kind: "whyNow"; body: string }
  | { kind: "next"; body: string }
  | { kind: "prose"; body: string }
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

// Parse the streamlined eight-part engine contract while remaining compatible with saved legacy readings.
const HUMAN_HEADERS = [
  "Confirmation",
  "The Prediction",
  "Where You Are Now",
  "Why This Is Happening",
  "Why This Is Active Now",
  "Why This Is Active",
  "What Happens Next",
  "How This Is Most Likely To Show Up",
  "Dated Windows",
  "Timing",
  "The Directive",
  "Your Move",
  "Bottom Line",
] as const;
const DATE_LEAD_RE = /^\s*\[\[DATE:\s*([^\]]+)\]\]\s*[—–-]?\s*/i;
const FOCUS_RE = /^\s*FOCUS\s*:\s*(.+)$/i;
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

function splitHumanHeader(paragraph: string): { label: string | null; body: string } {
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

    if (activeLabel === "Confirmation" || !activeLabel) {
      const focusLine = body
        .split("\n")
        .map((line) => line.trim())
        .find((line) => FOCUS_RE.test(line));

      if (focusLine) {
        const focus = focusLine.match(FOCUS_RE);
        const confirmationBody = body
          .split("\n")
          .filter((line) => !FOCUS_RE.test(line.trim()))
          .join("\n")
          .trim();

        if (confirmationBody) {
          sections.push({ kind: "confirmation", body: confirmationBody });
        }
        if (focus?.[1]) {
          sections.push({ kind: "focus", body: focus[1].trim() });
        }
        continue;
      }
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
      const items = body
        .split(/\n+/)
        .map((item) => item.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim())
        .filter(Boolean);

      for (const item of items.length ? items : [body]) {
        const date = item.match(DATE_LEAD_RE);
        sections.push({
          kind: "directive",
          directive: "GENERAL",
          label: "Your Move",
          date: date?.[1].trim() ?? null,
          body: date ? item.slice(date[0].length).trim() : item,
        });
      }
      continue;
    }

    if (phase === "windows" || (!activeLabel && DATE_LEAD_RE.test(body))) {
      phase = "windows";
      const lines = body
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const markerLines = lines.filter((line) => DATE_LEAD_RE.test(line));
      if (markerLines.length > 1) {
        for (const line of markerLines) {
          const date = line.match(DATE_LEAD_RE);
          const rest = date ? line.slice(date[0].length).trim() : line;
          sections.push({
            kind: "window",
            date: date?.[1].trim() ?? null,
            note: null,
            body: rest,
          });
        }
      } else {
        const date = body.match(DATE_LEAD_RE);
        const rest = date ? body.slice(date[0].length).trim() : body;
        sections.push({ kind: "window", date: date?.[1].trim() ?? null, note: null, body: rest });
      }
      continue;
    }

    const kind: ParsedSection["kind"] =
      activeLabel === "Confirmation"
        ? "confirmation"
        : activeLabel === "Where You Are Now"
          ? "currentState"
          : activeLabel === "Why This Is Happening" ||
              activeLabel === "Why This Is Active" ||
              activeLabel === "Why This Is Active Now"
            ? "whyNow"
            : activeLabel === "What Happens Next" ||
                activeLabel === "How This Is Most Likely To Show Up"
              ? "next"
              : activeLabel === "The Prediction" || (!activeLabel && sections.length === 0)
                ? "prediction"
                : "prose";

    sections.push({ kind, body } as ParsedSection);
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

// Fires once, when the element first scrolls into view. Drives per-section reveals.
function useInView<T extends HTMLElement = HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, inView];
}

// True while the element sits in the vertical center band of the viewport.
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

function ZoneReveal({
  label,
  body,
  active,
  delay = 0,
}: {
  label: string;
  body: string;
  active: boolean;
  delay?: number;
}) {
  if (!active) return null;
  return (
    <FadeIn active delay={delay} className="zone">
      <p className="zone-label">{label}</p>
      <p className="zone-body">{renderWithDates(body)}</p>
    </FadeIn>
  );
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
  const monthName = new Date(month.y, month.m, 1).toLocaleString("en-US", { month: "long" });
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

function ReadingSection({
  title,
  body,
  active,
}: {
  title: string;
  body: string;
  active: boolean;
}) {
  if (!body) return null;
  return (
    <FadeIn active={active} className="reading-section-block">
      <p className="reading-section-label">{title}</p>
      <p className="reading-section-copy">{renderWithDates(body)}</p>
    </FadeIn>
  );
}

function FlowReveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const [ref, active] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={className}>
      <FadeIn active={active}>{children}</FadeIn>
    </div>
  );
}

function ReadingDeck({
  topic,
  content,
  sections,
  checkoutOpen,
  children,
}: {
  topic: string;
  content: string;
  sections: ParsedSection[] | null;
  checkoutOpen: boolean;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [contextRef, contextActive] = useInView<HTMLDivElement>();
  const [timingRef, timingActive] = useInView<HTMLDivElement>();
  const [moveRef, moveActive] = useInView<HTMLDivElement>();

  const groups = useMemo(() => {
    const join = (kind: ParsedSection["kind"]) =>
      (sections ?? [])
        .filter((section) => section.kind === kind)
        .map((section) => section.body)
        .join("\n\n");

    const timing = (sections ?? []).filter((section): section is TimingSection => section.kind === "window");
    const directives = (sections ?? []).filter(
      (section): section is DirectiveSection => section.kind === "directive",
    );
    const windows = timing
      .flatMap((section) => {
        const window = section.date ? parseCalendarWindow(section.date) : null;
        return window ? [window] : [];
      })
      .sort((a, b) => dayValue(a.start) - dayValue(b.start));

    const fallbackProse = sections
      ? sections.filter((section) => section.kind === "prose").map((section) => section.body)
      : [content];

    return {
      confirmation: join("confirmation"),
      focus: join("focus"),
      prediction: join("prediction"),
      where: join("currentState"),
      why: join("whyNow"),
      next: join("next"),
      fallbackProse,
      timing,
      directives,
      windows,
    };
  }, [sections, content]);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onScroll = () => setScrolled(vp.scrollTop > 24);
    vp.addEventListener("scroll", onScroll, { passive: true });
    return () => vp.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`reading-results scroll-root ${checkoutOpen ? "checkout-open" : ""}`}
      ref={viewportRef}
      aria-label="Your reading"
    >
      <style>{css}</style>
      <div
        className="scroll-content"
        ref={(node) => {
          node?.toggleAttribute("inert", checkoutOpen);
        }}
      >
        <ResultsStarfield reduceMotion={reduceMotion} />

        <main className="reading-flow">
          <section className={`reading-hero ${mounted ? "in" : ""}`} aria-label="Reading overview">
            <div className="hero-topic">
              <span className="hero-topic-glow" aria-hidden="true" />
              <span className="hero-mark" aria-hidden="true">✦</span>
              <span className="hero-topic-text">{topic}</span>
            </div>

            <h1 className="focus-heading">
              {groups.focus || "What the chart is showing now"}
            </h1>

            {groups.confirmation && (
              <p className="confirmation-copy">{renderWithDates(groups.confirmation)}</p>
            )}

            {groups.prediction && (
              <div className="prediction-block">
                <p className="reading-section-label">The Prediction</p>
                <p className="prediction-copy">{renderWithDates(groups.prediction)}</p>
              </div>
            )}
          </section>

          <div className="reading-separator" aria-hidden="true" />

          <section ref={contextRef} className="reading-main" aria-label="The reading">
            <ReadingSection
              title="Where You Are Now"
              body={groups.where}
              active={contextActive || reduceMotion}
            />
            {groups.where && groups.why && <div className="inner-separator" aria-hidden="true" />}
            <ReadingSection
              title="Why This Is Happening"
              body={groups.why}
              active={contextActive || reduceMotion}
            />
            {(groups.where || groups.why) && groups.next && (
              <div className="inner-separator" aria-hidden="true" />
            )}
            <ReadingSection
              title="What Happens Next"
              body={groups.next}
              active={contextActive || reduceMotion}
            />

            {!groups.where && !groups.why && !groups.next && groups.fallbackProse.length > 0 && (
              <FadeIn active={contextActive || reduceMotion} className="reading-section-block">
                {groups.fallbackProse.map((body, index) => (
                  <p key={index} className="reading-section-copy">{renderWithDates(body)}</p>
                ))}
              </FadeIn>
            )}
          </section>

          {(groups.windows.length > 0 || groups.timing.length > 0) && (
            <>
              <div className="reading-separator" aria-hidden="true" />
              <section ref={timingRef} className="timing-block" aria-label="Timing">
                <FlowReveal className="section-heading-wrap">
                  <p className="reading-section-label centered">Timing</p>
                </FlowReveal>

                {groups.windows.length > 0 && (
                  <div className="calendar-wrap">
                    <Calendar
                      windows={groups.windows}
                      active={timingActive || reduceMotion}
                      reduceMotion={reduceMotion}
                    />
                  </div>
                )}

                {groups.timing.length > 0 && (
                  <FadeIn active={timingActive || reduceMotion} delay={120}>
                    <div className="context-card-list">
                      {groups.timing.map((section, index) => (
                        <WindowCard key={index} section={section} />
                      ))}
                    </div>
                  </FadeIn>
                )}
              </section>
            </>
          )}

          {groups.directives.length > 0 && (
            <>
              <div className="reading-separator" aria-hidden="true" />
              <section ref={moveRef} className="move-block" aria-label="Your Move">
                <p className="reading-section-label centered">Your Move</p>
                <FadeIn active={moveActive || reduceMotion} delay={80}>
                  <div className="context-card-list">
                    {groups.directives.map((section, index) => (
                      <DirectiveCard key={index} section={section} />
                    ))}
                  </div>
                </FadeIn>
              </section>
            </>
          )}

          <div className="reading-separator" aria-hidden="true" />
          <section className="reading-ending" aria-label="Reading conclusion">
            {children}
          </section>
        </main>
      </div>

      <div className={`scroll-cue ${scrolled ? "" : "show"}`} aria-hidden="true">
        <span>scroll</span>
        <ChevronDown className="cue-chev" />
      </div>
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
  const [downloaded, setDownloaded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [viewingSavedReading, setViewingSavedReading] = useState(false);

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
    const p = reading?.pages?.[0];
    return p ? hashKey(p.title + "::" + p.content) : "";
  }, [reading]);

  useEffect(() => {
    let cancelled = false;

    const openReading = async () => {
      try {
        const savedId = new URLSearchParams(window.location.search).get("saved");
        if (savedId) {
          setViewingSavedReading(true);
          const saved = await getSavedReading(savedId);
          if (!saved) {
            router.replace("/readings");
            return;
          }
          if (!cancelled) {
            setReading(saved.reading);
            setFollowups(saved.followups ?? []);
          }
          return;
        }

        const stored = loadReading();
        if (!stored) {
          router.replace("/reading/intake");
          return;
        }
        if (!cancelled) setReading(stored);
      } catch {
        // The recovery view below handles an unreadable stored reading.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void openReading();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!reading || !readingKey || viewingSavedReading) return;

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
      fetch("/api/user/reading-complete", { method: "POST" })
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
  }, [reading, readingKey, viewingSavedReading]);

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

  // Parse the current eight-part reading contract; legacy headings remain supported for saved readings.

  const page = reading?.pages?.[0] ?? null;

  const parsedSections = useMemo(
    () => (page?.content ? parseReadingSections(page.content) : null),
    [page?.content],
  );

  const closingSections = parsedSections?.filter((section) => section.kind === "closing") ?? [];

  const handleDownloadReading = async () => {
    if (!reading || !page || isDownloading) return;

    setIsDownloading(true);
    setDownloaded(false);
    setSaveError(null);

    try {
      // Keep the reading available in Your Readings without forcing a redirect.
      try {
        await saveReadingLocally({
          id: `reading-${readingKey}`,
          savedAt: new Date().toISOString(),
          topic: reading.topic || "Reading",
          title: page.title || "Your Reading",
          reading,
          followups,
        });
      } catch {
        // A local archive failure should not block the actual file download.
      }

      const plain = page.content.replace(/\[\[DATE:\s*([^\]]+)\]\]/gi, "$1");
      const topicLabel = (reading.topic || "reading").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
      const dateStamp = new Date().toISOString().slice(0, 10);
      const fileName = `astroproxl-${topicLabel || "reading"}-${dateStamp}.txt`;
      const text = `${page.title || "Your Reading"}\n\n${plain}\n\n— AstroProXL`;
      const file = new File([text], fileName, { type: "text/plain;charset=utf-8" });

      // iPhone/iPad browsers are more reliable when a file can be handed to the
      // native share sheet. Desktop browsers fall back to a direct file download.
      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
      };

      if (typeof navigator.share === "function" && nav.canShare?.({ files: [file] })) {
        await navigator.share({
          title: page.title || "Your AstroProXL Reading",
          files: [file],
        });
      } else {
        const url = URL.createObjectURL(file);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();

        // Safari can cancel a download when the object URL is revoked immediately.
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      }

      setDownloaded(true);
      window.setTimeout(() => setDownloaded(false), 2600);
    } catch (error) {
      // Cancelling the native share sheet is not a failed reading download state.
      if (error instanceof DOMException && error.name === "AbortError") return;
      setSaveError("This reading could not be downloaded. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFollowup = async () => {
    const question = followupQuestion.trim();
    if (!question || isGeneratingFollowup || !reading || !page) return;

    setIsGeneratingFollowup(true);
    setFollowupError(null);

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
          freeRepliesUsed,
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
      if (meta?.usedFreeReply) {
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
        followupEndRef.current?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          block: "end",
        });
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
    if (viewingSavedReading) {
      router.push("/readings");
      return;
    }
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
  const freeBand = isSubscribed ? 4 : 1;
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
        topic={reading.topic}
        content={page.content}
        sections={parsedSections}
        checkoutOpen={!!clientSecret}
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

        <div className="post-closing">
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
                Ask About This Reading
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
                  {isSubscribed
                    ? "You've used your 4 free replies"
                    : "You've used your free replies"}
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
        </div>

        {/* ── Save + Done — same footprint as Ask, tucked right under the credits line ── */}
        <div className="end-actions">
          {viewingSavedReading ? (
            <button type="button" className="end-btn end-save" onClick={() => router.push("/readings")}>
              <Bookmark className="end-btn-icon" aria-hidden="true" />
              Your Readings
            </button>
          ) : (
            <button
              type="button"
              className="download-reading-shell"
              onClick={handleDownloadReading}
              disabled={isDownloading}
              aria-label="Download this reading"
            >
              <span className="download-reading-shimmer" aria-hidden="true" />
              <span className="download-reading-crown" aria-hidden="true">
                <Crown className="h-3.5 w-3.5" />
              </span>
              <span className="download-reading-label">
                {isDownloading ? "Preparing…" : downloaded ? "Downloaded" : "Download Reading"}
              </span>
            </button>
          )}
          <button type="button" className="end-btn end-done" onClick={handleDone}>
            Done
          </button>
          {saveError && <p className="end-save-error" role="alert">{saveError}</p>}
          {credits && !credits.isSubscribed && (
            <p className="end-credits">{credits.credits} credits remaining</p>
          )}
        </div>
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
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
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
            <div style={{ borderRadius: 16, overflow: "hidden", background: "#fff" }}>
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

  /* ── Single scrolling page ── */
  .reading-results.scroll-root {
    position: fixed;
    inset: 0;
    z-index: 40;
    height: 100dvh;
    width: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    background: #000;
    color: #e2e8f0;
    font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
    -webkit-tap-highlight-color: transparent;
    -webkit-overflow-scrolling: touch;
    user-select: text;
    scrollbar-width: none;
    scroll-behavior: smooth;
  }
  .reading-results.scroll-root::-webkit-scrollbar { display: none; }
  .reading-results.checkout-open { overflow: hidden; }

  /* The gradient lives on the tall content, so it fades through its color
     bands as you scroll — five graded zones from astral blue down to black. */
  .reading-results .scroll-content {
    position: relative;
    z-index: 1;
    min-height: 100%;
    background: linear-gradient(
      180deg,
      #17204a 0%,      /* 1 — astral blue */
      #141b45 9%,
      #10163f 22%,     /* 2 — deep indigo */
      #12123a 36%,     /* 3 — indigo violet */
      #0e0d30 50%,
      #0a0924 63%,     /* 4 — deep space */
      #070718 75%,
      #040512 86%,     /* 5 — into the void */
      #010109 95%,
      #000000 100%
    );
  }

  .reading-results .results-starfield {
    position: fixed;
    inset: 0;
    z-index: 1;
    pointer-events: none;
  }

  /* Each section is a centered column with breathing room above and below. */
  .reading-results .flow-section {
    position: relative;
    z-index: 2;
    width: 100%;
    max-width: 36rem;
    margin: 0 auto;
    padding: 46px 26px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
  }
  .reading-results .flow-section > * { width: 100%; max-width: 100%; }

  /* Opening beats keep a full-stage feel before the scroll continues. */
  .reading-results .section-topic {
    min-height: 88vh;
    justify-content: center;
    text-align: center;
    padding-top: calc(env(safe-area-inset-top) + 40px);
  }
  .reading-results .section-prediction {
    min-height: 72vh;
    justify-content: center;
  }
  .reading-results .section-closing {
    padding-top: 40px;
    padding-bottom: calc(env(safe-area-inset-bottom) + 72px);
  }

  /* ── Page 1 — TOPIC ── */
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
    overflow-wrap: anywhere;
  }

  /* ── Prediction hero ── */
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
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* ── Context card + zones (Where / Why / How) ── */
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
  .reading-results .zone { display: flex; flex-direction: column; }
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
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* ── Reveal helper ── */
  .reading-results .fade {
    opacity: 0;
    transform: translateY(8px);
    transition: opacity 0.7s ease, transform 0.7s ease;
  }
  .reading-results .fade.on { opacity: 1; transform: none; }
  .reading-results .fade + .fade { margin-top: 12px; }

  /* ── Dated Windows calendar — frameless: just the grid + the ring ── */
  .reading-results .cal-page { width: 100%; max-width: 22rem; margin: 0 auto; text-align: center; }
  .reading-results .cal-page-heading {
    margin: 0 0 22px;
    font-size: 11px; font-weight: 700; letter-spacing: 0.22em;
    text-transform: uppercase; color: rgba(94,234,212,0.9);
  }
  .reading-results .cal-card {
    border: none;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
    padding: 0;
    opacity: 0;
    transform: translateY(10px) scale(0.985);
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

  /* ── Framed card pages (Timing + Your Move) ── */
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
  .reading-results .act-note { color: #94a3b8; font-size: 12px; }
  .reading-results .act-body {
    margin: 0;
    font-family: Georgia, serif;
    font-size: 15px; line-height: 1.8; color: #cbd5e1;
    white-space: pre-wrap; overflow-wrap: anywhere;
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
    text-transform: uppercase;
    box-shadow: 0 0 18px rgba(251,191,36,0.12);
    vertical-align: baseline;
    max-width: 100%; white-space: normal; overflow-wrap: anywhere;
  }

  /* ── The Read — prose page ── */
  .reading-results .prose-body p {
    margin: 0 0 16px;
    font-family: Georgia, serif;
    font-size: 16px; line-height: 1.85; color: #dbe4f0;
    white-space: pre-wrap; overflow-wrap: anywhere;
  }
  .reading-results .prose-body p:last-child { margin-bottom: 0; }

  /* ── Closing column ── */
  .reading-results .closing-page { width: 100%; max-width: 34rem; margin: 0 auto; }

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

  /* ── Scroll cue (first screen only) ── */
  .reading-results .scroll-cue {
    position: fixed;
    left: 0; right: 0;
    bottom: calc(env(safe-area-inset-bottom) + 26px);
    z-index: 3;
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
  .reading-results .scroll-cue.show { opacity: 1; }
  .reading-results .cue-chev { width: 20px; height: 20px; animation: reading-bob 1.9s ease-in-out infinite; }
  @keyframes reading-bob { 0%,100% { transform: translateY(0); opacity: 0.6; } 50% { transform: translateY(6px); opacity: 1; } }

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

  /* ── Streamlined continuous reading layout ── */
  .reading-results .reading-flow {
    position: relative;
    z-index: 2;
    width: min(100%, 38rem);
    margin: 0 auto;
    padding: calc(env(safe-area-inset-top) + 54px) 24px calc(env(safe-area-inset-bottom) + 72px);
  }
  .reading-results .reading-hero {
    min-height: 76vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    opacity: 0;
    transform: translateY(10px);
    transition: opacity 1s ease, transform 1s ease;
  }
  .reading-results .reading-hero.in { opacity: 1; transform: none; }
  .reading-results .hero-topic {
    position: relative;
    isolation: isolate;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: center;
    gap: 10px;
    margin-bottom: 30px;
    padding: 5px 10px;
    overflow: hidden;
    font-family: ui-sans-serif, system-ui;
    font-size: clamp(18px, 5.2vw, 24px);
    font-weight: 800;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: #78f2df;
    text-shadow:
      0 0 14px rgba(94,234,212,0.42),
      0 0 34px rgba(94,234,212,0.20);
  }
  .reading-results .hero-topic-text,
  .reading-results .hero-mark {
    position: relative;
    z-index: 2;
  }
  .reading-results .hero-mark {
    color: rgba(94,234,212,0.82);
    font-size: 14px;
    text-shadow: 0 0 18px rgba(94,234,212,0.55);
  }
  .reading-results .hero-topic-glow {
    position: absolute;
    z-index: 1;
    top: -25%;
    bottom: -25%;
    left: -38%;
    width: 34%;
    transform: skewX(-18deg);
    background: linear-gradient(
      105deg,
      transparent 0%,
      rgba(255,255,255,0.02) 32%,
      rgba(182,255,245,0.34) 50%,
      rgba(255,255,255,0.04) 68%,
      transparent 100%
    );
    filter: blur(2px);
    animation: reading-topicSweep 4.8s cubic-bezier(0.22,1,0.36,1) infinite;
    pointer-events: none;
  }
  @keyframes reading-topicSweep {
    0%, 18% { transform: translateX(0) skewX(-18deg); opacity: 0; }
    26% { opacity: 1; }
    62% { transform: translateX(430%) skewX(-18deg); opacity: 0.9; }
    72%, 100% { transform: translateX(430%) skewX(-18deg); opacity: 0; }
  }
  .reading-results .focus-heading {
    max-width: 33rem;
    margin: 0 auto;
    text-align: center;
    font-family: Georgia, serif;
    font-weight: 650;
    font-size: clamp(36px, 9.6vw, 58px);
    line-height: 1.02;
    letter-spacing: -0.035em;
    color: #ffffff;
    text-wrap: balance;
    text-shadow:
      0 1px 0 rgba(255,255,255,0.08),
      0 0 28px rgba(255,255,255,0.06),
      0 0 50px rgba(94,234,212,0.10);
  }
  .reading-results .focus-heading::after {
    content: "";
    display: block;
    width: 54px;
    height: 1px;
    margin: 24px auto 0;
    background: linear-gradient(90deg, transparent, rgba(94,234,212,0.72), transparent);
    box-shadow: 0 0 14px rgba(94,234,212,0.22);
  }
  .reading-results .confirmation-copy {
    max-width: 31rem;
    margin: 20px auto 0;
    text-align: center;
    font-family: Georgia, serif;
    font-size: clamp(16px, 4.35vw, 19px);
    line-height: 1.68;
    color: #c3cedd;
    white-space: pre-wrap;
    text-wrap: pretty;
  }
  .reading-results .prediction-block {
    max-width: 32rem;
    margin: 42px auto 0;
    padding-top: 26px;
    border-top: 1px solid rgba(255,255,255,0.08);
  }
  .reading-results .prediction-copy {
    margin: 10px 0 0;
    font-family: Georgia, serif;
    font-size: 18px;
    line-height: 1.72;
    color: #e6edf6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .reading-results .reading-separator {
    width: 100%;
    height: 1px;
    margin: 44px 0;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
  }
  .reading-results .inner-separator {
    width: 100%;
    height: 1px;
    margin: 27px 0;
    background: rgba(255,255,255,0.07);
  }
  .reading-results .reading-main,
  .reading-results .timing-block,
  .reading-results .move-block,
  .reading-results .reading-ending {
    width: 100%;
    max-width: 34rem;
    margin: 0 auto;
  }
  .reading-results .reading-section-block { width: 100%; }
  .reading-results .reading-section-label {
    margin: 0;
    font-family: ui-sans-serif, system-ui;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(94,234,212,0.9);
  }
  .reading-results .reading-section-label.centered { text-align: center; }
  .reading-results .reading-section-copy {
    margin: 10px 0 0;
    font-family: Georgia, serif;
    font-size: 16px;
    line-height: 1.72;
    color: #d4deeb;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .reading-results .section-heading-wrap { margin-bottom: 22px; }
  .reading-results .calendar-wrap {
    width: 100%;
    max-width: 22rem;
    margin: 0 auto 24px;
  }
  .reading-results .context-card-list {
    width: 100%;
    max-width: 32rem;
    margin: 0 auto;
  }
  .reading-results .act-card {
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 18px;
    padding: 16px 17px;
    background: rgba(8,12,31,0.36);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.02);
    backdrop-filter: blur(5px);
  }
  .reading-results .act-card + .act-card { margin-top: 10px; }
  .reading-results .reading-ending { padding-bottom: 8px; }

  /* ── Bottom Line — the closing focal point ── */
  .reading-results .bottom-line-wrap {
    position: relative;
    padding: 40px 10px 34px;
    text-align: center;
    transition: transform 0.7s ease, opacity 0.7s ease;
  }
  .reading-results .bottom-line-wrap::before {
    content: "";
    position: absolute;
    top: 0;
    left: 16%;
    right: 16%;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(94, 234, 212, 0.28), transparent);
  }
  .reading-results .bottom-line-label {
    margin: 0;
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

  .reading-results .post-closing {
    transition: opacity 0.3s ease;
  }

  .reading-results .sources-wrap {
    margin-top: 34px;
    padding-top: 22px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    text-align: center;
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
    transition: color 0.25s ease, text-shadow 0.25s ease;
  }
  .reading-results .sources-toggle::before {
    content: "";
    position: absolute;
    top: -50%;
    bottom: -50%;
    width: 34%;
    left: -45%;
    transform: skewX(-18deg);
    background: linear-gradient(
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
    width: 14px; height: 14px;
    transition: transform 0.3s ease, filter 0.3s ease;
  }
  .reading-results .sources-toggle.open .sources-chevron {
    transform: rotate(180deg);
    filter: drop-shadow(0 0 5px rgba(94, 234, 212, 0.5));
  }
  @keyframes reading-sourceStarlight {
    0%, 68% { left: -45%; opacity: 0; }
    74% { opacity: 1; }
    92% { left: 115%; opacity: 0.85; }
    100% { left: 115%; opacity: 0; }
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

  /* ── Save + Done — matched to the Ask button, tucked under the credits ── */
  .reading-results .end-actions {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .reading-results .end-btn {
    height: 48px;
    width: 100%;
    border-radius: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: opacity 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  }
  .reading-results .end-btn-icon { width: 18px; height: 18px; }

  @property --download-reading-angle {
    syntax: "<angle>";
    inherits: false;
    initial-value: 0deg;
  }
  .reading-results .download-reading-shell {
    position: relative;
    isolation: isolate;
    min-height: 58px;
    width: 100%;
    border: 0;
    border-radius: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 54px 0 22px;
    overflow: visible;
    background:
      radial-gradient(circle at 50% -70%, rgba(255,255,255,0.11), transparent 66%),
      linear-gradient(145deg, rgba(19,18,24,0.96), rgba(7,10,21,0.97));
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.08),
      0 0 22px rgba(203,164,78,0.12),
      0 16px 38px rgba(0,0,0,0.46);
    cursor: pointer;
    transition: transform 0.3s ease, box-shadow 0.3s ease, opacity 0.2s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .reading-results .download-reading-shell::before,
  .reading-results .download-reading-shell::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    padding: 1.25px;
    background: conic-gradient(
      from var(--download-reading-angle),
      rgba(255,255,255,0.94) 0deg,
      rgba(255,255,255,0.74) 54deg,
      rgba(218,183,104,0.88) 112deg,
      rgba(255,239,195,0.82) 172deg,
      rgba(255,255,255,0.96) 226deg,
      rgba(193,151,67,0.86) 296deg,
      rgba(255,255,255,0.94) 360deg
    );
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    animation: downloadReadingOrbit 8s linear infinite;
  }
  .reading-results .download-reading-shell::before { z-index: 0; opacity: 0.82; }
  .reading-results .download-reading-shell::after {
    inset: -1px;
    z-index: -1;
    padding: 2px;
    opacity: 0.52;
    filter: blur(8px);
  }
  .reading-results .download-reading-shell:hover,
  .reading-results .download-reading-shell:focus-visible {
    transform: translateY(-1px);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.11),
      0 0 28px rgba(203,164,78,0.18),
      0 18px 42px rgba(0,0,0,0.50);
    outline: none;
  }
  .reading-results .download-reading-shell:active { transform: translateY(0); }
  .reading-results .download-reading-shell:disabled { opacity: 0.55; cursor: default; }
  .reading-results .download-reading-label {
    position: relative;
    z-index: 3;
    white-space: nowrap;
    font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
    font-size: 13px;
    font-weight: 650;
    letter-spacing: 0.20em;
    text-transform: uppercase;
    color: #f8fafc;
    text-shadow:
      0 2px 10px rgba(0,0,0,0.92),
      0 0 18px rgba(255,255,255,0.16),
      0 0 24px rgba(218,183,105,0.16);
  }
  .reading-results .download-reading-crown {
    position: absolute;
    right: 13px;
    top: 11px;
    z-index: 4;
    width: 24px;
    height: 24px;
    border-radius: 9999px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(248,250,252,0.28);
    background: rgba(248,250,252,0.035);
    box-shadow: 0 0 10px rgba(248,250,252,0.10), 0 0 18px rgba(191,219,254,0.06);
    color: rgba(248,250,252,0.90);
    filter: drop-shadow(0 0 5px rgba(255,255,255,0.20));
  }
  .reading-results .download-reading-shimmer {
    position: absolute;
    inset: 0;
    z-index: 2;
    overflow: hidden;
    border-radius: inherit;
    pointer-events: none;
  }
  .reading-results .download-reading-shimmer::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 45%;
    background: linear-gradient(
      105deg,
      transparent 0%,
      rgba(255,255,255,0.08) 45%,
      rgba(255,255,255,0.17) 50%,
      rgba(255,255,255,0.08) 55%,
      transparent 100%
    );
    transform: translateX(-145%) skewX(-18deg);
    animation: downloadReadingShimmer 2.75s cubic-bezier(0.22,1,0.36,1) 1 forwards;
  }
  @keyframes downloadReadingShimmer {
    0% { transform: translateX(-145%) skewX(-18deg); }
    100% { transform: translateX(245%) skewX(-18deg); }
  }
  @keyframes downloadReadingOrbit { to { --download-reading-angle: 360deg; } }
  .reading-results .end-save {
    border: 1px solid rgba(251,191,36,0.5);
    background: rgba(251,191,36,0.08);
    color: #fbbf24;
  }
  .reading-results .end-save:hover {
    border-color: rgba(251,191,36,0.8);
    box-shadow: 0 0 24px rgba(251,191,36,0.18);
  }
  .reading-results .end-save:disabled { opacity: 0.5; cursor: default; }
  .reading-results .end-save-error {
    margin: 2px 0 0;
    color: #fda4af;
    font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
    font-size: 12px;
    line-height: 1.45;
    text-align: center;
  }
  .reading-results .end-done {
    border: none;
    background: #5eead4;
    color: #042f2e;
    box-shadow: 0 0 30px rgba(94,234,212,0.28);
  }
  .reading-results .end-credits {
    margin: 4px 0 0;
    text-align: center;
    font-family: var(--font-sans, ui-sans-serif);
    font-size: 11px;
    color: #64748b;
  }

  .reading-results button:focus-visible, .reading-results textarea:focus-visible {
    outline: 2px solid #5eead4;
    outline-offset: 4px;
  }
  .reading-results .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .reading-results.scroll-root { scroll-behavior: auto; }
    .reading-results, .reading-results *, .reading-results *::before, .reading-results *::after {
      animation: none !important;
      transition: none !important;
    }
    .reading-results .download-reading-shell::before,
    .reading-results .download-reading-shell::after,
    .reading-results .download-reading-shimmer::after,
    .reading-results .hero-topic-glow { animation: none !important; }
  }

`;
