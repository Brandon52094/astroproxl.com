import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  type MembershipPlan,
  isMembershipPlan,
  getMembershipEntitlements,
} from "@/lib/paywallConfig";

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

    // ── Overall reading count ────────────────────────────────────────────────

    const current =
      Number(metadata?.readingsCompleted ?? 0);

    const next = current + 1;

    // ── Resolve effective membership ─────────────────────────────────────────

    const membershipStatus =
      metadata?.membershipStatus as string | undefined;

    const manualMembership =
      metadata?.manualMembership === true;

    const storedPaidPlan =
      metadata?.membershipPlan;

    const storedManualPlan =
      metadata?.manualMembershipPlan;

    const paidMembershipPlan: MembershipPlan | null =
      membershipStatus === "active"
        ? isMembershipPlan(storedPaidPlan)
          ? storedPaidPlan
          // Legacy active subscribers had unlimited access.
          : "plus_xl"
        : null;

    const manualMembershipPlan: MembershipPlan | null =
      manualMembership
        ? isMembershipPlan(storedManualPlan)
          ? storedManualPlan
          // Existing manually comped users retain full access.
          : "plus_xl"
        : null;

    const effectiveMembershipPlan: MembershipPlan | null =
      manualMembership
        ? manualMembershipPlan
        : paidMembershipPlan;

    const entitlements =
      effectiveMembershipPlan
        ? getMembershipEntitlements(effectiveMembershipPlan)
        : null;

    const hasMembershipAccess =
      effectiveMembershipPlan !== null;

    // ── Monthly member Reading usage ─────────────────────────────────────────

    const currentMembershipReadingsUsed =
      Number(metadata?.membershipReadingsUsed ?? 0);

    const readingAllowance =
      entitlements?.readingsPerMonth ?? null;

    const hasIncludedMemberReading =
      hasMembershipAccess &&
      (
        readingAllowance === null ||
        currentMembershipReadingsUsed < readingAllowance
      );

    // Track member usage even for XL.
    // For XL this is informational because the allowance is unlimited.
    const newMembershipReadingsUsed =
  hasIncludedMemberReading
    ? currentMembershipReadingsUsed + 1
    : currentMembershipReadingsUsed;

    // ── Purchased / welcome credit accounting ────────────────────────────────
    //
    // Non-members spend credits normally.
    //
    // Astro Plus:
    //   first 16 monthly Readings use membership allowance.
    //   Reading #17+ falls back to purchased/welcome credits.
    //
    // Astro Plus XL:
    //   unlimited, so purchased credits are never touched.

    const currentCredits =
      Number(metadata?.credits ?? 0);

    const shouldSpendCredit =
      !hasIncludedMemberReading;

    const newCredits =
      shouldSpendCredit
        ? Math.max(
            0,
            currentCredits - CREDITS_PER_READING
          )
        : currentCredits;

    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...metadata,

        readingsCompleted: next,
        firstReadingUsed: true,

        credits: newCredits,

        membershipReadingsUsed:
          newMembershipReadingsUsed,

        // Regular readings include 1 reply.
        freeRepliesRemaining: 1,
      },
    });

    console.log(
      `[reading-complete] ${userId}` +
        ` — readingsCompleted: ${current} → ${next}` +
        (effectiveMembershipPlan
          ? ` — plan: ${effectiveMembershipPlan}`
          : " — non-member") +
        (hasIncludedMemberReading
          ? ` — membership reading (${currentMembershipReadingsUsed} → ${newMembershipReadingsUsed})`
          : "") +
        (shouldSpendCredit
          ? ` — deducted ${CREDITS_PER_READING} credit (${currentCredits} → ${newCredits})`
          : "")
    );

    return NextResponse.json({
      readingsCompleted: next,

      creditsRemaining: newCredits,

      membershipPlan:
        effectiveMembershipPlan,

      membershipReadingsUsed:
        newMembershipReadingsUsed,

      membershipReadingAllowance:
        readingAllowance,

      usedMembershipAllowance:
        hasIncludedMemberReading,

      usedCredit:
        shouldSpendCredit,
    });
  } catch (error) {
    console.error(
      "[reading-complete] Error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to record reading completion.",
      },
      {
        status: 500,
      }
    );
  }
}