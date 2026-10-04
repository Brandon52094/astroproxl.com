import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { MembershipStatus } from "@/lib/paywallConfig";

// ── GET /api/user/credits ─────────────────────────────────────────────────────
// Central user access/balance endpoint.
//
// Membership:
//   active   → unlimited Reading + JXL access and member-only content
//   paused   → falls back to normal purchased-credit access
//   canceled → falls back to normal purchased-credit access
//
// manualMembership:
//   true     → grants member access regardless of membershipStatus.
//              Use this to comp specific users without touching Stripe.
//
// Purchased balances remain on the account even while someone is a member.
// They can be used again if membership becomes paused/canceled.
export async function GET() {
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

    const storedMembershipStatus =
      metadata?.membershipStatus as MembershipStatus | undefined;

    // Backward compatibility for users who existed before
    // membershipStatus was introduced.
    const membershipStatus: MembershipStatus =
      storedMembershipStatus ??
      (metadata?.isSubscribed === true
        ? "active"
        : "canceled");

    const manualMembership =
      metadata?.manualMembership === true;

    const hasMembershipAccess =
      membershipStatus === "active" || manualMembership;

    return NextResponse.json({
      // ── Purchased balances ──
      credits: Number(metadata?.credits ?? 0),
      jxlCredits: Number(metadata?.jxlCredits ?? 0),
      replyCredits: Number(metadata?.replyCredits ?? 0),

      // TEMPORARY LEGACY BALANCE.
      // Remove only after all JXL/follow-up consumers use replyCredits.
      jxlReplyCredits: Number(
        metadata?.jxlReplyCredits ?? 0
      ),

      // ── Membership ──
      membershipStatus,
      manualMembership,

      // Compatibility convenience flag for existing UI.
      // Paid OR manually comped users get member access.
      isSubscribed: hasMembershipAccess,

      // TEMPORARY legacy field.
      // New membership has no Base/Plus tier.
      subscriptionTier:
        (metadata?.subscriptionTier as string) ?? null,

      // ── Usage ──
      readingsCompleted: Number(
        metadata?.readingsCompleted ?? 0
      ),

      // Downloads are free for everyone.
      downloadUnlocked: true,

      // TEMPORARY legacy reply field.
      freeRepliesRemaining: Number(
        metadata?.freeRepliesRemaining ?? 0
      ),

      // One free PWA Reading, once ever.
      pwaFreeReadingUsed:
        metadata?.pwaFreeReadingUsed === true,
    });
  } catch (error) {
    console.error("[credits GET] Error:", error);

    return NextResponse.json(
      { error: "Failed to get credits." },
      { status: 500 }
    );
  }
}