import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  type MembershipStatus,
  type MembershipPlan,
  isMembershipPlan,
  getMembershipEntitlements,
} from "@/lib/paywallConfig";

// ── GET /api/user/credits ─────────────────────────────────────────────────────
// Central user access / balance / membership endpoint.
//
// Paid membership:
//   membershipStatus: "active" | "paused" | "canceled"
//   membershipPlan:   "plus" | "plus_xl"
//
// Manual membership:
//   manualMembership: true
//   manualMembershipPlan: "plus" | "plus_xl"
//
// Purchased balances remain on the account while someone is a member.
// They can be used again if membership becomes paused/canceled.
//
// Legacy active members without a membershipPlan are treated as Plus XL
// because the previous membership model provided unlimited access.
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

    // ── Membership status ────────────────────────────────────────────────────

    const storedMembershipStatus =
      metadata?.membershipStatus as MembershipStatus | undefined;

    // Backward compatibility for users created before membershipStatus existed.
    const membershipStatus: MembershipStatus =
      storedMembershipStatus ??
      (metadata?.isSubscribed === true
        ? "active"
        : "canceled");

    // ── Paid membership plan ─────────────────────────────────────────────────

    const storedMembershipPlan =
      metadata?.membershipPlan;

    const paidMembershipPlan: MembershipPlan | null =
  membershipStatus === "active"
    ? isMembershipPlan(storedMembershipPlan)
      ? storedMembershipPlan
      // Legacy paid members previously had unlimited membership.
      : "plus_xl"
    : null;

    // ── Manual / complimentary membership ────────────────────────────────────

    const manualMembership =
      metadata?.manualMembership === true;

    const storedManualMembershipPlan =
      metadata?.manualMembershipPlan;

    const manualMembershipPlan: MembershipPlan | null =
      manualMembership
        ? isMembershipPlan(storedManualMembershipPlan)
          ? storedManualMembershipPlan
          : "plus_xl"
        : null;

    // ── Effective membership ─────────────────────────────────────────────────

    const hasPaidMembership =
      membershipStatus === "active";

    const hasMembershipAccess =
      hasPaidMembership || manualMembership;

    // Manual membership intentionally overrides the paid plan while enabled.
    const effectiveMembershipPlan: MembershipPlan | null =
      manualMembership
        ? manualMembershipPlan
        : hasPaidMembership
          ? paidMembershipPlan
          : null;

    const membershipEntitlements =
      effectiveMembershipPlan
        ? getMembershipEntitlements(effectiveMembershipPlan)
        : null;

    // ── Monthly membership usage ─────────────────────────────────────────────

    const membershipReadingsUsed =
      Number(metadata?.membershipReadingsUsed ?? 0);

    const membershipJxlUsed =
      Number(metadata?.membershipJxlUsed ?? 0);

    return NextResponse.json({
      // ── Purchased balances ──
      credits: Number(metadata?.credits ?? 0),
      jxlCredits: Number(metadata?.jxlCredits ?? 0),
      replyCredits: Number(metadata?.replyCredits ?? 0),

      // TEMPORARY LEGACY BALANCE.
      jxlReplyCredits: Number(
        metadata?.jxlReplyCredits ?? 0
      ),

      // ── Membership ──
      membershipStatus,

      // Paid Stripe plan.
      membershipPlan: paidMembershipPlan,

      // Manual override.
      manualMembership,
      manualMembershipPlan,

      // The plan AstroProXL should actually use for feature access.
      effectiveMembershipPlan,

      // Existing UI can continue checking this.
      isSubscribed: hasMembershipAccess,

      // Centralized plan capabilities.
      membershipEntitlements,

      // TEMPORARY legacy field.
      subscriptionTier:
        (metadata?.subscriptionTier as string) ?? null,

      // ── Usage ──
      readingsCompleted: Number(
        metadata?.readingsCompleted ?? 0
      ),

      // Current billing-cycle usage, for member allowance display.
      membershipReadingsUsed,
      membershipJxlUsed,

      // Downloads are free for everyone.
      downloadUnlocked: true,

      // TEMPORARY legacy reply field.
      freeRepliesRemaining: Number(
        metadata?.freeRepliesRemaining ?? 0
      ),

      // PWA install reward.
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