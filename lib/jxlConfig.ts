// lib/jxlConfig.ts
//
// JXL access model — aligned to the unified pricing model in paywallConfig.ts.
//
//   • One FREE session, ever (the hook — experience the accuracy once).
//     The free session includes 2 replies, same as a paid one.
//   • $6 per session after that, 2 replies included.
//   • Out of replies mid-conversation → $3 for 2 more (a JXL-ONLY reply pack —
//     distinct from the $2 regular-reading reply pack; the two pools never mix).
//   • Subscribers spend fixed JXL credits (4 on base / 8 on plus), exactly like
//     every other credit in the system — NO separate day/month cap system.
//
//   SAFETY WALL (unpurchasable, per-conversation, resets on a fresh conversation):
//     Hard stop at 8 COUNTED replies. The 2 included replies are free and do NOT
//     count toward this. Past 8 counted, no purchase is accepted — the concern is
//     spiralling on one subject, not revenue. Matches the regular-reading wall.
//
// A JXL session is a single flat product; there is only one pack.

// ── The one paid session ─────────────────────────────────────────────────────
export const JXL_SESSION = {
  mode: "jxl_session" as const,
  name: "Ask Jxl — 1 Session",
  tagline: "Talk through what's actually happening",
  price: 600,        // cents ($6)
  displayPrice: "$6",
  firstPrice: 300,   // cents ($3) — first ever JXL, 50% off
  replies: 2,        // included replies per session
};

// ── Replies ──────────────────────────────────────────────────────────────────
export const JXL_REPLIES_PER_SESSION = 2;      // included, free, uncounted
export const JXL_FREE_SESSION_REPLIES = 2;     // the one-time free session, same shape

// Mid-conversation top-up — JXL-ONLY. Separate mode + pool from the regular
// reading reply_pack ($2). Grants jxlReplyCredits, never replyCredits.
export const JXL_REPLY_PACK = {
  mode: "jxl_reply_pack" as const,
  name: "2 More JXL Replies",
  description: "Two more replies to go deeper on what you're working through",
  price: 300,        // $3.00
  replies: 2,
};

// ── Per-conversation safety wall (unpurchasable hard stop) ────────────────────
// COUNTED replies only; the 2 included replies are not counted. Identical to the
// regular-reading wall. Resets when a new conversation starts.
export const JXL_MAX_REPLIES_PER_CONVERSATION = 8;

// ── Boundary message — shown when the wall is hit ────────────────────────────
export const JXL_CONVERSATION_CAP_MESSAGE =
  "This is a good place to stop. You have what you need on this — give it room before asking more. Come back to it fresh.";

// ── Marketing copy ───────────────────────────────────────────────────────────
export const JXL_SUBSCRIBER_BLURB = "Included with your subscription.";