"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { ChevronLeft, ChevronRight, Crown, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  deleteSavedReading,
  listSavedReadings,
  MAX_SAVED_READINGS,
  type SavedReadingRecord,
} from "@/lib/savedReadingsStore";
import { getReadingKeyDays, getReadingPreview } from "@/lib/readingSections";

/**
 * SAVED READINGS
 *
 *   [ container ]          (Profection fill, Drifting Light outline. Before a reading is open: a minimal calendar — month, weekday letters,
 *                           dates, no boxes — where the key dates from the last three readings glow in each
 *                           reading's color; tap one to open that reading. Tap a reading and it opens here: date,
 *                           title, the question, the start of the reading, and "Open reading" for the full page.)
 *   — My Readings —        (right under the container; 28px Cormorant with a deep shadow, a soft silver glow and fine side lines)
 *   [ 4 × 2 readings ]     (no boxes: each reading's symbol and date sit over a soft glow of its color that breathes)
 *   ━━━━─────────────      (the page slider: one fine line as wide as "My Readings"; a glowing segment marks the page.
 *                           Tap a third of the line or drag the segment; it sheds a comet of stardust as it moves.)
 *
 * Key dates and the container preview come from the saved reading itself, via @/lib/readingSections — the same
 * code the results page uses, so the calendar here always matches the reading's own "Your Calendar".
 *
 * Tap a reading: a soft pulse of long ripples in the symbol's own shape flows out as it fades, the reading fades into
 * the container, everything else sinks into the dark, and the container glows softly in the reading's own color.
 * Tap anywhere outside it (or Escape) to come back.
 *
 * Press and hold a reading to delete it: its glow turns red and the slider gives way to a red trash button.
 * Tap the trash to remove it; tap anywhere else (or Escape) to keep it.
 *
 * The container gives up room first on short screens, so the page never scrolls.
 *

 *   • As its own page (the readings route renders <SavedReadingsView />) — full-screen, black, back button.
 *   • As the last panel in PagerContainer (<SavedReadingsView embedded />) — no back button, no
 *     background of its own (the pager's sky shows through), and it sizes to the pager slot.
 *     Its top lines up with Your Day's profection card.
 */

const READINGS_PER_PAGE = 8;
const PAGE_COUNT = 3;
const FREE_SLOT_COUNT = 8;
const PLUS_SLOT_COUNT = 16;
const LONG_PRESS_MS = 550;
/** How long the tap pulse runs (the last of the four ripples has faded by then). */
const RIPPLE_MS = 4400;
/** The four ripples: start delay (s) and peak opacity, each fainter than the last. */
const RIPPLES = [[0, 0.46], [0.45, 0.34], [0.9, 0.24], [1.35, 0.15]] as const;

interface AccessSummary {
  membershipStatus?: string;
  isSubscribed?: boolean;
  membershipPlan?: "plus" | "plus_xl" | null;
  effectiveMembershipPlan?: "plus" | "plus_xl" | null;
}

interface SavedReadingsViewProps {
  /** True when rendered inside PagerContainer. */
  embedded?: boolean;
}

function formatTopic(topic: string) {
  return topic.replace(/[_-]+/g, " ").trim() || "Reading";
}

function titleCase(text: string) {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Each reading's own color: the reading buttons on Your Day (gold for Ask Anything). */
const TOPIC_COLORS: Record<string, string> = {
  love: "#FDA4AF",
  money: "#86EFAC",
  career: "#93C5FD",
  general: "#C4B5FD",
  other: "#C4B5FD",
  "ask-anything": "#F1D694",
};
const topicColor = (topic: string) => TOPIC_COLORS[topic] ?? TOPIC_COLORS.general;

/** Each reading's symbol: the same icons as its button on Your Day (heart, wallet, briefcase, crystal ball, mic). */
const SYMBOL_PATHS: Record<string, ReactNode> = {
  love: <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />,
  money: (<>
    <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
    <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
  </>),
  career: (<>
    <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    <rect width="20" height="14" x="2" y="6" rx="2" />
  </>),
  general: (<>
    <circle cx="12" cy="10" r="7" />
    <path d="M8.4 15.9 7 19.5h10l-1.4-3.6" />
    <path d="M5.5 19.5h13" />
    <path d="M8.6 7.6a3.8 3.8 0 0 1 2.4-1.9" />
    <path d="m14 9.2.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5Z" />
  </>),
  "ask-anything": (<>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </>),
};
const isOrb = (topic: string) => !["love", "money", "career", "ask-anything"].includes(topic);

function TopicSymbol({ topic }: { topic: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {SYMBOL_PATHS[topic] ?? SYMBOL_PATHS.general}
    </svg>
  );
}

/* Stardust: tiny four-point sparkles shed by the slider's moving segment. */
const SPARK_PAD_X = 46;
const SPARK_PAD_Y = 30;
const SLIDER_H = 40;
const SPARK_TINTS = [[255, 255, 255], [255, 244, 214], [214, 228, 255]] as const;
type Spark = { x: number; y: number; vx: number; vy: number; born: number; life: number; r: number; tw: number; c: readonly number[]; s: number };

/** Optional extras a saved reading may carry. The calendar and the container read the reading itself (see
 *  readingContent below); keyDates, question, summary and excerpt are only used if a reading has them. */
type ReadingPreview = SavedReadingRecord & {
  question?: string;
  summary?: string;
  excerpt?: string;
  keyDates?: Array<string | { date: string; label?: string }>;
};

/** The saved reading's own text (the same text the results page shows). */
function readingContent(r: SavedReadingRecord): string {
  const content = (r as unknown as { reading?: { pages?: Array<{ content?: unknown }> } }).reading?.pages?.[0]?.content;
  return typeof content === "string" ? content : "";
}

const CAL_MONTHS_AHEAD = 2;
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" in the user's own calendar (a bare date is taken as-is, never shifted by time zone). */
function toDayKey(value: string | { date: string }) {
  const raw = typeof value === "string" ? value : value?.date;
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : dayKey(d);
}

function formatSavedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "2-digit" }).format(date);
}

function getSavedReadingCapacity(access: AccessSummary | null) {
  const isSubscribed = access?.membershipStatus === "active" || access?.isSubscribed === true;
  if (!isSubscribed) return FREE_SLOT_COUNT;

  const plan = access?.effectiveMembershipPlan ?? access?.membershipPlan ?? null;
  if (plan === "plus_xl") return MAX_SAVED_READINGS;
  if (plan === "plus") return PLUS_SLOT_COUNT;

  // Fallback for legacy payloads that used subscriptionTier strings.
  const tier = ((access as AccessSummary & { subscriptionTier?: string | null })?.subscriptionTier ?? "").toLowerCase();
  return tier.includes("xl") ? MAX_SAVED_READINGS : PLUS_SLOT_COUNT;
}

export default function SavedReadingsView({ embedded = false }: SavedReadingsViewProps) {
  const router = useRouter();
  const [readings, setReadings] = useState<SavedReadingRecord[]>([]);
  const [access, setAccess] = useState<AccessSummary | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limitNotice, setLimitNotice] = useState(false);
  const [selectedReadingId, setSelectedReadingId] = useState<string | null>(null); // held for deletion
  const [shownReadingId, setShownReadingId] = useState<string | null>(null);       // open in the container
  const [today, setToday] = useState<Date | null>(null);                           // set on the client
  const [calOffset, setCalOffset] = useState(0);                                   // months ahead of this one
  const [sliderFlash, setSliderFlash] = useState(false);                         // the segment glows on a page change
  const [sliderEngaged, setSliderEngaged] = useState(false);                     // in focus (it rests faded)
  const [dragging, setDragging] = useState(false);
  const [sliderW, setSliderW] = useState<number | null>(null);                   // = the "My Readings" title's width
  const [openingId, setOpeningId] = useState<string | null>(null);               // its tap pulse is running
  const [openedId, setOpenedId] = useState<string | null>(null);                 // pulse done: stays dissolved while open
  const [isPwa, setIsPwa] = useState(false);

  const rootRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLSpanElement | null>(null);
  const sparksRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ x: number; moved: boolean } | null>(null);
  const engageTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rippleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  // True when a tap only put a held reading back, so that tap doesn't also open a reading or turn a page.
  const dismissTapRef = useRef(false);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedReadingId;
  const shownRef = useRef<string | null>(null);
  shownRef.current = shownReadingId;

  const refresh = useCallback(async () => {
    try {
      setReadings(await listSavedReadings());
      setError(null);
    } catch {
      setError("Your saved readings could not be opened on this device.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLimitNotice(new URLSearchParams(window.location.search).get("limit") === "1");
    const now = new Date();
    setToday(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    const nav = navigator as Navigator & { standalone?: boolean };
    setIsPwa(nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true);
    void refresh();
    // Membership only decides how many spaces there are (8, 16 or 24).
    void fetch("/api/user/credits", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: AccessSummary | null) => setAccess(data))
      .catch(() => setAccess(null));
  }, [refresh]);

  useEffect(() => () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    clearTimeout(engageTimerRef.current);
    clearTimeout(rippleTimerRef.current);
  }, []);

  const capacity = getSavedReadingCapacity(access);
  const pageStart = currentPage * READINGS_PER_PAGE;
  const pageSlots = useMemo(
    () => Array.from({ length: READINGS_PER_PAGE }, (_, index) => readings[pageStart + index] ?? null),
    [pageStart, readings],
  );

  /* ── Tap to show in the container · press and hold to delete ── */
  const removeReading = async (id: string) => {
    try {
      await deleteSavedReading(id);
      setSelectedReadingId(null);
      setShownReadingId((shown) => (shown === id ? null : shown));
      try { navigator.vibrate?.([8, 30, 8]); } catch { /* haptics are optional */ }
      await refresh();
      setLimitNotice(false);
    } catch {
      setError("That reading could not be removed. Please try again.");
    }
  };

  const clearLongPressTimer = () => {
    if (!longPressTimerRef.current) return;
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  const beginLongPress = (id: string) => {
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setSelectedReadingId(id);
      try { navigator.vibrate?.(12); } catch { /* haptics are optional */ }
    }, LONG_PRESS_MS);
  };

  const handleReadingClick = (reading: SavedReadingRecord) => {
    if (longPressTriggeredRef.current) { longPressTriggeredRef.current = false; return; }
    if (dismissTapRef.current) { dismissTapRef.current = false; return; }
    if (selectedReadingId) { setSelectedReadingId(null); return; }
    setShownReadingId(reading.id);
    // The soft pulse: ripples in the symbol's shape flow out as it fades; it stays dissolved once they're gone.
    clearTimeout(rippleTimerRef.current);
    setOpenedId(null);
    setOpeningId(reading.id);
    rippleTimerRef.current = setTimeout(() => {
      setOpeningId(null);
      setOpenedId(shownRef.current === reading.id ? reading.id : null);
    }, RIPPLE_MS);
    try { navigator.vibrate?.([6, 40, 6]); } catch { /* haptics are optional */ }
  };

  // Closing (or switching) the open reading brings its symbol back.
  useEffect(() => {
    setOpeningId((id) => (id === shownReadingId ? id : null));
    setOpenedId((id) => (id === shownReadingId ? id : null));
  }, [shownReadingId]);

  const openReading = (id: string) => router.push(`/reading/results?saved=${encodeURIComponent(id)}`);

  // A tap outside puts things back (and does nothing else): while a reading is held, anywhere but it or the
  // trash can keeps it; while one is open in the container, anywhere outside the container closes it. Escape too.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      dismissTapRef.current = false;
      if (selectedRef.current) {
        if (target?.closest?.("[data-delete-zone]")) return;
        dismissTapRef.current = true;
        setSelectedReadingId(null);
      } else if (shownRef.current && !target?.closest?.("[data-reading-viewer]")) {
        dismissTapRef.current = true;
        setShownReadingId(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selectedRef.current) setSelectedReadingId(null);
      else if (shownRef.current) setShownReadingId(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  /* ── Pages: the slider ── */
  // Touching the slider brings it into focus; it settles back 2s after the last touch.
  const engageSlider = useCallback(() => {
    setSliderEngaged(true);
    clearTimeout(engageTimerRef.current);
    engageTimerRef.current = setTimeout(() => setSliderEngaged(false), 2000);
  }, []);

  // The segment's position (in pages, fractional while dragging) is set straight on the slider, so drags don't re-render.
  const placeThumb = (p: number) => sliderRef.current?.style.setProperty("--p", String(p));
  useEffect(() => { placeThumb(currentPage); }, [currentPage]);

  const setPage = (nextPage: number) => {
    const next = Math.max(0, Math.min(PAGE_COUNT - 1, nextPage));
    setSelectedReadingId(null);
    placeThumb(next);
    if (next === currentPage) return;
    setSliderFlash(false);
    requestAnimationFrame(() => setSliderFlash(true));   // restart the glow on quick repeat changes
    try { navigator.vibrate?.(6); } catch { /* haptics are optional */ }
    setCurrentPage(next);
  };

  // Tap a third of the line to jump there, or drag the glowing segment; it snaps to the nearest page.
  const fractionAt = (clientX: number) => {
    const r = sliderRef.current!.getBoundingClientRect(), seg = r.width / PAGE_COUNT;
    return Math.max(0, Math.min(PAGE_COUNT - 1, (clientX - r.left - seg / 2) / seg));
  };
  const onSliderDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dismissTapRef.current) { dismissTapRef.current = false; return; }   // this tap only closed something
    engageSlider();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, moved: false };
  };
  const onSliderMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientX - drag.x) < 6) return;
    if (!drag.moved) { drag.moved = true; setDragging(true); }
    placeThumb(Number(fractionAt(e.clientX).toFixed(3)));
  };
  const onSliderUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const r = e.currentTarget.getBoundingClientRect();
    const target = drag.moved ? Math.round(fractionAt(e.clientX)) : Math.floor(((e.clientX - r.left) / r.width) * PAGE_COUNT);
    dragRef.current = null;
    setDragging(false);
    engageSlider();
    setPage(target);
  };
  const onSliderCancel = () => { dragRef.current = null; setDragging(false); placeThumb(currentPage); };
  const onSliderKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); engageSlider(); setPage(currentPage + 1); }
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); engageSlider(); setPage(currentPage - 1); }
  };

  // The slider is exactly as wide as the "My Readings" title with its side lines.
  useEffect(() => {
    const title = titleRef.current;
    if (!title) return;
    const size = () => setSliderW(Math.round(title.getBoundingClientRect().width));
    size();
    const ro = new ResizeObserver(size);
    ro.observe(title);
    void document.fonts?.ready.then(size);
    return () => ro.disconnect();
  }, []);

  /* ── Stardust: while the segment moves, its leading edge sheds tiny stars that drift back and fade ── */
  useEffect(() => {
    const slider = sliderRef.current, canvas = sparksRef.current, thumb = thumbRef.current;
    const ctx = canvas?.getContext("2d");
    if (!slider || !canvas || !thumb || !ctx) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let particles: Spark[] = [];
    let raf = 0, lastX: number | null = null, lastT = 0, stillFor = 0;

    const size = () => {
      const w = slider.offsetWidth + SPARK_PAD_X * 2, h = SLIDER_H + SPARK_PAD_Y * 2, dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const star = (x: number, y: number, r: number) => {   // a soft four-point sparkle
      ctx.beginPath(); ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
      ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
    };
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now;
      const sr = slider.getBoundingClientRect(), tr = thumb.getBoundingClientRect();
      const x = tr.left + tr.width / 2 - sr.left + SPARK_PAD_X, y = SLIDER_H / 2 + SPARK_PAD_Y;
      if (lastX !== null) {
        const dx = x - lastX, dir = Math.sign(dx), speed = Math.abs(dx) / dt;
        if (Math.abs(dx) > 0.3) {
          stillFor = 0;
          const count = Math.min(6, Math.ceil(Math.abs(dx) / 5));   // along the path travelled, at the leading edge
          for (let k = 0; k < count && particles.length <= 90; k++) {
            const hx = lastX + dx * (k / count) + dir * tr.width * 0.42;
            particles.push({ x: hx + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 5,
              vx: -dir * (8 + Math.random() * 26) - dx * 0.4, vy: (Math.random() - 0.5) * 16 - 3,
              born: now, life: 650 + Math.random() * 650, r: 0.7 + Math.random() * 1.5, tw: Math.random() * 6.28,
              c: SPARK_TINTS[Math.floor(Math.random() * SPARK_TINTS.length)], s: Math.min(1, 0.45 + speed / 900) });
          }
        } else stillFor += dt;
      }
      lastX = x;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "lighter";
      particles = particles.filter((p) => {
        const age = (now - p.born) / p.life;
        if (age >= 1) return false;
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96;
        const a = Math.pow(1 - age, 1.4) * (0.55 + 0.45 * Math.sin(p.tw + now / 70)) * p.s;
        const [R, G, B] = p.c;
        ctx.fillStyle = `rgba(${R},${G},${B},${(a * 0.3).toFixed(3)})`; star(p.x, p.y, p.r * 3);
        ctx.fillStyle = `rgba(${R},${G},${B},${a.toFixed(3)})`; star(p.x, p.y, p.r);
        return true;
      });
      ctx.globalCompositeOperation = "source-over";
      if (particles.length || stillFor < 0.25) raf = requestAnimationFrame(frame);
      else { raf = 0; lastX = null; }
    };
    const wake = () => {
      if (raf) return;
      stillFor = 0; lastT = performance.now(); raf = requestAnimationFrame(frame);
    };

    size();
    const ro = new ResizeObserver(size);
    ro.observe(slider);
    // Any move of the segment (a drag, a tap, a key) changes the slider's --p or class: wake the stardust then.
    const mo = new MutationObserver(wake);
    mo.observe(slider, { attributes: true, attributeFilter: ["style", "class"] });
    slider.addEventListener("pointerdown", wake);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect(); mo.disconnect();
      slider.removeEventListener("pointerdown", wake);
    };
  }, []);

  const held = readings.find((r) => r.id === selectedReadingId) ?? null;
  const shown = (readings.find((r) => r.id === shownReadingId) ?? null) as ReadingPreview | null;
  // The container's preview: the reading's headline and "The First Glimpse", straight from the reading.
  const shownPreview = useMemo(() => (shown ? getReadingPreview(readingContent(shown)) : null), [shown]);
  const shownLine = (shownPreview?.focus || shown?.question || "").trim();
  const shownBody = (shownPreview?.glimpse || shown?.summary || shown?.excerpt || "").trim();

  /* ── Calendar: the last three readings' key dates ── */
  const recent = useMemo(() => readings.slice(0, 3) as ReadingPreview[], [readings]);
  const keyDays = useMemo(() => {
    const map = new Map<string, ReadingPreview[]>();
    recent.forEach((r) => {
      // The same dates the results page puts on "Your Calendar" ("When It Unfolds" and "Your Move").
      const days = new Set(getReadingKeyDays(readingContent(r), r.savedAt));
      (r.keyDates ?? []).forEach((v) => { const k = toDayKey(v); if (k) days.add(k); });
      days.forEach((k) => map.set(k, [...(map.get(k) ?? []), r]));
    });
    return map;
  }, [recent]);

  // The calendar's month (its markup sits in the main return below, so the scoped styles reach it).
  const calFirst = today ? new Date(today.getFullYear(), today.getMonth() + calOffset, 1) : null;
  const calDaysIn = calFirst ? new Date(calFirst.getFullYear(), calFirst.getMonth() + 1, 0).getDate() : 0;
  const calMonth = calFirst ? calFirst.toLocaleDateString("en-US", { month: "long" }) : "";
  const calTodayKey = today ? dayKey(today) : "";

  const onTrash = () => {
    if (dismissTapRef.current) { dismissTapRef.current = false; return; }
    if (held) void removeReading(held.id);
  };

  // In the pager: hide only this panel's scrollbar and let it fill the slot (same as Your Day).
  useEffect(() => {
    if (!embedded) return;
    const panel = rootRef.current?.closest<HTMLElement>("[data-pager-panel]");
    if (!panel) return;
    panel.classList.add("srv-panel-no-scrollbar");
    panel.style.minHeight = "100%";
    return () => {
      panel.classList.remove("srv-panel-no-scrollbar");
      panel.style.minHeight = "";
    };
  }, [embedded]);

  return (
    <main ref={rootRef} className={`dashboard-page${embedded ? " embedded" : ""}${isPwa ? " is-pwa" : ""}${shown ? " is-viewing" : ""}${held ? " is-holding" : ""}`}
      style={shown ? ({ "--rc": topicColor(shown.topic) } as CSSProperties) : undefined}
      aria-label="Saved readings"
    >
      {!embedded && (
        <button type="button" className="back" onClick={() => router.back()} aria-label="Go back">
          <ChevronLeft aria-hidden="true" />
        </button>
      )}

      {/* The container: shows the tapped reading, glowing in its color. */}
      <section className="dashboard-card" aria-label="Reading viewer" data-reading-viewer>
        <div className="card-view" aria-live="polite">
          {shown ? (
            <div key={shown.id} className="cv">
              <p className="cv-date">{formatSavedDate(shown.savedAt)}</p>
              <p className="cv-title">{titleCase(formatTopic(shown.topic))}</p>
              {shownLine && <p className="cv-q">{shownLine}</p>}
              {shownBody ? <p className="cv-body">{shownBody}</p> : <span className="cv-spacer" />}
              <button type="button" className="cv-open" data-no-swipe onClick={() => openReading(shown.id)}>
                Open reading <ChevronRight aria-hidden="true" />
              </button>
            </div>
          ) : calFirst ? (
            <div className="cal">
              <div className="cal-head">
                <p className="cal-title">{calMonth}<small>{calFirst.getFullYear()}</small></p>
                <div className="cal-nav">
                  <button type="button" data-no-swipe aria-label="Previous month" disabled={calOffset <= 0} onClick={() => setCalOffset((o) => Math.max(0, o - 1))}>
                    <ChevronLeft aria-hidden="true" />
                  </button>
                  <button type="button" data-no-swipe aria-label="Next month" disabled={calOffset >= CAL_MONTHS_AHEAD} onClick={() => setCalOffset((o) => Math.min(CAL_MONTHS_AHEAD, o + 1))}>
                    <ChevronRight aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="cal-week" aria-hidden="true">
                {WEEKDAYS.map((w, i) => <span key={i}>{w}</span>)}
              </div>
              <div className="cal-grid">
                {Array.from({ length: calFirst.getDay() }, (_, i) => <span key={`pad-${i}`} className="cal-day" aria-hidden="true" />)}
                {Array.from({ length: calDaysIn }, (_, i) => {
                  const d = i + 1;
                  const k = dayKey(new Date(calFirst.getFullYear(), calFirst.getMonth(), d));
                  const hits = keyDays.get(k);
                  const cls = `cal-day${k < calTodayKey ? " is-past" : ""}${k === calTodayKey ? " is-today" : ""}${hits ? " is-key" : ""}`;
                  if (!hits) return <span key={k} className={cls}><span className="n">{d}</span></span>;
                  const label = hits.map((h) => titleCase(formatTopic(h.topic))).join(" and ");
                  return (
                    <button
                      key={k}
                      type="button"
                      data-no-swipe
                      className={cls}
                      style={{ "--c": topicColor(hits[0].topic), "--c2": topicColor((hits[1] ?? hits[0]).topic), "--kd": `${-(d % 5) * 0.6}s` } as CSSProperties}
                      aria-label={`${calMonth} ${d}: a key date in your ${label} reading`}
                      onClick={() => setShownReadingId(hits[0].id)}
                    >
                      <span className="n">{d}</span>
                    </button>
                  );
                })}
              </div>
              {recent.length > 0 && (
                <div className="cal-legend">
                  {recent.map((r) => (
                    <button key={r.id} type="button" data-no-swipe style={{ "--c": topicColor(r.topic) } as CSSProperties} onClick={() => setShownReadingId(r.id)}>
                      <i aria-hidden="true" />{titleCase(formatTopic(r.topic))}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </section>

      {(limitNotice || error) && (
        <p className={`notice ${error ? "error" : ""}`} role={error ? "alert" : "status"}>
          {error ?? `All ${capacity} available spaces are filled. Remove one reading to save another.`}
        </p>
      )}

      <section className="readings-section" aria-label="Saved readings">
        <div className="readings-head">
          <h2 ref={titleRef} className="rh-title">My Readings</h2>
          {currentPage > 0 && <Crown className="page-crown" aria-label="Astro Plus spaces" />}
        </div>

        <div className="reading-grid">
          {pageSlots.map((reading, index) => {
            const globalIndex = pageStart + index;
            const isLocked = globalIndex >= capacity && !reading;

            if (reading) {
              const isHeld = selectedReadingId === reading.id;
              const isShown = shownReadingId === reading.id;
              return (
                <div className={`reading-slot${isHeld ? " is-held" : ""}${openingId === reading.id ? " is-opening" : ""}${openedId === reading.id ? " is-opened" : ""}`} key={reading.id} data-delete-zone={isHeld ? "" : undefined}>
                  <button
                    type="button"
                    data-no-swipe
                    className="reading-tile"
                    style={{ "--t": topicColor(reading.topic), "--i": index } as CSSProperties}
                    onPointerDown={() => beginLongPress(reading.id)}
                    onPointerUp={clearLongPressTimer}
                    onPointerCancel={clearLongPressTimer}
                    onPointerLeave={clearLongPressTimer}
                    onContextMenu={(e) => e.preventDefault()}
                    onClick={() => handleReadingClick(reading)}
                    aria-pressed={isShown}
                    aria-label={isHeld ? `${titleCase(formatTopic(reading.topic))} reading held for deletion` : `${titleCase(formatTopic(reading.topic))} reading from ${formatSavedDate(reading.savedAt)}. Tap to open, press and hold to delete.`}
                  >
                    <span className={`tile-icon${isOrb(reading.topic) ? " is-orb" : ""}`} aria-hidden="true">
                      <TopicSymbol topic={reading.topic} />
                      {openingId === reading.id && RIPPLES.map(([delay, peak], k) => (
                        <span key={k} className={`tile-ripple${k ? " is-faint" : ""}`} style={{ "--wo": peak, animationDelay: `${delay}s` } as CSSProperties}>
                          <TopicSymbol topic={reading.topic} />
                        </span>
                      ))}
                    </span>
                    <span className="tile-date">{formatSavedDate(reading.savedAt)}</span>
                  </button>
                </div>
              );
            }

            return (
              <div className={`empty-slot ${isLocked ? "locked" : "available"}`} key={`empty-${globalIndex}`} style={{ "--ed": `${-(index * 0.45)}s` } as CSSProperties} aria-label={isLocked ? "Membership saved reading space" : "Available saved reading space"}>
                <span />
              </div>
            );
          })}
        </div>

        {!loading && readings.length === 0 && !error && currentPage === 0 && (
          <p className="empty-copy">Saved readings will appear among the stars.</p>
        )}

        <nav className="page-navigation" aria-label="Reading pages">
          <div
            ref={sliderRef}
            role="slider"
            tabIndex={held ? -1 : 0}
            data-no-swipe
            className={`pg-slider${sliderEngaged ? " is-engaged" : ""}${dragging ? " is-dragging" : ""}${sliderFlash ? " flash" : ""}`}
            style={sliderW ? ({ "--slider-w": `${sliderW}px` } as CSSProperties) : undefined}
            aria-label="Reading pages"
            aria-valuemin={1}
            aria-valuemax={PAGE_COUNT}
            aria-valuenow={currentPage + 1}
            aria-valuetext={`Page ${currentPage + 1} of ${PAGE_COUNT}`}
            onPointerDown={onSliderDown}
            onPointerMove={onSliderMove}
            onPointerUp={onSliderUp}
            onPointerCancel={onSliderCancel}
            onKeyDown={onSliderKey}
          >
            <span className="pg-track" />
            <span ref={thumbRef} className="pg-thumb" onAnimationEnd={() => setSliderFlash(false)} />
          </div>
          <canvas ref={sparksRef} className="pg-sparks" aria-hidden="true" />
          {/* While a reading is held, the slider fades and this red trash button takes its place. */}
          <button
            type="button"
            data-no-swipe
            data-delete-zone
            className="pg-trash"
            tabIndex={held ? 0 : -1}
            aria-hidden={held ? undefined : true}
            onClick={onTrash}
            aria-label={held ? `Delete the ${titleCase(formatTopic(held.topic))} reading from ${formatSavedDate(held.savedAt)}` : "Delete reading"}
          >
            {held && <Trash2 key={held.id} strokeWidth={1.7} aria-hidden="true" />}
          </button>
        </nav>
      </section>

      <style jsx global>{`
        .srv-panel-no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .srv-panel-no-scrollbar::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
        /* The container's drifting outline (global so @property passes straight through). */
        @property --ol-angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
        @keyframes srvOlOrbit { to { --ol-angle: 360deg; } }
      `}</style>

      <style jsx>{`
        * { box-sizing: border-box; }

        /* Same frame as Your Day (DailyPanel): the container's top lines up with the profection card. */
        .dashboard-page {
          --swipe-h: 32px;
          --display: var(--font-display, "Cormorant Garamond"), "Cormorant Garamond", Georgia, serif;
          --caps: var(--font-caps, Cinzel), Cinzel, Georgia, serif;
          position: relative;
          height: 100svh;
          height: 100dvh;
          width: 100%;
          max-width: 430px;
          margin: 0 auto;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          gap: 12px;   /* same gap as Your Day */
          padding:
            calc(env(safe-area-inset-top) + 6px + var(--swipe-h))
            clamp(12px, 4vw, 16px)
            calc(env(safe-area-inset-bottom) + 2px);   /* browser: the readings sit right at the bottom */
          background: #000;
          color: #f8fafc;
          font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
        }
        /* Inside the pager: fill the slot and let the pager's sky show through. */
        .dashboard-page.embedded { height: 100%; background: transparent; }
        /* Installed app (PWA): a little room above the home indicator. */
        .dashboard-page { --cap-mt: 14px; }
        @media (display-mode: standalone) { .dashboard-page { padding-bottom: calc(env(safe-area-inset-bottom) + var(--cap-mt)); } }
        .dashboard-page.is-pwa { padding-bottom: calc(env(safe-area-inset-bottom) + var(--cap-mt)); }
        @media (max-height: 870px) { .dashboard-page { --swipe-h: 28px; --cap-mt: 12px; } }
        @media (max-height: 680px) { .dashboard-page { --cap-mt: 10px; } }
        @media (max-height: 560px) { .dashboard-page { --swipe-h: 26px; } }

        h2, p { margin: 0; }
        button { font: inherit; color: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }

        .back { position: absolute; z-index: 6; left: 6px; top: calc(env(safe-area-inset-top) + 2px); width: 42px; height: 42px;
          display: grid; place-items: center; border: 0; background: transparent; color: rgba(226,232,240,.72); }
        .back :global(svg) { width: 21px; height: 21px; }

        /* ── The container: Profection fill (Your Day's hero card) ── */
        .dashboard-card {
          position: relative; z-index: 1; width: 100%; transition: border-color .5s ease, box-shadow .5s ease;
          flex: 1 1 auto; min-height: 120px; max-height: 414px;   /* takes the room that's left; never forces a scroll */
          overflow: hidden; border-radius: 28px;
          border: 1px solid transparent;   /* the edge is the drifting ring below */
          --ol-c: #fff;
          background:
            radial-gradient(90% 70% at 0% 0%, rgba(218,183,104,.20), transparent 60%),
            linear-gradient(170deg, rgba(10,13,28,.97), rgba(5,8,20,.97));
          box-shadow: -16px 20px 46px rgba(249,115,22,.16), 16px 24px 52px rgba(125,211,252,.13), 0 38px 84px rgba(96,165,250,.14);
        }

        /* Drifting Light outline: a ring of light slowly travels the container's edge (one lap every 14s).
           When a reading is open it takes on that reading's color. */
        .dashboard-card::after { content: ""; position: absolute; inset: 0; z-index: 2; border-radius: inherit; padding: 1px; pointer-events: none;
          background: conic-gradient(from var(--ol-angle),
            color-mix(in srgb, var(--ol-c) 75%, transparent), color-mix(in srgb, var(--ol-c) 12%, transparent) 90deg,
            color-mix(in srgb, var(--ol-c) 8%, transparent) 180deg, color-mix(in srgb, var(--ol-c) 40%, transparent) 270deg,
            color-mix(in srgb, var(--ol-c) 75%, transparent));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude;
          animation: srvOlOrbit 14s linear infinite; }

        .notice { position: fixed; z-index: 20; left: 50%; top: max(58px, calc(env(safe-area-inset-top) + 48px)); transform: translateX(-50%); margin: 0;
          padding: 9px 16px; border-radius: 999px; background: rgba(12,14,22,.94); color: #d8caaa; font-size: 11px; text-align: center; }
        .notice.error { color: #fda4af; }

        /* ── My Readings ── */
        .readings-section { position: relative; z-index: 1; flex: 0 0 auto; width: 100%; display: flex; flex-direction: column; gap: 8px; }
        /* "My Readings" as the section's hero: a deep shadow lifts it off the page, a soft silver glow sits behind it,
           and fine lines fade out on either side (like "Select Reading" on Your Day, in white). */
        .readings-head { position: relative; display: flex; align-items: center; justify-content: center; gap: 14px; padding: 2px 30px; isolation: isolate; }
        .readings-head::before { content: ""; position: absolute; left: 50%; top: 50%; width: 220px; height: 56px; transform: translate(-50%, -50%); z-index: -1; pointer-events: none;
          border-radius: 50%; background: radial-gradient(closest-side, rgba(220,230,255,.13), rgba(220,230,255,.05) 55%, transparent); filter: blur(6px); }
        .readings-head::after { content: none; }
        .rh-title { margin: 0; font-family: var(--display); font-size: 28px; font-weight: 500; line-height: 1.05; letter-spacing: .015em; text-transform: none; color: #fff;
          display: flex; align-items: center; gap: 14px; white-space: nowrap;
          text-shadow: 0 1px 0 rgba(255,255,255,.12), 0 2px 4px rgba(0,0,0,.95), 0 6px 16px rgba(0,0,0,.85), 0 12px 30px rgba(0,0,0,.6),
            0 0 22px rgba(215,228,255,.32), 0 0 46px rgba(215,228,255,.14); }
        .rh-title::before, .rh-title::after { content: ""; width: 38px; height: 1px; flex: none;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.6)); box-shadow: 0 0 6px rgba(255,255,255,.35); }
        .rh-title::after { transform: scaleX(-1); }
        .readings-head :global(.page-crown) { position: absolute; right: 4px; top: 50%; width: 16px; height: 16px; margin-top: -8px;
          color: #d9c795; filter: drop-shadow(0 0 7px rgba(221,199,143,.22)); }
        .reading-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: 84px; gap: clamp(7px, 2vw, 11px); }
        .reading-slot, .empty-slot { position: relative; min-height: 0; }
        /* Readings: no box at all — just the name and date over a soft glow of the reading's own color (--t) that breathes
           slowly, like the calendar's key dates. Each one breathes on its own beat (--i). */
        .reading-tile { position: relative; width: 100%; height: 100%; min-height: 0; padding: 6px 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
          border: 0; border-radius: 18px; background: none; box-shadow: none; overflow: visible;
          color: rgba(248,250,252,.95); user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation;
          transition: transform 200ms ease, filter 180ms ease; }
        .reading-tile::before { content: ""; position: absolute; left: 50%; top: 50%; width: 92%; height: 82%; border-radius: 50%; z-index: 0; pointer-events: none;
          background: radial-gradient(closest-side, color-mix(in srgb, var(--t, #fff) 44%, transparent), color-mix(in srgb, var(--t, #fff) 15%, transparent) 58%, transparent);
          filter: blur(9px) saturate(1.35); animation: tileBreath 3.6s ease-in-out infinite; animation-delay: calc(var(--i, 0) * -.45s); transition: background .4s ease; }
        @keyframes tileBreath { 0%, 100% { opacity: .55; transform: translate(-50%, -50%) scale(.9); } 50% { opacity: 1; transform: translate(-50%, -50%) scale(1.08); } }
        .reading-tile > * { position: relative; z-index: 1; }
        .reading-tile:active { transform: scale(.95); }
        /* The reading's symbol, in its color, with a soft glow of its own. */
        .tile-icon { position: relative; display: grid; place-items: center; color: color-mix(in srgb, var(--t, #fff) 78%, #fff); }
        .tile-icon > :global(svg) { width: 30px; height: 30px; transition: opacity .6s ease;
          filter: drop-shadow(0 0 6px color-mix(in srgb, var(--t, #fff) 80%, transparent)) drop-shadow(0 0 14px color-mix(in srgb, var(--t, #fff) 45%, transparent)); }
        .tile-icon.is-orb > :global(svg) { width: 34px; height: 34px; margin: -2px 0; }
        .tile-date { color: rgba(226,232,240,.78); font-size: clamp(8px, 2.1vw, 10px); font-weight: 600; letter-spacing: .05em; text-transform: uppercase;
          text-shadow: 0 1px 3px rgba(0,0,0,.6); transition: opacity .6s ease; }

        /* ── Tap a reading: a soft pulse with long ripples. Four outlines of the reading's own symbol drift slowly
           outward, each fainter than the last (--wo), as the symbol fades and the reading fades into the container.
           The lines stay fine as they grow (non-scaling stroke). ── */
        .tile-ripple { position: absolute; left: 50%; top: 50%; width: 30px; height: 30px; margin: -15px 0 0 -15px; pointer-events: none; z-index: 3; opacity: 0;
          color: color-mix(in srgb, var(--t, #fff) 88%, #fff);
          filter: blur(.3px) drop-shadow(0 0 4px color-mix(in srgb, var(--t, #fff) 46%, transparent)) drop-shadow(0 0 10px color-mix(in srgb, var(--t, #fff) 22%, transparent));
          animation: tileRipple 2.9s cubic-bezier(.2,.5,.3,1) forwards; }
        .tile-ripple :global(svg) { width: 100%; height: 100%; display: block; }
        .tile-ripple :global(svg *) { vector-effect: non-scaling-stroke; stroke-width: 1.3px; }
        .tile-ripple.is-faint :global(svg *) { stroke-width: 1px; }
        @keyframes tileRipple { 0% { opacity: 0; transform: scale(.95); } 12% { opacity: var(--wo, .46); } 100% { opacity: 0; transform: scale(2.85); } }
        .reading-slot.is-opening { z-index: 4; }
        .is-viewing .reading-slot.is-opening { filter: none; opacity: 1; }
        .reading-slot.is-opening .tile-icon > :global(svg) { animation: iconRelease 1.4s cubic-bezier(.25,.6,.35,1) forwards; }
        .reading-slot.is-opening .tile-date { opacity: 0; transition-duration: .5s; }
        .reading-slot.is-opening .reading-tile::before { animation: glowRelease 1.3s cubic-bezier(.25,.6,.35,1) forwards; }
        @keyframes iconRelease { 0% { opacity: 1; transform: scale(1); } 30% { opacity: .85; transform: scale(1.07); } 100% { opacity: 0; transform: scale(1.16); filter: blur(2px); } }
        @keyframes glowRelease { from { opacity: .58; transform: translate(-50%, -50%) scale(1); } to { opacity: 0; transform: translate(-50%, -50%) scale(1.6); } }
        /* After the ripple: the symbol stays dissolved (no flash back to full brightness) until the reading is closed. */
        .reading-slot.is-opened .tile-icon > :global(svg), .reading-slot.is-opened .tile-date, .reading-slot.is-opened .reading-tile::before { opacity: 0; animation: none; }
        /* An open space: a faint thin circle with a small soft-glowing dot in the middle that breathes gently, like the
           readings. Spaces beyond the membership are dimmer. */
        .empty-slot { display: grid; place-items: center; }
        .empty-slot span { position: relative; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
          border: 1px solid rgba(255,255,255,.14); box-shadow: 0 0 12px rgba(210,225,255,.06), inset 0 0 8px rgba(210,225,255,.05); }
        .empty-slot span::after { content: ""; width: 4px; height: 4px; border-radius: 50%; background: #fff;
          box-shadow: 0 0 5px rgba(255,255,255,.9), 0 0 12px rgba(210,225,255,.55); animation: emptyBreath 3.6s ease-in-out infinite; animation-delay: var(--ed, 0s); }
        @keyframes emptyBreath { 0%, 100% { opacity: .45; transform: scale(.85); } 50% { opacity: 1; transform: scale(1.15); } }
        .empty-slot.locked span { border-color: rgba(255,255,255,.06); box-shadow: none; }
        .empty-slot.locked span::after { width: 3px; height: 3px; opacity: .35; animation: none; box-shadow: 0 0 6px rgba(255,255,255,.3); }
        .empty-copy { margin: 0; color: rgba(148,163,184,.48); font-family: var(--display); font-size: 10px; letter-spacing: .05em; text-align: center; }
        /* ── The page slider: one fine line as wide as the "My Readings" title (with its side lines). A short glowing
           segment marks the page; tap a third of the line or drag the segment. While a reading is held, the slider fades
           and a red trash button takes its place. ── */
        .page-navigation { position: relative; height: 42px; display: grid; place-items: center; }
        .pg-slider { position: relative; width: var(--slider-w, 240px); height: 40px; cursor: pointer; touch-action: none; -webkit-tap-highlight-color: transparent;
          opacity: .62; transition: opacity .9s cubic-bezier(.4,0,.2,1); outline: none; user-select: none; -webkit-user-select: none; }
        .pg-slider.is-engaged, .pg-slider:focus-visible { opacity: 1; transition-duration: .25s; }
        @media (hover: hover) { .pg-slider:hover { opacity: 1; transition-duration: .25s; } }
        .pg-track { position: absolute; left: 0; right: 0; top: 50%; height: 1px; pointer-events: none;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.4) 14%, rgba(255,255,255,.4) 86%, transparent); box-shadow: 0 0 6px rgba(255,255,255,.16); }
        .pg-thumb { position: absolute; left: 0; top: 50%; width: calc(100% / 3); height: 2px; margin-top: -1px; border-radius: 2px; pointer-events: none;
          background: linear-gradient(90deg, transparent, #fff 28%, #fff 72%, transparent);
          box-shadow: 0 0 8px rgba(255,255,255,.75), 0 0 20px rgba(210,225,255,.4);
          transform: translateX(calc(var(--p, 0) * 100%)); transition: transform .7s cubic-bezier(.22,1,.36,1); }
        .pg-slider.is-dragging .pg-thumb { transition: none; }
        @keyframes thumbGlow { 0% { box-shadow: 0 0 14px rgba(255,255,255,1), 0 0 36px rgba(210,225,255,.7); } 100% { box-shadow: 0 0 8px rgba(255,255,255,.75), 0 0 20px rgba(210,225,255,.4); } }
        .pg-slider.flash .pg-thumb { animation: thumbGlow 1.2s ease-out; }
        .pg-slider:focus-visible .pg-track { box-shadow: 0 0 0 1px rgba(255,255,255,.25), 0 0 10px rgba(255,255,255,.3); }
        /* A comet of stardust: the moving segment sheds tiny twinkling stars that drift behind it and fade. */
        .pg-sparks { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: none; z-index: 2; }

        /* The red trash button: hidden until a reading is held. */
        .pg-trash { position: absolute; left: 50%; top: 50%; width: 48px; height: 48px; margin: -24px 0 0 -24px; padding: 0; border-radius: 50%;
          display: grid; place-items: center; color: #fee2e2; touch-action: manipulation;
          border: 1px solid rgba(248,113,113,.75);
          background: radial-gradient(90% 90% at 50% 110%, rgba(248,113,113,.45), transparent 70%), linear-gradient(155deg, rgba(127,29,29,.85), rgba(60,8,12,.95));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.15), 0 0 14px rgba(239,68,68,.45), 0 0 34px rgba(220,38,38,.2), 0 10px 26px rgba(0,0,0,.5);
          opacity: 0; transform: scale(.8); pointer-events: none; transition: opacity .45s ease, transform .45s cubic-bezier(.22,1,.36,1); }
        .pg-trash :global(svg) { width: 19px; height: 19px; filter: drop-shadow(0 0 4px rgba(254,202,202,.7)) drop-shadow(0 0 10px rgba(239,68,68,.5)); animation: trashIn .45s cubic-bezier(.22,1,.36,1); }
        .pg-trash:active { transform: scale(.93); }
        .pg-trash:focus-visible { outline: none; box-shadow: 0 0 0 2px #fecaca, 0 0 22px rgba(239,68,68,.5); }
        .is-holding .pg-slider { opacity: 0; pointer-events: none; }
        .is-holding .pg-trash { opacity: 1; transform: none; pointer-events: auto; animation: trashBreath 2.4s ease-in-out infinite; }

        /* ── The container's reading view ── */
        .card-view { position: absolute; inset: 0; z-index: 1; display: flex; flex-direction: column; padding: 22px 20px 18px; transition: opacity .45s ease, filter .45s ease; }
        /* ── Minimal calendar: no boxes, just the month, the weekday letters and the dates. Key dates from the
           last three readings glow softly in each reading's color (--c, and --c2 when two share a day). ── */
        .cal { flex: 1; min-height: 0; display: flex; flex-direction: column; animation: cvIn .5s cubic-bezier(.22,1,.36,1); }
        .cal-head { display: flex; align-items: center; justify-content: space-between; padding: 0 2px; }
        .cal-title { font-family: var(--display); font-size: 24px; font-weight: 500; line-height: 1; color: #fff; }
        .cal-title small { margin-left: 8px; font-family: var(--caps); font-size: 8.5px; font-weight: 600; letter-spacing: .22em; color: rgba(148,163,184,.7); vertical-align: middle; }
        .cal-nav { display: flex; gap: 2px; }
        .cal-nav button { width: 30px; height: 30px; padding: 0; display: grid; place-items: center; border: 0; border-radius: 50%; background: none; color: rgba(255,255,255,.6); transition: background .2s; }
        .cal-nav button:active { background: rgba(255,255,255,.08); }
        .cal-nav button:disabled { opacity: .2; pointer-events: none; }
        .cal-nav :global(svg) { width: 16px; height: 16px; }
        .cal-week, .cal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
        .cal-week { margin-top: 12px; }
        .cal-week span { text-align: center; font-family: var(--caps); font-size: 7.5px; font-weight: 600; letter-spacing: .18em; color: rgba(148,163,184,.55); }
        .cal-grid { flex: 1; min-height: 0; margin-top: 4px; grid-auto-rows: minmax(0, 1fr); }
        .cal-day { position: relative; min-height: 0; display: grid; place-items: center; padding: 0; border: 0; background: none;
          font-family: var(--display); font-size: 17px; font-weight: 400; color: rgba(226,232,240,.85); font-variant-numeric: lining-nums tabular-nums; }
        .cal-day .n { position: relative; z-index: 1; width: 30px; height: 30px; max-height: 100%; display: grid; place-items: center; border-radius: 50%; line-height: 1; transition: transform .2s ease; }
        .cal-day.is-past { color: rgba(148,163,184,.35); }
        .cal-day.is-today .n { color: #fff; box-shadow: 0 0 0 1px rgba(255,255,255,.75), 0 0 10px rgba(255,255,255,.25); }
        .cal-day.is-key .n { color: var(--c); font-weight: 600; text-shadow: 0 0 10px color-mix(in srgb, var(--c) 70%, transparent); }
        .cal-day.is-key:active .n { transform: scale(.92); }
        .cal-day.is-key::before { content: ""; position: absolute; left: 50%; top: 50%; width: 36px; height: 36px; max-height: 120%; border-radius: 50%; pointer-events: none;
          background:
            radial-gradient(circle at 38% 50%, color-mix(in srgb, var(--c) 48%, transparent), transparent 62%),
            radial-gradient(circle at 62% 50%, color-mix(in srgb, var(--c2, var(--c)) 48%, transparent), transparent 62%);
          filter: blur(5px) saturate(1.3); animation: keyBreath 3.6s ease-in-out infinite; animation-delay: var(--kd, 0s); }
        @keyframes keyBreath { 0%, 100% { opacity: .55; transform: translate(-50%, -50%) scale(.9); } 50% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); } }
        .cal-legend { display: flex; justify-content: center; flex-wrap: wrap; gap: 6px 16px; margin-top: 8px; }
        .cal-legend button { display: flex; align-items: center; gap: 7px; padding: 4px 2px; border: 0; background: none;
          font-family: var(--caps); font-size: 7.5px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; color: rgba(203,213,225,.7); }
        .cal-legend i { width: 6px; height: 6px; border-radius: 50%; background: var(--c); box-shadow: 0 0 6px var(--c), 0 0 12px color-mix(in srgb, var(--c) 50%, transparent); }
        .cv { flex: 1; min-height: 0; display: flex; flex-direction: column; animation: cvIn .95s cubic-bezier(.22,1,.36,1) .3s both; }
        @keyframes cvIn { from { opacity: 0; transform: translateY(6px); filter: blur(4px); } to { opacity: 1; transform: none; filter: none; } }
        .cv-date { font-family: var(--caps); font-size: 8.5px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; color: rgba(241,214,148,.9); }
        .cv-title { margin-top: 6px; font-family: var(--display); font-size: 30px; font-weight: 500; line-height: 1.05; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,.6); }
        .cv-q { margin-top: 6px; font-family: var(--display); font-style: italic; font-size: 14.5px; line-height: 1.3; color: rgba(203,213,225,.7); }
        .cv-body { margin-top: 12px; flex: 1; min-height: 0; overflow: hidden; font-family: var(--display); font-size: 16.5px; line-height: 1.42; color: #e2e8f0;
          -webkit-mask-image: linear-gradient(#000 60%, transparent); mask-image: linear-gradient(#000 60%, transparent); }
        .cv-spacer { flex: 1; }
        .cv-open { align-self: center; margin-top: 10px; display: flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 999px;
          border: 1px solid rgba(241,214,148,.35); background: rgba(241,214,148,.05); color: #F6E3B4;
          font-family: var(--caps); font-size: 9px; font-weight: 600; letter-spacing: .26em; text-transform: uppercase; transition: background .3s, transform .2s; }
        .cv-open:active { transform: scale(.96); background: rgba(241,214,148,.12); }
        .cv-open :global(svg) { width: 12px; height: 12px; }

        /* ── Tap a reading: everything but the container blurs away, and the container glows softly in the
           reading's own color (--rc), like Your Day's element bar. ── */
        .readings-head, .reading-slot, .empty-slot, .page-navigation { transition: filter .6s ease, opacity .6s ease; }
        /* Everything else sinks into the dark (dim, darkened, lightly blurred), so no white competes with the open reading. */
        .is-viewing .readings-head, .is-viewing .reading-slot, .is-viewing .empty-slot, .is-viewing .page-navigation, .is-viewing .back { filter: blur(3px) brightness(.45) saturate(.6); opacity: .14; }
        .dashboard-card::before { content: ""; position: absolute; inset: -18%; z-index: 0; pointer-events: none; opacity: 0;
          background:
            radial-gradient(55% 45% at 50% 55%, color-mix(in srgb, var(--rc, #fff) 42%, transparent), color-mix(in srgb, var(--rc, #fff) 16%, transparent) 50%, transparent 74%),
            radial-gradient(38% 34% at 28% 30%, color-mix(in srgb, var(--rc, #fff) 30%, transparent), transparent 72%),
            radial-gradient(40% 36% at 74% 74%, color-mix(in srgb, var(--rc, #fff) 34%, transparent), transparent 72%);
          filter: blur(20px) saturate(1.35); transition: opacity .6s ease; }
        .is-viewing .dashboard-card::before { opacity: 1; animation: rcBreath 3.6s ease-in-out infinite; }
        @keyframes rcBreath { 0%, 100% { opacity: .6; transform: scale(.96); } 50% { opacity: 1; transform: scale(1.06); } }
        .is-viewing .dashboard-card { --ol-c: var(--rc);
          box-shadow: 0 0 26px color-mix(in srgb, var(--rc) 22%, transparent), 0 0 70px color-mix(in srgb, var(--rc) 12%, transparent), 0 20px 50px rgba(0,0,0,.4); }
        .is-viewing .cv-date { color: var(--rc); }
        .is-viewing .cv-title { color: var(--rc); text-shadow: 0 0 18px color-mix(in srgb, var(--rc) 40%, transparent), 0 2px 10px rgba(0,0,0,.6); }
        .is-viewing .cv-open { border-color: color-mix(in srgb, var(--rc) 45%, transparent); background: color-mix(in srgb, var(--rc) 8%, transparent); color: var(--rc); }

        /* ── Press and hold a reading: it turns red, and the slider gives way to a red trash button. ── */
        /* Held for deletion: the glow turns red and quickens. */
        .reading-slot.is-held .reading-tile::before { background: radial-gradient(closest-side, rgba(239,68,68,.62), rgba(220,38,38,.22) 58%, transparent); animation-duration: 2.4s; }
        .reading-slot.is-held .tile-icon { color: #fecaca; }
        .reading-slot.is-held .tile-icon > :global(svg) { filter: drop-shadow(0 0 6px rgba(239,68,68,.85)) drop-shadow(0 0 14px rgba(239,68,68,.45)); }
        .reading-slot.is-held .tile-date { color: rgba(254,202,202,.85); }
        @keyframes trashBreath { 0%, 100% { box-shadow: inset 0 1px 0 rgba(255,255,255,.15), 0 0 14px rgba(239,68,68,.45), 0 0 34px rgba(220,38,38,.2), 0 10px 26px rgba(0,0,0,.5); }
          50% { box-shadow: inset 0 1px 0 rgba(255,255,255,.15), 0 0 22px rgba(239,68,68,.65), 0 0 50px rgba(220,38,38,.32), 0 10px 26px rgba(0,0,0,.5); } }
        @keyframes trashIn { from { opacity: 0; transform: scale(.6) rotate(-12deg); } to { opacity: 1; transform: none; } }

        /* Shorter views (Safari's bars, smaller phones): the container gives up room first, then the tiles tighten. */
        @media (max-height: 740px) {
          .reading-grid { grid-auto-rows: 74px; }
        }
        @media (max-height: 620px) {
          .dashboard-page { gap: 10px; }
          .readings-section { gap: 6px; }
          .reading-grid { grid-auto-rows: 64px; }
          .tile-icon > :global(svg) { width: 26px; height: 26px; }
          .tile-icon.is-orb > :global(svg) { width: 30px; height: 30px; }
          .page-navigation { height: 40px; }
          .pg-trash { width: 42px; height: 42px; margin: -21px 0 0 -21px; }
          .cal-title { font-size: 20px; }
          .cal-week { margin-top: 8px; }
          .cal-day { font-size: 15px; }
          .cal-day .n { width: 26px; height: 26px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .reading-tile::before { animation: none; transform: translate(-50%, -50%); }
          .empty-slot span::after { animation: none; }
          .reading-tile, .readings-head, .reading-slot, .empty-slot, .page-navigation, .card-view, .pg-thumb, .pg-trash { transition: none; }
          .tile-ripple, .pg-sparks { display: none; }
          .dashboard-card::after, .cv, .cal, .cal-day.is-key::before, .is-viewing .dashboard-card::before, .pg-slider.flash .pg-thumb,
          .reading-slot.is-opening .tile-icon > :global(svg), .reading-slot.is-opening .reading-tile::before,
          .is-holding .pg-trash, .pg-trash :global(svg) { animation: none; }
        }
      `}</style>
    </main>
  );
}