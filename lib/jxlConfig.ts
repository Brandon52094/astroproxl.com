// lib/jxlConfig.ts
//
// JXL access model — rebuilt from the old 5-tier ($4.99 × 5) design.
//
//   • One FREE session, ever (the hook — experience the accuracy once).
//   • $6 per session after that, 3 replies each.
//   • Out of replies mid-session → $2 for 2 more (reuses the existing
//     reply_pack checkout/webhook, so nothing new to build there).
//   • Subscribers get JXL with CAPS, not "unlimited":
//       ~10 sessions / month, max 2 / day, 8 replies max per conversation.
//     Daily caps protect the person from spiralling; the monthly cap protects
//     margin from the rare heavy tail. Nobody healthy hits these.
//
// The old JxlTier / JXL_PACKS session-ladder is gone. A JXL session is now a
// single flat product, so there is only one pack.

// ── The one paid session ─────────────────────────────────────────────────────
export const JXL_SESSION = {
  mode: "jxl_session" as const,
  name: "Ask Jxl — 1 Session",
  tagline: "3 replies · talk through what's actually happening",
  price: 600, // cents
  displayPrice: "$6",
  replies: 3,
};

// ── Replies ──────────────────────────────────────────────────────────────────
export const JXL_REPLIES_PER_SESSION = 3;

// Mid-session top-up reuses the reply_pack you already built ($2 → 2 replies).
export const JXL_REPLY_PACK_MODE = "reply_pack" as const;

// ── Free session (one, ever) ─────────────────────────────────────────────────
// Presence of `jxlFreeUsedAt` in metadata means the free session is spent.
// There is intentionally NO renewal window — this is a one-time hook.
export const JXL_FREE_SESSION_REPLIES = 3;

// ── Subscriber caps ──────────────────────────────────────────────────────────
// Safety first, cost second. Daily cap is the one that matters for wellbeing:
// a spiral happens in an evening, not across a month.
export const JXL_SUB_MAX_PER_DAY = 2;
export const JXL_SUB_MAX_PER_MONTH = 10;

// Reply ceiling per conversation, for everyone. Past this it's re-asking, not
// clarity — so it's a wellbeing limit, not just a paid one.
export const JXL_MAX_REPLIES_PER_CONVERSATION = 8;

// ── Boundary message — shown when a cap is hit ───────────────────────────────
export const JXL_DAILY_CAP_MESSAGE =
  "You've had two sessions today. Sit with what came through — the chart keeps moving even when you're not watching. Come back tomorrow.";

export const JXL_MONTHLY_CAP_MESSAGE =
  "You've used your sessions for this month. That's not a limit on you — it's space to let the work land. The next window opens next month.";

export const JXL_CONVERSATION_CAP_MESSAGE =
  "This is a good place to stop. You have what you need — give it room before asking more.";

// ── Marketing copy ───────────────────────────────────────────────────────────
// Deliberately NOT "unlimited" — honest, and it doesn't set up the one person
// who hits a cap to feel cheated.
export const JXL_SUBSCRIBER_BLURB = "Included with your subscription — as much as you'll realistically need.";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Local-day key (YYYY-MM-DD) for daily-cap counting. */
export function jxlDayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Month key (YYYY-MM) for monthly-cap counting. */
export function jxlMonthKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 7);
}