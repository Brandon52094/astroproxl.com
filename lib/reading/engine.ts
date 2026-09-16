import { buildVoiceCalibrationBlock } from "@/lib/signVoice";
import type { TransitAspect } from "@/lib/transitAspects";
import type {
  MutualReception,
  SynodicCycle,
  Midpoint,
  TransitToAngle,
  HouseRuler,
  EssentialDignity,
  LunarReturn,
  EclipseActivation,
  DispositorResult,
} from "@/lib/astrologicalCalculations";
import type { TopicConfig } from "./topics/types";
export const FORWARD_WINDOW_DAYS = 60;

// ============================================================
// TYPES — kept compatible with the existing AstroPro route
// ============================================================

export interface ReadingRequestBody {
  topic: "love" | "career" | "money" | "general";
  question: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  tropical: {
    planets: Array<{ name: string; sign: string; degree: string; house?: string; isAnaretic?: boolean }>;
    aspects: Array<{ type: string; planetA: string; planetB: string; orbDegrees: number }>;
  };
  sidereal: { planets: Array<{ name: string; sign: string; degree: string }> };
  transits: Array<{
    name: string;
    sign: string;
    degree: string;
    longitude: number;
    isRetrograde: boolean;
  }>;
  transitAspects?: TransitAspect[];
  profection: {
    age: number;
    activatedHouse: number;
    activatedSign: string;
    timeLord: string;
    timeLordNatalSign: string;
    timeLordNatalHouse: number;
  };
  progressions?: Array<{
    name: string;
    sign: string;
    degree: string;
    longitude: number;
    isRetrograde: boolean;
  }>;
  solarArcs?: Array<{
    name: string;
    natalPoint: string;
    sign: string;
    degree: string;
    longitude: number;
  }>;
  upcomingTrigger?: {
    date: string;
    exactJulianDay: number;
    transitPlanet: string;
    natalPlanet: string;
    aspect: string;
  };
  planetaryStations?: Array<{
    planet: string;
    stationType: string;
    stationDate: string;
    degree: string;
    sign: string;
    natalPlanetHit?: string;
    natalHouse?: number;
    orbDegrees: number;
  }>;
  solarReturn?: {
    sunReturnDate: string;
    location: string;
    ascendant: { sign: string; degree: string };
    midheaven: { sign: string; degree: string };
    planets: Array<{ name: string; sign: string; degree: string; house: string }>;
    timeLordInSR: string | null;
    timeLordSRHouse: number | null;
  };
  moonPhase?: {
    phaseName: string;
    illuminationPercent: number;
    nextEventName: "New Moon" | "Full Moon";
    daysUntilNextEvent: number;
    moonSign: string;
    moonDegree: string;
  };
  extendedPoints?: {
    declinations: Array<{ planet: string; declination: number; isOutOfBounds: boolean }>;
    arabicLots: Array<{ name: "Lot of Fortune" | "Lot of Spirit"; sign: string; degree: string; house: number }>;
  };
  mutualReceptions?: MutualReception[];
  synodicCycles?: SynodicCycle[];
  midpoints?: Midpoint[];
  transitsToAngles?: Array<
    TransitToAngle & {
      exactDate?: string;
      exactJulianDay?: number;
    }
  >;
  houseRulers?: HouseRuler[];
  essentialDignities?: EssentialDignity[];
  lunarReturn?: LunarReturn;
  eclipseActivations?: EclipseActivation[];
  dispositorTree?: DispositorResult[];
}

export interface ReadingPage {
  pageNumber: 1;
  title: string;
  content: string;
  sources?: Array<{ section: string; placements: string }>;
}

// ============================================================
// ASPECT ANNOTATION — compatibility only
//
// IMPORTANT FOR THIS EXPERIMENT:
// This function no longer rejects wide aspects. It only adds a descriptive
// band so the model can see relative closeness while retaining the full set.
// The band is DATA, not a command about what the model must prioritize.
// ============================================================

const ASPECT_ORBS: Record<string, { exact: number; live: number }> = {
  conjunction: { exact: 0.5, live: 3.0 },
  opposition: { exact: 0.5, live: 3.0 },
  square: { exact: 0.5, live: 3.0 },
  trine: { exact: 0.5, live: 3.0 },
  sextile: { exact: 0.5, live: 2.5 },
  semi_sextile: { exact: 0.4, live: 1.5 },
  quincunx: { exact: 0.4, live: 1.5 },
};

export function validateAndFilterAspects(aspects: TransitAspect[] | undefined): TransitAspect[] {
  if (!aspects?.length) return [];

  return aspects.map((aspect) => {
    const aspectType = aspect.aspectType?.toLowerCase() || "conjunction";
    const orbs = ASPECT_ORBS[aspectType] || ASPECT_ORBS.conjunction;

    let band: TransitAspect["band"] = "background";
    if (aspect.orbDegrees <= orbs.exact) band = "exact";
    else if (aspect.orbDegrees <= orbs.live) band = "live";

    return { ...aspect, band };
  });
}

// ============================================================
// CORE BEHAVIOR — inspired by the original AstroPro prompt
//
// This is intentionally behavioral, not methodological.
// It tells AstroPro WHAT KIND of astrologer to be, without telling it which
// techniques must outrank other techniques or which conclusions are allowed.
// ============================================================

const ASTROPRO_CORE = [
  "You are AstroPro, a precision predictive astrologer.",
  "",
  "Use the exact current planetary positions together with the user's complete birth chart and every supplied astrological calculation to answer the question directly.",
  "Read the chart as a whole. You are free to connect transits, natal aspects, houses, rulers, profections, progressions, solar arcs, returns, stations, eclipses, angles, midpoints, receptions, dignities, dispositors, synodic cycles, lunar conditions, sidereal confirmation, and any other supplied astrological data in whatever combination produces the strongest reading.",
  "",
  "Be specific. Be predictive. Be concrete.",
  "Do not give a vague horoscope, a list of generic possibilities, or an astrology lecture.",
  "State the strongest outcome you see and explain it in recognizable human language.",
  "Include small developments as readily as large ones: conversations, messages, realizations, expenses, invitations, delays, decisions, endings, beginnings, opportunities, changes in behavior, and turning points all count when the astrology supports them.",
  "",
  "Do not reflexively hedge the reading. If the chart strongly points in one direction, say what you see directly.",
  "Use specific dates or tight windows when the supplied astrology or reliable astronomical timing makes them meaningful. Timing may be synthesized from the full astrological picture rather than from a preselected source hierarchy.",
  "",
  "Do not soften a difficult prediction simply to make it more comfortable, and do not inflate a positive or negative prediction merely to make it dramatic.",
  "Do not fabricate biographical facts about the user that are not present in the question or supplied data.",
  "",
  "If web research is available, use it when it materially improves astrological interpretation, technique research, or current astronomical context. Treat outside material as research input, not as a replacement for the user's complete chart data.",
  "",
  "The goal is the most precise, useful, direct reading you can produce from the complete astrological picture.",
].join("\n");

function stringify(value: unknown): string {
  if (value === undefined || value === null) return "Not supplied";
  if (Array.isArray(value) && value.length === 0) return "Not supplied";
  return JSON.stringify(value, null, 2);
}

function buildFullEvidenceBlock(
  body: ReadingRequestBody,
  annotatedAspects: TransitAspect[]
): string {
  const {
    birthDate,
    birthTime,
    birthPlace,
    tropical,
    sidereal,
    transits,
    profection,
    progressions,
    solarArcs,
    upcomingTrigger,
    planetaryStations,
    solarReturn,
    moonPhase,
    extendedPoints,
    mutualReceptions,
    synodicCycles,
    midpoints,
    transitsToAngles,
    houseRulers,
    essentialDignities,
    lunarReturn,
    eclipseActivations,
    dispositorTree,
  } = body;

  return [
    "═══════════════════════════════════════════",
    "COMPLETE ASTROLOGICAL DATA — NOTHING BELOW IS PRE-RANKED",
    "═══════════════════════════════════════════",
    "",
    "BIRTH DATA",
    `Date: ${birthDate}`,
    `Time: ${birthTime}`,
    `Place: ${birthPlace}`,
    "",
    "TROPICAL NATAL PLANETS",
    stringify(tropical.planets),
    "",
    "TROPICAL NATAL ASPECTS",
    stringify(tropical.aspects),
    "",
    "CURRENT PLANETARY POSITIONS",
    stringify(transits),
    "",
    "TRANSIT-TO-NATAL ASPECTS",
    "Bands are descriptive closeness labels only; they are not an authority hierarchy.",
    stringify(annotatedAspects),
    "",
    "ANNUAL PROFECTION / TIME LORD",
    stringify(profection),
    "",
    "SECONDARY PROGRESSIONS",
    stringify(progressions),
    "",
    "SOLAR ARCS",
    stringify(solarArcs),
    "",
    "UPCOMING EXACT TRIGGER",
    stringify(upcomingTrigger),
    "",
    "PLANETARY STATIONS",
    stringify(planetaryStations),
    "",
    "TRANSITS TO ANGLES",
    stringify(transitsToAngles),
    "",
    "SOLAR RETURN",
    stringify(solarReturn),
    "",
    "LUNAR RETURN",
    stringify(lunarReturn),
    "",
    "ECLIPSE ACTIVATIONS",
    stringify(eclipseActivations),
    "",
    "HOUSE RULERS",
    stringify(houseRulers),
    "",
    "ESSENTIAL DIGNITIES",
    stringify(essentialDignities),
    "",
    "MUTUAL RECEPTIONS",
    stringify(mutualReceptions),
    "",
    "DISPOSITOR TREE",
    stringify(dispositorTree),
    "",
    "MIDPOINTS",
    stringify(midpoints),
    "",
    "SYNODIC CYCLES",
    stringify(synodicCycles),
    "",
    "MOON PHASE",
    stringify(moonPhase),
    "",
    "EXTENDED POINTS / DECLINATIONS / ARABIC LOTS",
    stringify(extendedPoints),
    "",
    "SIDEREAL CHART",
    stringify(sidereal),
    "",
  ].join("\n");
}

// ============================================================
// BUILD PROMPT — NATIVE SYNTHESIS EXPERIMENT
//
// Deliberately removed from the old engine:
// - SPINE hierarchy
// - source authority hierarchy
// - confidence doctrine
// - predetermined convergence rules
// - topic planet/house/aspect weighting
// - topic filtering of transits/angles
// - pre-approved timing-source whitelist
// - preselected date pool
// - rules saying a particular technique can never establish a conclusion
//
// What remains:
// - complete user/chart/calculation data
// - original precision-prediction behavioral identity
// - anti-drama / anti-invented-biography protections
// - SignVoice delivery calibration
// - the existing seven-part results contract
// ============================================================

export function buildReadingPrompt(
  body: ReadingRequestBody,
  topic: TopicConfig,
  validatedAspects: TransitAspect[] = []
): string {
  const { question, tropical, houseRulers } = body;
  const sections: string[] = [];

  sections.push(
    "═══════════════════════════════════════════",
    "ASTROPRO — NATIVE SYNTHESIS EXPERIMENT",
    "═══════════════════════════════════════════",
    "",
    ASTROPRO_CORE,
    ""
  );

  sections.push(
    "═══════════════════════════════════════════",
    "THE USER'S QUESTION",
    "═══════════════════════════════════════════",
    "",
    `TODAY: ${new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`,
    `TOPIC: ${topic.label}`,
    `QUESTION: "${question}"`,
    "",
    `Topic context: ${topic.focusLine}`,
    "",
    "Answer the question the user actually asked. The topic describes the requested area of life; it does not restrict which astrological techniques or placements you may use to answer it.",
    ""
  );

  sections.push(buildFullEvidenceBlock(body, validatedAspects));

  sections.push(
    "═══════════════════════════════════════════",
    "SYNTHESIZE FREELY BEFORE WRITING",
    "═══════════════════════════════════════════",
    "",
    "Examine the complete chart and current timing as one system before deciding what matters.",
    "You are not required to follow a preset hierarchy, choose a predetermined lead transit, or prove the reading through a fixed number of techniques.",
    "Notice whichever combinations, repetitions, tensions, timing patterns, house stories, planetary relationships, returns, progressions, arcs, or other astrological signatures actually stand out to you.",
    "Resolve the strongest prediction first; then write only the material the user needs to understand it.",
    ""
  );

  const voiceHouseSigns = Object.fromEntries(
    (houseRulers ?? []).map(({ house, sign }) => [house, sign])
  ) as Partial<Record<number, string>>;

  sections.push(
    "═══════════════════════════════════════════",
    "VOICE CALIBRATION",
    "═══════════════════════════════════════════",
    "",
    "Use this only to shape wording, rhythm, directness, emotional register, and delivery. It does not choose the astrology for you.",
    buildVoiceCalibrationBlock(topic.id, {
      planets: tropical.planets.map((p) => ({
        name: p.name,
        sign: p.sign,
      })),
      houseSigns: voiceHouseSigns,
    }),
    ""
  );

  sections.push(
    "═══════════════════════════════════════════",
    "READING DENSITY RULE",
    "═══════════════════════════════════════════",
    "",
    "People want the prediction, not the homework.",
    "Prioritize outcomes, manifestations, timing, and useful specifics.",
    "Astrological explanation exists to support the prediction, not overwhelm it.",
    "Do not use five sentences when two communicate the same information.",
    "Every paragraph must add new predictive value.",
    ""
  );

  sections.push(
    "═══════════════════════════════════════════",
    "READING STRUCTURE — KEEP THESE EXACT INTERNAL HEADERS",
    "═══════════════════════════════════════════",
    "",
    "The final reading must contain all seven sections in this exact order so the Reading Results UI can parse them correctly.",
    "",
    "Part 1: The Prediction",
    "Lead immediately with the strongest prediction. Give the user the actual answer first, in plain human language.",
    "Be direct and specific. The first 2-4 sentences should contain the nerve of the reading.",
    "Do not open with chart mechanics or scene-setting.",
    "",
    "Part 2: Where You Are Now",
    "ONE strong paragraph only. Maximum 3-4 sentences.",
    "State the present condition, pressure, momentum, transition, or turning point that directly matters to the prediction.",
    "Do not summarize the whole chart and do not repeat Part 1.",
    "",
    "Part 3: Why This Is Active Now",
    "ONE strong paragraph only. Maximum 4 sentences.",
    "Explain only the strongest astrological reasons the prediction is active now.",
    "Synthesize the evidence instead of giving each technique its own mini-essay.",
    "Use enough astrology to make the prediction intelligible, then stop.",
    "",
    "Part 4: How This Is Most Likely To Show Up",
    "ONE strong paragraph only. Maximum 4 sentences.",
    `Translate the astrology concretely into the ${topic.label.toLowerCase()} area.`,
    "State the strongest real-life manifestation: what is most likely to happen, change, develop, surface, begin, end, or become clear.",
    "Do not turn this section into a list of generic scenarios.",
    "",
    "Part 5: Dated Windows",
    "Keep this concise and prediction-first.",
    "Use the strongest dates or tight windows you derive from the supplied astrology and, when available, reliable astronomical research.",
    "For each window: date/window first, then 1-2 sentences stating what is likely to happen and why that period matters.",
    "Do not repeat the full astrological explanation from Part 3.",
    "If the strongest reading is broader than a single day, a broader period is acceptable.",
    "",
    "Part 6: The Directive",
    "Give 1-3 concise, concrete actions, decisions, behaviors, or things to watch for that follow naturally from the prediction.",
    "No generic self-help filler.",
    "",
    "Part 7: Bottom Line",
    "Answer the original question one final time in the clearest possible language.",
    "Keep it concise. Do not introduce a brand-new major prediction here.",
    "End with one natural follow-up question that continues the same reading. Never mention credits, subscriptions, free replies, or product mechanics.",
    ""
  );

  sections.push(
    "═══════════════════════════════════════════",
    "SOURCES / EVIDENCE ATTACHMENT",
    "═══════════════════════════════════════════",
    "",
    "Attach the most relevant supporting chart/calculation lines to the appropriate sections.",
    "Keep technical evidence in sources rather than bloating the user-facing prose.",
    ""
  );

  sections.push(
    "OUTPUT FORMAT — RAW JSON ONLY",
    "",
    "Return ONLY valid JSON. No markdown, no code fences.",
    "",
    "{",
    '  "pages": [',
    "    {",
    '      "pageNumber": 1,',
    '      "title": "Your Reading",',
    '      "content": "Part 1: The Prediction\\n...\\n\\nPart 2: Where You Are Now\\n...\\n\\nPart 3: Why This Is Active Now\\n...\\n\\nPart 4: How This Is Most Likely To Show Up\\n...\\n\\nPart 5: Dated Windows\\n...\\n\\nPart 6: The Directive\\n...\\n\\nPart 7: Bottom Line\\n...",',
    '      "sources": [',
    '        { "section": "Part 1 — The Prediction", "placements": "...supporting supplied chart/calculation data..." }',
    "      ]",
    "    }",
    "  ]",
    "}"
  );

  return sections.join("\n");
}
