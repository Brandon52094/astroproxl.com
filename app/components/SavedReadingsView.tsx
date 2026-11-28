"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
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
 *   [ 4 × 2 readings ]     (no boxes: each name and date sits over a soft glow of its reading's color that breathes)
 *     ◦           ◦        (42px arrows centered between each pair of readings; they rest faded and softly blurred,
 *                           come into focus when touched, and send a slow soft ripple on every press; pages wrap
 *                           around, so they never switch off)
 *
 * Key dates and the container preview come from the saved reading itself, via @/lib/readingSections — the same
 * code the results page uses, so the calendar here always matches the reading's own "Your Calendar".
 *
 * Tap a reading: it opens in the container, everything else sinks into the dark, and the container glows softly in
 * the reading's own color (like Your Day's element bar). Tap anywhere outside it (or Escape) to come back.
 *
 * Press and hold a reading to delete it: its glow turns red and the right arrow becomes a red trash can.
 * Tap the trash can to remove it; tap anywhere else (or Escape) to keep it.
 *
 to whatever room is left on short screens, so the page never scrolls.
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
  const [flashing, setFlashing] = useState<"prev" | "next" | null>(null);
  const [engaged, setEngaged] = useState({ prev: false, next: false });   // arrows in focus (they rest faded)
  const engageTimersRef = useRef<Record<"prev" | "next", ReturnType<typeof setTimeout> | undefined>>({ prev: undefined, next: undefined });
  const [isPwa, setIsPwa] = useState(false);

  const rootRef = useRef<HTMLElement | null>(null);
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
    try { navigator.vibrate?.(5); } catch { /* haptics are optional */ }
  };

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

  /* ── Pages ── */
  // Pages wrap around, so both arrows always work.
  // Touching an arrow brings it into focus; it settles back 2s after the last touch.
  const engage = useCallback((side: "prev" | "next") => {
    setEngaged((e) => (e[side] ? e : { ...e, [side]: true }));
    clearTimeout(engageTimersRef.current[side]);
    engageTimersRef.current[side] = setTimeout(() => setEngaged((e) => ({ ...e, [side]: false })), 2000);
  }, []);
  useEffect(() => {
    const timers = engageTimersRef.current;
    return () => { clearTimeout(timers.prev); clearTimeout(timers.next); };
  }, []);

  const setPage = (nextPage: number, side: "prev" | "next") => {
    if (dismissTapRef.current) { dismissTapRef.current = false; return; }
    setFlashing(null);
    requestAnimationFrame(() => setFlashing(side)); // restart the pulse on quick repeat taps
    try { navigator.vibrate?.(6); } catch { /* haptics are optional */ }
    setSelectedReadingId(null);
    setCurrentPage((nextPage + PAGE_COUNT) % PAGE_COUNT);
  };

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

  const renderCalendar = () => {
    if (!today) return null;
    const first = new Date(today.getFullYear(), today.getMonth() + calOffset, 1);
    const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const month = first.toLocaleDateString("en-US", { month: "long" });
    const todayKey = dayKey(today);
    return (
      <div className="cal">
        <div className="cal-head">
          <p className="cal-title">{month}<small>{first.getFullYear()}</small></p>
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
          {Array.from({ length: first.getDay() }, (_, i) => <span key={`pad-${i}`} className="cal-day" aria-hidden="true" />)}
          {Array.from({ length: daysIn }, (_, i) => {
            const d = i + 1;
            const k = dayKey(new Date(first.getFullYear(), first.getMonth(), d));
            const hits = keyDays.get(k);
            const cls = `cal-day${k < todayKey ? " is-past" : ""}${k === todayKey ? " is-today" : ""}${hits ? " is-key" : ""}`;
            if (!hits) return <span key={k} className={cls}><span className="n">{d}</span></span>;
            const label = hits.map((h) => titleCase(formatTopic(h.topic))).join(" and ");
            return (
              <button
                key={k}
                type="button"
                data-no-swipe
                className={cls}
                style={{ "--c": topicColor(hits[0].topic), "--c2": topicColor((hits[1] ?? hits[0]).topic), "--kd": `${-(d % 5) * 0.6}s` } as CSSProperties}
                aria-label={`${month} ${d}: a key date in your ${label} reading`}
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
    );
  };

  const onNext = () => {
    if (held) {   // the red trash can
      if (dismissTapRef.current) { dismissTapRef.current = false; return; }
      setFlashing("next");
      void removeReading(held.id);
      return;
    }
    setPage(currentPage + 1, "next");
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
    <main ref={rootRef} className={`dashboard-page${embedded ? " embedded" : ""}${isPwa ? " is-pwa" : ""}${shown ? " is-viewing" : ""}`}
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
          ) : (
            renderCalendar()
          )}
        </div>
      </section>

      {(limitNotice || error) && (
        <p className={`notice ${error ? "error" : ""}`} role={error ? "alert" : "status"}>
          {error ?? `All ${capacity} available spaces are filled. Remove one reading to save another.`}
        </p>
      )}

      <section className="readings-section" aria-label="Saved readings">
        <div className="readings-head">
          <h2 className="rh-title">My Readings</h2>
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
                <div className={`reading-slot${isHeld ? " is-held" : ""}`} key={reading.id} data-delete-zone={isHeld ? "" : undefined}>
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
                    aria-label={isHeld ? `${formatTopic(reading.topic)} held for deletion` : `Show the ${formatTopic(reading.topic)} reading from ${formatSavedDate(reading.savedAt)}. Press and hold to delete.`}
                  >
                    <span className="tile-topic">{formatTopic(reading.topic)}</span>
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
          <button
            type="button"
            data-no-swipe
            className={`pg-arrow prev${engaged.prev ? " is-engaged" : ""}${flashing === "prev" ? " flash" : ""}`}
            onPointerDown={() => engage("prev")}
            onFocus={() => engage("prev")}
            onAnimationEnd={(e) => { if (e.pseudoElement === "::before") setFlashing(null); }}
            onClick={() => { engage("prev"); setPage(currentPage - 1, "prev"); }}
            aria-label="Previous readings page"
          >
            <ChevronLeft strokeWidth={1.7} aria-hidden="true" />
          </button>
          <button
            type="button"
            data-no-swipe
            className={`pg-arrow next${held ? " is-trash" : ""}${engaged.next ? " is-engaged" : ""}${flashing === "next" ? " flash" : ""}`}
            data-delete-zone
            onPointerDown={() => engage("next")}
            onFocus={() => engage("next")}
            onAnimationEnd={(e) => { if (e.pseudoElement === "::before") setFlashing(null); }}
            onClick={() => { engage("next"); onNext(); }}
            aria-label={held ? `Delete the ${formatTopic(held.topic)} reading from ${formatSavedDate(held.savedAt)}` : "Next readings page"}
          >
            {held ? <Trash2 key="trash" strokeWidth={1.7} aria-hidden="true" /> : <ChevronRight key="next" strokeWidth={1.7} aria-hidden="true" />}
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
        .reading-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: 72px; gap: clamp(7px, 2vw, 11px); }
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
        .tile-topic { max-width: 100%; font-family: var(--display); font-size: clamp(9px, 2.5vw, 11.5px); font-weight: 600; line-height: 1.15; letter-spacing: .08em; text-align: center; text-transform: uppercase; overflow-wrap: anywhere;
          color: color-mix(in srgb, var(--t, #fff) 40%, #fff); text-shadow: 0 0 10px color-mix(in srgb, var(--t, #fff) 60%, transparent), 0 1px 3px rgba(0,0,0,.6); }
        .tile-date { color: rgba(203,213,225,.62); font-size: clamp(7px, 1.9vw, 9px); letter-spacing: .05em; text-transform: uppercase; text-shadow: 0 1px 3px rgba(0,0,0,.6); }
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
        /* Two halves with the tiles' gap: each arrow sits centered under a pair of tiles (between 1–2 and between 3–4). */
        .page-navigation { position: relative; height: 42px; display: grid; grid-template-columns: 1fr 1fr; column-gap: clamp(7px, 2vw, 11px); align-items: center; justify-items: center; }
        .page-navigation > :first-child { grid-column: 1; grid-row: 1; }
        .page-navigation > :last-child { grid-column: 2; grid-row: 1; }

        /* ── Page arrows: 42px circles, the container's face, glowing white. A soft ring pulses out on every press. ── */
        .pg-arrow {
          position: relative;
          width: 42px; height: 42px; padding: 0; border-radius: 50%;
          opacity: .38; filter: blur(1px);
          display: grid; place-items: center; color: #fff; touch-action: manipulation;
          border: 1px solid rgba(255,255,255,.55);
          background:
            radial-gradient(100% 80% at 0% 0%, rgba(218,183,104,.26), transparent 62%),
            linear-gradient(170deg, rgba(10,13,28,.97), rgba(5,8,20,.97));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.2), 0 0 14px rgba(255,255,255,.3), 0 0 34px rgba(210,225,255,.16), 0 10px 26px rgba(0,0,0,.5);
          transition: opacity .9s cubic-bezier(.4,0,.2,1), filter .9s cubic-bezier(.4,0,.2,1), transform .35s cubic-bezier(.22,1,.36,1), box-shadow .35s ease;
        }
        /* At rest the arrows sit faded and softly blurred (like Your Day's); the one being touched comes into focus,
           then settles back 2s after the last touch. The red trash can always stays in focus. */
        .pg-arrow.is-engaged, .pg-arrow.is-trash, .pg-arrow:focus-visible { opacity: 1; filter: none; transition-duration: .25s, .25s, .35s, .35s; }
        .pg-arrow :global(svg) { width: 22px; height: 22px; filter: drop-shadow(0 0 4px rgba(255,255,255,.75)) drop-shadow(0 0 10px rgba(210,225,255,.4)); }
        .pg-arrow.prev :global(svg) { margin-right: 2px; }
        .pg-arrow.next :global(svg) { margin-left: 2px; }
        .pg-arrow:active { transform: scale(.93); box-shadow: inset 0 1px 0 rgba(255,255,255,.25), 0 0 20px rgba(255,255,255,.45), 0 0 44px rgba(210,225,255,.22), 0 10px 26px rgba(0,0,0,.5); }
        .pg-arrow:focus-visible { outline: none; box-shadow: 0 0 0 2px #fff, 0 0 22px rgba(255,255,255,.4), 0 10px 26px rgba(0,0,0,.5); }
        /* The press: a slow, soft ripple — one faint ring drifts outward and fades, a fainter one follows. */
        .pg-arrow::before, .pg-arrow::after { content: ""; position: absolute; inset: -1px; border-radius: 50%; pointer-events: none; opacity: 0;
          border: 1px solid rgba(255,255,255,.55); box-shadow: 0 0 12px rgba(255,255,255,.2); }
        @keyframes pgRipple { from { opacity: .42; transform: scale(1); } to { opacity: 0; transform: scale(1.85); } }
        @keyframes pgRipple2 { from { opacity: .24; transform: scale(1); } to { opacity: 0; transform: scale(1.7); } }
        .pg-arrow.flash::after { animation: pgRipple 2.4s cubic-bezier(.3,.55,.4,1) forwards; }
        .pg-arrow.flash::before { animation: pgRipple2 2.6s cubic-bezier(.3,.55,.4,1) .45s forwards; }

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
        .cv { flex: 1; min-height: 0; display: flex; flex-direction: column; animation: cvIn .5s cubic-bezier(.22,1,.36,1); }
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

        /* ── Press and hold a reading: it turns red, and the right arrow becomes a red trash can. ── */
        /* Held for deletion: the glow turns red and quickens. */
        .reading-slot.is-held .reading-tile::before { background: radial-gradient(closest-side, rgba(239,68,68,.62), rgba(220,38,38,.22) 58%, transparent); animation-duration: 2.4s; }
        .reading-slot.is-held .tile-topic { color: #fecaca; text-shadow: 0 0 12px rgba(239,68,68,.8), 0 1px 3px rgba(0,0,0,.6); }
        .reading-slot.is-held .tile-date { color: rgba(254,202,202,.85); }
        @keyframes heldBreath { 0%, 100% { box-shadow: 0 0 14px rgba(239,68,68,.4), 0 0 32px rgba(220,38,38,.18); } 50% { box-shadow: 0 0 22px rgba(239,68,68,.6), 0 0 50px rgba(220,38,38,.3); } }
        .pg-arrow.is-trash { color: #fee2e2; border-color: rgba(248,113,113,.75);
          background: radial-gradient(90% 90% at 50% 110%, rgba(248,113,113,.45), transparent 70%), linear-gradient(155deg, rgba(127,29,29,.85), rgba(60,8,12,.95));
          animation: trashBreath 2.4s ease-in-out infinite; }
        .pg-arrow.is-trash :global(svg) { width: 19px; height: 19px; margin: 0; filter: drop-shadow(0 0 4px rgba(254,202,202,.7)) drop-shadow(0 0 10px rgba(239,68,68,.5)); animation: trashIn .45s cubic-bezier(.22,1,.36,1); }
        .pg-arrow.is-trash::after, .pg-arrow.is-trash::before { border-color: rgba(248,113,113,.65); box-shadow: 0 0 12px rgba(239,68,68,.3); }
        @keyframes trashBreath { 0%, 100% { box-shadow: inset 0 1px 0 rgba(255,255,255,.15), 0 0 14px rgba(239,68,68,.45), 0 0 34px rgba(220,38,38,.2), 0 10px 26px rgba(0,0,0,.5); }
          50% { box-shadow: inset 0 1px 0 rgba(255,255,255,.15), 0 0 22px rgba(239,68,68,.65), 0 0 50px rgba(220,38,38,.32), 0 10px 26px rgba(0,0,0,.5); } }
        @keyframes trashIn { from { opacity: 0; transform: scale(.6) rotate(-12deg); } to { opacity: 1; transform: none; } }

        /* Shorter views (Safari's bars, smaller phones): the container gives up room first, then the tiles tighten. */
        @media (max-height: 740px) {
          .reading-grid { grid-auto-rows: 64px; }
        }
        @media (max-height: 620px) {
          .dashboard-page { gap: 10px; }
          .readings-section { gap: 6px; }
          .reading-grid { grid-auto-rows: 56px; }
          .page-navigation { height: 36px; }
          .pg-arrow { width: 36px; height: 36px; }
          .pg-arrow :global(svg) { width: 19px; height: 19px; }
          .cal-title { font-size: 20px; }
          .cal-week { margin-top: 8px; }
          .cal-day { font-size: 15px; }
          .cal-day .n { width: 26px; height: 26px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .reading-tile::before { animation: none; transform: translate(-50%, -50%); }
          .empty-slot span::after { animation: none; }
          .reading-tile, .pg-arrow, .readings-head, .reading-slot, .empty-slot, .page-navigation, .card-view { transition: none; }
          .pg-arrow.flash::after, .pg-arrow.flash::before, .dashboard-card::after, .cv, .cal, .cal-day.is-key::before, .reading-slot.is-held .reading-tile, .is-viewing .dashboard-card::before,
          .pg-arrow.is-trash, .pg-arrow.is-trash :global(svg) { animation: none; }
        }
      `}</style>
    </main>
  );
}