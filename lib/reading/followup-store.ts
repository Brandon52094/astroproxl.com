import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  readingFollowupClaims,
  readingReplyAllowances,
  readingUsageAccounts,
  readingUsageReceipts,
} from "@/lib/db/schema";

export type FollowupAccessTier = "included" | "credit";
export type FollowupResponse = {
  title: string;
  content: string;
  careNote?: string | null;
  replyMeta: {
    accessTier: FollowupAccessTier;
    usedIncludedReply: boolean;
    includedRepliesRemaining: number;
    replyCreditsRemaining: number;
    isSubscribed: boolean;
    unlimitedReplies: false;
  };
};

export type FollowupClaim =
  | { state: "acquired"; accessTier: FollowupAccessTier; meta: FollowupResponse["replyMeta"] }
  | { state: "complete"; response: FollowupResponse }
  | { state: "busy" }
  | { state: "not_found" }
  | { state: "payment_required"; includedRepliesRemaining: 0; replyCreditsRemaining: 0 };

export async function claimFollowup(
  userId: string,
  readingId: string,
  requestId: string,
): Promise<FollowupClaim> {
  return db.transaction(async (tx: any) => {
    const accountRows = await tx
      .select()
      .from(readingUsageAccounts)
      .where(eq(readingUsageAccounts.userId, userId))
      .for("update");
    const account = accountRows[0];
    if (!account) return { state: "not_found" } as const;

    const existing = await tx
      .select()
      .from(readingFollowupClaims)
      .where(
        and(
          eq(readingFollowupClaims.requestId, requestId),
          eq(readingFollowupClaims.userId, userId),
          eq(readingFollowupClaims.readingId, readingId),
        ),
      )
      .limit(1);
    if (existing[0]) {
      if (existing[0].state === "complete" && existing[0].response)
        return { state: "complete", response: existing[0].response as FollowupResponse };
      return { state: "busy" };
    }

    const receipt = await tx
      .select({ readingId: readingUsageReceipts.readingId })
      .from(readingUsageReceipts)
      .where(
        and(
          eq(readingUsageReceipts.readingId, readingId),
          eq(readingUsageReceipts.userId, userId),
        ),
      )
      .limit(1);
    if (!receipt[0]) return { state: "not_found" } as const;

    const allowanceRows = await tx
      .select()
      .from(readingReplyAllowances)
      .where(
        and(
          eq(readingReplyAllowances.readingId, readingId),
          eq(readingReplyAllowances.userId, userId),
        ),
      )
      .for("update");
    const allowance = allowanceRows[0];
    const accessTier: FollowupAccessTier | null =
      allowance && allowance.remaining > 0
        ? "included"
        : account.replyCredits > 0
          ? "credit"
          : null;
    if (!accessTier)
      return {
        state: "payment_required",
        includedRepliesRemaining: 0,
        replyCreditsRemaining: 0,
      };

    let includedRepliesRemaining = allowance?.remaining ?? 0;
    let replyCreditsRemaining = account.replyCredits;
    if (accessTier === "included") {
      includedRepliesRemaining -= 1;
      await tx
        .update(readingReplyAllowances)
        .set({ remaining: includedRepliesRemaining, updatedAt: sql`now()` })
        .where(
          and(
            eq(readingReplyAllowances.readingId, readingId),
            eq(readingReplyAllowances.userId, userId),
          ),
        );
    } else {
      replyCreditsRemaining -= 1;
      await tx
        .update(readingUsageAccounts)
        .set({ replyCredits: replyCreditsRemaining, updatedAt: sql`now()` })
        .where(eq(readingUsageAccounts.userId, userId));
    }

    await tx.insert(readingFollowupClaims).values({
      requestId,
      readingId,
      userId,
      accessTier,
    });
    return {
      state: "acquired",
      accessTier,
      meta: {
        accessTier,
        usedIncludedReply: accessTier === "included",
        includedRepliesRemaining,
        replyCreditsRemaining,
        isSubscribed: account.membershipStatus === "active",
        unlimitedReplies: false,
      },
    };
  });
}

export async function completeFollowup(
  userId: string,
  readingId: string,
  requestId: string,
  response: FollowupResponse,
) {
  const updated = await db
    .update(readingFollowupClaims)
    .set({ state: "complete", response, updatedAt: sql`now()` })
    .where(
      and(
        eq(readingFollowupClaims.requestId, requestId),
        eq(readingFollowupClaims.userId, userId),
        eq(readingFollowupClaims.readingId, readingId),
        eq(readingFollowupClaims.state, "pending"),
      ),
    )
    .returning({ requestId: readingFollowupClaims.requestId });
  if (updated.length !== 1) throw new Error("Follow-up claim was lost before completion.");
}

/** Refund the exact reserved unit after a failed/invalid model response. */
export async function releaseFollowup(userId: string, readingId: string, requestId: string) {
  await db.transaction(async (tx: any) => {
    const accountRows = await tx
      .select()
      .from(readingUsageAccounts)
      .where(eq(readingUsageAccounts.userId, userId))
      .for("update");
    if (!accountRows[0]) return;
    const claimRows = await tx
      .select()
      .from(readingFollowupClaims)
      .where(
        and(
          eq(readingFollowupClaims.requestId, requestId),
          eq(readingFollowupClaims.userId, userId),
          eq(readingFollowupClaims.readingId, readingId),
        ),
      )
      .for("update");
    const claim = claimRows[0];
    if (!claim || claim.state !== "pending") return;
    if (claim.accessTier === "included") {
      await tx
        .update(readingReplyAllowances)
        .set({ remaining: sql`${readingReplyAllowances.remaining} + 1`, updatedAt: sql`now()` })
        .where(
          and(
            eq(readingReplyAllowances.readingId, readingId),
            eq(readingReplyAllowances.userId, userId),
          ),
        );
    } else {
      await tx
        .update(readingUsageAccounts)
        .set({ replyCredits: sql`${readingUsageAccounts.replyCredits} + 1`, updatedAt: sql`now()` })
        .where(eq(readingUsageAccounts.userId, userId));
    }
    await tx
      .delete(readingFollowupClaims)
      .where(eq(readingFollowupClaims.requestId, requestId));
  });
}
