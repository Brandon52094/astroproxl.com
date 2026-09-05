// lib/paywallConfig.ts
//
// SINGLE SOURCE OF TRUTH for AstroProXL pricing and core entitlements.
//
// IMPORTANT:
// - All money values are stored in cents.
// - Change live prices inside PRICING only.
// - Older exports are kept temporarily as compatibility aliases while the
//   remaining checkout/webhook/reading files are migrated.
//
// CURRENT MODEL:
//
//   NON-MEMBER
//     • Regular Reading: $3.00, includes 1 reply.
//     • JXL:             $4.99, includes 2 replies.
//     • Extra replies:   $1.00 each, UNIVERSAL across Reading + JXL.
//     • PWA install:     one free Regular Reading, once ever.
//
//   MEMBER
//     • $12.99/month for now.
//     • Unlimited Regular Readings.
//     • Unlimited JXL sessions.
//     • Up to 8 replies per individual conversation.
//     • Members-only content/features can be unlocked throughout the app.
//
//   REFERRAL
//     • Referred buyer receives 15% off eligible purchases.
//     • Referrer receives 1 free Regular Reading after a successful redemption.
//
//   SAFETY WALL
//     • Maximum 8 replies per individual Reading/JXL conversation.
//     • Starting a fresh conversation resets that per-conversation limit.
//
// Downloads remain free. Cooldowns have been removed.

// ── Canonical live pricing ────────────────────────────────────────────────────

export const PRICING = {
  reading: {
    price: 300, // $3.00
    includedReplies: 1,
  },

  jxl: {
    price: 499, // $4.99
    includedReplies: 2,
  },

  replies: {
    priceEach: 100, // $1.00 each — universal
  },

  membership: {
    price: 1299, // $12.99/month — change THIS value when membership price changes
    interval: "month" as const,

    unlimitedReadings: true,
    unlimitedJxl: true,
    membersOnlyContent: true,
  },

  referral: {
    discountPercent: 15,
    referrerReadingReward: 1,
  },
} as const;

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

// ── Compatibility price exports ───────────────────────────────────────────────
// Keep these while older files are still being migrated to PRICING.

export const READING_PRICE = PRICING.reading.price;
export const READING_INCLUDED_REPLIES = PRICING.reading.includedReplies;

export const JXL_PRICE = PRICING.jxl.price;
export const JXL_INCLUDED_REPLIES = PRICING.jxl.includedReplies;

export const UNIVERSAL_REPLY_PRICE = PRICING.replies.priceEach;
export const MEMBERSHIP_PRICE = PRICING.membership.price;

// ── Legacy reply-pack exports ─────────────────────────────────────────────────
// Purchased replies are now one universal currency at $1 each.
// These old names remain only so older imports do not break.

export const REGULAR_REPLY_PACK = {
  mode: "reply_pack" as const,
  name: "2 Follow-Up Replies",
  description: "2 universal replies — works with Reading or JXL",
  price: PRICING.replies.priceEach * 2,
  replies: 2,
};

export const JXL_REPLY_PACK = {
  mode: "jxl_reply_pack" as const,
  name: "2 More Replies",
  description: "2 universal replies — works with Reading or JXL",
  price: PRICING.replies.priceEach * 2,
  replies: 2,
};

// ── Legacy bundle export ──────────────────────────────────────────────────────
// No special bundle discount is assumed here. This simply derives from the
// current central prices so it cannot drift.

export const BUNDLE_PACK = {
  mode: "bundle_pack" as const,
  price: PRICING.reading.price * 2 + PRICING.jxl.price,
  credits: 2,
  jxlCredits: 1,
  label: `2 readings + 1 JXL for ${formatUsd(
    PRICING.reading.price * 2 + PRICING.jxl.price
  )}`,
} as const;

// ── Per-conversation safety wall ──────────────────────────────────────────────

export const MAX_REPLIES_PER_CONVERSATION = 8;

// Compatibility alias for older files using the previous constant name.
// NOTE: the canonical meaning is now 8 TOTAL replies per conversation.
export const MAX_COUNTED_REPLIES_PER_CONVERSATION =
  MAX_REPLIES_PER_CONVERSATION;

// ── Membership status ─────────────────────────────────────────────────────────

export type MembershipStatus = "active" | "paused" | "canceled";

export function hasMemberAccess(
  status: MembershipStatus | string | null | undefined
): boolean {
  return status === "active";
}

// ── Legacy subscription-tier compatibility ────────────────────────────────────
//
// AstroProXL now has ONE membership tier.
// These shapes stay temporarily because the current webhook / older PaywallScreen
// may still import SUB_TIERS or getSubTier.
//
// Both legacy keys intentionally point at the SAME live membership price so an
// old caller cannot accidentally charge the retired $12/$16 prices.
//
// The reading/jxl grant numbers remain temporarily for compatibility with the
// CURRENT webhook until that webhook is migrated to unlimited-member access.
// They are NOT the new membership entitlement model.

export type SubTierKey = "sub_base" | "sub_plus";

export interface SubTier {
  key: SubTierKey;
  name: string;
  tagline: string;
  price: number;
  displayPrice: string;

  // LEGACY webhook compatibility fields only:
  readings: number;
  jxl: number;

  repliesPerReading: number;
  repliesPerJxl: number;
  discountAfterIncluded: number;
  isBestOffer: boolean;
}

const SHARED = {
  // Members can reply up to the 8-reply conversation wall without purchasing
  // individual reply credits.
  repliesPerReading: MAX_REPLIES_PER_CONVERSATION,
  repliesPerJxl: MAX_REPLIES_PER_CONVERSATION,

  // No paid "extras" model for active members under the current membership.
  discountAfterIncluded: 0,
};

const LEGACY_MEMBERSHIP_TAGLINE =
  "Unlimited General Readings + JXL · up to 8 replies per conversation · members-only access";

export const SUB_TIERS: Record<SubTierKey, SubTier> = {
  sub_base: {
    key: "sub_base",
    name: "AstroProXL Membership",
    tagline: LEGACY_MEMBERSHIP_TAGLINE,
    price: PRICING.membership.price,
    displayPrice: `${formatUsd(PRICING.membership.price)}/mo`,

    // Temporary only until webhook migration.
    readings: 4,
    jxl: 4,

    ...SHARED,
    isBestOffer: true,
  },

  sub_plus: {
    key: "sub_plus",
    name: "AstroProXL Membership",
    tagline: LEGACY_MEMBERSHIP_TAGLINE,
    price: PRICING.membership.price,
    displayPrice: `${formatUsd(PRICING.membership.price)}/mo`,

    // Temporary only until webhook migration.
    readings: 8,
    jxl: 8,

    ...SHARED,
    isBestOffer: false,
  },
};

/**
 * Compatibility helper for older webhook/UI code.
 * New code should not select membership tiers.
 */
export function getSubTier(key: string | undefined): SubTier {
  return key === "sub_plus" ? SUB_TIERS.sub_plus : SUB_TIERS.sub_base;
}

/**
 * Legacy renewal helper.
 * The new membership model is unlimited and should not need monthly credit
 * resets once the webhook has been migrated.
 */
export function renewalCredits(
  currentBalance: number,
  planAmount: number
): number {
  return Math.max(currentBalance, planAmount);
}

// ── Legacy member-extra pricing helper ────────────────────────────────────────
// Active members no longer use a discounted-extra model. Keep the function so
// old imports compile; it now simply returns the normal price.

export function subscriberExtraPrice(basePrice: number): number {
  return basePrice;
}

// ── Member reply compatibility ────────────────────────────────────────────────
//
// New rule: members can use up to 8 replies per conversation.
// This old constant is preserved so existing reply logic can move toward the
// correct member allowance without breaking imports.

export const SUBSCRIBER_FREE_REPLIES = MAX_REPLIES_PER_CONVERSATION;

// Deprecated compatibility object.
// Under the current model, members should never need to purchase a reply "tail"
// before reaching the 8-reply hard wall. Keep the old shape until all consumers
// are migrated, then remove it.

export const SUBSCRIBER_TAIL = {
  regular: {
    mode: "sub_reply_tail_regular" as const,
    price: PRICING.replies.priceEach * 4,
    replies: 4,
  },

  jxl: {
    mode: "sub_reply_tail_jxl" as const,
    price: PRICING.replies.priceEach * 4,
    replies: 4,
  },
} as const;
