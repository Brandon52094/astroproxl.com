import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// POST /api/user/claim-pwa-reading
// Install reward: grants ONE regular reading credit, once ever.
export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const meta = user.publicMetadata;

    // Already claimed → no-op. Safe to call on every load.
    if (meta?.pwaFreeReadingUsed === true) {
      return NextResponse.json({ granted: false, alreadyClaimed: true });
    }

    const currentCredits = Number(meta?.credits ?? 0);

    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...meta,
        pwaFreeReadingUsed: true,        // one-time flag
        credits: currentCredits + 1,     // 1 free regular reading
        pwaClaimedAt: new Date().toISOString(),
      },
    });

    console.log(`[claim-pwa-reading] granted 1 regular credit to ${userId}`);
    return NextResponse.json({ granted: true });
  } catch (error) {
    console.error("[claim-pwa-reading] Error:", error);
    return NextResponse.json({ error: "Failed to claim." }, { status: 500 });
  }
}