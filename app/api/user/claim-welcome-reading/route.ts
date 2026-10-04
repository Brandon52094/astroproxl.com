import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// POST /api/user/claim-welcome-reading
// Welcome reward: grants ONE regular reading credit, once ever,
// and initializes manual membership control in Clerk.
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

    const hasManualMembershipField =
      typeof meta?.manualMembership === "boolean";

    const alreadyClaimed =
      meta?.welcomeReadingClaimed === true;

    // If both are already set up, nothing else to do.
    if (alreadyClaimed && hasManualMembershipField) {
      return NextResponse.json({
        granted: false,
        alreadyClaimed: true,
      });
    }

    const currentCredits = Number(meta?.credits ?? 0);

    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...meta,

        // Initialize this once so it appears in Clerk.
        manualMembership:
          hasManualMembershipField
            ? meta.manualMembership
            : false,

        // Only grant the welcome credit once.
        ...(alreadyClaimed
          ? {}
          : {
              welcomeReadingClaimed: true,
              credits: currentCredits + 1,
              welcomeReadingClaimedAt: new Date().toISOString(),
            }),
      },
    });

    if (!alreadyClaimed) {
      console.log(
        `[claim-welcome-reading] granted 1 regular credit to ${userId}`
      );
    }

    return NextResponse.json({
      granted: !alreadyClaimed,
    });
  } catch (error) {
    console.error("[claim-welcome-reading] Error:", error);

    return NextResponse.json(
      { error: "Failed to claim welcome reading." },
      { status: 500 }
    );
  }
}