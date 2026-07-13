export interface SignVoice {
  rhythm: string;
  trigger: string;
  forbidden: string;
}

export const SIGN_VOICE: Record<string, SignVoice> = {
  aries: {
    rhythm: "Direct, rapid, and combative. Lead with the core conclusion. Short, heavy, declarative sentences.",
    trigger: "Challenge their impulse control. Frame reality as an immediate wall they must either break through or crash into.",
    forbidden: "Never use tentative build-ups, academic preambles, or soft, comforting validations. Strip all fluff.",
  },
  taurus: {
    rhythm: "Grounded, unhurried, and dense. Use concrete, heavy sensory language and material-world concepts.",
    trigger: "Target their stubborn resistance to change. Contrast temporary comfort against long-term stagnation.",
    forbidden: "Never use hyperactive concept-jumping or purely abstract, ungrounded esoteric spiritualizing.",
  },
  gemini: {
    rhythm: "Quick, dualistic, and varied. Shift angles rapidly. Use sharp, intellectual contrasts and dialectical tension.",
    trigger: "Expose their over-intellectualization loop. Call out how they use analysis to escape taking actual physical action.",
    forbidden: "Never deliver a singular, heavy, monotonous wall of prose. Keep the rhythm kinetic and multi-faceted.",
  },
  cancer: {
    rhythm: "Precise but intimate. Quiet, heavy authority. Use language that addresses localized roots and protective armor.",
    trigger: "Pierce the defensive shell directly. Address the hidden emotional weight they are currently hyper-protecting.",
    forbidden: "Never use cold, purely robotic engineering terminology. The tone must feel like a quiet, inescapable truth.",
  },
  leo: {
    rhythm: "Bold, absolute, and commanding. Speak with unwavering structural authority. Use high-stakes, dramatic framings.",
    trigger: "Target their core identity and sovereignty. Frame the current bottleneck as a compromise of their actual stature.",
    forbidden: "Never speak with passive, tepid, or secondary-status language. Do not diminish the scale of the diagnostic.",
  },
  virgo: {
    rhythm: "Surgical, hyper-specific, and analytical. Name exact degrees, houses, and precise behavioral mechanics.",
    trigger: "Weaponize their obsession with error. Show them the mathematical inevitability of their current self-sabotage loop.",
    forbidden: "Never use vague generalizations, hand-waving predictions, or unquantifiable mystical metaphors.",
  },
  libra: {
    rhythm: "Measured, objective, and clear. Structural symmetry. Present truths as unyielding geometric balances.",
    trigger: "Confront their paralyzing hesitation. Strip away their polite justifications and force them to look at the raw discrepancy.",
    forbidden: "Never pick a side out of bias; state the structural verdict so cleanly that there is no room to negotiate.",
  },
  scorpio: {
    rhythm: "Deep, intense, and heavily compressed. Fewer words, massive psychological weight. Pure unfiltered exposure.",
    trigger: "Unearth the hidden power dynamic, taboo truth, or survival mechanism they are actively keeping in the dark.",
    forbidden: "Never use superficial reassurances, generic positive affirmations, or polite, corporate-softened language.",
  },
  sagittarius: {
    rhythm: "Expansive, blunt, and unhedged. Large-scale structural framing. Direct, perspective-shifting delivery.",
    trigger: "Confront their ideological denial. Call out where they are running from real-world details in search of a broad fantasy.",
    forbidden: "Never deliver tedious micro-step instructions or defensive, risk-averse, hyper-cautious warnings.",
  },
  capricorn: {
    rhythm: "Practical, cold, and heavily structured. Architectural reality. Focus entirely on material load-bearing capacity.",
    trigger: "Audit their operational overhead. Expose where they are building on soft ground or tolerating structurally broken dynamics.",
    forbidden: "Never offer emotional coddling or vague, un-executable spiritual advice. It must be a tactical reality check.",
  },
  aquarius: {
    rhythm: "Sharp, clinical, and completely unconventional. Detached overview. Present facts from a high, objective distance.",
    trigger: "Deconstruct their rationalizations. Challenge their need to feel detached or different from the actual messy friction.",
    forbidden: "Never use traditional, copy-paste horoscopic phrases or standard emotional-validation frameworks.",
  },
  pisces: {
    rhythm: "Intuitive, layered, and deep. Use precise structural metaphors that track the underlying porous, dissolving currents.",
    trigger: "Dissolve their illusions. Force them to confront exactly where they are drifting to avoid a hard reality threshold.",
    forbidden: "Never use rigid, superficial checklist language that ignores the underlying psychological matrix.",
  },
};

export const DEFAULT_SIGN_VOICE: SignVoice = {
  rhythm: "Clear, direct, still supportive and entirely grounded in the mechanical facts of the chart.",
  trigger: "Confront the pattern in the chart data directly like a support astrologer, without softening.",
  forbidden: "Never use vague generalizations or unearned reassurance.",
};

export function getSignVoice(sign: string | undefined): SignVoice {
  if (!sign) return DEFAULT_SIGN_VOICE;
  return SIGN_VOICE[sign.toLowerCase()] ?? DEFAULT_SIGN_VOICE;
}

export const PLACEMENT_DOMAIN: Record<string, string> = {
  sun: "core identity and how directives land with their baseline confidence",
  moon: "emotional register — how much feeling-language versus blunt fact is true to them",
  rising: "opening energy — how the reading should walk in the room",
  mercury: "sentence rhythm and how directly they want to be told things",
  venus: "what comfort and ease sound like to them, specifically in the warm closing answer",
};

export function buildPlacementVoiceBlock(
  placementKey: string,
  label: string,
  sign: string | undefined
): string {
  if (!sign) return "";
  const voice = getSignVoice(sign);
  const domain = PLACEMENT_DOMAIN[placementKey] ?? "general tone";
  return [
    `${label} (${sign}) governs ${domain}:`,
    `  RHYTHM: ${voice.rhythm}`,
    `  TRIGGER: ${voice.trigger}`,
    `  FORBIDDEN: ${voice.forbidden}`,
  ].join("\n");
}

export function buildVoiceCalibrationBlock(
  planets: Array<{ name: string; sign: string }>
): string {
  const find = (name: string) => planets.find((p) => p.name === name)?.sign;

  const voiceBlocks = [
    buildPlacementVoiceBlock("sun", "Sun", find("Sun")),
    buildPlacementVoiceBlock("moon", "Moon", find("Moon")),
    buildPlacementVoiceBlock("rising", "Rising", find("Ascendant")),
    buildPlacementVoiceBlock("mercury", "Mercury", find("Mercury")),
    buildPlacementVoiceBlock("venus", "Venus", find("Venus")),
  ].filter(Boolean);

  if (voiceBlocks.length === 0) return "";

  return (
    "\nVOICE CALIBRATION — DELIVERY, NOT CONTENT (use to shape rhythm and trigger only — never name a placement as the reason for your tone, never say 'because you're a Pisces Moon' or similar):\n" +
    voiceBlocks.join("\n\n") +
    "\n"
  );
}
