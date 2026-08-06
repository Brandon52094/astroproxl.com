import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// ── GET /api/user/credits ─────────────────────────────────────────────────────
// Cooldowns removed entirely — no more onCooldown / bypass / auto-reset logic.
// Downloads are free for everyone now, so downloadUnlocked is always effectively
// true. Reading credits are still spent in exactly one place: reading-complete.
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const metadata = user.publicMetadata;

    // ── First-load initialization ──────────────────────────────────────────
    // If this account has never had its fields written, initialize the full
    // set so everything is present and editable in the Clerk dashboard.
    if (metadata?.credits === undefined) {
      const defaults = {
        ...metadata,
        credits: 0,
        jxlCredits: 0,
        replyCredits: 0,
        jxlReplyCredits: 0,
        isSubscribed: false,
        subscriptionTier: null,
        firstReadingUsed: false,
        firstPaidReadingUsed: false,
        pwaFreeReadingUsed: false,
        readingsCompleted: 0,
      };
      await client.users.updateUserMetadata(userId, { publicMetadata: defaults });
      // Use the defaults for the rest of this request so the response is correct
      Object.assign(metadata ?? {}, defaults);
    }

    return NextResponse.json({
      credits: Number(metadata?.credits ?? 0),
      jxlCredits: Number(metadata?.jxlCredits ?? 0),
      jxlReplyCredits: Number(metadata?.jxlReplyCredits ?? 0),
      replyCredits: Number(metadata?.replyCredits ?? 0),
      isSubscribed: metadata?.isSubscribed === true,
      subscriptionTier: (metadata?.subscriptionTier as string) ?? null,
      readingsCompleted: Number(metadata?.readingsCompleted ?? 0),
      downloadUnlocked: true, // free for everyone now
      freeRepliesRemaining: Number(metadata?.freeRepliesRemaining ?? 0),
      pwaFreeReadingUsed: metadata?.pwaFreeReadingUsed === true,
    });
  } catch (error) {
    console.error("[credits GET] Error:", error);
    return NextResponse.json({ error: "Failed to get credits." }, { status: 500 });
  }
}