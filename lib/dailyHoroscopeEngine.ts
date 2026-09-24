// AstroProXL — lightweight daily horoscope engine
//
// This is intentionally much smaller than the full reading engine. It sends a
// compact natal/timing snapshot and the strongest daily aspects to the model,
// then returns four short components that the UI combines into three sentences:
// action. boundary + warning. positive.

export type DailyUrgency = "urgent" | "important" | "steady" | "supportive";

export interface DailyPlanet {
  name: string;
  sign: string;
  degree: string;
  house?: string | number;
  longitude?: number;
  isRetrograde?: boolean;
}

export interface DailyTransitAspect {
  transitPlanet: string;
  natalPlanet: string;
  aspectType: string;
  orbDegrees: number;
  isApplying?: boolean;
  exactDate?: string;
  natalHouse?: number;
  band?: "exact" | "live" | "background";
}

export interface DailyProfection {
  age: number;
  activatedHouse: number;
  activatedSign: string;
  timeLord: string;
  timeLordNatalSign?: string;
  timeLordNatalHouse?: number;
}

export interface DailyMoonPhase {
  phaseName: string;
  illuminationPercent: number;
  nextEventName: "New Moon" | "Full Moon";
  daysUntilNextEvent: number;
  moonSign: string;
  moonDegree: string;
}

export interface DailyHoroscopeInput {
  /** Local calendar date in YYYY-MM-DD form. */
  localDate: string;
  tropicalPlanets: DailyPlanet[];
  currentTransits: DailyPlanet[];
  transitAspects: DailyTransitAspect[];
  profection?: DailyProfection;
  moonPhase?: DailyMoonPhase;
}

export interface DailyHoroscopeResult {
  urgency: DailyUrgency;
  action: string;
  boundary: string;
  warning: string;
  positive: string;
}

const PERSONAL_POINTS = new Set([
  "ascendant",
  "rising",
  "midheaven",
  "mc",
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
]);

const TRANSIT_SPEED_WEIGHT: Record<string, number> = {
  moon: 5,
  sun: 4,
  mercury: 4,
  venus: 4,
  mars: 4,
  jupiter: 3,
  saturn: 3,
  uranus: 2,
  neptune: 2,
  pluto: 2,
};

const ASPECT_WEIGHT: Record<string, number> = {
  conjunction: 4,
  opposition: 4,
  square: 4,
  trine: 3,
  sextile: 2.5,
  quincunx: 2,
  semi_sextile: 1.5,
};

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function aspectScore(aspect: DailyTransitAspect): number {
  const transit = normalize(aspect.transitPlanet);
  const natal = normalize(aspect.natalPlanet);
  const type = normalize(aspect.aspectType);
  const orb = Number.isFinite(aspect.orbDegrees) ? aspect.orbDegrees : 10;

  const transitWeight = TRANSIT_SPEED_WEIGHT[transit] ?? 1;
  const natalWeight = PERSONAL_POINTS.has(natal) ? 4 : 2;
  const typeWeight = ASPECT_WEIGHT[type] ?? 1;
  const closenessWeight = Math.max(0, 4 - orb) * 2;
  const applyingWeight = aspect.isApplying ? 1.25 : 0;
  const exactWeight = aspect.band === "exact" ? 2 : aspect.band === "live" ? 1 : 0;

  return transitWeight + natalWeight + typeWeight + closenessWeight + applyingWeight + exactWeight;
}

/**
 * Keeps the prompt inexpensive while preserving a mix of pressure and support.
 * Six aspects is enough for synthesis without turning the daily into a reading.
 */
export function selectDailyAspects(
  aspects: DailyTransitAspect[],
  limit = 6
): DailyTransitAspect[] {
  return [...aspects]
    .filter(
      (aspect) =>
        aspect.transitPlanet &&
        aspect.natalPlanet &&
        aspect.aspectType &&
        Number.isFinite(aspect.orbDegrees)
    )
    .sort((a, b) => aspectScore(b) - aspectScore(a))
    .slice(0, limit);
}

function compactPlanet(planet: DailyPlanet): Record<string, unknown> {
  return {
    name: planet.name,
    sign: planet.sign,
    degree: planet.degree,
    ...(planet.house !== undefined ? { house: planet.house } : {}),
    ...(planet.isRetrograde !== undefined ? { retrograde: planet.isRetrograde } : {}),
  };
}

function relevantNatalPlanets(planets: DailyPlanet[]): DailyPlanet[] {
  const preferred = planets.filter((planet) => PERSONAL_POINTS.has(normalize(planet.name)));
  return preferred.length ? preferred : planets.slice(0, 7);
}

export function buildDailyHoroscopePrompt(input: DailyHoroscopeInput): string {
  const evidence = {
    date: input.localDate,
    natal: relevantNatalPlanets(input.tropicalPlanets).map(compactPlanet),
    currentPlanets: input.currentTransits.map(compactPlanet),
    strongestTransitAspects: selectDailyAspects(input.transitAspects),
    profection: input.profection ?? null,
    moonPhase: input.moonPhase ?? null,
  };

  return [
    "You are AstroPro Daily, a precise personal astrology advisor.",
    "This is a daily advisory, not a full reading. Decide what the user most needs to know or do today.",
    "Use only the supplied astrology. Do not invent events, biography, danger, certainty, or urgency.",
    "When several signals exist, synthesize them into one coherent message instead of listing transits.",
    "",
    "REQUIRED FOUR-BEAT INTERPRETATION",
    "1. ACTION — the clearest useful thing to do today.",
    "2. BOUNDARY — what not to accept, chase, overexplain, force, or give energy to.",
    "3. WARNING — the most relevant mistake, pressure, or consequence to watch for.",
    "4. POSITIVE — the real opening, advantage, relief, or momentum available today.",
    "",
    "URGENCY",
    'Use "urgent" only when the supplied aspects show an unusually exact, active, and consequential pressure.',
    'Use "important" for a meaningful day that calls for extra attention.',
    'Use "steady" for practical ordinary guidance and "supportive" when the strongest pattern is constructive.',
    "Never manufacture urgency. Direct does not mean frightening or dramatic.",
    "",
    "WRITING RULES",
    "Each field must be a concise clause, not a paragraph.",
    "Use plain, confident, protective language. Make the advice recognizable in real life.",
    "Avoid vague inspiration, fatalism, therapy language, and astrology lectures.",
    "Mention at most one astrological factor, and only when it makes the advice more useful.",
    "Do not repeat the same idea across fields.",
    "The four fields will be combined into three short sentences, so keep the total under 70 words.",
    "Write action, boundary, and positive as standalone clauses without trailing punctuation.",
    "Write warning as a lower-case clause that can naturally follow the boundary after a semicolon.",
    "",
    "ASTROLOGICAL EVIDENCE",
    JSON.stringify(evidence),
    "",
    "OUTPUT — VALID JSON ONLY",
    '{"urgency":"steady","action":"...","boundary":"...","warning":"...","positive":"..."}',
  ].join("\n");
}

function cleanClause(value: string): string {
  return value.trim().replace(/[.!?;,:]+$/g, "");
}

function sentence(value: string): string {
  const cleaned = cleanClause(value);
  if (!cleaned) return "";
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}.`;
}

/** Turns the four required beats into the 1–3 sentence text shown in the card. */
export function formatDailyHoroscope(result: DailyHoroscopeResult): string {
  const action = sentence(result.action);
  const boundary = cleanClause(result.boundary);
  const warning = cleanClause(result.warning);
  const caution = boundary && warning
    ? `${boundary.charAt(0).toUpperCase()}${boundary.slice(1)}; ${warning}.`
    : sentence(boundary || warning);
  const positive = sentence(result.positive);

  return [action, caution, positive].filter(Boolean).join(" ");
}

export function parseDailyHoroscopeResponse(raw: string): DailyHoroscopeResult {
  const parsed = JSON.parse(raw) as Partial<DailyHoroscopeResult>;
  const allowedUrgency: DailyUrgency[] = ["urgent", "important", "steady", "supportive"];

  if (
    !parsed.urgency ||
    !allowedUrgency.includes(parsed.urgency) ||
    !parsed.action?.trim() ||
    !parsed.boundary?.trim() ||
    !parsed.warning?.trim() ||
    !parsed.positive?.trim()
  ) {
    throw new Error("Daily horoscope response is missing a required field.");
  }

  return {
    urgency: parsed.urgency,
    action: cleanClause(parsed.action),
    boundary: cleanClause(parsed.boundary),
    warning: cleanClause(parsed.warning),
    positive: cleanClause(parsed.positive),
  };
}

/** One cached result per user/chart and local calendar day. */
export function dailyHoroscopeCacheKey(userId: string, localDate: string): string {
  return `astroproxl:daily-horoscope:${userId}:${localDate}`;
}
