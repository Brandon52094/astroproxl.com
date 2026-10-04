// lib/paywallConfig.ts
//
// AstroProXL pricing, membership plans, and entitlement rules.
//
// Edit monetary values only in:
//   lib/pricing.ts
//
// Membership model:
//
// Astro Plus
// - 16 Signature Readings monthly
// - 12 JXL Private Sessions monthly
// - Up to 4 replies per conversation
// - 16 saved Reading spaces
// - Gift 5 Reading credits monthly
// - Voice Reading access
// - Add Context access
// - Extended saved Reading slides
//
// Astro Plus XL
// - Unlimited Signature Readings
// - Unlimited JXL Private Sessions
// - Up to 8 replies per conversation
// - 24 saved Reading spaces
// - Gift 10 Reading credits monthly
// - Voice Reading access
// - Add Context access
// - Extended saved Reading slides
// - Custom Themes
// - Commission / Partner access
//
// Purchased balances remain on the account while subscribed
// and become usable again if membership ends.
//
// Downloads remain free for everyone.

import { PRICES, formatUsd } from "@/lib/pricing";

export { formatUsd };

// ── General pricing ───────────────────────────────────────────────────────────

export const PRICING = {
  reading: {
    price: PRICES.generalReading,
    includedReplies: 1,
  },

  jxl: {
    price: PRICES.jxl,
    includedReplies: 2,
  },

  replies: {
    priceEach: PRICES.replyEach,
  },

  referral: {
    discountPercent: 15,
    referrerReadingReward: 1,
  },
} as const;

// ── Membership types ──────────────────────────────────────────────────────────

export type MembershipStatus =
  | "active"
  | "paused"
  | "canceled";

export type MembershipPlan =
  | "plus"
  | "plus_xl";

export interface MembershipEntitlements {
  readingsPerMonth: number | null;
  jxlPerMonth: number | null;

  repliesPerConversation: number;

  savedReadingSpaces: number;
  giftReadingsPerMonth: number;

  voiceReading: boolean;
  addContext: boolean;
  extendedSavedReading: boolean;
  customThemes: boolean;
  commissionAccess: boolean;
}

export interface MembershipPlanConfig {
  key: MembershipPlan;
  name: string;
  price: number;
  displayPrice: string;
  interval: "month";
  tagline: string;
  entitlements: MembershipEntitlements;
}

// ── Membership plans ──────────────────────────────────────────────────────────
//
// null for readingsPerMonth / jxlPerMonth means unlimited.

export const MEMBERSHIP_PLANS: Record<
  MembershipPlan,
  MembershipPlanConfig
> = {
  plus: {
    key: "plus",
    name: "Astro Plus",
    price: PRICES.astroPlusMonthly,
    displayPrice: `${formatUsd(PRICES.astroPlusMonthly)}/mo`,
    interval: "month",

    tagline:
      "A generous monthly rhythm for deeper guidance.",

    entitlements: {
      readingsPerMonth: 16,
      jxlPerMonth: 12,

      repliesPerConversation: 4,

      savedReadingSpaces: 16,
      giftReadingsPerMonth: 5,

      voiceReading: true,
      addContext: true,
      extendedSavedReading: true,

      customThemes: false,
      commissionAccess: false,
    },
  },

  plus_xl: {
    key: "plus_xl",
    name: "Astro Plus XL",
    price: PRICES.astroPlusXLMonthly,
    displayPrice: `${formatUsd(PRICES.astroPlusXLMonthly)}/mo`,
    interval: "month",

    tagline:
      "The complete AstroProXL experience, without counting.",

    entitlements: {
      readingsPerMonth: null,
      jxlPerMonth: null,

      repliesPerConversation: 8,

      savedReadingSpaces: 24,
      giftReadingsPerMonth: 10,

      voiceReading: true,
      addContext: true,
      extendedSavedReading: true,

      customThemes: true,
      commissionAccess: true,
    },
  },
};

// ── Membership helpers ────────────────────────────────────────────────────────

export function hasMemberAccess(
  status: MembershipStatus | string | null | undefined
): boolean {
  return status === "active";
}

export function isMembershipPlan(
  value: unknown
): value is MembershipPlan {
  return value === "plus" || value === "plus_xl";
}

export function getMembershipPlan(
  plan: string | null | undefined
): MembershipPlanConfig | null {
  if (!isMembershipPlan(plan)) {
    return null;
  }

  return MEMBERSHIP_PLANS[plan];
}

export function getMembershipEntitlements(
  plan: string | null | undefined
): MembershipEntitlements | null {
  return getMembershipPlan(plan)?.entitlements ?? null;
}

// ── Feature helpers ───────────────────────────────────────────────────────────

export type MemberFeature =
  | "voiceReading"
  | "addContext"
  | "extendedSavedReading"
  | "customThemes"
  | "commissionAccess";

export function planHasFeature(
  plan: string | null | undefined,
  feature: MemberFeature
): boolean {
  const entitlements =
    getMembershipEntitlements(plan);

  if (!entitlements) return false;

  return entitlements[feature];
}

// ── Usage helpers ─────────────────────────────────────────────────────────────

export function hasReadingAllowance(
  plan: string | null | undefined,
  readingsUsedThisMonth: number
): boolean {
  const entitlements =
    getMembershipEntitlements(plan);

  if (!entitlements) return false;

  const allowance =
    entitlements.readingsPerMonth;

  // null = unlimited
  if (allowance === null) {
    return true;
  }

  return readingsUsedThisMonth < allowance;
}

export function hasJxlAllowance(
  plan: string | null | undefined,
  jxlUsedThisMonth: number
): boolean {
  const entitlements =
    getMembershipEntitlements(plan);

  if (!entitlements) return false;

  const allowance =
    entitlements.jxlPerMonth;

  // null = unlimited
  if (allowance === null) {
    return true;
  }

  return jxlUsedThisMonth < allowance;
}

// ── Conversation wall ─────────────────────────────────────────────────────────

export const MAX_REPLIES_PER_CONVERSATION =
  MEMBERSHIP_PLANS.plus_xl.entitlements.repliesPerConversation;

// Compatibility alias.
export const MAX_COUNTED_REPLIES_PER_CONVERSATION =
  MAX_REPLIES_PER_CONVERSATION;

// ── Compatibility price exports ───────────────────────────────────────────────

export const READING_PRICE =
  PRICING.reading.price;

export const READING_INCLUDED_REPLIES =
  PRICING.reading.includedReplies;

export const JXL_PRICE =
  PRICING.jxl.price;

export const JXL_INCLUDED_REPLIES =
  PRICING.jxl.includedReplies;

export const UNIVERSAL_REPLY_PRICE =
  PRICING.replies.priceEach;

// Keep temporarily for older imports.
// Defaults to the entry membership.
export const MEMBERSHIP_PRICE =
  MEMBERSHIP_PLANS.plus.price;

// ── Purchased reply packs ─────────────────────────────────────────────────────

export const REGULAR_REPLY_PACK = {
  mode: "reply_pack" as const,
  name: "2 Follow-Up Replies",
  description:
    "2 universal replies — works with Reading or JXL",
  price: PRICING.replies.priceEach * 2,
  replies: 2,
};

export const JXL_REPLY_PACK = {
  mode: "jxl_reply_pack" as const,
  name: "2 More Replies",
  description:
    "2 universal replies — works with Reading or JXL",
  price: PRICING.replies.priceEach * 2,
  replies: 2,
};

// ── Legacy bundle compatibility ───────────────────────────────────────────────

export const BUNDLE_PACK = {
  mode: "bundle_pack" as const,

  price:
    PRICING.reading.price * 2 +
    PRICING.jxl.price,

  credits: 2,
  jxlCredits: 1,

  label: `2 readings + 1 JXL for ${formatUsd(
    PRICING.reading.price * 2 +
      PRICING.jxl.price
  )}`,
} as const;

// ── Legacy subscription compatibility ─────────────────────────────────────────
//
// Remove these after all older callers have migrated to
// MembershipPlan / MEMBERSHIP_PLANS.

export type SubTierKey =
  | "sub_base"
  | "sub_plus";

export interface SubTier {
  key: SubTierKey;
  name: string;
  tagline: string;
  price: number;
  displayPrice: string;

  readings: number;
  jxl: number;

  repliesPerReading: number;
  repliesPerJxl: number;

  discountAfterIncluded: number;
  isBestOffer: boolean;
}

export const SUB_TIERS: Record<
  SubTierKey,
  SubTier
> = {
  sub_base: {
    key: "sub_base",
    name: MEMBERSHIP_PLANS.plus.name,
    tagline:
      MEMBERSHIP_PLANS.plus.tagline,

    price:
      MEMBERSHIP_PLANS.plus.price,

    displayPrice:
      MEMBERSHIP_PLANS.plus.displayPrice,

    readings:
      MEMBERSHIP_PLANS.plus.entitlements
        .readingsPerMonth ?? 0,

    jxl:
      MEMBERSHIP_PLANS.plus.entitlements
        .jxlPerMonth ?? 0,

    repliesPerReading:
      MEMBERSHIP_PLANS.plus.entitlements
        .repliesPerConversation,

    repliesPerJxl:
      MEMBERSHIP_PLANS.plus.entitlements
        .repliesPerConversation,

    discountAfterIncluded: 0,
    isBestOffer: false,
  },

  sub_plus: {
    key: "sub_plus",
    name: MEMBERSHIP_PLANS.plus_xl.name,
    tagline:
      MEMBERSHIP_PLANS.plus_xl.tagline,

    price:
      MEMBERSHIP_PLANS.plus_xl.price,

    displayPrice:
      MEMBERSHIP_PLANS.plus_xl.displayPrice,

    // Legacy callers expect numbers.
    // These should NOT be used to enforce XL allowance.
    readings: 0,
    jxl: 0,

    repliesPerReading:
      MEMBERSHIP_PLANS.plus_xl.entitlements
        .repliesPerConversation,

    repliesPerJxl:
      MEMBERSHIP_PLANS.plus_xl.entitlements
        .repliesPerConversation,

    discountAfterIncluded: 0,
    isBestOffer: true,
  },
};

export function getSubTier(
  key: string | undefined
): SubTier {
  return key === "sub_plus"
    ? SUB_TIERS.sub_plus
    : SUB_TIERS.sub_base;
}

// ── Old helpers retained temporarily ──────────────────────────────────────────

export function renewalCredits(
  currentBalance: number,
  planAmount: number
): number {
  return Math.max(
    currentBalance,
    planAmount
  );
}

export function subscriberExtraPrice(
  basePrice: number
): number {
  return basePrice;
}

export const SUBSCRIBER_FREE_REPLIES =
  MEMBERSHIP_PLANS.plus.entitlements
    .repliesPerConversation;

export const SUBSCRIBER_TAIL = {
  regular: {
    mode:
      "sub_reply_tail_regular" as const,

    price:
      PRICING.replies.priceEach * 4,

    replies: 4,
  },

  jxl: {
    mode:
      "sub_reply_tail_jxl" as const,

    price:
      PRICING.replies.priceEach * 4,

    replies: 4,
  },
} as const;