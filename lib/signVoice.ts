export interface SignVoice {
  rhythm: string;
  counterweight: string;
  forbidden: string;
}

// Each sign's polar opposite — its natural completion, the other end of its axis.
// The counterweight beat borrows this sign's approach: not an outside voice,
// but the person's own missing half speaking.
const OPPOSITE_SIGN: Record<string, string> = {
  Aries: "Libra", Libra: "Aries",
  Taurus: "Scorpio", Scorpio: "Taurus",
  Gemini: "Sagittarius", Sagittarius: "Gemini",
  Cancer: "Capricorn", Capricorn: "Cancer",
  Leo: "Aquarius", Aquarius: "Leo",
  Virgo: "Pisces", Pisces: "Virgo",
};

export const SIGN_VOICE: Record<string, SignVoice> = {
  aries: {
    rhythm: "Direct, rapid, and combative. Lead with the core conclusion. Short, heavy, declarative sentences.",
    counterweight: "Offer the Libra perspective they under-see: not everything is a wall to break through — some things open when you pause, consider the other side, and move with rather than against.",
    forbidden: "Never use tentative build-ups, academic preambles, or soft, comforting validations. Strip all fluff.",
  },
  taurus: {
    rhythm: "Grounded, unhurried, and dense. Use concrete, heavy sensory language and material-world concepts.",
    counterweight: "Offer the Scorpio perspective they under-see: comfort held too tightly becomes a cage — some things are meant to change, and letting go can be its own kind of security.",
    forbidden: "Never use hyperactive concept-jumping or purely abstract, ungrounded esoteric spiritualizing.",
  },
  gemini: {
    rhythm: "Quick, dualistic, and varied. Shift angles rapidly. Use sharp, intellectual contrasts and dialectical tension.",
    counterweight: "Offer the Sagittarius perspective they under-see: analysis can become a place to hide — sometimes the truest move is to commit to the bigger meaning and simply begin.",
    forbidden: "Never deliver a singular, heavy, monotonous wall of prose. Keep the rhythm kinetic and multi-faceted.",
  },
  cancer: {
    rhythm: "Precise but intimate. Quiet, heavy authority. Use language that addresses localized roots and protective armor.",
    counterweight: "Offer the Capricorn perspective they under-see: the feeling they're protecting is safe — steady structure and a patient long view can hold them as gently as any shell.",
    forbidden: "Never use cold, purely robotic engineering terminology. The tone must feel like a quiet, inescapable truth.",
  },
  leo: {
    rhythm: "Bold, absolute, and commanding. Speak with unwavering structural authority. Use high-stakes, dramatic framings.",
    counterweight: "Offer the Aquarius perspective they under-see: their worth isn't on trial — stepping back to see the wider picture, beyond how it reflects on them, is where real freedom lives.",
    forbidden: "Never speak with passive, tepid, or secondary-status language. Do not diminish the scale of the diagnostic.",
  },
  virgo: {
    rhythm: "Surgical, hyper-specific, and analytical. Name exact degrees, houses, and precise behavioral mechanics.",
    counterweight: "Offer the Pisces perspective they under-see: not everything can be perfected or solved — some things are meant to be accepted, felt, and forgiven, starting with themselves.",
    forbidden: "Never use vague generalizations, hand-waving predictions, or unquantifiable mystical metaphors.",
  },
  libra: {
    rhythm: "Measured, objective, and clear. Structural symmetry. Present truths as unyielding geometric balances.",
    counterweight: "Offer the Aries perspective they under-see: endless weighing is its own kind of avoidance — they're allowed to choose, to want, and to move without every voice's approval.",
    forbidden: "Never pick a side out of bias; state the structural verdict so cleanly that there is no room to negotiate.",
  },
  scorpio: {
    rhythm: "Deep, intense, and heavily compressed. Fewer words, massive psychological weight. Pure unfiltered exposure.",
    counterweight: "Offer the Taurus perspective they under-see: not everything needs to be guarded or decoded — some things are simple, safe, and okay to hold openly, with ease.",
    forbidden: "Never use superficial reassurances, generic positive affirmations, or polite, corporate-softened language.",
  },
  sagittarius: {
    rhythm: "Expansive, blunt, and unhedged. Large-scale structural framing. Direct, perspective-shifting delivery.",
    counterweight: "Offer the Gemini perspective they under-see: the grand vision is built from small present steps — the interesting thing right in front of them matters as much as the far horizon.",
    forbidden: "Never deliver tedious micro-step instructions or defensive, risk-averse, hyper-cautious warnings.",
  },
  capricorn: {
    rhythm: "Practical, cold, and heavily structured. Architectural reality. Focus entirely on material load-bearing capacity.",
    counterweight: "Offer the Cancer perspective they under-see: not every foundation is built by force — some things are held by softness, rest, and letting themselves be cared for, too.",
    forbidden: "Never offer emotional coddling or vague, un-executable spiritual advice. It must be a tactical reality check.",
  },
  aquarius: {
    rhythm: "Sharp, clinical, and completely unconventional. Detached overview. Present facts from a high, objective distance.",
    counterweight: "Offer the Leo perspective they under-see: detachment can quietly become distance — their own warmth, presence, and personal heart are gifts worth stepping into, not above.",
    forbidden: "Never use traditional, copy-paste horoscopic phrases or standard emotional-validation frameworks.",
  },
  pisces: {
    rhythm: "Intuitive, layered, and deep. Use precise structural metaphors that track the underlying porous, dissolving currents.",
    counterweight: "Offer the Virgo perspective they under-see: drifting can be a way to avoid the threshold — one small, concrete, grounded step is often the kindest thing they can do for themselves.",
    forbidden: "Never use rigid, superficial checklist language that ignores the underlying psychological matrix.",
  },
};

export const DEFAULT_SIGN_VOICE: SignVoice = {
  rhythm: "Clear, direct, still supportive and entirely grounded in the mechanical facts of the chart.",
  counterweight: "Offer the perspective their chart tends to under-see — the other end of their own axis — like a caring mentor showing them their missing half, always with warmth and a way forward.",
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
  const sisterSign = OPPOSITE_SIGN[sign];
  const sisterVoice = sisterSign ? getSignVoice(sisterSign) : voice;
  const domain = PLACEMENT_DOMAIN[placementKey] ?? "general tone";
  return [
    `${label} (${sign}) governs ${domain}:`,
    `  RHYTHM: ${voice.rhythm}`,
    `  COUNTERWEIGHT: ${voice.counterweight}`,
    `  COUNTERWEIGHT DELIVERY: When offering this balancing perspective, let the tone lean into their sister sign ${sisterSign}'s approach — ${sisterVoice.rhythm} This is not a separate voice; it's the other end of their own axis, their natural completion speaking.`,
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
    "\nVOICE CALIBRATION — DELIVERY, NOT CONTENT (use to shape rhythm and counterweight only — never name a placement as the reason for your tone, never say 'because you're a Pisces Moon' or similar). The COUNTERWEIGHT is where you gently offer the perspective they under-see — their sister sign's natural gift — delivered as their own missing half, never as correction:\n" +
    voiceBlocks.join("\n\n") +
    "\n"
  );
}