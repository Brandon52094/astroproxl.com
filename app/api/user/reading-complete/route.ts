import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const JXL_FIRST_READING_CREDITS = 0;
const CREDITS_PER_READING = 1;

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
    const metadata = user.publicMetadata;

    const current = Number(metadata?.readingsCompleted ?? 0);
    const next = current + 1;

    const isFirstReading = current === 0;

    // ── Membership access ────────────────────────────────────────────────────
    // Paid Stripe members OR manually comped users have unlimited access.
    const membershipStatus =
      metadata?.membershipStatus as string | undefined;

    const manualMembership =
      metadata?.manualMembership === true;

    const isSubscribed =
      membershipStatus === "active" ||
      manualMembership;

    // ── Reading credit accounting ────────────────────────────────────────────
    // Non-members spend 1 regular Reading credit per completed reading.
    // Members keep their purchased/welcome credits untouched.
    const currentCredits = Number(metadata?.credits ?? 0);

    const newCredits = isSubscribed
      ? currentCredits
      : Math.max(
          0,
          currentCredits - CREDITS_PER_READING
        );

    // ── JXL first-reading bonus ───────────────────────────────────────────────
    // Currently disabled.
    const currentJxlCredits =
      Number(metadata?.jxlCredits ?? 0);

    const jxlCreditsToGrant =
      isFirstReading
        ? JXL_FIRST_READING_CREDITS
        : 0;

    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...metadata,

        readingsCompleted: next,
        firstReadingUsed: true,

        credits: newCredits,

        // Regular readings include 1 free reply.
        freeRepliesRemaining: 1,

        jxlCredits:
          currentJxlCredits + jxlCreditsToGrant,
      },
    });

    console.log(
      `[reading-complete] ${userId} — readingsCompleted: ${current} → ${next}` +
        (isFirstReading
          ? ` — granted ${jxlCreditsToGrant} JXL credits`
          : "") +
        (!isSubscribed
          ? ` — deducted ${CREDITS_PER_READING} reading credit (${currentCredits} → ${newCredits})`
          : "") +
        (isSubscribed
          ? " — member, no credit deducted"
          : "")
    );

    return NextResponse.json({
      readingsCompleted: next,
      jxlCreditsGranted: jxlCreditsToGrant,
      creditsRemaining: newCredits,
      isSubscribed,
    });
  } catch (error) {
    console.error("[reading-complete] Error:", error);

    return NextResponse.json(
      { error: "Failed to record reading completion." },
      { status: 500 }
    );
  }
}