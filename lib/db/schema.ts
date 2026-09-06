import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Existing tables retained.
export const referralCodes = pgTable("referral_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  ownerUserId: text("owner_user_id").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const referralRedemptions = pgTable("referral_redemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  codeId: uuid("code_id")
    .notNull()
    .references(() => referralCodes.id),
  referredUserId: text("referred_user_id").notNull(),
  stripeSessionId: text("stripe_session_id").notNull().unique(),
  rewardCreditsGranted: integer("reward_credits_granted").notNull().default(0),
  rewarded: boolean("rewarded").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const stripeFulfillments = pgTable("stripe_fulfillments", {
  id: uuid("id").primaryKey().defaultRandom(),
  stripeObjectId: text("stripe_object_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  userId: text("user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Full private calculation and prompt snapshot for the two-stage reading.
export const readingSessions = pgTable(
  "reading_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    admission: jsonb("admission").notNull(),
    context: jsonb("context").notNull(),
    initial: jsonb("initial").notNull(),
    answers: jsonb("answers"),
    answerKey: text("answer_key"),
    completion: jsonb("completion"),
    leaseId: uuid("lease_id"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    alignmentAttempts: integer("alignment_attempts").notNull().default(0),
  },
  (table) => [
    index("reading_sessions_user_idx").on(table.userId),
    index("reading_sessions_expiry_idx").on(table.expiresAt),
  ],
);

// Authoritative reading-use balances. Clerk can mirror these values after commit.
export const readingUsageAccounts = pgTable("reading_usage_accounts", {
  userId: text("user_id").primaryKey(),
  membershipStatus: text("membership_status").notNull().default("canceled"),
  isSubscribed: boolean("is_subscribed").notNull().default(false),
  credits: integer("credits").notNull().default(0),
  replyCredits: integer("reply_credits").notNull().default(0),
  readingsCompleted: integer("readings_completed").notNull().default(0),
  firstReadingUsed: boolean("first_reading_used").notNull().default(false),
  freeReadingUsedAt: timestamp("free_reading_used_at", { withTimezone: true }),
  jxlCredits: integer("jxl_credits").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// One durable, idempotent claim per follow-up request. The response is cached so
// a retry after a lost network response never spends twice or regenerates.
export const readingFollowupClaims = pgTable(
  "reading_followup_claims",
  {
    requestId: uuid("request_id").primaryKey(),
    readingId: uuid("reading_id").notNull(),
    userId: text("user_id").notNull(),
    accessTier: text("access_tier").notNull(),
    state: text("state").notNull().default("pending"),
    response: jsonb("response"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("reading_followup_claims_reading_idx").on(table.readingId, table.userId),
  ],
);

// Long-lived idempotency receipt. Keep this after the private session expires.
export const readingUsageReceipts = pgTable(
  "reading_usage_receipts",
  {
    readingId: uuid("reading_id").primaryKey(),
    userId: text("user_id").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    kind: text("kind").notNull(),
    readingsCompleted: integer("readings_completed").notNull(),
    jxlCreditsGranted: integer("jxl_credits_granted").notNull(),
    creditsRemaining: integer("credits_remaining").notNull(),
    includedReplies: integer("included_replies").notNull(),
  },
  (table) => [index("reading_usage_receipts_user_idx").on(table.userId)],
);

export const readingReplyAllowances = pgTable(
  "reading_reply_allowances",
  {
    readingId: uuid("reading_id").notNull(),
    userId: text("user_id").notNull(),
    included: integer("included").notNull(),
    remaining: integer("remaining").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.readingId, table.userId] }),
    uniqueIndex("reading_reply_allowances_reading_unique").on(table.readingId),
  ],
);
