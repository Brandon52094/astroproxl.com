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
    const readingsCompleted = Number(metadata?.readingsCompleted ?? 0);
    const isSubscribed = metadata?.isSubscribed === true;
    const jxlUnlimited = metadata?.jxlUnlimited === true; // set by subscription webhook

    // ── Cycle cooldown check ──────────────────────────────────────────────────
    let onCycleCooldown = false;
    let cycleResetsAt: string | null = null;

    if (jxlCycleStartedAt && jxlSessionsPurchased >= JXL_MAX_SESSIONS_PER_CYCLE) {
      const expiresAt = new Date(jxlCycleStartedAt.getTime() + JXL_CYCLE_COOLDOWN_MS);
      onCycleCooldown = Date.now() < expiresAt.getTime();
      cycleResetsAt = expiresAt.toISOString();

      // Auto-reset if cooldown has naturally expired
      // Use undefined not null — Clerk rejects null in publicMetadata
      if (!onCycleCooldown) {
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...metadata,
            jxlSessionsPurchased: 0,
            jxlCycleStartedAt: undefined,
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
      !jxlUnlimited &&
      jxlSessionsPurchased >= JXL_MAX_SESSIONS_PER_CYCLE &&
      onCycleCooldown;

    // ── Unlock state ──────────────────────────────────────────────────────────
    // JXL unlocks after first reading completion (readingsCompleted >= 1)
    const isUnlocked = isSubscribed || jxlUnlimited || readingsCompleted >= 1;

    return NextResponse.json({
      isUnlocked,
      jxlCredits,
      jxlUnlimited,           // subscribers have unlimited JXL
      jxlSessionsPurchased,
      canUseFreebie,
      freebieResetsAt,
      freebieReplies: JXL_FREEBIE_REPLIES,
      onCycleCooldown: (isSubscribed || jxlUnlimited) ? false : onCycleCooldown,
      cycleResetsAt: (isSubscribed || jxlUnlimited) ? null : cycleResetsAt,
      nextTier,
      nextPack,
      showCaringMessage: (isSubscribed || jxlUnlimited) ? false : showCaringMessage,
      caringMessage: showCaringMessage ? JXL_CARING_MESSAGE : null,
      subscriberCanBuyMore: false, // subscribers have unlimited — no top-up needed in JXL
      isSubscribed,
      maxSessionsPerCycle: JXL_MAX_SESSIONS_PER_CYCLE,
    });

  } catch (error) {
    console.error("[jxl/session] Error:", error);
    return NextResponse.json({ error: "Failed to get session." }, { status: 500 });
  }
}