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
  freeRepliesPerReading: number; // NEW — subscriber perk
}

export interface PaywallConfig {
  paywallIndex: PaywallIndex;
  isJourneyComplete: boolean;
  oneTime: OneTimePack;
  subscription: SubscriptionTier;
}

// ── One-time reading packs ────────────────────────────────────────────────────
// Reading 1 is free. Flat $4.00 for every reading after — no more escalation.
export const ONE_TIME_PACKS: Record<PaywallIndex, OneTimePack> = {
  1: {
    name: "Unlock Your Reading",
    description: "Full 30-45 day reading with specific dates and directives",
    price: 400,
    displayPrice: "$4.00",
    credits: 12,
    jxlCredits: 0,
    creditsLabel: "Unlocks your next reading",
    pack: "paywall_1",
  },
  2: {
    name: "Unlock Your Reading",
    description: "Full 30-45 day reading with specific dates and directives",
    price: 400,
    displayPrice: "$4.00",
    credits: 12,
    jxlCredits: 0,
    creditsLabel: "Unlocks your next reading",
    pack: "paywall_2",
  },
  3: {
    name: "Unlock Your Reading",
    description: "Full 30-45 day reading with specific dates and directives",
    price: 400,
    displayPrice: "$4.00",
    credits: 12,
    jxlCredits: 0,
    creditsLabel: "Unlocks your next reading",
    pack: "paywall_3",
  },
  4: {
    name: "Complete Your Cycle",
    description: "Full 30-45 day reading",
    price: 400,
    displayPrice: "$4.00",
    credits: 12,
    jxlCredits: 0,
    creditsLabel: "Unlocks your next reading",
    pack: "paywall_4",
  },
};

// ── Reading bundles ────────────────────────────────────────────────────────────
// Credits = 12 per reading (matches ONE_TIME_PACKS credit value), so a bundle
// purchase grants the exact number of credits needed to complete that many
// full readings. Prices give a flat $1 savings per additional tier.
export interface BundlePack {
  key: "2" | "3" | "4";
  name: string;
  description: string;
  price: number;
  displayPrice: string;
  readings: number;
  credits: number;
}

export const BUNDLE_PACKS: Record<"2" | "3" | "4", BundlePack> = {
  "2": {
    key: "2",
    name: "2 Reading Bundle",
    description: "2 readings, ready whenever you need them",
    price: 700,
    displayPrice: "$7.00",
    readings: 2,
    credits: 24,
  },
  "3": {
    key: "3",
    name: "3 Reading Bundle",
    description: "3 readings, ready whenever you need them",
    price: 1000,
    displayPrice: "$10.00",
    readings: 3,
    credits: 36,
  },
  "4": {
    key: "4",
    name: "4 Reading Bundle",
    description: "4 readings, ready whenever you need them",
    price: 1300,
    displayPrice: "$13.00",
    readings: 4,
    credits: 48,
  },
};

export function isValidBundleTier(n: string): n is "2" | "3" | "4" {
  return n === "2" || n === "3" || n === "4";
}

// ── Single subscription tier ──────────────────────────────────────────────────
// $12.99/mo — Unlimtied Readings, free follow-up replies per reading + free downloads + no cooldowns
export const SUBSCRIPTION_TIER: SubscriptionTier = {
  name: "AstroXL",
  tagline: "Unlimtied Readings, free follow-up replies per reading + free downloads + no cooldowns",
  price: 1299,
  displayPrice: "$12.99/mo",
  tier: "sub_base",
  isBestOffer: true,
  readingsPerMonth: 8,
  jxlSessionsPerMonth: 0, // JXL paused — re-enable later
  freeRepliesPerReading: 2,
};

// All paywalls show the same subscription tier
export const SUBSCRIPTION_TIERS: Record<PaywallIndex, SubscriptionTier> = {
  1: SUBSCRIPTION_TIER,
  2: SUBSCRIPTION_TIER,
  3: SUBSCRIPTION_TIER,
  4: SUBSCRIPTION_TIER,
};

// ── Subscriber top-up pack ────────────────────────────────────────────────────
export const SUBSCRIBER_TOPUP = {
  name: "Reading Top-Up",
  description: "4 more readings added to your subscription this month",
  price: 400,
  displayPrice: "$4.00",
  credits: 48,
  pack: "subscriber_topup",
};

// ── Cooldown bypass ───────────────────────────────────────────────────────────
export const COOLDOWN_BYPASS_PRICE = 600;
export const COOLDOWN_BYPASS_DISPLAY = "$6.00";

// ── Follow-up reply price ─────────────────────────────────────────────────────
export const FOLLOWUP_PRICE = 200; // $2.00
export const FOLLOWUP_DISPLAY = "$2.00";

// ── Download price ────────────────────────────────────────────────────────────
export const DOWNLOAD_PRICE = 100; // $1.00
export const DOWNLOAD_DISPLAY = "$1.00";

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