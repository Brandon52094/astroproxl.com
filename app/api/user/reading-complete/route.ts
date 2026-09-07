import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const JXL_FIRST_READING_CREDITS = 6;
const CREDITS_PER_READING = 1; // 1 credit = 1 reading (was 4)
const FREE_READING_RESET_MS = 7 * 24 * 60 * 60 * 1000; // 1 week — must match readings/route.ts

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const metadata = user.publicMetadata;

    const current = Number(metadata?.readingsCompleted ?? 0);
    const next = current + 1; // no cap — cooldowns removed, counter just tracks
    const isFirstReading = current === 0;
    const isSubscribed = metadata?.isSubscribed === true;

    // ── Was THIS reading free, or paid with credits? ──────────────────────────
    // Mirror the eligibility logic in /api/readings so the gate and accounting
    // never drift. A reading is "free" when the weekly free slot is available;
    // otherwise it was paid for out of the credit balance.
    const firstReadingUsed = metadata?.firstReadingUsed === true;
    const freeReadingUsedAt = metadata?.freeReadingUsedAt
      ? new Date(metadata.freeReadingUsedAt as string)
      : null;
    let freeReadingAvailable = !firstReadingUsed;
    if (freeReadingUsedAt && !isSubscribed) {
      freeReadingAvailable = Date.now() >= freeReadingUsedAt.getTime() + FREE_READING_RESET_MS;
    }
    const tookFreeReading = !isSubscribed && freeReadingAvailable;
    const paidWithCredits = !isSubscribed && !freeReadingAvailable;

    const currentJxlCredits = Number(metadata?.jxlCredits ?? 0);
    const jxlCreditsToGrant = isFirstReading ? JXL_FIRST_READING_CREDITS : 0;

    const currentCredits = Number(metadata?.credits ?? 0);
    const newCredits = paidWithCredits
      ? Math.max(0, currentCredits - CREDITS_PER_READING)
      : currentCredits;

    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...metadata,
        readingsCompleted: next,
        firstReadingUsed: true,
        credits: newCredits,
        freeRepliesRemaining: 1, // regular readings include 1 free reply
        jxlCredits: isFirstReading
          ? currentJxlCredits + jxlCreditsToGrant
          : currentJxlCredits,
        // Re-stamp on EVERY free reading (first OR weekly), keeping the weekly
        // reset from staying permanently open.
        ...(tookFreeReading ? { freeReadingUsedAt: new Date().toISOString() } : {}),
      },
    });

    console.log(
      `[reading-complete] ${userId} — readingsCompleted: ${current} → ${next}` +
        (isFirstReading ? ` — granted ${jxlCreditsToGrant} JXL credits` : "") +
        (tookFreeReading ? " — free reading, re-stamped freeReadingUsedAt" : "") +
        (paidWithCredits ? ` — deducted ${CREDITS_PER_READING} credit (${currentCredits} → ${newCredits})` : "") +
        (isSubscribed ? " — subscriber, no charge" : "")
    );

    return NextResponse.json({
      readingsCompleted: next,
      jxlCreditsGranted: jxlCreditsToGrant,
      wasFree: tookFreeReading,
      creditsRemaining: newCredits,
    });
  } catch (error) {
    console.error("[reading-complete] Error:", error);
    return NextResponse.json({ error: "Failed to record reading completion." }, { status: 500 });
  }
}