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
      pwaReadingToken: metadata?.pwaReadingToken === true,
    });
  } catch (error) {
    console.error("[credits GET] Error:", error);
    return NextResponse.json({ error: "Failed to get credits." }, { status: 500 });
  }
}