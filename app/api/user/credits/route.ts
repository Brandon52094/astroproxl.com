import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ensureUsageAccount, getUsageAccount } from "@/lib/reading/account-store";

export async function GET() {
  const respond = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  try {
    const { userId } = await auth();
    if (!userId) return respond({ error: "Unauthorized" }, 401);

    // Clerk seeds an account once for migration. After that, Postgres is the
    // authority used by reading admission, completion, Stripe, and follow-ups.
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    await ensureUsageAccount(userId, user.publicMetadata);
    const account = await getUsageAccount(userId);
    if (!account) throw new Error("Usage account unavailable after initialization.");

    return respond({
      credits: account.credits,
      jxlCredits: account.jxlCredits,
      replyCredits: account.replyCredits,
      membershipStatus: account.membershipStatus,
      isSubscribed: account.membershipStatus === "active",
      readingsCompleted: account.readingsCompleted,
      downloadUnlocked: true,
      // Temporary display-only compatibility fields. Never use these for access.
      jxlReplyCredits: Number(user.publicMetadata?.jxlReplyCredits ?? 0),
      subscriptionTier: (user.publicMetadata?.subscriptionTier as string) ?? null,
      freeRepliesRemaining: 0,
      pwaFreeReadingUsed: user.publicMetadata?.pwaFreeReadingUsed === true,
    });
  } catch (error) {
    console.error("[credits GET] Error:", error instanceof Error ? error.name : "UnknownError");
    return respond({ error: "Failed to get credits." }, 500);
  }
}

