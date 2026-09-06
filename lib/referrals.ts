import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  readingUsageAccounts,
  referralCodes,
  referralRedemptions,
} from "@/lib/db/schema";

export const REFERRAL_REWARD_CREDITS = 1;
export const REFERRAL_DISCOUNT_PERCENT = 0.15;

function generateCode(length = 8): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const existing = await db
    .select()
    .from(referralCodes)
    .where(eq(referralCodes.ownerUserId, userId))
    .limit(1);
  if (existing[0]) return existing[0].code;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      const inserted = await db
        .insert(referralCodes)
        .values({ code, ownerUserId: userId })
        .returning();
      return inserted[0].code;
    } catch (error) {
      const unique =
        error instanceof Error &&
        "code" in error &&
        (error as Error & { code?: string }).code === "23505";
      if (!unique) throw error;
      // The collision may be the owner's code created by another request.
      const won = await db
        .select()
        .from(referralCodes)
        .where(eq(referralCodes.ownerUserId, userId))
        .limit(1);
      if (won[0]) return won[0].code;
    }
  }
  throw new Error("Failed to generate a unique referral code after 5 attempts.");
}

export interface ReferralCodeLookup {
  codeId: string;
  ownerUserId: string;
}

export async function lookupReferralCode(
  code: string,
  redeemingUserId: string,
): Promise<ReferralCodeLookup | null> {
  if (!code?.trim()) return null;
  const rows = await db
    .select()
    .from(referralCodes)
    .where(eq(referralCodes.code, code.trim().toUpperCase()))
    .limit(1);
  const row = rows[0];
  if (!row || row.ownerUserId === redeemingUserId) return null;
  return { codeId: row.id, ownerUserId: row.ownerUserId };
}

export interface ReferralRewardResult {
  granted: boolean;
  ownerUserId: string;
  credits: number;
}

export async function getReferralOwnerById(codeId: string): Promise<string | null> {
  const rows = await db
    .select({ ownerUserId: referralCodes.ownerUserId })
    .from(referralCodes)
    .where(eq(referralCodes.id, codeId))
    .limit(1);
  return rows[0]?.ownerUserId ?? null;
}

/**
 * Verify, record, grant, and mark rewarded in one transaction. The Stripe
 * session ID is the idempotency key. A retry returns the authoritative balance
 * so Clerk can be repaired without granting the reward twice.
 */
export async function grantReferralReward(params: {
  codeId: string;
  referredUserId: string;
  stripeSessionId: string;
  rewardCreditsGranted?: number;
}): Promise<ReferralRewardResult> {
  const reward = params.rewardCreditsGranted ?? REFERRAL_REWARD_CREDITS;
  if (!Number.isSafeInteger(reward) || reward <= 0)
    throw new Error("Invalid referral reward amount.");

  return db.transaction(async (tx: any) => {
    const codeRows = await tx
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.id, params.codeId))
      .for("update");
    const code = codeRows[0];
    if (!code) throw new Error("Referral code not found.");
    if (code.ownerUserId === params.referredUserId)
      throw new Error("A user cannot redeem their own referral code.");

    const accountRows = await tx
      .select()
      .from(readingUsageAccounts)
      .where(eq(readingUsageAccounts.userId, code.ownerUserId))
      .for("update");
    const account = accountRows[0];
    if (!account) throw new Error("Referrer usage account is not initialized.");

    const inserted = await tx
      .insert(referralRedemptions)
      .values({
        codeId: params.codeId,
        referredUserId: params.referredUserId,
        stripeSessionId: params.stripeSessionId,
        rewardCreditsGranted: reward,
        rewarded: false,
      })
      .onConflictDoNothing({ target: referralRedemptions.stripeSessionId })
      .returning({ id: referralRedemptions.id });

    if (!inserted[0]) {
      const prior = await tx
        .select()
        .from(referralRedemptions)
        .where(
          and(
            eq(referralRedemptions.stripeSessionId, params.stripeSessionId),
            eq(referralRedemptions.codeId, params.codeId),
            eq(referralRedemptions.referredUserId, params.referredUserId),
          ),
        )
        .limit(1);
      if (!prior[0]?.rewarded)
        throw new Error("Referral redemption is present but incomplete.");
      return { granted: false, ownerUserId: code.ownerUserId, credits: account.credits };
    }

    const [updated] = await tx
      .update(readingUsageAccounts)
      .set({ credits: account.credits + reward, updatedAt: sql`now()` })
      .where(eq(readingUsageAccounts.userId, code.ownerUserId))
      .returning({ credits: readingUsageAccounts.credits });
    await tx
      .update(referralRedemptions)
      .set({ rewarded: true })
      .where(eq(referralRedemptions.id, inserted[0].id));
    return { granted: true, ownerUserId: code.ownerUserId, credits: updated.credits };
  });
}
