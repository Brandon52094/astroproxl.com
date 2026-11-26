"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Check, ChevronLeft, Share } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  deleteSavedReading,
  listSavedReadings,
  MAX_SAVED_READINGS,
  type SavedReadingRecord,
} from "@/lib/savedReadingsStore";

/**
 * YOUR DASHBOARD / SAVED READINGS
 *
 *   Your Dashboard   (mic-button fill: dark face, light from above, a soft blue glow from below)
 *     Readings · Ask Anything · Replies
 *     Share — the referral link (friends get 15% off their first purchase)
 *   Saved Readings / Revisit Your Readings   (the hero; blurred guidance text behind it, like Your Day)
 *   8 places a page, 2 × 4   ("outline" cards: clear face, the reading's color as a thin edge; empty places get a gold dot)
 *   ● ○ ○   three gold circles turn the pages (3 pages × 8 = Plus XL's 24)
 *   Settings   (becomes Delete while a reading is held; blurred text behind it at the bottom edge)
 *
 * Tap a reading to open it. Press and hold (550ms) to select it: it greys out and Settings turns into Delete.
 *
 * Used two ways:
 *   • As its own page (the readings route renders <SavedReadingsView />) — black, with a back button.
 *   • As a panel in PagerContainer (<SavedReadingsView embedded />) — no back button, no background of its own
 *     (the pager's sky shows through), and it sizes to the pager slot. Its top lines up with Your Day.
 *
 * The last balance seen is kept on this device (astroproxl:dashboard) so the counts show right away,
 * and are still there after a log out, until the server answers.
 */

const READINGS_PER_PAGE = 8;
const PAGE_COUNT = 3;
const FREE_SLOT_COUNT = 8;
const PLUS_SLOT_COUNT = 16;
const LONG_PRESS_MS = 550;
const NEW_DAYS = 2;
const DASHBOARD_KEY = "astroproxl:dashboard";

type ReferralState = "loading" | "ready" | "error";

interface AccessSummary {
  credits?: number;
  jxlCredits?: number;
  replyCredits?: number;
  readingsCompleted?: number;
  membershipStatus?: string;
  isSubscribed?: boolean;
  membershipPlan?: "plus" | "plus_xl" | null;
  effectiveMembershipPlan?: "plus" | "plus_xl" | null;
  membershipReadingsUsed?: number;
  membershipJxlUsed?: number;
  membershipEntitlements?: {
    readingsPerMonth: number | null;
    jxlPerMonth: number | null;
  };
}

interface SavedReadingsViewProps {
  /** True when rendered inside PagerContainer. */
  embedded?: boolean;
}

/* ── Reading names and colors (the same colors as the reading buttons on Your Day) ── */
const KINDS: Record<string, { title: string; color: string }> = {
  love: { title: "Love", color: "#FDA4AF" },
  money: { title: "Money", color: "#86EFAC" },
  career: { title: "Career", color: "#93C5FD" },
  general: { title: "What’s Coming", color: "#C4B5FD" },
  other: { title: "What’s Coming", color: "#C4B5FD" },
  "ask-anything": { title: "Your Question", color: "#F1D694" },
};

function formatTopic(topic: string) {
  const known = KINDS[topic];
  if (known) return known.title;
  const words = topic.replace(/[_-]+/g, " ").trim();
  return words ? words.replace(/\b\w/g, (c) => c.toUpperCase()) : "Reading";
}

function formatSavedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
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

/* ── The dashboard's glow: one fixed color (the soft blue from the preview), the same for everyone. ── */
const DASH_GLOW = "#60A5FA";

/* ── Blurred text behind the title and the bottom edge. Never readable; today's horoscope if it's cached. ── */
const FALLBACK_VEIL =
  "The Sun lights up the year’s theme: play, risk and the things you make for the joy of making them. With the Moon swelling toward full, energy builds through the afternoon. Start the thing you’ve been circling rather than polishing the plan again. Growth this week comes from returning to an old idea, not chasing a new one. Say yes to one invitation you’d normally decline. By evening, let yourself rest; what you started today keeps working while you sleep.";

function todaysVeilText(): string {
  try {
    const d = new Date();
    const key = `astroproxl:daily-horoscope:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const cached = window.localStorage.getItem(key)?.trim();
    return cached && cached.length > 120 ? cached : FALLBACK_VEIL;
  } catch {
    return FALLBACK_VEIL;
  }
}

function readCachedAccess(): AccessSummary | null {
  try {
    const raw = window.localStorage.getItem(DASHBOARD_KEY);
    return raw ? ((JSON.parse(raw) as { access?: AccessSummary }).access ?? null) : null;
  } catch {
    return null;
  }
}

/* Styles (a plain <style> tag, so @property passes straight through). */
const CSS = `
.srv-panel-no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
.srv-panel-no-scrollbar::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
  .srv {
    --srv-display: var(--font-display, "Cormorant Garamond"), "Cormorant Garamond", Georgia, serif;
    --srv-caps: var(--font-caps, Cinzel), Cinzel, Georgia, serif;
    --srv-gold: rgba(241, 214, 148, 0.9);
    --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
    --swipe-h: 32px;
      position: relative;
    box-sizing: border-box;
    width: 100%;
    max-width: 430px;
    height: 100svh;
    height: 100dvh;
    margin: 0 auto;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    /* Same frame as Your Day: the dashboard's top lines up with the profection card. */
    padding: calc(env(safe-area-inset-top) + 6px + var(--swipe-h)) clamp(14px, 4vw, 18px) calc(env(safe-area-inset-bottom) + 10px);
    background: #000;
    color: #f1f5f9;
    font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  }
  .srv.embedded { height: 100%; background: transparent; }
  @media (max-height: 870px) { .srv { --swipe-h: 28px; } }
  @media (max-height: 560px) { .srv { --swipe-h: 26px; } }
  .srv * { box-sizing: border-box; }
  .srv :where(p, h1, h2) { margin: 0; }
  .srv button { font: inherit; color: inherit; -webkit-tap-highlight-color: transparent; }
  @keyframes srvIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

  .srv-back { position: absolute; z-index: 3; left: 6px; top: calc(env(safe-area-inset-top) + 2px); width: 42px; height: 42px; display: grid; place-items: center;
    border: 0; background: transparent; color: rgba(226, 232, 240, 0.72); cursor: pointer; }
  .srv-back svg { width: 21px; height: 21px; }

  .srv > .srv-dash, .srv > .srv-title, .srv > .srv-window, .srv > .srv-pager, .srv > .srv-foot { position: relative; z-index: 1; }

  /* ── Your Dashboard: the mic button's fill. It grows upward into the space above (for the eyebrow),
     so everything below stays put. ── */
  .srv-dash {
    flex-shrink: 0; margin-top: -18px; padding: 6px 12px 12px; display: flex; flex-direction: column; gap: 10px;
    border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.12);
    background:
      radial-gradient(90% 120% at 50% 130%, color-mix(in srgb, var(--sun-bar) 22%, transparent), transparent 62%) padding-box,
      radial-gradient(circle at 50% -70%, rgba(255, 255, 255, 0.11), transparent 66%) padding-box,
      linear-gradient(145deg, rgba(19, 18, 24, 0.96), rgba(7, 10, 21, 0.97)) padding-box;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 0 1px rgba(255, 239, 195, 0.06), 0 0 18px rgba(218, 183, 104, 0.14),
      0 0 22px color-mix(in srgb, var(--sun-bar) 14%, transparent), 0 16px 38px rgba(0, 0, 0, 0.46);
    animation: srvIn 0.5s var(--ease-out) 0.1s both;
  }
  .srv-eyebrow { margin: 2px 0 -4px !important; text-align: center; font-family: var(--srv-caps); font-size: 8.5px; font-weight: 500; letter-spacing: 0.28em;
    text-transform: uppercase; color: var(--srv-gold); white-space: nowrap; }
  .srv-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: center; height: 46px; }
  .srv-stats > div { min-width: 0; text-align: center; line-height: 1; }
  .srv-stats > div + div { border-left: 1px solid rgba(255, 255, 255, 0.07); }
  .srv-stats strong { display: block; font-family: var(--srv-display); font-size: 20px; font-weight: 500; color: #fff; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .srv-stats .srv-inf { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif; font-weight: 300; font-size: 0.95em; }
  .srv-stats strong small { font-size: 12px; color: rgba(148, 163, 184, 0.85); }
  .srv-stats span { display: block; margin-top: 4px; font-family: var(--srv-caps); font-size: 6.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase;
    color: rgba(148, 163, 184, 0.8); white-space: nowrap; }

  .srv-btn { height: 48px; padding: 0 10px; display: flex; align-items: center; gap: 9px; text-align: left; cursor: pointer;
    border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.1); background: linear-gradient(160deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.015));
    transition: border-color 0.3s ease, transform 0.2s var(--ease-out); }
  .srv-btn:active { transform: scale(0.975); }
  .srv-btn:hover, .srv-btn:focus-visible { outline: none; border-color: rgba(241, 214, 148, 0.45); }
  .srv-btn b { font-family: var(--srv-display); font-size: 16px; font-weight: 600; color: #f8f4e9; white-space: nowrap; }
  .srv-share { width: 86%; align-self: center; min-width: 0; }
  .srv-share-ico { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; color: #f1d694;
    border: 1px solid rgba(241, 214, 148, 0.35); background: radial-gradient(circle at 50% 30%, rgba(241, 214, 148, 0.16), rgba(241, 214, 148, 0.03));
    box-shadow: 0 0 12px rgba(241, 214, 148, 0.12); }
  .srv-share-ico svg { width: 14px; height: 14px; }
  .srv-share-text { min-width: 0; display: flex; flex-direction: column; gap: 3px; line-height: 1; }
  .srv-share-text small { font-family: var(--srv-caps); font-size: 6.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase;
    color: rgba(148, 163, 184, 0.85); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ── The hero: like "Today's Guidance" on Your Day, bigger, over blurred guidance text. ── */
  .srv-title { flex-shrink: 0; margin-top: 26px; text-align: center; isolation: isolate; animation: srvIn 0.5s var(--ease-out) 0.05s both; }
  .srv-title h1 { font-family: var(--srv-display); font-size: 34px; font-weight: 500; line-height: 1.05; letter-spacing: 0.01em; color: #fff;
    text-shadow: 0 2px 5px rgba(0, 0, 0, 0.9), 0 5px 18px rgba(0, 0, 0, 0.72), 0 0 36px rgba(0, 0, 0, 0.55); }
  .srv-title p { margin-top: 6px !important; font-family: var(--srv-caps); font-size: 9.5px; font-weight: 600; letter-spacing: 0.26em; text-transform: uppercase;
    color: var(--srv-gold); text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85), 0 2px 10px rgba(0, 0, 0, 0.6), 0 0 16px rgba(0, 0, 0, 0.5); }
  .srv-veil { position: absolute; z-index: -1; overflow: hidden; pointer-events: none; user-select: none; -webkit-user-select: none; }
  .srv-veil p { margin: 0; text-align: left; font-family: var(--srv-display); font-size: 16.5px; line-height: 1.42; color: #e2e8f0; opacity: 0.26; filter: blur(5px); padding: 0 2px; }
  .srv-title .srv-veil { left: -4px; right: -4px; top: -26px; bottom: -22px;
    -webkit-mask-image: radial-gradient(closest-side, #000 62%, transparent); mask-image: radial-gradient(closest-side, #000 62%, transparent); }
  .srv > .srv-veil.is-bottom { z-index: 0; left: clamp(14px, 4vw, 18px); right: clamp(14px, 4vw, 18px);
    -webkit-mask-image: linear-gradient(transparent, #000 30%, #000 72%, transparent); mask-image: linear-gradient(transparent, #000 30%, #000 72%, transparent); }

  /* ── Readings window: 8 places (2 × 4). On short screens it gets shorter and scrolls by whole rows. ── */
  .srv-window { --card-h: 84px; --gap: 10px; --win-h: calc(4 * var(--card-h) + 3 * var(--gap) + 4px + var(--gap));
    margin: 16px -6px 0; flex: 0 1 auto; height: var(--win-h); min-height: min(var(--win-h), calc(1.6 * var(--card-h))); }
  .srv-scroll { position: absolute; inset: 0; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; scrollbar-width: none;
    padding: 4px 6px var(--gap); scroll-snap-type: y mandatory; scroll-padding: 4px 0 0; }
  .srv-scroll::-webkit-scrollbar { display: none; }
  .srv-scroll.more-below { -webkit-mask-image: linear-gradient(#000 var(--cut, calc(100% - var(--gap))), transparent calc(var(--cut, calc(100% - var(--gap))) + var(--gap)));
    mask-image: linear-gradient(#000 var(--cut, calc(100% - var(--gap))), transparent calc(var(--cut, calc(100% - var(--gap))) + var(--gap))); }
  .srv-scroll.more-above { -webkit-mask-image: linear-gradient(transparent, #000 14px); mask-image: linear-gradient(transparent, #000 14px); }
  .srv-scroll.more-above.more-below {
    -webkit-mask-image: linear-gradient(transparent, #000 14px, #000 var(--cut, calc(100% - var(--gap))), transparent calc(var(--cut, calc(100% - var(--gap))) + var(--gap)));
    mask-image: linear-gradient(transparent, #000 14px, #000 var(--cut, calc(100% - var(--gap))), transparent calc(var(--cut, calc(100% - var(--gap))) + var(--gap))); }
  .srv-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gap); }
  .srv-grid > * { height: var(--card-h); scroll-snap-align: start; }
  @keyframes srvTurn { from { opacity: 0; transform: translateX(calc(var(--pg-dir, 1) * 18px)); } to { opacity: 1; transform: none; } }
  .srv-grid.is-turning { animation: srvTurn 0.4s var(--ease-out); }
  .srv-grid.is-turning .srv-card { animation: none; }

  /* A saved reading: "outline" — clear face, the reading's color as a thin edge; just the name and date, centered. */
  .srv-slot { position: relative; min-width: 0; }
  .srv-card { position: relative; overflow: hidden; width: 100%; height: 100%; padding: 0 10px; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 5px; cursor: pointer; border-radius: 20px; border: 1px solid color-mix(in srgb, var(--t) 50%, transparent);
    background: transparent;
    user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation;
    transition: transform 0.25s var(--ease-out), border-color 0.4s ease, opacity 0.35s ease, filter 0.35s ease;
    animation: srvIn 0.5s var(--ease-out) both; animation-delay: calc(var(--i) * 35ms); }
  .srv-card:active { transform: scale(0.975); }
  .srv-card:focus-visible { outline: none; border-color: var(--t); box-shadow: 0 0 0 1px var(--t); }
  .srv-card-title { font-family: var(--srv-display); font-size: 18px; font-weight: 600; line-height: 1; letter-spacing: 0.01em; color: rgba(236, 240, 246, 0.92); white-space: nowrap; }
  .srv-card-date { font-family: var(--srv-caps); font-size: 8px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(148, 163, 184, 0.8); white-space: nowrap; }
  .srv-card.is-new::after { content: ""; position: absolute; top: 10px; right: 12px; width: 5px; height: 5px; border-radius: 50%; background: var(--t);
    box-shadow: 0 0 6px var(--t), 0 0 12px var(--t); }

  /* Hold to remove: a ring traces the edge (550ms), then the card dims and offers "Remove". */
  @property --srv-rm { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
  .srv-card::before { content: ""; position: absolute; inset: 0; z-index: 2; border-radius: inherit; padding: 1.5px; pointer-events: none;
    background: conic-gradient(from 0deg, rgba(255, 255, 255, 0.9) var(--srv-rm), transparent 0);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude;
    opacity: 0; --srv-rm: 0deg; transition: --srv-rm 0.25s ease, opacity 0.2s ease; }
  .srv-card.is-pressing::before { opacity: 1; --srv-rm: 360deg; transition: --srv-rm 550ms linear, opacity 0.15s ease; }
  /* Held: the card dims to grey and the Settings button turns into Delete. */
  .srv-slot.is-removing .srv-card { filter: grayscale(0.9) brightness(0.6); border-color: rgba(255, 255, 255, 0.28); }
  .srv-slot.is-gone .srv-card { opacity: 0; transform: scale(0.9); }

  /* An open space: a faint frame with a soft gold dot. */
  .srv-empty { position: relative; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.055); display: grid; place-items: center;
    background: radial-gradient(60% 60% at 50% 50%, rgba(255, 255, 255, 0.018), transparent 70%); }
  .srv-empty i { width: 5px; height: 5px; border-radius: 50%; background: #f6e3b4; box-shadow: 0 0 5px #f1d694, 0 0 12px rgba(241, 214, 148, 0.55);
    animation: srvTwinkle 3.6s ease-in-out infinite; animation-delay: calc(var(--i) * -0.45s); }
  @keyframes srvTwinkle { 0%, 100% { opacity: 0.45; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.1); } }

  /* ── Page circles: the gold knob from the JÁNEEL slider, three of them. ── */
  .srv-pager { flex-shrink: 0; display: flex; justify-content: center; gap: 22px; margin-top: 18px; }
  .srv-dot { position: relative; width: 36px; height: 36px; padding: 0; border: 0; background: none; cursor: pointer; touch-action: manipulation; }
  .srv-dot i { position: absolute; left: 7px; top: 7px; width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(242, 215, 156, 0.55); background: rgba(12, 10, 8, 0.7);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.7); transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.45s, border-color 0.45s; }
  .srv-dot i::after { content: ""; position: absolute; inset: 6px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff3d4, #e7b354 65%, #b8863a);
    opacity: 0; transform: scale(0.4); transition: opacity 0.35s ease, transform 0.45s cubic-bezier(0.16, 1, 0.3, 1); }
  .srv-dot.on i { border-color: rgba(242, 215, 156, 0.85); transform: scale(1.12);
    box-shadow: 0 0 0 6px rgba(231, 179, 84, 0.09), 0 0 16px rgba(231, 179, 84, 0.22), 0 6px 16px rgba(0, 0, 0, 0.7); }
  .srv-dot.on i::after { opacity: 1; transform: none; }
  .srv-dot:active i { transform: scale(1.25); }
  .srv-dot:focus-visible { outline: none; }
  .srv-dot:focus-visible i { box-shadow: 0 0 0 2px rgba(242, 215, 156, 0.7), 0 6px 16px rgba(0, 0, 0, 0.7); }

  /* ── Settings: at the bottom, just the word. ── */
  .srv-foot { flex-shrink: 0; margin-top: auto; padding-top: 14px; display: flex; justify-content: center; }
  .srv-settings { width: fit-content; min-width: 132px; padding: 0 26px; justify-content: center; }
  .srv-settings.is-delete { border-color: rgba(254, 202, 202, 0.5); background: linear-gradient(160deg, rgba(127, 29, 29, 0.32), rgba(69, 10, 10, 0.22)); box-shadow: 0 0 16px rgba(248, 113, 113, 0.18); }
  .srv-settings.is-delete b { color: #fecaca; }
  .srv-settings b { transition: color 0.25s ease; }

  .srv-notice { position: fixed; z-index: 20; left: 50%; top: max(58px, calc(env(safe-area-inset-top) + 48px)); transform: translateX(-50%); max-width: calc(100% - 32px);
    padding: 9px 16px; border-radius: 999px; background: rgba(12, 14, 22, 0.94); color: #d8caaa; font-size: 11px; text-align: center; }
  .srv-notice.error { color: #fda4af; }

  /* Shorter screens (Safari's bars, iPhone SE): the window gets shorter; the rest tightens a little. */
  @media (max-height: 700px) {
    .srv-window { --card-h: 74px; --gap: 8px; margin-top: 12px; }
    .srv-dash { padding: 6px 10px 10px; gap: 8px; }
    .srv-stats { height: 42px; }
    .srv-stats strong { font-size: 18px; }
    .srv-btn { height: 44px; }
    .srv-title { margin-top: 18px; }
    .srv-title h1 { font-size: 30px; }
    .srv-pager { margin-top: 12px; }
  }
  @media (max-height: 580px) {
    .srv-window { --card-h: 62px; }
    .srv-card-title { font-size: 16px; }
    .srv-card { gap: 3px; }
    .srv-dash { margin-top: -10px; gap: 7px; }
    .srv-stats { height: 38px; }
    .srv-btn { height: 40px; }
    .srv-share { width: 84%; }
    .srv-share-ico { width: 26px; height: 26px; }
    .srv-title { margin-top: 12px; }
    .srv-title h1 { font-size: 26px; }
    .srv-title p { font-size: 8.5px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .srv-dash, .srv-title, .srv-card, .srv-empty i, .srv-grid.is-turning { animation: none !important; }
    .srv-card, .srv-dot i, .srv-dot i::after { transition: none !important; }
  }
`;

/* ══════════════════════════════════════════════════════════════════ */
export default function SavedReadingsView({ embedded = false }: SavedReadingsViewProps) {
  const router = useRouter();
  const [readings, setReadings] = useState<SavedReadingRecord[]>([]);
  const [access, setAccess] = useState<AccessSummary | null>(null);
  const [referralCode, setReferralCode] = useState("");
  const [referralState, setReferralState] = useState<ReferralState>("loading");
  const [shareDone, setShareDone] = useState<"" | "Shared" | "Link copied">("");
  const [currentPage, setCurrentPage] = useState(0);
  const [turn, setTurn] = useState({ key: 0, dir: 1 });
  const [error, setError] = useState<string | null>(null);
  const [limitNotice, setLimitNotice] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [goneId, setGoneId] = useState<string | null>(null);
  const [pressingId, setPressingId] = useState<string | null>(null);
  const [veilText, setVeilText] = useState(FALLBACK_VEIL);
  const [now, setNow] = useState(0); // set on the client, for the "new" dot

  const rootRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pagerRef = useRef<HTMLElement | null>(null);
  const bottomVeilRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Data ── */
  const refresh = useCallback(async () => {
    try {
      setReadings(await listSavedReadings());
      setError(null);
    } catch {
      setError("Your saved readings could not be opened on this device.");
    }
  }, []);

  const loadReferralCode = useCallback(async () => {
    setReferralState("loading");
    try {
      const response = await fetch("/api/user/referral-code", { cache: "no-store" });
      const data = response.ok ? ((await response.json()) as { code?: string }) : null;
      const code = data?.code?.trim() ?? "";
      if (!code) throw new Error("Referral code unavailable");
      setReferralCode(code);
      setReferralState("ready");
    } catch {
      setReferralCode("");
      setReferralState("error");
    }
  }, []);

  useEffect(() => {
    setNow(Date.now());
    setVeilText(todaysVeilText());
    setLimitNotice(new URLSearchParams(window.location.search).get("limit") === "1");

    // Last balance seen on this device first, then the live one.
    const cached = readCachedAccess();
    if (cached) setAccess(cached);
    void refresh();
    void fetch("/api/user/credits", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: AccessSummary | null) => {
        if (!data) return;
        setAccess(data);
        try { window.localStorage.setItem(DASHBOARD_KEY, JSON.stringify({ access: data, at: new Date().toISOString() })); } catch { /* storage unavailable */ }
      })
      .catch(() => { /* keep the cached balance */ });

    void loadReferralCode();
  }, [loadReferralCode, refresh]);

  useEffect(() => () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
  }, []);

  const capacity = getSavedReadingCapacity(access);
  const pageStart = currentPage * READINGS_PER_PAGE;
  // Every page always has 8 places: readings first, then open spaces, so nothing moves between pages.
  const pageSlots = useMemo(
    () => Array.from({ length: READINGS_PER_PAGE }, (_, index) => readings[pageStart + index] ?? null),
    [pageStart, readings],
  );

  /* ── Balance ── */
  const plan = access?.effectiveMembershipPlan ?? access?.membershipPlan ?? null;
  const isMember = access?.membershipStatus === "active" || access?.isSubscribed === true;
  const readingAllowance = access?.membershipEntitlements?.readingsPerMonth ?? null;
  const jxlAllowance = access?.membershipEntitlements?.jxlPerMonth ?? null;
  const readingRemaining = readingAllowance === null ? null : Math.max(0, readingAllowance - Number(access?.membershipReadingsUsed ?? 0));
  const jxlRemaining = jxlAllowance === null ? null : Math.max(0, jxlAllowance - Number(access?.membershipJxlUsed ?? 0));

  const balance: { value: string; of?: number; label: string }[] = [
    isMember
      ? readingAllowance === null
        ? { value: "∞", label: "Readings" }
        : { value: String(readingRemaining), of: readingAllowance, label: "Readings" }
      : { value: String(access?.credits ?? 0), label: "Readings" },
    isMember
      ? jxlAllowance === null
        ? { value: "∞", label: "Ask Anything" }
        : { value: String(jxlRemaining), of: jxlAllowance, label: "Ask Anything" }
      : { value: String(access?.jxlCredits ?? 0), label: "Ask Anything" },
    { value: String(access?.replyCredits ?? 0), label: "Replies" },
  ];
  const balanceLabel = `${isMember && plan === "plus" ? "This cycle" : "Balance"}: ${balance
    .map((b) => `${b.value}${b.of != null ? ` of ${b.of}` : ""} ${b.label}`)
    .join(", ")}`;

  /* ── Share a discount ── */
  const shareReferral = async () => {
    if (referralState === "error") { void loadReferralCode(); return; }
    if (!referralCode) return;
    const referralUrl = `${window.location.origin}/api/referral/capture?code=${encodeURIComponent(referralCode)}`;
    const shareData = {
      title: "AstroProXL",
      text: "Use my ASTROSHARE link for 15% off your first eligible AstroProXL purchase.",
      url: referralUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareDone("Shared");
      } else {
        await navigator.clipboard.writeText(referralUrl);
        setShareDone("Link copied");
      }
      if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
      shareTimerRef.current = setTimeout(() => setShareDone(""), 1600);
    } catch {
      // Closing the native share sheet is not an error the page needs to surface.
    }
  };
  const shareLine =
    shareDone ||
    (referralState === "loading" ? "Getting your link…" : referralState === "error" ? "Tap to try again" : "Friends get 15% off their first purchase");

  /* ── Tap to open · press and hold to remove ── */
  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    setPressingId(null);
  };

  const beginLongPress = (id: string) => {
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
    setPressingId(id);
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setPressingId(null);
      setRemovingId(id);
      try { navigator.vibrate?.(12); } catch { /* haptics are optional */ }
    }, LONG_PRESS_MS);
  };

  const handleReadingClick = (reading: SavedReadingRecord) => {
    if (longPressTriggeredRef.current) { longPressTriggeredRef.current = false; return; }
    if (removingId) { setRemovingId(null); return; }
    router.push(`/reading/results?saved=${encodeURIComponent(reading.id)}`);
  };

  const removeReading = async (id: string) => {
    setGoneId(id);
    await new Promise((resolve) => setTimeout(resolve, 320));
    try {
      await deleteSavedReading(id);
      setRemovingId(null);
      await refresh();
      setLimitNotice(false);
    } catch {
      setError("That reading could not be removed. Please try again.");
    } finally {
      setGoneId(null);
    }
  };

  // A tap anywhere else, Escape, or turning the page puts a card back.
  useEffect(() => {
    if (!removingId) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.(".srv-slot.is-removing, .srv-settings")) setRemovingId(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setRemovingId(null); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [removingId]);

  /* ── Pages ── */
  const setPage = (nextPage: number) => {
    const next = Math.max(0, Math.min(PAGE_COUNT - 1, nextPage));
    if (next === currentPage) return;
    setRemovingId(null);
    setTurn((t) => ({ key: t.key + 1, dir: next > currentPage ? 1 : -1 }));
    setCurrentPage(next);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    try { navigator.vibrate?.(5); } catch { /* haptics are optional */ }
  };

  /* ── Layout: whole-row fade on short screens, and the bottom veil under the page circles ── */
  const updateFades = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    el.classList.toggle("more-above", el.scrollTop > 4);
    el.classList.toggle("more-below", el.scrollTop < max - 4);
    // Fade from the bottom of the last row that's fully in view, so a part-shown row never peeks past the edge.
    const box = el.getBoundingClientRect();
    let cut = 0;
    el.querySelectorAll(".srv-grid > *").forEach((item) => {
      const r = item.getBoundingClientRect();
      if (r.bottom <= box.bottom + 0.5 && r.bottom > box.top) cut = Math.max(cut, r.bottom - box.top);
    });
    el.style.setProperty("--cut", cut ? `${Math.round(cut)}px` : "");
  }, []);

  const placeBottomVeil = useCallback(() => {
    const root = rootRef.current, pager = pagerRef.current, veil = bottomVeilRef.current;
    if (!root || !pager || !veil) return;
    const from = pager.offsetTop + pager.offsetHeight - 6;
    veil.style.top = `${from}px`;
    veil.style.height = `${Math.max(0, root.clientHeight - from)}px`;
  }, []);

  useEffect(() => {
    const onResize = () => { updateFades(); placeBottomVeil(); };
    onResize();
    const ro = new ResizeObserver(onResize);
    if (rootRef.current) ro.observe(rootRef.current);
    if (scrollRef.current) ro.observe(scrollRef.current);
    return () => ro.disconnect();
  }, [updateFades, placeBottomVeil]);

  useEffect(() => { updateFades(); }, [pageSlots, updateFades]);

  // In the pager: same as Your Day — the pager owns scrolling; hide only this panel's scrollbar and let it fill the slot.
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

  /* ══════════════════════════ Render ══════════════════════════ */
  return (
    <main
      ref={rootRef}
      className={`srv${embedded ? " embedded" : ""}`}
      style={{ "--sun-bar": DASH_GLOW } as CSSProperties}
      aria-label="Your dashboard and saved readings"
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {!embedded && (
        <button type="button" className="srv-back" onClick={() => router.back()} aria-label="Go back">
          <ChevronLeft aria-hidden="true" />
        </button>
      )}

      {/* Blurred text behind the bottom edge (placed under the page circles by placeBottomVeil). */}
      <div ref={bottomVeilRef} className="srv-veil is-bottom" aria-hidden="true"><p>{veilText}</p></div>

      {/* ── Your Dashboard ── */}
      <section className="srv-dash" aria-labelledby="srv-dash-title" data-no-swipe>
        <p className="srv-eyebrow" id="srv-dash-title">Your Dashboard</p>
        <div className="srv-stats" role="group" aria-label={balanceLabel}>
          {balance.map((b) => (
            <div key={b.label} aria-hidden="true">
              <strong>
                {b.value === "∞" ? <span className="srv-inf">∞</span> : b.value}
                {b.of != null && <small> / {b.of}</small>}
              </strong>
              <span>{b.label}</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="srv-btn srv-share"
          onClick={() => void shareReferral()}
          disabled={referralState === "loading"}
          aria-label={referralState === "error" ? "Retry referral link" : "Share your referral link. Friends get 15% off their first purchase."}
        >
          <span className="srv-share-ico">{shareDone ? <Check aria-hidden="true" /> : <Share aria-hidden="true" />}</span>
          <span className="srv-share-text">
            <b>Share</b>
            <small aria-live="polite">{shareLine}</small>
          </span>
        </button>
      </section>

      {/* ── The hero ── */}
      <header className="srv-title">
        <div className="srv-veil" aria-hidden="true"><p>{veilText}</p></div>
        <h1>Saved Readings</h1>
        <p>Revisit Your Readings</p>
      </header>

      {/* ── Readings ── */}
      <div className="srv-window">
        <div ref={scrollRef} className="srv-scroll" data-no-swipe tabIndex={-1} onScroll={() => { updateFades(); if (removingId) setRemovingId(null); }}>
          <div
            key={`${currentPage}-${turn.key}`}
            className={`srv-grid${turn.key ? " is-turning" : ""}`}
            style={{ "--pg-dir": turn.dir } as CSSProperties}
            role="list"
            aria-label={`Page ${currentPage + 1} of ${PAGE_COUNT}. ${Math.min(readings.length, capacity)} of ${capacity} reading spaces used.`}
          >
            {pageSlots.map((reading, index) => {
              if (!reading) {
                return (
                  <div key={`empty-${pageStart + index}`} className="srv-empty" role="listitem" aria-label="Open space" style={{ "--i": index } as CSSProperties}>
                    <i />
                  </div>
                );
              }
              const kind = KINDS[reading.topic];
              const color = kind?.color ?? "#C4B5FD";
              const title = formatTopic(reading.topic);
              const date = formatSavedDate(reading.savedAt);
              const isNew = now > 0 && now - new Date(reading.savedAt).getTime() < NEW_DAYS * 864e5;
              const isRemoving = removingId === reading.id;
              return (
                <div
                  key={reading.id}
                  role="listitem"
                  className={`srv-slot${isRemoving ? " is-removing" : ""}${goneId === reading.id ? " is-gone" : ""}`}
                >
                  <button
                    type="button"
                    data-no-swipe
                    className={`srv-card${isNew ? " is-new" : ""}${pressingId === reading.id ? " is-pressing" : ""}`}
                    style={{ "--t": color, "--i": index } as CSSProperties}
                    onPointerDown={() => beginLongPress(reading.id)}
                    onPointerUp={clearLongPressTimer}
                    onPointerCancel={clearLongPressTimer}
                    onPointerLeave={clearLongPressTimer}
                    onContextMenu={(e) => e.preventDefault()}
                    onClick={() => handleReadingClick(reading)}
                    onKeyDown={(e) => {
                      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); setRemovingId(reading.id); }
                    }}
                    aria-label={`${title} reading from ${date}${isNew ? ", new" : ""}. Press and hold to remove.`}
                  >
                    <span className="srv-card-title">{title}</span>
                    <span className="srv-card-date">{date}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Pages ── */}
      <nav ref={pagerRef} className="srv-pager" aria-label="Pages of readings" data-no-swipe>
        {Array.from({ length: PAGE_COUNT }, (_, i) => {
          const n = readings.slice(i * READINGS_PER_PAGE, (i + 1) * READINGS_PER_PAGE).length;
          return (
            <button
              key={i}
              type="button"
              className={`srv-dot${i === currentPage ? " on" : ""}`}
              onClick={() => setPage(i)}
              aria-label={`Page ${i + 1}, ${n} reading${n === 1 ? "" : "s"}`}
              aria-current={i === currentPage ? "page" : undefined}
            >
              <i />
            </button>
          );
        })}
      </nav>

      {/* ── Settings ── */}
      <div className="srv-foot">
        {/* While a reading is held, Settings becomes Delete for it. */}
        <button
          type="button"
          className={`srv-btn srv-settings${removingId ? " is-delete" : ""}`}
          data-no-swipe
          onClick={() => (removingId ? void removeReading(removingId) : router.push("/chart-data?recalculate=true"))}
          aria-label={removingId ? `Delete the selected ${formatTopic(readings.find((r) => r.id === removingId)?.topic ?? "")} reading` : "Settings"}
        >
          <b>{removingId ? "Delete" : "Settings"}</b>
        </button>
      </div>

      {(limitNotice || error) && (
        <p className={`srv-notice${error ? " error" : ""}`} role={error ? "alert" : "status"}>
          {error ?? `All ${capacity} available spaces are filled. Remove one reading to save another.`}
        </p>
      )}
    </main>
  );
}
