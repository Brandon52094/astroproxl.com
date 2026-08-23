import { db } from "@/lib/db";
import { referralCodes, referralRedemptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

  if (existing.length > 0) {
    return existing[0].code;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      const inserted = await db
        .insert(referralCodes)
        .values({ code, ownerUserId: userId })
        .returning();
      return inserted[0].code;
    } catch (err) {
      const isUniqueViolation =
        err instanceof Error && "code" in err && (err as { code?: string }).code === "23505";
      if (!isUniqueViolation) throw err;
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
  redeemingUserId: string
): Promise<ReferralCodeLookup | null> {
  if (!code?.trim()) return null;

  const rows = await db
    .select()
    .from(referralCodes)
    .where(eq(referralCodes.code, code.trim().toUpperCase()))
    .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0];

  if (row.ownerUserId === redeemingUserId) return null;

  return { codeId: row.id, ownerUserId: row.ownerUserId };
}

export async function recordRedemption(params: {
  codeId: string;
  referredUserId: string;
  stripeSessionId: string;
  rewardCreditsGranted: number;
}): Promise<boolean> {
  try {
    await db.insert(referralRedemptions).values({
      codeId: params.codeId,
      referredUserId: params.referredUserId,
      stripeSessionId: params.stripeSessionId,
      rewardCreditsGranted: params.rewardCreditsGranted,
      rewarded: true,
    });
    return true;
  } catch (err) {
    const isUniqueViolation =
      err instanceof Error && "code" in err && (err as { code?: string }).code === "23505";
    if (isUniqueViolation) return false;
    throw err;
  }
}
