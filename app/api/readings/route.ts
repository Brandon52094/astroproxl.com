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
  extendedPoints?: ExtendedPoints; // EDIT 1: Added to request body
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

/**
 * DATE CORRECTION appendix used on the single corrective retry. When the first
 * draft names a date the chart data doesn't support, we re-run the same prompt
 * with this appended: it enumerates the only dates the model is allowed to use,
 * or tells it to drop dates entirely when none exist.
 */
function allowedDatesInstruction(index: ReturnType<typeof buildValidDateIndex>): string {
  const allowed = index.dates.map((d) => d.raw);
  if (allowed.length === 0) {
    return (
      NL + NL +
      "DATE CORRECTION: Your previous draft named a date the chart data does not support. " +
      "There are NO calculated dates available for this reading. Rewrite it with NO [[DATE: ...]] markers " +
      "at all. Drop every dated window and use a DROP-only directive. Keep everything that needs no date."
    );
  }
  return (
    NL + NL +
    "DATE CORRECTION: Your previous draft named a date the chart data does not support. " +
    "The ONLY dates you may place inside [[DATE: ...]] markers are the calculated trigger dates below — these are " +
    "the precise moments the ephemeris aspects perfect, which is exactly why they are the only valid anchors:" + NL +
    allowed.map((d) => `- ${d}`).join(NL) + NL +
    "Rewrite the reading. Every [[DATE: ...]] marker must be one of the dates above (a range may bracket one). " +
    "Use no other date. If a window has no supported date, drop that window rather than inventing one."
  );
}

/**
 * The transit-to-natal aspects arrive pre-calculated, pre-filtered, and
 * pre-sorted from lib/transitAspects.ts. This is the single most important
 * block in the prompt: it means the model NEVER has to work out which transit
 * is hitting which natal point, or how tightly, or whether it's building or
 * fading. That arithmetic used to happen by inference — ~700 comparisons per
 * reading — and "mostly right" is not good enough when someone is paying for
 * clarity about something that matters. Now it's given.
 */
function fmtTransitAspects(aspects: TransitAspect[]): string {
  if (!aspects || aspects.length === 0) {
    return "TRANSIT-TO-NATAL ASPECTS: none within orb right now. Lead from progressions and the profection year instead.";
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

function buildReadingPrompt(body: ReadingRequestBody): string {
  const {
    topic,
    question,
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

  const transitAspectBlock = fmtTransitAspects(transitAspects ?? []);

  const upcomingTriggerBlock = upcomingTrigger
    ? NL +
      "NEXT EXACT ASPECT (ephemeris-calculated — a primary date anchor):" + NL +
      upcomingTrigger.transitPlanet + " " + upcomingTrigger.aspect + " natal " +
      upcomingTrigger.natalPlanet + " — exact within 1° on " + upcomingTrigger.date + NL
    : "";

  const moonPhaseBlock = moonPhase
    ? NL +
      [
        "MOON PHASE (timing texture — use to shape WHEN, not what):",
        `${moonPhase.phaseName}, ${moonPhase.illuminationPercent}% illuminated. Moon in ${moonPhase.moonSign}.`,
        `Next ${moonPhase.nextEventName} in ${moonPhase.daysUntilNextEvent} days.`,
        "ROLE: A waxing moon supports initiating and building; a waning moon supports closing, releasing, and cutting.",
        "The New Moon is a start-point; the Full Moon is a culmination and a reveal.",
        "Use this to choose WHICH of the dated windows to push toward — never as a prediction on its own.",
        "",
      ].join(NL)
    : "";

  const stationsBlock =
    planetaryStations && planetaryStations.length > 0
      ? NL +
        [
          "PLANETARY STATIONS (next 60 days — crystallization points):",
          "ROLE: Stations with natal hits are PRIMARY date anchors. A planet stationing on a natal point",
          "forces an unavoidable crystallization of that house theme. Outrank ordinary transits.",
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
          ? `Time Lord (${profection.timeLord}) falls in SR ${solarReturn.timeLordInSR} — this is how ${profection.timeLord} will behave this year.`
          : "",
        "SR Planets: " + solarReturn.planets.map((p) => `${p.name} ${p.sign} H${p.house}`).join(", "),
        "ROLE — FILTER RULE: A transit must be reflected in the Solar Return chart themes to trigger a major",
        "physical event. Use SR to CONFIRM or DOWNGRADE a transit prediction. If a tight transit has no SR",
        "support, say the shift is internal rather than external. Do not inflate it into an event.",
        "",
      ].filter(Boolean).join(NL)
    : "";

  const progressionsBlock =
    progressions && progressions.length > 0
      ? NL +
        [
          "SECONDARY PROGRESSIONS (current — inner development, slow):",
          ...progressions.map(fmtProgression),
          "ROLE: Progressions describe who they are BECOMING internally. The progressed Moon shows their",
          "current emotional chapter; a progressed Ascendant or Sun that has changed sign marks a genuine",
          "life-chapter shift. Use progressions to explain WHY a transit is landing the way it is — the",
          "transit is the event, the progression is the person it's happening to.",
          "",
        ].join(NL)
      : "";

  const solarArcsBlock =
    solarArcs && solarArcs.length > 0
      ? NL +
        [
          "SOLAR ARC DIRECTIONS (current — long-arc structural timing):",
          ...solarArcs.map(fmtSolarArc),
          "ROLE: Solar arcs move roughly 1° per year, so they are only meaningful when one lands within 1°",
          "of a natal planet or angle. When that happens it marks a multi-year structural shift underneath",
          "the present moment — the deep tectonic layer. Reference ONLY if within 1°. Otherwise ignore.",
          "",
        ].join(NL)
      : "";

  // EDIT 2: Build the extended points block
  const extendedPointsBlock = (() => {
    if (!body.extendedPoints) return "";
    const { arabicLots, declinations } = body.extendedPoints;
    const oob = (declinations ?? []).filter((d) => d.isOutOfBounds);
    if ((!arabicLots || arabicLots.length === 0) && oob.length === 0) return "";

    const lines = [
      "",
      "EXTENDED POINTS (SUPPORTING SIGNAL ONLY — never a headline, never a date anchor):",
    ];

    if (arabicLots && arabicLots.length > 0) {
      lines.push(
        "Lots: " +
          arabicLots
            .map((l) => `${l.name} in ${l.sign} (House ${l.house})`)
            .join(", ")
      );
      lines.push(
        "ROLE: The Lot of Fortune shows where ease and body/material life flow; the Lot of Spirit shows where",
        "effort and agency live. Use ONLY to confirm a theme the calculated aspects already established — if the",
        "house a Lot sits in matches a house the reading is already about, that theme is reinforced. Never introduce",
        "a new topic from a Lot alone."
      );
    }

    if (oob.length > 0) {
      lines.push(
        "Out-of-bounds: " + oob.map((d) => `${d.planet} (${d.declination}°)`).join(", "),
        "ROLE: An out-of-bounds planet acts outside its normal rules — its themes run hotter, less governed, harder",
        "to contain. If one of these planets is already central to the reading, note that its expression is extreme.",
        "If it is not already central, ignore it. Do not list this in the prose; let it sharpen the consequence."
      );
    }

    lines.push("");
    return NL + lines.join(NL);
  })();

  const planetList = tropical.planets.map(fmtPlanet).join(NL);

  // EDIT 2: Anaretic (final-degree) planets block
  const anareticBlock = (() => {
    const anaretic = tropical.planets.filter((p) => p.isAnaretic);
    if (anaretic.length === 0) return "";
    const names = anaretic.map((p) => `${p.name} (${p.sign})`).join(", ");
    return NL + [
      "",
      "FINAL-DEGREE PLACEMENTS (anaretic — a culmination signal):",
      names,
      "ROLE: A planet at the last degree of its sign is running out of room — its themes are urgent,",
      "coming to a head, being forced to a conclusion. In the prose, translate this as a sense of something",
      "ENDING or reaching its limit — never say 'anaretic' or name the degree. If one of these planets is",
      "central to the reading, let that ending-energy sharpen the consequence. If it is not central, ignore it.",
      "",
    ].join(NL);
  })();

  const voiceCalibrationBlock = buildVoiceCalibrationBlock(
    tropical.planets.map((p) => ({ name: p.name, sign: p.sign }))
  );

  // EDIT 4: Rank and cap the natal aspects
  const MAJOR_BODIES = new Set([
    "Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn",
    "Uranus","Neptune","Pluto","North Node","Ascendant","Midheaven",
  ]);
  const isMajor = (a: Aspect) =>
    MAJOR_BODIES.has(a.planetA) && MAJOR_BODIES.has(a.planetB);

  const rankedAspects = tropical.aspects
    .slice()
    .sort((a, b) => {
      if (isMajor(a) !== isMajor(b)) return isMajor(a) ? -1 : 1;
      return a.orbDegrees - b.orbDegrees;
    })
    .slice(0, 12);

  const aspectList = rankedAspects
    .map((a) => (isMajor(a) ? fmtAspect(a) : fmtAspect(a) + "  [minor body — flavor only]"))
    .join(NL);

  const transitList = transits.map(fmtTransit).join(NL);
  const siderealList = sidereal.planets.map(fmtPlanet).join(NL);

  // ── TOPIC SIGNIFICATORS — the domain lens ──
  // The chart speaks about each life area through specific houses, planets, and
  // points. Without this, every topic selects the same loudest-overall aspect
  // and produces near-identical readings with the topic word swapped. This makes
  // the SPINE selection weight by DOMAIN RELEVANCE, not orb alone, so a money
  // reading and a love reading interrogate different parts of the same chart.
  // NOTE: the house/planet mappings below are a mainstream first pass — edit them
  // to match your own astrological point of view.
  const topicSignificatorBlock = (() => {
    if (topic === "general") {
      return NL + [
        "═══════════════════════════════════════════",
        "TOPIC FOCUS — GENERAL / WHAT'S COMING",
        "═══════════════════════════════════════════",
        "No domain filter applies. The whole chart is in scope. Select the SPINE purely by potency:",
        "the tightest, loudest calculated aspect wins, whatever house or planet it touches.",
        "",
      ].join(NL);
    }

    const map: Record<"love" | "money" | "career", {
      label: string; houses: string; planets: string; points: string; guard: string;
    }> = {
      love: {
        label: "LOVE & RELATIONSHIPS",
        houses: "5th (romance, dating, attraction), 7th (committed partnership, marriage), 8th (intimacy, deep bonding)",
        planets: "Venus (attraction and relationship), the Moon (emotional needs and closeness), Mars (desire and pursuit)",
        points: "the Descendant (the partner themselves)",
        guard: "A 2nd/10th-house money or career signature is NOT a love event. Do not read ambition or income as romance.",
      },
      money: {
        label: "MONEY & FINANCES",
        houses: "2nd (earned income, possessions, self-worth as resource), 8th (shared money, debt, other people's resources, inheritance), 11th (gains, windfalls, payouts)",
        planets: "Jupiter (expansion and abundance), Venus in its MATERIAL mode (resources and value — not romance), Saturn (financial discipline or restriction)",
        points: "the Lot of Fortune (material wellbeing — if present in the extended points above)",
        guard: "A 5th/7th-house romance signature is NOT a money event. Do not read a relationship transit as income.",
      },
      career: {
        label: "CAREER & PROFESSIONAL LIFE",
        houses: "10th (vocation, public standing, reputation), 6th (daily work, employment, service), 2nd (income earned through work)",
        planets: "Saturn (mastery, ambition, structure), the Sun (purpose and visibility), Mars (drive and initiative)",
        points: "the Midheaven (the career pinnacle and public role)",
        guard: "A 5th/7th-house romance signature is NOT a career event. Do not read a relationship transit as a work move.",
      },
    };

    const t = map[topic];
    return NL + [
      "═══════════════════════════════════════════",
      "TOPIC FOCUS — " + t.label,
      "═══════════════════════════════════════════",
      "This reading is about " + t.label + ". The chart speaks about this domain through SPECIFIC channels.",
      "When selecting the SPINE and its amplifiers, weight aspects by DOMAIN RELEVANCE, not orb alone:",
      "",
      "IN-DOMAIN HOUSES: " + t.houses,
      "IN-DOMAIN PLANETS: " + t.planets,
      "IN-DOMAIN POINTS: " + t.points,
      "",
      "POTENCY = TIGHTNESS × DOMAIN RELEVANCE. An aspect touching an in-domain house or planet outranks a",
      "slightly tighter aspect that has nothing to do with this domain. A 3° aspect to an in-domain point beats",
      "a 1° aspect in an unrelated house — for THIS reading.",
      "",
      "IF THE LOUDEST OVERALL ASPECT IS OUT OF DOMAIN: you have two honest choices. Either (a) lead with the",
      "strongest IN-DOMAIN aspect instead, or (b) connect the loud out-of-domain transit to this domain through",
      "its house — e.g. a 7th-house transit in a MONEY reading becomes 'a financial matter that runs through a",
      "partnership or contract.' Never ignore the domain to chase the loudest noise.",
      "",
      t.guard,
      "",
    ].join(NL);
  })();

  const lines = [
    "You are writing a reading for a real person who is paying for clarity about something that matters to them.",
    "They may know nothing about astrology. Write so they understand every sentence.",
    "",
    "CRITICAL REAL-ESTATE RULE: This renders on a mobile screen. Short, heavy sentences. No cosmic setup fluff.",
    "Hit the nerve and move forward.",
    "",
    "═══════════════════════════════════════════",
    "THE LANGUAGE RULE — THIS GOVERNS EVERYTHING",
    "═══════════════════════════════════════════",
    "The prose is for a human being. The technical proof goes in the 'sources' array, which they can expand if",
    "they want it. These are two different audiences and you serve both — but never in the same sentence.",
    "",
    "IN THE PROSE, DO NOT WRITE:",
    "- Degrees or minutes (no '24°35\\'', no '29°03\\'')",
    "- Orb numbers (no 'within 1° orb', no 'a 2.4° orb opposition')",
    "- The word 'orb', 'anaretic', 'applying', 'separating', 'ingress', 'cusp'",
    "- Sidereal/tropical distinctions, solar arc jargon, or system names",
    "",
    "IN THE PROSE, DO WRITE:",
    "- The planet, the aspect, and the house TRANSLATED into what it governs.",
    "  Not: 'Mercury at 24°35\\' Cancer trine natal North Node at 23°47\\' Scorpio in your 9th house, 1° orb.'",
    "  But: 'Mercury is exactly trine your North Node today, in the house that rules courts and formal judgments.'",
    "- Houses by MEANING first, number second if at all: '9th house — courts, contracts, formal judgments'",
    "  becomes 'the part of your chart that governs courts and formal judgments.'",
    "- Plain consequence. What it DOES to their week. What they will feel, face, or have to decide.",
    "",
    "The reading must lose NO precision — every claim still rests on an exact calculated aspect. It simply stops",
    "reciting the arithmetic at someone who did not ask for it. The specificity lives in the CONSEQUENCE,",
    "not in the decimal places.",
    "",
    "═══════════════════════════════════════════",
    "ASPECT LAW — THE MATH IS DONE FOR YOU",
    "═══════════════════════════════════════════",
    "The transit-to-natal aspects below are CALCULATED and EXACT. You do not compute them. You do not estimate",
    "orbs. You do not invent an aspect that is not on the list. If an aspect is not in that block, it is not",
    "happening and you may not mention it.",
    "Lead with EXACT and LIVE aspects. BACKGROUND aspects are context only and can never anchor a date.",
    "An APPLYING aspect is building — speak of it as coming. A SEPARATING aspect has peaked — speak of it as passing.",
    "Never manufacture a date. Every date you give must trace to a calculated aspect, a station, or the next exact aspect.",
    "",
    "═══════════════════════════════════════════",
    "CHART DATA",
    "═══════════════════════════════════════════",
    "TODAY: " + currentDateString,
    voiceCalibrationBlock,
    "",
    // ── MOVED TOPIC FOCUS TO HERE (Fix #2) ──
    topicSignificatorBlock,
    "",
    transitAspectBlock,
    "",
    upcomingTriggerBlock,
    stationsBlock,
    moonPhaseBlock,
    solarReturnBlock,
    "NATAL PLACEMENTS (tropical — the primary chart):",
    planetList,
    // EDIT 2: Insert anaretic block here
    anareticBlock,
    "",
    // EDIT 4: Updated natal aspects block
    "NATAL ASPECTS (ranked — major-body aspects first, then by tightness; asteroid/Chiron/Lilith marked as flavor):",
    aspectList,
    "ROLE: These never change — the pattern the transits are ACTIVATING. Part 2 lives here.",
    "Aspects marked '[minor body — flavor only]' may color a description but may NEVER be the tightest natal",
    "aspect you name in Part 2, and may never anchor a claim. Part 2 must land on a major-body aspect.",
    "",
    "SIDEREAL PLACEMENTS:",
    siderealList,
    "ROLE — CONFIRMATION FILTER: Sidereal is a second opinion, not a second reading. Where sidereal agrees",
    "with the tropical read, the prediction is STRONGER — say it with more force. Where it disagrees, the",
    "signal is mixed — soften the certainty of that specific claim. NEVER mention sidereal, tropical, or",
    "any system name in the prose. It shapes your confidence; it is not content.",
    "",
    "CURRENT TRANSIT POSITIONS:",
    transitList,
    "",
    "ANNUAL PROFECTION:",
    "Age " + profection.age + ", House " + profection.activatedHouse + " (" + profection.activatedSign + "), Time Lord: " + profection.timeLord + " (Natal: " + profection.timeLordNatalSign + ", House " + profection.timeLordNatalHouse + ")",
    "ROLE: The Time Lord is this year's ruling planet. Any transit involving the Time Lord is AMPLIFIED —",
    "it carries more weight than the same transit would in another year. If a dated window involves the",
    "Time Lord, that window is the most important one in the reading.",
    progressionsBlock,
    solarArcsBlock,
    // EDIT 3: Insert extended points block here
    extendedPointsBlock,
    "",
    "THEIR QUESTION (" + topicLabel + "):",
    "\"" + question + "\"",
    "",
    "═══════════════════════════════════════════",
    "SYNTHESIS PASS — DO THIS BEFORE YOU WRITE A SINGLE WORD",
    "═══════════════════════════════════════════",
    "The layers above — the calculated transit aspects, the natal aspects, the profection and Time Lord,",
    "progressions, solar arcs, stations, the solar return, the moon phase, the sidereal check, the extended",
    "points — are NOT a menu to pick one from, and NOT a checklist to recite. They are independent instruments",
    "pointed at the same sky. Your job is to find where they AGREE and build the reading on that agreement.",
    "",
    "Work through this silently before writing:",
    "1. SPINE. Select the backbone aspect by scoring every transit-to-natal aspect on three axes, then take the highest:",
    "   BAND — EXACT (under 1°) is loudest; LIVE (under 3°) is strong; BACKGROUND (3°+) is context only and can never",
    "   be the spine on its own. PLANET — a slow outer planet (Saturn, Uranus, Neptune, Pluto) on an angle (Ascendant",
    "   or Midheaven) is the single loudest thing a chart can say and overrides a pile of minor transits, even slightly",
    "   tighter ones; an outer planet on a personal planet outranks a fast inner-planet aspect. DOMAIN — the aspect must",
    "   be IN DOMAIN for this topic (see TOPIC FOCUS above). Potency is band × planet × domain, never orb alone. For a",
    "   general reading, drop the domain axis and take the loudest overall. Note the spine's planet, the natal point it",
    "   hits, and the house it touches.",
    "2. ROOT. Find the tightest MAJOR-body natal aspect the spine lands on — the fixed wiring being activated.",
    "   This is why it lands on THEM, not on anyone having a hard week.",
    "3. AMPLIFIERS. Check every other layer against the spine. Ask each ONE question: does it point at the same",
    "   planet, house, or theme?",
    "   - Spine's planet is the Time Lord, or its house is the profected house? → this is the headline of the year.",
    "   - A progression (esp. progressed Moon/Sun/Ascendant) names the same chapter? → this is WHY it lands this way.",
    "   - The Solar Return reflects the theme? → it is a real external event. If not → it is internal; do not inflate it.",
    "   - A station falls on the same natal point or house? → the timing is forced and unavoidable; it outranks ordinary transits.",
    "   - Sidereal agrees? → say it with more force. Disagrees? → soften that specific claim.",
    "   - Moon phase, lots, anaretic, or out-of-bounds reinforce it? → let them sharpen the consequence, not add a topic.",
    // Fix #5: Progressed Moon Override
    "   - PROGRESSED MOON OVERRIDE: If the Progressed Moon has changed signs within the last 3 months, or will change",
    "     signs within the next 3 months, this is a PRIMARY AMPLIFIER. It outranks all personal-planet transits",
    "     (Mercury/Venus/Mars) and should be mentioned in Part 1 as the 'emotional chapter you are entering.' If the",
    "     Progressed Moon's new sign matches the Spine's house or planet, escalate the prediction to 'Critical Mass.'",
    "4. WEIGHT. A claim three converging layers support is stated as fact, with force. A claim only one layer",
    "   supports is stated lightly or dropped. Where two layers CONTRADICT, say the picture is mixed — do not force certainty.",
    "5. DISCARD. Anything that does not connect to the spine is dropped. You were given the whole chart to FIND",
    "   the convergence, not to list it. An unused layer is not a failure; a reading that name-drops every layer is.",
    // Fix #3: Background Relief Exception
    "6. BACKGROUND RELIEF EXCEPTION: If the discarded 70% contains a benefic aspect (Jupiter/Venus trine or sextile) " +
    "to a personal planet (Sun, Moon, Venus, Mars), you may mention it in exactly ONE sentence at the end of Part 1. " +
    "Frame it as 'what carries you through' the Spine. It cannot change the Spine's forecast, and it must be the ONLY " +
    "non-convergent aspect you name. If no such benefic exists, skip this entirely.",
    "",
    "The finished reading is ONE throughline, not a stack of observations: the spine is what is happening, the",
    "root is why it lands on them, the amplifiers are why NOW and how hard, the directive is what to do. Each part",
    "hands to the next. If the reader cannot feel a single thread running through all of it, you have listed instead",
    "of synthesized — return to the spine and build outward.",
    "",
    "═══════════════════════════════════════════",
    "READING STRUCTURE — STRICT LIMITS",
    "═══════════════════════════════════════════",
    "",
    "No section headers in output — only date labels and DROP/EXECUTE/LOCK appear in caps. Everything flows as prose.",
    "",
    "PART 1 — WHERE YOU ARE RIGHT NOW (exactly 1 compact paragraph)",
    "Open with the SPINE aspect you selected in the synthesis pass (potency, not raw tightness). Name the planets and translate the",
    "house into what it governs. State what it is doing to their life in concrete behavioral terms — what they",
    "will actually face this week. End on one acute tension sentence that leaves the core conflict open.",
    "",
    "PART 2 — THE ROOT (exactly 2 sentences — HARD LIMIT. Not a paragraph.)",
    "Name the single tightest natal aspect that the Part 1 transit is landing on, in plain terms — the wiring",
    "they were born with that is being touched right now. Then name the loop it produces, once, bluntly.",
    "",
    "This is a BRIDGE, not a character autopsy. Its only job is to show them this is happening to THEM",
    "specifically — not to anyone having a hard week. Two sentences. Then move on.",
    "Do NOT narrate their whole life pattern. Do NOT deliver an extended uncomfortable truth here.",
    "Stay blunt — bluntness is what keeps this from being generic — but stay SHORT. The behavioral correction",
    "belongs in DROP, where it is actionable, not here where it is just commentary.",
    "",
    // ── PART A RELAXATION + TEMPORAL SLICING: 0 windows allowed; near vs long arc ──
    "PART 3 — DATED WINDOWS (0 to 2 total — governed entirely by what the data supports)",
    "Windows come ONLY from calculated aspects, stations, or the next exact aspect. Never invented.",
    "Split them across two timescales and give whichever the data supports — one, both, or neither:",
    "",
    "IMMEDIATE (0-4 weeks): the near-term event. Attach a [[DATE: ...]] ONLY from a dated source — a station or",
    "the next exact aspect. If neither supplies a near-term date, give no immediate window rather than inventing one.",
    "STRUCTURAL (3-12 months): the longer arc a slow outer-planet transit, a solar arc within 1°, or a progressed",
    "shift is building toward. Describe its DIRECTION and theme. Attach a [[DATE: ...]] ONLY if a station or the next",
    "exact aspect actually supplies a real date that far out — otherwise give NO date marker and speak of it as a",
    "season, not a day. Never invent a structural date to fill the slot.",
    "",
    "For any dated window: 1 sentence on what it activates, 1 sentence on the specific consequence. Fact, not possibility.",
    "If a window involves the Time Lord, say so — it outranks the others.",
    "",
    "DO NOT spend a window on a period where nothing happens. A window that says 'wait, nothing moves yet'",
    "is not a window — it is filler. Every window must contain an EVENT they can act on or prepare for.",
    "A window with no calculated date behind it is a fabrication. Zero real windows beats one invented one.",
    "",
    // ── PART A RELAXATION: EXECUTE and LOCK are now conditional on a real date ──
    "PART 4 — THE DIRECTIVE (1 to 3 — hard 3-sentence ceiling each)",
    "DROP: The specific behavior they must stop immediately. Name the natal pattern driving it in plain terms.",
    "  DROP is always available and needs no date. If nothing else is dateable, DROP alone is a complete directive.",
    "EXECUTE BY [[DATE: ...]]: The exact action tied to the tightest upcoming window. What to do and when.",
    "LOCK IN BY [[DATE: ...]]: The structural commitment sealed before the window closes.",
    "Include EXECUTE and LOCK ONLY when a real upcoming dated window exists in the data above. If no calculated",
    "date is available, return DROP alone. Never invent a date to complete the set.",
    "",
    "PART 5 — THE ACTUAL ANSWER (exactly 1-2 warm sentences, last)",
    "Everything above is diagnosis. This is different. Directly answer the literal question they asked, in plain",
    "human language, like a person who actually heard them. Drop the clinical tone entirely. No new placements,",
    "no astrology at all. Just land on their real question with warmth and a real answer — even if the question",
    "was casual or funny. This is where the reading stops being a report and becomes a person talking to them.",
    "",
    "═══════════════════════════════════════════",
    "TONE — VOICE CALIBRATION",
    "═══════════════════════════════════════════",
    "Each of Sun, Moon, Rising, Mercury, Venus came with a RHYTHM, a TRIGGER, and a FORBIDDEN list above.",
    "These govern DELIVERY, never content. The facts, dates, and directives stay exactly as the chart dictates.",
    "- Sun's RHYTHM sets baseline confidence and cadence.",
    "- Moon's RHYTHM and TRIGGER set emotional weight — feeling versus blunt fact.",
    "- Rising's RHYTHM sets how the reading opens.",
    "- Mercury's RHYTHM sets sentence length and directness.",
    "- Venus's TRIGGER and RHYTHM shape the warm closing answer (Part 5).",
    "Blend these into ONE coherent voice. Where they conflict: Sun and Mercury win sentence rhythm, Moon and",
    "Venus win emotional register, Rising wins the opening.",
    "Respect every FORBIDDEN. Never name a placement as the reason for your tone ('because you're a Pisces Moon').",
    "",
    "IMPORTANT: A voice calibration may call for precision or exactness — deliver that through SHARPNESS OF",
    "CONSEQUENCE, never through reciting degrees. Precision means 'you will feel it Thursday and here is exactly",
    "what it will look like,' not 'a 2.4° orb opposition.' The LANGUAGE RULE overrides any voice instruction",
    "that would pull you toward technical jargon.",
    "",
    "═══════════════════════════════════════════",
    "LAWS",
    "═══════════════════════════════════════════",
    "- Only calculated aspects. Never invent one.",
    "- 'You' in every sentence. No passive voice.",
    "- Outcomes as facts. No hedging words.",
    "- No degrees, no orbs, no jargon in the prose. All of it goes in sources.",
    "- Immediate windows fall within ~45 days; a structural window may point 3-12 months out. Nothing beyond 12 months.",
    "- Strip all textbook phrasing and cosmic setup fluff.",
    "- Every date in the content wrapped as [[DATE: June 28]] or [[DATE: June 28-July 3]] so the UI can highlight it.",
    "- The reading feels complete but leaves them wanting the live conversation.",
    "",
    "═══════════════════════════════════════════",
    "SOURCES — WHERE ALL THE TECHNICAL PROOF LIVES",
    "═══════════════════════════════════════════",
    "This is the receipt. The person can expand it if they want to see the machinery. Here — and ONLY here —",
    "you write the exact degrees, orbs, houses, and system names. Be precise and terse. No prose.",
    "One entry per distinct section of the reading (Part 1, Part 2, each dated window, DROP, EXECUTE, LOCK IN).",
    "- 'section': short label ('Part 1', 'Part 2', 'July 6-7 window', 'DROP', 'EXECUTE', 'LOCK IN')",
    // Fix #4: Updated sources with domain justification
    "- 'placements': the exact astrological data justifying that section — every planet, sign, degree, house,",
    "  and orb you actually used, comma separated. ALSO include the domain justification: e.g., 'selected because",
    "  this aspect falls in the 5th house (love domain), despite a tighter 1° aspect in the 10th house being discarded.'",
    "  This proves the topic filter was applied correctly.",
    "  Copy the numbers EXACTLY from the calculated aspect list. Do not pad. Do not omit anything you used.",
    "",
    "Return ONLY a valid JSON object — no markdown, no code fences, no explanation:",
    "{",
    "  \"pages\": [",
    "    {",
    "      \"pageNumber\": 1,",
    "      \"title\": \"WHY YOU FEEL [X] RIGHT NOW — AND IT'S REAL\",",
    "      \"content\": \"The reading as one unbroken piece, in plain human language. Part 1 into Part 2 into dated windows into directives into the warm direct answer. No headers except date labels and DROP/EXECUTE/LOCK. No degrees. No orbs. Dates wrapped in [[DATE: ...]].\",",
    "      \"sources\": [",
    "        { \"section\": \"Part 1\", \"placements\": \"Transit Mercury 24°35' Cancer trine natal North Node 23°47' Scorpio, House 9, 0.8° orb, applying — selected because House 9 governs courts/contracts, which matches the user's question about a legal matter\" }",
    "      ]",
    "    }",
    "  ]",
    "}",
  ];

  return lines.join(NL);
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse first: the crisis check needs the question, and a block must run
    // before the eligibility gate so someone in crisis gets help, not a paywall.
    const body = (await request.json()) as ReadingRequestBody;

    // ── LAYER 1: crisis check — before the gate and the model, so it costs nothing ──
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
          // Client MUST check this and SKIP /api/user/reading-complete — a crisis
          // intercept must never spend a credit or the weekly free reading.
          isSafeResponse: true,
          riskLevel: risk.level,
        },
        { status: 200 }
      );
    }
    // MEDIUM proceeds to the full reading; this rides along underneath it.
    const careNote = getCareNote(risk);

    // ── Server-side eligibility check ────────────────────────────────────────
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const metadata = user.publicMetadata;

    const isSubscribed = metadata?.isSubscribed === true;
    const credits = Number(metadata?.credits ?? 0);
    const firstReadingUsed = metadata?.firstReadingUsed === true;

    const cooldownStartedAt = metadata?.cooldownStartedAt
      ? new Date(metadata.cooldownStartedAt as string)
      : null;
    const onCooldown = !isSubscribed && !!cooldownStartedAt &&
      Date.now() < cooldownStartedAt.getTime() + COOLDOWN_MS;

    if (onCooldown) {
      return NextResponse.json({ error: "You're on cooldown. Please wait before starting a new reading." }, { status: 403 });
    }

    // ── Existing access logic: free reading / credits check ──
    const freeReadingUsedAt = metadata?.freeReadingUsedAt
      ? new Date(metadata.freeReadingUsedAt as string)
      : null;
    let freeReadingAvailable = !firstReadingUsed;
    if (freeReadingUsedAt && !isSubscribed) {
      freeReadingAvailable = Date.now() >= freeReadingUsedAt.getTime() + FREE_READING_RESET_MS;
    }

    const eligible = isSubscribed || freeReadingAvailable || credits >= CREDITS_PER_READING;
    if (!eligible) {
      return NextResponse.json({ error: "You don't have enough credits for a reading. Please purchase more or subscribe." }, { status: 403 });
    }
    // ── End eligibility check ──────────────────────────────────────────────────

    if (!body.topic || !body.question || !body.tropical || !body.transits || !body.profection) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const apiKey: string = process.env.ANTHROPIC_API_KEY ?? "";
    if (!apiKey) {
      return NextResponse.json({ error: "API configuration error." }, { status: 500 });
    }

    const prompt = buildReadingPrompt(body);
    const dateIndex = buildValidDateIndex(body);

    if (dateIndex.unparseableSupplied.length > 0) {
      console.warn(`[readings] supplied dates failed to parse (format bug?): ${dateIndex.unparseableSupplied.join(" ; ")}`);
    }

    // Runs the model + cleans + parses. Returns pages or a typed error, so the
    // corrective retry below can reuse the exact same path.
    async function generate(
      promptText: string,
    ): Promise<{ ok: true; pages: ReadingPage[] } | { ok: false; status: number; error: string }> {
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
          // Fix #1: Updated system prompt with hierarchical mandate
          system:
            "You are a precision astrological SYNTHESIS ENGINE, not a horoscope writer. " +
            "IMMUTABLE LAWS (these override everything): " +
            "1. The SPINE is the most POTENT transit aspect — scored by band (EXACT/LIVE) times planetary weight (an outer planet on an angle outranks a tighter inner-planet aspect) times domain relevance to the topic. It is NOT simply the tightest orb. Discard all others unless they converge on the same natal planet or house. " +
            "2. TEMPORAL SLICING is mandatory: split the future into 'Immediate (0-4 weeks)' and 'Structural (3-12 months)'. Never collapse them. " +
            "3. If a Transit and a Progression hit the same Natal planet, label it 'Critical Mass' – this is your headline. " +
            "4. The prose contains NO degrees, NO orbs, NO jargon. All technical proof goes in the 'sources' array. " +
            "5. You output ONLY raw valid JSON. No markdown, no code fences. Your entire response is one parseable JSON object.",
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

    // First pass.
    const first = await generate(prompt);
    if (!first.ok) return NextResponse.json({ error: first.error }, { status: first.status });

    let pages = first.pages;
    let unsupported = pages.flatMap((pg) => findUnsupportedMarkers(pg.content ?? "", dateIndex));

    // ── DATE PROVENANCE GUARD ──────────────────────────────────────────────
    // Dates live inline in the prose as [[DATE: ...]] markers, so a bad one
    // can't be surgically removed without breaking a sentence. Instead we retry
    // ONCE with the exact allowed dates enumerated, then fail closed. Because
    // the credit is only spent by the client via /api/user/reading-complete on
    // success, a 422 here costs the person nothing.
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
        // null unless MEDIUM risk; client renders it quietly beneath the reading.
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