// lib/jxlConfig.ts

export type JxlTier = "session_1" | "session_2" | "session_3" | "session_4" | "session_5";

export interface JxlPack {
  tier: JxlTier;
  name: string;
  tagline: string;
  price: number;       // in cents
  displayPrice: string;
  replies: number;     // 6 replies per session
}

// ── Session packs — flat $4.99 per session, 6 replies each ───────────────────
// Subscribers get unlimited JXL — these packs are for non-subscribers only.
// Flat pricing removes the crescendo friction for pay-per-session users.
export const JXL_PACKS: Record<JxlTier, JxlPack> = {
  session_1: {
    tier: "session_1",
    name: "1 Session",
    tagline: "6 replies · continues where you left off",
    price: 499,
    displayPrice: "$4.99",
    replies: 6,
  },
  session_2: {
    tier: "session_2",
    name: "2 Sessions",
    tagline: "12 replies · nothing resets",
    price: 899,
    displayPrice: "$8.99",
    replies: 12,
  },
  session_3: {
    tier: "session_3",
    name: "3 Sessions",
    tagline: "18 replies · nothing resets",
    price: 1199,
    displayPrice: "$11.99",
    replies: 18,
  },
  session_4: {
    tier: "session_4",
    name: "4 Sessions",
    tagline: "24 replies · nothing resets",
    price: 1499,
    displayPrice: "$14.99",
    replies: 24,
  },
  session_5: {
    tier: "session_5",
    name: "5 Sessions",
    tagline: "30 replies · best value per session",
    price: 1799,
    displayPrice: "$17.99",
    replies: 30,
  },
};

// ── Session limits ─────────────────────────────────────────────────────────────
export const JXL_REPLIES_PER_SESSION = 6;
export const JXL_MAX_SESSIONS_PER_CYCLE = 5;
export const JXL_MAX_REPLIES_PER_CYCLE = 30;

// ── Freebie — 6 replies granted on first reading completion ──────────────────
export const JXL_FREEBIE_REPLIES = 6;
export const JXL_FREEBIE_COOLDOWN_MS = 28 * 24 * 60 * 60 * 1000; // 4 weeks

// ── Cycle cooldown — 2 weeks (shared with reading cooldown) ──────────────────
export const JXL_CYCLE_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

// ── Caring message — shown at session boundary ────────────────────────────────
export const JXL_CARING_MESSAGE =
  "You've done real work here. Give it two weeks to settle — the chart keeps moving even when you're not watching. We'll be here when the next window opens.";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isValidJxlTier(t: string): t is JxlTier {
  return Object.keys(JXL_PACKS).includes(t);
}

export function getNextJxlTier(sessionsPurchased: number): JxlTier | null {
  const tiers: JxlTier[] = [
    "session_1",
    "session_2",
    "session_3",
    "session_4",
    "session_5",
  ];
  return tiers[sessionsPurchased] ?? null;
}