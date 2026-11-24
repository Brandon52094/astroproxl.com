"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Heart, Wallet, Briefcase, Mic, ChevronLeft, ChevronRight } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import {
  loadChart,
  saveChart,
  isChartFresh,
  saveIntake,
  clearIntake,
  clearReading,
} from "@/lib/chartStore";
import { PRICING } from "@/lib/paywallConfig";
import ReadingAmbience from "@/app/components/ReadingAmbience";
import type { ThemeKey } from "@/app/components/ReadingAmbience";

/**
 * YOUR DAY — the daily panel and the reading intake in one screen.
 * Replaces ReadingIntakeScreen: every reading path it offered starts here.
 *
 *   Profection Year + Today's Sky   (hero: profection tint, hairline edge, Big Three glow)
 *   Today's Guidance                (tap to reveal; title settles top-center; 7-line window, line 7 fades,
 *                                    the rest scrolls; seals itself again after GUIDANCE_RESEAL_MS untouched)
 *   Select Reading                  (28px, same size as the profection sign)
 *   ‹  Mic · Love · Money · Career · What's Coming  ›   (+ mic toggle under it; arrows glow until first used)
 *   Element bar                     (one merged color ribbon with a soft glow, open ends; no title)
 *   Big Three                       (hugs the bottom in the browser; roomier in the installed app)
 *
 * Reading buttons: press and hold 3s. Everything else fades to dark, the reading's
 * symbols (ReadingAmbience) arrive at 50%, the button flashes, the screen fades to
 * black and /reading/preparing takes over (or Stripe checkout if there are no credits).
 *
 * Mic (Ask Anything): turn the toggle on, then press and hold to speak; swipe up to
 * cancel. Everything else fades; the button pulses with the voice, and each word sends out a
 * fresh wave in the button's shape (a line + fading trail layers, gold / Sun color, sparkles)
 * that glides to the screen edges, a little quicker with livelier speech. Browser speech recognition first, Whisper as backup.
 *
 * The panel fills its pager slot (height: 100%) and never scrolls the page.
 */

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

declare global {
  interface Window {
    ttq?: { track: (event: string, params?: Record<string, unknown>) => void };
  }
}

/* ── Types ─────────────────────────────────────────────────────────── */
interface UserStatus {
  credits: number;
  jxlCredits?: number;
  isSubscribed: boolean;
  membershipJxlUsed?: number;
  membershipEntitlements?: { jxlPerMonth: number | null; addContext: boolean } | null;
}

interface DailyPanelProps {
  userStatus?: UserStatus | null;
  /** True while this panel is the one on screen. Going offscreen turns the mic off and cancels any hold. */
  isActive?: boolean;
  /** Opens Credits with intent (second tap on a locked feature). */
  onOpenCredits?: (intent: "context" | "voice") => void;
  dailyHoroscope?: string | null;
  onOpenHoroscope?: () => Promise<string | null | void> | string | null | void;
  /** Accepted so the pager can pass the same props it gave ReadingIntakeScreen; not shown here. */
  onSwipeLeft?: () => void;
}

interface NatalPlacement { name: string; sign: string; degree: string; house?: number }
interface UpgradeChartPoint { name: string; sign: string; degree: string; house: string }
interface TransitPlanet { name: string; sign: string; degree: string; isRetrograde: boolean; house?: number }
interface MoonPhaseData {
  phaseName: string;
  illuminationPercent: number;
  nextEventName: "New Moon" | "Full Moon";
  daysUntilNextEvent: number;
  moonSign: string;
  moonDegree: string;
}
interface ProfectionData { profectionYear: number; age: number; activatedSign: string; activatedHouse?: number; timeLord: string }
type LockedFeature = "context" | "voice";

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

/* ── Timing ────────────────────────────────────────────────────────── */
// Press-and-hold: a short grace period keeps taps from darkening the screen, then
// one continuous fade over the full hold. Haptic ticks mark each second.
const HOLD_ARM_MS = 220;
const HOLD_STEP_MS = 1000;
const HOLD_TOTAL_MS = 3000;
// The reading's themed symbols arrive halfway through the hold.
const HOLD_AMBIENCE_MS = Math.round(HOLD_TOTAL_MS * 0.5);
const ASK_MIN_HOLD_MS = 450;
const ENGAGE_MS = 2000; // arrows / toggle stay in focus this long after a touch
// Today's Guidance: the reveal takes its time (the text comes into focus top to bottom).
const GUIDANCE_UNSEAL_MS = 650;   // title has mostly moved; the text starts to resolve
const GUIDANCE_OPEN_MS = 2600;    // reveal finished
const GUIDANCE_RESEAL_MS = 30000; // open this long without a touch or scroll → back to "Tap to reveal"
const GUIDANCE_RETURN_MS = 1700;  // the text blurs back and the seal fades in
const ARROWS_USED_KEY = "astroproxl:arrows-used";

/* ── Voice waves ───────────────────────────────────────────────────── */
// Every time the user speaks (each word / syllable onset) the button sends out a fresh wave in its
// own shape: a leading line followed by trailing layers, each fainter than the one before (the
// preparing screen's layered orb, turned into a travelling wave). Waves glide out and ease as they go.
// Voice mechanics are Reading Intake's: auto-gain loudness, fast attack / slower release, and brighter
// speech = a little more pace. Values below were tuned in the wave tuner.
const WAVE_TUNE = {
  travelSec: 5.7,      // seconds for a wave to reach the screen edge at a calm pace
  minGap: 310,         // ms between fresh waves (at most ~3 a second)
  glide: 1.6,          // how much a wave eases as it travels (1 = steady speed)
  fade: 1.2,           // how quickly a wave fades on its way out
  trailLayers: 5,      // trailing layers behind the lead
  trailStart: 0.17,    // brightness of the first trailing layer
  trailFalloff: 0.74,  // each next layer = previous × this
  gapBase: 11,         // trail layer thickness near the button (px)
  gapGrow: 21,         // extra thickness by the screen edge (px)
  leadBright: 0.2,     // brightness of the leading line
  lineWidth: 2,        // leading line thickness (px)
  glowSize: 0.7,       // size of the glow in front
  glowStrength: 0,     // strength of the glow in front (0 = off)
  whiten: 0.2,         // how white-hot the leading line is (0 = pure color)
  onset: 0.15,         // rise in the voice that counts as a new word (lower = more waves)
  paceMin: 0.85,       // travel speed multiplier for calm speech
  paceMax: 1.3,        // travel speed multiplier for lively speech
  sparkles: 1.5,       // sparkle amount (0 = none)
  colors: "alternate" as "alternate" | "gold" | "theme",
};
const VOICE = {
  attack: 0.45,        // Reading Intake's settings
  release: 0.12,
  noiseGate: 0.012,
  gold: [236, 201, 128] as [number, number, number],
  maxSparks: 90,
};

/* ── Readings ──────────────────────────────────────────────────────── */
function CrystalBall({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="10" r="7" />
      <path d="M8.4 15.9 7 19.5h10l-1.4-3.6" />
      <path d="M5.5 19.5h13" />
      <path d="M8.6 7.6a3.8 3.8 0 0 1 2.4-1.9" />
      <path d="m14 9.2.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5Z" />
    </svg>
  );
}

type AreaId = "love" | "money" | "career" | "other";
interface Area {
  id: AreaId;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  defaultQuestion: string;
  colors: { bg: string; border: string; glow: string; text: string };
}
const AREAS: Area[] = [
  {
    id: "love",
    title: "Love",
    icon: Heart,
    description: "Relationships, romance, or emotional patterns",
    defaultQuestion: "What is coming for me in love over the next 30–45 days?",
    colors: { bg: "rgba(131, 24, 67, 0.18)", border: "rgba(251, 113, 133, 0.78)", glow: "rgba(244, 114, 182, 0.20)", text: "#FDA4AF" },
  },
  {
    id: "money",
    title: "Money",
    icon: Wallet,
    description: "Income, stability, opportunities, and financial timing",
    defaultQuestion: "What is coming for me with money over the next 30–45 days?",
    colors: { bg: "rgba(20, 83, 45, 0.22)", border: "rgba(52, 211, 153, 0.74)", glow: "rgba(34, 197, 94, 0.22)", text: "#86EFAC" },
  },
  {
    id: "career",
    title: "Career",
    icon: Briefcase,
    description: "Work, recognition, direction, and next steps",
    defaultQuestion: "What is coming for me in my career over the next 30–45 days?",
    colors: { bg: "rgba(30, 58, 138, 0.22)", border: "rgba(147, 197, 253, 0.76)", glow: "rgba(59, 130, 246, 0.22)", text: "#93C5FD" },
  },
  {
    id: "other",
    title: "What’s Coming",
    icon: CrystalBall,
    description: "What to expect in the next 30–45 days.",
    defaultQuestion: "What is coming for me in the next 30–45 days?",
    colors: { bg: "rgba(49, 46, 129, 0.22)", border: "rgba(139, 92, 246, 0.76)", glow: "rgba(139, 92, 246, 0.22)", text: "#C4B5FD" },
  },
];
// Slide 0 is the mic; slides 1–4 are the readings.
const SLIDE_COUNT = AREAS.length + 1;

/* ── Vocabulary ────────────────────────────────────────────────────── */
// U+FE0E forces text presentation so iOS never swaps these for emoji.
const T = "︎";
const GLYPHS: Record<string, string> = {
  Sun: `☉${T}`, Moon: `☽${T}`, Mercury: `☿${T}`, Venus: `♀${T}`, Mars: `♂${T}`,
  Jupiter: `♃${T}`, Saturn: `♄${T}`, Uranus: `♅${T}`, Neptune: `♆${T}`, Pluto: `♇${T}`,
};
const SIGN_RULERS: Record<string, string> = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon",
  Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Mars",
  Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter",
};
// Keep element balance anchored to the original natal set (no angles or calculated points).
const ELEMENT_BALANCE_ORDER = ["Sun", "Moon", "Ascendant", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];

type Element = "Fire" | "Earth" | "Air" | "Water";
const SIGN_ELEMENTS: Record<string, Element> = {
  Aries: "Fire", Leo: "Fire", Sagittarius: "Fire",
  Taurus: "Earth", Virgo: "Earth", Capricorn: "Earth",
  Gemini: "Air", Libra: "Air", Aquarius: "Air",
  Cancer: "Water", Scorpio: "Water", Pisces: "Water",
};
const ELEMENT_COLORS: Record<Element, { border: string; glow: string; text: string; bar: string }> = {
  Fire:  { border: "rgba(249, 115, 22, 0.75)", glow: "rgba(239, 68, 68, 0.28)",  text: "#FDBA74", bar: "#F97316" },
  Earth: { border: "rgba(52, 211, 153, 0.65)", glow: "rgba(16, 185, 129, 0.24)", text: "#6EE7B7", bar: "#34D399" },
  Air:   { border: "rgba(186, 230, 253, 0.60)", glow: "rgba(125, 211, 252, 0.22)", text: "#BAE6FD", bar: "#7DD3FC" },
  Water: { border: "rgba(96, 165, 250, 0.70)",  glow: "rgba(59, 130, 246, 0.26)",  text: "#93C5FD", bar: "#60A5FA" },
};
const ELEMENT_ORDER: Element[] = ["Fire", "Earth", "Air", "Water"];
const NEUTRAL = "#94A3B8";
// Without a chart the Big Three accents fall back to gold / indigo / teal.
const FALLBACK = { sun: "#DAB768", sunText: "#F1D694", moon: "#818CF8", rise: "#5EEAD4", prof: "#DAB768" };
// Hero glow strength (Reading Intake used 0.65).
const HERO_GLOW = 0.55;

const elementOf = (sign?: string): Element | null => (sign ? SIGN_ELEMENTS[sign] ?? null : null);
const colorsOf = (sign?: string) => { const el = elementOf(sign); return el ? ELEMENT_COLORS[el] : null; };
const ordinal = (n: number) => { const s = ["th", "st", "nd", "rd"]; const v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`; };
const rulerPhrase = (planet: string) => (planet === "Sun" || planet === "Moon" ? `the ${planet}` : planet);
function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex: string, alpha: number) {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r},${g},${b},${+alpha.toFixed(3)})`;
}

// Element bar: each element holds its own color through the middle of its share and blends into its
// neighbours across the boundaries, so the bar reads as one merged ribbon.
function elementGradient(counts: Record<Element, number>): string {
  const present = ELEMENT_ORDER.filter((el) => counts[el] > 0);
  const total = present.reduce((n, el) => n + counts[el], 0) || 1;
  let at = 0;
  const stops = present.flatMap((el) => {
    const w = (counts[el] / total) * 100, c = ELEMENT_COLORS[el].bar, start = at;
    at += w;
    return [`${c} ${(start + w * 0.3).toFixed(1)}%`, `${c} ${(start + w * 0.7).toFixed(1)}%`];
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function localDayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
const horoscopeKey = () => `astroproxl:daily-horoscope:${localDayKey()}`;

function nextEventLine(m: MoonPhaseData): string {
  const d = Math.round(m.daysUntilNextEvent);
  if (d <= 0) return `${m.nextEventName} today`;
  return `${m.nextEventName} in ${d} ${d === 1 ? "day" : "days"}`;
}

function triggerHaptic(pattern: number | number[] = 12) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  } catch {
    // Haptics are optional.
  }
}

function trackTtq(event: string, params?: Record<string, unknown>) {
  try {
    if (typeof window !== "undefined" && window.ttq) window.ttq.track(event, params);
  } catch {
    // silent
  }
}

function readStatus(d: Record<string, unknown>): UserStatus {
  return {
    credits: Number(d.credits ?? 0),
    jxlCredits: Number(d.jxlCredits ?? 0),
    isSubscribed: d.isSubscribed === true,
    membershipJxlUsed: Number(d.membershipJxlUsed ?? 0),
    membershipEntitlements: (d.membershipEntitlements as UserStatus["membershipEntitlements"]) ?? null,
  };
}

/* ── Moon drawn from the real illumination percent ── */
function MoonDisc({ illumination, waxing, size = 46 }: { illumination: number; waxing: boolean; size?: number }) {
  const gradientId = useId().replace(/:/g, "");
  const f = Math.min(1, Math.max(0, illumination / 100));
  const r = 46, c = 50;
  const top = `${c} ${c - r}`, bottom = `${c} ${c + r}`;
  const rx = Math.abs(1 - 2 * f) * r;
  const outerSweep = waxing ? 1 : 0;
  const terminatorSweep = f >= 0.5 ? (waxing ? 1 : 0) : (waxing ? 0 : 1);
  const litPath = `M ${top} A ${r} ${r} 0 0 ${outerSweep} ${bottom} A ${rx} ${r} 0 0 ${terminatorSweep} ${top}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id={`dpMoon${gradientId}`} cx="38%" cy="34%" r="75%">
          <stop offset="0%" stopColor="#F1EFF7" />
          <stop offset="55%" stopColor="#C9C7D6" />
          <stop offset="100%" stopColor="#9A98AC" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={r} fill="#151A30" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
      {f > 0.995 ? (
        <circle cx={c} cy={c} r={r} fill={`url(#dpMoon${gradientId})`} />
      ) : f > 0.005 ? (
        <path d={litPath} fill={`url(#dpMoon${gradientId})`} />
      ) : null}
      <circle cx="38" cy="40" r="7" fill="rgba(0,0,0,0.10)" />
      <circle cx="60" cy="58" r="5" fill="rgba(0,0,0,0.09)" />
      <circle cx="52" cy="30" r="3.5" fill="rgba(0,0,0,0.08)" />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
export default function DailyPanel({
  userStatus: propUserStatus,
  isActive = true,
  onOpenCredits,
  dailyHoroscope: horoscopeProp,
  onOpenHoroscope,
}: DailyPanelProps) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();

  /* ── Chart ── */
  const [chartStatus, setChartStatus] = useState<"checking" | "ready" | "recalculating" | "error">("checking");
  const [natal, setNatal] = useState<NatalPlacement[]>([]);
  const [transits, setTransits] = useState<TransitPlanet[]>([]);
  const [moonPhase, setMoonPhase] = useState<MoonPhaseData | null>(null);
  const [profection, setProfection] = useState<ProfectionData | null>(null);
  const [chartRead, setChartRead] = useState(false);

  /* ── Horoscope ── */
  const [horoscope, setHoroscope] = useState<string | null>(null);
  const [horoscopeLoading, setHoroscopeLoading] = useState(false);
  const [horoscopeError, setHoroscopeError] = useState<string | null>(null);
  const [dateLine, setDateLine] = useState(""); // built on the client only
  // sealed → (tap) → waiting (still loading) → revealing → open. Opened once, it stays open for the day.
  const [guidance, setGuidance] = useState<"sealed" | "waiting" | "revealing" | "open">("sealed");
  const [unsealed, setUnsealed] = useState(false);
  const [returning, setReturning] = useState(false); // sealing itself again after being open a while
  const horoSectionRef = useRef<HTMLElement | null>(null);
  const headTitleRef = useRef<HTMLHeadingElement | null>(null);
  const headDateRef = useRef<HTMLParagraphElement | null>(null);
  const sealTitleRef = useRef<HTMLSpanElement | null>(null);
  const sealDateRef = useRef<HTMLSpanElement | null>(null);
  const guidanceTimersRef = useRef<number[]>([]);
  const resealTimerRef = useRef<number | null>(null);
  const horoBodyRef = useRef<HTMLParagraphElement | null>(null);

  /* ── Credits ── */
  const [userStatus, setUserStatus] = useState<UserStatus | null>(propUserStatus || null);
  useEffect(() => { if (propUserStatus) setUserStatus(propUserStatus); }, [propUserStatus]);
  const [lockedFeaturePrompt, setLockedFeaturePrompt] = useState<LockedFeature | null>(null);
  const lockedFeatureAttemptsRef = useRef<Record<LockedFeature, number>>({ context: 0, voice: 0 });

  /* ── Carousel (mic + readings) ── */
  const [slide, setSlide] = useState(0);
  const [prevSlide, setPrevSlide] = useState<number | null>(null);
  const [slideDir, setSlideDir] = useState(1);
  const [engaged, setEngaged] = useState({ prev: false, next: false, toggle: false });
  const [tapped, setTapped] = useState({ prev: false, next: false });
  // The arrows glow until the user has used them once (remembered on this device).
  const [arrowsHint, setArrowsHint] = useState(false);
  useEffect(() => {
    try { setArrowsHint(window.localStorage.getItem(ARROWS_USED_KEY) !== "1"); } catch { setArrowsHint(true); }
  }, []);
  const markArrowsUsed = useCallback(() => {
    setArrowsHint(false);
    try { window.localStorage.setItem(ARROWS_USED_KEY, "1"); } catch { /* storage unavailable */ }
  }, []);
  const engageTimersRef = useRef<Record<string, number>>({});

  /* ── Reading hold ── */
  const [selectedArea, setSelectedArea] = useState<AreaId | null>(null);
  const [holdingArea, setHoldingArea] = useState<AreaId | null>(null);
  const [teaseArea, setTeaseArea] = useState<AreaId | null>(null);
  const [sentArea, setSentArea] = useState<AreaId | null>(null);
  const [ambienceArea, setAmbienceArea] = useState<AreaId | null>(null);
  const [readingFade, setReadingFade] = useState(false);
  const [isCreatingReading, setIsCreatingReading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => { setPortalReady(true); }, []);
  // Installed app (PWA): older iOS reports it only through navigator.standalone.
  const [isPwa, setIsPwa] = useState(false);
  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    setIsPwa(nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true);
  }, []);
  const holdTimersRef = useRef<number[]>([]);
  const armTimerRef = useRef<number | null>(null);
  const pressStartRef = useRef(0);
  const sendingRef = useRef(false);

  /* ── Voice ── */
  const [micEnabled, setMicEnabled] = useState(false);
  const [micConnecting, setMicConnecting] = useState(false);
  const [micNudge, setMicNudge] = useState(false);
  const [askHolding, setAskHolding] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [isTranscribingAsk, setIsTranscribingAsk] = useState(false);
  const [voiceJourneyActive, setVoiceJourneyActive] = useState(false);
  const [voiceNavigating, setVoiceNavigating] = useState(false);
  const askHoldingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const askHoldStartRef = useRef(0);
  const askPointerStartYRef = useRef(0);
  const askCancelledRef = useRef(false);
  const meterStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const wavesRafRef = useRef<number | null>(null);
  const recognitionRef = useRef<AskSpeechRecognition | null>(null);
  const transcriptRef = useRef("");      // everything heard so far this hold (never shown)
  const speechBaseRef = useRef("");      // text kept across an automatic restart
  const speechStoppingRef = useRef(false);
  const didSubmitVoiceRef = useRef(false);
  const lastSpeechAtRef = useRef(0);      // when the browser last heard words (fallback for the pulse)

  /* ── DOM ── */
  const rootRef = useRef<HTMLDivElement | null>(null);
  const askBoxRef = useRef<HTMLDivElement | null>(null);
  const wavesCanvasRef = useRef<HTMLCanvasElement | null>(null);

  /* ════════════════ Chart ════════════════ */

  // Make sure a fresh chart exists (recalculate from the saved birth data if needed).
  useEffect(() => {
    let cancelled = false;
    async function ensureChart() {
      if (isChartFresh()) { setChartStatus("ready"); return; }
      try {
        const response = await fetch("/api/user/get-chart");
        const data = await response.json();
        if (cancelled) return;
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
        if (cancelled) return;
        if (!calcResponse.ok || !calcData.success) { setChartStatus("error"); return; }
        saveChart({
          birthDate: data.chart.birthDate,
          birthTime: data.chart.birthTime,
          birthPlace: data.chart.birthPlace,
          lat: data.chart.lat,
          lng: data.chart.lng,
          timezone: data.chart.timezone,
          currentLat: data.chart.currentLat ?? undefined,
          currentLng: data.chart.currentLng ?? undefined,
          currentPlace: data.chart.currentPlace ?? "",
          currentTimezone: data.chart.currentTimezone ?? "",
          chartData: calcData,
        });
        setChartStatus("ready");
      } catch {
        if (!cancelled) setChartStatus("error");
      }
    }
    void ensureChart();
    return () => { cancelled = true; };
  }, [router]);

  // Read the stored chart once it's ready.
  useEffect(() => {
    if (chartStatus !== "ready") return;
    try {
      const data = loadChart()?.chartData as unknown as {
        tropical?: { planets?: NatalPlacement[] };
        upgradeChartPoints?: UpgradeChartPoint[];
        transits?: TransitPlanet[];
        moonPhase?: MoonPhaseData;
        profection?: ProfectionData;
      } | undefined;
      if (!data) return;
      const upgrade = data.upgradeChartPoints ?? [];
      setNatal(
        upgrade.length
          ? upgrade.map((p) => ({ name: p.name, sign: p.sign, degree: p.degree, house: p.house ? Number(p.house) : undefined }))
          : data.tropical?.planets ?? [],
      );
      setTransits(data.transits ?? []);
      setMoonPhase(data.moonPhase ?? null);
      setProfection(data.profection ?? null);
    } catch {
      setChartStatus("error");
    } finally {
      setChartRead(true);
    }
  }, [chartStatus]);

  /* ════════════════ Horoscope ════════════════ */

  useEffect(() => {
    setDateLine(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }));
    try {
      const cached = window.localStorage.getItem(horoscopeKey());
      if (cached) setHoroscope(cached);
    } catch { /* storage unavailable */ }
  }, []);

  // A horoscope passed in from the parent wins and is cached for the day.
  useEffect(() => {
    const h = horoscopeProp?.trim();
    if (!h) return;
    setHoroscope(h);
    try { window.localStorage.setItem(horoscopeKey(), h); } catch { /* storage unavailable */ }
  }, [horoscopeProp]);

  const fetchHoroscope = useCallback(async () => {
    if (horoscopeLoading) return;
    setHoroscopeLoading(true);
    setHoroscopeError(null);
    try {
      let result: string | null | void;
      if (onOpenHoroscope) {
        result = await onOpenHoroscope();
      } else {
        const chartData = loadChart()?.chartData as unknown as {
          tropical?: { planets?: unknown[] };
          transits?: unknown[];
          transitAspects?: unknown[];
          profection?: unknown;
          moonPhase?: unknown;
        } | undefined;
        if (!chartData?.tropical?.planets?.length) throw new Error("Your chart is still loading. Please try again.");
        const response = await fetch("/api/daily-horoscope", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            localDate: localDayKey(),
            tropicalPlanets: chartData.tropical.planets,
            currentTransits: chartData.transits ?? [],
            transitAspects: chartData.transitAspects ?? [],
            profection: chartData.profection ?? null,
            moonPhase: chartData.moonPhase ?? null,
          }),
        });
        const payload = (await response.json().catch(() => null)) as { horoscope?: string; error?: string } | null;
        if (!response.ok) throw new Error(payload?.error || "Today’s horoscope could not be prepared.");
        result = payload?.horoscope ?? null;
      }
      if (typeof result === "string" && result.trim()) {
        const h = result.trim();
        setHoroscope(h);
        try { window.localStorage.setItem(horoscopeKey(), h); } catch { /* storage unavailable */ }
      } else if (!onOpenHoroscope) {
        throw new Error("Today’s horoscope returned without a message. Please try again.");
      }
    } catch (error) {
      setHoroscopeError(error instanceof Error ? error.message : "Today’s horoscope could not be prepared.");
    } finally {
      setHoroscopeLoading(false);
    }
  }, [horoscopeLoading, onOpenHoroscope]);

  // Load quietly in the background once the panel is on screen (no time limit, so a slower
  // guidance engine can take as long as it needs); the reveal waits for it.
  useEffect(() => {
    if (!isActive || chartStatus !== "ready" || horoscope || horoscopeLoading || horoscopeError) return;
    if (!natal.length) return;
    void fetchHoroscope();
  }, [isActive, chartStatus, horoscope, horoscopeLoading, horoscopeError, natal.length, fetchHoroscope]);

  /* ── Today's Guidance: tap to reveal ── */
  useEffect(() => {
    const timers = guidanceTimersRef.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      if (resealTimerRef.current) window.clearTimeout(resealTimerRef.current);
    };
  }, []);

  // Back to "Tap to reveal": the text blurs back, the heading fades, the centered seal fades in.
  const resealGuidance = useCallback(() => {
    if (resealTimerRef.current) { window.clearTimeout(resealTimerRef.current); resealTimerRef.current = null; }
    guidanceTimersRef.current.forEach((id) => window.clearTimeout(id));
    guidanceTimersRef.current = [];
    const reduce = !!shouldReduceMotion;
    setReturning(!reduce);
    setUnsealed(false);
    setGuidance("sealed");
    guidanceTimersRef.current.push(window.setTimeout(() => {
      if (horoBodyRef.current) horoBodyRef.current.scrollTop = 0;
      setReturning(false);
    }, reduce ? 0 : GUIDANCE_RETURN_MS));
  }, [shouldReduceMotion]);

  // While open, any touch or scroll on the guidance restarts the clock, so it never closes mid-read.
  const armReseal = useCallback(() => {
    if (resealTimerRef.current) window.clearTimeout(resealTimerRef.current);
    resealTimerRef.current = window.setTimeout(resealGuidance, GUIDANCE_RESEAL_MS);
  }, [resealGuidance]);
  useEffect(() => {
    if (guidance === "open") armReseal();
    else if (resealTimerRef.current) { window.clearTimeout(resealTimerRef.current); resealTimerRef.current = null; }
  }, [guidance, armReseal]);
  const onGuidanceActivity = useCallback(() => { if (guidance === "open") armReseal(); }, [guidance, armReseal]);
  // Going offscreen closes it right away (no animation), so the next visit starts sealed.
  useEffect(() => { if (!isActive && guidance === "open") resealGuidance(); }, [isActive, guidance, resealGuidance]);

  const startReveal = useCallback(() => {
    const section = horoSectionRef.current;
    // Glide the centered title + date to their top-left spots (measured from the real ones).
    const textBox = (el: HTMLElement | null) => {
      if (!el) return null;
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect();
    };
    const st = sealTitleRef.current?.getBoundingClientRect(), sd = sealDateRef.current?.getBoundingClientRect();
    const rt = textBox(headTitleRef.current), rd = textBox(headDateRef.current);
    if (section && st && sd && rt && rd && headTitleRef.current && headDateRef.current && sealTitleRef.current && sealDateRef.current) {
      const fs = (el: HTMLElement) => parseFloat(getComputedStyle(el).fontSize) || 1;
      section.style.setProperty("--tx", `${rt.left - st.left}px`);
      section.style.setProperty("--ty", `${rt.top - st.top}px`);
      section.style.setProperty("--ts", String(fs(headTitleRef.current) / fs(sealTitleRef.current)));
      section.style.setProperty("--dx", `${rd.left - sd.left}px`);
      section.style.setProperty("--dy", `${rd.top - sd.top}px`);
      section.style.setProperty("--ds", String(fs(headDateRef.current) / fs(sealDateRef.current)));
    }
    setReturning(false);
    setGuidance("revealing");
    triggerHaptic(8);
    const reduce = !!shouldReduceMotion;
    guidanceTimersRef.current.push(
      window.setTimeout(() => setUnsealed(true), reduce ? 0 : GUIDANCE_UNSEAL_MS),
      window.setTimeout(() => setGuidance("open"), reduce ? 50 : GUIDANCE_OPEN_MS),
    );
  }, [shouldReduceMotion]);

  const tapSeal = useCallback(() => {
    if (guidance === "revealing" || guidance === "open") return;
    if (horoscope) { startReveal(); return; }
    // Not ready yet: wait as long as it takes (and retry if the last try failed).
    setGuidance("waiting");
    if (horoscopeError && !horoscopeLoading) void fetchHoroscope();
  }, [guidance, horoscope, horoscopeError, horoscopeLoading, fetchHoroscope, startReveal]);

  // Arrived while the user was waiting → reveal.
  useEffect(() => {
    if (guidance === "waiting" && horoscope) startReveal();
  }, [guidance, horoscope, startReveal]);

  /* ════════════════ Credits ════════════════ */

  const fetchInFlight = useRef(false);
  const fetchStatus = useCallback(async () => {
    if (fetchInFlight.current) return;
    fetchInFlight.current = true;
    try {
      const response = await fetch("/api/user/credits");
      const data = await response.json();
      setUserStatus(readStatus(data));
    } catch { /* keep the last known status */ }
    finally { window.setTimeout(() => { fetchInFlight.current = false; }, 2000); }
  }, []);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  // Coming back from checkout in another tab: refresh a few times while the webhook lands.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      void fetchStatus();
      window.setTimeout(() => void fetchStatus(), 2000);
      window.setTimeout(() => void fetchStatus(), 5000);
      window.setTimeout(() => void fetchStatus(), 10000);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchStatus]);

  const jxlAllowance = userStatus?.membershipEntitlements?.jxlPerMonth ?? null;
  const hasIncludedVoiceReading =
    userStatus?.isSubscribed === true &&
    (jxlAllowance === null || Number(userStatus?.membershipJxlUsed ?? 0) < jxlAllowance);
  const hasPurchasedVoiceReading = Number(userStatus?.jxlCredits ?? 0) > 0;
  const hasVoiceReadingAccess = hasIncludedVoiceReading || hasPurchasedVoiceReading;

  // First attempt explains what's needed; the second opens Credits with intent.
  const handleLockedFeature = useCallback((feature: LockedFeature) => {
    const nextAttempt = lockedFeatureAttemptsRef.current[feature] + 1;
    lockedFeatureAttemptsRef.current[feature] = nextAttempt;
    if (nextAttempt < 2) {
      setLockedFeaturePrompt(feature);
      window.setTimeout(() => setLockedFeaturePrompt((current) => (current === feature ? null : current)), 3200);
      return;
    }
    lockedFeatureAttemptsRef.current[feature] = 0;
    setLockedFeaturePrompt(null);
    onOpenCredits?.(feature);
  }, [onOpenCredits]);

  /* ════════════════ Arrows / toggle focus ════════════════ */

  // Only the control being touched comes into focus, then it settles back.
  const engage = useCallback((key: "prev" | "next" | "toggle", ms = ENGAGE_MS) => {
    setEngaged((e) => (e[key] ? e : { ...e, [key]: true }));
    window.clearTimeout(engageTimersRef.current[key]);
    engageTimersRef.current[key] = window.setTimeout(() => setEngaged((e) => ({ ...e, [key]: false })), ms);
  }, []);
  const flashArrow = useCallback((key: "prev" | "next") => {
    setTapped((t) => ({ ...t, [key]: true }));
    window.clearTimeout(engageTimersRef.current[`tap-${key}`]);
    engageTimersRef.current[`tap-${key}`] = window.setTimeout(() => setTapped((t) => ({ ...t, [key]: false })), 160);
  }, []);
  useEffect(() => {
    const timers = engageTimersRef.current;
    return () => Object.values(timers).forEach((id) => window.clearTimeout(id));
  }, []);
  // Once the mic is on, let the knob finish sliding, then the toggle settles back to faded + blurred.
  useEffect(() => { if (micEnabled) engage("toggle", 450); }, [micEnabled, engage]);

  /* ════════════════ Voice ════════════════ */

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
    } catch { /* already stopped */ }
  }, []);

  const stopAskRecorder = useCallback((discard = false) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (discard) askCancelledRef.current = true;
    try { if (recorder.state !== "inactive") recorder.stop(); } catch { /* already stopped */ }
  }, []);

  const stopWaves = useCallback(() => {
    if (wavesRafRef.current != null) {
      cancelAnimationFrame(wavesRafRef.current);
      wavesRafRef.current = null;
    }
    try { analyserRef.current?.disconnect(); } catch { /* ignore */ }
    analyserRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    const canvas = wavesCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    rootRef.current?.style.setProperty("--lvl", "0");
  }, []);

  const disconnectMicrophone = useCallback(() => {
    stopSpeechRecognition();
    stopAskRecorder(true);
    stopWaves();
    if (meterStreamRef.current) {
      meterStreamRef.current.getTracks().forEach((track) => { try { track.stop(); } catch { /* ignore */ } });
      meterStreamRef.current = null;
    }
    askHoldingRef.current = false;
    setAskHolding(false);
    setMicEnabled(false);
    setMicConnecting(false);
  }, [stopWaves, stopAskRecorder, stopSpeechRecognition]);

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
      meterStreamRef.current?.getTracks().forEach((track) => { try { track.stop(); } catch { /* ignore */ } });
      meterStreamRef.current = stream;
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (meterStreamRef.current !== stream) return;
          meterStreamRef.current = null;
          stopSpeechRecognition();
          stopAskRecorder(true);
          stopWaves();
          askHoldingRef.current = false;
          setAskHolding(false);
          setMicEnabled(false);
        };
      });
      setMicEnabled(true);
    } catch {
      setAskError("Microphone access was not enabled.");
      setMicEnabled(false);
    } finally {
      setMicConnecting(false);
    }
  }, [micConnecting, micEnabled, stopWaves, stopAskRecorder, stopSpeechRecognition]);

  const toggleMicrophone = useCallback(() => {
    if (micEnabled) { disconnectMicrophone(); return; }
    void enableMicrophone();
  }, [disconnectMicrophone, enableMicrophone, micEnabled]);

  // The toggle shakes (and the phone buzzes) to say "turn me on first".
  const nudgeMicToggle = useCallback(() => {
    setMicNudge(false);
    window.requestAnimationFrame(() => setMicNudge(true));
    engage("toggle");
    triggerHaptic([10, 40, 10]);
  }, [engage]);

  // iOS only lets an AudioContext run if it's created (or resumed) during a tap.
  const primeAnalyser = useCallback((stream: MediaStream) => {
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

  // Sun color for the waves (alternates with gold). Kept in a ref so the loop reads the latest.
  const sunWaveRgbRef = useRef<[number, number, number]>(rgbOf(FALLBACK.sun));

  const startWaves = useCallback(() => {
    const root = rootRef.current, canvas = wavesCanvasRef.current, box = askBoxRef.current;
    if (!root || !canvas || !box || !askHoldingRef.current) return;
    const c2d = canvas.getContext("2d");
    if (!c2d) return;

    const analyser = analyserRef.current;
    void audioCtxRef.current?.resume?.().catch(() => {});

    const T = WAVE_TUNE;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pr = root.getBoundingClientRect(), br = box.getBoundingClientRect();
    const W = pr.width, H = pr.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const bx = br.left - pr.left, by = br.top - pr.top, bw = br.width, bh = br.height;
    const cx = bx + bw / 2, cy = by + bh / 2;
    const reach = Math.hypot(Math.max(bx, W - bx - bw), Math.max(by, H - by - bh)) + 40;
    const timeData = analyser ? new Uint8Array(analyser.fftSize) : null;
    const freq = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    type RGB = [number, number, number];
    type Wave = { x: number; strength: number; glow: number; rgb: RGB };
    type Spark = { x: number; y: number; vx: number; vy: number; born: number; life: number; size: number; tw: number; rgb: RGB };
    const waves: Wave[] = [], sparks: Spark[] = [];
    let level = 0, bright = 0, peak = 0.06, pace = 1, armed = true, floor = 0, peakSince = 0, flip = 0, silentFrames = 0;
    let last = performance.now(), lastWave = -1e9;

    const rgbaOf = ([R, G, B]: RGB, a: number) => `rgba(${R},${G},${B},${Math.max(0, a)})`;
    const toWhite = (c: RGB, k: number): RGB => [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k].map(Math.round) as RGB;
    const roundRectSupported = typeof (c2d as unknown as { roundRect?: unknown }).roundRect === "function";
    // The button's own shape, grown by d on every side (corners round out as it grows).
    const shape = (d: number) => {
      const x = bx - d, y = by - d, w = bw + 2 * d, h = bh + 2 * d, r = Math.min(20 + d, w / 2, h / 2);
      if (roundRectSupported) { c2d.roundRect(x, y, w, h, r); return; }
      c2d.moveTo(x + r, y);
      c2d.arcTo(x + w, y, x + w, y + h, r); c2d.arcTo(x + w, y + h, x, y + h, r);
      c2d.arcTo(x, y + h, x, y, r); c2d.arcTo(x, y, x + w, y, r); c2d.closePath();
    };
    const onShape = (d: number, th: number): [number, number] => {   // a point on the wave, for sparkles
      const a = bw / 2 + d, b = bh / 2 + d, c = Math.cos(th), s = Math.sin(th), k = 2 / 5;
      return [cx + a * Math.sign(c) * Math.pow(Math.abs(c), k), cy + b * Math.sign(s) * Math.pow(Math.abs(s), k)];
    };
    const star = (x: number, y: number, r: number) => {
      c2d.beginPath();
      c2d.moveTo(x, y - r);
      c2d.quadraticCurveTo(x, y, x + r, y); c2d.quadraticCurveTo(x, y, x, y + r);
      c2d.quadraticCurveTo(x, y, x - r, y); c2d.quadraticCurveTo(x, y, x, y - r);
      c2d.fill();
    };

    const frame = (now: number) => {
      if (!askHoldingRef.current) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // ── Voice in (Reading Intake mechanics) ──
      let target = 0, brightTarget = 0.3, rms = 0;
      if (analyser && timeData && freq) {
        analyser.getByteTimeDomainData(timeData);
        let sum = 0;
        for (let i = 0; i < timeData.length; i++) { const v = (timeData[i] - 128) / 128; sum += v * v; }
        rms = Math.sqrt(sum / timeData.length);
        analyser.getByteFrequencyData(freq);
        const n = freq.length, split = Math.floor(n * 0.06), top = Math.floor(n * 0.35);
        let low = 0, high = 0;
        for (let i = 2; i < split; i++) low += freq[i];
        for (let i = split; i < top; i++) high += freq[i];
        brightTarget = low + high > 0 ? Math.min(1, (high / (low + high)) * 1.6) : 0;
      }
      if (rms < 0.002) {
        // Digital silence: on some phones speech recognition takes the mic. If words are
        // still arriving, keep the waves coming with them.
        silentFrames += 1;
        const speaking = now - lastSpeechAtRef.current < 700;
        target = (silentFrames > 30 || !analyser) && speaking
          ? 0.45 + 0.4 * Math.abs(Math.sin(now / 110)) * (0.6 + Math.random() * 0.4)
          : 0;
      } else {
        silentFrames = 0;
        peak = Math.max(rms, peak * 0.996, 0.02);                       // auto-gain: quiet voices still move it
        target = rms < VOICE.noiseGate ? 0 : Math.pow(Math.min(1, rms / peak), 0.75);
      }
      level += (target - level) * (target > level ? VOICE.attack : VOICE.release);
      bright += (brightTarget - bright) * 0.08;
      const paceTarget = T.paceMin + (T.paceMax - T.paceMin) * Math.min(1, level * 0.65 + bright * 0.45);
      pace += (paceTarget - pace) * (1 - Math.exp(-dt / 0.9));         // eased, never jumps
      root.style.setProperty("--lvl", level.toFixed(3));

      // ── Speaking → a fresh wave (onsets found relative to the voice's own dips) ──
      if (armed) {
        floor = Math.min(floor, level);
        if (level > 0.3 && level - floor > T.onset && now - lastWave > T.minGap) {
          const rgb: RGB = T.colors === "gold" ? VOICE.gold : T.colors === "theme" ? sunWaveRgbRef.current
            : flip++ % 2 ? sunWaveRgbRef.current : VOICE.gold;
          waves.push({ x: 0, strength: 0.45 + level * 0.55, glow: 0.6 + bright * 0.6, rgb });
          armed = false; peakSince = level; lastWave = now;
        }
      } else {
        peakSince = Math.max(peakSince, level);
        if (level < peakSince - 0.12) { armed = true; floor = level; }
      }

      c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      c2d.clearRect(0, 0, W, H);
      c2d.globalCompositeOperation = "lighter";
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i];
        w.x += (dt * pace) / T.travelSec;                                 // 0 at the button → 1 off screen
        if (w.x >= 1) { waves.splice(i, 1); continue; }
        const e = 1 - Math.pow(1 - w.x, T.glide);                         // glides out, eases as it travels
        const d = 2 + e * reach;
        const a = w.strength * Math.min(1, w.x / 0.05) * Math.pow(1 - w.x, T.fade);
        const gap = T.gapBase + T.gapGrow * e;                            // the trail spreads as it grows

        // Trailing layers behind the lead, each lighter.
        for (let k = 0; k < T.trailLayers; k++) {
          const dOut = d - k * gap, dIn = Math.max(0, d - (k + 1) * gap);
          if (dOut <= 0) break;
          c2d.beginPath(); shape(dOut); shape(dIn);
          c2d.fillStyle = rgbaOf(w.rgb, a * T.trailStart * Math.pow(T.trailFalloff, k));
          c2d.fill("evenodd");
        }
        // The leading line.
        const lead = toWhite(w.rgb, T.whiten), la = a * T.leadBright;
        c2d.beginPath(); shape(d + 1);
        if (T.glowSize > 0 && T.glowStrength > 0) {
          c2d.shadowBlur = (14 + 18 * w.glow) * T.glowSize; c2d.shadowColor = rgbaOf(w.rgb, la);
          c2d.strokeStyle = rgbaOf(w.rgb, la * T.glowStrength); c2d.lineWidth = 6 * T.glowSize; c2d.stroke();
        }
        c2d.shadowBlur = 6; c2d.shadowColor = rgbaOf(lead, la);
        c2d.strokeStyle = rgbaOf(lead, la); c2d.lineWidth = T.lineWidth; c2d.stroke();
        c2d.shadowBlur = 0;

        // Sparkles shed from the wave, more when the voice is louder.
        if (sparks.length < VOICE.maxSparks * T.sparkles && Math.random() < dt * (5 + 18 * level) * a * T.sparkles) {
          const th = Math.random() * Math.PI * 2, [px, py] = onShape(d, th), sp = 6 + 14 * Math.random(), roll = Math.random();
          sparks.push({
            x: px, y: py, vx: Math.cos(th) * sp, vy: Math.sin(th) * sp - 4, born: now, life: 900 + Math.random() * 900,
            size: 1.2 + Math.random() * 2, tw: Math.random() * 6.28,
            rgb: roll < 0.6 ? [255, 230, 170] : roll < 0.85 ? [255, 255, 255] : w.rgb,
          });
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i], age = (now - p.born) / p.life;
        if (age >= 1) { sparks.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; p.vy *= 0.985;
        const alpha = Math.sin(age * Math.PI) * (0.55 + 0.45 * Math.sin(p.tw + now / 90));
        c2d.fillStyle = rgbaOf(p.rgb, alpha * 0.35); star(p.x, p.y, p.size * 2.6);
        c2d.fillStyle = rgbaOf(p.rgb, alpha); star(p.x, p.y, p.size);
      }
      c2d.globalCompositeOperation = "source-over";
      wavesRafRef.current = requestAnimationFrame(frame);
    };

    if (shouldReduceMotion) return; // Reduce Motion: no waves; the fade still happens.
    wavesRafRef.current = requestAnimationFrame(frame);
  }, [shouldReduceMotion]);

  const submitAskAnything = useCallback((transcript: string) => {
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
  }, [router]);

  const transcribeAskAudio = useCallback(async (blob: Blob) => {
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
      const response = await fetch("/api/jxl/transcribe", { method: "POST", body: form });
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
  }, [submitAskAnything]);

  // Must run synchronously inside the press handler so browsers allow it.
  const startSpeechRecognition = useCallback((): boolean => {
    const SR = getSpeechRecognition();
    if (!SR) return false;
    let rec: AskSpeechRecognition;
    try { rec = new SR(); } catch { return false; }
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      lastSpeechAtRef.current = performance.now();
      let heard = "";
      for (let i = 0; i < event.results.length; i++) heard += " " + event.results[i][0].transcript;
      transcriptRef.current = (speechBaseRef.current + " " + heard).replace(/\s+/g, " ").trim();
    };
    rec.onerror = (event) => {
      // Blocked or failing: stop quietly. The backup recording still has the audio.
      if (event.error !== "no-speech" && event.error !== "aborted") speechStoppingRef.current = true;
    };
    rec.onend = () => {
      // Some browsers end recognition after a pause even mid-hold; pick it back up.
      if (askHoldingRef.current && !speechStoppingRef.current && recognitionRef.current === rec) {
        speechBaseRef.current = transcriptRef.current;
        try { rec.start(); return; } catch { /* the recording backup covers the rest */ }
      }
      if (recognitionRef.current === rec) recognitionRef.current = null;
    };
    try { rec.start(); } catch { return false; }
    speechStoppingRef.current = false;
    recognitionRef.current = rec;
    return true;
  }, []);

  const startAskHold = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);

    if (!hasVoiceReadingAccess) { handleLockedFeature("voice"); return; }
    if (isTranscribingAsk || sendingRef.current) return;
    if (!micEnabled) { nudgeMicToggle(); return; }

    const stream = meterStreamRef.current;
    if (!stream) { setAskError("Microphone access isn't available right now."); return; }

    setAskError(null);
    askPointerStartYRef.current = e.clientY;
    askCancelledRef.current = false;
    audioChunksRef.current = [];
    transcriptRef.current = "";
    speechBaseRef.current = "";
    didSubmitVoiceRef.current = false;
    stopSpeechRecognition();
    lastSpeechAtRef.current = 0;

    // Analyser for the waves: created during the press so iOS lets it run.
    primeAnalyser(stream);

    // 1) Browser speech recognition, started right away so the first words are caught.
    const speechStarted = startSpeechRecognition();

    // 2) Backup recording for Whisper.
    let recorder: MediaRecorder | null = null;
    if (typeof MediaRecorder !== "undefined") {
      const preferredType = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      try {
        recorder = preferredType ? new MediaRecorder(stream, { mimeType: preferredType }) : new MediaRecorder(stream);
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
      rec.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
      rec.onerror = () => {
        // The backup failed; speech recognition (if running) can still carry the hold.
        if (mediaRecorderRef.current === rec) mediaRecorderRef.current = null;
        if (!recognitionRef.current) {
          askCancelledRef.current = true;
          askHoldingRef.current = false;
          setAskHolding(false);
          setVoiceJourneyActive(false);
          setVoiceNavigating(false);
          stopWaves();
          setAskError("Voice recording was interrupted. Try again.");
        }
      };
      rec.onstop = () => {
        if (mediaRecorderRef.current === rec) mediaRecorderRef.current = null;
        const cancelled = askCancelledRef.current;
        askCancelledRef.current = false;
        const mimeType =
          rec.mimeType ||
          (audioChunksRef.current[0] instanceof Blob ? (audioChunksRef.current[0] as Blob).type : "") ||
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
    triggerHaptic();

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

    // Two frames: let the "voice-on" layout settle before measuring the button.
    requestAnimationFrame(() => requestAnimationFrame(() => startWaves()));
  }, [
    handleLockedFeature, hasVoiceReadingAccess, isTranscribingAsk, micEnabled, nudgeMicToggle,
    primeAnalyser, startWaves, startSpeechRecognition, stopWaves, stopSpeechRecognition, transcribeAskAudio,
  ]);

  const cancelAskHold = useCallback(() => {
    if (!askHoldingRef.current) return;
    askCancelledRef.current = true;
    askHoldingRef.current = false;
    setAskHolding(false);
    setVoiceJourneyActive(false);
    setVoiceNavigating(false);
    setAskError(null);
    stopWaves();
    stopSpeechRecognition();
    stopAskRecorder(true);
    triggerHaptic();
  }, [stopWaves, stopAskRecorder, stopSpeechRecognition]);

  const moveAskHold = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!askHoldingRef.current || askCancelledRef.current) return;
    if (askPointerStartYRef.current - e.clientY >= 56) cancelAskHold(); // swipe up to cancel
  }, [cancelAskHold]);

  const endAskHold = useCallback(() => {
    if (askCancelledRef.current || !askHoldingRef.current) return;
    const elapsed = Date.now() - askHoldStartRef.current;
    askHoldingRef.current = false;
    setAskHolding(false);
    triggerHaptic();
    stopWaves();

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
      // The recorder's onstop sends the full recording to Whisper.
      stopAskRecorder(false);
      return;
    }
    setVoiceJourneyActive(false);
    setVoiceNavigating(false);
    setAskError("We didn't catch that. Hold the button and try again.");
  }, [stopWaves, stopAskRecorder, stopSpeechRecognition, submitAskAnything]);

  // Turn the mic off when the page is hidden or left.
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") disconnectMicrophone(); };
    const onPageHide = () => disconnectMicrophone();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      disconnectMicrophone();
    };
  }, [disconnectMicrophone]);

  // Returning from the back/forward cache: blur whatever was focused so the mic
  // button's animated border doesn't repaint incorrectly on iOS Safari.
  useEffect(() => {
    const reset = () => {
      if (document.visibilityState !== "visible") return;
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    };
    document.addEventListener("visibilitychange", reset);
    window.addEventListener("pageshow", reset);
    return () => {
      document.removeEventListener("visibilitychange", reset);
      window.removeEventListener("pageshow", reset);
    };
  }, []);

  // Error / prompt lines clear themselves after a moment.
  useEffect(() => {
    if (!askError) return;
    const id = window.setTimeout(() => setAskError(null), 4200);
    return () => window.clearTimeout(id);
  }, [askError]);

  /* ════════════════ Readings: press and hold ════════════════ */

  const canBegin = chartStatus === "ready" && !isCreatingReading;
  const canBeginRef = useRef(canBegin);
  useEffect(() => { canBeginRef.current = canBegin; }, [canBegin]);

  const clearHoldTimers = useCallback(() => {
    holdTimersRef.current.forEach((id) => window.clearTimeout(id));
    holdTimersRef.current = [];
    if (armTimerRef.current) {
      window.clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
  }, []);

  // Back to the resting state (release, checkout, errors, going offscreen).
  const resetHoldVisuals = useCallback(() => {
    clearHoldTimers();
    sendingRef.current = false;
    setAmbienceArea(null);
    setHoldingArea(null);
    setSentArea(null);
    setReadingFade(false);
    setSelectedArea(null);
  }, [clearHoldTimers]);

  const handleStartReading = useCallback(async (areaId: AreaId) => {
    if (!canBeginRef.current) { resetHoldVisuals(); return; }
    setIsCreatingReading(true);
    setSubmitError(null);
    trackTtq("AddToCart", { content_id: areaId });
    try {
      clearIntake();
      clearReading();
      localStorage.removeItem("dfp_followup_return");
      localStorage.removeItem("dfp_followup_question");
      const topic = areaId === "love" ? "love" : areaId === "career" ? "career" : areaId === "money" ? "money" : "general";
      const areaCfg = AREAS.find((a) => a.id === areaId);
      saveIntake({
        topic: topic as "love" | "career" | "money" | "general",
        area: areaId,
        question: areaCfg?.defaultQuestion || "What is coming for me in the next 30–45 days?",
        timeframeType: "month",
        timeframeValue: "next-45-days",
      });

      let status: UserStatus | null = null;
      try {
        const res = await fetch("/api/user/credits", { cache: "no-store" });
        if (res.ok) {
          status = readStatus(await res.json());
          setUserStatus(status);
        }
      } catch { /* handled below */ }

      if (!status) {
        setSubmitError("Couldn't verify your credits. Please try again.");
        resetHoldVisuals();
        return;
      }

      const CREDITS_PER_READING = 1;
      if (status.credits >= CREDITS_PER_READING || status.isSubscribed) {
        router.push("/reading/preparing");
        return;
      }

      trackTtq("InitiateCheckout", { content_id: areaId, value: PRICING.reading.price / 100, currency: "USD" });
      const checkoutRes = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "one_time",
          // Only satisfies the route's returnUrl guard; the embedded flow stays in the app.
          returnUrl: window.location.origin + "/reading/preparing",
        }),
      });
      const checkoutData = await checkoutRes.json();
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
  }, [resetHoldVisuals, router]);

  const completeHold = useCallback((areaId: AreaId) => {
    clearHoldTimers();
    sendingRef.current = true;
    setHoldingArea(null);
    setSentArea(areaId);
    setAmbienceArea(areaId);
    triggerHaptic();
    // The button flashes, then the screen fades to black while the reading starts.
    holdTimersRef.current.push(window.setTimeout(() => setReadingFade(true), 420));
    void handleStartReading(areaId);
  }, [clearHoldTimers, handleStartReading]);

  const beginHold = useCallback((areaId: AreaId) => {
    if (sendingRef.current || !canBeginRef.current) return;
    setHoldingArea(areaId); // starts the one continuous fade (.focus-hold)
    triggerHaptic();
    holdTimersRef.current.push(
      window.setTimeout(() => triggerHaptic(), HOLD_STEP_MS),
      window.setTimeout(() => triggerHaptic(), HOLD_STEP_MS * 2),
      window.setTimeout(() => setAmbienceArea(areaId), HOLD_AMBIENCE_MS),
      window.setTimeout(() => completeHold(areaId), HOLD_TOTAL_MS),
    );
  }, [completeHold]);

  const voiceVisualActive = voiceJourneyActive || askHolding || isTranscribingAsk || voiceNavigating;
  const voiceVisualActiveRef = useRef(voiceVisualActive);
  voiceVisualActiveRef.current = voiceVisualActive;

  const handleTilePointerDown = (event: React.PointerEvent<HTMLButtonElement>, areaId: AreaId) => {
    if (sendingRef.current || voiceVisualActiveRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pressStartRef.current = Date.now();
    clearHoldTimers();
    setSubmitError(null);
    setSelectedArea(areaId);
    trackTtq("ViewContent", { content_id: areaId, content_name: AREAS.find((a) => a.id === areaId)?.title });
    armTimerRef.current = window.setTimeout(() => beginHold(areaId), HOLD_ARM_MS);
  };

  const handleTilePointerUp = (areaId: AreaId, cancelled = false) => {
    if (sendingRef.current) return;
    const quickTap = !cancelled && Date.now() - pressStartRef.current < HOLD_ARM_MS;
    clearHoldTimers();
    setAmbienceArea(null);
    setHoldingArea(null);
    setSelectedArea(null);
    if (quickTap && !shouldReduceMotion) {
      // A quick tap shows how to begin: the ring starts tracing, then slides back.
      setTeaseArea(null);
      window.requestAnimationFrame(() => setTeaseArea(areaId));
      window.setTimeout(() => setTeaseArea((current) => (current === areaId ? null : current)), 1150);
    }
  };

  // Keyboard: first press chooses the reading, second press begins it.
  const handleTileKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, areaId: AreaId) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (sendingRef.current || !canBeginRef.current) return;
    if (selectedArea === areaId) completeHold(areaId);
    else setSelectedArea(areaId);
  };

  useEffect(() => () => clearHoldTimers(), [clearHoldTimers]);

  // Going offscreen in the pager: turn the mic off and drop any hold that hasn't been sent.
  useEffect(() => {
    if (isActive) return;
    cancelAskHold();
    disconnectMicrophone();
    if (!sendingRef.current) resetHoldVisuals();
  }, [isActive, cancelAskHold, disconnectMicrophone, resetHoldVisuals]);

  /* ════════════════ Carousel ════════════════ */

  const go = useCallback((dir: 1 | -1) => {
    if (sendingRef.current || voiceVisualActiveRef.current || holdingArea) return;
    setPrevSlide(slide);
    setSlideDir(dir);
    setSlide((slide + dir + SLIDE_COUNT) % SLIDE_COUNT);
    setSubmitError(null);
  }, [slide, holdingArea]);

  /* ════════════════ Pager signals ════════════════ */

  // The pager fades the sky behind the stars to black during a hold (stars stay).
  const focusActive = !!holdingArea || !!sentArea;
  useEffect(() => {
    const root = document.documentElement;
    if (focusActive) root.dataset.astroFocus = "hold";
    else delete root.dataset.astroFocus;
    return () => { delete root.dataset.astroFocus; };
  }, [focusActive]);

  // Voice: "holding" while the button is held, "on" while transcribing / opening.
  useEffect(() => {
    const root = document.documentElement;
    if (askHolding) root.dataset.astroVoice = "holding";
    else if (voiceJourneyActive || isTranscribingAsk || voiceNavigating) root.dataset.astroVoice = "on";
    else delete root.dataset.astroVoice;
    return () => { delete root.dataset.astroVoice; };
  }, [askHolding, voiceJourneyActive, isTranscribingAsk, voiceNavigating]);

  // The pager owns the viewport and vertical scrolling. Hide only the panel's scrollbar
  // (locking <html>/<body> freezes a stale visual viewport on iOS Safari).
  useEffect(() => {
    const panel = rootRef.current?.closest<HTMLElement>("[data-pager-panel]");
    if (!panel) return;
    panel.classList.add("astro-intake-panel-no-scrollbar");
    panel.style.minHeight = "100%";
    void panel.offsetHeight;
    return () => {
      panel.classList.remove("astro-intake-panel-no-scrollbar");
      panel.style.minHeight = "";
    };
  }, []);

  // Reading ambience: the held reading's symbols from 50% of the hold, or the gold Ask
  // theme once a voice question is sent. Keep the last theme so it fades out, not vanishes.
  const ambienceKey: ThemeKey | null = ambienceArea
    ? (ambienceArea as ThemeKey)
    : voiceNavigating
      ? "ask"
      : null;
  const lastAmbienceKeyRef = useRef<ThemeKey>("default");
  if (ambienceKey) lastAmbienceKeyRef.current = ambienceKey;

  /* ════════════════ Derived chart view ════════════════ */

  const find = useCallback((n: string) => natal.find((p) => p.name === n), [natal]);
  const bigThree = useMemo(
    () => [
      { label: "Sun", p: find("Sun") },
      { label: "Moon", p: find("Moon") },
      { label: "Rising", p: find("Ascendant") },
    ],
    [find],
  );

  const elementCounts = useMemo(() => {
    const counts: Record<Element, number> = { Fire: 0, Earth: 0, Air: 0, Water: 0 };
    natal.forEach((p) => {
      if (!ELEMENT_BALANCE_ORDER.includes(p.name)) return;
      const el = elementOf(p.sign);
      if (el) counts[el] += 1;
    });
    return counts;
  }, [natal]);
  const presentElements = ELEMENT_ORDER.filter((el) => elementCounts[el] > 0);

  const sunNow = transits.find((p) => p.name === "Sun");
  const moonNow = transits.find((p) => p.name === "Moon");
  const retrogrades = transits.filter((p) => p.isRetrograde === true).map((p) => p.name);
  const moonSign = moonPhase?.moonSign ?? moonNow?.sign;
  const waxing = moonPhase?.nextEventName === "Full Moon";

  const profSign = profection?.activatedSign ?? "";
  const profColors = colorsOf(profSign);
  const profRuler = profection?.timeLord || SIGN_RULERS[profSign] || "";
  const profHouse =
    typeof profection?.activatedHouse === "number"
      ? profection.activatedHouse
      : typeof profection?.profectionYear === "number"
        ? profection.profectionYear
        : null;

  // Accents: hero glow (Sun left, Rising right, Moon underneath), profection tint, mic edge + waves in the Sun's color.
  const accentStyle = useMemo(() => {
    const sun = colorsOf(find("Sun")?.sign);
    const moon = colorsOf(find("Moon")?.sign);
    const rise = colorsOf(find("Ascendant")?.sign);
    const sunBar = sun?.bar ?? FALLBACK.sun, sunText = sun?.text ?? FALLBACK.sunText;
    const moonBar = moon?.bar ?? FALLBACK.moon, riseBar = rise?.bar ?? FALLBACK.rise;
    const k = HERO_GLOW;
    return {
      "--hero-shadow": `-16px 20px 46px ${rgba(sunBar, 0.30 * k)}, 16px 24px 52px ${rgba(riseBar, 0.24 * k)}, 0 38px 84px ${rgba(moonBar, 0.26 * k)}`,
      "--prof-tint": rgba(profColors?.bar ?? FALLBACK.prof, 0.20),
      "--ask-ring": `conic-gradient(from var(--voice-angle), rgba(255,255,255,0.94) 0deg, rgba(255,255,255,0.74) 54deg, ${sunText} 96deg, ${sunBar} 135deg, ${sunText} 176deg, rgba(255,255,255,0.96) 226deg, rgba(193,151,67,0.86) 296deg, rgba(255,255,255,0.94) 360deg)`,
      "--ask-aura": `conic-gradient(from var(--voice-glow-angle), rgba(255,255,255,0.75), rgba(255,239,195,0.35) 60deg, ${sunBar} 115deg, ${sunText} 150deg, rgba(255,255,255,0.30) 175deg, rgba(255,255,255,0.80) 228deg, rgba(193,151,67,0.80) 296deg, rgba(255,255,255,0.75))`,
      "--ask-glow": `0 0 18px rgba(218,183,104,0.24), 0 0 22px ${rgba(sunBar, 0.16)}`,
      "--ask-sun": rgba(sunBar, 0.22),
    } as React.CSSProperties;
  }, [find, profColors]);
  useEffect(() => {
    sunWaveRgbRef.current = rgbOf(colorsOf(find("Sun")?.sign)?.bar ?? FALLBACK.sun);
  }, [find]);

  // One short line above the button for anything the user needs to know.
  const note =
    submitError ??
    (askError && !voiceVisualActive ? askError : null) ??
    (lockedFeaturePrompt === "voice" ? "Asking by voice needs credits · tap again" : null) ??
    (chartStatus === "error" ? "Chart unavailable · Try again later" : null);

  const isLoading = chartStatus !== "error" && !chartRead;
  const hasChart = natal.length > 0;
  const tint = bigThree.map(({ p }) => colorsOf(p?.sign)?.bar ?? NEUTRAL);
  const onMic = slide === 0;

  /* ════════════════ Render ════════════════ */

  return (
    <div
      ref={rootRef}
      className={`dp ${isPwa ? "is-pwa" : ""} ${focusActive ? "focus-hold" : ""} ${ambienceArea ? "ambience-on" : ""} ${voiceVisualActive ? "voice-on" : ""}`}
      style={accentStyle}
    >
      <style jsx global>{`
        .astro-intake-panel-no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .astro-intake-panel-no-scrollbar::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }

        .dp {
          --dp-display: var(--font-display), "Cormorant Garamond", Georgia, serif;
          --dp-caps: var(--font-caps), Cinzel, Georgia, serif;
          --dp-gold: rgba(241, 214, 148, 0.9);
          --s100: #F1F5F9; --s200: #E2E8F0; --s300: #CBD5E1; --s400: #94A3B8; --s500: #64748B; --s600: #475569;
          --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
          --ease-soft: cubic-bezier(0.4, 0, 0.2, 1);
          --ease-hold: cubic-bezier(0.37, 0, 0.63, 1);
          position: relative;
          box-sizing: border-box;
          height: 100%;
          width: 100%;
          max-width: 430px;
          margin: 0 auto;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          gap: 12px;
          /* Lines up with the pager's swipe line and the safe areas. */
          --swipe-h: 32px;
          --cap-mt: 14px;
          padding:
            calc(env(safe-area-inset-top) + 6px + var(--swipe-h))
            clamp(12px, 4vw, 16px)
            calc(env(safe-area-inset-bottom) + 8px);   /* browser: the Big Three hugs the bottom edge */
          color: var(--s100);
          font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
        }
        .dp * { box-sizing: border-box; }
        :where(.dp) :where(p, h2) { margin: 0; }
        .dp-display { font-family: var(--dp-display); }
        .dp-caps { font-family: var(--dp-caps); text-transform: uppercase; }
        .dp-tap { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }

        /* Shine sweep (symbol box, Big Three) */
        @keyframes dpShine { 0% { transform: translateX(-140%) skewX(-18deg); } 60%, 100% { transform: translateX(240%) skewX(-18deg); } }
        .dp-shine { position: relative; overflow: hidden; isolation: isolate; }
        .dp-shine::after {
          content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 45%; pointer-events: none; z-index: 1;
          background: linear-gradient(105deg, transparent 0%, rgba(255,255,255,.09) 45%, rgba(255,255,255,.16) 50%, rgba(255,255,255,.09) 55%, transparent 100%);
          transform: translateX(-140%) skewX(-18deg);
          animation: dpShine 4.6s ease-in-out infinite;
        }
        .dp-shine > * { position: relative; z-index: 2; }

        .dp-card { flex-shrink: 0; padding: 1.5px; border-radius: 22px; background: linear-gradient(160deg, rgba(255,255,255,.16), rgba(255,255,255,.06) 50%, rgba(255,255,255,.12)); }
        .dp-card-in { border-radius: 20.5px; overflow: hidden; background: linear-gradient(170deg, rgba(10,13,28,.97), rgba(5,8,20,.97)); }

        /* ── Hero: hairline edge, profection tint from the top-left, Big Three glow ── */
        .dp-today { padding: 1px; background: rgba(255,255,255,.10); box-shadow: var(--hero-shadow); transition: box-shadow .8s var(--ease-out); }
        .dp-today .dp-card-in {
          position: relative; padding: 9px 14px 8px; border-radius: 21px;
          background: radial-gradient(90% 120% at 0% 0%, var(--prof-tint, transparent), transparent 60%), linear-gradient(170deg, rgba(10,13,28,.97), rgba(5,8,20,.97));
        }
        .dp-prof { position: relative; height: 74px; padding: 0 58px 2px; display: flex; align-items: center; justify-content: center; }
        .dp-symbol { position: absolute; left: 2px; top: 50%; margin-top: -23px; width: 46px; height: 46px; border-radius: 14px; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.2); display: flex; align-items: center; justify-content: center; font-family: var(--dp-display); font-size: 21px; }
        .dp-prof-text { min-width: 0; text-align: center; }
        .dp-eyebrow { font-size: 8.5px; font-weight: 500; letter-spacing: .28em; color: var(--dp-gold); white-space: nowrap; }
        .dp-prof-title { margin-top: 2px !important; font-size: 28px; font-weight: 500; line-height: 1.05; color: #fff; }
        .dp-prof-sub { margin-top: 3px !important; font-size: 10.5px; color: var(--s400); white-space: nowrap; }
        .dp-sky { margin-top: 6px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,.06); }
        .dp-sky .dp-eyebrow { text-align: center; }
        .dp-sky-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px; margin-top: 4px; }
        .dp-sky-col { min-width: 0; text-align: center; }
        .dp-sky-label { font-size: 7.5px; font-weight: 600; letter-spacing: .18em; color: var(--s500); white-space: nowrap; }
        .dp-sky-sign { margin-top: 1px !important; font-size: 22px; font-weight: 500; line-height: 1.05; }
        .dp-sky-detail { margin-top: 1px !important; font-size: 10.5px; color: var(--s400); white-space: nowrap; font-variant-numeric: tabular-nums; }
        .dp-moon { display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0 0 16px rgba(226,223,240,.16)); }
        .dp-moon-pct { margin-top: 1px !important; font-size: 9.5px; color: var(--s400); font-variant-numeric: tabular-nums; }
        .dp-sky-foot { margin-top: 5px !important; padding-top: 6px; border-top: 1px solid rgba(255,255,255,.06); text-align: center; font-size: 10.5px; color: var(--s400); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dp-sky-foot .dp-dot { margin: 0 6px; color: var(--s600); }
        .dp-sky-foot .dp-rx { color: rgba(252,211,77,.8); }

        /* ── Today's Guidance: 7-line window; lines 1–6 solid, line 7 fades, the rest scrolls ── */
        .dp-horo { position: relative; flex: 0 1 auto; min-height: 0; display: flex; flex-direction: column;
          --guide-shadow: 0 2px 5px rgba(0,0,0,.9), 0 5px 18px rgba(0,0,0,.72), 0 0 36px rgba(0,0,0,.55); }
        .dp-horo-head { transition: opacity .5s ease .25s; }
        .dp-horo-title { text-align: center; padding: 0 2px; font-size: 22px; font-weight: 500; line-height: 1.05; color: #fff; text-shadow: var(--guide-shadow); }
        .dp-horo-date { margin-top: 4px !important; min-height: 11px; text-align: center; padding: 0 2px; font-size: 8.5px; font-weight: 600; letter-spacing: .22em; color: var(--dp-gold);
          text-shadow: 0 1px 4px rgba(0,0,0,.85), 0 2px 10px rgba(0,0,0,.6), 0 0 16px rgba(0,0,0,.5); }
        .dp-horo-veil { min-height: 0; display: flex; flex-direction: column; transition: opacity 1.6s ease, filter 1.6s ease; }

        /* Sealed: the title + date sit centered over a soft, blurred glimpse; "Tap to reveal". */
        .dp-horo.is-sealed .dp-horo-head { opacity: 0; transition: none; }
        .dp-horo.is-sealed .dp-horo-veil { opacity: .26; filter: blur(5px); min-height: calc(7 * 1.42 * 16.5px); overflow: hidden; pointer-events: none; user-select: none; -webkit-user-select: none; }
        .dp-horo-ghost { margin-top: 8px; display: flex; flex-direction: column; gap: 11px; padding: 6px 2px 0; }
        .dp-horo-ghost i { display: block; height: 9px; border-radius: 5px; background: rgba(226,232,240,.55); }
        .dp-horo-seal {
          position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
          padding: 0; border: 0; background: none; color: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation;
        }
        .dp-horo.is-open .dp-horo-seal { display: none; }
        .seal-title { font-family: var(--dp-display); font-size: 27px; font-weight: 500; line-height: 1.05; color: #fff; transform-origin: 0 0;
          text-shadow: var(--guide-shadow); transition: transform 1s var(--ease-out), opacity .5s ease .55s; }
        .seal-date { font-family: var(--dp-caps); font-size: 9px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; color: var(--dp-gold);
          transform-origin: 0 0; transition: transform 1s var(--ease-out), opacity .5s ease .55s; }
        .seal-hint { margin-top: 12px; display: flex; align-items: center; gap: 8px; font-family: var(--dp-caps); font-size: 9.5px; font-weight: 600; letter-spacing: .3em; text-transform: uppercase; transition: opacity .3s ease; }
        .seal-hint::before, .seal-hint::after { content: "✦"; font-size: 8px; color: rgba(241,214,148,.7); animation: sealTwinkle 2.6s ease-in-out infinite; }
        .seal-hint::after { animation-delay: 1.3s; }
        .seal-hint span {
          background: linear-gradient(90deg, rgba(226,232,240,.6) 0%, rgba(226,232,240,.6) 40%, #FFF6DC 50%, rgba(226,232,240,.6) 60%, rgba(226,232,240,.6) 100%);
          background-size: 250% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: dpShimmer 4.5s ease-in-out infinite;
        }
        .dp-horo.is-waiting .seal-hint span { animation-duration: 2.8s; }
        .seal-error { margin-top: 10px; max-width: 280px; text-align: center; font-family: var(--dp-display); font-style: italic; font-size: 14px; color: var(--s400); }
        @keyframes sealTwinkle { 0%, 100% { opacity: .35; transform: scale(.85); } 50% { opacity: 1; transform: scale(1.15); } }
        @keyframes dpShimmer { 0%, 30% { background-position: 100% 0; } 70%, 100% { background-position: 0 0; } }
        /* Reveal: the title glides to the top-left; the text resolves slowly, top to bottom. */
        .dp-horo.is-revealing .seal-title { transform: translate(var(--tx, 0), var(--ty, 0)) scale(var(--ts, 1)); opacity: 0; }
        .dp-horo.is-revealing .seal-date { transform: translate(var(--dx, 0), var(--dy, 0)) scale(var(--ds, 1)); opacity: 0; }
        .dp-horo.is-revealing .seal-hint, .dp-horo.is-revealing .seal-error { opacity: 0; }
        @keyframes guidanceSweep { from { -webkit-mask-position: 0 100%; mask-position: 0 100%; } to { -webkit-mask-position: 0 0; mask-position: 0 0; } }
        .dp-horo.is-revealing:not(.is-sealed) .dp-horo-veil {
          -webkit-mask-image: linear-gradient(#000 0 42%, transparent 58% 100%); mask-image: linear-gradient(#000 0 42%, transparent 58% 100%);
          -webkit-mask-size: 100% 240%; mask-size: 100% 240%;
          animation: guidanceSweep ${GUIDANCE_OPEN_MS - GUIDANCE_UNSEAL_MS}ms cubic-bezier(.33,0,.2,1) both;
        }
        /* Sealing itself again: the heading fades out and the centered seal fades back in. */
        @keyframes sealReturn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .dp-horo.is-returning .dp-horo-head { opacity: 0; transition: opacity .6s ease; }
        .dp-horo.is-returning .dp-horo-seal { animation: sealReturn 1.2s var(--ease-out) .5s both; }
        .dp-horo-body {
          margin-top: 8px !important; flex: 0 1 auto; min-height: 0; max-height: calc(7 * 1.42em); overflow-y: auto; scrollbar-width: none; padding: 0 2px;
          font-size: 16.5px; line-height: 1.42; color: var(--s200);
          -webkit-mask-image: linear-gradient(#000 calc(6 * 1.42em), transparent); mask-image: linear-gradient(#000 calc(6 * 1.42em), transparent);
        }
        .dp-horo-body::-webkit-scrollbar { display: none; }
        .dp-horo-status { margin-top: 10px !important; text-align: center; font-family: var(--dp-display); font-style: italic; font-size: 15px; color: var(--s400); }
        .dp-retry { border: 0; background: none; padding: 0; color: inherit; font: inherit; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }

        /* ── Button row: sits low, the toggle 8px above the element bar ── */
        /* --combo-lift raises the whole group (heading + button + toggle) off the element bar:
           20px puts "Select Reading" 70px below the horoscope on an 844px screen. */
        .dp-ask { position: relative; z-index: 2; flex: 1 0 auto; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 6px; margin-bottom: -4px;
          --combo-lift: 20px; padding-top: 52px; padding-bottom: var(--combo-lift); }
        .dp-switch { position: relative; width: 100%; display: flex; justify-content: center; }
        .ask-box { position: relative; flex-shrink: 0; width: 70%; max-width: 320px; height: 84px; transition: transform .18s var(--ease-out); }
        .dp-note {
          position: absolute; left: 0; right: 0; bottom: calc(84px + 6px + 26px + 12px + var(--combo-lift) + 8px); padding: 0 12px;
          text-align: center; font-family: var(--dp-caps); font-size: 9.5px; font-weight: 500; letter-spacing: .2em; text-transform: uppercase;
          color: rgba(236,214,170,.8); pointer-events: none; opacity: 0; transform: translateY(4px); transition: opacity .4s ease, transform .4s ease;
        }
        .dp-note.is-on { opacity: 1; transform: none; }

        /* "Select Reading": same size and face as the profection sign (28px Cormorant), gold with a slow
           shimmer. Gives way to any message (.dp-note sits in the same spot). */
        .dp-pick {
          position: absolute; left: 0; right: 0; bottom: calc(84px + 6px + 26px + 12px + var(--combo-lift));
          display: flex; align-items: center; justify-content: center; gap: 14px; pointer-events: none;
          font-family: var(--dp-display); font-size: 28px; font-weight: 500; line-height: 1.05; letter-spacing: .02em;
          transition: opacity .4s ease;
        }
        .dp-pick.is-hidden { opacity: 0 !important; }
        .dp-pick::before, .dp-pick::after { content: ""; width: 40px; height: 1px; background: linear-gradient(90deg, transparent, rgba(241,214,148,.55)); }
        .dp-pick::after { transform: scaleX(-1); }
        .dp-pick span {
          background: linear-gradient(90deg, rgba(241,214,148,.7) 0%, rgba(241,214,148,.7) 40%, #FFF6DC 50%, rgba(241,214,148,.7) 60%, rgba(241,214,148,.7) 100%);
          background-size: 250% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: dpShimmer 5.5s ease-in-out infinite;
        }

        .dp-slide {
          position: absolute; inset: 0; opacity: 0; visibility: hidden; pointer-events: none;
          transform: translateX(var(--off, 18px)) scale(.98);
          transition: opacity .38s var(--ease-out), transform .45s var(--ease-out), visibility 0s linear .45s;
        }
        .dp-slide.is-current { opacity: 1; visibility: visible; pointer-events: auto; transform: none; transition: opacity .38s var(--ease-out), transform .45s var(--ease-out), visibility 0s; }

        /* Arrows + toggle rest faded and softly blurred; only the one being touched comes into focus. */
        .dp-arrow {
          position: absolute; top: 50%; width: 44px; height: 84px; margin-top: -42px; padding: 0; border: 0; background: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center; color: #fff;
        }
        .dp-arrow svg { width: 20px; height: 20px; filter: drop-shadow(0 0 6px rgba(255,255,255,.25)); }
        .dp-arrow.prev { right: calc(50% + min(35%, 160px) + 2px); --nudge: -2px; }
        .dp-arrow.next { left: calc(50% + min(35%, 160px) + 2px); --nudge: 2px; }
        .dp-ask .dp-arrow, .dp-ask .mic-ready-toggle {
          opacity: .4; filter: blur(1.2px);
          transition: opacity .9s var(--ease-soft), filter .9s var(--ease-soft), transform .7s var(--ease-soft), border-color .4s ease, box-shadow .4s ease;
        }
        .dp-ask .dp-arrow.is-engaged, .dp-ask .mic-ready-toggle[data-enabled="false"].is-engaged { opacity: .9; filter: none; transition-duration: .25s; }
        .dp-ask .dp-arrow.is-tapped { opacity: 1; transition-duration: .12s; }
        .dp-arrow.prev.is-tapped { transform: translateX(-3px); }
        .dp-arrow.next.is-tapped { transform: translateX(3px); }
        .dp-ask .dp-arrow:focus-visible { outline: none; opacity: 1; filter: none; }
        /* Until the arrows have been used once, they glow softly so people know they're there. */
        @keyframes arrowGlow {
          0%, 100% { opacity: .7; filter: drop-shadow(0 0 2px rgba(241,214,148,.35)) drop-shadow(0 0 6px rgba(241,214,148,.15)); transform: translateX(0); }
          50%      { opacity: 1;  filter: drop-shadow(0 0 5px rgba(241,214,148,.8)) drop-shadow(0 0 14px rgba(241,214,148,.35)); transform: translateX(var(--nudge)); }
        }
        .dp-ask .dp-arrow.is-hint { opacity: 1; filter: none; }
        .dp-arrow.is-hint svg { color: #F6E3B4; animation: arrowGlow 2.8s ease-in-out infinite; }

        /* ── Mic button (Ask Anything) ── */
        @property --voice-angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
        @property --voice-glow-angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
        @keyframes voiceOrbit { to { --voice-angle: 360deg; } }
        @keyframes voiceGlowOrbit { to { --voice-glow-angle: 360deg; } }
        @keyframes voiceGlowBreathe { 0%, 100% { opacity: .45; } 50% { opacity: .7; } }
        @keyframes askMicBreathe {
          0%, 100% { transform: scale(1); box-shadow: 0 0 12px rgba(218,183,104,.12), 0 0 22px rgba(255,255,255,.06); }
          50% { transform: scale(1.035); box-shadow: 0 0 18px rgba(218,183,104,.18), 0 0 28px rgba(255,255,255,.08); }
        }
        .slide-mic::before {
          content: ""; position: absolute; inset: 0; border-radius: 24px; z-index: 0; pointer-events: none;
          background: var(--ask-aura); filter: blur(16px); opacity: .55; transform: scale(1.04);
          animation: voiceGlowOrbit 8s linear infinite, voiceGlowBreathe 4.5s ease-in-out infinite;
        }
        .ask-premium {
          position: relative; z-index: 1; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
          overflow: hidden; isolation: isolate; cursor: pointer; touch-action: none;
          user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
          border: 1.25px solid transparent; border-radius: 20px; padding: 0;
          background:
            radial-gradient(90% 120% at 50% 130%, var(--ask-sun), transparent 62%) padding-box,
            radial-gradient(circle at 50% -70%, rgba(255,255,255,.11), transparent 66%) padding-box,
            linear-gradient(145deg, rgba(19,18,24,.96), rgba(7,10,21,.97)) padding-box,
            var(--ask-ring) border-box;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.10), 0 0 0 1px rgba(255,239,195,.10), var(--ask-glow), 0 0 36px rgba(255,255,255,.10), 0 16px 38px rgba(0,0,0,.46);
          animation: voiceOrbit 8s linear infinite;
          transition: transform .7s var(--ease-out);
        }
        .ask-premium:hover, .ask-premium:focus-visible { transform: translateY(-1px); outline: none; }
        .ask-premium:active { transform: translateY(0); }
        .ask-mic-halo {
          display: flex; width: 46px; height: 46px; align-items: center; justify-content: center; border-radius: 9999px;
          border: 1px solid rgba(255,255,255,.22);
          background: radial-gradient(circle at 50% 35%, rgba(255,255,255,.055), transparent 56%), linear-gradient(145deg, rgba(15,16,23,.98), rgba(7,9,18,.99));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.07), 0 0 14px rgba(218,183,104,.12);
          animation: askMicBreathe 3.4s ease-in-out infinite;
        }
        .ask-mic-halo svg { width: 22px; height: 22px; color: rgba(248,250,252,.96); filter: drop-shadow(0 0 6px rgba(218,183,104,.16)); }

        /* ── Mic toggle: under the button, on its side; stays in view (faded) once on; never gold ── */
        .mic-ready-toggle {
          position: relative; flex-shrink: 0; width: 62px; height: 26px; padding: 0; cursor: pointer;
          border-radius: 9999px; border: 1px solid rgba(203,213,225,.14);
          background: radial-gradient(circle at 12% 50%, rgba(255,255,255,.055), transparent 42%), linear-gradient(90deg, rgba(15,19,34,.94), rgba(5,8,19,.98));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.055), 0 12px 28px rgba(0,0,0,.38);
        }
        .mic-ready-toggle:disabled { cursor: wait; }
        @keyframes micNeedsYou {
          0%, 100% { transform: translateX(0) rotate(0); } 12% { transform: translateX(-3px) rotate(-2deg); } 25% { transform: translateX(3px) rotate(2deg); }
          37% { transform: translateX(-3px) rotate(-1.5deg); } 50% { transform: translateX(2.4px) rotate(1deg); } 62% { transform: translateX(-1.5px); } 75% { transform: translateX(.9px); }
        }
        .dp-ask .mic-ready-toggle.is-nudging {
          opacity: 1; filter: none; border-color: rgba(255,255,255,.45);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.055), 0 0 14px rgba(255,255,255,.22), 0 12px 28px rgba(0,0,0,.38);
          animation: micNeedsYou 560ms cubic-bezier(.36,.07,.19,.97) 1;
        }
        .mic-ready-knob {
          position: absolute; top: 50%; width: 16px; height: 16px; border-radius: 9999px; transform: translateY(-50%);
          background: linear-gradient(145deg, rgba(226,232,240,.96), rgba(148,163,184,.88));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.62), 0 0 0 1px rgba(255,255,255,.08), 0 3px 9px rgba(0,0,0,.46);
          transition: left 420ms var(--ease-out), background 420ms var(--ease-out), box-shadow 420ms var(--ease-out);
        }
        .mic-ready-toggle[data-enabled="false"] .mic-ready-knob { left: 5px; }
        .mic-ready-toggle[data-enabled="true"] .mic-ready-knob {
          left: 39px; background: linear-gradient(145deg, #ffffff, rgba(226,232,240,.96));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.8), 0 0 0 1px rgba(255,255,255,.14), 0 0 10px rgba(255,255,255,.28), 0 3px 9px rgba(0,0,0,.42);
        }
        .mic-ready-toggle.is-nudging .mic-ready-knob { box-shadow: 0 0 10px rgba(255,255,255,.5), 0 3px 9px rgba(0,0,0,.46); }
        /* The toggle only belongs to the mic: hidden on the reading buttons, space kept. */
        .dp-ask .mic-ready-toggle.is-away { opacity: 0 !important; visibility: hidden; pointer-events: none; transition: opacity .3s ease, visibility 0s linear .3s; }

        /* ── Reading buttons: built like the mic, each in its own color. An opaque face, a slowly orbiting
           ring, a soft glow from below, and a breathing aura behind (.slide-read::before). ── */
        .slide-read::before {
          content: ""; position: absolute; inset: 0; border-radius: 24px; z-index: 0; pointer-events: none;
          background: conic-gradient(from var(--voice-glow-angle), rgba(255,255,255,.55), color-mix(in srgb, var(--t) 45%, transparent) 60deg, var(--t) 115deg, color-mix(in srgb, var(--t) 80%, #fff) 150deg, rgba(255,255,255,.25) 175deg, rgba(255,255,255,.6) 228deg, var(--t) 296deg, rgba(255,255,255,.55));
          filter: blur(16px); opacity: .5; transform: scale(1.04);
          animation: voiceGlowOrbit 8s linear infinite, voiceGlowBreathe 4.5s ease-in-out infinite;
        }
        .dp-tile {
          position: relative; z-index: 1; overflow: hidden; width: 100%; height: 100%; padding: 0;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
          border-radius: 20px; border: 1.25px solid transparent; cursor: pointer;
          background:
            radial-gradient(90% 120% at 50% 130%, color-mix(in srgb, var(--t) 22%, transparent), transparent 62%) padding-box,
            radial-gradient(circle at 50% -40%, color-mix(in srgb, var(--t) 14%, transparent), transparent 64%) padding-box,
            linear-gradient(145deg, rgba(19,18,24,.96), rgba(7,10,21,.97)) padding-box,
            conic-gradient(from var(--voice-angle), rgba(255,255,255,.9) 0deg, rgba(255,255,255,.62) 54deg, var(--t) 100deg, color-mix(in srgb, var(--t) 70%, #000) 140deg, var(--t) 180deg, rgba(255,255,255,.92) 228deg, color-mix(in srgb, var(--t) 60%, #fff) 296deg, rgba(255,255,255,.9) 360deg) border-box;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.10), 0 0 0 1px rgba(255,255,255,.06), 0 0 18px var(--g), 0 0 34px rgba(255,255,255,.06), 0 16px 38px rgba(0,0,0,.46);
          animation: voiceOrbit 8s linear infinite;
          user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
          transition: border-color .9s var(--ease-soft), box-shadow .9s var(--ease-soft), transform .9s var(--ease-soft);
        }
        .dp-tile > * { position: relative; z-index: 1; }
        .dp-tile .tile-icon { width: 24px; height: 24px; color: color-mix(in srgb, var(--t) 55%, rgba(203,213,225,.7)); transition: color .9s var(--ease-out), filter .9s var(--ease-out); }
        .dp-tile .tile-label { font-family: var(--dp-display); font-size: 19.5px; font-weight: 600; line-height: 1; letter-spacing: .015em; color: rgba(226,232,240,.86); transition: color .9s var(--ease-out); }
        .dp-tile.is-on {
          border-color: var(--b);
          background:
            linear-gradient(var(--bg), var(--bg)) padding-box,
            radial-gradient(90% 120% at 50% 130%, color-mix(in srgb, var(--t) 22%, transparent), transparent 62%) padding-box,
            linear-gradient(145deg, rgba(19,18,24,.96), rgba(7,10,21,.97)) padding-box,
            conic-gradient(from var(--voice-angle), rgba(255,255,255,.9) 0deg, var(--t) 100deg, rgba(255,255,255,.92) 228deg, rgba(255,255,255,.9) 360deg) border-box;
          box-shadow: 0 0 0 1px var(--b), 0 0 18px 2px var(--g), 0 0 34px 5px var(--g), 0 18px 34px rgba(0,0,0,.78);
          transition-duration: .5s;
        }
        .dp-tile.is-on .tile-icon { color: var(--t); filter: drop-shadow(0 0 7px var(--g)); transition-duration: .5s; }
        .dp-tile.is-on .tile-label { color: var(--t); transition-duration: .5s; }
        .dp-tile::after { content: ""; position: absolute; inset: 0; z-index: 0; background: linear-gradient(0deg, var(--g), transparent 110%); transform: scaleY(0); transform-origin: bottom; transition: transform .3s ease; }
        .dp-tile.is-holding::after { transform: scaleY(1); transition: transform ${HOLD_TOTAL_MS}ms linear; }
        @property --hold-progress { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
        .dp-tile::before {
          content: ""; position: absolute; inset: 0; z-index: 2; border-radius: inherit; padding: 2px; pointer-events: none;
          background: conic-gradient(from 0deg, var(--t) var(--hold-progress), transparent 0);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude;
          opacity: 0; --hold-progress: 0deg; transition: --hold-progress .35s ease, opacity .3s ease;
        }
        .dp-tile.is-holding::before { opacity: 1; --hold-progress: 360deg; transition: --hold-progress ${HOLD_TOTAL_MS}ms linear, opacity .2s ease; }
        @keyframes tileTease { 0% { --hold-progress: 0deg; opacity: 1; } 45% { --hold-progress: 165deg; opacity: 1; } 80% { --hold-progress: 0deg; opacity: 1; } 100% { --hold-progress: 0deg; opacity: 0; } }
        .dp-tile.is-tease::before { background: conic-gradient(from 0deg, rgba(255,255,255,.95) var(--hold-progress), transparent 0); animation: tileTease 1.1s var(--ease-out); }
        @keyframes holdPulse {
          0%, 100% { transform: scale(1.025); box-shadow: 0 0 0 1px var(--b), 0 0 18px 2px var(--g), 0 0 36px 6px var(--g), 0 18px 34px rgba(0,0,0,.78); }
          50% { transform: scale(1.05); box-shadow: 0 0 0 1px var(--b), 0 0 32px 8px var(--g), 0 0 70px 18px var(--g), 0 18px 34px rgba(0,0,0,.78); }
        }
        /* The ring keeps orbiting under the hold's pulse. */
        .dp-tile.is-holding { animation: holdPulse 1s ease-in-out infinite, voiceOrbit 8s linear infinite; }
        .dp.ambience-on .dp-tile.is-holding { animation-duration: .6s, 8s; }
        @keyframes sendFlash { 0% { transform: scale(1.05); } 40% { transform: scale(1.1); box-shadow: 0 0 0 2px #fff, 0 0 50px 16px var(--g), 0 0 120px 40px var(--g); } 100% { transform: scale(1.02); opacity: 0; } }
        .dp-tile.is-sent { animation: sendFlash .6s var(--ease-out) forwards; }
        .dp-tile.is-sent::before { opacity: 1; --hold-progress: 360deg; }

        /* ── Elemental Balance: one continuous ribbon whose colors blend into each other (share = count),
           open fading ends, and a soft glow above and below that adds no layout height. ── */
        .dp-elements { flex-shrink: 0; display: flex; flex-direction: column; align-items: stretch; gap: 7px; padding: 0 4px; margin-bottom: -4px; }
        .dp-ebar { position: relative; height: 4px; transform-origin: center; animation: dpGrowX 1s var(--ease-out) both; }
        .dp-ebar > span { position: absolute; left: 0; right: 0; pointer-events: none; }
        .dp-eglow { top: -9px; bottom: -9px; background: var(--grad); filter: blur(3px) saturate(1.3);
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent), linear-gradient(transparent, #000 50%, transparent);
          -webkit-mask-composite: source-in;
          mask-image: linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent), linear-gradient(transparent, #000 50%, transparent);
          mask-composite: intersect;
          opacity: .6; animation: dpGlowBreath 3.6s ease-in-out 1s infinite; }
        .dp-ecore { top: 0; bottom: 0; border-radius: 4px;
          background: linear-gradient(90deg, transparent 0 40%, rgba(255,255,255,.55) 50%, transparent 60% 100%) no-repeat, linear-gradient(180deg, rgba(255,255,255,.35), transparent 70%), var(--grad);
          background-size: 30% 100%, 100% 100%, 100% 100%; background-position: -60% 0, 0 0, 0 0;
          box-shadow: 0 0 6px rgba(255,255,255,.08);
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 9%, #000 91%, transparent); mask-image: linear-gradient(90deg, transparent, #000 9%, #000 91%, transparent);
          animation: dpBarSweep 7s ease-in-out 1.4s infinite; }
        @keyframes dpGlowBreath { 0%, 100% { opacity: .5; transform: scaleY(.9); } 50% { opacity: .95; transform: scaleY(1.15); } }
        @keyframes dpBarSweep { 0% { background-position: -60% 0, 0 0, 0 0; } 45%, 100% { background-position: 160% 0, 0 0, 0 0; } }
        .dp-elabels { display: flex; gap: 3px; margin-top: -1px; }
        .dp-elabels span { flex: var(--n) 1 0; min-width: 0; text-align: center; font-size: 7.5px; font-weight: 600; letter-spacing: .12em; line-height: 1;
          white-space: nowrap; overflow: hidden; text-shadow: 0 0 8px currentColor; animation: dpFadeUp .6s ease-out calc(var(--d) + .25s) both; }
        /* Installed app (PWA): a roomier bottom above the home indicator. */
        @media (display-mode: standalone) { .dp { padding-bottom: calc(env(safe-area-inset-bottom) + 10px + var(--cap-mt) + 14px); } }
        .dp.is-pwa { padding-bottom: calc(env(safe-area-inset-bottom) + 10px + var(--cap-mt) + 14px); }
        @keyframes dpGrowX { from { transform: scaleX(0); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }
        @keyframes dpFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

        /* ── Big Three ── */
        .dp-b3-row { height: 90px; display: flex; }
        .dp-b3-cell { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
        .dp-vdiv { width: 1px; align-self: stretch; margin: 14px 0; background: linear-gradient(180deg, transparent, rgba(255,255,255,.14), transparent); }
        .dp-b3-label { font-size: 8.5px; font-weight: 500; letter-spacing: .2em; color: var(--s500); }
        .dp-b3-sign { margin-top: 3px !important; font-size: clamp(19px, 5.6vw, 23px); font-weight: 600; line-height: 1.05; color: #fff; }
        .dp-b3-deg { margin-top: 1px !important; font-size: 10.5px; color: var(--s400); font-variant-numeric: tabular-nums; }
        .dp-b3-el { margin-top: 4px !important; font-size: 8px; font-weight: 600; letter-spacing: .22em; }

        .dp-empty { margin: auto; padding: 32px 0; text-align: center; font-size: 13px; line-height: 1.6; color: var(--s400); }
        .dp-center { align-items: center; justify-content: center; }
        .dp-quiet { font-size: 13px; color: var(--s400); }

        /* ── Hold to begin: everything but the held button fades to dark over the hold ── */
        .dp-fade { transition: opacity .7s var(--ease-soft), box-shadow .7s var(--ease-soft); }
        .dp.focus-hold .dp-fade { opacity: 0 !important; pointer-events: none; transition: opacity ${HOLD_TOTAL_MS}ms var(--ease-hold), box-shadow ${HOLD_TOTAL_MS}ms var(--ease-hold); }

        /* ── Voice: everything else fades; the button pulses; waves roll out ── */
        .dp.voice-on .dp-fade { opacity: 0 !important; pointer-events: none; transition: opacity .6s var(--ease-soft); }
        .dp.voice-on .ask-box { transform: scale(calc(1 + var(--lvl, 0) * .06)); }
        .dp.voice-on .slide-mic::before { opacity: calc(.55 + var(--lvl, 0) * .45); filter: blur(calc(16px + var(--lvl, 0) * 10px)); }
        .voice-waves { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; pointer-events: none; opacity: 0; transition: opacity .5s var(--ease-soft); }
        .dp.voice-on .voice-waves { opacity: 1; }

        /* Short screens: the horoscope absorbs the difference. */
        @media (max-height: 870px) { .dp { --swipe-h: 28px; --cap-mt: 12px; } }
        @media (max-height: 680px) {
          .dp { gap: 10px; --cap-mt: 10px; }
          .dp-b3-row { height: 76px; }
          .dp-b3-sign { font-size: 20px; }
          .dp-b3-el { display: none; }
        }
        @media (max-height: 560px) { .dp { --swipe-h: 26px; } .dp-b3-sign { font-size: 19px; } }

        @media (prefers-reduced-motion: reduce) {
          .dp-shine::after { animation: none !important; opacity: 0; }
          .dp-ebar, .dp-eglow, .dp-ecore, .dp-elabels span { animation: none !important; }
          .dp-tile, .dp-tile::before, .dp-slide, .dp-arrow { animation: none !important; transition: none !important; }
          .ask-premium, .slide-mic::before, .slide-read::before, .ask-mic-halo, .mic-ready-toggle.is-nudging { animation: none !important; }
          .mic-ready-toggle, .mic-ready-knob { transition: none !important; }
          .dp-arrow.is-hint svg, .dp-pick span, .seal-hint span, .seal-hint::before, .seal-hint::after { animation: none !important; }
          .seal-title, .seal-date, .dp-horo-veil, .dp-horo-head { transition: none !important; }
          .dp-horo.is-returning .dp-horo-seal { animation: none !important; }
          .dp-horo.is-revealing:not(.is-sealed) .dp-horo-veil { animation: none !important; -webkit-mask-image: none; mask-image: none; }
        }
      `}</style>

      {/* The held reading's themed symbols (or the gold Ask theme), behind everything.
          Same component and spots as the preparing screen, so the hand-off is seamless. */}
      <ReadingAmbience themeKey={ambienceKey ?? lastAmbienceKeyRef.current} visible={!!ambienceKey} glow />

      {/* Voice waves layer (full panel, under the button). */}
      <canvas ref={wavesCanvasRef} className="voice-waves" aria-hidden="true" />

      {isLoading ? (
        <div className="dp-empty">
          <p className="dp-quiet">Reading today’s sky…</p>
        </div>
      ) : !hasChart ? (
        <p className="dp-empty">
          {chartStatus === "error" ? "Your chart couldn’t be loaded. Please try again shortly." : "Enter your birth details to reveal your day."}
        </p>
      ) : (
        <>
          {/* ── Profection Year + Today's Sky ── */}
          <section className="dp-card dp-today dp-fade" aria-label="Profection year and today's sky">
            <div className="dp-card-in">
              <div className="dp-prof">
                <div
                  className="dp-symbol dp-shine"
                  aria-hidden="true"
                  style={profColors ? { borderColor: profColors.border, boxShadow: `0 0 18px ${profColors.glow}, inset 0 0 12px ${profColors.glow}` } : undefined}
                >
                  <span style={{ color: profColors?.text ?? NEUTRAL }}>{GLYPHS[profRuler] ?? "✦"}</span>
                </div>
                <div className="dp-prof-text">
                  <p className="dp-caps dp-eyebrow">Profection Year</p>
                  <p className="dp-display dp-prof-title" style={{ color: profColors?.text ?? "#fff" }}>{profSign || "—"}</p>
                  <p className="dp-prof-sub">
                    {profHouse ? `${ordinal(profHouse)} house` : ""}
                    {profHouse && profRuler ? " · " : ""}
                    {profRuler ? `ruled by ${rulerPhrase(profRuler)}` : ""}
                  </p>
                </div>
              </div>

              <div className="dp-sky">
                <p className="dp-caps dp-eyebrow">Today’s Sky</p>
                <div className="dp-sky-row">
                  <div className="dp-sky-col">
                    <p className="dp-caps dp-sky-label">{GLYPHS.Sun} Sun Season</p>
                    <p className="dp-display dp-sky-sign" style={{ color: colorsOf(sunNow?.sign)?.text ?? "#fff" }}>{sunNow?.sign ?? "—"}</p>
                    <p className="dp-sky-detail">{sunNow?.degree ?? ""}</p>
                  </div>
                  {moonPhase ? (
                    <div className="dp-moon">
                      <MoonDisc illumination={moonPhase.illuminationPercent} waxing={waxing} size={46} />
                      <p className="dp-moon-pct">{moonPhase.illuminationPercent}%</p>
                    </div>
                  ) : (
                    <span aria-hidden="true" />
                  )}
                  <div className="dp-sky-col">
                    <p className="dp-caps dp-sky-label">{GLYPHS.Moon} Moon</p>
                    <p className="dp-display dp-sky-sign" style={{ color: colorsOf(moonSign)?.text ?? "#fff" }}>{moonSign ?? "—"}</p>
                    <p className="dp-sky-detail">{moonPhase?.phaseName ?? moonNow?.degree ?? ""}</p>
                  </div>
                </div>
                <p className="dp-sky-foot">
                  {moonPhase ? nextEventLine(moonPhase) : "Today’s sky"}
                  <span className="dp-dot">·</span>
                  <span className="dp-rx">℞</span> {retrogrades.length ? retrogrades.join(", ") : "All direct"}
                </p>
              </div>
            </div>
          </section>

          {/* ── Today's Guidance (tap to reveal) ── */}
          <section
            ref={horoSectionRef}
            className={[
              "dp-horo dp-fade",
              guidance === "sealed" || guidance === "waiting" || (guidance === "revealing" && !unsealed) ? "is-sealed" : "",
              guidance === "waiting" ? "is-waiting" : "",
              guidance === "revealing" ? "is-revealing" : "",
              guidance === "open" ? "is-open" : "",
              returning ? "is-returning" : "",
            ].join(" ")}
            aria-live="polite"
            onPointerDown={onGuidanceActivity}
            onWheel={onGuidanceActivity}
            onTouchMove={onGuidanceActivity}
          >
            <div className="dp-horo-head">
              <h2 ref={headTitleRef} className="dp-display dp-horo-title">Today’s Guidance</h2>
              <p ref={headDateRef} className="dp-caps dp-horo-date">{dateLine}</p>
            </div>
            <div className="dp-horo-veil" aria-hidden={guidance !== "open" && guidance !== "revealing"}>
              {horoscope ? (
                <p ref={horoBodyRef} className="dp-display dp-horo-body" onScroll={onGuidanceActivity}>{horoscope}</p>
              ) : guidance !== "open" ? (
                <div className="dp-horo-ghost" aria-hidden="true">
                  {[96, 88, 93, 72, 90, 64].map((w, i) => <i key={i} style={{ width: `${w}%` }} />)}
                </div>
              ) : horoscopeError ? (
                <p className="dp-horo-status">
                  {horoscopeError}{" "}
                  <button type="button" className="dp-retry" onClick={() => void fetchHoroscope()}>Try again</button>
                </p>
              ) : (
                <p className="dp-horo-status">Preparing today’s guidance…</p>
              )}
            </div>
            {guidance !== "open" && (
              <button
                type="button"
                data-no-swipe
                className="dp-horo-seal"
                onClick={tapSeal}
                aria-label={guidance === "waiting" ? "Today’s guidance is being prepared" : "Reveal today’s guidance"}
              >
                <span ref={sealTitleRef} className="seal-title">Today’s Guidance</span>
                <span ref={sealDateRef} className="seal-date">{dateLine}</span>
                {guidance === "waiting" && horoscopeError && !horoscopeLoading ? (
                  <span className="seal-error">{horoscopeError} Tap to try again.</span>
                ) : (
                  <span className="seal-hint"><span>{guidance === "waiting" ? "Reading today’s sky" : "Tap to reveal"}</span></span>
                )}
              </button>
            )}
          </section>

          {/* ── Mic + readings ── */}
          <section className="dp-ask" aria-label="Ask anything or choose a reading">
            <p className={`dp-note ${note ? "is-on" : ""}`} role="status" aria-live="polite">{note ?? ""}</p>
            <p className={`dp-pick dp-fade ${note ? "is-hidden" : ""}`} aria-hidden="true"><span>Select Reading</span></p>

            <div className="dp-switch">
              <button
                type="button"
                data-no-swipe
                className={`dp-arrow prev dp-fade dp-tap ${arrowsHint ? "is-hint" : ""} ${engaged.prev ? "is-engaged" : ""} ${tapped.prev ? "is-tapped" : ""}`}
                aria-label="Previous"
                onPointerDown={() => engage("prev")}
                onFocus={() => engage("prev")}
                onClick={() => { markArrowsUsed(); flashArrow("prev"); go(-1); }}
              >
                <ChevronLeft strokeWidth={1.6} aria-hidden="true" />
              </button>

              <div ref={askBoxRef} className="ask-box">
                {/* Slide 0: the mic */}
                <div
                  className={`dp-slide slide-mic ${onMic ? "is-current" : ""}`}
                  style={{ "--off": `${(prevSlide === 0 ? -slideDir : slideDir) * 18}px` } as React.CSSProperties}
                  aria-hidden={!onMic}
                >
                  <button
                    type="button"
                    data-no-swipe
                    tabIndex={onMic ? 0 : -1}
                    onPointerDown={startAskHold}
                    onPointerMove={moveAskHold}
                    onPointerUp={endAskHold}
                    onPointerCancel={endAskHold}
                    onContextMenu={(e) => e.preventDefault()}
                    onDragStart={(e) => e.preventDefault()}
                    className="ask-premium"
                    aria-label="Ask anything. Press and hold to speak. Swipe up to cancel."
                  >
                    <span className="ask-mic-halo"><Mic aria-hidden="true" /></span>
                  </button>
                </div>

                {/* Slides 1–4: the readings */}
                {AREAS.map((area, i) => {
                  const index = i + 1;
                  const current = slide === index;
                  const Icon = area.icon;
                  const c = area.colors;
                  const classes = [
                    "dp-tile",
                    selectedArea === area.id ? "is-on" : "",
                    holdingArea === area.id ? "is-holding" : "",
                    teaseArea === area.id ? "is-tease" : "",
                    sentArea === area.id ? "is-sent" : "",
                  ].join(" ");
                  return (
                    <div
                      key={area.id}
                      className={`dp-slide slide-read ${current ? "is-current" : ""}`}
                      style={{ "--off": `${(prevSlide === index ? -slideDir : slideDir) * 18}px`, "--t": c.text, "--g": c.glow } as React.CSSProperties}
                      aria-hidden={!current}
                    >
                      <button
                        type="button"
                        data-no-swipe
                        tabIndex={current ? 0 : -1}
                        className={classes}
                        aria-pressed={selectedArea === area.id}
                        aria-label={`${area.title}. ${area.description}. Press and hold to begin.`}
                        onPointerDown={(e) => handleTilePointerDown(e, area.id)}
                        onPointerUp={() => handleTilePointerUp(area.id)}
                        onPointerCancel={() => handleTilePointerUp(area.id, true)}
                        onKeyDown={(e) => handleTileKeyDown(e, area.id)}
                        onContextMenu={(e) => e.preventDefault()}
                        style={{ "--t": c.text, "--b": c.border, "--bg": c.bg, "--g": c.glow } as React.CSSProperties}
                      >
                        <Icon className="tile-icon" />
                        <span className="tile-label">{area.title}</span>
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                data-no-swipe
                className={`dp-arrow next dp-fade dp-tap ${arrowsHint ? "is-hint" : ""} ${engaged.next ? "is-engaged" : ""} ${tapped.next ? "is-tapped" : ""}`}
                aria-label="Next"
                onPointerDown={() => engage("next")}
                onFocus={() => engage("next")}
                onClick={() => { markArrowsUsed(); flashArrow("next"); go(1); }}
              >
                <ChevronRight strokeWidth={1.6} aria-hidden="true" />
              </button>
            </div>

            <button
              type="button"
              data-no-swipe
              className={`mic-ready-toggle dp-fade dp-tap ${micNudge ? "is-nudging" : ""} ${engaged.toggle ? "is-engaged" : ""} ${onMic ? "" : "is-away"}`}
              data-enabled={micEnabled ? "true" : "false"}
              aria-pressed={micEnabled}
              aria-label={micEnabled ? "Turn microphone off" : "Turn microphone on"}
              tabIndex={onMic ? 0 : -1}
              onPointerDown={() => engage("toggle")}
              onClick={toggleMicrophone}
              onAnimationEnd={() => setMicNudge(false)}
              disabled={micConnecting || isTranscribingAsk}
            >
              <span className="mic-ready-knob" />
            </button>
          </section>

          {/* ── Elemental Balance ── */}
          <section
            className="dp-elements dp-fade"
            role="img"
            aria-label={`Elemental balance: ${ELEMENT_ORDER.map((el) => `${el} ${elementCounts[el]}`).join(", ")}`}
          >
            <div className="dp-ebar" aria-hidden="true" style={{ "--grad": elementGradient(elementCounts) } as React.CSSProperties}>
              <span className="dp-eglow" />
              <span className="dp-ecore" />
            </div>
            <div className="dp-elabels" aria-hidden="true">
              {presentElements.map((el, i) => (
                <span
                  key={el}
                  className="dp-caps"
                  style={{ "--n": elementCounts[el], color: ELEMENT_COLORS[el].text, "--d": `${i * 0.14}s` } as React.CSSProperties}
                >
                  {el}
                </span>
              ))}
            </div>
          </section>

          {/* ── Big Three ── */}
          <section className="dp-card dp-fade" aria-label="Big Three">
            <div
              className="dp-card-in dp-shine"
              style={{ background: `linear-gradient(90deg, ${tint[0]}1F, ${tint[1]}1A 50%, ${tint[2]}1F), linear-gradient(170deg, rgba(10,13,28,.97), rgba(5,8,20,.97))` }}
            >
              <div className="dp-b3-row">
                {bigThree.map(({ label, p }, i) => {
                  const c = colorsOf(p?.sign);
                  return (
                    <React.Fragment key={label}>
                      {i > 0 && <span className="dp-vdiv" aria-hidden="true" />}
                      <div className="dp-b3-cell">
                        <p className="dp-caps dp-b3-label">{label}</p>
                        <p className="dp-display dp-b3-sign" style={{ color: c?.text ?? "#fff" }}>{p?.sign ?? "—"}</p>
                        <p className="dp-b3-deg">{p?.degree ?? ""}</p>
                        {p && c && <p className="dp-caps dp-b3-el" style={{ color: c.text }}>{elementOf(p.sign)}</p>}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </section>
        </>
      )}

      {/* Full-screen fade to black when a reading (held button or voice) is opening. */}
      {portalReady && createPortal(
        <motion.div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[9998] bg-black"
          initial={false}
          animate={{ opacity: voiceNavigating || readingFade ? 1 : 0 }}
          transition={{ duration: shouldReduceMotion ? 0.08 : 0.5, ease: [0.22, 1, 0.36, 1] }}
        />,
        document.body,
      )}

      {/* Embedded Stripe checkout (no credits). */}
      {clientSecret && portalReady && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(4,6,17,0.85)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "24px 16px calc(24px + env(safe-area-inset-bottom))" }}>
          <div style={{ width: "100%", maxWidth: 480 }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => { setClientSecret(null); setIsCreatingReading(false); }}
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
                    // Wait for the webhook to grant the reading credit, then continue.
                    for (let i = 0; i < 10; i++) {
                      try {
                        const res = await fetch("/api/user/credits", { cache: "no-store" });
                        const d = await res.json();
                        if (Number(d.credits ?? 0) >= 1 || d.isSubscribed === true) break;
                      } catch { /* retry */ }
                      await new Promise((r) => setTimeout(r, 800));
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
        document.body,
      )}
    </div>
  );
}
