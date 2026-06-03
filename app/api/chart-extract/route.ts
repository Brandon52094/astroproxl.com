import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlacementValue {
  value: string;
  confidence: "high" | "medium" | "low";
  raw: string;
}

export interface ChartExtractResponse {
  success: boolean;
  birthDate: PlacementValue | null;
  birthTime: PlacementValue | null;
  birthPlace: PlacementValue | null;
  corePlacements: {
    sun: PlacementValue | null;
    moon: PlacementValue | null;
    rising: PlacementValue | null;
    mercury: PlacementValue | null;
    venus: PlacementValue | null;
    mars: PlacementValue | null;
  };
  advancedPlacements: {
    jupiter: PlacementValue | null;
    saturn: PlacementValue | null;
    uranus: PlacementValue | null;
    neptune: PlacementValue | null;
    pluto: PlacementValue | null;
    northNode: PlacementValue | null;
  };
  aspects: string;
  chartSource: string;
  missingRequiredFields: string[];
  lowConfidenceFields: string[];
  extractionNotes: string;
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_MB = 10;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const CLAUDE_MODEL = "claude-sonnet-4-6";

const VALID_SIGNS = new Set([
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
]);

// Abbreviated sign names → full names
const SIGN_ABBREVIATIONS: Record<string, string> = {
  ari: "Aries", tau: "Taurus", gem: "Gemini", can: "Cancer",
  leo: "Leo",   vir: "Virgo",  lib: "Libra",  sco: "Scorpio",
  sag: "Sagittarius", cap: "Capricorn", aqu: "Aquarius", pis: "Pisces",
};

// ─── Prompt ───────────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are an expert astrology chart data extractor.

Extract astrology chart data from this screenshot and return it as a single JSON object.
Return ONLY valid JSON — no markdown fences, no commentary, no explanation.

═══════════════════════════════════════════
CORE RULE
═══════════════════════════════════════════
Be conservative. If a value is not clearly tied to a labeled field, return null.
Prefer null over wrong data. Never guess or infer from unrelated text.

═══════════════════════════════════════════
KNOWN LAYOUT FORMATS — read all of these carefully
═══════════════════════════════════════════

LAYOUT A — Co-Star / Void app (table with SIGNS column, PLANET column, HOUSES column)
The table has three columns: Sign (left), Planet name (center), House number (right).
Multiple planets may share a sign row. Read each row carefully.
Example rows:
  Pisces   | ↑ ASCENDANT | 1
  Aries    | ♂ MARS      | 2
  Taurus   | ☉ SUN       |
  Gemini   | ☿ MERCURY   | 3
           | ♀ VENUS     | 4
  Virgo    | ☽ MOON      | 7
Extract: sun=Taurus, moon=Virgo H7, rising=Pisces H1, mars=Aries H2, mercury=Gemini H3, venus=Gemini H4
Note: when a sign cell is blank, it shares the sign from the row above it.
Degrees are NOT shown in this layout — return just the sign (and house if visible), confidence="medium".

LAYOUT B — Astro-Charts.com list (degree before sign)
Rows look like: "Sun in 15° 10' Pisces" or "Mercury in 18° 33' Pisces (r)"
The degree appears BEFORE the sign name. Normalize to "Sign Degree°Minutes'" format.
Example: "Sun in 15° 10' Pisces" → value: "Pisces 15°10'"
Retrograde (r) or (R) → append " Rx" to the value.
ASC row = rising. North Node row = northNode.

LAYOUT C — TimePassages app (planet name left, abbreviated sign + degree right)
Rows look like:
  "Sun in Taurus          29° Tau 03' 37""
  "Moon in Virgo          21° Vir 55' 46""
  "Ascendant in Pisces    13° Pis 08'"
The abbreviated sign on the right (Tau, Vir, Pis, etc.) matches the full sign name on the left.
Drop seconds if shown. Normalize to "Sign Degree°Minutes'".
Example: "29° Tau 03' 37"" → value: "Taurus 29°03'"

LAYOUT D — Astro.com full chart table
Header may include birth date, time, location.
Rows like: "Sun  29 Tau  3'37""  or  "AC  13 Pis  8'"
AC = rising. Normalize abbreviated signs to full names.

LAYOUT E — Wheel/circle chart only
Do NOT extract placements from a wheel graphic alone.
Return null for all placements. Note this in extractionNotes.

═══════════════════════════════════════════
ASPECT EXTRACTION
═══════════════════════════════════════════
Extract aspect rows only when they are clearly structured lists, like:
  "Neptune Sextile True Node  orb: 0°"
  "Sun Trine Uranus  orb: 3°"
  "Moon Trine Neptune  orb: 2°"
One aspect per line. Include the orb if shown.
Ignore aspect symbols/glyphs — use the text label only.
If no clear aspect list is visible, return empty string.

═══════════════════════════════════════════
WHAT TO IGNORE
═══════════════════════════════════════════
Ignore: navigation tabs, profile names, usernames, phone status bar, battery/wifi indicators,
marketing copy, decorative headings, app chrome, timestamps, account labels.
Do not extract from wheel graphics unless text is clearly labeled.

═══════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════
{
  "birthDate": { "value": "YYYY-MM-DD", "confidence": "high|medium|low", "raw": "exactly as shown" } | null,
  "birthTime": { "value": "HH:MM", "confidence": "high|medium|low", "raw": "exactly as shown" } | null,
  "birthPlace": { "value": "City, State/Country", "confidence": "high|medium|low", "raw": "exactly as shown" } | null,
  "corePlacements": {
    "sun":     { "value": "Sign Degree°Minutes'", "confidence": "high|medium|low", "raw": "exactly as shown" } | null,
    "moon":    { "value": "Sign Degree°Minutes'", "confidence": "high|medium|low", "raw": "exactly as shown" } | null,
    "rising":  { "value": "Sign Degree°Minutes'", "confidence": "high|medium|low", "raw": "exactly as shown" } | null,
    "mercury": { "value": "Sign Degree°Minutes'", "confidence": "high|medium|low", "raw": "exactly as shown" } | null,
    "venus":   { "value": "Sign Degree°Minutes'", "confidence": "high|medium|low", "raw": "exactly as shown" } | null,
    "mars":    { "value": "Sign Degree°Minutes'", "confidence": "high|medium|low", "raw": "exactly as shown" } | null
  },
  "advancedPlacements": {
    "jupiter":   { "value": "Sign Degree°Minutes'", "confidence": "high|medium|low", "raw": "exactly as shown" } | null,
    "saturn":    { "value": "Sign Degree°Minutes'", "confidence": "high|medium|low", "raw": "exactly as shown" } | null,
    "uranus":    { "value": "Sign Degree°Minutes'", "confidence": "high|medium|low", "raw": "exactly as shown" } | null,
    "neptune":   { "value": "Sign Degree°Minutes'", "confidence": "high|medium|low", "raw": "exactly as shown" } | null,
    "pluto":     { "value": "Sign Degree°Minutes'", "confidence": "high|medium|low", "raw": "exactly as shown" } | null,
    "northNode": { "value": "Sign Degree°Minutes'", "confidence": "high|medium|low", "raw": "exactly as shown" } | null
  },
  "aspects": "One aspect per line. Empty string if none clearly visible.",
  "chartSource": "App or site name if clearly visible as the chart source. Empty string if not.",
  "extractionNotes": "Detected layout type and reason for any null fields."
}

Confidence guide:
- high = clearly labeled row with legible value
- medium = likely correct but degree missing, or layout slightly ambiguous
- low = weak association or partially legible — only use if value is still probably right
When in doubt, return null rather than low confidence.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildEmptyResponse(error: string): ChartExtractResponse {
  return {
    success: false,
    birthDate: null,
    birthTime: null,
    birthPlace: null,
    corePlacements: { sun: null, moon: null, rising: null, mercury: null, venus: null, mars: null },
    advancedPlacements: { jupiter: null, saturn: null, uranus: null, neptune: null, pluto: null, northNode: null },
    aspects: "",
    chartSource: "",
    missingRequiredFields: ["birthDate", "birthTime", "birthPlace", "sun", "moon", "rising", "mercury", "venus", "mars"],
    lowConfidenceFields: [],
    extractionNotes: "",
    error,
  };
}

function safeParseJSON(raw: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
  return JSON.parse(cleaned);
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Expand abbreviated sign names (Tau, Vir, Pis, etc.) to full names.
 */
function expandSignAbbreviation(token: string): string {
  const lower = token.toLowerCase().replace(/[^a-z]/g, "");
  return SIGN_ABBREVIATIONS[lower] ?? token;
}

/**
 * Normalize a raw placement string into "Sign Degree°Minutes' [Rx]" format.
 * Handles:
 *   - "Taurus 29°03'"              → "Taurus 29°03'"
 *   - "29° Tau 03' 37\""           → "Taurus 29°03'"   (TimePassages, drop seconds)
 *   - "15° 10' Pisces"             → "Pisces 15°10'"   (Astro-Charts degree-before-sign)
 *   - "Pisces (r)"                 → "Pisces Rx"
 *   - "Taurus"                     → "Taurus"          (sign only, no degree)
 * Returns null if the value cannot be reliably normalized.
 */
function normalizePlacementValue(raw: string): string | null {
  if (!raw?.trim()) return null;

  let s = normalizeSpaces(raw);

  // Strip retrograde markers, record presence
  const isRetrograde = /\b(rx|r|ℛ|℞)\b/i.test(s) || /\(r\)/i.test(s);
  s = s.replace(/\s*\(r\)/gi, "").replace(/\s*\b(rx|ℛ|℞)\b/gi, "").trim();

  // Pattern: degree-before-sign — "15° 10' Pisces" or "15°10' Pisces"
  const degBeforeSign = s.match(
    /^(\d{1,2})°\s*(\d{2})['′]?\s*"?\s*([\w]+)/
  );
  if (degBeforeSign) {
    const deg = Number(degBeforeSign[1]);
    const min = Number(degBeforeSign[2]);
    const signRaw = degBeforeSign[3];
    const sign = expandSignAbbreviation(signRaw);
    if (VALID_SIGNS.has(sign) && deg <= 29 && min <= 59) {
      return `${sign} ${deg}°${String(min).padStart(2, "0")}'${isRetrograde ? " Rx" : ""}`;
    }
  }

  // Pattern: sign-first with degree — "Taurus 29°03'" or "Tau 29°03' 37\""
  const signFirst = s.match(
    /^([\w]+)\s+(\d{1,2})°\s*(\d{2})['′]?(?:\s*\d{2}["″])?/
  );
  if (signFirst) {
    const sign = expandSignAbbreviation(signFirst[1]);
    const deg = Number(signFirst[2]);
    const min = Number(signFirst[3]);
    if (VALID_SIGNS.has(sign) && deg <= 29 && min <= 59) {
      return `${sign} ${deg}°${String(min).padStart(2, "0")}'${isRetrograde ? " Rx" : ""}`;
    }
  }

  // Pattern: abbreviated sign + degree mid-string — "29° Tau 03' 37\""
  const abbrMid = s.match(
    /^(\d{1,2})°\s*([\w]{3})\s+(\d{2})['′]?/
  );
  if (abbrMid) {
    const deg = Number(abbrMid[1]);
    const sign = expandSignAbbreviation(abbrMid[2]);
    const min = Number(abbrMid[3]);
    if (VALID_SIGNS.has(sign) && deg <= 29 && min <= 59) {
      return `${sign} ${deg}°${String(min).padStart(2, "0")}'${isRetrograde ? " Rx" : ""}`;
    }
  }

  // Pattern: sign only (no degree) — "Taurus" or "Pisces"
  const signOnly = s.match(/^([\w]+)$/);
  if (signOnly) {
    const sign = expandSignAbbreviation(signOnly[1]);
    if (VALID_SIGNS.has(sign)) {
      return `${sign}${isRetrograde ? " Rx" : ""}`;
    }
  }

  return null;
}

function isValidBirthDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  return y >= 1800 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

function isValidBirthTime(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [h, m] = value.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/**
 * Check if the raw string looks like it came from UI chrome rather than chart data.
 * Deliberately narrow — only match clearly non-chart tokens.
 */
function isSuspiciousRaw(raw: string): boolean {
  const lower = raw.toLowerCase();
  return [
    "notification", "settings", "profile", "account",
    "home tab", "messages tab", "search tab",
    "battery", "wifi indicator", "5g indicator",
  ].some((token) => lower.includes(token));
}

function sanitizePlacementValue(value: PlacementValue | null): PlacementValue | null {
  if (!value?.value?.trim()) return null;
  if (isSuspiciousRaw(value.raw ?? "")) return null;

  const normalized = normalizePlacementValue(value.value);
  if (!normalized) return null;

  return {
    value: normalized,
    confidence: value.confidence,
    raw: value.raw ?? "",
  };
}

function nullOutRepeatedSuspiciousPlacements(data: ChartExtractResponse): ChartExtractResponse {
  const allPlacements: Array<PlacementValue | null> = [
    ...Object.values(data.corePlacements),
    ...Object.values(data.advancedPlacements),
  ];

  const valueCounts = new Map<string, number>();
  allPlacements.forEach((p) => {
    if (p?.value) valueCounts.set(p.value, (valueCounts.get(p.value) ?? 0) + 1);
  });

  // If 4+ planets share the exact same degree value, something went wrong
  const suspiciousValues = new Set(
    Array.from(valueCounts.entries())
      .filter(([value, count]) => count >= 4 && /\d/.test(value))
      .map(([value]) => value)
  );

  if (suspiciousValues.size === 0) return data;

  const clone: ChartExtractResponse = {
    ...data,
    corePlacements: { ...data.corePlacements },
    advancedPlacements: { ...data.advancedPlacements },
  };

  (Object.keys(clone.corePlacements) as Array<keyof typeof clone.corePlacements>).forEach((key) => {
    if (clone.corePlacements[key] && suspiciousValues.has(clone.corePlacements[key]!.value)) {
      clone.corePlacements[key] = null;
    }
  });

  (Object.keys(clone.advancedPlacements) as Array<keyof typeof clone.advancedPlacements>).forEach((key) => {
    if (clone.advancedPlacements[key] && suspiciousValues.has(clone.advancedPlacements[key]!.value)) {
      clone.advancedPlacements[key] = null;
    }
  });

  return clone;
}

function sanitizeParsedResponse(parsed: ChartExtractResponse): ChartExtractResponse {
  const sanitized: ChartExtractResponse = {
    success: true,
    birthDate:
      parsed.birthDate?.value && isValidBirthDate(parsed.birthDate.value)
        ? { ...parsed.birthDate, value: parsed.birthDate.value.trim(), raw: parsed.birthDate.raw ?? "" }
        : null,
    birthTime:
      parsed.birthTime?.value && isValidBirthTime(parsed.birthTime.value)
        ? { ...parsed.birthTime, value: parsed.birthTime.value.trim(), raw: parsed.birthTime.raw ?? "" }
        : null,
    birthPlace:
      parsed.birthPlace?.value?.trim()
        ? { ...parsed.birthPlace, value: normalizeSpaces(parsed.birthPlace.value), raw: parsed.birthPlace.raw ?? "" }
        : null,
    corePlacements: {
      sun:     sanitizePlacementValue(parsed.corePlacements?.sun     ?? null),
      moon:    sanitizePlacementValue(parsed.corePlacements?.moon    ?? null),
      rising:  sanitizePlacementValue(parsed.corePlacements?.rising  ?? null),
      mercury: sanitizePlacementValue(parsed.corePlacements?.mercury ?? null),
      venus:   sanitizePlacementValue(parsed.corePlacements?.venus   ?? null),
      mars:    sanitizePlacementValue(parsed.corePlacements?.mars    ?? null),
    },
    advancedPlacements: {
      jupiter:   sanitizePlacementValue(parsed.advancedPlacements?.jupiter   ?? null),
      saturn:    sanitizePlacementValue(parsed.advancedPlacements?.saturn    ?? null),
      uranus:    sanitizePlacementValue(parsed.advancedPlacements?.uranus    ?? null),
      neptune:   sanitizePlacementValue(parsed.advancedPlacements?.neptune   ?? null),
      pluto:     sanitizePlacementValue(parsed.advancedPlacements?.pluto     ?? null),
      northNode: sanitizePlacementValue(parsed.advancedPlacements?.northNode ?? null),
    },
    aspects: parsed.aspects?.trim() ?? "",
    chartSource: parsed.chartSource?.trim() ?? "",
    missingRequiredFields: [],
    lowConfidenceFields: [],
    extractionNotes: parsed.extractionNotes?.trim() ?? "",
  };

  return nullOutRepeatedSuspiciousPlacements(sanitized);
}

function computeFlags(data: ChartExtractResponse) {
  const requiredFields: Array<{ path: string; value: PlacementValue | null }> = [
    { path: "birthDate",  value: data.birthDate },
    { path: "birthTime",  value: data.birthTime },
    { path: "birthPlace", value: data.birthPlace },
    { path: "sun",        value: data.corePlacements.sun },
    { path: "moon",       value: data.corePlacements.moon },
    { path: "rising",     value: data.corePlacements.rising },
    { path: "mercury",    value: data.corePlacements.mercury },
    { path: "venus",      value: data.corePlacements.venus },
    { path: "mars",       value: data.corePlacements.mars },
  ];

  const allFields: Array<{ path: string; value: PlacementValue | null }> = [
    ...requiredFields,
    { path: "jupiter",   value: data.advancedPlacements.jupiter },
    { path: "saturn",    value: data.advancedPlacements.saturn },
    { path: "uranus",    value: data.advancedPlacements.uranus },
    { path: "neptune",   value: data.advancedPlacements.neptune },
    { path: "pluto",     value: data.advancedPlacements.pluto },
    { path: "northNode", value: data.advancedPlacements.northNode },
  ];

  return {
    missingRequiredFields: requiredFields.filter((f) => !f.value?.value?.trim()).map((f) => f.path),
    lowConfidenceFields:   allFields.filter((f) => f.value?.confidence === "low").map((f) => f.path),
  };
}

// ─── Claude call (single) ─────────────────────────────────────────────────────

async function callClaude(prompt: string, imageBase64: string, imageMimeType: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in environment variables.");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: "You are an astrology chart data extractor. You output ONLY raw valid JSON with no markdown, no code fences, no explanation, and no text before or after the JSON object. Your entire response must be a single parseable JSON object.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: imageMimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("No text in Claude response");
  return text;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json(buildEmptyResponse("No image file provided."), { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        buildEmptyResponse(`Unsupported file type: ${file.type}. Use JPEG, PNG, WebP, or GIF.`),
        { status: 400 }
      );
    }

    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      return NextResponse.json(
        buildEmptyResponse(`File too large (${fileSizeMB.toFixed(1)}MB). Max ${MAX_FILE_SIZE_MB}MB.`),
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const resized = await sharp(Buffer.from(arrayBuffer))
      .resize({ width: 1200, withoutEnlargement: true })
      .toBuffer();
    const base64 = resized.toString("base64");

    // Single Claude call — extraction + normalization in one pass
    let extractionRaw: string;
    try {
      extractionRaw = await callClaude(EXTRACTION_PROMPT, base64, file.type);
    } catch (err) {
      return NextResponse.json(
        buildEmptyResponse(`Extraction failed: ${err instanceof Error ? err.message : String(err)}`),
        { status: 502 }
      );
    }

    let parsed: ChartExtractResponse;
    try {
      parsed = safeParseJSON(extractionRaw) as ChartExtractResponse;
    } catch {
      return NextResponse.json(
        buildEmptyResponse("Failed to parse extraction result. The image may not contain readable chart data."),
        { status: 422 }
      );
    }

    // All validation and normalization happens in JS — deterministic, no second API call
    const sanitized = sanitizeParsedResponse(parsed);
    const { missingRequiredFields, lowConfidenceFields } = computeFlags(sanitized);

    const response: ChartExtractResponse = {
      success: true,
      birthDate:  sanitized.birthDate  ?? null,
      birthTime:  sanitized.birthTime  ?? null,
      birthPlace: sanitized.birthPlace ?? null,
      corePlacements: {
        sun:     sanitized.corePlacements.sun     ?? null,
        moon:    sanitized.corePlacements.moon    ?? null,
        rising:  sanitized.corePlacements.rising  ?? null,
        mercury: sanitized.corePlacements.mercury ?? null,
        venus:   sanitized.corePlacements.venus   ?? null,
        mars:    sanitized.corePlacements.mars    ?? null,
      },
      advancedPlacements: {
        jupiter:   sanitized.advancedPlacements.jupiter   ?? null,
        saturn:    sanitized.advancedPlacements.saturn    ?? null,
        uranus:    sanitized.advancedPlacements.uranus    ?? null,
        neptune:   sanitized.advancedPlacements.neptune   ?? null,
        pluto:     sanitized.advancedPlacements.pluto     ?? null,
        northNode: sanitized.advancedPlacements.northNode ?? null,
      },
      aspects:              sanitized.aspects      ?? "",
      chartSource:          sanitized.chartSource  ?? "",
      missingRequiredFields,
      lowConfidenceFields,
      extractionNotes:      sanitized.extractionNotes ?? "",
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err) {
    console.error("[chart-extract] Unexpected error:", err);
    return NextResponse.json(
      buildEmptyResponse("An unexpected error occurred. Please try again."),
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "/api/chart-extract", method: "POST" });
}