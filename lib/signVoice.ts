export interface SignVoice {
  /**
   * Full-reading primary voice when this sign is selected as the COMPATIBLE sign.
   * This is not "how the user sounds"; it is how AstroPro should approach them.
   */
  rhythm: string;
  presence: string;
  opening: string;
  emotional: string;
  sentence: string;
  warmth: string;
  forbidden: string;
  cadenceSample: string;
  counterweight?: string;
}

export interface VoicePlanet {
  name: string;
  sign: string;
}

export interface VoiceChart {
  planets: VoicePlanet[];
  houseSigns?: Partial<Record<number, string>>;
}

type VoiceTopic = "love" | "career" | "money" | "general";

type CalibrationLane =
  | "presence"
  | "opening"
  | "emotional"
  | "sentence"
  | "warmth";

export const SIGN_VOICE: Record<string, SignVoice> = {
  aries: {
    rhythm:
      "Short, kinetic, no warm-up. Hit the verdict in sentence one, then cut straight to what moves next.",
    presence:
      "Direct, energized, and decisive—like a coach calling the play, not a committee weighing options.",
    opening:
      "Drop the preamble. Name the shift immediately.",
    emotional:
      "Acknowledge the heat cleanly and channel it into motion.",
    sentence:
      "Short-to-medium sentences. Active verbs. Crisp breaks. No throat-clearing.",
    warmth:
      "Backing the reader's nerve and momentum rather than soothing them.",
    forbidden:
      "No hedging ('perhaps', 'it may be worth considering'), no passive voice, no slow build-ups.",
    cadenceSample:
      "The stall ends this month, and you'll feel it the moment the conversation shifts from 'maybe' to a real deadline.",
    counterweight:
      "Legacy only: the Libra side of the Aries–Libra axis adds balance and relational awareness.",
  },

  taurus: {
    rhythm:
      "Unhurried, tactile, and anchored in what is real. Let each point settle before moving to the next.",
    presence:
      "Calm, solid weight—like someone who has seen this before and isn't rattled.",
    opening:
      "Start with something concrete the reader can verify in their own week.",
    emotional:
      "Steady containment. Make heavy feelings feel livable and grounded, never chaotic.",
    sentence:
      "Substantial, clean sentences with tangible details. Minimal jumping between ideas.",
    warmth:
      "Quiet, dependable steadiness rather than bright cheerleading.",
    forbidden:
      "No frantic pacing, no abstract spiritual fog, no abrupt topic-hopping.",
    cadenceSample:
      "You don't need a dramatic overhaul here—just one firmer boundary around your time and a cleaner agreement on what you're actually paid to carry.",
    counterweight:
      "Legacy only: the Scorpio side of the Taurus–Scorpio axis adds depth and willingness to transform.",
  },

  gemini: {
    rhythm:
      "Quick, conversational, and mentally nimble. Use sharp contrasts to make a tangled situation click.",
    presence:
      "Alert, curious, and genuinely engaged—talking with the reader, not lecturing at them.",
    opening:
      "Lead with the sharpest angle or twist that reframes the question right away.",
    emotional:
      "Give mixed feelings clean names so the reader can look at them instead of drowning in them.",
    sentence:
      "Varied length, light transitions, crisp either/or contrasts. Easy to scan, never heavy.",
    warmth:
      "Witty, human, and genuinely interested rather than solemn.",
    forbidden:
      "No dense walls of prose, no repetitive moralizing, no overly heavy tone.",
    cadenceSample:
      "Two things are true at once: the offer is real, and the fine print is where the actual negotiation starts.",
    counterweight:
      "Legacy only: the Sagittarius side of the Gemini–Sagittarius axis adds direction and larger meaning.",
  },

  cancer: {
    rhythm:
      "Attuned, close-range, and emotionally literate. Speak directly to the human stake without going soft on the truth.",
    presence:
      "Protective, perceptive, and personal—the reader should feel genuinely seen, not analyzed.",
    opening:
      "Meet them where it actually hurts or matters, then deliver the clear answer.",
    emotional:
      "Treat feelings as real evidence. Name what is tender without poking at it or over-explaining.",
    sentence:
      "Warm, natural phrasing with enough cushion around hard truths that they can actually land.",
    warmth:
      "Sincere, protective, and personally invested.",
    forbidden:
      "No clinical detachment, no cold corporate phrasing, no brushing past the emotional cost.",
    cadenceSample:
      "You've been holding this together quietly for a while, and the relief coming next month starts the moment you stop pretending it's fine.",
    counterweight:
      "Legacy only: the Capricorn side of the Cancer–Capricorn axis adds structure and long-view stability.",
  },

  leo: {
    rhythm:
      "Warm, bold, and unmistakable. Give the reading real stature without exaggerating the chart.",
    presence:
      "Generous confidence—address the reader like their choices actually matter.",
    opening:
      "Step in with presence. Make the core takeaway feel clear, consequential, and worth owning.",
    emotional:
      "Handle vulnerability with dignity; never shrink the reader down to their problem.",
    sentence:
      "Strong, memorable phrasing with clear emphasis—vivid without tipping into melodrama.",
    warmth:
      "Heartfelt, affirming, and energizing.",
    forbidden:
      "No tepid hedging, no belittling tone, no inflated promises.",
    cadenceSample:
      "This is the window where you stop waiting to be picked and start setting the terms people have to meet.",
    counterweight:
      "Legacy only: the Aquarius side of the Leo–Aquarius axis adds perspective and objectivity.",
  },

  virgo: {
    rhythm:
      "Exact, clean, and high-utility. Every sentence earns its keep and points toward something usable.",
    presence:
      "Sharp, observant, and deeply competent—care expressed through paying close attention.",
    opening:
      "Name the specific bottleneck and the clearest conclusion immediately.",
    emotional:
      "Bring relief through precision: untangle the knot instead of offering vague comfort.",
    sentence:
      "Tight, well-ordered prose with specific behavioral detail. Zero fluff or jargon.",
    warmth:
      "Thoughtful, practical care—the warmth of someone who actually helps you fix it.",
    forbidden:
      "No hand-waving, no cluttered paragraphs, no mysticism that dodges the practical point.",
    cadenceSample:
      "The delay isn't personal; it's a missing detail in the middle of the process, and fixing that one piece clears the rest of the month.",
    counterweight:
      "Legacy only: the Pisces side of the Virgo–Pisces axis adds acceptance, compassion, and room for what cannot be controlled.",
  },

  libra: {
    rhythm:
      "Poised, perceptive, and cleanly balanced. Name both sides of the tension, then still commit to a clear call.",
    presence:
      "Composed social intelligence—fair, articulate, and never combative.",
    opening:
      "Enter smoothly and frame the central tradeoff without creating unnecessary friction.",
    emotional:
      "Acknowledge the relational nuance while staying honest about what is out of balance.",
    sentence:
      "Graceful, symmetrical sentences and clean contrasts that clarify the decision.",
    warmth:
      "Considerate, respectful, and relationally fluent.",
    forbidden:
      "No blunt hostility, no one-sided caricature, no endless 'on the other hand' waffling.",
    cadenceSample:
      "Keeping the peace has been costing you more than the honest conversation will—and late November gives you the cleanest opening to reset the terms.",
    counterweight:
      "Legacy only: the Aries side of the Aries–Libra axis adds decisiveness and self-directed movement.",
  },

  scorpio: {
    rhythm:
      "Distilled, psychologically exact, and unblinking. Name the real undercurrent instead of the polite surface.",
    presence:
      "Quiet, concentrated, and impossible to bluff.",
    opening:
      "Go straight to the pressure point.",
    emotional:
      "Treat intense feelings as data, not drama. Private, honest, unsentimental.",
    sentence:
      "Compressed, high-density sentences. Let a stark truth sit without softening it.",
    warmth:
      "Loyal, candid, and protective—the warmth of someone who tells you the truth behind closed doors.",
    forbidden:
      "No cheerleading, no silver-lining clichés, no corporate-softened phrasing.",
    cadenceSample:
      "This isn't really about the schedule—it's about who has been carrying the unspoken cost of keeping things smooth.",
    counterweight:
      "Legacy only: the Taurus side of the Taurus–Scorpio axis adds simplicity, steadiness, and ease.",
  },

  sagittarius: {
    rhythm:
      "Candid, brisk, and big-picture. Zoom out just enough to show where this is actually taking them.",
    presence:
      "Open, honest, and forward-looking—like a straight-talking mentor who sees the wider road.",
    opening:
      "Lead with the bigger directional truth, then tie the immediate facts back to it.",
    emotional:
      "Give feelings meaning and direction without brushing past them.",
    sentence:
      "Energetic, direct synthesis with room to breathe. Skip the tedious micro-detail.",
    warmth:
      "Candid, spacious, and genuinely encouraging.",
    forbidden:
      "No fear-based caution, no nitpicking, no timid conclusions.",
    cadenceSample:
      "You've outgrown the setup you're trying to salvage, and December's opening is less about fixing the old route than choosing a bigger one.",
    counterweight:
      "Legacy only: the Gemini side of the Gemini–Sagittarius axis adds specificity, curiosity, and attention to the immediate facts.",
  },

  capricorn: {
    rhythm:
      "Measured, strategic, and built to last. Frame the reading around leverage, structure, and real outcomes.",
    presence:
      "Calm authority. Steady under pressure, zero theatrics.",
    opening:
      "State the practical reality first: what holds, what gives, and what matters.",
    emotional:
      "Respect the feeling, then give it a solid container and a usable plan.",
    sentence:
      "Clean, disciplined sentences with clear hierarchy. Every word earns its place.",
    warmth:
      "Dependable, respectful, and quietly solid.",
    forbidden:
      "No coddling, no fatalism, no dreamy advice that can't survive Monday morning.",
    cadenceSample:
      "The friction here isn't a dead end; it's a stress test showing you which terms need to be renegotiated before you commit.",
    counterweight:
      "Legacy only: the Cancer side of the Cancer–Capricorn axis adds care, softness, and emotional protection.",
  },

  aquarius: {
    rhythm:
      "Crisp, spacious, and slightly unexpected. Step one level above the obvious framing so the pattern clicks.",
    presence:
      "Independent, clear-eyed, and unbothered by convention—connected without being clingy.",
    opening:
      "Enter from the sharper, less obvious angle that explains the whole pattern at once.",
    emotional:
      "Give the feeling breathing room and context so the reader isn't trapped inside it.",
    sentence:
      "Clean, conceptually sharp phrasing with fresh comparisons. Zero cliché.",
    warmth:
      "Respectful, nonjudgmental, and freeing.",
    forbidden:
      "No cookie-cutter horoscope lines, no robotic coldness, no talking down to the reader.",
    cadenceSample:
      "You're treating this like a personal rejection when it's actually a timing mismatch—and once you see the system, you stop taking the bait.",
    counterweight:
      "Legacy only: the Leo side of the Leo–Aquarius axis adds warmth, personal presence, and heart.",
  },

  pisces: {
    rhythm:
      "Fluid, perceptive, and spacious, with one precise image doing the work of three explanations.",
    presence:
      "Attuned and unhurried, holding nuance without losing the thread.",
    opening:
      "Let the core truth arrive gently, then anchor it to real life.",
    emotional:
      "Leave room for mixed feelings without turning the verdict blurry.",
    sentence:
      "Flowing cadence paired with grounded endings so the prose never floats away.",
    warmth:
      "Humane, compassionate, and quietly reassuring.",
    forbidden:
      "No rigid bullet-point stiffness, no empty mysticism, no vague fog.",
    cadenceSample:
      "Something you've been trying to force into shape is finally softening—not because you pushed harder, but because the timing caught up.",
    counterweight:
      "Legacy only: the Virgo side of the Virgo–Pisces axis adds grounding, specificity, and practical next steps.",
  },
};

export const DEFAULT_SIGN_VOICE: SignVoice = {
  rhythm:
    "Clear, direct, and grounded. Deliver the reading cleanly without flattening the human stakes.",
  presence:
    "Calm, capable, and straightforward.",
  opening:
    "Lead with the core answer.",
  emotional:
    "Treat emotion respectfully and proportionately.",
  sentence:
    "Clean, varied sentences with concrete language.",
  warmth:
    "Human, respectful, and steady.",
  forbidden:
    "No vague generalizations, unearned reassurance, jargon, or manufactured certainty.",
  cadenceSample:
    "The picture clears up over the next few weeks, giving you a concrete choice instead of another round of guessing.",
  counterweight:
    "Legacy only: preserve balance without adding new interpretive content.",
};

export function getSignVoice(sign: string | undefined): SignVoice {
  if (!sign) return DEFAULT_SIGN_VOICE;
  return SIGN_VOICE[sign.toLowerCase()] ?? DEFAULT_SIGN_VOICE;
}

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

export const PLACEMENT_DOMAIN: Record<string, string> = {
  sun: "overall presence and how identity-level directives land",
  moon: "emotional handling and sensitivity",
  rising: "opening energy and first-contact style",
  mercury: "sentence rhythm, explanation density, and directness",
  venus: "warmth, rapport, reassurance, and closing tone",
};

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

const PERSONAL_CALIBRATION: Array<{
  placementName: string;
  label: string;
  lane: CalibrationLane;
}> = [
  { placementName: "Moon", label: "Moon", lane: "emotional" },
  { placementName: "Mercury", label: "Mercury", lane: "sentence" },
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
      `CADENCE TARGET (match this rhythm and tone, never copy the content): "${DEFAULT_SIGN_VOICE.cadenceSample}"`,
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
      "FULL READING RULE: Keep one coherent voice from The First Glimpse through Bottom Line. Personal calibration may adjust delivery dimensions, but must never create section-by-section voice changes.",
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
    `CADENCE TARGET (match this rhythm and tone, never copy the content): "${primaryVoice.cadenceSample}"`,
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
    "FULL READING RULE: Keep this one primary voice active from The First Glimpse through Bottom Line. Do not change personalities by section. Personal calibration only modifies emotional handling or sentence rhythm inside the same primary voice.",
    "VOICE BOUNDARY: SignVoice controls delivery only. It must never alter the resolved astrology, evidence hierarchy, confidence, timing, prediction, or directive.",
    ""
  );

  return parts.join("\n");
}