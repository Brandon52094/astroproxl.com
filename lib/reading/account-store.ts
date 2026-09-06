import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { readingUsageAccounts, stripeFulfillments } from "@/lib/db/schema";
import { readReadingAccount } from "./usage-policy";

export type MembershipStatus = "active" | "paused" | "canceled";

export async function ensureUsageAccount(
  userId: string,
  metadata: Record<string, unknown>,
) {
  const account = readReadingAccount(metadata);
  await db
    .insert(readingUsageAccounts)
    .values({
      userId,
      membershipStatus: account.membershipStatus,
      isSubscribed: account.isSubscribed,
      credits: account.credits,
      replyCredits: account.replyCredits,
      readingsCompleted: account.readingsCompleted,
      firstReadingUsed: account.firstReadingUsed,
      freeReadingUsedAt: account.freeReadingUsedAt
        ? new Date(account.freeReadingUsedAt)
        : null,
      jxlCredits: account.jxlCredits,
    })
    .onConflictDoNothing({ target: readingUsageAccounts.userId });
}

export async function getUsageAccount(userId: string) {
  const rows = await db
    .select()
    .from(readingUsageAccounts)
    .where(eq(readingUsageAccounts.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** All purchased grants and membership changes enter the authoritative ledger here. */
export async function mutateUsageAccount(
  userId: string,
  mutation: {
    credits?: number;
    replyCredits?: number;
    jxlCredits?: number;
    membershipStatus?: MembershipStatus;
  },
) {
  return db.transaction(async (tx: any) => {
    const rows = await tx
      .select()
      .from(readingUsageAccounts)
      .where(eq(readingUsageAccounts.userId, userId))
      .for("update");
    const current = rows[0];
    if (!current) throw new Error("Usage account is not initialized.");
    const membershipStatus = mutation.membershipStatus ??
      (current.membershipStatus as MembershipStatus);
    const [updated] = await tx
      .update(readingUsageAccounts)
      .set({
        credits: Math.max(0, current.credits + (mutation.credits ?? 0)),
        replyCredits: Math.max(0, current.replyCredits + (mutation.replyCredits ?? 0)),
        jxlCredits: Math.max(0, current.jxlCredits + (mutation.jxlCredits ?? 0)),
        membershipStatus,
        isSubscribed: membershipStatus === "active",
        updatedAt: sql`now()`,
      })
      .where(eq(readingUsageAccounts.userId, userId))
      .returning();
    return updated;
  });
}

/** Claim a Stripe object and apply its balance mutation in one DB commit. */
export async function fulfillUsageAccount(
  userId: string,
  stripeObjectId: string,
  eventType: string,
  mutation: Parameters<typeof mutateUsageAccount>[1],
) {
  return db.transaction(async (tx: any) => {
    const inserted = await tx
      .insert(stripeFulfillments)
      .values({ stripeObjectId, eventType, userId })
      .onConflictDoNothing({ target: stripeFulfillments.stripeObjectId })
      .returning({ id: stripeFulfillments.id });
    const rows = await tx
      .select()
      .from(readingUsageAccounts)
      .where(eq(readingUsageAccounts.userId, userId))
      .for("update");
    const current = rows[0];
    if (!current) throw new Error("Usage account is not initialized.");
    if (!inserted[0]) return { applied: false, account: current };
    const membershipStatus = mutation.membershipStatus ??
      (current.membershipStatus as MembershipStatus);
    const [account] = await tx
      .update(readingUsageAccounts)
      .set({
        credits: Math.max(0, current.credits + (mutation.credits ?? 0)),
        replyCredits: Math.max(0, current.replyCredits + (mutation.replyCredits ?? 0)),
        jxlCredits: Math.max(0, current.jxlCredits + (mutation.jxlCredits ?? 0)),
        membershipStatus,
        isSubscribed: membershipStatus === "active",
        updatedAt: sql`now()`,
      })
      .where(eq(readingUsageAccounts.userId, userId))
      .returning();
    return { applied: true, account };
  });
}
