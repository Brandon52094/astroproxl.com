// lib/jxlConfig.ts

//
// JXL access model
//
// • JXL is a premium session priced at $12.99.
// • Each JXL session includes 3 replies tied to that conversation.
// • After those 3 included replies are used, the user may continue
//   the same conversation using universal replyCredits.
// • Subscribers do not spend replyCredits while continuing JXL.
// • No separate JXL-only reply wallet or JXL reply pack.
//
// SAFETY WALL
//
// • Hard stop at 8 TOTAL replies per JXL conversation.
// • The 3 included replies count toward those 8.
// • This resets when the user starts a new JXL conversation.
//

export const JXL_SESSION = {
  mode: "jxl_session" as const,
  name: "Ask Jxl — 1 Session",
  tagline: "Talk through what's actually happening",

  price: 1299,
  displayPrice: "$12.99",

  replies: 3,
};

export const JXL_REPLIES_PER_SESSION = 3;

export const JXL_FREE_SESSION_REPLIES = 3;

export const JXL_MAX_REPLIES_PER_CONVERSATION = 8;

export const JXL_CONVERSATION_CAP_MESSAGE =
  "This conversation has reached its limit. Start a new JXL whenever you're ready.";

export const JXL_SUBSCRIBER_BLURB =
  "Included with your subscription.";