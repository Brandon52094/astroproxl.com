import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { logReadingCompleted } from "@/lib/analytics/readingAnalytics";
import {
  type MembershipPlan,
  isMembershipPlan,
  getMembershipEntitlements,
} from "@/lib/paywallConfig";

const CREDITS_PER_READING = 1;

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // ── Topic / mode ─────────────────────────────────────────────────────────

    const body = await request.json().catch(() => ({}));

    const topic =
      typeof body?.topic === "string"
        ? body.topic
        : "general";

    const readingId =
      typeof body?.readingId === "string" &&
      body.readingId.trim()
        ? body.readingId.trim()
        : null;

    const isAskAnything =
      topic === "ask-anything";

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
          : "plus_xl"
        : null;

    const manualMembershipPlan: MembershipPlan | null =
      manualMembership
        ? isMembershipPlan(storedManualPlan)
          ? storedManualPlan
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

    // ── Usage buckets ─────────────────────────────────────────────────────────

    const currentMembershipReadingsUsed =
      Number(metadata?.membershipReadingsUsed ?? 0);

    const currentMembershipJxlUsed =
      Number(metadata?.membershipJxlUsed ?? 0);

    const readingAllowance =
      entitlements?.readingsPerMonth ?? null;

    const jxlAllowance =
      entitlements?.jxlPerMonth ?? null;

    // ── Included membership allowance ────────────────────────────────────────

    const hasIncludedMemberReading =
      hasMembershipAccess &&
      (
        readingAllowance === null ||
        currentMembershipReadingsUsed < readingAllowance
      );

    const hasIncludedMemberJxl =
      hasMembershipAccess &&
      (
        jxlAllowance === null ||
        currentMembershipJxlUsed < jxlAllowance
      );

    // ── Purchased balances ────────────────────────────────────────────────────

    const currentCredits =
      Number(metadata?.credits ?? 0);

    const currentJxlCredits =
      Number(metadata?.jxlCredits ?? 0);

    // ── Decide which bucket this completion uses ─────────────────────────────

    const usesIncludedMembership =
      isAskAnything
        ? hasIncludedMemberJxl
        : hasIncludedMemberReading;

    const shouldSpendPurchasedCredit =
      !usesIncludedMembership;

    if (
      shouldSpendPurchasedCredit &&
      (
        isAskAnything
          ? currentJxlCredits < 1
          : currentCredits < CREDITS_PER_READING
      )
    ) {
      return NextResponse.json(
        {
          error: isAskAnything
            ? "No JXL credit available to complete Ask Anything."
            : "No Reading credit available to complete this reading.",
        },
        {
          status: 403,
        }
      );
    }

    // ── New balances / usage ──────────────────────────────────────────────────

    const newMembershipReadingsUsed =
      !isAskAnything && hasIncludedMemberReading
        ? currentMembershipReadingsUsed + 1
        : currentMembershipReadingsUsed;

    const newMembershipJxlUsed =
      isAskAnything && hasIncludedMemberJxl
        ? currentMembershipJxlUsed + 1
        : currentMembershipJxlUsed;

    const newCredits =
      !isAskAnything && shouldSpendPurchasedCredit
        ? currentCredits - CREDITS_PER_READING
        : currentCredits;

    const newJxlCredits =
      isAskAnything && shouldSpendPurchasedCredit
        ? currentJxlCredits - 1
        : currentJxlCredits;

    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...metadata,
        readingsCompleted: next,
        firstReadingUsed: true,
        credits: newCredits,
        jxlCredits: newJxlCredits,
        membershipReadingsUsed: newMembershipReadingsUsed,
        membershipJxlUsed: newMembershipJxlUsed,
        ...(isAskAnything
          ? {}
          : { freeRepliesRemaining: 1 }),
      },
    });

    // Analytics is observational and must never break accounting.
    if (readingId) {
      try {
        await logReadingCompleted({
          userId,
          readingId,
          topic,
          membershipPlan: effectiveMembershipPlan,
          usedMembershipAllowance: usesIncludedMembership,
          usedPurchasedCredit: shouldSpendPurchasedCredit,
        });
      } catch (analyticsError) {
        console.error(
          "[reading-complete] Analytics logging failed:",
          analyticsError
        );
      }
    }

    console.log(
      `[reading-complete] ${userId}` +
        ` — topic: ${topic}` +
        ` — readingsCompleted: ${current} → ${next}` +
        (effectiveMembershipPlan
          ? ` — plan: ${effectiveMembershipPlan}`
          : " — non-member") +
        (usesIncludedMembership
          ? isAskAnything
            ? ` — membership JXL (${currentMembershipJxlUsed} → ${newMembershipJxlUsed})`
            : ` — membership reading (${currentMembershipReadingsUsed} → ${newMembershipReadingsUsed})`
          : "") +
        (shouldSpendPurchasedCredit
          ? isAskAnything
            ? ` — deducted 1 JXL credit (${currentJxlCredits} → ${newJxlCredits})`
            : ` — deducted ${CREDITS_PER_READING} credit (${currentCredits} → ${newCredits})`
          : "")
    );

    return NextResponse.json({
      readingsCompleted: next,
      topic,
      isAskAnything,
      creditsRemaining: newCredits,
      jxlCreditsRemaining: newJxlCredits,
      membershipPlan: effectiveMembershipPlan,
      membershipReadingsUsed: newMembershipReadingsUsed,
      membershipJxlUsed: newMembershipJxlUsed,
      membershipReadingAllowance: readingAllowance,
      membershipJxlAllowance: jxlAllowance,
      usedMembershipAllowance: usesIncludedMembership,
      usedCredit:
        !isAskAnything &&
        shouldSpendPurchasedCredit,
      usedJxlCredit:
        isAskAnything &&
        shouldSpendPurchasedCredit,
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
