export interface SignVoice {
  /**
   * Full-reading primary voice when this sign is selected as the COMPATIBLE sign.
   * This is not "how the user sounds"; it is how AstroPro should approach them.
   */
  rhythm: string;

  /** Overall presence across the full reading. */
  presence: string;

  /** How the reading should enter and establish contact. */
  opening: string;

  /** How emotionally charged material should be handled. */
  emotional: string;

  /** Sentence construction, pacing, density, and explanation style. */
  sentence: string;

  /** How warmth, reassurance, and the closing should feel. */
  warmth: string;

  /** Communication styles that weaken compatibility with this voice. */
  forbidden: string;

  /**
   * Legacy field kept for compatibility with any existing imports.
   * It is NO LONGER injected into the reading as a content beat.
   */
  counterweight?: string;
}

export interface VoicePlanet {
  name: string;
  sign: string;
}

export interface VoiceChart {
  planets: VoicePlanet[];

  /**
   * Optional natal house-cusp signs.
   * Example: { 2: "Gemini", 7: "Scorpio", 10: "Aquarius" }
   *
   * SignVoice works without this. When supplied, topic-specific house anchors
   * can outrank placement fallbacks.
   */
  houseSigns?: Partial<Record<number, string>>;
}

type VoiceTopic = "love" | "career" | "money" | "general";

type CalibrationLane =
  | "presence"
  | "opening"
  | "emotional"
  | "sentence"
  | "warmth";

// ============================================================
// SIGN VOICE LIBRARY
//
// IMPORTANT:
// These describe the communication energy AstroPro uses WHEN THE SIGN
// IS SELECTED AS THE COMPATIBLE SIGN.
//
// They do not describe the user's personality and they do not alter
// prediction confidence, evidence, timing, or interpretation.
// ============================================================

export const SIGN_VOICE: Record<string, SignVoice> = {
  aries: {
    rhythm:
      "Decisive, energetic, and forward-moving. State the point early, keep momentum high, and make the next move feel clear.",
    presence:
      "Carry a confident, active presence. Sound ready to move, not stuck in deliberation.",
    opening:
      "Enter quickly. Establish the core answer before expanding the explanation.",
    emotional:
      "Handle emotion directly and cleanly. Acknowledge what matters without lingering in repetitive reassurance.",
    sentence:
      "Favor concise, active sentences, strong verbs, and clear transitions. Keep the pace moving.",
    warmth:
      "Warmth should feel encouraging, energizing, and confidence-building rather than sentimental.",
    forbidden:
      "Avoid hesitant build-ups, excessive caveats, passive phrasing, and long preambles before the answer.",
    counterweight:
      "Legacy only: the Libra side of the Aries–Libra axis adds balance and relational awareness.",
  },

  taurus: {
    rhythm:
      "Steady, grounded, concrete, and reassuringly consistent. Make the reading feel tangible and easy to hold onto.",
    presence:
      "Carry calm weight. Sound stable, unhurried, and materially grounded.",
    opening:
      "Enter with something concrete and trustworthy. Do not rush the reader into abstraction.",
    emotional:
      "Handle emotion with steadiness and containment. Make difficult material feel survivable and understandable.",
    sentence:
      "Use clean, substantial sentences with concrete examples and minimal conceptual jumping.",
    warmth:
      "Warmth should feel safe, dependable, and quietly reassuring rather than dramatic.",
    forbidden:
      "Avoid frantic pacing, constant topic switching, and vague spiritual language that never becomes concrete.",
    counterweight:
      "Legacy only: the Scorpio side of the Taurus–Scorpio axis adds depth and willingness to transform.",
  },

  gemini: {
    rhythm:
      "Agile, conversational, mentally alive, and easy to follow. Keep the reading moving through useful contrasts without becoming scattered.",
    presence:
      "Carry curiosity and mental flexibility. Sound alert, responsive, and engaged.",
    opening:
      "Enter with an interesting, immediately understandable angle that gives the reader something to think with.",
    emotional:
      "Name emotional complexity without drowning in it. Give feelings language, distinctions, and perspective.",
    sentence:
      "Vary sentence length, use contrasts, and keep explanations modular. Make dense ideas easy to process.",
    warmth:
      "Warmth should feel conversational, light on its feet, and genuinely interested rather than overly solemn.",
    forbidden:
      "Avoid monotonous walls of prose, unnecessary repetition, and explanations that stay heavy for too long.",
    counterweight:
      "Legacy only: the Sagittarius side of the Gemini–Sagittarius axis adds direction and larger meaning.",
  },

  cancer: {
    rhythm:
      "Attuned, intimate, protective, and emotionally intelligent. Speak with care without becoming vague or overly soft.",
    presence:
      "Carry quiet authority with emotional awareness. Make the reader feel understood without making the reading about validation.",
    opening:
      "Enter personally and attentively. Establish safety while still giving the answer.",
    emotional:
      "Treat emotional material as real information. Name what is tender without exposing it harshly or overexplaining it.",
    sentence:
      "Use clear language with enough softness around difficult truths to keep them receivable.",
    warmth:
      "Warmth should feel personal, protective, and sincere.",
    forbidden:
      "Avoid cold mechanical language, emotional dismissal, and detached phrasing that makes the person feel observed rather than addressed.",
    counterweight:
      "Legacy only: the Capricorn side of the Cancer–Capricorn axis adds structure and long-view stability.",
  },

  leo: {
    rhythm:
      "Warm, confident, substantial, and affirming. Make the reading feel important without exaggerating the evidence.",
    presence:
      "Carry visible confidence and generosity. Speak as though the reader is worth addressing directly and fully.",
    opening:
      "Enter with presence. Make the central point feel clear, consequential, and worth their attention.",
    emotional:
      "Handle emotion with dignity. Do not shame vulnerability or reduce the reader to the problem being discussed.",
    sentence:
      "Use strong, polished sentences with clear emphasis and memorable phrasing, without turning everything theatrical.",
    warmth:
      "Warmth should feel generous, encouraging, and personally affirming.",
    forbidden:
      "Avoid tepid, dismissive, belittling, or needlessly dramatic language. Never inflate certainty to create impact.",
    counterweight:
      "Legacy only: the Aquarius side of the Leo–Aquarius axis adds perspective and objectivity.",
  },

  virgo: {
    rhythm:
      "Precise, organized, useful, and concrete. Make the reading easy to understand, verify, and act on without exposing unnecessary technical machinery.",
    presence:
      "Carry competence and attentiveness. Sound like every sentence has a job.",
    opening:
      "Enter with the specific issue and the clearest useful conclusion.",
    emotional:
      "Handle emotion through clarity and practical understanding. Name the feeling without turning it into a vague abstraction.",
    sentence:
      "Use structured, exact language, clean sequencing, and specific behavioral meaning. Keep technical astrology out of user-facing prose unless requested.",
    warmth:
      "Warmth should feel thoughtful and useful: care shown through precision, attention, and practical help.",
    forbidden:
      "Avoid vague generalizations, hand-waving, clutter, needless mystification, and technical detail that does not help the user understand the reading.",
    counterweight:
      "Legacy only: the Pisces side of the Virgo–Pisces axis adds acceptance, compassion, and room for what cannot be controlled.",
  },

  libra: {
    rhythm:
      "Measured, composed, relationally aware, and clear. Present the conclusion with balance without getting trapped in endless weighing.",
    presence:
      "Carry calm authority and social intelligence. Sound fair without becoming indecisive.",
    opening:
      "Enter gracefully and establish the central verdict without creating unnecessary friction.",
    emotional:
      "Handle emotion with perspective and fairness. Recognize multiple sides while still naming what matters most.",
    sentence:
      "Use balanced, cleanly structured sentences and explicit contrasts when they help clarify the decision.",
    warmth:
      "Warmth should feel considerate, respectful, and relationally intelligent.",
    forbidden:
      "Avoid combative escalation, sloppy one-sidedness, and endless qualification that prevents a conclusion.",
    counterweight:
      "Legacy only: the Aries side of the Aries–Libra axis adds decisiveness and self-directed movement.",
  },

  scorpio: {
    rhythm:
      "Deep, focused, psychologically honest, and highly distilled. Go beneath the surface without manufacturing darkness.",
    presence:
      "Carry intensity with control. Sound unafraid of difficult material, but never sensationalize it.",
    opening:
      "Enter at the real pressure point. Do not waste time circling what is already obvious.",
    emotional:
      "Handle emotion with depth and privacy. Name what is underneath without turning vulnerability into spectacle.",
    sentence:
      "Use compressed, high-value sentences. Favor depth over volume and precision over decoration.",
    warmth:
      "Warmth should feel loyal, private, and trustworthy rather than cheerful for its own sake.",
    forbidden:
      "Avoid superficial reassurance, generic positivity, emotional spectacle, and corporate-softened language.",
    counterweight:
      "Legacy only: the Taurus side of the Taurus–Scorpio axis adds simplicity, steadiness, and ease.",
  },

  sagittarius: {
    rhythm:
      "Candid, expansive, directional, and perspective-shifting. Connect the immediate issue to the larger meaning without losing the concrete point.",
    presence:
      "Carry openness and forward direction. Sound like the reading is going somewhere.",
    opening:
      "Enter with the larger point quickly, then connect the details back to it.",
    emotional:
      "Handle emotion by helping the reader understand what it means and where it is leading, without minimizing the feeling itself.",
    sentence:
      "Use clear, energetic language, decisive synthesis, and occasional broader framing. Do not drown the reader in micro-analysis.",
    warmth:
      "Warmth should feel optimistic, candid, spacious, and encouraging.",
    forbidden:
      "Avoid tedious overqualification, fear-based caution, endless micro-detail, and conclusions that never commit to a direction.",
    counterweight:
      "Legacy only: the Gemini side of the Gemini–Sagittarius axis adds specificity, curiosity, and attention to the immediate facts.",
  },

  capricorn: {
    rhythm:
      "Structured, composed, practical, and strategically grounded. Make the reading feel durable, useful, and reality-based.",
    presence:
      "Carry calm authority. Sound capable of holding complexity without dramatizing it.",
    opening:
      "Enter with the structural reality: what matters, what is changing, and what can actually be done.",
    emotional:
      "Handle emotion respectfully but without overprocessing it. Give feeling a stable container and a practical next step when appropriate.",
    sentence:
      "Use orderly, disciplined sentences with clear hierarchy and minimal wasted language.",
    warmth:
      "Warmth should feel dependable, respectful, and quietly supportive rather than overtly sentimental.",
    forbidden:
      "Avoid emotional coddling, fatalistic severity, vague inspiration, and advice that cannot be translated into real life.",
    counterweight:
      "Legacy only: the Cancer side of the Cancer–Capricorn axis adds care, softness, and emotional protection.",
  },

  aquarius: {
    rhythm:
      "Clear, spacious, objective, and unconventional. Give the reader enough distance to see the pattern differently without sounding detached from them.",
    presence:
      "Carry independence and perspective. Sound intellectually free without becoming emotionally remote.",
    opening:
      "Enter from the angle that clarifies the whole pattern, especially when the obvious framing is too narrow.",
    emotional:
      "Handle emotion without overidentifying with it. Give the feeling context while still treating it as personally meaningful.",
    sentence:
      "Use clean, conceptually sharp language and fresh framing. Avoid generic horoscope phrasing.",
    warmth:
      "Warmth should feel respectful, nonjudgmental, and freeing rather than conventionally sentimental.",
    forbidden:
      "Avoid copy-paste astrology language, emotional detachment, forced normalcy, and talking down to the reader from an intellectual distance.",
    counterweight:
      "Legacy only: the Leo side of the Leo–Aquarius axis adds warmth, personal presence, and heart.",
  },

  pisces: {
    rhythm:
      "Intuitive, compassionate, spacious, and meaning-rich. Let the reading breathe while keeping every conclusion anchored to what the engine already resolved.",
    presence:
      "Carry softness without vagueness. Sound receptive, perceptive, and emotionally spacious.",
    opening:
      "Enter gently but clearly, allowing the central truth to land without unnecessary force.",
    emotional:
      "Handle emotion with compassion, nuance, and room for ambiguity where the evidence genuinely leaves ambiguity.",
    sentence:
      "Use flowing but controlled language, precise metaphor when useful, and enough structure that the meaning never dissolves.",
    warmth:
      "Warmth should feel compassionate, accepting, and humane.",
    forbidden:
      "Avoid rigid checklist delivery, empty mysticism, blurry conclusions, and softness that weakens a conclusion the evidence already supports.",
    counterweight:
      "Legacy only: the Virgo side of the Virgo–Pisces axis adds grounding, specificity, and practical next steps.",
  },
};

export const DEFAULT_SIGN_VOICE: SignVoice = {
  rhythm:
    "Clear, direct, supportive, and grounded. Make the reading easy to understand without changing the certainty established by the astrology.",
  presence:
    "Carry calm, capable authority.",
  opening:
    "Lead with the core answer.",
  emotional:
    "Treat emotion respectfully and proportionately.",
  sentence:
    "Use clean, readable sentences and concrete language.",
  warmth:
    "Keep the tone human, respectful, and supportive.",
  forbidden:
    "Avoid vague generalizations, unearned reassurance, needless technical language, and manufactured certainty.",
  counterweight:
    "Legacy only: preserve balance without adding new interpretive content.",
};

export function getSignVoice(sign: string | undefined): SignVoice {
  if (!sign) return DEFAULT_SIGN_VOICE;
  return SIGN_VOICE[sign.toLowerCase()] ?? DEFAULT_SIGN_VOICE;
}

// ============================================================
// COMPATIBILITY AXIS
//
// This is the MAIN routing mechanism.
// The natal anchor sign identifies the axis partner whose communication
// energy becomes AstroPro's primary voice for this reading.
// ============================================================

export const COMPATIBILITY_AXIS: Record<string, string> = {
  aries: "libra",
  libra: "aries",
  taurus: "scorpio",
  scorpio: "taurus",
  gemini: "sagittarius",
  sagittarius: "gemini",
  cancer: "capricorn",
  capricorn: "cancer",
  leo: "aquarius",
  aquarius: "leo",
  virgo: "pisces",
  pisces: "virgo",
};

export function getCompatibleSign(sign: string | undefined): string | null {
  if (!sign) return null;
  return COMPATIBILITY_AXIS[sign.toLowerCase()] ?? null;
}

// ============================================================
// PLACEMENT DOMAINS
//
// Kept as a public export in case other files already import it.
// These now describe subordinate PERSONAL CALIBRATION lanes only.
// ============================================================

export const PLACEMENT_DOMAIN: Record<string, string> = {
  sun: "overall presence and how identity-level directives land",
  moon: "emotional handling and sensitivity",
  rising: "opening energy and first-contact style",
  mercury: "sentence rhythm, explanation density, and directness",
  venus: "warmth, rapport, reassurance, and closing tone",
};

// ============================================================
// TOPIC → VOICE ANCHOR
//
// House anchors are preferred when houseSigns are supplied.
// Placement/angle fallbacks keep this file backward-friendly when the
// engine currently passes only the natal planet/angle list.
// ============================================================

type AnchorCandidate =
  | { kind: "house"; house: number; label: string }
  | { kind: "placement"; name: string; label: string };

const ANCHOR_BY_TOPIC: Record<VoiceTopic, AnchorCandidate[]> = {
  love: [
    { kind: "house", house: 7, label: "7th house" },
    { kind: "placement", name: "Descendant", label: "Descendant" },
    { kind: "placement", name: "Venus", label: "Venus" },
    { kind: "house", house: 5, label: "5th house" },
    { kind: "placement", name: "Moon", label: "Moon" },
    { kind: "house", house: 8, label: "8th house" },
    { kind: "placement", name: "Mars", label: "Mars" },
  ],

  career: [
    { kind: "house", house: 10, label: "10th house" },
    { kind: "placement", name: "Midheaven", label: "Midheaven" },
    { kind: "placement", name: "Saturn", label: "Saturn" },
    { kind: "placement", name: "Sun", label: "Sun" },
    { kind: "house", house: 6, label: "6th house" },
    { kind: "house", house: 2, label: "2nd house" },
    { kind: "placement", name: "Mars", label: "Mars" },
  ],

  money: [
    { kind: "house", house: 2, label: "2nd house" },
    { kind: "placement", name: "Venus", label: "Venus" },
    { kind: "house", house: 8, label: "8th house" },
    { kind: "placement", name: "Jupiter", label: "Jupiter" },
    { kind: "placement", name: "Saturn", label: "Saturn" },
    { kind: "house", house: 10, label: "10th house" },
    { kind: "placement", name: "Midheaven", label: "Midheaven" },
    { kind: "house", house: 11, label: "11th house" },
  ],

  general: [
    { kind: "placement", name: "Ascendant", label: "Ascendant" },
    { kind: "placement", name: "Mercury", label: "Mercury" },
    { kind: "placement", name: "Moon", label: "Moon" },
    { kind: "placement", name: "Sun", label: "Sun" },
    { kind: "house", house: 1, label: "1st house" },
    { kind: "placement", name: "Midheaven", label: "Midheaven" },
  ],
};

interface VoiceAnchor {
  kind: "house" | "placement";
  label: string;
  sign: string;
  placementName?: string;
  house?: number;
}

function normalizeTopic(topic: string): VoiceTopic {
  if (topic === "love" || topic === "career" || topic === "money") return topic;
  return "general";
}

function normalizeChart(input: VoiceChart | VoicePlanet[]): VoiceChart {
  return Array.isArray(input) ? { planets: input } : input;
}

function findPlacementSign(planets: VoicePlanet[], name: string): string | undefined {
  return planets.find((p) => p.name === name)?.sign;
}

function resolveVoiceAnchor(
  topic: VoiceTopic,
  chart: VoiceChart
): VoiceAnchor | null {
  const candidates = ANCHOR_BY_TOPIC[topic];

  for (const candidate of candidates) {
    if (candidate.kind === "house") {
      const sign = chart.houseSigns?.[candidate.house];
      if (sign) {
        return {
          kind: "house",
          label: candidate.label,
          sign,
          house: candidate.house,
        };
      }
      continue;
    }

    const sign = findPlacementSign(chart.planets, candidate.name);
    if (sign) {
      return {
        kind: "placement",
        label: candidate.label,
        sign,
        placementName: candidate.name,
      };
    }
  }

  return null;
}

// ============================================================
// PERSONAL CALIBRATION
//
// Primary voice is already established by the topic-compatible anchor.
// These placements are ONLY subtle lane adjustments.
//
// Each calibration uses the placement's OWN natal sign to determine the
// compatible sign, then takes only the relevant delivery dimension from
// that compatible sign. It never creates another full voice.
// ============================================================

const PERSONAL_CALIBRATION: Array<{
  placementName: string;
  label: string;
  lane: CalibrationLane;
}> = [
  { placementName: "Sun", label: "Sun", lane: "presence" },
  { placementName: "Moon", label: "Moon", lane: "emotional" },
  { placementName: "Ascendant", label: "Rising", lane: "opening" },
  { placementName: "Mercury", label: "Mercury", lane: "sentence" },
  { placementName: "Venus", label: "Venus", lane: "warmth" },
];

function laneLabel(lane: CalibrationLane): string {
  switch (lane) {
    case "presence":
      return "presence";
    case "opening":
      return "opening";
    case "emotional":
      return "emotional handling";
    case "sentence":
      return "sentence rhythm";
    case "warmth":
      return "warmth";
  }
}

function buildPersonalCalibrationLines(
  anchor: VoiceAnchor | null,
  chart: VoiceChart
): string[] {
  const lines: string[] = [];

  for (const item of PERSONAL_CALIBRATION) {
    if (
      anchor?.kind === "placement" &&
      anchor.placementName === item.placementName
    ) {
      continue;
    }

    const natalSign = findPlacementSign(chart.planets, item.placementName);
    if (!natalSign) continue;

    const compatibleSign = getCompatibleSign(natalSign);
    if (!compatibleSign) continue;

    const compatibleVoice = getSignVoice(compatibleSign);
    const instruction = compatibleVoice[item.lane];

    lines.push(
      `${item.label} in ${natalSign} → ${compatibleSign} compatibility adjusts ${laneLabel(
        item.lane
      )}: ${instruction}`
    );
  }

  return lines;
}

// ============================================================
// FULL PIPELINE
//
// TOPIC
//   → resolve topic-relevant VOICE ANCHOR
//   → anchor sign resolves COMPATIBLE SIGN
//   → compatible sign establishes ONE PRIMARY VOICE
//   → other core placements provide LIGHT PERSONAL CALIBRATION
//   → completed voice governs the FULL READING
//
// Compatibility changes HOW AstroPro communicates.
// It never changes WHAT the astrology concluded.
// ============================================================

export function buildVoiceCalibrationBlock(
  topicInput: string,
  chartInput: VoiceChart | VoicePlanet[]
): string {
  const topic = normalizeTopic(topicInput);
  const chart = normalizeChart(chartInput);
  const anchor = resolveVoiceAnchor(topic, chart);

  if (!anchor) {
    const calibrationLines = buildPersonalCalibrationLines(null, chart);

    const parts = [
      "",
      "VOICE CALIBRATION — topic-compatible delivery for the full reading.",
      `TOPIC: ${topic.toUpperCase()}`,
      "",
      "COMPATIBLE SIGN: unresolved — no usable topic anchor was available.",
      `PRIMARY VOICE: ${DEFAULT_SIGN_VOICE.rhythm}`,
      `Avoid: ${DEFAULT_SIGN_VOICE.forbidden}`,
      "",
      "VOICE ANCHOR: none available; use the neutral primary voice.",
    ];

    if (calibrationLines.length > 0) {
      parts.push(
        "",
        "PERSONAL CALIBRATION — light adjustments only; these never replace the primary voice:",
        ...calibrationLines
      );
    }

    parts.push(
      "",
      "FULL READING RULE: Keep one coherent voice from The Prediction through Bottom Line. Personal calibration may adjust delivery dimensions, but must never create section-by-section voice changes.",
      "VOICE BOUNDARY: This changes HOW the resolved reading is communicated. It must never change the astrology, confidence, timing, prediction, or evidence.",
      ""
    );

    return parts.join("\n");
  }

  const compatibleSign = getCompatibleSign(anchor.sign) ?? anchor.sign;
  const primaryVoice = getSignVoice(compatibleSign);
  const calibrationLines = buildPersonalCalibrationLines(anchor, chart);

  const parts: string[] = [
    "",
    "VOICE CALIBRATION — topic-compatible delivery for the full reading.",
    `TOPIC: ${topic.toUpperCase()}`,
    "",
    `COMPATIBLE SIGN: ${compatibleSign} — use this communication energy consistently across the reading.`,
    `PRIMARY VOICE: ${primaryVoice.rhythm}`,
    `Primary presence: ${primaryVoice.presence}`,
    `Avoid: ${primaryVoice.forbidden}`,
    "",
    `VOICE ANCHOR: ${anchor.label} in ${anchor.sign}. This anchor selected the compatible sign; do not mention the anchor or compatibility framework to the user.`,
  ];

  if (calibrationLines.length > 0) {
    parts.push(
      "",
      "PERSONAL CALIBRATION — subordinate adjustments only; none may introduce a competing primary voice:",
      ...calibrationLines
    );
  }

  parts.push(
    "",
    "FULL READING RULE: Keep this one primary voice active from The Prediction through Bottom Line. Do not change personalities by section. Personal calibration only modifies opening, emotional handling, sentence rhythm, presence, or warmth inside the same primary voice.",
    "VOICE BOUNDARY: SignVoice controls delivery only. It must never alter the resolved astrology, evidence hierarchy, confidence, timing, prediction, or directive.",
    ""
  );

  return parts.join("\n");
}
