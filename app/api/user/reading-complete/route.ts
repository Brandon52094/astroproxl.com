import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// ── POST /api/user/reading-complete ──────────────────────────────────────────
// Called when a user reaches page 4 of a reading.
// Increments readingsCompleted, starts cooldown at 4, and grants JXL credits
// on the very first reading completion so JXL unlocks immediately.

const JXL_FIRST_READING_CREDITS = 6; // 1 full free JXL session (6 replies)

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

    // Grant JXL credits on first reading completion only.
    // current === 0 means this is the transition from 0 → 1 (first ever reading done).
    const isFirstReading = current === 0;
    const currentJxlCredits = Number(metadata?.jxlCredits ?? 0);
    const jxlCreditsToGrant = isFirstReading ? JXL_FIRST_READING_CREDITS : 0;

    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...metadata,
        readingsCompleted: next,
        // Always mark first reading as used so paywall triggers on next reading
        firstReadingUsed: true,
        // Grant JXL credits on first completion so the feature unlocks immediately
        ...(isFirstReading ? { jxlCredits: currentJxlCredits + jxlCreditsToGrant } : {}),
        // Start cooldown when cycle completes (4 readings done)
        ...(hitCooldown && !metadata?.cooldownStartedAt
          ? { cooldownStartedAt: new Date().toISOString() }
          : {}),
      },
    });

    console.log(
      `[reading-complete] ${userId} — readingsCompleted: ${current} → ${next}` +
      (isFirstReading ? ` — granted ${jxlCreditsToGrant} JXL credits (first reading)` : "") +
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