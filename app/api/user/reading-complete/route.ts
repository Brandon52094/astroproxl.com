import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const JXL_FIRST_READING_CREDITS = 6;
const CREDITS_PER_READING = 4; // must match readings/route.ts eligibility gate
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
    const next = Math.min(current + 1, 4);
    const hitCooldown = next === 4;
    const isFirstReading = current === 0;
    const isSubscribed = metadata?.isSubscribed === true;

    // ── Was THIS reading free, or paid with credits? ──────────────────────────
    // Mirror the EXACT eligibility logic in /api/readings so the gate and the
    // accounting never drift. A reading is "free" when the weekly free slot is
    // available; otherwise it was paid for out of the credit balance.
    //
    // This is the fix for the leak: the old code only stamped freeReadingUsedAt
    // when isFirstReading was true. After the first reading, readingsCompleted
    // was no longer 0, so the weekly free reading NEVER re-stamped — which left
    // the reset gate permanently open (now >= a fixed old date is always true),
    // handing out unlimited free readings from week two onward. We now re-stamp
    // on every free reading, first or weekly.
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
        freeRepliesRemaining: 2,
        jxlCredits: isFirstReading
          ? currentJxlCredits + jxlCreditsToGrant
          : currentJxlCredits,
        // Re-stamp on EVERY free reading (first OR weekly), not just the first.
        // This is what keeps the weekly reset from staying permanently open.
        ...(tookFreeReading ? { freeReadingUsedAt: new Date().toISOString() } : {}),
        ...(hitCooldown && !metadata?.cooldownStartedAt
          ? { cooldownStartedAt: new Date().toISOString() }
          : {}),
      },
    });

    console.log(
      `[reading-complete] ${userId} — readingsCompleted: ${current} → ${next}` +
        (isFirstReading ? ` — granted ${jxlCreditsToGrant} JXL credits` : "") +
        (tookFreeReading ? " — free reading, re-stamped freeReadingUsedAt" : "") +
        (paidWithCredits ? ` — deducted ${CREDITS_PER_READING} credits (${currentCredits} → ${newCredits})` : "") +
        (isSubscribed ? " — subscriber, no charge" : "") +
        (hitCooldown ? " — cooldown started" : "")
    );

    return NextResponse.json({
      readingsCompleted: next,
      cooldownStarted: hitCooldown,
      jxlCreditsGranted: jxlCreditsToGrant,
      wasFree: tookFreeReading,
      creditsRemaining: newCredits,
    });
  } catch (error) {
    console.error("[reading-complete] Error:", error);
    return NextResponse.json({ error: "Failed to record reading completion." }, { status: 500 });
  }
}