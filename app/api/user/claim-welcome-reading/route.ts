import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// POST /api/user/claim-welcome-reading
// Welcome reward: grants ONE regular reading credit, once ever.
export async function POST() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const meta = user.publicMetadata;

    // Already claimed → no-op.
    if (meta?.welcomeReadingClaimed === true) {
      return NextResponse.json({
        granted: false,
        alreadyClaimed: true,
      });
    }

    const currentCredits = Number(meta?.credits ?? 0);

    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...meta,
        welcomeReadingClaimed: true,
        credits: currentCredits + 1,
        welcomeReadingClaimedAt: new Date().toISOString(),
      },
    });

    console.log(
      `[claim-welcome-reading] granted 1 regular credit to ${userId}`
    );

    return NextResponse.json({ granted: true });
  } catch (error) {
    console.error("[claim-welcome-reading] Error:", error);

    return NextResponse.json(
      { error: "Failed to claim welcome reading." },
      { status: 500 }
    );
  }
}