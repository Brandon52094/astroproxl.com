// lib/paywallConfig.ts
// ─── Paywall config ───────────────────────────────────────────────────────────

export type PaywallIndex = 1 | 2 | 3 | 4;

export interface OneTimePack {
  name: string;
  description: string;
  price: number;        // in cents
  displayPrice: string;
  credits: number;      // reading credits
  jxlCredits: number;   // jxl session credits (6 = 1 full session)
  creditsLabel: string;
  pack: string;
}

export interface SubscriptionTier {
  name: string;
  tagline: string;
  price: number;        // in cents
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

// Each pack grants 12 reading credits = 4 credits × 3 pages.
// Paywall 4 ($8.99) also grants 1 full Jxl session (6 jxlCredits).
export const ONE_TIME_PACKS: Record<PaywallIndex, OneTimePack> = {
  1: {
    name: "Unlock Your Reading",
    description: "Unlock page 4 now + pages 1–3 of your next reading",
    price: 299,
    displayPrice: "$2.99",
    credits: 12,
    jxlCredits: 0,
    creditsLabel: "12 credits — unlocks your next full reading",
    pack: "paywall_1",
  },
  2: {
    name: "Unlock Your Reading",
    description: "Unlock page 4 now + pages 1–3 of your next reading",
    price: 599,
    displayPrice: "$5.99",
    credits: 12,
    jxlCredits: 0,
    creditsLabel: "12 credits — unlocks your next full reading",
    pack: "paywall_2",
  },
  3: {
    name: "Unlock Your Reading",
    description: "Unlock page 4 now + pages 1–3 of your next reading",
    price: 799,
    displayPrice: "$7.99",
    credits: 12,
    jxlCredits: 0,
    creditsLabel: "12 credits — unlocks your next full reading",
    pack: "paywall_3",
  },
  4: {
    name: "Complete Your Journey",
    description: "Unlock your final page 4 + 1 full Jxl session",
    price: 899,
    displayPrice: "$8.99",
    credits: 12,
    jxlCredits: 6, // 1 full Jxl session
    creditsLabel: "12 credits + 1 Jxl session — your journey reward",
    pack: "paywall_4",
  },
};

export const SUBSCRIPTION_TIERS: Record<PaywallIndex, SubscriptionTier> = {
  1: {
    name: "AstroXL Base",
    tagline: "3 full readings + 3 Jxl sessions per month",
    price: 1900,
    displayPrice: "$19/mo",
    tier: "sub_base",
    isBestOffer: false,
    readingsPerMonth: 3,
    jxlSessionsPerMonth: 3,
  },
  2: {
    name: "AstroXL Base",
    tagline: "3 full readings + 3 Jxl sessions per month",
    price: 1900,
    displayPrice: "$19/mo",
    tier: "sub_base",
    isBestOffer: false,
    readingsPerMonth: 3,
    jxlSessionsPerMonth: 3,
  },
  3: {
    name: "AstroXL Premium",
    tagline: "8 full readings + 6 Jxl sessions per month",
    price: 4000,
    displayPrice: "$40/mo",
    tier: "sub_premium",
    isBestOffer: false,
    readingsPerMonth: 8,
    jxlSessionsPerMonth: 6,
  },
  4: {
    name: "AstroXL Premium",
    tagline: "8 full readings + 6 Jxl sessions — best value",
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
  const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks
  const unlocksAt = new Date(lastReadingCompletedAt.getTime() + COOLDOWN_MS);
  return { onCooldown: Date.now() < unlocksAt.getTime(), unlocksAt };
}