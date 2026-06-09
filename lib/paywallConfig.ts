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
  jxlSessionsPerMonth: number;
}

export interface PaywallConfig {
  paywallIndex: PaywallIndex;
  isJourneyComplete: boolean;
  oneTime: OneTimePack;
  subscription: SubscriptionTier;
}

// Reading 1 is free — paywalls trigger on readings 2, 3, 4
// Gentle crescendo: $2.99 → $3.99 → $4.99
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
    description: "Full 30-45 day reading + 1 full JXL session",
    price: 499,
    displayPrice: "$4.99",
    credits: 12,
    jxlCredits: 6,
    creditsLabel: "Unlocks your reading + 1 JXL session",
    pack: "paywall_4",
  },
};

export const SUBSCRIPTION_TIERS: Record<PaywallIndex, SubscriptionTier> = {
  1: {
    name: "AstroXL Base",
    tagline: "3 full readings + 3 JXL sessions per month",
    price: 1900,
    displayPrice: "$19/mo",
    tier: "sub_base",
    isBestOffer: false,
    readingsPerMonth: 3,
    jxlSessionsPerMonth: 3,
  },
  2: {
    name: "AstroXL Base",
    tagline: "3 full readings + 3 JXL sessions per month",
    price: 1900,
    displayPrice: "$19/mo",
    tier: "sub_base",
    isBestOffer: false,
    readingsPerMonth: 3,
    jxlSessionsPerMonth: 3,
  },
  3: {
    name: "AstroXL Premium",
    tagline: "8 full readings + 6 JXL sessions per month",
    price: 4000,
    displayPrice: "$40/mo",
    tier: "sub_premium",
    isBestOffer: false,
    readingsPerMonth: 8,
    jxlSessionsPerMonth: 6,
  },
  4: {
    name: "AstroXL Premium",
    tagline: "8 full readings + 6 JXL sessions — best value",
    price: 4000,
    displayPrice: "$40/mo",
    tier: "sub_premium",
    isBestOffer: true,
    readingsPerMonth: 8,
    jxlSessionsPerMonth: 6,
  },
};

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