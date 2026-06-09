// lib/paywallConfig.ts

export type PaywallIndex = 1 | 2 | 3 | 4;

export interface OneTimePack {
  name: string;
  description: string;
  price: number;
  displayPrice: string;
  credits: number;
  jxlCredits: number;
  creditsLabel: string;
  pack: string;
}

export interface SubscriptionTier {
  name: string;
  tagline: string;
  price: number;
  displayPrice: string;
  tier: string;
  isBestOffer: boolean;
  readingsPerMonth: number;
  jxlSessionsPerMonth: number; // -1 = unlimited
}

export interface PaywallConfig {
  paywallIndex: PaywallIndex;
  isJourneyComplete: boolean;
  oneTime: OneTimePack;
  subscription: SubscriptionTier;
}

// ── One-time reading packs ────────────────────────────────────────────────────
// Reading 1 is free. Paywalls trigger on readings 2, 3, 4.
// Crescendo: $2.99 → $3.99 → $4.99
export const ONE_TIME_PACKS: Record<PaywallIndex, OneTimePack> = {
  1: {
    name: "Unlock Your Reading",
    description: "Full 30-45 day reading with specific dates and directives",
    price: 299,
    displayPrice: "$2.99",
    credits: 12,
    jxlCredits: 0,
    creditsLabel: "Unlocks your next reading",
    pack: "paywall_1",
  },
  2: {
    name: "Unlock Your Reading",
    description: "Full 30-45 day reading with specific dates and directives",
    price: 399,
    displayPrice: "$3.99",
    credits: 12,
    jxlCredits: 0,
    creditsLabel: "Unlocks your next reading",
    pack: "paywall_2",
  },
  3: {
    name: "Unlock Your Reading",
    description: "Full 30-45 day reading with specific dates and directives",
    price: 499,
    displayPrice: "$4.99",
    credits: 12,
    jxlCredits: 6,
    creditsLabel: "Unlocks your reading + 1 JXL session",
    pack: "paywall_3",
  },
  4: {
    name: "Complete Your Cycle",
    description: "Full 30-45 day reading + 1 JXL session",
    price: 499,
    displayPrice: "$4.99",
    credits: 12,
    jxlCredits: 6,
    creditsLabel: "Unlocks your reading + 1 JXL session",
    pack: "paywall_4",
  },
};

// ── Single subscription tier ──────────────────────────────────────────────────
// One plan shown at every paywall. Clean, no choice paralysis.
// $20/mo — 8 readings + unlimited JXL + no cooldowns
export const SUBSCRIPTION_TIER: SubscriptionTier = {
  name: "AstroXL",
  tagline: "8 readings + unlimited JXL — no cooldowns, no paywalls",
  price: 2000,
  displayPrice: "$20/mo",
  tier: "sub_base",
  isBestOffer: true,
  readingsPerMonth: 8,
  jxlSessionsPerMonth: -1, // unlimited
};

// All paywalls show the same subscription tier
export const SUBSCRIPTION_TIERS: Record<PaywallIndex, SubscriptionTier> = {
  1: SUBSCRIPTION_TIER,
  2: SUBSCRIPTION_TIER,
  3: SUBSCRIPTION_TIER,
  4: SUBSCRIPTION_TIER,
};

// ── Subscriber top-up pack ────────────────────────────────────────────────────
// When a subscriber runs out of their 8 monthly readings,
// they can unlock 4 more for $4 instead of waiting for renewal.
export const SUBSCRIBER_TOPUP = {
  name: "Reading Top-Up",
  description: "4 more readings added to your subscription this month",
  price: 400,
  displayPrice: "$4.00",
  credits: 48, // 4 readings × 12 credits
  pack: "subscriber_topup",
};

// ── Cooldown bypass ───────────────────────────────────────────────────────────
// $6.00 to skip the 2-week cooldown and start a fresh cycle immediately
export const COOLDOWN_BYPASS_PRICE = 600; // cents
export const COOLDOWN_BYPASS_DISPLAY = "$6.00";

export function getPaywallConfig(paywallsCompleted: number): PaywallConfig | null {
  const next = (paywallsCompleted + 1) as PaywallIndex;
  if (!isValidIndex(next)) return null;
  return {
    paywallIndex: next,
    isJourneyComplete: next === 4,
    oneTime: ONE_TIME_PACKS[next],
    subscription: SUBSCRIPTION_TIERS[next],
  };
}

function isValidIndex(n: number): n is PaywallIndex {
  return n >= 1 && n <= 4;
}

export function getCooldownStatus(lastReadingCompletedAt: Date | null): {
  onCooldown: boolean;
  unlocksAt: Date | null;
} {
  if (!lastReadingCompletedAt) return { onCooldown: false, unlocksAt: null };
  const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
  const unlocksAt = new Date(lastReadingCompletedAt.getTime() + COOLDOWN_MS);
  return { onCooldown: Date.now() < unlocksAt.getTime(), unlocksAt };
}