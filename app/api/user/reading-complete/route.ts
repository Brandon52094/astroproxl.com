import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// ── POST /api/user/reading-complete ──────────────────────────────────────────
// Called when a user reaches the page 4 paywall (whether they pay or dismiss).
// Increments readingsCompleted and sets cooldownStartedAt when it hits 4.
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

    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...metadata,
        readingsCompleted: next,
        ...(hitCooldown && !metadata?.cooldownStartedAt
          ? { cooldownStartedAt: new Date().toISOString() }
          : {}),
      },
    });

    console.log(
      `[reading-complete] ${userId} — readingsCompleted: ${current} → ${next}` +
      (hitCooldown ? " — cooldown started" : "")
    );

    return NextResponse.json({ readingsCompleted: next, cooldownStarted: hitCooldown });
  } catch (error) {
    console.error("[reading-complete] Error:", error);
    return NextResponse.json({ error: "Failed to record reading completion." }, { status: 500 });
  }
}