import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

type MembershipStatus = "active" | "paused" | "canceled";

// ── GET /api/user/credits ─────────────────────────────────────────────────────
// Cooldowns removed entirely — no more onCooldown / bypass / auto-reset logic.
// Downloads are free for everyone now, so downloadUnlocked is always true.
// Reading credits are still spent in exactly one place: reading-complete.
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const metadata = user.publicMetadata;

    const storedMembershipStatus = metadata?.membershipStatus as MembershipStatus | undefined;

    // Backward compatibility for users created before membershipStatus existed.
    const membershipStatus: MembershipStatus =
      storedMembershipStatus ??
      (metadata?.isSubscribed === true ? "active" : "canceled");

    // ── MIGRATION BLOCK ──────────────────────────────────────────────────────
    // We do NOT merge jxlReplyCredits into replyCredits yet.
    // First, we need to change the places that spend replies. Otherwise we could
    // migrate someone's balance into universal replies while some old JXL code
    // is still looking for jxlReplyCredits.
    //
    // When ready, uncomment the migration logic below and remove the jxlReplyCredits
    // field from the response.

    // ── END MIGRATION BLOCK ──────────────────────────────────────────────────

    return NextResponse.json({
      // Reading credits
      credits: Number(metadata?.credits ?? 0),

      // JXL credits
      jxlCredits: Number(metadata?.jxlCredits ?? 0),

      // Purchased universal replies
      replyCredits: Number(metadata?.replyCredits ?? 0),

      // Temporary legacy field.
      // Don't delete it from Clerk yet until JXL/follow-up consumption
      // has also been migrated to the universal reply pool.
      jxlReplyCredits: Number(metadata?.jxlReplyCredits ?? 0),

      // Subscription status
      membershipStatus,
      isSubscribed: membershipStatus === "active",
      subscriptionTier: (metadata?.subscriptionTier as string) ?? null,

      // Usage tracking
      readingsCompleted: Number(metadata?.readingsCompleted ?? 0),

      // Downloads are free for everyone
      downloadUnlocked: true,

      // Free reply tracking
      freeRepliesRemaining: Number(metadata?.freeRepliesRemaining ?? 0),

      // PWA install — one free regular reading, once ever
      pwaFreeReadingUsed: metadata?.pwaFreeReadingUsed === true,
    });
  } catch (error) {
    console.error("[credits GET] Error:", error);
    return NextResponse.json(
      { error: "Failed to get credits." },
      { status: 500 }
    );
  }
}