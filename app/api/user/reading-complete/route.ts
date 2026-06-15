import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const JXL_FIRST_READING_CREDITS = 6;
const CREDITS_PER_READING = 12; // cost of one reading

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

    const currentJxlCredits = Number(metadata?.jxlCredits ?? 0);
    const jxlCreditsToGrant = isFirstReading ? JXL_FIRST_READING_CREDITS : 0;

    // Deduct reading credits after completion — except for free first reading
    // and subscribers (unlimited readings)
    const currentCredits = Number(metadata?.credits ?? 0);
    const newCredits = (!isFirstReading && !isSubscribed)
      ? Math.max(0, currentCredits - CREDITS_PER_READING)
      : currentCredits;

    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...metadata,
        readingsCompleted: next,
        firstReadingUsed: true,
        credits: newCredits,
        ...(isFirstReading ? { jxlCredits: currentJxlCredits + jxlCreditsToGrant } : {}),
        ...(hitCooldown && !metadata?.cooldownStartedAt
          ? { cooldownStartedAt: new Date().toISOString() }
          : {}),
      },
    });

    console.log(
      `[reading-complete] ${userId} — readingsCompleted: ${current} → ${next}` +
      (isFirstReading ? ` — granted ${jxlCreditsToGrant} JXL credits (first reading)` : "") +
      (!isFirstReading && !isSubscribed ? ` — deducted ${CREDITS_PER_READING} credits (${currentCredits} → ${newCredits})` : "") +
      (hitCooldown ? " — cooldown started" : "")
    );

    return NextResponse.json({
      readingsCompleted: next,
      cooldownStarted: hitCooldown,
      jxlCreditsGranted: jxlCreditsToGrant,
    });
  } catch (error) {
    console.error("[reading-complete] Error:", error);
    return NextResponse.json({ error: "Failed to record reading completion." }, { status: 500 });
  }
}