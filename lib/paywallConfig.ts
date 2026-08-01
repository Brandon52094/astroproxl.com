// lib/paywallConfig.ts
//
// SINGLE SOURCE OF TRUTH for pricing and entitlements.
//
// Core rule: 1 credit = 1 reading. No multipliers anywhere. If a plan grants
// "4 readings," that is literally `credits: 4`.
//
// The model, in full:
//
//   NON-SUBSCRIBER (à la carte)
//     • Regular reading:  $4, includes 1 reply.  First ever: 50% off ($2).
//     • JXL reading:      $6, includes 2 replies. First ever: 50% off ($3).
//     • Regular reply-pack: $2 → 2 more replies on a regular reading.
//     • JXL reply-pack:     $3 → 2 more replies on a JXL conversation.
//     • PWA install → ONE free regular reading, once ever, first install only.
//
//   SUBSCRIBER — two tiers, structurally identical, only grants differ:
//     • base  $12/mo → 4 reading credits + 4 JXL credits
//     • plus  $16/mo → 8 reading credits + 8 JXL credits
//     Both: 1 reply/reading, 3 replies/JXL(*), 50% off everything once
//     included credits are exhausted, no cooldowns, unlimited free downloads.
//     Credits RESET on renewal (use-it-or-lose-it) but are never set BELOW the
//     user's current balance — purchased top-ups are never confiscated.
//
//   SAFETY WALLS (unpurchasable, per-conversation, reset on a fresh convo):
//     • Regular reading:  hard stop at 8 COUNTED replies (the 1 included is free/uncounted).
//     • JXL conversation: hard stop at 8 COUNTED replies (the 2 included are free/uncounted).
//     These are wellbeing limits, not paywalls. Past the wall, no purchase is
//     accepted — the concern is spiralling on one subject, not revenue. Other
//     subjects remain fully open; the wall is per-conversation only.
//
// Cooldowns and paid downloads have been removed entirely. Downloads are free.

// ── Reading (regular) ─────────────────────────────────────────────────────────
export const READING_PRICE = 400;            // $4.00 — every regular reading
export const READING_FIRST_PRICE = 200;      // $2.00 — first ever (50% off)
export const READING_INCLUDED_REPLIES = 1;   // free, uncounted toward the wall

// ── Reply packs ───────────────────────────────────────────────────────────────
// Two DISTINCT currencies. A regular reply-pack can never be spent on JXL, and
// vice versa. This separation is load-bearing — keep the pools apart everywhere.
export const REGULAR_REPLY_PACK = {
  mode: "reply_pack" as const,
  name: "2 Follow-Up Replies",
  description: "Keep the conversation going — 2 more replies on your reading",
  price: 200,        // $2.00
  replies: 2,
};

export const JXL_REPLY_PACK = {
  mode: "jxl_reply_pack" as const,
  name: "2 More JXL Replies",
  description: "Two more replies to go deeper on what you're working through",
  price: 300,        // $3.00
  replies: 2,
};

// ── Bundle pack — one-time purchase, mixed credits ──────────────────────────
export const BUNDLE_PACK = {
  mode: "bundle_pack" as const,
  price: 1000,          // $10.00 in cents
  credits: 2,           // regular reading credits
  jxlCredits: 1,        // JXL credits
  label: "2 readings + 1 JXL for $10",
} as const;

// ── Per-conversation safety wall (unpurchasable hard stop) ────────────────────
// COUNTED replies only. Included replies do not count toward this.
// Identical for both features by design. Resets when a new conversation starts.
export const MAX_COUNTED_REPLIES_PER_CONVERSATION = 8;

// ── Subscription tiers ────────────────────────────────────────────────────────
// The two tiers differ ONLY in the grant numbers. Everything else is shared, so
// there is one shape, not two hand-maintained blocks that can drift.
export type SubTierKey = "sub_base" | "sub_plus";

export interface SubTier {
  key: SubTierKey;
  name: string;
  tagline: string;
  price: number;          // cents / month
  displayPrice: string;
  readings: number;       // reading credits granted (and reset target) per cycle
  jxl: number;            // JXL credits granted (and reset target) per cycle
  repliesPerReading: number;
  repliesPerJxl: number;
  discountAfterIncluded: number; // 0.5 = 50% off everything once credits run out
  isBestOffer: boolean;
}

const SHARED = {
  repliesPerReading: READING_INCLUDED_REPLIES, // 1
  repliesPerJxl: 3,
  discountAfterIncluded: 0.5,
};

export const SUB_TIERS: Record<SubTierKey, SubTier> = {
  sub_base: {
    key: "sub_base",
    name: "AstroXL",
    tagline: "4 readings + 4 JXL every month · 50% off extras · no cooldowns · free downloads",
    price: 1200,
    displayPrice: "$12/mo",
    readings: 4,
    jxl: 4,
    ...SHARED,
    isBestOffer: false,
  },
  sub_plus: {
    key: "sub_plus",
    name: "AstroXL Plus",
    tagline: "8 readings + 8 JXL every month · 50% off extras · no cooldowns · free downloads",
    price: 1600,
    displayPrice: "$16/mo",
    readings: 8,
    jxl: 8,
    ...SHARED,
    isBestOffer: true,
  },
};

/** Look up a tier by the key stored in Stripe/Clerk metadata. Defaults to base. */
export function getSubTier(key: string | undefined): SubTier {
  return key === "sub_plus" ? SUB_TIERS.sub_plus : SUB_TIERS.sub_base;
}

/**
 * Renewal reset: bring the balance UP to the plan amount, never DOWN.
 * Included credits don't stack month to month (a light user resets to the plan
 * amount), but a user who bought top-ups above the plan keeps them.
 */
export function renewalCredits(currentBalance: number, planAmount: number): number {
  return Math.max(currentBalance, planAmount);
}

// ── First-purchase discount (à la carte, non-subscriber) ──────────────────────
// Two independent one-time flags. Using the first regular-reading discount does
// NOT consume the first JXL discount, and vice versa. The webhook stamps the
// matching flag once the discounted purchase completes.
export function readingUnitPrice(firstReadingDiscountUsed: boolean): number {
  return firstReadingDiscountUsed ? READING_PRICE : READING_FIRST_PRICE;
}

export function subscriberExtraPrice(basePrice: number): number {
  // Once a subscriber's included credits are gone, everything is 50% off.
  return Math.round(basePrice * (1 - SHARED.discountAfterIncluded));
}

// ── Reply bands & discounted tail ─────────────────────────────────────────────
// The per-conversation reply model. Applies to BOTH regular readings and JXL.
//
//   Non-subscriber: included replies free (1 regular / 2 JXL), then buys
//     reply-packs up to the wall.
//   Subscriber: FLAT 4 free per conversation (replaces the 1/2 included), then
//     replies 5–8 come from the paid pool, sold as a one-time discounted tail.
//   Everyone: hard wall at 8 counted replies (free + paid), fresh each convo.

export const SUBSCRIBER_FREE_REPLIES = 4;   // subscriber free band, both features

// The discounted tail — bought once at reply 5, grants 4 replies into the
// PERSISTENT pool (jxlReplyCredits / replyCredits). Carries across conversations.
// Prices are already 50% off the à la carte rate (2 packs' worth for one).
export const SUBSCRIBER_TAIL = {
  regular: {
    mode: "sub_reply_tail_regular" as const,
    price: 200,        // $2.00 — normally 2×$2=$4, 50% off
    replies: 4,        // unlocks replies 5–8
  },
  jxl: {
    mode: "sub_reply_tail_jxl" as const,
    price: 300,        // $3.00 — normally 2×$3=$6, 50% off
    replies: 4,
  },
} as const;