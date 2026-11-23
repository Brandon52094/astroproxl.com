"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { loadChart, saveChart, isSkyFresh } from "@/lib/chartStore";

/**
 * BIRTH CHART 2 — the pro chart. Its own panel in PagerContainer (after Birth Chart).
 *
 *   [ stage: the chart in 3D ]            press & hold anywhere → close-up at the top
 *   (✦ joystick, lower left)              hold off-centre to rotate the chart
 *   [ aspect legend + summary ]           blurred until tapped
 *   [ classic ][ layers ][ orbits ][ horizon ]   centred ON the bottom edge, blur after a pick
 *
 * Views:
 *   Classic  — the flat wheel.
 *   Layers   — every ring on its own level (aspects deepest, zodiac on top), today's sky floating above.
 *   Orbits   — each planet on its own orbit in speed order inside a gravity well; aspects as 3D lines;
 *              today's planets land on the same orbit as dashed ghosts.
 *   Horizon  — the wheel stands upright; the AC–DC line is the horizon at birth, planets below it dim.
 *
 * Gestures: a swipe is never used here (it belongs to the pager). Press & hold opens the loupe and
 * sets <html data-astro-loupe="on"> so PagerContainer ignores the finger until release. The joystick
 * carries data-no-swipe for the same reason.
 *
 * The 3D scene is built and animated imperatively (one rAF loop, transforms only) — React renders the
 * frame, the controls and the summary text. The loop pauses whenever the panel is not on screen.
 */

interface BirthChart2PanelProps {
  /** True while this panel is the one on screen. */
  isActive?: boolean;
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

type Mode = "classic" | "layers" | "orrery" | "horizon";
type AspectType = "trine" | "sextile" | "conjunction" | "square" | "opposition";

/* ── Vocabulary (same as BirthChartPanel) ───────────────────────────── */
const T = "︎"; // text presentation, never emoji
const GLYPHS: Record<string, string> = {
  Sun: `☉${T}`, Moon: `☽${T}`, Mercury: `☿${T}`, Venus: `♀${T}`, Mars: `♂${T}`,
  Jupiter: `♃${T}`, Saturn: `♄${T}`, Uranus: `♅${T}`, Neptune: `♆${T}`, Pluto: `♇${T}`,
  Chiron: `⚷${T}`, Lilith: `⚸${T}`, "North Node": `☊${T}`, "South Node": `☋${T}`, Ascendant: `↑${T}`, MC: "MC",
};
const DISPLAY_NAMES: Record<string, string> = { Ascendant: "Rising", MC: "Midheaven" };
const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const SIGN_GLYPHS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"].map((g) => g + T);
type ElementName = "Fire" | "Earth" | "Air" | "Water";
const SIGN_ELEMENTS: Record<string, ElementName> = {
  Aries: "Fire", Leo: "Fire", Sagittarius: "Fire", Taurus: "Earth", Virgo: "Earth", Capricorn: "Earth",
  Gemini: "Air", Libra: "Air", Aquarius: "Air", Cancer: "Water", Scorpio: "Water", Pisces: "Water",
};
interface Palette { border: string; glow: string; text: string; bar: string; rgb: string }
const ELEMENT_COLORS: Record<ElementName, Palette> = {
  Fire:  { border: "rgba(249,115,22,.75)", glow: "rgba(239,68,68,.45)",  text: "#FDBA74", bar: "#F97316", rgb: "253,186,116" },
  Earth: { border: "rgba(52,211,153,.65)", glow: "rgba(16,185,129,.4)",  text: "#6EE7B7", bar: "#34D399", rgb: "110,231,183" },
  Air:   { border: "rgba(186,230,253,.6)", glow: "rgba(125,211,252,.38)", text: "#BAE6FD", bar: "#7DD3FC", rgb: "186,230,253" },
  Water: { border: "rgba(96,165,250,.7)",  glow: "rgba(59,130,246,.42)",  text: "#93C5FD", bar: "#60A5FA", rgb: "147,197,253" },
};
const NEUTRAL: Palette = { border: "rgba(255,255,255,.2)", glow: "rgba(255,255,255,.15)", text: "#CBD5E1", bar: "#94A3B8", rgb: "203,213,225" };
const ASPECT_STYLE: Record<AspectType, { label: string; glyph: string; color: string; angle: number; orb: number }> = {
  trine:       { label: "Trine",       glyph: `△${T}`, color: "#6EE7B7", angle: 120, orb: 7 },
  sextile:     { label: "Sextile",     glyph: `⚹${T}`, color: "#A7F3D0", angle: 60,  orb: 5 },
  conjunction: { label: "Conjunction", glyph: `☌${T}`, color: "#FCD34D", angle: 0,   orb: 8 },
  square:      { label: "Square",      glyph: `□${T}`, color: "#FDBA74", angle: 90,  orb: 7 },
  opposition:  { label: "Opposition",  glyph: `☍${T}`, color: "#F87171", angle: 180, orb: 8 },
};
const isAspectType = (t: string): t is AspectType => t in ASPECT_STYLE;
const TRANSIT_ORBS: Array<[AspectType, number]> = [["conjunction", 3], ["opposition", 3], ["square", 3], ["trine", 3], ["sextile", 2]];
const WHEEL_POINTS = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "Chiron", "North Node"];
const CONTACT_POINTS = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "Ascendant"];
/** Orbits view: geocentric speed order, fastest at the bottom of the well. */
const ORB = ["Moon", "Mercury", "Venus", "Sun", "Mars", "Jupiter", "Saturn", "Chiron", "Uranus", "Neptune", "Pluto", "North Node"];
const TOP_CONTACTS = 5;

const MODE_LIST: Array<{ id: Mode; label: string }> = [
  { id: "classic", label: "Classic" },
  { id: "layers", label: "Layers" },
  { id: "orrery", label: "Orbits" },
  { id: "horizon", label: "Horizon" },
];

/* ── Helpers ────────────────────────────────────────────────────────── */
const norm = (l: number) => ((l % 360) + 360) % 360;
const signOf = (l: number) => SIGNS[Math.floor(norm(l) / 30)];
const colorsOf = (sign?: string | null): Palette => (sign && SIGN_ELEMENTS[sign] ? ELEMENT_COLORS[SIGN_ELEMENTS[sign]] : NEUTRAL);
const ordinal = (n: number) => { const s = ["th", "st", "nd", "rd"]; const v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`; };
const dn = (n: string) => DISPLAY_NAMES[n] ?? n;
const lerp = (a: number, b: number, m: number) => a + (b - a) * m;
type V3 = [number, number, number];
const lerp3 = (a: V3, b: V3, m: number): V3 => [lerp(a[0], b[0], m), lerp(a[1], b[1], m), lerp(a[2], b[2], m)];
function parseDegree(value?: string): number | null {
  if (!value) return null;
  const parts = value.match(/\d+(?:\.\d+)?/g);
  if (!parts) return null;
  return parseFloat(parts[0]) + (parts[1] && /\u00B0/.test(value) ? parseFloat(parts[1]) / 60 : 0);
}
function toLongitude(sign?: string, degree?: string): number | null {
  const i = sign ? SIGNS.indexOf(sign) : -1;
  const d = parseDegree(degree);
  return i < 0 || d === null ? null : i * 30 + d;
}
function fmtDeg(lon: number): string {
  const w = ((lon % 30) + 30) % 30;
  let d = Math.floor(w), m = Math.round((w - d) * 60);
  if (m === 60) { d += 1; m = 0; }
  return `${d}°${String(m).padStart(2, "0")}′`;
}
function angleBetween(a: number, b: number) { let d = Math.abs(a - b) % 360; if (d > 180) d = 360 - d; return d; }
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

/* ── Summary line data (rendered by React) ──────────────────────────── */
interface IsoItem { glyph: string; color: string; label: string; orb: string }
type IsoInfo =
  | { kind: "none" }
  | { kind: "natal"; name: string; glyph: string; color: string; items: IsoItem[] }
  | { kind: "transit"; name: string; glyph: string; color: string; items: IsoItem[] };

// Kept outside the component so the panel comes back where the user left it
// (the pager unmounts panels that drift out of its four slots).
const memory: {
  mode: Mode;
  selected: string | null;
  cam: { tilt: number; yaw: number; spin: number } | null;
  introDone: boolean;
} = { mode: "layers", selected: null, cam: null, introDone: false };

/* ═══════════════════════════════════════════════════════════════════════
   ENGINE — builds the 3D scene twice (stage + loupe) and runs the loop.
   ═══════════════════════════════════════════════════════════════════════ */
interface EngineEls {
  stage: HTMLDivElement; scaler: HTMLDivElement; wheel: HTMLDivElement;
  loupe: HTMLDivElement; lens: HTMLDivElement; lensScaler: HTMLDivElement; lensWheel: HTMLDivElement;
  readout: HTMLDivElement; reticle: HTMLDivElement; joy: HTMLDivElement; knob: HTMLDivElement;
}
interface Engine { setMode: (m: Mode) => void; setActive: (on: boolean) => void; destroy: () => void }

interface WheelPoint { name: string; lon: number; rx: boolean }
interface LonAspect { a: WheelPoint; b: WheelPoint; type: AspectType; orb: number }
interface Contact { transit: WheelPoint; natal: { name: string; lon: number }; type: AspectType; orb: number }
interface Pin { name: string; stem: HTMLDivElement; bb: HTMLDivElement }
interface Scene {
  wheel: HTMLDivElement;
  layers: Record<"sky" | "base" | "core" | "planet" | "house" | "zodiac" | "transit", HTMLDivElement>;
  walls: Array<{ el: HTMLDivElement; lo: LayerName | "base"; hi: LayerName; t: number }>;
  slabs: Array<{ el: HTMLDivElement; k: number }>;
  pins: Pin[]; tpins: Pin[];
  contacts: Array<Contact & { el: HTMLDivElement }>;
  asp3d: Array<{ el: HTMLDivElement; a: LonAspect }>;
  orbits: HTMLDivElement[];
  angles: Array<{ lon: number; bb: HTMLDivElement }>;
  aspEls: Element[];
  earth: HTMLDivElement;
}
type LayerName = "core" | "planet" | "house" | "zodiac" | "transit";
interface Geo { z: Record<LayerName, number>; natal: Record<string, { base: V3; top: V3 }>; transit: Record<string, { base: V3; top: V3 }>; orbits: number[] }

// Geometry (480×480 world, same radii as the classic wheel)
const C = 240, R0 = 160, R1 = 133, R2 = 113, R3 = 62, RG = 184, RT = 214, RM = (RG + RT) / 2;
const rOrb = (i: number) => 28 + i * 9.3;
const zOrb = (i: number) => 2 + 66 * Math.pow(i / (ORB.length - 1), 1.5);
const lv = (g: number): Record<LayerName, number> => ({ core: 0.35 * g, planet: g, house: 1.7 * g, zodiac: 2.45 * g, transit: 3.9 * g });
const MODES: Record<Mode, { z: Record<LayerName, number>; stem: number; tstem: number; bob: number; cam: { tilt: number; yaw: number; spin: number } }> = {
  classic: { z: lv(0), stem: 0, tstem: 0, bob: 0, cam: { tilt: 0, yaw: 0, spin: 0 } },
  layers:  { z: lv(24), stem: 24, tstem: 10, bob: 2.4, cam: { tilt: 56, yaw: 0, spin: -10 } },
  orrery:  { z: { core: 0, planet: 0, house: 0, zodiac: 72, transit: 72 }, stem: 10, tstem: 6, bob: 0, cam: { tilt: 46, yaw: 0, spin: -14 } },
  horizon: { z: lv(9), stem: 12, tstem: 6, bob: 1, cam: { tilt: -18, yaw: -12, spin: 0 } },
};
const ZOOM = 2.6, HOLD_MS = 320, SWIPE_SLOP = 10, JOY_MAX = 27;

function createEngine(
  data: { natal: NatalPlacement[]; aspects: NatalAspect[]; transits: TransitPlanet[] },
  els: EngineEls,
  opts: { uid: string; mode: Mode; reduce: boolean; onIso: (i: IsoInfo) => void },
): Engine {
  const { uid, reduce } = opts;

  /* ── Derived chart ── */
  const find = (n: string) => data.natal.find((p) => p.name === n || (n === "MC" && p.name === "Midheaven"));
  const lonOf = (n: string) => { const p = find(n); return p ? toLongitude(p.sign, p.degree) : null; };
  const asc = lonOf("Ascendant") ?? 0;
  const mc = lonOf("MC");
  const ascSign = Math.floor(norm(asc) / 30);
  const houseOf = (lon: number) => ((Math.floor(norm(lon) / 30) - ascSign + 12) % 12) + 1;
  const points: WheelPoint[] = WHEEL_POINTS.flatMap((n) => { const p = find(n); const lon = lonOf(n); return p && lon !== null ? [{ name: n, lon, rx: !!p.isRetrograde }] : []; });
  const byName = (n: string) => points.find((p) => p.name === n);

  // Use the chart's own aspects; fall back to computing them if the chart has none.
  let aspects: LonAspect[] = data.aspects.flatMap((x) => {
    const type = x.type?.toLowerCase(); const a = byName(x.planetA), b = byName(x.planetB);
    return type && isAspectType(type) && a && b ? [{ a, b, type, orb: x.orbDegrees }] : [];
  });
  if (!aspects.length) {
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
      const d = angleBetween(points[i].lon, points[j].lon);
      for (const type of Object.keys(ASPECT_STYLE) as AspectType[]) {
        const o = Math.abs(d - ASPECT_STYLE[type].angle);
        if (o <= ASPECT_STYLE[type].orb) { aspects.push({ a: points[i], b: points[j], type, orb: o }); break; }
      }
    }
  }
  aspects = aspects.slice();

  const transits: WheelPoint[] = data.transits.flatMap((t) => { const lon = toLongitude(t.sign, t.degree); return lon === null ? [] : [{ name: t.name, lon, rx: !!t.isRetrograde }]; });
  const contacts: Contact[] = (() => {
    const out: Contact[] = [];
    const targets = CONTACT_POINTS.flatMap((n) => { const lon = lonOf(n); return lon === null ? [] : [{ name: n, lon }]; });
    transits.filter((t) => t.name !== "Moon" && !t.name.includes("Node")).forEach((t) => targets.forEach((n) => {
      const d = angleBetween(t.lon, n.lon);
      for (const [type, orb] of TRANSIT_ORBS) {
        const o = Math.abs(d - ASPECT_STYLE[type].angle);
        if (o <= orb) { out.push({ transit: t, natal: n, type, orb: o }); break; }
      }
    }));
    return out.sort((x, y) => x.orb - y.orb);
  })();
  const topContacts = contacts.slice(0, TOP_CONTACTS);
  const hitColor = (n: string) => { const c = topContacts.find((h) => h.transit.name === n); return c ? ASPECT_STYLE[c.type].color : null; };
  const natalSpread = spread(points, 11);
  const transitSpread = spread(transits, 10);
  const lifts: Record<string, { v: number; to: number }> = Object.fromEntries(points.map((p) => [p.name, { v: 0, to: 0 }]));

  const th = (lon: number) => ((180 + (lon - asc)) * Math.PI) / 180;
  const P = (lon: number, r: number): [number, number] => [C + r * Math.cos(th(lon)), C - r * Math.sin(th(lon))];
  const f = (n: number) => n.toFixed(2);

  function geom(mode: Mode, t: number): Geo {
    const M = MODES[mode], bob = Math.sin(t / 1500) * M.bob;
    const z = { ...M.z, transit: M.z.transit + bob };
    const natal: Geo["natal"] = {}, transit: Geo["transit"] = {};
    natalSpread.forEach((p) => {
      const lift = M.stem > 0 ? lifts[p.name].v : 0;
      if (mode === "orrery") {
        const i = ORB.indexOf(p.name), [x, y] = P(p.lon, rOrb(i)), zo = zOrb(i);
        natal[p.name] = { base: [x, y, zo], top: [x, y, zo + M.stem + lift] };
      } else {
        const [bx, by] = P(p.lon, R2 - 6), [tx, ty] = P(p.at, R2 - 26);
        natal[p.name] = { base: [bx, by, z.planet], top: [tx, ty, z.planet + M.stem + lift] };
      }
    });
    transitSpread.forEach((p) => {
      const i = ORB.indexOf(p.name);
      if (mode === "orrery" && i >= 0) {
        const [x, y] = P(p.lon, rOrb(i)), zo = zOrb(i);
        transit[p.name] = { base: [x, y, zo], top: [x, y, zo + M.tstem] };
      } else {
        const [bx, by] = P(p.lon, RG + 4), [tx, ty] = P(p.at, RM + 2);
        transit[p.name] = { base: [bx, by, z.transit], top: [tx, ty, z.transit + M.tstem] };
      }
    });
    return { z, natal, transit, orbits: ORB.map((_, i) => (mode === "orrery" ? zOrb(i) : 0)) };
  }
  function blend(A: Geo, B: Geo, m: number): Geo {
    if (m >= 1) return B;
    const z = {} as Record<LayerName, number>;
    (Object.keys(A.z) as LayerName[]).forEach((k) => { z[k] = lerp(A.z[k], B.z[k], m); });
    const natal: Geo["natal"] = {}, transit: Geo["transit"] = {};
    for (const k in A.natal) natal[k] = { base: lerp3(A.natal[k].base, B.natal[k].base, m), top: lerp3(A.natal[k].top, B.natal[k].top, m) };
    for (const k in A.transit) transit[k] = { base: lerp3(A.transit[k].base, B.transit[k].base, m), top: lerp3(A.transit[k].top, B.transit[k].top, m) };
    return { z, natal, transit, orbits: A.orbits.map((v, i) => lerp(v, B.orbits[i], m)) };
  }

  /* ── SVG layers (strings built once, used by both scenes) ── */
  const svgOpen = (extra = "") => `<svg viewBox="0 0 480 480" width="480" height="480" xmlns="http://www.w3.org/2000/svg">${extra}`;
  const annulus = (ro: number, ri: number) =>
    `M ${C - ro} ${C} A ${ro} ${ro} 0 1 0 ${C + ro} ${C} A ${ro} ${ro} 0 1 0 ${C - ro} ${C} Z M ${C - ri} ${C} A ${ri} ${ri} 0 1 1 ${C + ri} ${C} A ${ri} ${ri} 0 1 1 ${C - ri} ${C} Z`;
  const segment = (i: number) => {
    const a = i * 30, b = a + 30;
    const [ox0, oy0] = P(a, R0), [ox1, oy1] = P(b, R0), [ix1, iy1] = P(b, R1), [ix0, iy0] = P(a, R1);
    return `M ${f(ox0)} ${f(oy0)} A ${R0} ${R0} 0 0 0 ${f(ox1)} ${f(oy1)} L ${f(ix1)} ${f(iy1)} A ${R1} ${R1} 0 0 1 ${f(ix0)} ${f(iy0)} Z`;
  };

  const SVG = {
    sky: (() => {
      const r = RT + 40;
      return svgOpen(`<defs><linearGradient id="${uid}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(60,50,140,0)"/><stop offset="70%" stop-color="rgba(110,80,180,.16)"/><stop offset="100%" stop-color="rgba(241,170,110,.30)"/></linearGradient>
        <linearGradient id="${uid}earth" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(2,3,10,.55)"/><stop offset="100%" stop-color="rgba(2,3,10,.9)"/></linearGradient></defs>`)
        + `<path d="M ${C - r} ${C} A ${r} ${r} 0 0 1 ${C + r} ${C} Z" fill="url(#${uid}sky)"/>`
        + `<path d="M ${C - r} ${C} A ${r} ${r} 0 0 0 ${C + r} ${C} Z" fill="url(#${uid}earth)"/>`
        + `<line x1="${C - r - 60}" y1="${C}" x2="${C + r + 60}" y2="${C}" stroke="rgba(241,190,130,.75)" stroke-width="1.2" style="filter:drop-shadow(0 0 6px rgba(241,170,110,.9))"/></svg>`;
    })(),
    base: (() => {
      let s = svgOpen(`<defs><radialGradient id="${uid}plate"><stop offset="0%" stop-color="#0E1532"/><stop offset="100%" stop-color="#060918"/></radialGradient></defs>`);
      s += `<circle cx="${C}" cy="${C}" r="${R0 + 3}" fill="url(#${uid}plate)" stroke="rgba(255,255,255,.14)"/>`;
      const axis = (lon: number, strong: boolean) => {
        const [x0, y0] = P(lon, RT + 2), [x1, y1] = P(lon + 180, RT + 2);
        s += `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="rgba(241,214,148,${strong ? 0.45 : 0.25})" stroke-width="${strong ? 1.2 : 0.9}" ${strong ? "" : 'stroke-dasharray="3 3"'}/>`;
      };
      if (mc !== null) axis(mc, false);
      axis(asc, true);
      return s + "</svg>";
    })(),
    core: (() => {
      let s = svgOpen(`<defs><radialGradient id="${uid}core"><stop offset="0%" stop-color="rgba(241,214,148,.22)"/><stop offset="60%" stop-color="rgba(110,90,200,.06)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient></defs>`);
      s += `<circle cx="${C}" cy="${C}" r="${R3}" fill="rgba(3,5,16,.72)" stroke="rgba(255,255,255,.12)"/><circle cx="${C}" cy="${C}" r="${R3 - 2}" fill="url(#${uid}core)"/>`;
      aspects.forEach(({ a, b, type }, i) => {
        const st = ASPECT_STYLE[type];
        if (st.angle === 0) {
          const [m0, n0] = P(a.lon, R3 - 4), [m1, n1] = P(b.lon, R3 - 4);
          s += `<path class="asp" data-i="${i}" d="M ${f(m0)} ${f(n0)} A ${R3 - 4} ${R3 - 4} 0 0 ${(b.lon - a.lon + 360) % 360 < 180 ? 0 : 1} ${f(m1)} ${f(n1)}" fill="none" stroke="${st.color}" stroke-width="2.2" stroke-linecap="round" stroke-opacity=".85"/>`;
        } else {
          const [x0, y0] = P(a.lon, R3), [x1, y1] = P(b.lon, R3);
          s += `<line class="asp" data-i="${i}" x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="${st.color}" stroke-opacity=".6" stroke-width="1"/>`;
        }
      });
      return s + "</svg>";
    })(),
    planet: (() => {
      let s = svgOpen() + `<path d="${annulus(R2, R3)}" fill-rule="evenodd" fill="rgba(12,18,44,.62)" stroke="rgba(255,255,255,.10)"/>`;
      points.forEach((p) => {
        const e = colorsOf(signOf(p.lon)), [x0, y0] = P(p.lon, R2), [x1, y1] = P(p.lon, R2 - 6);
        s += `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="${e.text}" stroke-width="1.3"/><circle cx="${f(x1)}" cy="${f(y1)}" r="1.8" fill="${e.text}"/>`;
      });
      return s + "</svg>";
    })(),
    house: (() => {
      let s = svgOpen() + `<path d="${annulus(R1, R2)}" fill-rule="evenodd" fill="rgba(16,24,58,.55)" stroke="rgba(255,255,255,.10)"/>`;
      for (let i = 0; i < 12; i++) {
        const a = i * 30, [x0, y0] = P(a, R1), [x1, y1] = P(a, R2), [hx, hy] = P(a + 15, (R1 + R2) / 2);
        s += `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="rgba(255,255,255,.08)"/>`;
        s += `<text x="${f(hx)}" y="${f(hy)}" fill="${i === ascSign ? "#F1D694" : "#64748B"}" font-size="8.5" text-anchor="middle" dominant-baseline="central" font-family="var(--font-sans, Inter, sans-serif)">${((i - ascSign + 12) % 12) + 1}</text>`;
      }
      for (let d = 0; d < 360; d += 5) {
        const [x0, y0] = P(d, R1), [x1, y1] = P(d, R1 - (d % 10 === 0 ? 4 : 2.5));
        s += `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="rgba(255,255,255,.2)" stroke-width=".8"/>`;
      }
      return s + "</svg>";
    })(),
    zodiac: (() => {
      let s = svgOpen();
      for (let i = 0; i < 12; i++) {
        const e = ELEMENT_COLORS[SIGN_ELEMENTS[SIGNS[i]]], [gx, gy] = P(i * 30 + 15, (R0 + R1) / 2);
        s += `<path d="${segment(i)}" fill="${e.bar}" fill-opacity="${i === ascSign ? 0.24 : 0.1}" stroke="rgba(6,9,24,.9)" stroke-width="1"/>`;
        s += `<text x="${f(gx)}" y="${f(gy)}" fill="${e.text}" font-size="15" text-anchor="middle" dominant-baseline="central" style="filter:drop-shadow(0 0 4px ${e.glow})">${SIGN_GLYPHS[i]}</text>`;
      }
      return s + `<circle cx="${C}" cy="${C}" r="${R0}" fill="none" stroke="rgba(241,214,148,.35)"/><circle cx="${C}" cy="${C}" r="${R1}" fill="none" stroke="rgba(255,255,255,.16)"/></svg>`;
    })(),
    transit: (() => {
      let s = svgOpen() + `<path d="${annulus(RT, RG)}" fill-rule="evenodd" fill="rgba(241,214,148,.035)" stroke="rgba(241,214,148,.22)"/>`;
      for (let i = 0; i < 12; i++) { const [x0, y0] = P(i * 30, RG), [x1, y1] = P(i * 30, RG + 3); s += `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="rgba(255,255,255,.18)"/>`; }
      transits.forEach((t) => {
        const hc = hitColor(t.name), [x0, y0] = P(t.lon, RG), [x1, y1] = P(t.lon, RG + 6);
        s += `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="${hc ?? "rgba(226,232,240,.6)"}" stroke-width="${hc ? 1.6 : 1.2}"/>`;
      });
      return s + "</svg>";
    })(),
  };

  /* ── Scene builder ── */
  let suppressClick = false;
  let selected: string | null = memory.selected && byName(memory.selected) ? memory.selected : null;
  let selectedTransit: string | null = null;

  function token(glyph: string, cls = ""): HTMLDivElement {
    const t = document.createElement("div");
    t.className = `tok${cls}`;
    t.textContent = glyph;
    return t;
  }
  function buildScene(wheel: HTMLDivElement, interactive: boolean): Scene {
    wheel.innerHTML = "";
    const add = (cls: string, html = "") => { const d = document.createElement("div"); d.className = cls; if (html) d.innerHTML = html; wheel.appendChild(d); return d; };
    const ring = (cls: string, r: number, border: string) => {
      const d = add(`ring vis ${cls}`);
      d.style.cssText = `left:${C - r}px;top:${C - r}px;width:${2 * r}px;height:${2 * r}px;border:1px solid ${border}`;
      return d;
    };
    const line3d = (cls: string) => add(`ln vis ${cls}`, "<i></i><i></i>");
    const billboard = (cls: string, onClick?: () => void) => {
      const d = add(`bb vis ${cls}`);
      if (interactive && onClick) d.addEventListener("click", (e) => { e.stopPropagation(); if (!suppressClick) onClick(); });
      return d;
    };

    add("shadow vis");
    add("floor vis");
    const layers = {
      sky: add("layer vis L-sky", SVG.sky),
      base: add("layer vis L-base", SVG.base),
    } as Scene["layers"];
    const walls: Scene["walls"] = [];
    const wall = (r: number, lo: LayerName | "base", hi: LayerName, n: number, rgb: string, a0: number, a1: number) => {
      for (let k = 0; k < n; k++) { const t = k / (n - 1); walls.push({ el: ring("wall", r, `rgba(${rgb},${(a0 + (a1 - a0) * t).toFixed(3)})`), lo, hi, t }); }
    };
    wall(R0, "base", "zodiac", 12, "147,197,253", 0.03, 0.16);
    wall(R1, "house", "zodiac", 5, "241,214,148", 0.04, 0.14);
    wall(R2, "planet", "house", 5, "147,197,253", 0.04, 0.12);
    wall(R3, "core", "planet", 5, "147,197,253", 0.05, 0.14);
    layers.core = add("layer vis L-core", SVG.core);
    layers.planet = add("layer vis L-planet", SVG.planet);
    layers.house = add("layer vis L-house", SVG.house);
    const slabs: Scene["slabs"] = [];
    for (let k = 5; k >= 1; k--) {
      slabs.push({ el: ring("slab", R0, `rgba(241,214,148,${0.05 + 0.02 * (5 - k)})`), k });
      slabs.push({ el: ring("slab", R1, `rgba(241,214,148,${0.04 + 0.015 * (5 - k)})`), k });
    }
    layers.zodiac = add("layer vis L-zodiac", SVG.zodiac);
    layers.transit = add("layer vis L-transit", SVG.transit);

    const orbits = ORB.map((n, i) => { const p = byName(n); return ring("orbit", rOrb(i), `rgba(${colorsOf(p ? signOf(p.lon) : null).rgb},.26)`); });
    const earth = billboard("earth");
    earth.appendChild(document.createElement("i"));
    const asp3d = aspects.map((a) => { const el = line3d("asp3d"); el.style.color = ASPECT_STYLE[a.type].color; return { el, a }; });

    const pins: Pin[] = natalSpread.map((p) => {
      const e = colorsOf(signOf(p.lon));
      const stem = line3d("stem"); stem.style.color = e.text; stem.style.opacity = ".55";
      const bb = billboard("natal", () => selectNatal(p.name));
      const tok = token(GLYPHS[p.name] ?? "•");
      tok.style.setProperty("--el", e.border); tok.style.setProperty("--glow", e.glow); tok.style.setProperty("--tx", e.text);
      const d = document.createElement("div"); d.className = "d"; d.textContent = `${fmtDeg(p.lon)}${p.rx ? "℞" : ""}`;
      bb.append(tok, d);
      bb.dataset.kind = "natal"; bb.dataset.name = p.name;
      return { name: p.name, stem, bb };
    });
    const tpins: Pin[] = transitSpread.map((p) => {
      const hc = hitColor(p.name);
      const stem = line3d("stem"); stem.style.color = hc ?? "rgba(226,232,240,.4)";
      const bb = billboard(`tr${hc ? " hit" : ""}`, () => selectTransit(p.name));
      if (hc) bb.style.setProperty("--hit", hc);
      bb.appendChild(token(GLYPHS[p.name] ?? "•"));
      bb.dataset.kind = "transit"; bb.dataset.name = p.name;
      return { name: p.name, stem, bb };
    });
    const contactEls = topContacts.map((c) => { const el = line3d("contact"); el.style.color = ASPECT_STYLE[c.type].color; return { ...c, el }; });
    const angleDefs: Array<[number, string]> = [[asc, "AC"], [asc + 180, "DC"], ...(mc !== null ? ([[mc, "MC"], [mc + 180, "IC"]] as Array<[number, string]>) : [])];
    const angles = angleDefs.map(([lon, lab]) => {
      const bb = billboard("ang");
      const b = document.createElement("b"); b.textContent = lab;
      const d = document.createElement("div"); d.className = "d"; d.textContent = fmtDeg(norm(lon));
      bb.append(b, d);
      return { lon, bb };
    });

    return { wheel, layers, walls, slabs, pins, tpins, contacts: contactEls, asp3d, orbits, angles, aspEls: Array.from(layers.core.querySelectorAll(".asp")), earth };
  }

  function setLine(el: HTMLDivElement, a: V3, b: V3) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], h = Math.hypot(dx, dy), L = Math.hypot(h, dz) || 0.001;
    el.style.width = `${L}px`;
    el.style.transform = `translate3d(${a[0]}px,${a[1]}px,${a[2]}px) rotateZ(${(Math.atan2(dy, dx) * 180) / Math.PI}deg) rotateY(${(-Math.atan2(dz, h) * 180) / Math.PI}deg)`;
  }
  function applyScene(S: Scene, G: Geo, camT: string, face: string, horizon: boolean) {
    S.wheel.style.transform = camT;
    const place = (bb: HTMLDivElement, p: V3, dz: number) => { bb.style.transform = `translate3d(${p[0]}px,${p[1]}px,${p[2] + dz}px) ${face}`; };
    const zOf = (n: LayerName | "base") => (n === "base" ? 0 : G.z[n]);
    (["core", "planet", "house", "zodiac", "transit"] as LayerName[]).forEach((k) => { S.layers[k].style.transform = `translateZ(${G.z[k]}px)`; });
    S.layers.sky.style.transform = "translateZ(-1px)";
    S.walls.forEach((w) => { w.el.style.transform = `translateZ(${lerp(zOf(w.lo), zOf(w.hi), w.t)}px)`; });
    S.slabs.forEach((s) => { s.el.style.transform = `translateZ(${G.z.zodiac - s.k * 1.6}px)`; });
    S.orbits.forEach((o, i) => { o.style.transform = `translateZ(${G.orbits[i]}px)`; });
    place(S.earth, [C, C, 0], 0);
    S.pins.forEach((p) => { const g = G.natal[p.name]; setLine(p.stem, g.base, g.top); place(p.bb, g.top, 10); p.bb.classList.toggle("under", horizon && g.top[1] > C + 2); });
    S.tpins.forEach((p) => { const g = G.transit[p.name]; setLine(p.stem, g.base, g.top); place(p.bb, g.top, 9); p.bb.classList.toggle("under", horizon && g.top[1] > C + 2); });
    S.contacts.forEach((c) => {
      const from = G.transit[c.transit.name].top, nat = G.natal[c.natal.name];
      const to: V3 = nat ? nat.top : [...P(c.natal.lon, R1 + 4), G.z.zodiac] as V3;
      setLine(c.el, [from[0], from[1], from[2] + 4], [to[0], to[1], to[2] + 6]);
    });
    S.asp3d.forEach(({ el, a }) => { const A = G.natal[a.a.name].top, B = G.natal[a.b.name].top; setLine(el, [A[0], A[1], A[2] + 10], [B[0], B[1], B[2] + 10]); });
    S.angles.forEach((a) => place(a.bb, [...P(a.lon, RT + 16), G.z.zodiac] as V3, 4));
  }

  const main = buildScene(els.wheel, true);
  const lensScene = buildScene(els.lensWheel, false);
  const SCENES = [main, lensScene];

  /* ── Selection / isolation ── */
  function selectNatal(n: string) { selectedTransit = null; selected = selected === n ? null : n; memory.selected = selected; applyIso(); }
  function selectTransit(n: string) { selected = null; memory.selected = null; selectedTransit = selectedTransit === n ? null : n; applyIso(); }
  function clearSel() { selected = null; selectedTransit = null; memory.selected = null; applyIso(); }

  function applyIso() {
    const isolating = !!(selected || selectedTransit);
    const related = new Set<string>();
    if (selected) { related.add(selected); aspects.forEach(({ a, b }) => { if (a.name === selected) related.add(b.name); if (b.name === selected) related.add(a.name); }); }
    if (selectedTransit) contacts.filter((x) => x.transit.name === selectedTransit).forEach((x) => related.add(x.natal.name));
    const aspOn = (a: LonAspect) => !!selected && (a.a.name === selected || a.b.name === selected);

    points.forEach((p) => { lifts[p.name].to = p.name === selected ? 22 : isolating && related.has(p.name) ? 9 : 0; });
    SCENES.forEach((S) => {
      S.aspEls.forEach((el) => {
        const a = aspects[Number((el as SVGElement).dataset.i)];
        const on = aspOn(a);
        el.classList.toggle("dim", isolating && !on);
        if (el.tagName === "line") { el.setAttribute("stroke-width", on ? "1.8" : "1"); el.setAttribute("stroke-opacity", on ? ".95" : ".6"); }
      });
      S.asp3d.forEach(({ el, a }) => el.classList.toggle("dim", isolating && !aspOn(a)));
      S.pins.forEach((p) => { const on = !isolating || related.has(p.name); p.bb.classList.toggle("dim", !on); p.stem.classList.toggle("dim", !on); p.bb.classList.toggle("sel", p.name === selected); });
      S.tpins.forEach((p) => { const on = !selectedTransit || p.name === selectedTransit; p.bb.classList.toggle("dim", !on); p.stem.classList.toggle("dim", !on); p.bb.classList.toggle("sel", p.name === selectedTransit); });
      S.contacts.forEach((c) => c.el.classList.toggle("dim", isolating && !(c.transit.name === selectedTransit || c.natal.name === selected)));
    });

    if (selectedTransit) {
      const name = selectedTransit;
      opts.onIso({
        kind: "transit", name, glyph: GLYPHS[name] ?? "•", color: hitColor(name) ?? "#E2E8F0",
        items: contacts.filter((x) => x.transit.name === name).map((x) => ({ glyph: ASPECT_STYLE[x.type].glyph, color: ASPECT_STYLE[x.type].color, label: `your ${dn(x.natal.name)}`, orb: fmtDeg(x.orb) })),
      });
    } else if (selected) {
      const name = selected, p = byName(name);
      opts.onIso({
        kind: "natal", name, glyph: GLYPHS[name] ?? "•", color: colorsOf(p ? signOf(p.lon) : null).text,
        items: aspects.filter(({ a, b }) => a.name === name || b.name === name).map(({ a, b, type, orb }) => ({ glyph: ASPECT_STYLE[type].glyph, color: ASPECT_STYLE[type].color, label: dn(a.name === name ? b.name : a.name), orb: fmtDeg(orb) })),
      });
    } else opts.onIso({ kind: "none" });
  }

  /* ── Views + camera ── */
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const MORPH_MS = reduce ? 1 : 1100;
  const firstRun = !memory.introDone && !reduce;
  let modeA: Mode = firstRun ? "classic" : opts.mode;
  let modeB: Mode = modeA;
  let mix = 1, mixT0 = 0;
  const cam = memory.cam && !firstRun ? { ...memory.cam } : { ...MODES[modeA].cam };
  let camTween: { from: typeof cam; to: typeof cam; t0: number } | null = null;
  const setWheelMode = (m: Mode) => SCENES.forEach((S) => { S.wheel.dataset.mode = m; });
  setWheelMode(modeB);

  function setMode(m: Mode) {
    if (m === modeB) { camTween = { from: { ...cam }, to: { ...MODES[m].cam }, t0: performance.now() }; return; } // same view again = reset camera
    modeA = modeB; modeB = m; mix = 0; mixT0 = performance.now();
    cam.spin = (((cam.spin + 180) % 360) + 360) % 360 - 180;
    camTween = { from: { ...cam }, to: { ...MODES[m].cam }, t0: performance.now() };
    setWheelMode(m);
  }
  let introTimer: number | undefined;
  if (firstRun) { introTimer = window.setTimeout(() => { memory.introDone = true; setMode(opts.mode); }, 300); }
  else memory.introDone = true;

  const fit = () => {
    const r = els.stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const k = Math.min(r.width / 492, r.height / 440);
    els.scaler.style.transform = `scale(${k})`;
    els.lensScaler.style.transform = `scale(${k})`;
    els.lens.style.width = `${r.width}px`;
    els.lens.style.height = `${r.height}px`;
  };
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
  ro?.observe(els.stage);
  fit();

  /* ── Press & hold = magnify. Any swipe is left to the pager. ── */
  let pressing = false, sx = 0, sy = 0, lx = 0, ly = 0, holdTimer: number | undefined, magnifying = false, touchLift = 0;
  const focus = { x: 0, y: 0 };
  const setFocus = (x: number, y: number) => {
    const r = els.stage.getBoundingClientRect();
    focus.x = x - r.left; focus.y = y - r.top - touchLift; // look just above the thumb
    els.reticle.style.left = `${focus.x}px`; els.reticle.style.top = `${focus.y}px`;
  };
  const startMagnify = () => {
    magnifying = true; suppressClick = true; setFocus(lx, ly);
    els.loupe.classList.add("on"); els.reticle.classList.add("on");
    document.documentElement.dataset.astroLoupe = "on"; // PagerContainer ignores the finger while this is set
    navigator.vibrate?.(8);
  };
  const endPress = () => {
    pressing = false; window.clearTimeout(holdTimer);
    if (magnifying) {
      magnifying = false;
      els.loupe.classList.remove("on"); els.reticle.classList.remove("on"); els.readout.classList.remove("on");
      delete document.documentElement.dataset.astroLoupe;
    }
  };
  const onDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest?.("[data-no-swipe]")) return;
    pressing = true; suppressClick = false; sx = lx = e.clientX; sy = ly = e.clientY;
    touchLift = e.pointerType === "touch" ? 64 : 0;
    window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => { if (pressing) startMagnify(); }, HOLD_MS);
  };
  const onMove = (e: PointerEvent) => {
    if (!pressing) return;
    lx = e.clientX; ly = e.clientY;
    if (magnifying) { setFocus(lx, ly); return; }
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > SWIPE_SLOP) { suppressClick = true; endPress(); } // a swipe: hand it over
  };
  const onTouchMove = (e: TouchEvent) => { if (magnifying) e.preventDefault(); };
  const onStageClick = () => { if (!suppressClick) clearSel(); };
  const onContext = (e: Event) => e.preventDefault();
  els.stage.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", endPress);
  window.addEventListener("pointercancel", endPress);
  els.stage.addEventListener("touchmove", onTouchMove, { passive: false });
  els.stage.addEventListener("click", onStageClick);
  els.stage.addEventListener("contextmenu", onContext);

  const readoutLine = (glyph: string, color: string, text: string) => {
    els.readout.textContent = "";
    const b = document.createElement("b"); b.style.color = color; b.textContent = glyph;
    els.readout.append(b, document.createTextNode(text));
  };
  function updateReadout() {
    const r = els.stage.getBoundingClientRect(), fx = r.left + focus.x, fy = r.top + focus.y;
    let best: HTMLElement | null = null, bd = 34;
    main.wheel.querySelectorAll<HTMLElement>(".bb.natal, .bb.tr").forEach((el) => {
      const tok = el.querySelector(".tok"); if (!tok) return;
      const b = tok.getBoundingClientRect(), d = Math.hypot(b.left + b.width / 2 - fx, b.top + b.height / 2 - fy);
      if (d < bd) { bd = d; best = el; }
    });
    const hit = best as HTMLElement | null;
    if (!hit) { els.readout.classList.remove("on"); return; }
    const n = hit.dataset.name ?? "";
    if (hit.dataset.kind === "natal") {
      const p = byName(n); if (!p) return;
      readoutLine(GLYPHS[n] ?? "•", colorsOf(signOf(p.lon)).text, `${n} · ${signOf(p.lon)} ${fmtDeg(p.lon)}${p.rx ? " ℞" : ""} · ${ordinal(houseOf(p.lon))}`);
    } else {
      const t = transits.find((x) => x.name === n); if (!t) return;
      const hits = contacts.filter((x) => x.transit.name === n).length;
      readoutLine(GLYPHS[n] ?? "•", hitColor(n) ?? "#E2E8F0", `${n} today · ${signOf(t.lon)} ${fmtDeg(t.lon)}${t.rx ? " ℞" : ""}${hits ? ` · ${hits} contact${hits > 1 ? "s" : ""}` : ""}`);
    }
    els.readout.classList.add("on");
  }

  /* ── Joystick: hold off-centre to keep rotating; springs back ── */
  let joyActive = false, joyId: number | null = null;
  let joyVec = { x: 0, y: 0 }, knobPos = { x: 0, y: 0 };
  const joyMove = (e: PointerEvent) => {
    const r = els.joy.getBoundingClientRect();
    let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(x, y); if (d > JOY_MAX) { x *= JOY_MAX / d; y *= JOY_MAX / d; }
    knobPos = { x, y }; joyVec = { x: x / JOY_MAX, y: y / JOY_MAX };
  };
  const onJoyDown = (e: PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    joyActive = true; joyId = e.pointerId; els.joy.setPointerCapture(e.pointerId); els.joy.classList.add("on");
    camTween = null; joyMove(e);
  };
  const onJoyMove = (e: PointerEvent) => { if (joyActive && e.pointerId === joyId) joyMove(e); };
  const onJoyEnd = (e: PointerEvent) => { if (e.pointerId !== joyId) return; joyActive = false; joyId = null; joyVec = { x: 0, y: 0 }; els.joy.classList.remove("on"); };
  const stop = (e: Event) => e.stopPropagation();
  els.joy.addEventListener("pointerdown", onJoyDown);
  els.joy.addEventListener("pointermove", onJoyMove);
  els.joy.addEventListener("pointerup", onJoyEnd);
  els.joy.addEventListener("pointercancel", onJoyEnd);
  els.joy.addEventListener("click", stop);
  function joyStep(dt: number) {
    if (!joyActive) { const k = Math.pow(0.0008, dt); knobPos.x *= k; knobPos.y *= k; } // spring home
    els.knob.style.transform = `translate(${knobPos.x}px, ${knobPos.y}px)`;
    if (!joyActive) return;
    const curve = (v: number) => v * Math.abs(v); // fine near the centre, quicker at the edge
    const vx = curve(joyVec.x), vy = curve(joyVec.y);
    if (modeB === "horizon") {
      cam.yaw = Math.max(-60, Math.min(60, cam.yaw + vx * 45 * dt));
      cam.tilt = Math.max(-35, Math.min(8, cam.tilt - vy * 29 * dt));
    } else {
      cam.spin -= vx * 98 * dt;
      if (modeB !== "classic") cam.tilt = Math.max(8, Math.min(80, cam.tilt - vy * 39 * dt));
    }
  }

  /* ── Loop ── */
  let raf = 0, active = false, lastNow = performance.now();
  function frame(now: number) {
    const dt = Math.min(0.05, (now - lastNow) / 1000); lastNow = now;
    joyStep(dt);
    if (mix < 1) mix = Math.min(1, (now - mixT0) / MORPH_MS);
    if (camTween) {
      const k = Math.min(1, (now - camTween.t0) / MORPH_MS), e = ease(k);
      cam.tilt = lerp(camTween.from.tilt, camTween.to.tilt, e);
      cam.yaw = lerp(camTween.from.yaw, camTween.to.yaw, e);
      cam.spin = lerp(camTween.from.spin, camTween.to.spin, e);
      if (k >= 1) camTween = null;
    }
    for (const k in lifts) lifts[k].v += (lifts[k].to - lifts[k].v) * 0.14;

    const t = reduce ? 0 : now;
    const G = blend(geom(modeA, t), geom(modeB, t), ease(mix));
    const camT = `rotateX(${cam.tilt}deg) rotateY(${cam.yaw}deg) rotateZ(${cam.spin}deg)`;
    const face = `rotateZ(${-cam.spin}deg) rotateY(${-cam.yaw}deg) rotateX(${-cam.tilt}deg) translate(-50%,-50%)`;
    const horizon = modeB === "horizon";
    applyScene(main, G, camT, face, horizon);
    if (magnifying) {
      const LW = els.loupe.clientWidth, LH = els.loupe.clientHeight;
      els.lens.style.transform = `translate(${LW / 2 - focus.x * ZOOM}px, ${LH / 2 - focus.y * ZOOM}px) scale(${ZOOM})`;
      applyScene(lensScene, G, camT, face, horizon);
      updateReadout();
    }
    raf = requestAnimationFrame(frame);
  }
  function setActive(on: boolean) {
    if (on === active) return;
    active = on;
    if (on) { lastNow = performance.now(); fit(); raf = requestAnimationFrame(frame); }
    else { cancelAnimationFrame(raf); endPress(); }
  }

  applyIso();
  // Draw one frame immediately so the panel is never blank while sliding in.
  applyScene(main, geom(modeB, 0), `rotateX(${cam.tilt}deg) rotateY(${cam.yaw}deg) rotateZ(${cam.spin}deg)`,
    `rotateZ(${-cam.spin}deg) rotateY(${-cam.yaw}deg) rotateX(${-cam.tilt}deg) translate(-50%,-50%)`, modeB === "horizon");

  return {
    setMode,
    setActive,
    destroy() {
      setActive(false);
      window.clearTimeout(introTimer);
      memory.cam = { ...cam };
      ro?.disconnect();
      els.stage.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", endPress);
      window.removeEventListener("pointercancel", endPress);
      els.stage.removeEventListener("touchmove", onTouchMove);
      els.stage.removeEventListener("click", onStageClick);
      els.stage.removeEventListener("contextmenu", onContext);
      els.joy.removeEventListener("pointerdown", onJoyDown);
      els.joy.removeEventListener("pointermove", onJoyMove);
      els.joy.removeEventListener("pointerup", onJoyEnd);
      els.joy.removeEventListener("pointercancel", onJoyEnd);
      els.joy.removeEventListener("click", stop);
      els.wheel.innerHTML = "";
      els.lensWheel.innerHTML = "";
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   PANEL
   ═══════════════════════════════════════════════════════════════════════ */
export default function BirthChart2Panel({ isActive = true }: BirthChart2PanelProps) {
  const [natal, setNatal] = useState<NatalPlacement[]>([]);
  const [natalAspects, setNatalAspects] = useState<NatalAspect[]>([]);
  const [transits, setTransits] = useState<TransitPlanet[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [mode, setModeState] = useState<Mode>(memory.mode);
  const [iso, setIso] = useState<IsoInfo>({ kind: "none" });
  const [infoVeiled, setInfoVeiled] = useState(true);
  const [actionsVeiled, setActionsVeiled] = useState(memory.introDone);
  const [toast, setToast] = useState<string | null>(null);

  const uid = `b2${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const stageRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  const loupeRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const lensScalerRef = useRef<HTMLDivElement>(null);
  const lensWheelRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const joyRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const activeRef = useRef(isActive);
  const veilTimer = useRef<number | undefined>(undefined);
  const toastTimer = useRef<number | undefined>(undefined);

  /* Load the chart (retry briefly while it is being calculated). Same as BirthChartPanel. */
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

  /* Keep today's transits fresh (same refresh as BirthChartPanel; isSkyFresh keeps them from doubling up). */
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
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  const hasChart = natal.length > 0;

  /* Build the 3D scene once the DOM and the chart are ready; rebuild if the chart changes. */
  useEffect(() => {
    if (isLoading || !hasChart) return;
    const els = {
      stage: stageRef.current, scaler: scalerRef.current, wheel: wheelRef.current,
      loupe: loupeRef.current, lens: lensRef.current, lensScaler: lensScalerRef.current, lensWheel: lensWheelRef.current,
      readout: readoutRef.current, reticle: reticleRef.current, joy: joyRef.current, knob: knobRef.current,
    };
    if (Object.values(els).some((v) => !v)) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const engine = createEngine({ natal, aspects: natalAspects, transits }, els as EngineEls, { uid, mode: memory.mode, reduce, onIso: setIso });
    engineRef.current = engine;
    engine.setActive(activeRef.current);
    return () => { engine.destroy(); engineRef.current = null; };
  }, [isLoading, hasChart, natal, natalAspects, transits, uid]);

  /* Only animate while on screen. */
  useEffect(() => {
    activeRef.current = isActive;
    engineRef.current?.setActive(isActive);
  }, [isActive]);

  /* The view switcher veils itself shortly after the intro. */
  useEffect(() => {
    if (actionsVeiled) return;
    veilTimer.current = window.setTimeout(() => setActionsVeiled(true), 2200);
    return () => window.clearTimeout(veilTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { window.clearTimeout(veilTimer.current); window.clearTimeout(toastTimer.current); delete document.documentElement.dataset.astroLoupe; }, []);

  const veilIn = (ms: number) => { window.clearTimeout(veilTimer.current); veilTimer.current = window.setTimeout(() => setActionsVeiled(true), ms); };
  const pickMode = (m: Mode) => {
    if (actionsVeiled) { setActionsVeiled(false); veilIn(4000); return; } // first tap only reveals
    engineRef.current?.setMode(m);
    if (m !== mode) {
      memory.mode = m;
      setModeState(m);
      setToast(MODE_LIST.find((x) => x.id === m)?.label ?? null);
      window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 1200);
    }
    veilIn(700);
  };

  if (isLoading) {
    return (
      <div className="b2 b2-center">
        <p className="b2-quiet">Casting your chart…</p>
        <style jsx global>{`.b2-center { display: flex; align-items: center; justify-content: center; height: 100%; } .b2-quiet { font-size: 13px; color: #94A3B8; margin: 0; }`}</style>
      </div>
    );
  }

  const isoLine = (() => {
    if (iso.kind === "none") return <span className="q">Tap a planet to see its aspects</span>;
    return (
      <>
        <b style={{ color: iso.color }}>{iso.glyph} {iso.name}{iso.kind === "transit" ? <> <em>today</em></> : null}</b>{" "}
        {iso.items.length
          ? iso.items.map((x, i) => (
              <React.Fragment key={i}>{i > 0 ? " · " : ""}<span style={{ color: x.color }}>{x.glyph}</span> {x.label} <em>{x.orb}</em></React.Fragment>
            ))
          : <span className="q">{iso.kind === "transit" ? "no tight contacts with your chart" : "no major aspects"}</span>}
      </>
    );
  })();

  return (
    <div className="b2">
      <style jsx global>{`
        .b2 {
          --b2-display: var(--font-display), "Cormorant Garamond", Georgia, serif;
          --b2-caps: var(--font-caps), Cinzel, Georgia, serif;
          --b2-gold: rgba(241, 214, 148, 0.9);
          --s100: #F1F5F9; --s200: #E2E8F0; --s300: #CBD5E1; --s400: #94A3B8; --s500: #64748B; --s600: #475569;
          /* Frame — bottom edge matches BirthChartPanel / DailyPanel */
          --cap-mt: 14px;
          --gap: 8px;
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
            calc(env(safe-area-inset-top) + 8px)
            clamp(12px, 4vw, 16px)
            calc(env(safe-area-inset-bottom) + 10px + var(--cap-mt) + 14px);
          color: var(--s100);
          font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
          -webkit-tap-highlight-color: transparent;
        }
        .b2 * { box-sizing: border-box; }
        :where(.b2) :where(p) { margin: 0; }
        .b2-empty { margin: auto; padding: 32px 0; text-align: center; font-size: 13px; line-height: 1.6; color: var(--s400); }

        /* ── 3D stage ── */
        .b2 .stage { position: relative; flex: 1; min-height: 0; perspective: 1150px; perspective-origin: 50% 32%; touch-action: pan-x pan-y; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
        .b2 .scaler { position: absolute; left: 50%; top: 52%; width: 480px; height: 480px; margin: -240px 0 0 -240px; transform-style: preserve-3d; }
        .b2 .wheel { position: absolute; inset: 0; transform-style: preserve-3d; }
        .b2 .layer { position: absolute; inset: 0; transform-style: preserve-3d; pointer-events: none; }
        .b2 .layer svg { position: absolute; inset: 0; overflow: visible; display: block; }
        .b2 .ring { position: absolute; border-radius: 50%; pointer-events: none; }
        .b2 .shadow { position: absolute; left: 40px; top: 40px; width: 400px; height: 400px; border-radius: 50%; pointer-events: none;
          background: radial-gradient(circle, rgba(0,0,0,.6) 0%, rgba(0,0,0,.35) 45%, transparent 70%); filter: blur(14px); transform: translateZ(-2px); }
        .b2 .floor { position: absolute; left: -210px; top: -110px; width: 900px; height: 700px; transform: rotateX(90deg); pointer-events: none;
          background-image: linear-gradient(rgba(241,214,148,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(241,214,148,.16) 1px, transparent 1px);
          background-size: 30px 30px; background-position: center;
          -webkit-mask-image: radial-gradient(ellipse 50% 50% at center, #000 15%, transparent 70%); mask-image: radial-gradient(ellipse 50% 50% at center, #000 15%, transparent 70%); }

        .b2 .vis { transition: opacity .6s ease; }
        .b2 .wheel[data-mode="orrery"] :is(.L-core, .L-planet, .L-house, .L-transit, .wall, .slab) { opacity: 0 !important; }
        .b2 .wheel:not([data-mode="orrery"]) :is(.orbit, .asp3d, .earth) { opacity: 0 !important; }
        .b2 .wheel:not([data-mode="horizon"]) :is(.floor, .L-sky) { opacity: 0 !important; }
        .b2 .wheel[data-mode="horizon"] .shadow { opacity: 0; }
        .b2 .wheel[data-mode="classic"] .stem { opacity: 0 !important; }

        /* 3D lines: two crossed ribbons so they never vanish edge-on */
        .b2 .ln { position: absolute; left: 0; top: -0.6px; height: 1.2px; transform-origin: 0 50%; transform-style: preserve-3d; pointer-events: none; transition: opacity .3s ease; }
        .b2 .ln i { position: absolute; inset: 0; background: currentColor; }
        .b2 .ln i + i { transform: rotateX(90deg); }
        .b2 .ln.contact { opacity: .9; }
        .b2 .ln.contact i { background: repeating-linear-gradient(90deg, currentColor 0 3px, transparent 3px 6px); }
        .b2 .ln.asp3d { height: 1.4px; top: -0.7px; }
        .b2 .ln.dim { opacity: .07; }

        /* Billboards: always face the camera */
        .b2 .bb { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; align-items: center; white-space: nowrap; cursor: pointer; transition: opacity .3s ease; }
        .b2 .bb.dim { opacity: .16; }
        .b2 .tok { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 15px; line-height: 1;
          background: radial-gradient(circle at 35% 30%, rgba(30,40,80,.95), rgba(6,9,24,.92) 70%);
          border: 1px solid var(--el, rgba(255,255,255,.3));
          box-shadow: 0 0 10px var(--glow, transparent), inset 0 1px 0 rgba(255,255,255,.12), 0 4px 8px rgba(0,0,0,.5);
          color: var(--tx, #E2E8F0); transition: transform .3s cubic-bezier(.22,1,.36,1), box-shadow .3s, filter .4s; }
        .b2 .bb.sel .tok { transform: scale(1.22); box-shadow: 0 0 18px var(--glow), 0 0 4px var(--tx), inset 0 1px 0 rgba(255,255,255,.2); }
        .b2 .bb.under .tok { filter: saturate(.35) brightness(.55); }
        .b2 .bb.under .d { opacity: .45; }
        .b2 .bb .d { margin-top: 2px; font-size: 7.5px; color: var(--s400); font-variant-numeric: tabular-nums; text-shadow: 0 1px 3px #000; }
        .b2 .bb.tr .tok { width: 22px; height: 22px; font-size: 13px; background: radial-gradient(circle at 35% 30%, rgba(60,55,40,.9), rgba(12,10,6,.9) 70%); border-color: rgba(226,232,240,.35); }
        .b2 .bb.tr.hit .tok { border-color: var(--hit); color: var(--hit); box-shadow: 0 0 12px var(--hit); }
        .b2 .wheel[data-mode="orrery"] .bb.tr .tok { width: 18px; height: 18px; font-size: 11px; border-style: dashed; background: rgba(12,10,6,.55); }
        .b2 .bb.ang { cursor: default; pointer-events: none; }
        .b2 .bb.ang b { font-family: var(--b2-caps); font-size: 9px; font-weight: 600; letter-spacing: 1px; color: rgba(241,214,148,.95); text-shadow: 0 0 8px rgba(0,0,0,.9); }
        .b2 .earth { pointer-events: none; }
        .b2 .earth i { width: 12px; height: 12px; border-radius: 50%; display: block;
          background: radial-gradient(circle at 40% 35%, #fff, #93C5FD 45%, #1e3a8a 100%); box-shadow: 0 0 16px rgba(147,197,253,.8), 0 0 40px rgba(147,197,253,.35); }
        .b2 .asp { transition: opacity .25s ease; }
        .b2 .asp.dim { opacity: .06; }

        /* ── Loupe: no frame, a close-up that dissolves into the sky ── */
        .b2 .loupe { position: absolute; left: 50%; top: calc(env(safe-area-inset-top) + 4px); width: min(360px, 94%); height: 190px; transform: translateX(-50%) scale(.92);
          overflow: hidden; z-index: 20; pointer-events: none; background: rgba(5,8,22,.94);
          -webkit-mask-image: radial-gradient(ellipse 50% 50% at center, #000 45%, rgba(0,0,0,.6) 70%, transparent 100%);
                  mask-image: radial-gradient(ellipse 50% 50% at center, #000 45%, rgba(0,0,0,.6) 70%, transparent 100%);
          opacity: 0; transition: opacity .2s ease, transform .3s cubic-bezier(.22,1,.36,1); }
        .b2 .loupe.on { opacity: 1; transform: translateX(-50%); }
        .b2 .lens { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
        .b2 .lens .stage { position: absolute; inset: 0; }
        .b2 .readout { position: absolute; left: 50%; top: calc(env(safe-area-inset-top) + 4px + 184px); transform: translateX(-50%); z-index: 21; pointer-events: none;
          font-family: var(--b2-caps); font-size: 9px; font-weight: 500; letter-spacing: .18em; text-transform: uppercase; color: var(--s300); white-space: nowrap;
          text-shadow: 0 0 10px #050816, 0 0 4px #050816; opacity: 0; transition: opacity .15s; }
        .b2 .readout.on { opacity: 1; }
        .b2 .readout b { font-family: var(--font-sans, Inter, sans-serif); font-weight: 400; letter-spacing: 0; margin-right: 6px; font-size: 12px; }
        .b2 .reticle { position: absolute; width: 70px; height: 70px; margin: -35px 0 0 -35px; border-radius: 50%; pointer-events: none; z-index: 5;
          background: radial-gradient(circle, rgba(255,255,255,.10) 0%, rgba(255,255,255,.04) 45%, transparent 70%);
          opacity: 0; transform: scale(.6); transition: opacity .15s, transform .25s cubic-bezier(.22,1,.36,1); }
        .b2 .reticle.on { opacity: 1; transform: none; }

        /* ── Joystick: a soft ball of starlight ── */
        .b2 .joy { position: absolute; left: 10px; bottom: 4px; width: 104px; height: 104px; z-index: 6; touch-action: none; cursor: grab; }
        .b2 .knob { position: absolute; left: 50%; top: 50%; width: 60px; height: 60px; margin: -30px 0 0 -30px; pointer-events: none; will-change: transform; border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,.22) 0%, rgba(220,230,255,.10) 35%, rgba(200,215,255,0) 70%);
          animation: b2StarBreathe 3.6s ease-in-out infinite; transition: filter .3s; }
        .b2 .knob i { position: absolute; left: 50%; top: 50%; border-radius: 50%; }
        .b2 .knob .core { width: 14px; height: 14px; margin: -7px 0 0 -7px;
          background: radial-gradient(circle, #fff 0%, #fff 30%, rgba(235,240,255,.75) 55%, rgba(220,230,255,0) 100%);
          box-shadow: 0 0 10px 3px rgba(255,255,255,.7), 0 0 26px 8px rgba(210,225,255,.35); transition: transform .3s, box-shadow .3s; }
        .b2 .knob .flare { width: 56px; height: 56px; margin: -28px 0 0 -28px; filter: blur(1.4px); opacity: .7;
          background: radial-gradient(ellipse 50% 3% at center, rgba(255,255,255,.9), transparent), radial-gradient(ellipse 3% 50% at center, rgba(255,255,255,.9), transparent); }
        .b2 .joy.on .knob { filter: brightness(1.35); }
        .b2 .joy.on .knob .core { transform: scale(1.18); box-shadow: 0 0 14px 4px rgba(255,255,255,.85), 0 0 36px 12px rgba(210,225,255,.45); }
        @keyframes b2StarBreathe { 0%, 100% { opacity: .85; } 50% { opacity: 1; } }

        .b2 .toast { position: absolute; left: 50%; bottom: 4px; transform: translateX(-50%); pointer-events: none; font-family: var(--b2-caps); font-size: 10px; font-weight: 500; letter-spacing: .32em; text-transform: uppercase; color: var(--b2-gold); opacity: 0; transition: opacity .4s; }
        .b2 .toast.on { opacity: 1; }

        /* ── Veiled summary ── */
        .b2 .info { position: relative; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; text-align: center; cursor: pointer; padding: 6px 6px 2px; border: 0; background: none; color: inherit; font: inherit; width: 100%; }
        .b2 .info-c { display: flex; flex-direction: column; align-items: center; gap: 7px; transition: filter .35s ease, opacity .35s ease; }
        .b2 .info.veiled .info-c { filter: blur(5px); opacity: .55; }
        .b2 .veil { position: absolute; inset: 0; display: grid; place-items: center; font-family: var(--b2-caps); font-size: 7.5px; letter-spacing: .3em; text-transform: uppercase; color: var(--s400); opacity: 0; transition: opacity .35s; pointer-events: none; }
        .b2 .info.veiled .veil { opacity: 1; }
        .b2 .legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 12px; font-family: var(--b2-caps); font-size: 7.5px; font-weight: 500; letter-spacing: .14em; text-transform: uppercase; color: var(--s400); }
        .b2 .legend span { display: inline-flex; align-items: center; gap: 5px; }
        .b2 .legend i { width: 12px; height: 2px; border-radius: 1px; display: inline-block; }
        .b2 .legend i.dash { background: repeating-linear-gradient(90deg, rgba(226,232,240,.8) 0 3px, transparent 3px 5px); }
        .b2 .iso { min-height: 32px; max-width: 100%; font-size: 11px; line-height: 1.45; color: var(--s300); }
        .b2 .iso b { font-weight: 500; margin-right: 4px; }
        .b2 .iso em { font-style: normal; color: var(--s500); font-variant-numeric: tabular-nums; }
        .b2 .iso .q { font-family: var(--b2-display); font-style: italic; font-size: 13.5px; color: var(--s500); }

        /* ── View switcher: centred ON the bottom edge, veils after a pick ── */
        .b2 .actions { flex-shrink: 0; height: 0; margin-top: calc(19px + 8px - var(--gap)); overflow: visible; display: flex; align-items: center; justify-content: center; gap: 12px; }
        .b2 .btn { width: 38px; height: 38px; border-radius: 12px; border: 1px solid rgba(255,255,255,.5); background: rgba(0,0,0,.25); color: #F8FAFC;
          box-shadow: 0 0 14px rgba(255,255,255,.1), inset 0 0 10px rgba(255,255,255,.07); display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0;
          transition: background .25s, color .25s, box-shadow .25s, filter .35s, opacity .35s; }
        .b2 .btn[aria-pressed="true"] { background: rgba(248,250,252,.94); color: #070A18; box-shadow: 0 0 18px rgba(255,255,255,.28); }
        .b2 .btn svg { width: 19px; height: 19px; }
        .b2 .actions.veiled .btn { filter: blur(4px); opacity: .45; }

        @media (max-height: 870px) { .b2 { --cap-mt: 12px; } }
        @media (max-height: 680px) { .b2 { --cap-mt: 10px; } .b2 .loupe { height: 150px; } .b2 .readout { top: calc(env(safe-area-inset-top) + 4px + 144px); } }
        @media (prefers-reduced-motion: reduce) { .b2 .knob { animation: none; } }
      `}</style>

      {!hasChart ? (
        <p className="b2-empty">Enter your birth details to reveal your chart.</p>
      ) : (
        <>
          <div className="stage" ref={stageRef} role="img" aria-label="Birth chart in 3D. Press and hold to magnify. Use the light in the lower left to rotate.">
            <div className="scaler" ref={scalerRef}><div className="wheel" ref={wheelRef} /></div>
            <div className="reticle" ref={reticleRef} />
            <div className={`toast${toast ? " on" : ""}`} aria-live="polite">{toast}</div>
            <div className="joy" ref={joyRef} data-no-swipe role="slider" aria-label="Rotate chart" aria-valuenow={0}>
              <div className="knob" ref={knobRef}><i className="flare" /><i className="core" /></div>
            </div>
          </div>

          <button
            type="button"
            className={`info${infoVeiled ? " veiled" : ""}`}
            aria-label={infoVeiled ? "Show aspect details" : "Hide aspect details"}
            onClick={() => setInfoVeiled((v) => !v)}
          >
            <span className="info-c">
              <span className="legend">
                {Object.values(ASPECT_STYLE).map((s) => (<span key={s.label}><i style={{ background: s.color }} />{s.label}</span>))}
                <span><i className="dash" />Transit</span>
              </span>
              <span className="iso" aria-live="polite">{isoLine}</span>
            </span>
            <span className="veil">Tap to reveal</span>
          </button>

          <div className={`actions${actionsVeiled ? " veiled" : ""}`} role="group" aria-label="Chart view">
            {MODE_LIST.map(({ id, label }) => (
              <button key={id} type="button" className="btn" aria-pressed={mode === id} aria-label={`${label} view`} onClick={() => pickMode(id)}>
                <ModeIcon mode={id} />
              </button>
            ))}
          </div>

          {/* Loupe: a second copy of the stage, scaled up and slid under the close-up */}
          <div className="loupe" ref={loupeRef} aria-hidden="true">
            <div className="lens" ref={lensRef}>
              <div className="stage">
                <div className="scaler" ref={lensScalerRef}><div className="wheel" ref={lensWheelRef} /></div>
              </div>
            </div>
          </div>
          <div className="readout" ref={readoutRef} aria-live="polite" />
        </>
      )}
    </div>
  );
}

function ModeIcon({ mode }: { mode: Mode }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, "aria-hidden": true } as const;
  switch (mode) {
    case "classic":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 3v4.5M12 16.5V21M3 12h4.5M16.5 12H21" /></svg>;
    case "layers":
      return <svg {...common}><ellipse cx="12" cy="16.5" rx="9" ry="3.2" /><ellipse cx="12" cy="12" rx="7" ry="2.5" /><ellipse cx="12" cy="7.5" rx="5" ry="1.8" /></svg>;
    case "orrery":
      return <svg {...common}><ellipse cx="12" cy="13" rx="9.5" ry="4.5" /><ellipse cx="12" cy="13" rx="5.5" ry="2.4" /><circle cx="12" cy="13" r="1.2" fill="currentColor" /><circle cx="19" cy="10.4" r="1.6" fill="currentColor" stroke="none" /></svg>;
    case "horizon":
      return <svg {...common} strokeLinecap="round"><path d="M4.5 15a7.5 7.5 0 0 1 15 0" /><path d="M2 15h20" /><path d="M5 18.5h14M8 21.5h8" opacity=".55" /></svg>;
  }
}
