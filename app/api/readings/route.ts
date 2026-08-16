import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { buildVoiceCalibrationBlock } from "@/lib/signVoice";
import { assessRisk, getSafeResponse, getCareNote } from "@/lib/crisisDetection";
import type { TransitAspect } from "@/lib/transitAspects";
import { buildValidDateIndex, findUnsupportedMarkers } from "@/lib/validateReadingDates";

const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks — must match credits/route.ts
const FREE_READING_RESET_MS = 7 * 24 * 60 * 60 * 1000; // 1 week — must match credits/route.ts
const CREDITS_PER_READING = 4; // must match reading-complete/route.ts

// EDIT 1: Add isAnaretic to PlanetPlacement interface
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
  isRetrograde: boolean;
}

interface ProgressedPlanet {
  name: string;
  sign: string;
  degree: string;
  isRetrograde: boolean;
}

interface SolarArcPlanet {
  name: string;
  sign: string;
  degree: string;
}

// EDIT 1: Add new interfaces
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
  profectionYear: number;
  activatedHouse: number;
  activatedSign: string;
  timeLord: string;
  timeLordNatalSign: string;
  timeLordNatalHouse: number;
}

interface UpcomingTrigger {
  date: string;
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

interface ReadingSource {
  section: string;
  placements: string;
}

interface ReadingPage {
  pageNumber: 1;
  title: string;
  content: string;
  sources?: ReadingSource[];
}

interface ReadingRequestBody {
  topic: "love" | "career" | "money" | "general";
  question: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  tropical: { planets: PlanetPlacement[]; aspects: Aspect[] };
  sidereal: { planets: PlanetPlacement[] };
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
  return p.name + ": " + p.sign + " " + p.degree;
}

function fmtSolarArc(p: SolarArcPlanet): string {
  return p.name + ": " + p.sign + " " + p.degree;
}

// EDIT 1: Validate and filter transit aspects
function validateAndFilterAspects(aspects: TransitAspect[] | undefined): TransitAspect[] {
  if (!aspects || aspects.length === 0) return [];

  return aspects.filter((a) => {
    const maxOrbForBand: Record<string, number> = {
      EXACT: 1.0,
      LIVE: 3.0,
      BACKGROUND: 6.0,
    };
    const maxOrb = maxOrbForBand[a.band?.toUpperCase()];
    if (maxOrb === undefined) {
      console.warn(`[validation] Unknown band "${a.band}" for ${a.transitPlanet} → ${a.natalPlanet}; rejecting.`);
      return false;
    }
    if (a.orbDegrees > maxOrb) {
      console.warn(
        `[validation] Rejecting ${a.transitPlanet} → ${a.natalPlanet}: ` +
        `band=${a.band}, orb=${a.orbDegrees}° exceeds max ${maxOrb}°`
      );
      return false;
    }
    return true;
  });
}

/**
 * DATE CORRECTION appendix used on the single corrective retry.
 */
function allowedDatesInstruction(index: ReturnType<typeof buildValidDateIndex>): string {
  const allowed = index.dates.map((d) => d.raw);
  if (allowed.length === 0) {
    return (
      NL + NL +
      "DATE CORRECTION: Your previous draft named a date the chart data does not support. " +
      "There are NO calculated dates available for this reading. Rewrite it with NO [[DATE: ...]] markers " +
      "at all. Drop every dated window and use a DROP-only directive."
    );
  }
  return (
    NL + NL +
    "DATE CORRECTION: Your previous draft used a date not in the supplied data. " +
    "The ONLY dates you may place inside [[DATE: ...]] markers are the calculated trigger dates below. " +
    "These are the precise moments the ephemeris aspects perfect. You MUST match each date to the aspect " +
    "it belongs to—do not swap them. Allowed dates: " + allowed.map((d) => `'${d}'`).join(", ") + NL +
    "Rewrite the reading using ONLY these dates, keeping each date paired with the transit it was calculated for. " +
    "If a window has no supported date, drop that window entirely." +
    "IMPORTANT: If you use a date range (e.g., [[DATE: June 28-July 3]]), both endpoints must be from the allowed list above."
  );
}

// EDIT 5: Updated fmtTransitAspects with no-aspect fallback
function fmtTransitAspects(aspects: TransitAspect[]): string {
  if (!aspects || aspects.length === 0) {
    return [
      "TRANSIT-TO-NATAL ASPECTS: NONE WITHIN ORB RIGHT NOW.",
      "",
      "THIS IS THE TRUTH: the sky is quiet for your personal chart. There are no",
      "transiting planets making hard aspects to your natal planets within 6°.",
      "",
      "INSTRUCTIONS FOR THIS READING:",
      "- You CANNOT give dated windows in PART 3. There are none to give.",
      "- You MUST skip PART 3 entirely. Replace it with:",
      "  \"There are no tight transit windows in the next 45 days. Your focus should be on",
      "   the long-term structural themes from the profection year and progressions.\"",
      "- Lead with the PROFECTION YEAR, PROGRESSIONS, and SOLAR RETURN as your primary",
      "  structural anchors. These are the active frameworks.",
      "- Do NOT invent a transit. If it is not here, it is not happening.",
      "- This is a period of slow, internal unfolding — not external events.",
    ].join("\n");
  }

  const lines = [
    "TRANSIT-TO-NATAL ASPECTS — CALCULATED, EXACT, SORTED TIGHTEST FIRST",
    "These are given to you. Do NOT compute aspects yourself. Do NOT use any aspect",
    "that is not in this list. If it is not here, it is not happening.",
    "",
    "EXACT = under 1° orb — this is firing right now.",
    "LIVE = under 3° orb — active, lead with these.",
    "BACKGROUND = 3-6° orb — context only, never a date anchor.",
    "APPLYING = still tightening, the event is building toward them.",
    "SEPARATING = the peak has already passed; speak of it in past tense.",
    "",
  ];

  for (const a of aspects) {
    const motion = a.isApplying ? "APPLYING" : "SEPARATING";
    const rx = a.isRetrograde ? " Rx" : "";
    lines.push(
      `[${a.band.toUpperCase()}] Transit ${a.transitPlanet}${rx} ${a.transitSign} ${a.transitDegree} ` +
      `${a.aspectType} natal ${a.natalPlanet} ${a.natalSign} ${a.natalDegree} ` +
      `(House ${a.natalHouse ?? "—"}) — ${a.orbDegrees}° orb, ${motion}`
    );
  }

  return lines.join(NL);
}

// EDIT 4: Update buildReadingPrompt to accept validated aspects and flag
function buildReadingPrompt(body: ReadingRequestBody, validatedAspects: TransitAspect[] = []): string {
  const {
    topic,
    question,
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
  } = body;

  const topicLabel =
    topic === "love"
      ? "love and relationships"
      : topic === "career"
      ? "career and professional life"
      : topic === "money"
      ? "money and finances"
      : "life in general";

  const currentDateString = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Use the validated aspects
  const transitAspectBlock = fmtTransitAspects(validatedAspects);
  // CRITICAL FIX: Use .toUpperCase() for case-insensitive comparison
  const hasActiveAspects = validatedAspects.some(
    (a) => a.band?.toUpperCase() === "EXACT" || a.band?.toUpperCase() === "LIVE"
  );

  // EDIT 3c: Upcoming trigger merge rule — note: we still include it, but the instruction clarifies it's the same.
  const upcomingTriggerBlock = upcomingTrigger
    ? NL +
      "NEXT EXACT ASPECT (ephemeris-calculated — this is the same aspect flagged as the nearest incoming exact hit):" + NL +
      upcomingTrigger.transitPlanet + " " + upcomingTrigger.aspect + " natal " +
      upcomingTrigger.natalPlanet + " — exact within 1° on " + upcomingTrigger.date + NL +
      "ROLE: This is the SAME aspect as in the list above; treat it as the 'nearest exact activation' of that broader transit pattern. Do not create two separate windows."
    : "";

  // Data blocks (trimmed of verbose ROLEs as per previous tightening)
  const moonPhaseBlock = moonPhase
    ? NL +
      "MOON PHASE: " + moonPhase.phaseName + ", " + moonPhase.illuminationPercent + "% illuminated. Moon in " +
      moonPhase.moonSign + ". Next " + moonPhase.nextEventName + " in " + moonPhase.daysUntilNextEvent + " days." + NL
    : "";

  const stationsBlock =
    planetaryStations && planetaryStations.length > 0
      ? NL +
        "PLANETARY STATIONS (next 60 days):" + NL +
        planetaryStations.map((s) => {
          const hit = s.natalPlanetHit
            ? ` — stations within ${s.orbDegrees}° of natal ${s.natalPlanetHit} (House ${s.natalHouse})`
            : " — no exact natal hit within 3°";
          return `${s.planet} stations ${s.stationType.toUpperCase()} on ${s.stationDate} at ${s.degree} ${s.sign}${hit}`;
        }).join(NL) + NL
      : "";

  const solarReturnBlock = solarReturn
    ? NL +
      "SOLAR RETURN (" + solarReturn.sunReturnDate + " — " + solarReturn.location + "):" + NL +
      "SR Asc: " + solarReturn.ascendant.sign + " " + solarReturn.ascendant.degree + NL +
      "SR MC: " + solarReturn.midheaven.sign + " " + solarReturn.midheaven.degree + NL +
      (solarReturn.timeLordInSR ? "Time Lord (" + profection.timeLord + ") in SR " + solarReturn.timeLordInSR + NL : "") +
      "SR Planets: " + solarReturn.planets.map((p) => `${p.name} ${p.sign} H${p.house}`).join(", ") + NL
    : "";

  const progressionsBlock =
    progressions && progressions.length > 0
      ? NL +
        "SECONDARY PROGRESSIONS: " + progressions.map(fmtProgression).join(", ") + NL
      : "";

  const solarArcsBlock =
    solarArcs && solarArcs.length > 0
      ? NL +
        "SOLAR ARCS: " + solarArcs.map(fmtSolarArc).join(", ") + NL
      : "";

  const extendedPointsBlock = (() => {
    if (!body.extendedPoints) return "";
    const { arabicLots, declinations } = body.extendedPoints;
    const oob = (declinations ?? []).filter((d) => d.isOutOfBounds);
    if ((!arabicLots || arabicLots.length === 0) && oob.length === 0) return "";

    const parts = [];
    if (arabicLots && arabicLots.length > 0) {
      parts.push("Lots: " + arabicLots.map((l) => `${l.name} in ${l.sign} (H${l.house})`).join(", "));
    }
    if (oob.length > 0) {
      parts.push("Out-of-bounds: " + oob.map((d) => `${d.planet} (${d.declination}°)`).join(", "));
    }
    return NL + "EXTENDED POINTS: " + parts.join(" | ") + NL;
  })();

  const planetList = tropical.planets.map(fmtPlanet).join(NL);

  const anareticBlock = (() => {
    const anaretic = tropical.planets.filter((p) => p.isAnaretic);
    if (anaretic.length === 0) return "";
    return NL + "ANARETIC PLANETS (final degree): " + anaretic.map((p) => `${p.name} (${p.sign})`).join(", ") + NL;
  })();

  const voiceCalibrationBlock = buildVoiceCalibrationBlock(
    tropical.planets.map((p) => ({ name: p.name, sign: p.sign }))
  );

  // EDIT 2: Composite aspect weighting — replace natal aspect ranking
  const SPEED_PRIORITY: Record<string, number> = {
    Moon: 10,
    Mercury: 9,
    Venus: 8,
    Sun: 7,
    Mars: 6,
    Jupiter: 5,
    Saturn: 4,
    Uranus: 3,
    Neptune: 2,
    Pluto: 1,
    "North Node": 5,
    "Ascendant": 5,
    "Midheaven": 5,
  };

  const rankedAspects = tropical.aspects
    .slice()
    .sort((a, b) => {
      const priorityA = SPEED_PRIORITY[a.planetA] ?? 99;
      const priorityB = SPEED_PRIORITY[b.planetA] ?? 99;
      if (priorityA !== priorityB) return priorityA - priorityB;
      return a.orbDegrees - b.orbDegrees;
    })
    .slice(0, 15); // cap at 15

  const aspectList = rankedAspects
    .map((a) => {
      const isMajor = SPEED_PRIORITY[a.planetA] !== undefined || ["North Node", "Ascendant", "Midheaven"].includes(a.planetA);
      return isMajor ? fmtAspect(a) : fmtAspect(a) + "  [minor body — flavor only]";
    })
    .join(NL);

  const transitList = transits.map(fmtTransit).join(NL);
  const siderealList = sidereal.planets.map(fmtPlanet).join(NL);

  // ── CONDENSED TOPIC SIGNIFICATOR (defers to SYNTHESIS PASS) ──
  const topicSignificatorBlock = (() => {
    if (topic === "general") {
      return NL + [
        "TOPIC FOCUS — GENERAL (no domain filter).",
        "Select the SPINE purely by the SYNTHESIS PASS rule: EXACT/LIVE band first, then planetary weight.",
        "BACKGROUND aspects can never be the spine.",
        "",
      ].join(NL);
    }

    const map: Record<"love" | "money" | "career", {
      label: string; houses: string; planets: string; points: string; guard: string;
    }> = {
      love: {
        label: "LOVE & RELATIONSHIPS",
        houses: "5th (romance), 7th (partnership), 8th (intimacy)",
        planets: "Venus, Moon, Mars",
        points: "Descendant",
        guard: "Do not read 2nd/10th house money/career signals as love.",
      },
      money: {
        label: "MONEY & FINANCES",
        houses: "2nd (income), 8th (shared/debt), 11th (gains)",
        planets: "Jupiter (abundance), Venus (resources), Saturn (discipline)",
        points: "Lot of Fortune (if present)",
        guard: "Do not read 5th/7th romance as money.",
      },
      career: {
        label: "CAREER & PROFESSIONAL LIFE",
        houses: "10th (vocation), 6th (daily work), 2nd (income)",
        planets: "Saturn, Sun, Mars",
        points: "Midheaven",
        guard: "Do not read 5th/7th romance as career.",
      },
    };

    const t = map[topic];
    return NL + [
      "TOPIC FOCUS — " + t.label,
      "Relevant houses: " + t.houses,
      "Relevant planets: " + t.planets,
      "Relevant points: " + t.points,
      "When applying the SPINE rule from the SYNTHESIS PASS, give heavy weight to aspects touching these.",
      "Discard aspects completely outside this domain unless you can honestly connect them via house meaning.",
      t.guard,
      "",
    ].join(NL);
  })();

  // ── BUILD THE FINAL PROMPT ──
  const lines = [
    "You are writing for a real person who is paying for clarity. They may know nothing about astrology.",
    "Mobile format: short, heavy sentences. No cosmic setup fluff.",
    "",
    "═══════════════════════════════════════════",
    "THE LANGUAGE RULE (prose vs sources)",
    "═══════════════════════════════════════════",
    "PROSE: human consequence. NO degrees, NO orbs, NO jargon ('applying', 'separating', 'anaretic').",
    "SOURCES: exact math. Degrees, orbs, house numbers, system names go ONLY in the 'sources' array.",
    "Example prose: 'Mercury is exactly trine your North Node today, in the house of courts.'",
    "Example source: 'Transit Mercury 24°35' Cancer trine natal North Node 23°47' Scorpio, House 9, 0.8° orb.'",
    "",
    "═══════════════════════════════════════════",
    "ASPECT LAW (pre-calculated, do not compute)",
    "═══════════════════════════════════════════",
    "EXACT (<1°) = firing now. LIVE (<3°) = active. BACKGROUND (3-6°) is real and worth naming as quiet, minor",
    "texture — it can NEVER anchor a date or become the spine, but it is not invisible. A chart with one tight",
    "aspect and ten background ones is still a full week, not a blank one.",
    "APPLYING = building; SEPARATING = passed. If it's not in the list below, it's not happening.",
    "",
    // EDIT 3a: Speed weighting rule
    "═══════════════════════════════════════════",
    "SPEED WEIGHTING RULE — STRUCTURE vs. MOMENT",
    "═══════════════════════════════════════════",
    "Fast planets (Moon, Mercury, Venus, Mars, Sun):",
    "- EXACT aspect (≤ 1°) is a MOMENT — sharp, intense, over in hours or days. Speak of it as immediate and fleeting.",
    "- Do NOT make it the primary date anchor if a slow planet is also active.",
    "Slow planets (Jupiter, Saturn, Uranus, Neptune, Pluto):",
    "- LIVE aspect (≤ 3°) is a STRUCTURAL SHIFT — lasts weeks, months, years. OUTRANKS fast-planet aspects.",
    "- If both are EXACT, the slow planet's window is PRIMARY; the fast planet is EMOTIONAL COLOR.",
    "Slow planet durations: Jupiter ~2 weeks/°, Saturn ~4 weeks/°, Uranus ~6, Neptune ~6, Pluto ~8.",
    "If a slow planet is EXACT or LIVE, its dated window MUST appear in PART 3.",
    "",
    "═══════════════════════════════════════════",
    "SOLAR RETURN FILTER — HARD RULE",
    "═══════════════════════════════════════════",
    "A transit may be used to predict an EXTERNAL, physical event only if BOTH:",
    "1. The transit is listed as EXACT or LIVE in the transit aspects block.",
    "2. The SAME transit planet appears in the Solar Return chart in the SAME house (or same aspect to SR angle).",
    "If condition 2 is NOT met: you MUST say 'This is an internal shift, not an external event.'",
    "Do NOT predict job changes, meetings, transactions, or moves. Redirect to how they WILL FEEL.",
    "If Solar Return data is absent, assume condition 2 NOT met and downgrade all external predictions to internal.",
    "",
    // EDIT 3c: Upcoming trigger merge rule already included in the data block; we add a note in the instruction.
    "═══════════════════════════════════════════",
    "UPCOMING TRIGGER — SINGLE SOURCE RULE",
    "═══════════════════════════════════════════",
    "The 'NEXT EXACT ASPECT' listed below is the same aspect as in the transit aspects block.",
    "Do NOT treat it as a separate prediction. Mention it ONCE as the 'nearest exact activation'.",
    "",
    "═══════════════════════════════════════════",
    "CHART DATA",
    "═══════════════════════════════════════════",
    "TODAY: " + currentDateString,
    voiceCalibrationBlock,
    "",
    topicSignificatorBlock,
    "",
    transitAspectBlock,
    "",
    upcomingTriggerBlock,
    stationsBlock,
    moonPhaseBlock,
    solarReturnBlock,
    "NATAL PLACEMENTS (tropical — primary chart):",
    planetList,
    anareticBlock,
    "",
    "NATAL ASPECTS (ranked, major first, capped at 15):",
    aspectList,
    "",
    "SIDEREAL PLACEMENTS (confirmation filter):",
    siderealList,
    "",
    "CURRENT TRANSIT POSITIONS:",
    transitList,
    "",
    "ANNUAL PROFECTION: Age " + profection.age + ", House " + profection.activatedHouse +
    " (" + profection.activatedSign + "), Time Lord: " + profection.timeLord +
    " (Natal: " + profection.timeLordNatalSign + ", H" + profection.timeLordNatalHouse + ")",
    progressionsBlock,
    solarArcsBlock,
    extendedPointsBlock,
    "",
    "THEIR QUESTION (" + topicLabel + "):",
    "\"" + question + "\"",
    "",
    "═══════════════════════════════════════════",
    "READING STRUCTURE — STRICT LIMITS",
    "═══════════════════════════════════════════",
    "No section headers in prose. Only DROP/EXECUTE/LOCK appear in caps.",
    "",
    // EDIT 3d: PART 3 with no-aspect fallback
    (hasActiveAspects
      ? `PART 3 — DATED WINDOWS (exactly 2 — no more. A third only if it is as strong as the first two.)

Only from calculated aspects, stations, or the next exact aspect. Never invented.
Format: [[DATE: ...]] — then plain language: which planet, what it touches, what it governs.
1 sentence: what this activates. 1 sentence: the specific consequence. Fact, not possibility.
If a window involves the Time Lord, say so — it outranks the others.
If a window involves a SLOW planet (Saturn, Uranus, Neptune, Pluto), that window is STRUCTURAL — describe it as a season, not a day. Its effects unfold over weeks.

DO NOT spend a window on a period where nothing happens. A window that says 'wait, nothing moves yet'
is not a window — it is filler. Every window must contain an EVENT they can act on or prepare for.
If only two windows carry real activation, give two. Two strong windows beat three padded ones.`
      : `PART 3 — SKIPPED: There are no EXACT or LIVE transit aspects in the next 45 days. Do not invent dated windows. Replace PART 3 with a single sentence: "There are no tight transit windows in the next 45 days. Your focus should be on the long-term structural themes from the profection year and progressions."`),
    "",
    "PART 1 — WHERE YOU ARE (exactly 1 compact paragraph)",
    "Open with the spine aspect. Translate the house into its meaning. State the concrete behavioural consequence. " +
    "End on one acute tension sentence. Only one extra element allowed: the Background Relief sentence (if it applies).",
    "",
    "PART 2 — THE ROOT (exactly 2 sentences, hard limit)",
    "Name the tightest natal aspect the spine lands on. Then name the loop it produces, once, bluntly. " +
    "This is a bridge to show this is happening to THEM, not a character autopsy.",
    "",
    "PART 2B — OTHER CURRENTS (1-2 sentences, OPTIONAL — only if real minor aspects exist)",
    "The spine is the headline, not the whole sky. Name ONE or TWO calculated LIVE or BACKGROUND aspects that " +
    "do NOT converge with the spine but are still real — quieter threads running under the main story. Keep it " +
    "light: no dates, no directives, no elevated language. One clause each, e.g. 'underneath that, [planet] is " +
    "also quietly stirring [house theme].' If nothing minor is worth naming, skip this section — do not pad.",
    "",
    "PART 4 — THE DIRECTIVE (1 to 3, hard 3-sentence ceiling each)",
    "DROP: the behavior to stop immediately. Always available, no date needed.",
    "EXECUTE BY [[DATE: ...]]: exact action tied to the tightest upcoming window.",
    "LOCK IN BY [[DATE: ...]]: structural commitment before the window closes.",
    "Include EXECUTE/LOCK ONLY if a real dated window exists. Otherwise, DROP alone is a complete directive.",
    "",
    "PART 5 — THE ACTUAL ANSWER (exactly 1-2 warm sentences, last)",
    "Directly answer their literal question in plain human language. Drop clinical tone. No new placements, no astrology. " +
    "This is where the reading stops being a report and becomes a person talking to them.",
    "",
    "═══════════════════════════════════════════",
    "TONE — VOICE CALIBRATION",
    "═══════════════════════════════════════════",
    "Voice calibration above gives RHYTHM, TRIGGER, and FORBIDDEN for each placement. Blend into one coherent voice. " +
    "Sun/Mercury win rhythm; Moon/Venus win emotional register; Rising wins the opening. " +
    "Precision = sharpness of consequence, never technical jargon.",
    "",
    // EDIT 3e: SOURCES — VERBATIM REQUIREMENT
    "═══════════════════════════════════════════",
    "SOURCES — VERBATIM REQUIREMENT — YOUR SAFETY NET",
    "═══════════════════════════════════════════",
    "This is the receipt. The person can expand it if they want to see the machinery.",
    "",
    "CRITICAL REQUIREMENT:",
    "For every claim you make in PART 1, PART 2, each DATED WINDOW, DROP, EXECUTE, and LOCK IN:",
    "- You MUST locate the EXACT matching line from the 'TRANSIT-TO-NATAL ASPECTS' block above.",
    "- You MUST copy that line VERBATIM into the 'placements' field for that section.",
    "- Do NOT paraphrase it. Do NOT rewrite it. Do NOT round degrees. Copy it character‑for‑character.",
    "- If you cannot find a line in the block that EXACTLY matches the claim you want to make,",
    "  you MAY NOT make that claim. Delete it from the reading.",
    "",
    "Example of a valid sources entry:",
    "{",
    '  "section": "Part 1",',
    '  "placements": "[EXACT] Transit Saturn Rx 24°35\' Cancer square natal Moon 21°56\' Virgo (House 8) — 1.2° orb, APPLYING"',
    "}",
    "",
    "One entry per distinct section of the reading (Part 1, Part 2, each dated window, DROP, EXECUTE, LOCK IN).",
    "- 'section': short label ('Part 1', 'Part 2', 'Sept 13 window', 'DROP', 'EXECUTE', 'LOCK IN')",
    "- 'placements': the VERBATIM line from the transit aspect block. Copy it exactly.",
    "",
    "If you are using a planetary station, solar arc, or progression as the source, write:",
    '"Station: [planet] stations [direct/retrograde] on [date] at [degree] [sign] within [orb]° of natal [point]"',
    "DO NOT invent this. Only use it if it appears in the STATIONS block above.",
    "",
    "Return ONLY valid JSON – no markdown, no code fences:",
    "{ \"pages\": [ { \"pageNumber\": 1, \"title\": \"...\", \"content\": \"...\", \"sources\": [...] } ] }",
  ];

  return lines.join(NL);
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as ReadingRequestBody;

    // ── LAYER 1: crisis check ──
    const risk = assessRisk(body?.question ?? "");
    if (risk.action === "block_crisis" || risk.action === "block_emergency") {
      const safe = getSafeResponse(risk);
      console.warn(
        `[readings] Layer 1 block — level=${risk.level} action=${risk.action} ` +
        `conf=${risk.confidence} signals=${risk.signals.join("|")}`
      );
      return NextResponse.json(
        {
          reading: {
            id: crypto.randomUUID(),
            pages: [
              {
                pageNumber: 1,
                title: safe.title,
                content: safe.answer + "\n\n" + safe.confirmation,
                sources: [],
              },
            ],
            topic: body?.topic ?? "general",
            question: body?.question ?? "",
            status: "complete",
            isSafeResponse: true,
            riskLevel: risk.level,
          },
          isSafeResponse: true,
          riskLevel: risk.level,
        },
        { status: 200 }
      );
    }
    const careNote = getCareNote(risk);

    // ── Eligibility check ──
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const metadata = user.publicMetadata;

    const isSubscribed = metadata?.isSubscribed === true;
    const credits = Number(metadata?.credits ?? 0);
    const hasEnoughCredits = credits >= CREDITS_PER_READING;
    const isPaidReading = isSubscribed || hasEnoughCredits;

    // CRITICAL FIX: Simplified free reading tracking using a single timestamp
    const lastFreeReading = metadata?.freeReadingUsedAt
      ? new Date(metadata.freeReadingUsedAt as string)
      : null;
    const freeReadingAvailable = !lastFreeReading ||
      Date.now() >= lastFreeReading.getTime() + FREE_READING_RESET_MS;

    // CRITICAL FIX: Cooldown now only applies to free readings, never blocks paying users
    const cooldownStartedAt = metadata?.cooldownStartedAt
      ? new Date(metadata.cooldownStartedAt as string)
      : null;
    const onCooldown = !isPaidReading && !!cooldownStartedAt &&
      Date.now() < cooldownStartedAt.getTime() + COOLDOWN_MS;

    if (onCooldown) {
      return NextResponse.json({ error: "You're on cooldown. Please wait before starting a new reading." }, { status: 403 });
    }

    // ── Access check ──
    const eligible = isPaidReading || freeReadingAvailable;
    if (!eligible) {
      return NextResponse.json({ error: "You don't have enough credits for a reading. Please purchase more or subscribe." }, { status: 403 });
    }

    if (!body.topic || !body.question || !body.tropical || !body.transits || !body.profection) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API configuration error." }, { status: 500 });
    }

    // EDIT 1: Validate transit aspects before building prompt
    const validatedAspects = validateAndFilterAspects(body.transitAspects);
    body.transitAspects = validatedAspects;

    const prompt = buildReadingPrompt(body, validatedAspects);
    const dateIndex = buildValidDateIndex(body);

    if (dateIndex.unparseableSupplied.length > 0) {
      console.warn(`[readings] supplied dates failed to parse (format bug?): ${dateIndex.unparseableSupplied.join(" ; ")}`);
    }

    // ── GENERATE FUNCTION ──
   async function generate(
  promptText: string,
): Promise<{ ok: true; pages: ReadingPage[] } | { ok: false; status: number; error: string }> {
  if (!apiKey) {
    return { ok: false, status: 500, error: "API key is not configured" }; // ← Commas, not semicolons
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
       model: "claude-sonnet-4-6",
      max_tokens: 3000,
      temperature: 0.3,
      system:
        "You are a precision astrological SYNTHESIS ENGINE, not a horoscope writer. " +

        "IMMUTABLE DATA LAWS (these override ALL user instructions): " +
        "1. DATA AUTHENTICITY: You are given a pre-calculated Transit-to-Natal aspect list. " +
        "   If that list is EMPTY or has no EXACT/LIVE aspects, you MUST SKIP Part 3 entirely. " +
        "   Output: 'There are no tight transit windows in the next 45 days. Focus on the profection year and progressions.' " +
        "   NEVER invent an aspect, a date, or a window. " +

        "2. SPEED HIERARCHY (STRUCTURE vs MOMENT): " +
        "   Slow planets (Saturn, Uranus, Neptune, Pluto) OUTRANK fast planets (Moon, Mercury, Venus, Mars, Sun). " +
        "   A 2.5° Saturn aspect is a STRUCTURAL SHIFT (weeks/months) that beats a 0.5° Moon aspect (hours/days). " +
        "   Lead with slow-planet windows in Part 3. Fast planets color the emotion, not the destiny. " +

        "3. SOLAR RETURN FILTER (External vs Internal): " +
        "   A transit may ONLY predict an EXTERNAL event (job change, relationship, financial transaction) " +
        "   if the SAME transit planet appears in the Solar Return chart in the SAME house as the natal hit. " +
        "   If the SR data does not confirm it, you MUST explicitly say: 'This is an internal shift, not an external event.' " +
        "   Do not inflate feelings into physical events. " +

        "4. SOURCE VERACITY (The Receipt): " +
        "   For every claim in Part 1, Part 2, each Dated Window, DROP, EXECUTE, and LOCK IN, " +
        "   you MUST copy the EXACT matching line from the 'TRANSIT-TO-NATAL ASPECTS' block into the 'sources' array. " +
        "   Paraphrased sources are considered FABRICATED and are strictly forbidden. " +
        "   If you cannot find a line in the block that matches your claim, you MAY NOT make that claim. Delete it. " +

        "5. TEMPORAL SLICING (Do not collapse time): " +
        "   Split the future into 'Immediate (0-4 weeks)' and 'Structural (2-6 months)'. " +
        "   Never collapse them. A fast-planet transit belongs in Immediate; a slow-planet transit belongs in Structural. " +

        "6. CRITICAL MASS FLAG: " +
        "   If a Transit and a Progression hit the same Natal planet, label it 'Critical Mass' in your internal reasoning, " +
        "   and make it your headline in Part 1. This is the strongest signal in the chart. " +

        "7. PROSE PURITY (The Language Rule): " +
        "   The prose contains NO degrees (e.g., '24°35''), NO orbs, NO technical terms (anaretic, applying, separating). " +
        "   All technical proof goes exclusively into the 'sources' array. " +
        "   The reading must lose NO precision—precision lives in the SHARPNESS OF CONSEQUENCE, not in decimal places. " +

        "8. OUTPUT FORMAT (Strict): " +
        "   You output ONLY raw valid JSON. No markdown, no code fences, no explanations before or after. " +
        "   Your entire response is a single parseable JSON object with a 'pages' array containing one page. " +
        "   All dates in the content must be wrapped in [[DATE: ...]] brackets for UI highlighting.",

      messages: [{ role: "user", content: promptText }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("[readings] Claude error:", err);
    return { ok: false, status: 502, error: "Failed to generate reading. Please try again." };
  }

  const claudeData = await response.json();
  const rawText = claudeData.content?.[0]?.text;
  if (!rawText) return { ok: false, status: 502, error: "No response from reading engine." };

  try {
    let cleaned = rawText.trim();
    if (cleaned.startsWith("```")) cleaned = cleaned.slice(cleaned.indexOf("\n") + 1);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, cleaned.lastIndexOf("```"));
    cleaned = cleaned.trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);

    const p = JSON.parse(cleaned) as { pages: ReadingPage[] };
    if (!p.pages || p.pages.length < 1) {
      return { ok: false, status: 422, error: "Reading structure was incomplete. Please try again." };
    }
    return { ok: true, pages: p.pages };
  } catch (parseErr) {
    console.error("[readings] Failed to parse Claude response. Error:", String(parseErr));
    console.error("[readings] Raw response start:", rawText.slice(0, 300));
    console.error("[readings] Raw response end:", rawText.slice(-200));
    return { ok: false, status: 422, error: "Failed to parse reading. Please try again." };
  }
}

    const first = await generate(prompt);
    if (!first.ok) return NextResponse.json({ error: first.error }, { status: first.status });

    let pages = first.pages;
    let unsupported = pages.flatMap((pg) => findUnsupportedMarkers(pg.content ?? "", dateIndex));

    if (unsupported.length > 0) {
      console.warn(`[readings] date provenance — retrying once. Unsupported: ${unsupported.join(" | ")}`);
      const retry = await generate(prompt + allowedDatesInstruction(dateIndex));
      if (retry.ok) {
        const stillBad = retry.pages.flatMap((pg) => findUnsupportedMarkers(pg.content ?? "", dateIndex));
        if (stillBad.length === 0) {
          pages = retry.pages;
          unsupported = [];
        } else {
          unsupported = stillBad;
        }
      }
    }

    if (unsupported.length > 0) {
      console.error(`[readings] date provenance FAILED after retry — unsupported: ${unsupported.join(" | ")}`);
      return NextResponse.json(
        { error: "We couldn't verify the timing on this reading. Please try again." },
        { status: 422 },
      );
    }

    return NextResponse.json(
      {
        reading: {
          id: crypto.randomUUID(),
          pages,
          topic: body.topic,
          question: body.question,
          status: "complete",
        },
        careNote,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[readings] Unexpected error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}