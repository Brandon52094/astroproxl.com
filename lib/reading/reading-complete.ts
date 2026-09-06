import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { planReadingCompletion, ReadingUsageError } from "./usage-policy";
import type { ReadingUsageReceipt, ReadingUsageStore } from "./usage-store";

class CompletionError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type ReadingCompletionResult =
  | { skipped: true; reason: "safe_response"; readingId: string }
  | { skipped: false; alreadyRecorded: boolean; receipt: ReadingUsageReceipt };

/** Shared by the initial delivery and the completion POST; Direct Align never bills. */
export function recordReadingCompletion(
  store: ReadingUsageStore,
  userId: string,
  readingId: string,
): Promise<ReadingCompletionResult> {
  return store.transaction(userId, async (tx) => {
    // Look up the durable receipt before the expiring chart session. An old retry
    // must not debit again, re-stamp its free date, refill replies, or repeat a bonus.
    const previous = await tx.getReceipt(readingId);
    if (previous) {
      if (previous.userId !== userId || previous.readingId !== readingId)
        throw new CompletionError(404, "Reading not found.");
      return { skipped: false, alreadyRecorded: true, receipt: previous };
    }
    const reading = await tx.getReading(readingId);
    if (!reading || reading.id !== readingId || reading.userId !== userId)
      throw new CompletionError(404, "Reading not found.");
    if (reading.isSafeResponse) return { skipped: true, reason: "safe_response", readingId };
    if (!reading.initialReady)
      throw new CompletionError(409, "The reading is not ready to record.");
    // Compute time after obtaining the account lock, not before waiting for it.
    const now = Date.now();
    if (!Number.isFinite(Date.parse(reading.expiresAt)) || Date.parse(reading.expiresAt) <= now)
      throw new CompletionError(410, "This reading has expired.");
    const plan = planReadingCompletion(await tx.getAccount(), reading.admission, now);
    const receipt: ReadingUsageReceipt = {
      readingId,
      userId,
      recordedAt: new Date(now).toISOString(),
      kind: plan.kind,
      readingsCompleted: plan.accountPatch.readingsCompleted,
      jxlCreditsGranted: plan.jxlCreditsGranted,
      creditsRemaining: plan.accountPatch.credits,
      includedReplies: plan.includedReplies,
    };
    await tx.patchAccount(plan.accountPatch);
    await tx.insertReplyAllowance(readingId, plan.includedReplies);
    await tx.insertReceipt(receipt);
    return { skipped: false, alreadyRecorded: false, receipt };
  });
}

/** Wire the returned function to app/api/user/reading-complete/route.ts POST. */
export function createReadingCompleteHandler(store: ReadingUsageStore) {
  return async function POST(request: Request) {
    const respond = (body: unknown, status = 200) =>
      NextResponse.json(body, {
        status,
        headers: { "Cache-Control": "no-store" },
      });
    try {
      const { userId } = await auth();
      if (!userId) return respond({ error: "Unauthorized" }, 401);
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(userId);
      await store.ensureAccount(userId, clerkUser.publicMetadata);
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return respond({ error: "Send the reading ID as JSON." }, 400);
      }
      const readingId =
        body && typeof body === "object" && !Array.isArray(body) && "readingId" in body
          ? body.readingId
          : null;
      if (
        typeof readingId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          readingId,
        )
      )
        return respond({ error: "A valid reading ID is required." }, 400);
      const result = await recordReadingCompletion(store, userId, readingId);
      if (result.skipped) return respond(result);
      const receipt = result.receipt;
      return respond({
        readingId: receipt.readingId,
        alreadyRecorded: result.alreadyRecorded,
        readingsCompleted: receipt.readingsCompleted,
        jxlCreditsGranted: receipt.jxlCreditsGranted,
        wasFree: receipt.kind === "free",
        creditsRemaining: receipt.creditsRemaining,
        includedReplies: receipt.includedReplies,
      });
    } catch (error) {
      if (error instanceof CompletionError) return respond({ error: error.message }, error.status);
      if (error instanceof ReadingUsageError) {
        const status =
          error.code === "INSUFFICIENT_CREDITS"
            ? 403
            : error.code === "ELIGIBILITY_CHANGED"
              ? 409
              : 503;
        return respond(
          {
            error:
              status === 503 ? "Reading accounting is temporarily unavailable." : error.message,
            code: error.code,
          },
          status,
        );
      }
      console.error(
        "[reading-complete] Failed to commit completion",
        error instanceof Error ? error.name : "UnknownError",
      );
      return respond({ error: "Failed to record reading completion. Please try again." }, 500);
    }
  };
}
