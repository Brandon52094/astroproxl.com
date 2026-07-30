import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// POST /api/user/claim-pwa-reading
// Called on app load when running in standalone (installed) mode. Grants a
// one-time redemption token the user can later spend as a regular OR JXL reading.
// Safe to call on every load — it no-ops after the first successful claim.
export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const meta = user.publicMetadata;

    // Already claimed → no-op. This is the guard that makes it safe to call often.
    if (meta?.pwaFreeReadingUsed === true) {
      return NextResponse.json({ granted: false, alreadyClaimed: true });
    }

    // Grant the token + stamp the flag, preserving all other metadata.
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...meta,
        pwaFreeReadingUsed: true,   // one-time flag — can never claim again
        pwaReadingToken: true,      // the redeemable token (regular OR JXL)
        pwaClaimedAt: new Date().toISOString(),
      },
    });

    console.log(`[claim-pwa-reading] granted token to ${userId}`);
    return NextResponse.json({ granted: true });
  } catch (error) {
    console.error("[claim-pwa-reading] Error:", error);
    return NextResponse.json({ error: "Failed to claim." }, { status: 500 });
  }
}