import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  JXL_FREEBIE_COOLDOWN_MS,
  JXL_FREEBIE_REPLIES,
  JXL_CYCLE_COOLDOWN_MS,
  JXL_MAX_SESSIONS_PER_CYCLE,
  JXL_CARING_MESSAGE,
  JXL_PACKS,
  getNextJxlTier,
} from "@/lib/jxlConfig";

// ── GET /api/jxl/session ──────────────────────────────────────────────────────
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const metadata = user.publicMetadata;

    const jxlCredits = Number(metadata?.jxlCredits ?? 0);
    const jxlSessionsPurchased = Number(metadata?.jxlSessionsPurchased ?? 0);
    const jxlCycleStartedAt = metadata?.jxlCycleStartedAt
      ? new Date(metadata.jxlCycleStartedAt as string)
      : null;
    const jxlFreeUsedAt = metadata?.jxlFreeUsedAt
      ? new Date(metadata.jxlFreeUsedAt as string)
      : null;
    const paywallsCompleted = Number(metadata?.paywallsCompleted ?? 0);
    const isSubscribed = metadata?.isSubscribed === true;

    // ── Cycle cooldown check ──────────────────────────────────────────────────
    let onCycleCooldown = false;
    let cycleResetsAt: string | null = null;

    if (jxlCycleStartedAt && jxlSessionsPurchased >= JXL_MAX_SESSIONS_PER_CYCLE) {
      const expiresAt = new Date(jxlCycleStartedAt.getTime() + JXL_CYCLE_COOLDOWN_MS);
      onCycleCooldown = Date.now() < expiresAt.getTime();
      cycleResetsAt = expiresAt.toISOString();

      // Auto-reset if cooldown has naturally expired
      if (!onCycleCooldown) {
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...metadata,
            jxlSessionsPurchased: 0,
            jxlCycleStartedAt: null,
            jxlCredits: 0,
          },
        });
      }
    }

    // ── Freebie eligibility ───────────────────────────────────────────────────
    // Freebie resets every 4 weeks — independent of 2-week cycle reset
    const freebieExpired = jxlFreeUsedAt
      ? Date.now() - jxlFreeUsedAt.getTime() > JXL_FREEBIE_COOLDOWN_MS
      : true;

    // If cycle reset but freebie hasn't reset yet — skip freebie, go to Session 1
    const canUseFreebie = freebieExpired && !onCycleCooldown;
    const freebieResetsAt = jxlFreeUsedAt && !freebieExpired
      ? new Date(jxlFreeUsedAt.getTime() + JXL_FREEBIE_COOLDOWN_MS).toISOString()
      : null;

    // ── Next purchasable session ──────────────────────────────────────────────
    const nextTier = getNextJxlTier(jxlSessionsPurchased);
    const nextPack = nextTier ? JXL_PACKS[nextTier] : null;

    // ── Caring message ────────────────────────────────────────────────────────
    const showCaringMessage =
      !isSubscribed &&
      jxlSessionsPurchased >= JXL_MAX_SESSIONS_PER_CYCLE &&
      onCycleCooldown;

    // ── Unlock state ──────────────────────────────────────────────────────────
    const isUnlocked = isSubscribed || paywallsCompleted >= 1;

    // ── Subscriber overflow — can buy from Session 1 ladder ──────────────────
    const subscriberCanBuyMore = isSubscribed && jxlCredits <= 0;

    return NextResponse.json({
      isUnlocked,
      jxlCredits,
      jxlSessionsPurchased,
      canUseFreebie,
      freebieResetsAt,
      freebieReplies: JXL_FREEBIE_REPLIES,
      onCycleCooldown: isSubscribed ? false : onCycleCooldown,
      cycleResetsAt: isSubscribed ? null : cycleResetsAt,
      nextTier,
      nextPack,
      showCaringMessage: isSubscribed ? false : showCaringMessage,
      caringMessage: showCaringMessage ? JXL_CARING_MESSAGE : null,
      subscriberCanBuyMore,
      isSubscribed,
      maxSessionsPerCycle: JXL_MAX_SESSIONS_PER_CYCLE,
    });

  } catch (error) {
    console.error("[jxl/session] Error:", error);
    return NextResponse.json({ error: "Failed to get session." }, { status: 500 });
  }
}