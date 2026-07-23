// lib/crisisDetection.ts
//
// LAYER 1 of a two-layer safety net: fast, deterministic, runs before any model
// call so it costs nothing and can never be talked out of firing.
// LAYER 2 is the model's contextual judgement, instructed in each route prompt.
// Neither layer replaces the other.
//
// ── THE CENTRAL DESIGN DECISION ──────────────────────────────────────────────
// The tiers do NOT all do the same thing:
//
//   CRITICAL → block the reading, emergency response
//   HIGH     → block the reading, crisis response
//   MEDIUM   → GIVE THE FULL READING, and add care alongside it
//   LOW/NONE → normal reading
//
// Medium not blocking is deliberate and important. "I'm hopeless", "I feel
// trapped", "I can't go on" describe a hard season, not an emergency. Someone
// in a brutal month deserves the real reading — the answer, the window, the
// directive. Intercepting them with a hotline would break the product AND fail
// the person, because a thoughtful reading is what actually helps there.
// Reserve blocking for danger, not for sadness.
//
// ── KNOWN LIMITATIONS (do not pretend otherwise) ─────────────────────────────
// - Third-party disclosure ("my friend wants to die") is scored as if it were
//   first-person. Over-caring about someone else's crisis is an acceptable cost.
// - Negation is handled only for explicit, narrow phrasings, and it DOWNGRADES
//   rather than dismisses (see NEGATION_PATTERNS). Naive negation stripping is
//   how you get a dangerous false negative on "I can't say I don't want to die".
// - Sarcasm, song lyrics, and quoted fiction will occasionally trip this. That
//   is the correct direction to fail in.

export type RiskLevel = "critical" | "high" | "medium" | "low" | "none";

export type RiskCategory =
  | "suicide"
  | "self_harm"
  | "violence"
  | "medical"
  | "abuse"
  | "danger"
  | "sexual_assault"
  | "distress"
  | "psychosis";

export type RiskAction = "block_emergency" | "block_crisis" | "support" | "proceed";

export interface RiskAssessment {
  level: RiskLevel;
  action: RiskAction;
  categories: RiskCategory[];
  confidence: number;
  /** Category/level labels only — never the person's words. Safe to log. */
  signals: string[];
  escalated: boolean;
}

interface Rule {
  category: RiskCategory;
  level: Exclude<RiskLevel, "none">;
  patterns: RegExp[];
  /** Whether time/means proximity can escalate this rule one tier. */
  escalatable?: boolean;
}

// ── Modifiers ────────────────────────────────────────────────────────────────
// Intent alone is one signal. Intent + a timeframe, or intent + a means, is a
// materially different situation and escalates a tier.

const TIME_MARKERS =
  /\b(tonight|today|right now|rn|tomorrow|this weekend|after work|in an hour|within the hour|soon|when i get home|before (morning|sunrise)|by (morning|tonight))\b/i;

const MEANS_MARKERS =
  /\b(gun|firearm|pistol|rifle|bullets?|pills?|overdose|od'?d?|rope|noose|bridge|knife|blade|razor|wrists?|gas|carbon monoxide|bleach|poison|jump(ing)? off|hang(ing)? myself)\b/i;

const PLAN_MARKERS =
  /\b(i have a plan|i've planned|planned it out|worked out how|figured out how|wrote a note|left a note|goodbye letter|my will)\b/i;

// Narrow, explicit negations. These DOWNGRADE one tier — never to "none".
const NEGATION_PATTERNS = [
  /\b(would|will) never\b[^.!?]{0,40}\b(kill|hurt|harm)\b/i,
  /\b(don'?t|do not|not) (want|going|gonna|planning) to\b[^.!?]{0,30}\b(kill|die|hurt|harm|end)\b/i,
  /\bi'?m not (suicidal|going to)\b/i,
];

// ── Rules ────────────────────────────────────────────────────────────────────

const RULES: Rule[] = [
  // ── CRITICAL — act already taken, or imminent and specific ────────────────
  {
    category: "suicide",
    level: "critical",
    patterns: [
      /\bi (took|swallowed) (a bunch of|all (the|my)|too many) (pills|meds)/i,
      /\bi (overdosed|od'?d)\b/i,
      /\bi (hung|hanged) myself\b/i,
      /\bi cut my wrists?\b/i,
      /\bi jumped\b/i,
      /\bi (shot|stabbed) myself\b/i,
      /\bi'?m (ending it|doing it) (tonight|today|now|right now)\b/i,
      /\bthis is (my )?goodbye\b/i,
      /\btonight('?s| is) the night\b/i,
      /\bi'?m about to (kill myself|end (it|my life))\b/i,
      /\bi swallowed poison\b/i,
    ],
  },
  {
    category: "medical",
    level: "critical",
    patterns: [
      /\bi can'?t breathe\b/i,
      /\bchest pain(s)?\b/i,
      /\b(having|think i'?m having) a (heart attack|stroke)\b/i,
      /\bstroke symptoms\b/i,
      /\bsevere allergic reaction\b/i,
      /\banaphyla(xis|ctic)\b/i,
      /\bi'?m bleeding (heavily|badly|a lot)\b/i,
      /\bwon'?t stop bleeding\b/i,
      /\b(passed out|unconscious|unresponsive)\b/i,
      /\bface (is )?drooping\b/i,
    ],
  },
  {
    category: "danger",
    level: "critical",
    patterns: [
      /\bactive shooter\b/i,
      /\bsomeone (has|pulled) a gun\b/i,
      /\bbroke into my (house|home|apartment)\b/i,
      /\bi'?m being robbed\b/i,
      /\bkidnapp?ed my (child|kid|son|daughter|baby)\b/i,
      /\bsomeone is following me\b/i,
      /\bi'?ve been assaulted\b/i,
      /\bhe'?s going to kill me\b/i,
    ],
  },
  {
    category: "violence",
    level: "critical",
    patterns: [
      /\bi'?m (going to|gonna) (kill|shoot|stab)\b/i,
      /\bi'?m planning an attack\b/i,
      /\bshoot up (the|a|my)\b/i,
    ],
  },

  // ── HIGH — clear intent or ideation, no completed act ─────────────────────
  {
    category: "suicide",
    level: "high",
    escalatable: true,
    patterns: [
      /\bkill(ing)? my ?self\b/i,
      /\bend(ing)? (my life|it all)\b/i,
      /\btake my own life\b/i,
      /\b(commit|committing) suicide\b/i,
      /\bsuicidal\b/i,
      /\bwant to die\b/i,
      /\bwant to be dead\b/i,
      /\bdon'?t want to (live|be alive) (any ?more)?\b/i,
      /\bbetter off (dead|without me)\b/i,
      /\bwould be (happier|better) (if i (disappeared|was gone|wasn'?t here))\b/i,
      /\bkms\b/i,
    ],
  },
  {
    category: "self_harm",
    level: "high",
    escalatable: true,
    patterns: [
      /\b(cutting|burning|hurting|harming) my ?self\b/i,
      /\bi (cut|burned) my ?self\b/i,
      /\bself[-\s]?harm(ing)?\b/i,
      /\bwant to hurt my ?self\b/i,
      // Stated fear of self-harm sits closer to intent than to distress.
      /\bafraid i'?ll hurt my ?self\b/i,
      /\bscared i (might|will) hurt my ?self\b/i,
    ],
  },
  {
    category: "violence",
    level: "high",
    escalatable: true,
    patterns: [
      /\bwant to (kill|shoot|stab) (him|her|them|someone|somebody)\b/i,
      /\bcan'?t stop thinking about hurting (people|someone|them)\b/i,
      /\b(hurt|harm) (him|her|them|someone) (bad|badly|seriously|for real)\b/i,
      /\bmake (him|her|them) pay with (his|her|their) life\b/i,
    ],
  },
  {
    category: "abuse",
    level: "high",
    patterns: [
      /\b(my|his|her) (partner|husband|wife|boyfriend|girlfriend|ex) (hit|beat|beats|hits|punched|strangled|choked) me\b/i,
      /\bi'?m being (abused|beaten)\b/i,
      /\bafraid to go home\b/i,
      /\bthey'?re stalking me\b/i,
      /\bsomeone is threatening me\b/i,
      /\bmy child is being abused\b/i,
      /\bhe (hurts|hits|beats) (me|my kids?)\b/i,
    ],
  },
  {
    category: "sexual_assault",
    level: "high",
    patterns: [
      /\bi was (raped|sexually assaulted|molested|drugged)\b/i,
      /\bsomeone (forced themselves on me|raped me|assaulted me)\b/i,
      /\bhe raped me\b/i,
    ],
  },

  // ── MEDIUM — real distress, NOT an emergency. Reading proceeds. ───────────
  {
    category: "distress",
    level: "medium",
    escalatable: true,
    patterns: [
      /\bdon'?t want to be here\b/i,
      /\blife isn'?t worth living\b/i,
      /\bwish i could disappear\b/i,
      /\bno reason to live\b/i,
      /\bi'?m hopeless\b/i,
      /\bno( one|body) cares about me\b/i,
      /\bi can'?t go on\b/i,
      /\bcompletely broken\b/i,
      /\bi feel trapped\b/i,
      /\bthere'?s no point (any ?more)?\b/i,
      /\bi'?m done\b/i,
      /\bcan'?t do this any ?more\b/i,
      /\bhaven'?t slept in days\b/i,
      /\bi want revenge\b/i,
    ],
  },
  {
    category: "psychosis",
    level: "medium",
    patterns: [
      /\bhearing voices\b/i,
      /\blosing my mind\b/i,
      /\bcan'?t tell what'?s real\b/i,
      /\bthey'?re watching me through\b/i,
    ],
  },
];

// ── Assessment ───────────────────────────────────────────────────────────────

const LEVEL_ORDER: Exclude<RiskLevel, "none">[] = ["low", "medium", "high", "critical"];

function raise(level: Exclude<RiskLevel, "none">): Exclude<RiskLevel, "none"> {
  const i = LEVEL_ORDER.indexOf(level);
  return LEVEL_ORDER[Math.min(i + 1, LEVEL_ORDER.length - 1)];
}

function lower(level: Exclude<RiskLevel, "none">): Exclude<RiskLevel, "none"> {
  const i = LEVEL_ORDER.indexOf(level);
  return LEVEL_ORDER[Math.max(i - 1, 0)];
}

function actionFor(level: RiskLevel, categories: RiskCategory[]): RiskAction {
  if (level === "critical") {
    // Medical and immediate-danger emergencies need 911, not a counselling line.
    return categories.includes("medical") || categories.includes("danger")
      ? "block_emergency"
      : "block_crisis";
  }
  if (level === "high") return "block_crisis";
  if (level === "medium") return "support"; // reading still happens
  return "proceed";
}

export function assessRisk(text: string): RiskAssessment {
  const empty: RiskAssessment = {
    level: "none",
    action: "proceed",
    categories: [],
    confidence: 0,
    signals: [],
    escalated: false,
  };
  if (!text || !text.trim()) return empty;

  // Normalise light obfuscation and spacing.
  const t = text
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const categories = new Set<RiskCategory>();
  const signals: string[] = [];
  let top: Exclude<RiskLevel, "none"> | null = null;
  let matchCount = 0;
  let escalatable = false;

  for (const rule of RULES) {
    for (const re of rule.patterns) {
      if (re.test(t)) {
        matchCount++;
        categories.add(rule.category);
        signals.push(`${rule.category}:${rule.level}`);
        if (!top || LEVEL_ORDER.indexOf(rule.level) > LEVEL_ORDER.indexOf(top)) {
          top = rule.level;
        }
        if (rule.escalatable) escalatable = true;
        break; // one match per rule is enough
      }
    }
  }

  if (!top) return empty;

  // ── Escalation: intent + time, intent + means, intent + plan ──────────────
  let level: Exclude<RiskLevel, "none"> = top;
  let escalated = false;

  if (escalatable && level !== "critical") {
    const hasTime = TIME_MARKERS.test(t);
    const hasMeans = MEANS_MARKERS.test(t);
    const hasPlan = PLAN_MARKERS.test(t);

    if (hasTime) signals.push("modifier:time");
    if (hasMeans) signals.push("modifier:means");
    if (hasPlan) signals.push("modifier:plan");

    if (hasTime || hasMeans || hasPlan) {
      level = raise(level);
      escalated = true;
    }
    // Two independent modifiers on top of intent — escalate again.
    if ([hasTime, hasMeans, hasPlan].filter(Boolean).length >= 2 && level !== "critical") {
      level = raise(level);
    }
  }

  // ── Negation: downgrade one tier, never dismiss ───────────────────────────
  const negated = NEGATION_PATTERNS.some((re) => re.test(t));
  if (negated) {
    signals.push("modifier:negation");
    level = lower(level);
  }

  // ── Confidence ────────────────────────────────────────────────────────────
  let confidence = 0.55 + Math.min(matchCount - 1, 3) * 0.1;
  if (escalated) confidence += 0.15;
  if (negated) confidence -= 0.2;
  confidence = Math.max(0.2, Math.min(0.98, confidence));

  return {
    level,
    action: actionFor(level, [...categories]),
    categories: [...categories],
    confidence: Number(confidence.toFixed(2)),
    signals,
    escalated,
  };
}

// ── Responses ────────────────────────────────────────────────────────────────
// Fixed, not model-generated. When someone says these things the reply should
// be plain and human, not improvised and not wrapped in astrology.
//
// NOTE: US-focused. Verify these against current listings before launch and
// localise if you take international users — services and numbers do change.

export interface SafeResponse {
  title: string;
  answer: string;
  confirmation: string;
}

export function getSafeResponse(assessment: RiskAssessment): SafeResponse {
  const { categories, action } = assessment;

  if (action === "block_emergency" && categories.includes("medical")) {
    return {
      title: "Please get help now",
      answer:
        "I'm stopping here, because what you've described needs medical attention right now — not a reading.\n\n" +
        "Please call 911 (or your local emergency number) straight away. If you're alone, call someone " +
        "nearby and tell them what's happening.\n\n" +
        "Don't wait to see if it passes.",
      confirmation: "Go now. This will still be here later.",
    };
  }

  if (action === "block_emergency") {
    return {
      title: "Please get help now",
      answer:
        "I'm stopping here. What you've described is an emergency and needs someone who can actually reach you.\n\n" +
        "Call 911 (or your local emergency number) now. If you can't speak safely, many areas let you text 911.\n\n" +
        "If you're somewhere you're not safe, getting to a public place or a neighbour is worth more than anything I can tell you.",
      confirmation: "Your safety comes first. Everything else can wait.",
    };
  }

  if (categories.includes("sexual_assault")) {
    return {
      title: "I'm glad you said it",
      answer:
        "I'm not going to read your chart for this. What you've told me deserves a real person, and there are " +
        "people whose whole job is this conversation.\n\n" +
        "In the US, RAINN's National Sexual Assault Hotline is 1-800-656-4673, free and 24/7, and you can stay " +
        "anonymous. They can talk through options without pushing you toward any of them.\n\n" +
        "Nothing about this was your fault, and you don't owe anyone a decision about what to do next today.",
      confirmation: "Saying it out loud once is hard. You've already done that part.",
    };
  }

  if (categories.includes("abuse")) {
    return {
      title: "Let's stop here",
      answer:
        "I'm not going to read your chart for this one. What you're describing is bigger than anything the sky " +
        "is doing, and you deserve someone who can actually help.\n\n" +
        "In the US, the National Domestic Violence Hotline is 1-800-799-7233, or text START to 88788. It's free, " +
        "24/7, and confidential. They can help you think through safety without telling you what to do.\n\n" +
        "If you're in immediate danger, call 911.",
      confirmation: "You're not overreacting, and you're not imagining it.",
    };
  }

  if (categories.includes("violence")) {
    return {
      title: "Let's pause here",
      answer:
        "I'm not going to read your chart for this. What you've described is serious enough that it needs a real " +
        "person, not an app.\n\n" +
        "If you're worried about what you might do, that worry is worth listening to — and talking it through " +
        "with someone before anything happens is the move.\n\n" +
        "In the US, calling or texting 988 reaches someone trained for exactly this conversation, any hour. " +
        "If anyone is in immediate danger, call 911.",
      confirmation: "The fact that you said it out loud is the part worth building on.",
    };
  }

  // Default: suicide / self-harm.
  return {
    title: "Let's pause here",
    answer:
      "I'm not going to read your chart for this one, and I want to be straight with you about why. What you " +
      "just said matters more than anything the sky is doing right now.\n\n" +
      "You deserve to talk to an actual person about this — someone who can hear you properly and stay with you. " +
      "That's not a brush-off, and it isn't me deciding you're fragile. It's that this is bigger than what an " +
      "app should be handling on its own.\n\n" +
      "If you're in the US, you can call or text 988 any time to reach the Suicide & Crisis Lifeline, or text " +
      "HOME to 741741 for the Crisis Text Line. Both are free, both are 24/7. If you're somewhere else, your " +
      "local emergency number will get you to someone.",
    confirmation: "Whatever's happening, you reached out. Please do it once more, with a person this time.",
  };
}

/**
 * MEDIUM tier only. The reading proceeds in full — this is appended underneath
 * it, quietly. It must never read as a warning or an interruption.
 */
export function getCareNote(assessment: RiskAssessment): string | null {
  if (assessment.action !== "support") return null;

  if (assessment.categories.includes("psychosis")) {
    return "One thing outside the chart: what you're describing is worth saying to a doctor, not because something is wrong with you, but because sleep and stress can do strange things to a mind and it's easier to sort out with help.";
  }

  return "One thing outside the chart: this sounds like a genuinely heavy stretch. If it stays this heavy, talking to someone — a person, not an app — is worth as much as any timing I can give you. In the US, 988 is there any hour, for far more than emergencies.";
}