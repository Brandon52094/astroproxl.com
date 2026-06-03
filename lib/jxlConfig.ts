// lib/jxlConfig.ts
// ─── Jxl pricing and session config ──────────────────────────────────────────

export type JxlTier = "session_1" | "session_2" | "session_3" | "session_4" | "session_5";

export interface JxlPack {
  tier: JxlTier;
  name: string;
  tagline: string;
  price: number;       // in cents
  displayPrice: string;
  replies: number;     // always 6 per session
}

// ── Session packs — 5 per cycle, 6 replies each ───────────────────────────────
export const JXL_PACKS: Record<JxlTier, JxlPack> = {
  session_1: {
    tier: "session_1",
    name: "Session 1",
    tagline: "Continue where the freebie left off",
    price: 499,
    displayPrice: "$4.99",
    replies: 6,
  },
  session_2: {
    tier: "session_2",
    name: "Session 2",
    tagline: "The pressure tightens",
    price: 899,
    displayPrice: "$8.99",
    replies: 6,
  },
  session_3: {
    tier: "session_3",
    name: "Session 3",
    tagline: "The orb closes in",
    price: 1299,
    displayPrice: "$12.99",
    replies: 6,
  },
  session_4: {
    tier: "session_4",
    name: "Session 4",
    tagline: "The cosmic anchor drops",
    price: 1699,
    displayPrice: "$16.99",
    replies: 6,
  },
  session_5: {
    tier: "session_5",
    name: "Session 5",
    tagline: "The threshold action — your directive",
    price: 1999,
    displayPrice: "$19.99",
    replies: 6,
  },
};

// ── Session limits ─────────────────────────────────────────────────────────────
export const JXL_REPLIES_PER_SESSION = 6;
export const JXL_MAX_SESSIONS_PER_CYCLE = 5;
export const JXL_MAX_REPLIES_PER_CYCLE = 30; // 5 sessions × 6 replies

// ── Freebie — 6 replies, once per 4 weeks ────────────────────────────────────
export const JXL_FREEBIE_REPLIES = 6;
export const JXL_FREEBIE_COOLDOWN_MS = 28 * 24 * 60 * 60 * 1000; // 4 weeks

// ── Cycle cooldown — 2 weeks (shared with reading cooldown) ──────────────────
export const JXL_CYCLE_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks

// ── Subscription allocations ──────────────────────────────────────────────────
export const JXL_BASE_SUB_SESSIONS = 3;    // $19/mo
export const JXL_PREMIUM_SUB_SESSIONS = 6; // $40/mo

// ── Caring message — shown at session 5 boundary ─────────────────────────────
export const JXL_CARING_MESSAGE =
  "You've done real work here. Give it two weeks to settle — the chart keeps moving even when you're not watching. We'll be here when the next window opens.";

// ── Helper — is a tier valid ──────────────────────────────────────────────────
export function isValidJxlTier(t: string): t is JxlTier {
  return Object.keys(JXL_PACKS).includes(t);
}

// ── Helper — next session tier based on sessions purchased ───────────────────
export function getNextJxlTier(sessionsPurchased: number): JxlTier | null {
  const tiers: JxlTier[] = [
    "session_1",
    "session_2",
    "session_3",
    "session_4",
    "session_5",
  ];
  const next = tiers[sessionsPurchased];
  return next ?? null;
}