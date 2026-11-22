"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Crown, LockKeyhole, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { loadChart } from "@/lib/chartStore";
import { PLANET_MEANING, SIGN_MEANING, HOUSE_MEANING } from "@/lib/chartMeanings";
import {
  deleteSavedReading,
  listSavedReadings,
  MAX_SAVED_READINGS,
  type SavedReadingRecord,
} from "@/lib/savedReadingsStore";

/**
 * YOUR BIRTH CHART — one screen, five views, no page scroll.
 *
 *   Profection (opens first) · My Chart · Learn More · Saved Readings · Upgrade Chart
 *
 * • Tap anywhere on the content to go to the next view. The names under the
 *   content show previous · current · next; tap a faded one to jump to it.
 * • On Profection and Learn More, tapping the left half goes back a
 *   placement and the right half goes forward (instant switch).
 * • Only the main headers and the Big Three sit in glowing cards; everything
 *   else floats on PagerContainer's starfield (this panel has no background).
 *
 * Built from the approved style-lab mockup. The panel fills the pager slot
 * exactly (100dvh) and does not scroll.
 */

interface UserStatus {
  credits: number;
  isSubscribed: boolean;
  readingsCompleted: number;
  onCooldown: boolean;
  cooldownExpiresAt: string | null;
  canBypass: boolean;
}

interface BirthChartPanelProps {
  userStatus: UserStatus | null;
  /** Kept for compatibility. The horoscope now lives on its own panel. */
  dailyHoroscope?: string | null;
  onOpenHoroscope?: () => Promise<string | null | void> | string | null | void;
  onOpenReadings?: () => void;
  onOpenUpgradeChart?: () => void;
}

interface NatalPlacement {
  name: string;
  sign: string;
  degree: string;
  house?: number;
}

interface UpgradeChartPoint {
  id: string;
  name: string;
  sourceName?: string;
  category: "placement" | "angle" | "point";
  sign: string;
  degree: string;
  house: string;
}

interface ProfectionData {
  profectionYear: number;
  age: number;
  activatedSign: string;
  activatedHouse?: number;
  timeLord: string;
}

interface BirthInfo {
  place: string;
  date: string;
  time: string;
}

type ViewKey = "profection" | "chart" | "learn" | "saved" | "upgrade";

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "profection", label: "Profection" },
  { key: "chart", label: "My Chart" },
  { key: "learn", label: "Learn More" },
  { key: "saved", label: "Saved Readings" },
  { key: "upgrade", label: "Upgrade Chart" },
];

/* ── Chart vocabulary ─────────────────────────────────────────────────── */

// U+FE0E forces text presentation so iOS never swaps these for emoji.
const T = "︎";
const GLYPHS: Record<string, string> = {
  Sun: `☉${T}`, Moon: `☽${T}`, Mercury: `☿${T}`, Venus: `♀${T}`, Mars: `♂${T}`,
  Jupiter: `♃${T}`, Saturn: `♄${T}`, Uranus: `♅${T}`, Neptune: `♆${T}`,
  Pluto: `♇${T}`, Chiron: `⚷${T}`, Lilith: `⚸${T}`,
  "North Node": `☊${T}`, "South Node": `☋${T}`,
  Ascendant: `↑${T}`, Descendant: `↓${T}`,
  MC: "MC", IC: "IC", Vertex: "Vx", "Part of Fortune": `⊗${T}`,
};

const NATAL_ORDER = [
  "Sun", "Moon", "Ascendant", "Mercury", "Venus", "Mars",
  "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "Chiron",
  "North Node", "South Node", "Lilith", "Part of Fortune", "Vertex",
  "MC", "IC", "Descendant",
];

/** Big Three + planets: stepped through on Profection and free in Learn More. */
const CORE_ORDER = [
  "Sun", "Moon", "Ascendant", "Mercury", "Venus", "Mars",
  "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
];

/** Members-only Learn More placements, shown after the 11 free ones. */
const PREMIUM_LEARN = ["North Node", "Chiron", "MC"];

/** My Chart table: 13 rows that fit at a glance. */
const TABLE_ORDER = [...CORE_ORDER, "North Node", "MC"];

const DISPLAY_NAMES: Record<string, string> = { Ascendant: "Rising", MC: "Midheaven" };
const SHORT_NAMES: Record<string, string> = { "North Node": "N. Node" };

const POINT_MEANING: Record<string, string> = {
  Chiron: "Chiron describes a tender area of the chart where vulnerability can become insight, skill, and healing over time.",
  "North Node": "The North Node points toward qualities and experiences that stretch you beyond familiar patterns and support long-term growth.",
  "South Node": "The South Node describes familiar instincts, practiced patterns, and abilities that come easily but can become a default setting.",
  Lilith: "Lilith highlights raw autonomy, boundaries, desire, and the parts of yourself that resist being controlled or made more acceptable for others.",
  "Part of Fortune": "The Part of Fortune is a calculated point associated with ease, vitality, material flow, and circumstances that can support a sense of natural alignment.",
  Vertex: "The Vertex is a calculated chart point often associated in modern astrology with consequential encounters, turning points, and experiences that arrive through other people.",
  MC: "The Midheaven describes public direction, vocation, reputation, achievement, and the way your life becomes visible in the wider world.",
  IC: "The IC describes roots, home, family foundations, private life, and the inner base you return to when the public world falls away.",
  Descendant: "The Descendant describes one-to-one partnership, what you seek or meet through other people, and the qualities relationships call forward in you.",
};

const SIGN_RULERS: Record<string, string> = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon",
  Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Mars",
  Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter",
};

/* ── The four elements ─────────────────────────────────────────────── */
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

/* Saved readings (matches the dashboard's My Readings grid) */
const READINGS_PER_PAGE = 8;
const READING_PAGES = 3;
const FREE_SLOT_COUNT = 8;
const PLUS_SLOT_COUNT = 16;
const LONG_PRESS_MS = 550;

/* ── Helpers ────────────────────────────────────────────────────────── */

function elementOf(sign?: string): Element | null {
  if (!sign) return null;
  return SIGN_ELEMENTS[sign] ?? null;
}

function colorsOf(sign?: string) {
  const el = elementOf(sign);
  return el ? ELEMENT_COLORS[el] : null;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function displayName(name: string) {
  return DISPLAY_NAMES[name] ?? name;
}

function rulerPhrase(sign: string) {
  const r = SIGN_RULERS[sign];
  if (!r) return "";
  return r === "Sun" || r === "Moon" ? `the ${r}` : r;
}

function meaningFor(p: NatalPlacement) {
  return POINT_MEANING[p.name] ?? PLANET_MEANING[p.name] ?? PLANET_MEANING[displayName(p.name)] ?? "";
}

/** "1998-07-28" → "July 28, 1998" without timezone drift. */
function formatBirthDate(value?: string): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${months[Number(m[2]) - 1] ?? ""} ${Number(m[3])}, ${m[1]}`;
}

/** "15:42" → "3:42 PM". Leaves anything else untouched. */
function formatBirthTime(value?: string): string {
  if (!value) return "";
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return value;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

function formatTopic(topic: string) {
  return topic.replace(/[_-]+/g, " ").trim() || "Reading";
}

function formatSavedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "2-digit" }).format(date);
}

/* ── Panel ──────────────────────────────────────────────────────────── */
export default function BirthChartPanel({ userStatus }: BirthChartPanelProps) {
  const router = useRouter();
  const [natal, setNatal] = useState<NatalPlacement[]>([]);
  const [profection, setProfection] = useState<ProfectionData | null>(null);
  const [birth, setBirth] = useState<BirthInfo>({ place: "", date: "", time: "" });
  const [isLoading, setIsLoading] = useState(true);

  const [view, setView] = useState<ViewKey>("profection");
  const [carDir, setCarDir] = useState<-1 | 0 | 1>(0);
  const [placeIdx, setPlaceIdx] = useState(0);
  const [learnIdx, setLearnIdx] = useState(0);

  const [readings, setReadings] = useState<SavedReadingRecord[]>([]);
  const [readingPage, setReadingPage] = useState(0);
  const [selectedReadingId, setSelectedReadingId] = useState<string | null>(null);
  const [readingsError, setReadingsError] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const isMember = userStatus?.isSubscribed === true;
  const capacity = isMember ? PLUS_SLOT_COUNT : FREE_SLOT_COUNT;

  /* Load the chart (retry briefly while it is being calculated). */
  useEffect(() => {
    let cancelled = false;
    const tryLoad = () => {
      const chart = loadChart();
      if (!chart?.chartData) return false;
      const data = chart.chartData as unknown as {
        profection?: ProfectionData;
        tropical?: { planets?: NatalPlacement[] };
        upgradeChartPoints?: UpgradeChartPoint[];
      };
      if (data.profection) setProfection(data.profection);
      const planets = data.tropical?.planets ?? [];
      const upgradePoints = data.upgradeChartPoints ?? [];
      const placements: NatalPlacement[] = upgradePoints.length
        ? upgradePoints.map((point) => ({
            name: point.name,
            sign: point.sign,
            degree: point.degree,
            house: point.house ? Number(point.house) : undefined,
          }))
        : planets;
      setNatal(
        placements
          .filter((p) => NATAL_ORDER.includes(p.name))
          .sort((a, b) => NATAL_ORDER.indexOf(a.name) - NATAL_ORDER.indexOf(b.name)),
      );
      const stored = chart as unknown as { birthPlace?: string; birthDate?: string; birthTime?: string };
      setBirth({
        place: stored.birthPlace ?? "",
        date: formatBirthDate(stored.birthDate),
        time: formatBirthTime(stored.birthTime),
      });
      setIsLoading(false);
      return true;
    };
    if (tryLoad()) return;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (cancelled || tryLoad() || attempts > 20) {
        clearInterval(interval);
        if (attempts > 20) setIsLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  /* Saved readings come from this device's IndexedDB. */
  const refreshReadings = useCallback(async () => {
    try {
      setReadings(await listSavedReadings());
      setReadingsError(null);
    } catch {
      setReadingsError("Your saved readings could not be opened on this device.");
    }
  }, []);

  useEffect(() => {
    if (view === "saved") void refreshReadings();
  }, [view, refreshReadings]);

  useEffect(() => () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, []);

  /* ── Derived chart data ── */
  const find = useCallback((n: string) => natal.find((p) => p.name === n), [natal]);
  const bigThree = useMemo(
    () => [
      { label: "Sun", p: find("Sun") },
      { label: "Moon", p: find("Moon") },
      { label: "Rising", p: find("Ascendant") },
    ],
    [find],
  );

  const coreRows = useMemo(
    () => CORE_ORDER.map((n) => find(n)).filter((p): p is NatalPlacement => !!p),
    [find],
  );
  const learnRows = useMemo(
    () => [
      ...coreRows.map((p) => ({ ...p, premium: false })),
      ...PREMIUM_LEARN.map((n) => find(n)).filter((p): p is NatalPlacement => !!p).map((p) => ({ ...p, premium: true })),
    ],
    [coreRows, find],
  );
  const tableRows = useMemo(
    () => TABLE_ORDER.map((n) => find(n)).filter((p): p is NatalPlacement => !!p),
    [find],
  );

  const elementCounts = useMemo(() => {
    const counts: Record<Element, number> = { Fire: 0, Earth: 0, Air: 0, Water: 0 };
    coreRows.forEach((p) => {
      const el = elementOf(p.sign);
      if (el) counts[el] += 1;
    });
    return counts;
  }, [coreRows]);
  const maxCount = Math.max(...ELEMENT_ORDER.map((el) => elementCounts[el]), 1);

  const currentPlacement = coreRows.length ? coreRows[placeIdx % coreRows.length] : undefined;
  const currentLearn = learnRows.length ? learnRows[learnIdx % learnRows.length] : undefined;

  const profSign = profection?.activatedSign ?? "";
  const profColors = colorsOf(profSign);
  const profRuler = profection?.timeLord || SIGN_RULERS[profSign] || "";
  const profHouse =
    typeof profection?.activatedHouse === "number"
      ? profection.activatedHouse
      : typeof profection?.profectionYear === "number"
        ? profection.profectionYear
        : null;

  /* Glow: Sun / Moon / Rising element colors + the sign in focus.
     Learn More uses only the current placement's color. */
  const glow = useMemo(() => {
    const hex = (sign?: string) => colorsOf(sign)?.bar ?? NEUTRAL;
    if (view === "learn") {
      const c = hex(currentLearn?.sign);
      return [c, c, c, c];
    }
    const focus = view === "profection" ? currentPlacement?.sign : profSign || bigThree[0].p?.sign;
    return [hex(bigThree[0].p?.sign), hex(bigThree[1].p?.sign), hex(bigThree[2].p?.sign), hex(focus)];
  }, [view, currentLearn, currentPlacement, profSign, bigThree]);

  /* ── Navigation ── */
  const viewIndex = VIEWS.findIndex((v) => v.key === view);
  const goToView = useCallback(
    (nextIndex: number) => {
      const n = VIEWS.length;
      const i = ((nextIndex % n) + n) % n;
      setCarDir(i === (viewIndex + 1) % n ? 1 : i === (viewIndex - 1 + n) % n ? -1 : 0);
      setSelectedReadingId(null);
      if (VIEWS[i].key === "learn") setLearnIdx(placeIdx % Math.max(coreRows.length, 1));
      setView(VIEWS[i].key);
    },
    [viewIndex, placeIdx, coreRows.length],
  );
  const nextView = () => goToView(viewIndex + 1);

  /** Left half = back, right half = forward. */
  const sideOf = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientX < r.left + r.width / 2 ? -1 : 1;
  };

  const stepPlacement = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    if (!coreRows.length) return;
    const n = coreRows.length;
    const dir = sideOf(e); // read now: React clears currentTarget after the handler
    setPlaceIdx((i) => (i + dir + n) % n);
  };

  const stepLearn = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    if (!learnRows.length) return;
    const n = learnRows.length;
    const next = (learnIdx + sideOf(e) + n) % n;
    setLearnIdx(next);
    if (!learnRows[next].premium) setPlaceIdx(next);
  };

  const openInLearnMore = (name: string) => {
    const li = learnRows.findIndex((p) => p.name === name);
    const ci = coreRows.findIndex((p) => p.name === name);
    if (ci >= 0) setPlaceIdx(ci);
    setCarDir(VIEWS.findIndex((v) => v.key === "learn") > viewIndex ? 1 : -1);
    setLearnIdx(li >= 0 ? li : 0);
    setView("learn");
  };

  /* ── Saved readings interactions ── */
  const clearLongPress = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };
  const beginLongPress = (id: string) => {
    clearLongPress();
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setSelectedReadingId(id);
    }, LONG_PRESS_MS);
  };
  const handleReadingClick = (reading: SavedReadingRecord) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    if (selectedReadingId) {
      setSelectedReadingId(null);
      return;
    }
    router.push(`/reading/results?saved=${encodeURIComponent(reading.id)}`);
  };
  const removeReading = async (id: string) => {
    try {
      await deleteSavedReading(id);
      setSelectedReadingId(null);
      await refreshReadings();
    } catch {
      setReadingsError("That reading could not be removed. Please try again.");
    }
  };

  /* ── Render ── */
  if (isLoading) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center">
        <div className="text-sm text-slate-400">Casting your chart…</div>
      </div>
    );
  }

  const hasChart = natal.length > 0;
  const birthLine = [birth.place, birth.date, birth.time].filter(Boolean).join(" · ");

  const glowVars = {
    "--c1": glow[0],
    "--c2": glow[1],
    "--c3": glow[2],
    "--c4": glow[3],
  } as React.CSSProperties;

  const BigThreeCard = (
    <div className="bcp-gcard">
      <div className="bcp-gcard-in"><div className="bcp-shine bcp-big3" style={{ background: `linear-gradient(90deg, ${glow[0]}1F, ${glow[1]}1A 50%, ${glow[2]}1F)` }}>
        {bigThree.map(({ label, p }, i) => {
          const c = colorsOf(p?.sign);
          return (
            <React.Fragment key={label}>
              {i > 0 && <span className="bcp-vdiv" aria-hidden="true" />}
              <div className="bcp-big3-cell">
                <p className="bcp-caps bcp-big3-label">{label}</p>
                <p className="bcp-display bcp-big3-sign">{p?.sign ?? "—"}</p>
                <p className="bcp-big3-deg">{p?.degree ?? ""}</p>
                {p && <p className="bcp-caps bcp-big3-el" style={{ color: c?.text }}>{elementOf(p.sign)}</p>}
              </div>
            </React.Fragment>
          );
        })}
      </div></div>
    </div>
  );

  const symbolBox = (glyph: string, sign?: string) => {
    const c = colorsOf(sign);
    return (
      <div
        className="bcp-symbol bcp-shine"
        aria-hidden="true"
        style={c ? { borderColor: c.border, boxShadow: `0 0 18px ${c.glow}, inset 0 0 12px ${c.glow}` } : undefined}
      >
        <span style={{ color: c?.text ?? NEUTRAL }}>{glyph}</span>
      </div>
    );
  };

  const renderProfection = () => (
    <>
      <div className="bcp-gcard">
        <div className="bcp-gcard-in"><div
          className="bcp-header"
          style={{ background: `linear-gradient(90deg, ${(profColors?.bar ?? NEUTRAL)}24, ${(profColors?.bar ?? NEUTRAL)}0A 60%, transparent)` }}
        >
          {symbolBox(GLYPHS[profRuler] ?? "✦", profSign)}
          <div className="bcp-header-text">
            <p className="bcp-caps bcp-eyebrow">Profection Year</p>
            <p className="bcp-display bcp-header-title" style={{ color: profColors?.text ?? "#fff" }}>{profSign || "—"}</p>
            <p className="bcp-header-sub">
              {profHouse ? `${ordinal(profHouse)} house` : ""}
              {profHouse && profRuler ? " · " : ""}
              {profRuler ? `ruled by ${profRuler}` : ""}
            </p>
          </div>
        </div></div>
      </div>

      {birthLine && <p className="bcp-birth bcp-birth-tuck">{birthLine}</p>}

      {currentPlacement && (
        <button
          type="button"
          className="bcp-placement"
          onClick={stepPlacement}
          aria-label={`${displayName(currentPlacement.name)} in ${currentPlacement.sign}. Tap the left side for the previous placement, the right side for the next.`}
        >
          <span className="bcp-placement-title bcp-display">
            <span>
              {displayName(currentPlacement.name)} in{" "}
              <span style={{ color: colorsOf(currentPlacement.sign)?.text }}>{currentPlacement.sign}</span>
            </span>
            <span
              aria-hidden="true"
              className="bcp-placement-glyph"
              style={{ color: colorsOf(currentPlacement.sign)?.text, textShadow: `0 0 18px ${colorsOf(currentPlacement.sign)?.glow ?? "transparent"}` }}
            >
              {GLYPHS[currentPlacement.name] ?? "✦"}
            </span>
          </span>
          <span className="bcp-placement-meta">
            <span className="bcp-caps" style={{ color: colorsOf(currentPlacement.sign)?.text }}>{elementOf(currentPlacement.sign)}</span>
            <span className="bcp-dot">·</span>
            {currentPlacement.degree}
            {currentPlacement.house ? ` · ${ordinal(currentPlacement.house)} house` : ""}
          </span>
          <span className="bcp-desc bcp-display">
            {[meaningFor(currentPlacement), SIGN_MEANING[currentPlacement.sign], currentPlacement.house ? HOUSE_MEANING[String(currentPlacement.house)] : null]
              .filter(Boolean)
              .join(" ")}
          </span>
        </button>
      )}

      <div
        className="bcp-elements"
        role="img"
        aria-label={`Elemental balance: ${ELEMENT_ORDER.map((el) => `${el} ${elementCounts[el]}`).join(", ")}`}
      >
        {ELEMENT_ORDER.map((el, i) => {
          const c = ELEMENT_COLORS[el];
          const h = 8 + Math.round((elementCounts[el] / maxCount) * 46);
          return (
            <div key={el} className="bcp-el" aria-hidden="true">
              <span
                className="bcp-el-bar"
                style={{ height: h, background: c.bar, ["--eb" as string]: c.glow, ["--ebd" as string]: `${i * 0.14}s` } as React.CSSProperties}
              />
              <span className="bcp-el-num" style={{ ["--ebd" as string]: `${i * 0.14}s` } as React.CSSProperties}>
                <span className="bcp-display bcp-el-count">{elementCounts[el]}</span>
                <span className="bcp-caps bcp-el-name" style={{ color: c.text }}>{el}</span>
              </span>
            </div>
          );
        })}
      </div>

      {BigThreeCard}
    </>
  );

  const renderChart = () => (
    <div className="bcp-table">
      {tableRows.map((r) => {
        const c = colorsOf(r.sign);
        return (
          <button
            type="button"
            key={r.name}
            className="bcp-row"
            onClick={(e) => {
              e.stopPropagation();
              openInLearnMore(r.name);
            }}
            aria-label={`${r.sign} ${r.degree}, ${displayName(r.name)}${r.house ? `, ${ordinal(r.house)} house` : ""}. Learn more`}
          >
            <span className="bcp-row-sign">
              <span className="bcp-display" style={{ color: c?.text }}>{r.sign}</span>
              <span className="bcp-row-deg">{r.degree}</span>
            </span>
            <span className="bcp-row-place">
              <span aria-hidden="true" className="bcp-row-glyph" style={{ color: c?.text }}>{GLYPHS[r.name] ?? "•"}</span>
              <span className="bcp-display bcp-row-text">
                {SHORT_NAMES[r.name] ?? displayName(r.name)}
                {r.house ? `, ${ordinal(r.house)} House` : ""}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );

  const renderLearn = () => {
    const p = currentLearn;
    if (!p) return null;
    const c = colorsOf(p.sign);
    const locked = p.premium && !isMember;
    const name = displayName(p.name);
    const house = p.house ? HOUSE_MEANING[String(p.house)] : "";
    return (
      <>
        <div className="bcp-gcard">
          <div className="bcp-gcard-in"><div className="bcp-header" style={{ background: `linear-gradient(90deg, ${(c?.bar ?? NEUTRAL)}24, ${(c?.bar ?? NEUTRAL)}0A 60%, transparent)` }}>
            {symbolBox(GLYPHS[p.name] ?? "✦", p.sign)}
            <div className="bcp-header-text">
              <p className="bcp-caps bcp-eyebrow">Learn More{p.premium ? " · Plus" : ""}</p>
              <p className="bcp-display bcp-header-title bcp-fit">
                {name} in <span style={{ color: c?.text }}>{p.sign}</span>
              </p>
              <p className="bcp-header-sub">
                {p.house ? `${ordinal(p.house)} house · ` : ""}ruled by {rulerPhrase(p.sign)}
              </p>
            </div>
          </div></div>
        </div>

        <p className="bcp-birth bcp-written">
          Written by <span className="bcp-written-line" aria-label="author to be added" />
        </p>

        <button type="button" className="bcp-article" onClick={stepLearn} aria-label={`${name} in ${p.sign}. Tap the left side for the previous placement, the right side for the next.`}>
          {locked ? (
            <span className="bcp-locked">
              <span className="bcp-locked-blur" aria-hidden="true">
                <span className="bcp-display bcp-lead">{meaningFor(p)}</span>
                <span className="bcp-display bcp-para">{SIGN_MEANING[p.sign]}</span>
              </span>
              <span className="bcp-locked-card">
                <LockKeyhole aria-hidden="true" className="h-5 w-5" style={{ color: "#F1D694" }} />
                <span className="bcp-caps bcp-locked-eyebrow">Members Only</span>
                <span className="bcp-display bcp-locked-text">Your {name} reading is part of AstroProXL Plus.</span>
                <span className="bcp-pill bcp-pill-gold">Coming Soon</span>
              </span>
            </span>
          ) : (
            <span className="bcp-article-body">
              <span className="bcp-display bcp-lead">{meaningFor(p)}</span>
              <span className="bcp-caps bcp-section">The sign</span>
              <span className="bcp-display bcp-para">
                {SIGN_MEANING[p.sign]} Here it colors how your {name} expresses itself, giving it the {elementOf(p.sign)?.toLowerCase()} quality of {p.sign}.
              </span>
              {house && (
                <>
                  <span className="bcp-caps bcp-section">The house</span>
                  <span className="bcp-display bcp-para">{house} With your {name} placed here, this is the part of life where it does its work.</span>
                </>
              )}
              <span className="bcp-caps bcp-section">In your life</span>
              <span className="bcp-display bcp-para">
                Notice where {p.sign} shows up when your {name} is active: in what you choose, what you protect, and what you keep coming back to.
              </span>
            </span>
          )}
          <span className="bcp-counter" aria-live="polite">
            {p.premium && <LockKeyhole aria-hidden="true" className="h-[9px] w-[9px]" style={{ color: "#F1D694" }} />}
            {(learnIdx % learnRows.length) + 1} / {learnRows.length}
          </span>
        </button>
      </>
    );
  };

  const renderSaved = () => {
    const pageStart = readingPage * READINGS_PER_PAGE;
    const total = Math.min(readings.length, MAX_SAVED_READINGS);
    return (
      <>
        <p className="bcp-birth">
          {readingsError ?? `${total} of ${capacity} saved · press and hold to remove`}
        </p>
        <div className="bcp-saved">
          <div className="bcp-crown-row">{readingPage > 0 && <Crown className="h-[15px] w-[15px]" aria-label="Astro Plus spaces" style={{ color: "#d9c795" }} />}</div>
          <div className="bcp-reading-grid">
            {Array.from({ length: READINGS_PER_PAGE }, (_, k) => {
              const gi = pageStart + k;
              const reading = readings[gi];
              if (reading) {
                const selected = selectedReadingId === reading.id;
                return (
                  <button
                    type="button"
                    key={reading.id}
                    className={`bcp-tile${selected ? " selected" : ""}`}
                    onPointerDown={() => beginLongPress(reading.id)}
                    onPointerUp={clearLongPress}
                    onPointerCancel={clearLongPress}
                    onPointerLeave={clearLongPress}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReadingClick(reading);
                    }}
                    aria-pressed={selected}
                    aria-label={selected ? `${formatTopic(reading.topic)} selected for deletion` : `Open ${formatTopic(reading.topic)} reading from ${formatSavedDate(reading.savedAt)}`}
                  >
                    <span className="bcp-tile-topic">{formatTopic(reading.topic)}</span>
                    <span className="bcp-tile-date">{formatSavedDate(reading.savedAt)}</span>
                  </button>
                );
              }
              const locked = gi >= capacity;
              return (
                <div key={`empty-${gi}`} className={`bcp-empty${locked ? " locked" : ""}`} aria-label={locked ? "Membership saved reading space" : "Available saved reading space"}>
                  <span />
                </div>
              );
            })}
          </div>
          {readings.length === 0 && readingPage === 0 && !readingsError && (
            <p className="bcp-display bcp-empty-copy">Saved readings will appear among the stars.</p>
          )}
          <nav className="bcp-pages" aria-label="Reading pages">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedReadingId(null);
                setReadingPage((p) => Math.max(0, p - 1));
              }}
              disabled={readingPage === 0}
              aria-label="Previous readings page"
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            {selectedReadingId ? (
              <button
                type="button"
                className="bcp-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  void removeReading(selectedReadingId);
                }}
              >
                Delete
              </button>
            ) : (
              <span>{readingPage + 1} / {READING_PAGES}</span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedReadingId(null);
                setReadingPage((p) => Math.min(READING_PAGES - 1, p + 1));
              }}
              disabled={readingPage === READING_PAGES - 1}
              aria-label="Next readings page"
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </nav>
        </div>
      </>
    );
  };

  const renderUpgrade = () => (
    <div className="bcp-upgrade">
      <div className="bcp-upgrade-icon"><Crown aria-hidden="true" className="h-[18px] w-[18px]" /></div>
      <p className="bcp-display bcp-upgrade-title">Upgrade Chart</p>
      <p className="bcp-upgrade-text">Add every point and aspect to your chart for deeper readings.</p>
      <span className="bcp-pill bcp-pill-gold">Coming Soon</span>
    </div>
  );

  const carousel = [-2, -1, 0, 1, 2].map((offset) => {
    const n = VIEWS.length;
    return { offset, index: (viewIndex + offset + n * 2) % n };
  });

  return (
    <div className="bcp" style={glowVars}>
      <style jsx global>{`
        .bcp {
          --display: var(--font-display), "Cormorant Garamond", Georgia, serif;
          --caps: var(--font-caps), Cinzel, Georgia, serif;
          --s100: #F1F5F9; --s200: #E2E8F0; --s300: #CBD5E1; --s400: #94A3B8; --s500: #64748B; --s600: #475569;
          position: relative;
          box-sizing: border-box;
          height: 100dvh;
          width: 100%;
          min-width: 0;
          overflow: hidden;
          color: var(--s100);
          font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
          display: flex;
          flex-direction: column;
          padding: calc(env(safe-area-inset-top) + 6px) clamp(12px, 4vw, 16px) calc(env(safe-area-inset-bottom) + 2px);
          transition: --c1 .5s ease-in-out, --c2 .5s ease-in-out, --c3 .5s ease-in-out, --c4 .44s ease-in-out;
        }
        .bcp * { box-sizing: border-box; }
        :where(.bcp) :where(p) { margin: 0; }
        :where(.bcp) :where(button) { font: inherit; color: inherit; }
        .bcp-display { font-family: var(--display); }
        .bcp-caps { font-family: var(--caps); text-transform: uppercase; }

        @property --bcp-flow { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
        @property --c1 { syntax: "<color>"; inherits: true; initial-value: #ffffff; }
        @property --c2 { syntax: "<color>"; inherits: true; initial-value: #ffffff; }
        @property --c3 { syntax: "<color>"; inherits: true; initial-value: #ffffff; }
        @property --c4 { syntax: "<color>"; inherits: true; initial-value: #ffffff; }
        @keyframes bcpFlow { to { --bcp-flow: 360deg; } }

        /* Content area: tap to go to the next view */
        .bcp-view { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
        .bcp-view > * { animation: bcpFade .26s ease-out both; }
        @keyframes bcpFade { from { opacity: 0; } to { opacity: 1; } }

        /* Flowing glow cards (headers + Big Three only) */
        .bcp-gcard {
          position: relative; isolation: isolate; flex-shrink: 0; border-radius: 22px; padding: 1.5px;
          background: conic-gradient(from var(--bcp-flow), var(--c1) 0deg, var(--c2) 90deg, var(--c3) 180deg, var(--c4) 270deg, var(--c1) 360deg);
          animation: bcpFlow 10s linear infinite;
        }
        .bcp-gcard::before { content: ""; position: absolute; inset: -2px; z-index: -1; border-radius: inherit; background: inherit; filter: blur(18px); opacity: .6; pointer-events: none; }
        .bcp-gcard::after { content: ""; position: absolute; inset: -10px; z-index: -2; border-radius: inherit; background: inherit; filter: blur(36px); opacity: .24; pointer-events: none; }
        .bcp-gcard-in { border-radius: 20.5px; overflow: hidden; background: linear-gradient(170deg, rgba(10,13,28,.97), rgba(5,8,20,.97)); }

        @keyframes bcpShine { 0% { transform: translateX(-140%) skewX(-18deg); } 60%, 100% { transform: translateX(240%) skewX(-18deg); } }
        .bcp-shine { position: relative; overflow: hidden; isolation: isolate; }
        .bcp-shine::after {
          content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 45%; pointer-events: none; z-index: 1;
          background: linear-gradient(105deg, transparent 0%, rgba(255,255,255,.09) 45%, rgba(255,255,255,.16) 50%, rgba(255,255,255,.09) 55%, transparent 100%);
          transform: translateX(-140%) skewX(-18deg); animation: bcpShine 4.6s ease-in-out infinite;
        }
        .bcp-shine > * { position: relative; z-index: 2; }

        /* Header (Profection Year / Learn More) */
        .bcp-header { position: relative; height: 90px; display: flex; align-items: center; justify-content: center; padding: 0 74px; }
        .bcp-symbol { position: absolute; left: 18px; top: 50%; margin-top: -23px; width: 46px; height: 46px; border-radius: 14px; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.2); display: flex; align-items: center; justify-content: center; font-size: 21px; }
        .bcp-header-text { text-align: center; min-width: 0; }
        .bcp-eyebrow { font-size: 8.5px; font-weight: 500; letter-spacing: .3em; color: rgba(241,214,148,.9); }
        .bcp-header-title { margin-top: 2px !important; font-size: 32px; font-weight: 500; line-height: 1.05; color: #fff; white-space: nowrap; }
        .bcp-header-title.bcp-fit { font-size: clamp(18px, 6.6vw, 30px); }
        .bcp-header-sub { margin-top: 3px !important; font-size: 10.5px; color: var(--s400); white-space: nowrap; }

        /* Birth line / quiet sub-lines */
        .bcp-birth { flex-shrink: 0; text-align: center; font-size: 10.5px; line-height: 1.3; color: var(--s400); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .bcp-birth-tuck { margin-top: -4px !important; }
        .bcp-written { display: flex; align-items: center; justify-content: center; gap: 8px; height: 22px; }
        .bcp-written-line { display: inline-block; width: 90px; height: 1px; margin-top: 8px; background: rgba(255,255,255,.22); }

        /* Profection placement */
        .bcp-placement { flex: 1; min-height: 0; width: 100%; min-width: 0; overflow: hidden; display: flex; flex-direction: column; align-items: flex-start; text-align: left; border: 0; background: none; padding: 0 4px; cursor: pointer; }
        .bcp-placement-title { max-width: 100%; display: flex; align-items: center; gap: 10px; font-size: clamp(24px, 7.4vw, 30px); font-weight: 500; line-height: 1.1; color: #fff; white-space: nowrap; }
        .bcp-placement-glyph { font-size: .78em; line-height: 1; }
        .bcp-placement-meta { margin-top: 2px; font-size: 12px; color: var(--s400); white-space: nowrap; }
        .bcp-placement-meta .bcp-caps { font-size: 9px; font-weight: 600; letter-spacing: .2em; }
        .bcp-dot { margin: 0 6px; color: var(--s600); }
        .bcp-desc { margin-top: 6px; flex: 1; min-height: 0; width: 100%; overflow-y: auto; font-size: 16.5px; line-height: 1.42; color: var(--s200); scrollbar-width: none; -webkit-mask-image: linear-gradient(180deg, #000 82%, transparent); mask-image: linear-gradient(180deg, #000 82%, transparent); }
        .bcp-desc::-webkit-scrollbar { display: none; }

        /* Elemental balance (no title) */
        .bcp-elements { flex-shrink: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 10px 22px 12px; margin-top: -4px; }
        .bcp-el { display: flex; align-items: flex-end; justify-content: center; gap: 9px; height: 62px; }
        .bcp-el-bar { display: block; width: 5px; border-radius: 3px; transform-origin: bottom; animation: bcpGrow .8s cubic-bezier(.22,1,.36,1) var(--ebd) both, bcpBreath 3.2s ease-in-out calc(var(--ebd) + .8s) infinite; }
        .bcp-el-num { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.15; animation: bcpNum .6s ease-out calc(var(--ebd) + .25s) both; }
        .bcp-el-count { font-size: 21px; font-weight: 500; color: #fff; }
        .bcp-el-name { font-size: 7.5px; font-weight: 600; letter-spacing: .12em; }
        @keyframes bcpGrow { from { transform: scaleY(0); opacity: 0; } to { transform: scaleY(1); opacity: 1; } }
        @keyframes bcpBreath { 0%, 100% { box-shadow: 0 0 8px var(--eb); } 50% { box-shadow: 0 0 18px var(--eb), 0 0 4px var(--eb); } }
        @keyframes bcpNum { from { opacity: 0; transform: translateY(6px); filter: blur(3px); } to { opacity: 1; transform: none; filter: blur(0); } }

        /* Big Three card */
        .bcp-big3 { height: 90px; display: flex; }
        .bcp-big3-cell { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
        .bcp-big3-label { font-size: 8.5px; font-weight: 500; letter-spacing: .2em; color: var(--s500); }
        .bcp-big3-sign { margin-top: 1px !important; font-size: 23px; font-weight: 600; line-height: 1.1; color: #fff; }
        .bcp-big3-deg { margin-top: 1px !important; font-size: 10.5px; color: var(--s400); font-variant-numeric: tabular-nums; }
        .bcp-big3-el { margin-top: 2px !important; font-size: 8px; font-weight: 600; letter-spacing: .22em; }
        .bcp-vdiv { width: 1px; align-self: stretch; margin: 12px 0; background: linear-gradient(180deg, transparent, rgba(255,255,255,.14), transparent); }

        /* My Chart table */
        .bcp-table { display: grid; grid-template-rows: repeat(13, 32px); }
        .bcp-row { width: 100%; min-width: 0; display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 0 16px; border: 0; border-bottom: 1px solid rgba(255,255,255,.07); background: none; text-align: left; cursor: pointer; }
        .bcp-row:active { background: rgba(255,255,255,.05); }
        .bcp-row-sign { flex-shrink: 0; display: flex; align-items: baseline; gap: 7px; white-space: nowrap; }
        .bcp-row-sign .bcp-display { font-size: 20px; font-weight: 500; line-height: 1; }
        .bcp-row-deg { font-size: 11.5px; color: var(--s400); font-variant-numeric: tabular-nums; }
        .bcp-row-place { display: flex; align-items: center; gap: 7px; min-width: 0; justify-content: flex-end; }
        .bcp-row-glyph { width: 18px; text-align: center; font-size: 15px; line-height: 1; flex-shrink: 0; }
        .bcp-row-text { font-size: 15px; font-weight: 500; color: var(--s100); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
        @media (max-width: 389px) {
          .bcp-row { padding: 0 12px; }
          .bcp-row-sign .bcp-display { font-size: 17px; }
          .bcp-row-text { font-size: 13.5px; }
          .bcp-row-deg { font-size: 10px; }
        }
        @media (max-height: 680px) { .bcp-table { grid-template-rows: repeat(13, 26px); } }

        /* Learn More article */
        .bcp-article { position: relative; flex: 1; min-height: 0; width: 100%; min-width: 0; display: flex; flex-direction: column; border: 0; background: none; padding: 0; text-align: left; cursor: pointer; }
        .bcp-article-body { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; padding: 2px 6px 30px; scrollbar-width: none; -webkit-mask-image: linear-gradient(180deg, #000 90%, transparent); mask-image: linear-gradient(180deg, #000 90%, transparent); }
        .bcp-article-body::-webkit-scrollbar { display: none; }
        .bcp-lead { margin-top: 4px; font-size: 19px; font-style: italic; line-height: 1.4; color: var(--s100); }
        .bcp-section { margin: 14px 0 4px; font-size: 8px; font-weight: 600; letter-spacing: .24em; color: rgba(241,214,148,.75); }
        .bcp-para { font-size: 16.5px; line-height: 1.45; color: var(--s200); }
        .bcp-counter { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 999px; background: rgba(6,9,22,.75); font-size: 11px; letter-spacing: .14em; font-variant-numeric: tabular-nums; color: var(--s400); pointer-events: none; }
        .bcp-locked { position: relative; flex: 1; min-height: 0; overflow: hidden; }
        .bcp-locked-blur { display: flex; flex-direction: column; gap: 10px; padding: 2px 6px; filter: blur(7px); opacity: .45; }
        .bcp-locked-card { position: absolute; left: 22px; right: 22px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; padding: 18px 18px 16px; border-radius: 18px; border: 1px solid rgba(241,214,148,.35); background: linear-gradient(160deg, rgba(20,18,12,.92), rgba(8,10,20,.94)); box-shadow: 0 0 24px rgba(218,183,104,.16); }
        .bcp-locked-eyebrow { margin-top: 2px; font-size: 9px; font-weight: 600; letter-spacing: .28em; color: #F1D694; }
        .bcp-locked-text { font-size: 17px; line-height: 1.35; color: var(--s100); }

        .bcp-pill { margin-top: 6px; display: inline-flex; align-items: center; height: 32px; padding: 0 16px; border-radius: 11px; border: 1px solid rgba(255,255,255,.2); background: linear-gradient(145deg, rgba(14,18,34,.96), rgba(6,9,22,.96)); font-family: var(--caps); font-size: 8.5px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; }
        .bcp-pill-gold { color: rgba(241,214,148,.9); border-color: rgba(241,214,148,.35); }

        /* Saved readings (dashboard grid) */
        .bcp-saved { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center; gap: 10px; }
        .bcp-crown-row { height: 18px; display: flex; justify-content: center; }
        .bcp-reading-grid { height: min(250px, 56%); display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 0 4px; }
        .bcp-tile { width: 100%; height: 100%; min-height: 64px; overflow: hidden; padding: 6px 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; border: 1px solid transparent; border-radius: 19px; background: linear-gradient(155deg, rgba(15,17,28,.98), rgba(3,4,10,.99)) padding-box, linear-gradient(135deg, #fff9ea, #b9ab84 38%, #fbf7eb 62%, #8b7b59) border-box; color: #f8f4e9; box-shadow: inset 0 0 0 1px rgba(255,255,255,.035), 0 0 14px rgba(221,203,183,.08); transition: transform .16s ease, filter .18s ease; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; cursor: pointer; }
        .bcp-tile:active { transform: scale(.96); }
        .bcp-tile.selected { filter: grayscale(.8); background: linear-gradient(155deg, #4b4d54, #202127) padding-box, linear-gradient(135deg, #eee, #888) border-box; }
        .bcp-tile-topic { max-width: 100%; font-family: var(--display); font-size: clamp(8px, 2.35vw, 11px); line-height: 1.15; letter-spacing: .07em; text-align: center; text-transform: uppercase; overflow-wrap: anywhere; }
        .bcp-tile-date { color: rgba(215,204,177,.68); font-size: clamp(7px, 1.9vw, 9px); letter-spacing: .05em; text-transform: uppercase; }
        .bcp-empty { display: grid; place-items: center; }
        .bcp-empty span { width: 5px; height: 5px; border-radius: 50%; background: #fff; box-shadow: 0 0 5px #fff, 0 0 13px rgba(255,255,255,.62); }
        .bcp-empty.locked span { width: 4px; height: 4px; opacity: .32; box-shadow: 0 0 6px rgba(255,255,255,.34); }
        .bcp-empty-copy { text-align: center; font-size: 12px; letter-spacing: .05em; color: rgba(148,163,184,.55); }
        .bcp-pages { display: grid; grid-template-columns: 54px 1fr 54px; align-items: center; justify-items: center; }
        .bcp-pages button { width: 44px; height: 36px; display: grid; place-items: center; border: 0; background: transparent; color: rgba(226,232,240,.68); cursor: pointer; }
        .bcp-pages button:disabled { opacity: 0; pointer-events: none; }
        .bcp-pages button svg { width: 21px; height: 21px; }
        .bcp-pages > span { color: rgba(148,163,184,.52); font-size: 9px; letter-spacing: .15em; }
        .bcp-pages .bcp-delete { width: auto; padding: 0 14px; color: #fecaca; font-size: 9px; letter-spacing: .16em; text-transform: uppercase; }

        /* Upgrade */
        .bcp-upgrade { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 8px; padding: 0 18px; }
        .bcp-upgrade-icon { width: 44px; height: 44px; border-radius: 14px; border: 1px solid rgba(255,255,255,.18); display: flex; align-items: center; justify-content: center; color: #fff; box-shadow: 0 0 16px rgba(255,255,255,.12); }
        .bcp-upgrade-title { margin-top: 2px !important; font-size: 24px; font-weight: 500; color: #fff; }
        .bcp-upgrade-text { font-size: 12.5px; line-height: 1.5; color: var(--s400); max-width: 250px; }

        /* View names: previous · current · next */
        .bcp-bottom { position: relative; flex-shrink: 0; margin-top: 10px; }
        .bcp-car { position: relative; height: 36px; overflow: hidden; }
        .bcp-car-track { position: absolute; top: 2px; left: calc(-1 * ((100% - 16px) / 3 + 8px)); width: calc(5 * ((100% - 16px) / 3) + 32px); display: flex; gap: 8px; }
        .bcp-car-track.from-r { animation: bcpCarR .38s cubic-bezier(.22,1,.36,1); }
        .bcp-car-track.from-l { animation: bcpCarL .38s cubic-bezier(.22,1,.36,1); }
        @keyframes bcpCarR { from { transform: translateX(calc((100% - 32px) / 5 + 8px)); } to { transform: none; } }
        @keyframes bcpCarL { from { transform: translateX(calc(-1 * ((100% - 32px) / 5 + 8px))); } to { transform: none; } }
        .bcp-car-btn { flex: 1; min-width: 0; height: 32px; border: 0; border-radius: 8px; background: none; font-family: var(--caps); font-size: 8.5px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--s300); opacity: .42; white-space: nowrap; cursor: pointer; transition: opacity .3s, color .3s, transform .35s cubic-bezier(.22,1,.36,1), text-shadow .3s; }
        .bcp-car-btn.on { opacity: 1; color: #fff; transform: scale(1.22); text-shadow: 0 0 12px rgba(255,255,255,.45); cursor: default; }
        .bcp-car-btn:not(.on):active { opacity: .75; }
        .bcp-edit { position: absolute; right: -6px; bottom: 0; width: 44px; height: 44px; border: 0; border-radius: 50%; background: none; color: var(--s500); display: flex; align-items: center; justify-content: center; cursor: pointer; }

        @media (prefers-reduced-motion: reduce) {
          .bcp, .bcp-gcard, .bcp-shine::after, .bcp-el-bar, .bcp-el-num, .bcp-view > *, .bcp-car-track { animation: none !important; transition: none !important; }
          .bcp-shine::after { opacity: 0; }
        }
      `}</style>

      {/* key={view} replays the gentle fade only on the parts that change. */}
      <div className="bcp-view" key={view} onClick={nextView}>
        {!hasChart && view !== "saved" && view !== "upgrade" ? (
          <p className="m-auto py-8 text-center text-[13px] leading-6 text-slate-400">Enter your birth details to reveal your chart.</p>
        ) : view === "profection" ? (
          renderProfection()
        ) : view === "chart" ? (
          renderChart()
        ) : view === "learn" ? (
          renderLearn()
        ) : view === "saved" ? (
          renderSaved()
        ) : (
          renderUpgrade()
        )}
      </div>

      <div className="bcp-bottom">
        <div className="bcp-car" role="group" aria-label="Views">
          <div key={view} className={`bcp-car-track${carDir === 1 ? " from-r" : carDir === -1 ? " from-l" : ""}`}>
            {carousel.map(({ offset, index }) => {
              const isCurrent = offset === 0;
              const hidden = Math.abs(offset) === 2;
              return (
                <button
                  type="button"
                  key={`${offset}-${index}`}
                  className={`bcp-car-btn${isCurrent ? " on" : ""}`}
                  aria-pressed={isCurrent}
                  aria-hidden={hidden ? true : undefined}
                  tabIndex={hidden ? -1 : 0}
                  onClick={() => !isCurrent && goToView(index)}
                >
                  {VIEWS[index].label}
                </button>
              );
            })}
          </div>
        </div>
        {/* Keeps the space the old slider used so the content area stays the same size. */}
        <div aria-hidden="true" style={{ height: 32 }} />
        <button type="button" className="bcp-edit" onClick={() => window.location.assign("/chart-data?recalculate=true")} aria-label="Edit birth details">
          <Pencil aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
