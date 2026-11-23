"use client";

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { loadChart, saveChart, isSkyFresh } from "@/lib/chartStore";
import { PLANET_MEANING, SIGN_MEANING, HOUSE_MEANING } from "@/lib/chartMeanings";

/**
 * BIRTH CHART — its own panel in PagerContainer (between Your Day and Credits).
 *
 *   "My Chart • …" line         (sits in the swipe-line strip, above the top edge)
 *   Hero card                   (top edge → where the 2nd list row used to end; shows the tapped placement)
 *   Chart list                  (endless, user-scrolled, remembers its place)
 *   [ wheel ] [ share ]         (centred ON the bottom edge)
 *
 * The wheel button swaps the hero + list for the chart wheel: natal chart in the middle,
 * today's transits on a separate outer ring, aspects coloured by type, tap a planet to isolate it.
 *
 * Frame tokens match DailyPanel / ReadingIntakeScreen (top: safe-area + 6px + swipe line;
 * bottom: safe-area + 10px + caption gap + 14px). Keep them in step.
 *
 * The sky dimming for this panel (40%) is done by PagerContainer, not here.
 * This panel also owns the transit refresh that used to live in TodaySkyPanel.
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
  userStatus?: UserStatus | null;
  /** True while this panel is the one on screen. */
  isActive?: boolean;
  /** Share handler. Until private links exist, the default shares the Big Three as text. */
  onShare?: () => void;
}

interface NatalPlacement { name: string; sign: string; degree: string; house?: number; isRetrograde?: boolean }
interface UpgradeChartPoint { name: string; sign: string; degree: string; house: string; isRetrograde?: boolean }
interface NatalAspect { type: string; planetA: string; planetB: string; orbDegrees: number }
interface TransitPlanet { name: string; sign: string; degree: string; isRetrograde: boolean; house?: number }
interface ChartData {
  tropical?: { planets?: NatalPlacement[]; aspects?: NatalAspect[] };
  upgradeChartPoints?: UpgradeChartPoint[];
  transits?: TransitPlanet[];
}
interface BirthInfo { date?: string; time?: string; place?: string; lat?: number; lng?: number }

type ViewMode = "list" | "wheel";
type Element = "Fire" | "Earth" | "Air" | "Water";

/* ── Vocabulary ─────────────────────────────────────────────────────── */
// U+FE0E forces text presentation so iOS never swaps these for emoji.
const T = "︎";
const GLYPHS: Record<string, string> = {
  Sun: `☉${T}`, Moon: `☽${T}`, Mercury: `☿${T}`, Venus: `♀${T}`, Mars: `♂${T}`,
  Jupiter: `♃${T}`, Saturn: `♄${T}`, Uranus: `♅${T}`, Neptune: `♆${T}`, Pluto: `♇${T}`,
  Chiron: `⚷${T}`, Lilith: `⚸${T}`, "North Node": `☊${T}`, "South Node": `☋${T}`,
  Ascendant: `↑${T}`, Descendant: `↓${T}`, MC: "MC", IC: "IC", Vertex: "Vx", "Part of Fortune": `⊗${T}`,
};
const TEXT_GLYPHS = ["MC", "IC", "Vertex"];
const DISPLAY_NAMES: Record<string, string> = { Ascendant: "Rising", MC: "Midheaven" };

const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const SIGN_GLYPHS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"].map((g) => g + T);
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
const NEUTRAL = { border: "rgba(255,255,255,.12)", glow: "rgba(255,255,255,.12)", text: "#CBD5E1", bar: "#94A3B8" };
const SIGN_RULERS: Record<string, string> = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon", Leo: "Sun", Virgo: "Mercury",
  Libra: "Venus", Scorpio: "Mars", Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter",
};
const THEME: Record<string, string> = {
  Sun: "Core self", Moon: "Emotions & needs", Ascendant: "How you meet the world", Mercury: "Mind & voice",
  Venus: "Love & values", Mars: "Drive & desire", Jupiter: "Growth & luck", Saturn: "Structure & lessons",
  Uranus: "Change & freedom", Neptune: "Dreams & intuition", Pluto: "Power & rebirth", Chiron: "Wounds & healing",
  "North Node": "Life direction", MC: "Calling & reputation",
};
const POINT_MEANING: Record<string, string> = {
  Chiron: "Chiron describes a tender area of the chart where vulnerability can become insight, skill, and healing over time.",
  "North Node": "The North Node points toward qualities and experiences that stretch you beyond familiar patterns and support long-term growth.",
  MC: "The Midheaven describes public direction, vocation, reputation, achievement, and the way your life becomes visible in the wider world.",
};
/** Shown under the hero heading. Swap for the real author/source when it exists. */
const WRITTEN_BY = "Generic";

// The list runs Sun (first) → North Node (last), then wraps.
const LIST_ORDER = ["Sun", "Moon", "Ascendant", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "Chiron", "North Node"];
const WHEEL_POINTS = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "Chiron", "North Node"];
const CONTACT_POINTS = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "Ascendant"];

// Same palette as the original panel's ASPECT_META.
const ASPECT_STYLE: Record<string, { label: string; glyph: string; color: string; angle: number }> = {
  trine:       { label: "Trine",       glyph: `△${T}`, color: "#6EE7B7", angle: 120 },
  sextile:     { label: "Sextile",     glyph: `⚹${T}`, color: "#A7F3D0", angle: 60 },
  conjunction: { label: "Conjunction", glyph: `☌${T}`, color: "#FCD34D", angle: 0 },
  square:      { label: "Square",      glyph: `□${T}`, color: "#FDBA74", angle: 90 },
  opposition:  { label: "Opposition",  glyph: `☍${T}`, color: "#F87171", angle: 180 },
};
// Transit → natal contacts we draw: tight orbs only.
const TRANSIT_ORBS: Array<{ type: keyof typeof ASPECT_STYLE; orb: number }> = [
  { type: "conjunction", orb: 3 }, { type: "opposition", orb: 3 }, { type: "square", orb: 3 }, { type: "trine", orb: 3 }, { type: "sextile", orb: 2 },
];
const TOP_CONTACTS = 5;
const HOUSE_SYSTEM_LABEL = "Whole Sign houses"; // the wheel numbers houses whole-sign from the Ascendant

/* ── Helpers ────────────────────────────────────────────────────────── */
const elementOf = (sign?: string): Element | null => (sign ? SIGN_ELEMENTS[sign] ?? null : null);
const colorsOf = (sign?: string) => { const el = elementOf(sign); return el ? ELEMENT_COLORS[el] : NEUTRAL; };
const ordinal = (n: number) => { const s = ["th", "st", "nd", "rd"]; const v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`; };
const rulerPhrase = (planet: string) => (planet === "Sun" || planet === "Moon" ? `the ${planet}` : planet);
const lookup = (table: unknown, key: string): string | undefined => (table as Record<string, string> | undefined)?.[key];

/** "24°18′", "24°18'", "24° 18", "24.3" → degrees within the sign. */
function parseDegree(value?: string): number | null {
  if (!value) return null;
  const parts = value.match(/\d+(?:\.\d+)?/g);
  if (!parts) return null;
  const deg = parseFloat(parts[0]);
  const min = parts[1] && /°/.test(value) ? parseFloat(parts[1]) : 0;
  return deg + min / 60;
}
function toLongitude(sign?: string, degree?: string): number | null {
  const i = sign ? SIGNS.indexOf(sign) : -1;
  const d = parseDegree(degree);
  return i < 0 || d === null ? null : i * 30 + d;
}
function fmtDeg(lon: number): string {
  const within = ((lon % 30) + 30) % 30;
  let deg = Math.floor(within), min = Math.round((within - deg) * 60);
  if (min === 60) { deg += 1; min = 0; }
  return `${deg}°${String(min).padStart(2, "0")}′`;
}
const norm = (lon: number) => ((lon % 360) + 360) % 360;
const signOf = (lon: number) => SIGNS[Math.floor(norm(lon) / 30)];
function angleBetween(a: number, b: number) { let d = Math.abs(a - b) % 360; if (d > 180) d = 360 - d; return d; }

/** Spread glyph angles so none sit closer than `min` degrees. */
function spread<P extends { lon: number }>(items: P[], min: number): Array<P & { at: number }> {
  const out = items.map((p) => ({ ...p, at: p.lon }));
  for (let k = 0; k < 80; k++) {
    out.sort((a, b) => a.at - b.at);
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[i], b = out[(i + 1) % out.length];
      const gap = (b.at - a.at + 360) % 360;
      if (out.length > 1 && gap < min) { const push = (min - gap) / 2 + 0.01; a.at -= push; b.at += push; moved = true; }
    }
    out.forEach((it) => { it.at = norm(it.at); });
    if (!moved) break;
  }
  return out;
}

function formatBirth(b: BirthInfo): string[] {
  const line1: string[] = [];
  if (b.date) {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(b.date) ? `${b.date}T12:00:00` : b.date);
    line1.push(Number.isNaN(d.getTime()) ? b.date : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }));
  }
  if (b.time) line1.push(b.time);
  if (b.place) line1.push(b.place);
  if (typeof b.lat === "number" && typeof b.lng === "number") {
    const c = (v: number, pos: string, neg: string) => { const a = Math.abs(v); const d = Math.floor(a); const m = Math.round((a - d) * 60); return `${d}°${String(m).padStart(2, "0")}′${v >= 0 ? pos : neg}`; };
    line1.push(`${c(b.lat, "N", "S")} ${c(b.lng, "E", "W")}`);
  }
  return [line1.join(" · "), `Tropical · ${HOUSE_SYSTEM_LABEL}`];
}

// Kept outside the component so the panel comes back where the user left it
// (the pager unmounts panels that drift out of its four slots).
const memory: { mode: ViewMode; selected: string | null; rows: number } = { mode: "list", selected: "Sun", rows: 0 };

/* ── Icons ──────────────────────────────────────────────────────────── */
const IconWheel = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" />
    <path d="M12 3v4.5M12 16.5V21M3 12h4.5M16.5 12H21M5.6 5.6l3.2 3.2M15.2 15.2l3.2 3.2M18.4 5.6l-3.2 3.2M8.8 15.2l-3.2 3.2" />
  </svg>
);
const IconShare = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12" /><path d="M7.5 7.5 12 3l4.5 4.5" /><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </svg>
);

/* ── The wheel ──────────────────────────────────────────────────────── */
interface WheelPoint { name: string; lon: number; rx?: boolean }
interface Contact { transit: WheelPoint; natal: WheelPoint; type: keyof typeof ASPECT_STYLE; orb: number }
interface LonAspect { a: WheelPoint; b: WheelPoint; type: string; orb: number }

function ChartWheel({
  asc, mc, points, aspects, transits, contacts, selected, selectedTransit, onSelect, onSelectTransit, onClear,
}: {
  asc: number; mc: number | null; points: WheelPoint[]; aspects: LonAspect[]; transits: WheelPoint[]; contacts: Contact[];
  selected: string | null; selectedTransit: string | null;
  onSelect: (n: string) => void; onSelectTransit: (n: string) => void; onClear: () => void;
}) {
  const gid = useId().replace(/:/g, "");
  const c = 170, R0 = 160, R1 = 133, R2 = 113, R3 = 62, RG = R0 + 24, RT = R0 + 54;
  const th = (lon: number) => ((180 + (lon - asc)) * Math.PI) / 180;
  const pt = (lon: number, r: number): [number, number] => [c + r * Math.cos(th(lon)), c - r * Math.sin(th(lon))];
  const f = (n: number) => n.toFixed(2);
  const ascSign = Math.floor(norm(asc) / 30);
  const top = contacts.slice(0, TOP_CONTACTS);

  // Isolation: a natal planet or a transit is "on"; everything unrelated fades.
  const isoNatal = selected && points.some((p) => p.name === selected) ? selected : null;
  const isoTransit = selectedTransit;
  const isolating = !!(isoNatal || isoTransit);
  const related = new Set<string>();
  if (isoNatal) {
    related.add(isoNatal);
    aspects.forEach(({ a, b }) => { if (a.name === isoNatal) related.add(b.name); if (b.name === isoNatal) related.add(a.name); });
  }
  if (isoTransit) contacts.filter((x) => x.transit.name === isoTransit).forEach((x) => related.add(x.natal.name));

  const natalSpread = spread(points, 11);
  const transitSpread = spread(transits, 10);
  const base: React.ReactNode[] = [];   // zodiac band + ticks (under the inner circles)
  const nodes: React.ReactNode[] = [];  // everything drawn over them

  // Zodiac band, sign glyphs, whole-sign house numbers
  for (let i = 0; i < 12; i++) {
    const a = i * 30, b = a + 30, e = ELEMENT_COLORS[SIGN_ELEMENTS[SIGNS[i]]];
    const [ox0, oy0] = pt(a, R0), [ox1, oy1] = pt(b, R0), [ix1, iy1] = pt(b, R1), [ix0, iy0] = pt(a, R1);
    const [gx, gy] = pt(a + 15, (R0 + R1) / 2), [hx, hy] = pt(a + 15, (R1 + R2) / 2);
    const [lx0, ly0] = pt(a, R0), [lx1, ly1] = pt(a, R3);
    base.push(
      <g key={`s${i}`}>
        <path d={`M ${f(ox0)} ${f(oy0)} A ${R0} ${R0} 0 0 0 ${f(ox1)} ${f(oy1)} L ${f(ix1)} ${f(iy1)} A ${R1} ${R1} 0 0 1 ${f(ix0)} ${f(iy0)} Z`} fill={e.bar} fillOpacity={i === ascSign ? 0.16 : 0.06} />
        <text x={f(gx)} y={f(gy)} fill={e.text} fontSize="15" textAnchor="middle" dominantBaseline="central">{SIGN_GLYPHS[i]}</text>
        <line x1={f(lx0)} y1={f(ly0)} x2={f(lx1)} y2={f(ly1)} stroke="rgba(255,255,255,.08)" />
        <text x={f(hx)} y={f(hy)} fill="#64748B" fontSize="8.5" textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-sans, Inter, sans-serif)">{((i - ascSign + 12) % 12) + 1}</text>
      </g>,
    );
  }
  for (let d = 0; d < 360; d += 5) {
    const [x0, y0] = pt(d, R1), [x1, y1] = pt(d, R1 - (d % 10 === 0 ? 4 : 2.5));
    base.push(<line key={`t${d}`} x1={f(x0)} y1={f(y0)} x2={f(x1)} y2={f(y1)} stroke="rgba(255,255,255,.18)" strokeWidth=".8" />);
  }

  // Natal aspects, coloured by type
  aspects.forEach(({ a, b, type }, i) => {
    const st = ASPECT_STYLE[type]; if (!st) return;
    const on = !isolating || (isoNatal !== null && (a.name === isoNatal || b.name === isoNatal));
    const opacity = isolating ? (on ? 1 : 0.06) : 1;
    if (st.angle === 0) {
      const [m0, n0] = pt(a.lon, R3 - 4), [m1, n1] = pt(b.lon, R3 - 4);
      nodes.push(<path key={`a${i}`} d={`M ${f(m0)} ${f(n0)} A ${R3 - 4} ${R3 - 4} 0 0 ${(b.lon - a.lon + 360) % 360 < 180 ? 0 : 1} ${f(m1)} ${f(n1)}`} fill="none" stroke={st.color} strokeWidth="2.2" strokeLinecap="round" strokeOpacity=".8" opacity={opacity} className="bc-fade" />);
      return;
    }
    const [x0, y0] = pt(a.lon, R3), [x1, y1] = pt(b.lon, R3);
    nodes.push(<line key={`a${i}`} x1={f(x0)} y1={f(y0)} x2={f(x1)} y2={f(y1)} stroke={st.color} strokeOpacity={isolating && on ? 0.95 : 0.55} strokeWidth={isolating && on ? 1.7 : 1} opacity={opacity} className="bc-fade" />);
  });

  // Transit ring, separated from the chart
  nodes.push(<circle key="rb" cx={c} cy={c} r={(RG + RT) / 2} fill="none" stroke="rgba(255,255,255,.03)" strokeWidth={RT - RG} />);
  nodes.push(<circle key="rg" cx={c} cy={c} r={RG} fill="none" stroke="rgba(255,255,255,.14)" />);
  nodes.push(<circle key="rt" cx={c} cy={c} r={RT} fill="none" stroke="rgba(255,255,255,.14)" />);
  top.forEach(({ transit, natal }, i) => {
    const on = !isolating || transit.name === isoTransit || natal.name === isoNatal;
    const [x0, y0] = pt(transit.lon, R3), [x1, y1] = pt(natal.lon, R3);
    nodes.push(<line key={`c${i}`} x1={f(x0)} y1={f(y0)} x2={f(x1)} y2={f(y1)} stroke="rgba(241,214,148,.8)" strokeWidth="1.1" strokeDasharray="3 2.5" opacity={on ? 1 : 0.06} className="bc-fade" />);
  });
  transitSpread.forEach((p) => {
    const hit = top.some((h) => h.transit.name === p.name);
    const [a0, b0] = pt(p.lon, RG), [a1, b1] = pt(p.lon, RG + 5), [gx, gy] = pt(p.at, (RG + RT) / 2 + 2);
    const on = !isoTransit || p.name === isoTransit;
    nodes.push(
      <g key={`tr${p.name}`} opacity={on ? 1 : 0.35} className="bc-fade">
        <line x1={f(a0)} y1={f(b0)} x2={f(a1)} y2={f(b1)} stroke={hit ? "rgba(241,214,148,.9)" : "rgba(226,232,240,.6)"} strokeWidth="1.1" />
        <circle cx={f(gx)} cy={f(gy)} r="10" fill="transparent" style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onSelectTransit(p.name); }} />
        <text x={f(gx)} y={f(gy)} fill={hit ? "#F1D694" : "#E2E8F0"} fontSize="13" textAnchor="middle" dominantBaseline="central" style={{ pointerEvents: "none" }}>{GLYPHS[p.name] ?? "•"}</text>
      </g>,
    );
  });

  // Angles with degrees: AC/DC and MC/IC
  const axis = (lon: number, label: string, opp: string, strong: boolean) => {
    const [x0, y0] = pt(lon, RT + 2), [x1, y1] = pt(lon + 180, RT + 2);
    nodes.push(<line key={`ax${label}`} x1={f(x0)} y1={f(y0)} x2={f(x1)} y2={f(y1)} stroke={`rgba(241,214,148,${strong ? 0.5 : 0.28})`} strokeWidth={strong ? 1.2 : 0.9} strokeDasharray={strong ? undefined : "3 3"} />);
    [[lon, label], [lon + 180, opp]].forEach(([l, lab]) => {
      const [tx, ty] = pt(l as number, RT + 12);
      nodes.push(
        <text key={`al${lab}`} x={f(tx)} y={f(ty)} textAnchor="middle" dominantBaseline="central">
          <tspan fill="rgba(241,214,148,.95)" fontSize="8" fontFamily="var(--font-caps), Cinzel, serif" fontWeight="600" letterSpacing="1">{lab}</tspan>
          <tspan x={f(tx)} dy="9" fill="#94A3B8" fontSize="6.5" fontFamily="var(--font-sans, Inter, sans-serif)">{fmtDeg(norm(l as number))}</tspan>
        </text>,
      );
    });
  };
  if (mc !== null) axis(mc, "MC", "IC", false);
  axis(asc, "AC", "DC", true);

  // Natal planets: tick, connector, glyph, degree + minute (+ ℞)
  natalSpread.forEach((p) => {
    const e = colorsOf(signOf(p.lon));
    const [tx0, ty0] = pt(p.lon, R2), [tx1, ty1] = pt(p.lon, R2 - 5), [cx1, cy1] = pt(p.at, R2 - 11);
    const [gx, gy] = pt(p.at, R2 - 21), [dx, dy] = pt(p.at, R2 - 37);
    const on = !isolating || related.has(p.name);
    nodes.push(
      <g key={`p${p.name}`} opacity={on ? 1 : 0.25} className="bc-fade">
        <line x1={f(tx0)} y1={f(ty0)} x2={f(tx1)} y2={f(ty1)} stroke={e.text} strokeWidth="1.2" />
        <line x1={f(tx1)} y1={f(ty1)} x2={f(cx1)} y2={f(cy1)} stroke={e.text} strokeOpacity=".35" strokeWidth=".8" />
        <circle cx={f(gx)} cy={f(gy)} r="11" fill="transparent" style={{ cursor: "pointer" }} onClick={(ev) => { ev.stopPropagation(); onSelect(p.name); }} />
        <text x={f(gx)} y={f(gy)} fill={e.text} fontSize="15" textAnchor="middle" dominantBaseline="central" style={{ pointerEvents: "none", filter: `drop-shadow(0 0 6px ${e.glow})` }}>{GLYPHS[p.name] ?? "•"}</text>
        <text x={f(dx)} y={f(dy)} fill="#94A3B8" fontSize="6.5" textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-sans, Inter, sans-serif)">{fmtDeg(p.lon)}{p.rx ? "℞" : ""}</text>
      </g>,
    );
  });

  const sunP = points.find((p) => p.name === "Sun"), moonP = points.find((p) => p.name === "Moon");
  return (
    <svg
      viewBox="-72 -72 484 484"
      role="img"
      aria-label={`Birth chart wheel: ${signOf(asc)} rising${sunP ? `, Sun in ${signOf(sunP.lon)}` : ""}${moonP ? `, Moon in ${signOf(moonP.lon)}` : ""}. Outer ring shows today's transits.`}
      onClick={onClear}
    >
      <defs>
        <radialGradient id={`bcBg${gid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0E1532" /><stop offset="100%" stopColor="#060918" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={R0} fill={`url(#bcBg${gid})`} stroke="rgba(255,255,255,.16)" />
      {base}
      <circle cx={c} cy={c} r={R1} fill="none" stroke="rgba(255,255,255,.12)" />
      <circle cx={c} cy={c} r={R2} fill="none" stroke="rgba(255,255,255,.10)" />
      <circle cx={c} cy={c} r={R3} fill="rgba(0,0,0,.18)" stroke="rgba(255,255,255,.10)" />
      {nodes}
    </svg>
  );
}

/* ── Panel ──────────────────────────────────────────────────────────── */
export default function BirthChartPanel({ onShare }: BirthChartPanelProps) {
  const [natal, setNatal] = useState<NatalPlacement[]>([]);
  const [natalAspects, setNatalAspects] = useState<NatalAspect[]>([]);
  const [transits, setTransits] = useState<TransitPlanet[]>([]);
  const [birth, setBirth] = useState<BirthInfo>({});
  const [isLoading, setIsLoading] = useState(true);

  const [mode, setModeState] = useState<ViewMode>(memory.mode);
  const [selected, setSelectedState] = useState<string | null>(memory.selected);
  const [selectedTransit, setSelectedTransit] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [entering, setEntering] = useState(false);

  const setSelected = (n: string | null) => { memory.selected = n; setSelectedState(n); };

  /* Load the chart (retry briefly while it is being calculated). */
  useEffect(() => {
    let cancelled = false;
    const tryLoad = () => {
      const chart = loadChart();
      if (!chart?.chartData) return false;
      const data = chart.chartData as unknown as ChartData;
      const upgrade = data.upgradeChartPoints ?? [];
      setNatal(
        upgrade.length
          ? upgrade.map((p) => ({ name: p.name, sign: p.sign, degree: p.degree, house: p.house ? Number(p.house) : undefined, isRetrograde: p.isRetrograde }))
          : data.tropical?.planets ?? [],
      );
      setNatalAspects(data.tropical?.aspects ?? []);
      setTransits(data.transits ?? []);
      const c = chart as unknown as { birthDate?: string; birthTime?: string; birthPlace?: string; lat?: number; lng?: number };
      setBirth({ date: c.birthDate, time: c.birthTime, place: c.birthPlace, lat: c.lat, lng: c.lng });
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
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  /* Keep today's transits fresh (moved here from TodaySkyPanel, which left the pager). */
  useEffect(() => {
    let cancelled = false;
    const refreshSky = async () => {
      const chart = loadChart();
      if (!chart?.chartData) return;
      try {
        const response = await fetch("/api/chart-calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            birthDate: chart.birthDate,
            birthTime: chart.birthTime,
            birthPlace: chart.birthPlace,
            lat: chart.lat,
            lng: chart.lng,
            timezone: chart.timezone,
            ...(typeof chart.currentLat === "number" && typeof chart.currentLng === "number"
              ? { currentLat: chart.currentLat, currentLng: chart.currentLng }
              : {}),
          }),
        });
        const freshData = await response.json();
        if (!response.ok || !freshData?.success || cancelled) return;
        if (Array.isArray(freshData.transits)) setTransits(freshData.transits);
        saveChart({
          birthDate: chart.birthDate,
          birthTime: chart.birthTime,
          birthPlace: chart.birthPlace,
          lat: chart.lat,
          lng: chart.lng,
          timezone: chart.timezone,
          currentLat: chart.currentLat,
          currentLng: chart.currentLng,
          currentPlace: chart.currentPlace ?? "",
          currentTimezone: chart.currentTimezone ?? "",
          chartData: freshData,
        });
      } catch (error) {
        console.error("Failed to refresh today's transits", error);
      }
    };
    if (!isSkyFresh()) void refreshSky();
    const onVisible = () => { if (document.visibilityState === "visible" && !isSkyFresh()) void refreshSky(); };
    const onFocus = () => { if (!isSkyFresh()) void refreshSky(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  /* ── Derived ── */
  const find = useCallback((n: string) => natal.find((p) => p.name === n || (n === "MC" && p.name === "Midheaven")), [natal]);
  const listRows = useMemo(() => LIST_ORDER.map((n) => find(n)).filter((p): p is NatalPlacement => !!p), [find]);

  const ascLon = useMemo(() => { const a = find("Ascendant"); return a ? toLongitude(a.sign, a.degree) : null; }, [find]);
  const mcLon = useMemo(() => { const m = find("MC"); return m ? toLongitude(m.sign, m.degree) : null; }, [find]);
  const lonOf = useCallback((n: string) => { const p = find(n); return p ? toLongitude(p.sign, p.degree) : null; }, [find]);

  const wheelPoints = useMemo<WheelPoint[]>(
    () => WHEEL_POINTS.flatMap((n) => { const p = find(n); const lon = p ? toLongitude(p.sign, p.degree) : null; return lon === null || !p ? [] : [{ name: n, lon, rx: p.isRetrograde }]; }),
    [find],
  );
  const lonAspects = useMemo<LonAspect[]>(
    () => natalAspects.flatMap((a) => {
      const type = a.type?.toLowerCase(); const la = lonOf(a.planetA), lb = lonOf(a.planetB);
      if (!ASPECT_STYLE[type] || la === null || lb === null) return [];
      return [{ a: { name: a.planetA, lon: la }, b: { name: a.planetB, lon: lb }, type, orb: a.orbDegrees }];
    }),
    [natalAspects, lonOf],
  );
  const transitPoints = useMemo<WheelPoint[]>(
    () => transits.flatMap((t) => { const lon = toLongitude(t.sign, t.degree); return lon === null ? [] : [{ name: t.name, lon, rx: t.isRetrograde }]; }),
    [transits],
  );
  const contacts = useMemo<Contact[]>(() => {
    const out: Contact[] = [];
    const targets = CONTACT_POINTS.flatMap((n) => { const lon = lonOf(n); return lon === null ? [] : [{ name: n, lon }]; });
    transitPoints.filter((t) => t.name !== "Moon" && !t.name.includes("Node")).forEach((t) => targets.forEach((n) => {
      const d = angleBetween(t.lon, n.lon);
      for (const { type, orb } of TRANSIT_ORBS) {
        const o = Math.abs(d - ASPECT_STYLE[type].angle);
        if (o <= orb) { out.push({ transit: t, natal: n, type, orb: o }); break; }
      }
    }));
    return out.sort((x, y) => x.orb - y.orb);
  }, [transitPoints, lonOf]);

  const selectedPlacement = selected ? find(selected) : undefined;

  /* ── View switching: lift out, rise in ── */
  const toggleMode = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => {
      const next: ViewMode = mode === "list" ? "wheel" : "list";
      memory.mode = next;
      setModeState(next);
      setSelectedTransit(null);
      setLeaving(false);
      setEntering(true);
      window.setTimeout(() => setEntering(false), 560);
    }, 200);
  };

  const share = async () => {
    if (onShare) { onShare(); return; }
    const big3 = ["Sun", "Moon", "Ascendant"].map((n) => { const p = find(n); return p ? `${DISPLAY_NAMES[n] ?? n} ${p.sign}` : null; }).filter(Boolean).join(" · ");
    const data = { title: "My birth chart", text: big3 ? `My Big Three: ${big3}` : "My birth chart" };
    try {
      if (navigator.share) await navigator.share(data);
      else await navigator.clipboard.writeText(data.text);
    } catch { /* closing the share sheet isn't an error */ }
  };

  /* ── Endless list (user-scrolled; three copies, recentred on the middle one) ── */
  const listRef = useRef<HTMLDivElement>(null);
  const restoringRef = useRef(false);
  const lastRowHRef = useRef(0);
  const rowH = () => listRef.current?.querySelector<HTMLElement>(".bc-row")?.offsetHeight || 44;
  const restoreScroll = useCallback(() => {
    const el = listRef.current; if (!el || !listRows.length) return;
    restoringRef.current = true;
    lastRowHRef.current = rowH();
    el.scrollTop = lastRowHRef.current * listRows.length + memory.rows * lastRowHRef.current;
    requestAnimationFrame(() => { restoringRef.current = false; });
  }, [listRows.length]);
  useLayoutEffect(() => { if (mode === "list") restoreScroll(); }, [mode, restoreScroll, isLoading]);
  useEffect(() => {
    const el = listRef.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (rowH() !== lastRowHRef.current) restoreScroll(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [restoreScroll, mode, isLoading]);
  const onListScroll = () => {
    const el = listRef.current; if (!el || restoringRef.current || rowH() !== lastRowHRef.current) return;
    const h = lastRowHRef.current * listRows.length;
    if (el.scrollTop < h * 0.5) { restoringRef.current = true; el.scrollTop += h; requestAnimationFrame(() => { restoringRef.current = false; }); }
    else if (el.scrollTop > h * 1.5) { restoringRef.current = true; el.scrollTop -= h; requestAnimationFrame(() => { restoringRef.current = false; }); }
    memory.rows = (((el.scrollTop - h) % h) + h) % h / lastRowHRef.current;
  };

  if (isLoading) {
    return (
      <div className="bc bc-center">
        <p className="bc-quiet">Casting your chart…</p>
        <style jsx global>{`.bc-center { display: flex; align-items: center; justify-content: center; height: 100%; } .bc-quiet { font-size: 13px; color: #94A3B8; }`}</style>
      </div>
    );
  }

  const hasChart = natal.length > 0;
  const birthLines = formatBirth(birth);
  const isWheel = mode === "wheel";

  /* Hero content for the selected placement */
  const hero = (() => {
    const p = selectedPlacement; if (!p) return null;
    const c = colorsOf(p.sign);
    const name = DISPLAY_NAMES[p.name] ?? p.name;
    const ruler = SIGN_RULERS[p.sign];
    const body = [
      POINT_MEANING[p.name] ?? lookup(PLANET_MEANING, p.name),
      lookup(SIGN_MEANING, p.sign),
      p.house ? lookup(HOUSE_MEANING, String(p.house)) : undefined,
    ].filter(Boolean).join(" ");
    return (
      <div className="bc-ctx-in" key={p.name}>
        <div className="bc-pd">
          <p className="bc-caps bc-pd-eyebrow">{name}{THEME[p.name] ? ` · ${THEME[p.name]}` : ""}</p>
          <div className="bc-pd-title-row">
            <span className={`bc-pd-glyph${TEXT_GLYPHS.includes(p.name) ? " txt" : ""}`} style={{ color: c.text, textShadow: `0 0 14px ${c.glow}, 0 0 4px ${c.glow}` }} aria-hidden="true">{GLYPHS[p.name] ?? "•"}</span>
            <p className="bc-display bc-pd-title" style={{ color: c.text }}>{p.sign}</p>
          </div>
          <p className="bc-pd-sub">
            {p.degree}
            {p.house ? ` · ${ordinal(p.house)} house` : ""}
            {ruler ? ` · ruled by ${rulerPhrase(ruler)}` : ""}
          </p>
          <p className="bc-caps bc-pd-by">Written By : {WRITTEN_BY}</p>
        </div>
        <p className="bc-display bc-pd-body">{body}</p>
      </div>
    );
  })();

  /* Isolation summary under the wheel */
  const isoLine = (() => {
    if (selectedTransit) {
      const mine = contacts.filter((x) => x.transit.name === selectedTransit);
      return (
        <>
          <b style={{ color: "#E2E8F0" }}>{GLYPHS[selectedTransit] ?? "•"} {selectedTransit} <em>today</em></b>{" "}
          {mine.length
            ? mine.map((x, i) => (<React.Fragment key={i}>{i > 0 ? " · " : ""}<span style={{ color: ASPECT_STYLE[x.type].color }}>{ASPECT_STYLE[x.type].glyph}</span> your {DISPLAY_NAMES[x.natal.name] ?? x.natal.name} <em>{fmtDeg(x.orb)}</em></React.Fragment>))
            : <span className="q">no tight contacts with your chart</span>}
        </>
      );
    }
    const on = selected && wheelPoints.some((p) => p.name === selected) ? selected : null;
    if (!on) return <span className="q">Tap a planet to see its aspects</span>;
    const mine = lonAspects.filter(({ a, b }) => a.name === on || b.name === on);
    const p = wheelPoints.find((x) => x.name === on)!;
    return (
      <>
        <b style={{ color: colorsOf(signOf(p.lon)).text }}>{GLYPHS[on]} {on}</b>{" "}
        {mine.length
          ? mine.map(({ a, b, type, orb }, i) => (<React.Fragment key={i}>{i > 0 ? " · " : ""}<span style={{ color: ASPECT_STYLE[type].color }}>{ASPECT_STYLE[type].glyph}</span> {a.name === on ? (DISPLAY_NAMES[b.name] ?? b.name) : (DISPLAY_NAMES[a.name] ?? a.name)} <em>{fmtDeg(orb)}</em></React.Fragment>))
          : <span className="q">no major aspects</span>}
      </>
    );
  })();

  return (
    <div className={`bc${isWheel ? " bc-wheel-mode" : ""}`}>
      <style jsx global>{`
        .bc {
          --bc-display: var(--font-display), "Cormorant Garamond", Georgia, serif;
          --bc-caps: var(--font-caps), Cinzel, Georgia, serif;
          --bc-gold: rgba(241, 214, 148, 0.9);
          --s100: #F1F5F9; --s200: #E2E8F0; --s300: #CBD5E1; --s400: #94A3B8; --s500: #64748B; --s600: #475569;
          /* Frame — keep in step with DailyPanel / ReadingIntakeScreen */
          --swipe-h: 32px;
          --cap-mt: 14px;
          --gap: 12px;
          --ctx-h: 300px;
          --row-h: 44px;
          position: relative;
          box-sizing: border-box;
          height: 100%;
          width: 100%;
          max-width: 430px;
          margin: 0 auto;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          gap: var(--gap);
          padding:
            calc(env(safe-area-inset-top) + 6px + var(--swipe-h))
            clamp(12px, 4vw, 16px)
            calc(env(safe-area-inset-bottom) + 10px + var(--cap-mt) + 14px);
          color: var(--s100);
          font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
        }
        .bc * { box-sizing: border-box; }
        :where(.bc) :where(p, h2) { margin: 0; }
        .bc-display { font-family: var(--bc-display); }
        .bc-caps { font-family: var(--bc-caps); text-transform: uppercase; }

        /* "My Chart" line — in the swipe-line strip, above the top edge */
        .bc-head { position: absolute; left: 0; right: 0; top: calc(env(safe-area-inset-top) + 6px); height: var(--swipe-h); display: flex; align-items: center; justify-content: center; gap: 8px; pointer-events: none; }
        .bc-head .t { font-size: 10px; font-weight: 500; letter-spacing: .2em; color: var(--s300); }
        .bc-head .dot { font-size: 9px; color: var(--s600); }
        .bc-head .h { font-size: 8.5px; font-weight: 500; letter-spacing: .16em; color: var(--s500); }

        /* Hero card */
        .bc-ctx { flex-shrink: 0; height: var(--ctx-h); overflow: hidden; border-radius: 22px; border: 1px solid rgba(255,255,255,.10);
          background: radial-gradient(circle at 20% 0%, rgba(110,90,200,.10), transparent 55%), rgba(255,255,255,.03); box-shadow: 0 10px 30px rgba(0,0,0,.28);
          transition: height .45s cubic-bezier(.22,1,.36,1), opacity .3s ease, margin .45s cubic-bezier(.22,1,.36,1); }
        .bc-wheel-mode .bc-ctx { height: 0; opacity: 0; margin-bottom: calc(var(--gap) * -1); border-width: 0; pointer-events: none; }
        @keyframes bcSwap { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        .bc-ctx-in { height: 100%; padding: 8px 14px 12px; display: flex; flex-direction: column; animation: bcSwap .26s ease-out both; }
        .bc-pd { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; text-align: center; padding-top: 2px; }
        .bc-pd-eyebrow { font-size: 8.5px; font-weight: 500; letter-spacing: .28em; color: var(--bc-gold); white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
        .bc-pd-title-row { margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 9px; }
        .bc-pd-glyph { font-size: 22px; line-height: 1; }
        .bc-pd-glyph.txt { font-family: var(--bc-display); font-weight: 600; font-size: 20px; }
        .bc-pd-title { font-size: 28px; font-weight: 500; line-height: 1.05; }
        .bc-pd-sub { margin-top: 3px; font-size: 10.5px; color: var(--s400); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; font-variant-numeric: tabular-nums; }
        .bc-pd-by { position: relative; margin-top: 8px; padding: 3px 22px; font-size: 8.5px; font-weight: 500; letter-spacing: .2em; color: var(--s500); white-space: nowrap; }
        .bc-pd-by::before, .bc-pd-by::after { content: ""; position: absolute; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(241,214,148,.32), transparent); }
        .bc-pd-by::before { top: 0; } .bc-pd-by::after { bottom: 0; }
        .bc-pd-body { margin-top: 8px; padding: 0 4px; flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: none; text-align: left; font-size: 16px; line-height: 1.38; color: var(--s200);
          -webkit-mask-image: linear-gradient(#000 82%, transparent); mask-image: linear-gradient(#000 82%, transparent); }
        .bc-pd-body::-webkit-scrollbar { display: none; }

        /* View area + hand-off */
        .bc-area { flex: 1; min-height: 0; display: flex; flex-direction: column; will-change: transform, opacity; }
        .bc-area.leaving, .bc-ctx.leaving { transition: transform .2s ease-in, opacity .2s ease-in; transform: translateY(-18px); opacity: 0; }
        @keyframes bcRiseIn { from { transform: translateY(26px); opacity: 0; } to { transform: none; opacity: 1; } }
        @keyframes bcRiseTurnIn { from { transform: translateY(30px) rotate(-16deg) scale(.96); opacity: 0; } to { transform: none; opacity: 1; } }
        .bc-area.entering { animation: bcRiseIn .42s cubic-bezier(.22,1,.36,1) both; }
        .bc-area.entering .bc-wheel-stage { animation: bcRiseTurnIn .55s cubic-bezier(.22,1,.36,1) both; }

        /* Endless list */
        .bc-list { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; overscroll-behavior: contain; scroll-snap-type: y proximity; -webkit-overflow-scrolling: touch; scrollbar-width: none;
          border-top: 1px solid rgba(255,255,255,.05);
          -webkit-mask-image: linear-gradient(transparent, #000 22px, #000 calc(100% - 28px), transparent); mask-image: linear-gradient(transparent, #000 22px, #000 calc(100% - 28px), transparent); }
        .bc-list::-webkit-scrollbar { display: none; }
        .bc-row { flex: 0 0 var(--row-h); height: var(--row-h); scroll-snap-align: start; border-bottom: 1px solid rgba(255,255,255,.05); }
        .bc-row-btn { display: flex; align-items: center; gap: 12px; width: 100%; height: 100%; padding: 0 4px; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; transition: background .2s; }
        .bc-row.sel .bc-row-btn { background: linear-gradient(90deg, rgba(255,255,255,.055), transparent 80%); }
        .bc-r-glyph { width: 30px; flex-shrink: 0; text-align: center; font-size: 19px; line-height: 1; }
        .bc-r-glyph.txt { font-family: var(--bc-display); font-weight: 500; }
        .bc-r-name { width: 104px; flex-shrink: 0; font-family: var(--bc-caps); font-size: 10.5px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; color: var(--s300); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .bc-row.sel .bc-r-name { color: #fff; }
        .bc-r-sign { min-width: 0; flex: 1; font-family: var(--bc-display); font-size: 19px; font-weight: 500; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .bc-r-deg { flex-shrink: 0; white-space: nowrap; font-size: 12.5px; font-weight: 300; color: var(--s400); font-variant-numeric: tabular-nums; }
        .bc-r-deg .h { margin-left: 4px; color: var(--s500); }
        .bc-rx { margin-left: 3px; color: rgba(252,211,77,.8); }

        /* Wheel */
        .bc-wheel { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
        .bc-wheel-stage { flex: 1; min-height: 0; width: 100%; display: flex; align-items: center; justify-content: center; user-select: none; -webkit-user-select: none; }
        .bc-wheel-stage svg { height: 100%; width: auto; max-width: 100%; max-height: 100%; aspect-ratio: 1; display: block; filter: drop-shadow(0 0 30px rgba(147,197,253,.10)); }
        .bc-fade { transition: opacity .25s ease; }
        .bc-wheel-foot { flex-shrink: 0; width: 100%; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; }
        .bc-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 12px; font-family: var(--bc-caps); font-size: 7.5px; font-weight: 500; letter-spacing: .14em; text-transform: uppercase; color: var(--s400); }
        .bc-legend span { display: inline-flex; align-items: center; gap: 5px; }
        .bc-legend i { width: 12px; height: 2px; border-radius: 1px; display: inline-block; }
        .bc-legend i.dash { background: repeating-linear-gradient(90deg, rgba(241,214,148,.85) 0 3px, transparent 3px 5px); }
        .bc-iso { min-height: 32px; max-width: 100%; font-size: 11px; line-height: 1.45; color: var(--s300); }
        .bc-iso b { font-weight: 500; margin-right: 4px; }
        .bc-iso em { font-style: normal; color: var(--s500); font-variant-numeric: tabular-nums; }
        .bc-iso .q { font-family: var(--bc-display); font-style: italic; font-size: 13.5px; color: var(--s500); }
        .bc-cdata { font-size: 9px; line-height: 1.5; letter-spacing: .04em; color: var(--s500); font-variant-numeric: tabular-nums; }

        /* Buttons — the Profection symbol box, smaller and white, centred ON the bottom edge */
        .bc-actions { flex-shrink: 0; height: 0; margin-top: calc(19px + 8px - var(--gap)); overflow: visible; display: flex; align-items: center; justify-content: center; gap: 14px; }
        .bc-btn { width: 38px; height: 38px; border-radius: 12px; border: 1px solid rgba(255,255,255,.55); background: rgba(0,0,0,.25); color: #F8FAFC;
          box-shadow: 0 0 14px rgba(255,255,255,.12), inset 0 0 10px rgba(255,255,255,.08); display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0;
          transition: background .25s ease, color .25s ease, box-shadow .25s ease; }
        .bc-btn:active { filter: brightness(1.15); }
        .bc-btn[aria-pressed="true"] { background: rgba(248,250,252,.94); color: #070A18; box-shadow: 0 0 18px rgba(255,255,255,.28); }

        .bc-empty { margin: auto; padding: 32px 0; text-align: center; font-size: 13px; line-height: 1.6; color: var(--s400); }

        /* Short screens — same steps as Your Day; the list absorbs the difference */
        @media (max-height: 870px) { .bc { --swipe-h: 28px; --cap-mt: 12px; } }
        @media (max-height: 760px) { .bc { --ctx-h: 256px; --row-h: 42px; } }
        @media (max-height: 680px) { .bc { --gap: 10px; --cap-mt: 10px; --ctx-h: 222px; --row-h: 40px; } }
        @media (max-height: 560px) { .bc { --swipe-h: 26px; --ctx-h: 168px; --row-h: 36px; } .bc-head .h, .bc-head .dot { display: none; } }

        @media (prefers-reduced-motion: reduce) {
          .bc-area.leaving, .bc-ctx.leaving { transform: none; }
          .bc-area.entering, .bc-area.entering .bc-wheel-stage, .bc-ctx-in { animation: none !important; }
        }
      `}</style>

      <div className="bc-head" aria-hidden={!hasChart}>
        <span className="bc-caps t">{isWheel ? "My Chart + Today" : "My Chart"}</span>
        <span className="dot">•</span>
        <span className="bc-caps h">{isWheel ? "Outer ring is today’s sky · tap a planet" : "Tap each placement to learn"}</span>
      </div>

      {!hasChart ? (
        <p className="bc-empty">Enter your birth details to reveal your chart.</p>
      ) : (
        <>
          <section className={`bc-ctx${leaving && !isWheel ? " leaving" : ""}`} aria-label="Placement details" aria-live="polite">
            {hero}
          </section>

          <div className={`bc-area${leaving ? " leaving" : ""}${entering ? " entering" : ""}`}>
            {isWheel ? (
              <section className="bc-wheel" aria-label="Chart wheel">
                <div className="bc-wheel-stage">
                  <ChartWheel
                    asc={ascLon ?? 0}
                    mc={mcLon}
                    points={wheelPoints}
                    aspects={lonAspects}
                    transits={transitPoints}
                    contacts={contacts}
                    selected={selected}
                    selectedTransit={selectedTransit}
                    onSelect={(n) => { setSelectedTransit(null); setSelected(selected === n ? null : n); }}
                    onSelectTransit={(n) => setSelectedTransit((cur) => (cur === n ? null : n))}
                    onClear={() => { setSelectedTransit(null); setSelected(null); }}
                  />
                </div>
                <div className="bc-wheel-foot">
                  <p className="bc-legend">
                    {Object.values(ASPECT_STYLE).map((s) => (<span key={s.label}><i style={{ background: s.color }} />{s.label}</span>))}
                    <span><i className="dash" />Transit</span>
                  </p>
                  <p className="bc-iso">{isoLine}</p>
                  <p className="bc-cdata">{birthLines[0]}<br />{birthLines[1]}</p>
                </div>
              </section>
            ) : (
              <div className="bc-list" ref={listRef} role="list" onScroll={onListScroll}>
                {[0, 1, 2].flatMap((copy) =>
                  listRows.map((p) => {
                    const c = colorsOf(p.sign);
                    const sel = selected === p.name;
                    const dup = copy !== 1;
                    return (
                      <div key={`${copy}-${p.name}`} className={`bc-row${sel ? " sel" : ""}`} role="listitem" aria-hidden={dup || undefined}>
                        <button type="button" className="bc-row-btn" aria-pressed={sel} tabIndex={dup ? -1 : 0} onClick={() => setSelected(sel ? null : p.name)}>
                          <span className={`bc-r-glyph${TEXT_GLYPHS.includes(p.name) ? " txt" : ""}`} style={{ color: c.text, textShadow: sel ? `0 0 12px ${c.glow}, 0 0 4px ${c.glow}` : "none" }}>{GLYPHS[p.name] ?? "•"}</span>
                          <span className="bc-r-name">{DISPLAY_NAMES[p.name] ?? p.name}</span>
                          <span className="bc-r-sign" style={{ color: c.text }}>{p.sign}</span>
                          <span className="bc-r-deg">
                            {p.degree}
                            {p.isRetrograde ? <span className="bc-rx">℞</span> : null}
                            {p.house ? <span className="h">· {ordinal(p.house)}</span> : null}
                          </span>
                        </button>
                      </div>
                    );
                  }),
                )}
              </div>
            )}
          </div>

          <div className="bc-actions">
            <button type="button" className="bc-btn" aria-pressed={isWheel} aria-label={isWheel ? "Show placement list" : "Show chart wheel"} onClick={toggleMode}>
              <IconWheel />
            </button>
            <button type="button" className="bc-btn" aria-label="Share your chart" onClick={() => void share()}>
              <IconShare />
            </button>
          </div>
        </>
      )}
    </div>
  );
}