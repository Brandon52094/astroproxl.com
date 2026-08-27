// ============================================================
// FILE: app/api/readings/followup/route.ts (COMPLETE UPDATED)
// ============================================================

import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { buildVoiceCalibrationBlock } from "@/lib/signVoice";
import { assessRisk, getSafeResponse, getCareNote } from "@/lib/crisisDetection";
import type { TransitAspect } from "@/lib/transitAspects";
import {
  buildValidDateIndex,
  findUnsupportedMarkers,
} from "@/lib/validateReadingDates";
import {
  validateAndFilterAspects,
} from "@/lib/reading/engine";

// ── NEW: Import advanced calculation types ──
import {
  type HouseRuler,
  type MutualReception,
  type EssentialDignity,
  type SynodicCycle,
  type Midpoint,
  type LunarReturn,
  type EclipseActivation,
  type TransitToAngle,
  type DispositorResult,
} from "@/lib/astrologicalCalculations";

interface PlanetPlacement {
  name: string;
  sign: string;
  degree: string;
  house?: string;
  isAnaretic?: boolean;
}

interface Aspect {
  type: string;
  planetA: string;
  planetB: string;
  orbDegrees: number;
}

interface TransitPlanet {
  name: string;
  sign: string;
  degree: string;
  longitude: number;
  isRetrograde: boolean;
}

interface ProgressedPlanet {
  name: string;
  sign: string;
  degree: string;
  longitude: number;
  isRetrograde: boolean;
}

interface SolarArcPlanet {
  name: string;
  natalPoint: string;
  sign: string;
  degree: string;
  longitude: number;
}

interface DeclinationData {
  planet: string;
  declination: number;
  isOutOfBounds: boolean;
}

interface ArabicLot {
  name: "Lot of Fortune" | "Lot of Spirit";
  sign: string;
  degree: string;
  house: number;
}

interface ExtendedPoints {
  declinations: DeclinationData[];
  arabicLots: ArabicLot[];
}

interface ProfectionData {
  age: number;
  activatedHouse: number;
  activatedSign: string;
  timeLord: string;
  timeLordNatalSign?: string;
  timeLordNatalHouse?: number;
}

interface UpcomingTrigger {
  date: string;
  exactJulianDay: number;
  transitPlanet: string;
  natalPlanet: string;
  aspect: string;
}

interface PlanetaryStationData {
  planet: string;
  stationType: string;
  stationDate: string;
  degree: string;
  sign: string;
  natalPlanetHit?: string;
  natalHouse?: number;
  orbDegrees: number;
}

interface SolarReturnData {
  sunReturnDate: string;
  location: string;
  ascendant: { sign: string; degree: string };
  midheaven: { sign: string; degree: string };
  planets: Array<{ name: string; sign: string; degree: string; house: string }>;
  timeLordInSR: string | null;
  timeLordSRHouse: number | null;
}

interface MoonPhaseData {
  phaseName: string;
  illuminationPercent: number;
  nextEventName: "New Moon" | "Full Moon";
  daysUntilNextEvent: number;
  moonSign: string;
  moonDegree: string;
}

type DatedTransitToAngle = TransitToAngle & {
  exactDate?: string;
  exactJulianDay?: number;
};

// ── NEW: Extended FollowupRequestBody with all 10 calculations ──
interface FollowupRequestBody {
  question: string;
  originalReading: string;
  originalTitle: string;
  topic: "love" | "career" | "money" | "general";
  tropical: { planets: PlanetPlacement[]; aspects: Aspect[] };
  sidereal?: { planets: PlanetPlacement[] };
  transits: TransitPlanet[];
  transitAspects?: TransitAspect[];
  profection: ProfectionData;
  progressions?: ProgressedPlanet[];
  solarArcs?: SolarArcPlanet[];
  upcomingTrigger?: UpcomingTrigger;
  planetaryStations?: PlanetaryStationData[];
  solarReturn?: SolarReturnData;
  moonPhase?: MoonPhaseData;
  extendedPoints?: ExtendedPoints;
  conversationHistory?: string;
  
  // ── NEW: All 10 advanced calculations ──
  houseRulers?: HouseRuler[];
  mutualReceptions?: MutualReception[];
  essentialDignities?: EssentialDignity[];
  synodicCycles?: SynodicCycle[];
  midpoints?: Midpoint[];
  lunarReturn?: LunarReturn;
  eclipseActivations?: EclipseActivation[];
  transitsToAngles?: DatedTransitToAngle[];
  dispositorTree?: DispositorResult[];
  
  freeRepliesUsed?: number;
}

const NL = "\n";

function fmtPlanet(p: PlanetPlacement): string {
  return p.name + ": " + p.sign + " " + p.degree + (p.house ? " (House " + p.house + ")" : "");
}

function fmtTransit(p: TransitPlanet): string {
  return p.name + ": " + p.sign + " " + p.degree + (p.isRetrograde ? " Rx" : "");
}

function fmtAspect(a: Aspect): string {
  return a.planetA + " " + a.type + " " + a.planetB + " — " + a.orbDegrees + "° orb";
}

function fmtProgression(p: ProgressedPlanet): string {
  return p.name + ": " + p.sign + " " + p.degree + (p.isRetrograde ? " Rx" : "");
}

function fmtSolarArc(p: SolarArcPlanet): string {
  return p.name + ": " + p.sign + " " + p.degree;
}

/**
 * Same calculated-aspect block as the main reading.
 */
function fmtTransitAspects(aspects: TransitAspect[] | undefined): string {
  if (!aspects || aspects.length === 0) {
    return "TRANSIT-TO-NATAL ASPECTS: none within orb right now. Answer from progressions, stations, and the profection year instead.";
  }

  const lines = [
    "TRANSIT-TO-NATAL ASPECTS — CALCULATED AND VALIDATED",
    "These aspects are supplied by code. Never compute or invent another aspect.",
    "",
    "EXACT = ≤0.5°.",
    "LIVE = active within the configured aspect-specific live orb.",
    "BACKGROUND = contextual support only; never an independent event or date anchor.",
    "APPLYING = currently tightening. SEPARATING = currently moving away.",
    "",
  ];

  for (const a of aspects) {
    const motion = a.isApplying ? "APPLYING" : "SEPARATING";
    const rx = a.isRetrograde ? " Rx" : "";
    const exact = a.exactDate ? ` — next exact hit: ${a.exactDate}` : "";
    lines.push(
      `[${a.band.toUpperCase()}] Transit ${a.transitPlanet}${rx} ${a.transitSign} ${a.transitDegree} ` +
      `${a.aspectType} natal ${a.natalPlanet} ${a.natalSign} ${a.natalDegree} ` +
      `(House ${a.natalHouse ?? "—"}) — ${a.orbDegrees}° orb, ${motion}${exact}`
    );
  }

  return lines.join(NL);
}

function buildFollowupPrompt(body: FollowupRequestBody): string {
  const {
    question,
    originalReading,
    originalTitle,
    topic,
    tropical,
    sidereal,
    transits,
    transitAspects,
    profection,
    progressions,
    solarArcs,
    upcomingTrigger,
    planetaryStations,
    solarReturn,
    moonPhase,
    conversationHistory,
    // ── NEW: Advanced calculations ──
    houseRulers,
    mutualReceptions,
    essentialDignities,
    synodicCycles,
    midpoints,
    lunarReturn,
    eclipseActivations,
    transitsToAngles,
    dispositorTree,
  } = body;

  const topicLabel =
    topic === "love"
      ? "love and relationships"
      : topic === "career"
      ? "career and professional life"
      : topic === "money"
      ? "money and finances"
      : "life in general";

  const planetList = tropical.planets.map(fmtPlanet).join(NL);

  const MAJOR_BODIES = new Set([
    "Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn",
    "Uranus","Neptune","Pluto","North Node","Ascendant","Midheaven",
  ]);
  const isMajor = (a: Aspect) =>
    MAJOR_BODIES.has(a.planetA) && MAJOR_BODIES.has(a.planetB);

  const aspectList = (tropical.aspects || [])
    .slice()
    .sort((a, b) => {
      if (isMajor(a) !== isMajor(b)) return isMajor(a) ? -1 : 1;
      return a.orbDegrees - b.orbDegrees;
    })
    .slice(0, 12)
    .map((a) => (isMajor(a) ? fmtAspect(a) : fmtAspect(a) + "  [minor body — flavor only]"))
    .join(NL);

  const transitList = (transits || []).map(fmtTransit).join(NL);

  const transitAspectBlock = fmtTransitAspects(transitAspects);

  const progressionsBlock =
    progressions && progressions.length > 0
      ? NL +
        [
          "SECONDARY PROGRESSIONS (current — inner development):",
          ...progressions.map(fmtProgression),
          "ROLE: The transit is the event; the progression is the person it is happening to. Use these to",
          "explain WHY something is landing the way it is.",
          "",
        ].join(NL)
      : "";

  const solarArcsBlock =
    solarArcs && solarArcs.length > 0
      ? NL +
        [
          "SOLAR ARC DIRECTIONS (current — long-arc structural timing):",
          ...solarArcs.map(fmtSolarArc),
          "ROLE: Only meaningful within 1° of a natal planet or angle. Then it marks a multi-year structural",
          "shift underneath the moment. Otherwise ignore entirely.",
          "",
        ].join(NL)
      : "";

  const upcomingTriggerBlock = upcomingTrigger
    ? NL +
      "NEXT EXACT ASPECT (ephemeris-calculated — primary timing anchor):" + NL +
      `${upcomingTrigger.transitPlanet} ${upcomingTrigger.aspect} natal ${upcomingTrigger.natalPlanet} — exact on ${upcomingTrigger.date}` +
      NL
    : "";

  const moonPhaseBlock = moonPhase
    ? NL +
      [
        "MOON PHASE (timing texture — shapes WHEN, never what):",
        `${moonPhase.phaseName}, ${moonPhase.illuminationPercent}% illuminated. Moon in ${moonPhase.moonSign}.`,
        `Next ${moonPhase.nextEventName} in ${moonPhase.daysUntilNextEvent} days.`,
        "ROLE: Waxing supports initiating and building. Waning supports closing, releasing, and cutting.",
        "Use to choose which window to push toward — never as a prediction on its own.",
        "",
      ].join(NL)
    : "";

  const stationsBlock =
    planetaryStations && planetaryStations.length > 0
      ? NL +
        [
          "PLANETARY STATIONS (next 60 days — crystallization points):",
          "ROLE: Stations with natal hits are PRIMARY timing anchors and outrank ordinary transits.",
          ...planetaryStations.map((s) => {
            const hit = s.natalPlanetHit
              ? ` — stations within ${s.orbDegrees}° of natal ${s.natalPlanetHit} (House ${s.natalHouse})`
              : " — no exact natal hit within 3°";
            return `${s.planet} stations ${s.stationType.toUpperCase()} on ${s.stationDate} at ${s.degree} ${s.sign}${hit}`;
          }),
          "",
        ].join(NL)
      : "";

  const solarReturnBlock = solarReturn
    ? NL +
      [
        `SOLAR RETURN (${solarReturn.sunReturnDate} — cast for ${solarReturn.location}):`,
        `SR Ascendant: ${solarReturn.ascendant.sign} ${solarReturn.ascendant.degree}`,
        `SR Midheaven: ${solarReturn.midheaven.sign} ${solarReturn.midheaven.degree}`,
        solarReturn.timeLordInSR
          ? `Time Lord (${profection.timeLord}) falls in SR ${solarReturn.timeLordInSR}.`
          : "",
        "SR Planets: " + solarReturn.planets.map((p) => `${p.name} ${p.sign} H${p.house}`).join(", "),
        "ROLE: Solar Return is an annual confirmation layer.",
        "Use it to strengthen or contextualize an independently established predictive signal.",
        "Do not require Solar Return confirmation for every external event, and do not create a date from the Solar Return alone.",
        "",
      ]
        .filter(Boolean)
        .join(NL)
    : "";

  const siderealBlock =
    sidereal?.planets?.length
      ? NL +
        [
          "SIDEREAL PLACEMENTS:",
          ...sidereal.planets.map(fmtPlanet),
          "ROLE — CONFIRMATION FILTER: A second opinion, not a second reading. Agrees with tropical → say it",
          "with more force. Disagrees → soften the certainty of that specific claim. NEVER mention sidereal,",
          "tropical, or any system name in the prose. It shapes confidence; it is not content.",
          "",
        ].join(NL)
      : "";

  // ── HOUSE RULERS BLOCK ──
  const houseRulersBlock = (() => {
    if (!houseRulers || houseRulers.length === 0) return "";
    return NL + [
      "═══════════════════════════════════════════",
      "HOUSE RULERS (which planet drives each area of life)",
      "═══════════════════════════════════════════",
      "",
      ...houseRulers.map((h) => `House ${h.house} (${h.sign}) → ruled by ${h.ruler}`),
      "",
      "ROLE: When a planet transits a house, look to that house's ruler for amplification.",
      "Use this to connect multiple transits into a single coherent theme.",
      "",
    ].join(NL);
  })();

  // ── MUTUAL RECEPTION BLOCK ──
  const mutualReceptionBlock = (() => {
    if (!mutualReceptions || mutualReceptions.length === 0) return "";
    return NL + [
      "═══════════════════════════════════════════",
      "MUTUAL RECEPTION — AMPLIFIED CONNECTIONS",
      "═══════════════════════════════════════════",
      "",
      ...mutualReceptions.map(
        (m) => `⚡ ${m.description} → ${m.planetA} and ${m.planetB} are in each other's signs`
      ),
      "",
      "ROLE: Mutual reception may deepen the interpretation when either planet is independently activated.",
      "It does not change the calculated orb, create an event, or create a date.",
      "",
    ].join(NL);
  })();

  // ── ESSENTIAL DIGNITIES BLOCK ──
  const essentialDignitiesBlock = (() => {
    if (!essentialDignities || essentialDignities.length === 0) return "";
    const strong = essentialDignities.filter((d) => d.strength >= 8);
    const weak = essentialDignities.filter((d) => d.strength <= 3);
    if (strong.length === 0 && weak.length === 0) return "";
    return NL + [
      "═══════════════════════════════════════════",
      "ESSENTIAL DIGNITIES (how planets express)",
      "═══════════════════════════════════════════",
      "",
      ...strong.map((d) => `💪 ${d.planet} in ${d.sign} — ${d.dignity} (strength: ${d.strength}/10)`),
      ...weak.map((d) => `⚠️ ${d.planet} in ${d.sign} — ${d.dignity} (strength: ${d.strength}/10)`),
      "",
      "ROLE: Strong planets (10/8) express powerfully and naturally.",
      "Weak planets (3/2) struggle to express their themes — their transits are more difficult.",
      "",
    ].join(NL);
  })();

  // ── SYNODIC CYCLES BLOCK (DISABLED) ──
  const synodicCyclesBlock = "";

  // ── MIDPOINTS BLOCK ──
  const midpointsBlock = (() => {
    if (!midpoints || midpoints.length === 0) return "";
    return NL + [
      "═══════════════════════════════════════════",
      "MIDPOINTS — SENSITIVE POINTS",
      "═══════════════════════════════════════════",
      "",
      ...midpoints.map(
        (m) => `${m.pointA}/${m.pointB} midpoint: ${m.sign} ${m.degree}° (House ${m.house})`
      ),
      "",
      "ROLE: Midpoints are sensitive points that can be activated by transits.",
      "If a transit hits a midpoint, it triggers both planets simultaneously.",
      "",
    ].join(NL);
  })();

  // ── LUNAR RETURN BLOCK (DISABLED) ──
  const lunarReturnBlock = "";

  // ── ECLIPSE ACTIVATION BLOCK ──
  const eclipseActivationsBlock = (() => {
    if (!eclipseActivations || eclipseActivations.length === 0) return "";
    return NL + [
      "═══════════════════════════════════════════",
      "ECLIPSE ACTIVATION — LONG-TERM THEMES",
      "═══════════════════════════════════════════",
      "",
      ...eclipseActivations.map(
        (e) =>
          `${e.eclipseType} Eclipse on ${e.eclipseDate} at ${e.degree}° ${e.sign} — activating ${e.activatedPlanet} (${e.orb}° orb) for ${e.durationMonths} months`
      ),
      "",
      "ROLE: Eclipses activate a point for 6-12 months.",
      "If an eclipse hit a personal planet in your chart, that planet's themes are ONGOING.",
      "",
    ].join(NL);
  })();

  // ── TRANSIT TO ANGLES BLOCK ──
  const transitsToAnglesBlock = (() => {
    if (!transitsToAngles || transitsToAngles.length === 0) return "";
    return NL + [
      "═══════════════════════════════════════════",
      "TRANSIT TO ANGLES — MAJOR LIFE EVENTS",
      "═══════════════════════════════════════════",
      "",
      ...transitsToAngles.map((t) => {
        const exact = t.exactDate ? ` — exact on ${t.exactDate}` : "";
        return `${t.transitPlanet} ${t.aspectType} ${t.angle} (${t.angleSign} ${t.angleDegree}°) — ${t.orb}° orb, ${t.isApplying ? "APPLYING" : "SEPARATING"}${exact}`;
      }),
      "",
      "ROLE: Tight, topic-relevant angle activations are high-priority predictive evidence.",
      "An angle contact may describe a major external development, but do not call every angle transit an event.",
      "Only calculator-supplied exactDate values may create a dated window.",
      "",
    ].join(NL);
  })();

  // ── DISPOSITOR TREE BLOCK ──
  const dispositorTreeBlock = (() => {
    if (!dispositorTree || dispositorTree.length === 0) return "";
    const finalDispositors = dispositorTree.map((d) => d.finalDispositor);
    const uniqueFinal = [...new Set(finalDispositors)];
    return NL + [
      "═══════════════════════════════════════════",
      "DISPOSITOR TREE (Chain of Command)",
      "═══════════════════════════════════════════",
      "",
      ...dispositorTree.map(
        (d) =>
          `${d.planet} in ${d.sign} → ruled by ${d.dispositor} → chain: ${d.chain.join(" → ")}`
      ),
      "",
      `FINAL DISPOSITOR(S): ${uniqueFinal.join(", ")}`,
      "",
      "ROLE: Dispositor chains provide interpretive context only.",
      "They may clarify how a natal theme expresses, but never outrank an exact predictive activation or create timing.",
      "",
    ].join(NL);
  })();

  // ── ANARETIC BLOCK ──
  const anareticBlock = (() => {
    const anaretic = tropical.planets.filter((p) => p.isAnaretic);
    if (anaretic.length === 0) return "";
    const names = anaretic.map((p) => `${p.name} (${p.sign})`).join(", ");
    return NL + [
      "",
      "FINAL-DEGREE PLACEMENTS (anaretic — a culmination signal):",
      names,
      "ROLE: A planet at the last degree of its sign is running out of room — its themes are urgent, coming",
      "to a head. Translate as something ENDING or reaching its limit; never say 'anaretic' or name the degree.",
      "Use only if central to the answer; otherwise ignore.",
      "",
    ].join(NL);
  })();

  // ── EXTENDED POINTS BLOCK ──
  const extendedPointsBlock = (() => {
    if (!body.extendedPoints) return "";
    const { arabicLots, declinations } = body.extendedPoints;
    const oob = (declinations ?? []).filter((d) => d.isOutOfBounds);
    if ((!arabicLots || arabicLots.length === 0) && oob.length === 0) return "";
    const lines = ["", "EXTENDED POINTS (SUPPORTING SIGNAL ONLY — never a headline, never a date anchor):"];
    if (arabicLots && arabicLots.length > 0) {
      lines.push("Lots: " + arabicLots.map((l) => `${l.name} in ${l.sign} (House ${l.house})`).join(", "));
      lines.push(
        "ROLE: Fortune shows where ease flows; Spirit shows where effort lives. Use ONLY to confirm a theme the",
        "calculated aspects already established. Never introduce a new topic from a Lot alone."
      );
    }
    if (oob.length > 0) {
      lines.push(
        "Out-of-bounds: " + oob.map((d) => `${d.planet} (${d.declination}°)`).join(", "),
        "ROLE: An out-of-bounds planet runs hotter, less governed. If central to the answer, note its expression",
        "is extreme. If not central, ignore. Do not name it in the prose; let it sharpen the consequence."
      );
    }
    lines.push("");
    return NL + lines.join(NL);
  })();

  const voiceCalibrationBlock = buildVoiceCalibrationBlock(
    tropical.planets.map((p) => ({ name: p.name, sign: p.sign }))
  );

  const conversationBlock = conversationHistory
    ? `PREVIOUS CONVERSATION:\n${conversationHistory}\n`
    : "";

  return [
    "You are answering a follow-up from a real person who is paying for clarity about something that matters",
    "to them. They may know nothing about astrology. Write so they understand every sentence.",
    "",
    "CRITICAL REAL-ESTATE RULE: Mobile screen. Short, heavy sentences. No fluff. No recycled wording.",
    "Answer the latest question only — but answer it from the chart.",
    "",
    "═══════════════════════════════════════════",
    "THE LANGUAGE RULE — THIS GOVERNS EVERYTHING",
    "═══════════════════════════════════════════",
    "The prose is for a human being. This is a conversation, not a technical readout.",
    "",
    "DO NOT WRITE: degrees, minutes, orb numbers, or the words 'orb', 'anaretic', 'applying', 'separating',",
    "'ingress', 'cusp'. Never name sidereal, tropical, solar arc, or any system.",
    "",
    "DO WRITE: the planet, the aspect, and the house TRANSLATED into what it governs.",
    "  Not: 'Mercury at 24°35' Cancer trine natal North Node at 23°47' Scorpio, 1° orb.'",
    "  But: 'Mercury is exactly trine your North Node right now, in the part of your chart that rules courts.'",
    "Houses by MEANING, not number. Plain consequence. What they will actually feel, face, or decide.",
    "",
    "This loses NO precision. Every claim still rests on an exact calculated aspect. Precision lives in the",
    "sharpness of the consequence — 'you will feel it Thursday and here is exactly what it looks like' —",
    "never in decimal places.",
    "",
    "═══════════════════════════════════════════",
    "DATE PROVENANCE — HARD RULE",
    "═══════════════════════════════════════════",
    "Any specific calendar date or date range MUST use [[DATE: ...]].",
    "Only use a calendar date when it is explicitly supplied by an exact-date calculation above.",
    "If no calculator-supported date answers the question, answer without a calendar date.",
    "Never estimate a date from an orb, Moon phase, progression, Solar Return, dignity, midpoint, or general theme.",
    "",
    "═══════════════════════════════════════════",
    "QUESTION + CONTEXT",
    "═══════════════════════════════════════════",
    `TOPIC: ${topicLabel}`,
    `ORIGINAL TITLE: ${originalTitle}`,
    "",
    "ORIGINAL READING (context only — NOT your evidence):",
    originalReading,
    "",
    conversationBlock,
    "THEIR LATEST QUESTION:",
    `"${question}"`,
    "",
    "═══════════════════════════════════════════",
    "EVIDENCE — THE MATH IS DONE FOR YOU",
    "═══════════════════════════════════════════",
    voiceCalibrationBlock,
    "",
    transitAspectBlock,
    "",
    upcomingTriggerBlock,
    stationsBlock,
    moonPhaseBlock,
    solarReturnBlock,
    
    // ── NEW: All advanced calculation blocks ──
    houseRulersBlock,
    mutualReceptionBlock,
    essentialDignitiesBlock,
    synodicCyclesBlock,
    midpointsBlock,
    lunarReturnBlock,
    eclipseActivationsBlock,
    transitsToAnglesBlock,
    dispositorTreeBlock,
    
    "NATAL PLACEMENTS:",
    planetList,
    anareticBlock,
    "",
    "NATAL ASPECTS (ranked — major-body first, then by tightness; asteroid/Chiron/Lilith marked flavor):",
    aspectList || "None provided.",
    "ROLE: These never change. They are the pattern the transits are ACTIVATING.",
    "Aspects marked '[minor body — flavor only]' may color a description but may never anchor a claim.",
    extendedPointsBlock,
    siderealBlock,
    "CURRENT TRANSIT POSITIONS:",
    transitList || "None provided.",
    "",
    "ANNUAL PROFECTION:",
    `Age ${profection.age}, House ${profection.activatedHouse} (${profection.activatedSign}), Time Lord: ${profection.timeLord}` +
      (profection.timeLordNatalSign
        ? ` (Natal: ${profection.timeLordNatalSign}${profection.timeLordNatalHouse ? `, House ${profection.timeLordNatalHouse}` : ""})`
        : ""),
    "ROLE: Any transit involving the Time Lord is AMPLIFIED — it carries more weight this year than it",
    "otherwise would. If your answer rests on a Time Lord transit, that is the strongest answer available.",
    progressionsBlock,
    solarArcsBlock,
    "",
    "═══════════════════════════════════════════",
    "FOLLOW-UP RULES",
    "═══════════════════════════════════════════",
    "You are not writing a new full reading. You are answering one question using the chart data above.",
    "The ORIGINAL READING is prior context only. The chart blocks are your evidence.",
    "",
    "If they ask WHY → identify the tightest natal aspect or calculated transit driving it.",
    "If they ask WHEN → use ONLY calculator-supplied exact dates from validated transit aspects, the next exact trigger, relevant natal-hit stations, or exact topic-relevant angle contacts.",
    "Moon phase may describe the quality of an already-supported period but never creates the date.",
    "If they ask WHAT TO DO → one concrete action tied to the nearest valid window.",
    "If they ask about a specific planet, house, or date → stay on that thread and go deeper there only.",
    "",
    "ONLY calculated aspects. Never invent one. Never manufacture a date.",
    "An APPLYING aspect is building — speak of it as coming. A SEPARATING one has peaked — speak of it as passing.",
    "",
    "Be direct when the evidence converges. Do not manufacture certainty when it does not.",
    "",
    "DISTINGUISH:",
    "EVENT — multiple independent predictive techniques support a concrete development.",
    "ACTIVATION — a strong trigger is present, but its external manifestation is not uniquely determined.",
    "BACKGROUND — contextual theme only.",
    "",
    "No degrees, no orbs, no unnecessary jargon, and no generic spiritual filler.",
    "",
    "'You' in every sentence. No passive voice.",
    "3-5 compact paragraphs maximum. No headers.",
    "End with one sentence that either closes the loop or opens the next natural question.",
    "",
    "VOICE: The calibration above governs DELIVERY, never content. If a voice instruction calls for precision",
    "or exactness, deliver it through SHARPNESS OF CONSEQUENCE — never by reciting degrees. The LANGUAGE RULE",
    "overrides any voice instruction that would pull you toward jargon.",
    "",
    "Return ONLY a valid JSON object:",
    '{ "title": "A sharp 4-6 word title specific to their question", "content": "The deeper chart-grounded response as flowing prose, in plain human language." }',
  ].join(NL);
}

// ============================================================
// POST HANDLER
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Parse + validate the body ──
    const body = (await request.json()) as FollowupRequestBody;

    if (
      !body.question ||
      !body.originalReading ||
      !body.originalTitle ||
      !body.topic ||
      !body.tropical ||
      !body.tropical.planets ||
      !body.profection ||
      !body.transits
    ) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // ── VALIDATE ASPECTS ──
    const validatedAspects = validateAndFilterAspects(body.transitAspects);

    const normalizedBody: FollowupRequestBody = {
      ...body,
      transitAspects: validatedAspects,
    };

    // ── BUILD DATE INDEX ──
    const dateIndex = buildValidDateIndex(normalizedBody, validatedAspects);

    // ── Reply-access gating ──
    const NONSUB_FREE_REPLIES = 1;
    const SUB_FREE_REPLIES = 4;

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const metadata = user.publicMetadata;

    const isSubscribed = metadata?.isSubscribed === true;
    const replyCredits = Number(metadata?.replyCredits ?? 0);
    const freeRepliesUsed = Math.max(0, Number(body.freeRepliesUsed ?? 0));

    // ── LAYER 1: crisis check ──
    const risk = assessRisk(body?.question ?? "");
    if (risk.action === "block_crisis" || risk.action === "block_emergency") {
      const safe = getSafeResponse(risk);
      console.warn(
        `[followup] Layer 1 block — level=${risk.level} action=${risk.action} ` +
        `conf=${risk.confidence} signals=${risk.signals.join("|")}`
      );
      return NextResponse.json(
        {
          title: safe.title,
          content: safe.answer + "\n\n" + safe.confirmation,
          isSafeResponse: true,
          riskLevel: risk.level,
          replyMeta: {
            accessTier: null,
            usedFreeReply: false,
            freeRepliesRemaining: Math.max(0, (isSubscribed ? SUB_FREE_REPLIES : NONSUB_FREE_REPLIES) - freeRepliesUsed),
            replyCreditsRemaining: replyCredits,
            isSubscribed,
          },
        },
        { status: 200 }
      );
    }
    const careNote = getCareNote(risk);

    const freeBand = isSubscribed ? SUB_FREE_REPLIES : NONSUB_FREE_REPLIES;

    let accessTier: "free" | "credit" | null;
    if (freeRepliesUsed < freeBand) {
      accessTier = "free";
    } else if (replyCredits > 0) {
      accessTier = "credit";
    } else {
      accessTier = null;
    }

    if (accessTier === null) {
      return NextResponse.json(
        {
          error: "You've used your free replies.",
          code: "NEEDS_REPLY_PACK",
          isSubscribed,
          tailMode: isSubscribed ? "sub_reply_tail_regular" : "reply_pack",
        },
        { status: 402 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API configuration error." }, { status: 500 });
    }

    const prompt = buildFollowupPrompt(normalizedBody);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1400,
        temperature: 0.3,
        system:
          "You are a precision astrologer answering a follow-up question after an initial reading, for a real " +
          "person who may know nothing about astrology. Write so they understand every sentence. " +
          "Answer from the supplied chart data, not from vague memory of the original reading — the original " +
          "reading is context only; the chart data is evidence. " +
          "The transit aspects are calculated and given to you — never compute or invent one. " +
          "CRITICAL: no degrees, no orbs, and no astrological jargon in your prose. This is a conversation, not " +
          "a technical readout. You lose no precision — precision lives in the sharpness of the consequence, " +
          "not in decimal places. " +
          "Speak directly to the person as 'you'. State outcomes as facts. Keep it tight and mobile-optimized. " +
          "Output ONLY raw valid JSON — no markdown, no code fences, no preamble.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[followup] Claude error:", err);
      return NextResponse.json(
        { error: "Failed to generate response. Please try again." },
        { status: 502 }
      );
    }

    const claudeData = await response.json();
    const rawText = claudeData.content?.[0]?.text;

    if (!rawText) {
      return NextResponse.json(
        { error: "No response from reading engine." },
        { status: 502 }
      );
    }

    let parsed: { title: string; content: string };
    try {
      let cleaned = rawText.trim();
      if (cleaned.startsWith("```")) cleaned = cleaned.slice(cleaned.indexOf("\n") + 1);
      if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, cleaned.lastIndexOf("```"));
      cleaned = cleaned.trim();

      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        cleaned = cleaned.slice(start, end + 1);
      }

      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("[followup] Failed to parse response:", String(parseErr));
      console.error("[followup] Raw response start:", rawText.slice(0, 300));
      console.error("[followup] Raw response end:", rawText.slice(-200));
      return NextResponse.json(
        { error: "Failed to parse response. Please try again." },
        { status: 422 }
      );
    }

    // ── VALIDATE DATES ──
    const unsupported = findUnsupportedMarkers(parsed.content ?? "", dateIndex);

    if (unsupported.length > 0) {
      console.error(`[followup] Unsupported dates: ${unsupported.join(" | ")}`);
      return NextResponse.json(
        {
          error: "Could not verify the timing in this reply. Please try again.",
        },
        { status: 422 }
      );
    }

    // ── Spend a PAID reply credit ──
    let replyCreditsRemaining = replyCredits;
    if (accessTier === "credit") {
      replyCreditsRemaining = Math.max(0, replyCredits - 1);
      await client.users.updateUserMetadata(userId, {
        publicMetadata: {
          ...metadata,
          replyCredits: replyCreditsRemaining,
        },
      });
      console.log(
        `[followup] spent 1 reply credit for ${userId}. Remaining: ${replyCreditsRemaining}`
      );
    }

    const usedFreeReply = accessTier === "free";
    const freeRepliesRemaining = Math.max(
      0,
      freeBand - (freeRepliesUsed + (usedFreeReply ? 1 : 0))
    );

    return NextResponse.json(
      {
        title: parsed.title,
        content: parsed.content,
        careNote,
        replyMeta: {
          accessTier,
          usedFreeReply,
          freeRepliesRemaining,
          replyCreditsRemaining,
          isSubscribed,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[followup] Unexpected error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}