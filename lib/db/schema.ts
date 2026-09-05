import { pgTable, text, timestamp, uuid, boolean, integer } from "drizzle-orm/pg-core";

// One row per user who has a referral code. Code is unique and indexed for
// fast lookup at checkout time — "who owns code XYZ123" needs to be cheap.
export const referralCodes = pgTable("referral_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  ownerUserId: text("owner_user_id").notNull().unique(), // Clerk user ID — one code per user
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One row per successful redemption. Ties a purchase back to the code that
// was used, so we can grant the reward exactly once per purchase and audit
// it later if something looks off.
export const referralRedemptions = pgTable("referral_redemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  codeId: uuid("code_id").notNull().references(() => referralCodes.id),
  referredUserId: text("referred_user_id").notNull(), // Clerk user ID of the buyer
  stripeSessionId: text("stripe_session_id").notNull().unique(), // idempotency guard
  rewardCreditsGranted: integer("reward_credits_granted").notNull().default(0),
  rewarded: boolean("rewarded").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── NEW TABLE: Stripe Fulfillment Ledger ──
// One row per Stripe object that has already granted something to a user.
//
// stripeObjectId is typically:
//   • Checkout Session ID for purchases/subscription starts
//   • Invoice ID for subscription renewals
//
// UNIQUE prevents Stripe retries from granting the same credits twice.
export const stripeFulfillments = pgTable("stripe_fulfillments", {
  id: uuid("id").primaryKey().defaultRandom(),

  stripeObjectId: text("stripe_object_id").notNull().unique(),

  eventType: text("event_type").notNull(),

  userId: text("user_id"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});