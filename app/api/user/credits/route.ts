import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks

// ── GET /api/user/credits ─────────────────────────────────────────────────────
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const metadata = user.publicMetadata;

    const credits = Number(metadata?.credits ?? 0);
    const isSubscribed = metadata?.isSubscribed === true;
    const readingsCompleted = Number(metadata?.readingsCompleted ?? 0);

    // ── Cooldown logic ────────────────────────────────────────────────────────
    const cooldownStartedAt = metadata?.cooldownStartedAt
      ? new Date(metadata.cooldownStartedAt as string)
      : null;

    const bypassUsedAt = metadata?.bypassUsedAt
      ? new Date(metadata.bypassUsedAt as string)
      : null;

    let onCooldown = false;
    let cooldownExpiresAt: string | null = null;
    let canBypass = false;

    if (cooldownStartedAt) {
      const expiresAt = new Date(cooldownStartedAt.getTime() + COOLDOWN_MS);
      onCooldown = Date.now() < expiresAt.getTime();
      cooldownExpiresAt = expiresAt.toISOString();

      canBypass = onCooldown && (
        !bypassUsedAt ||
        bypassUsedAt.getTime() < cooldownStartedAt.getTime()
      );

      // Auto-reset if cooldown has naturally expired
      if (!onCooldown) {
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...metadata,
            readingsCompleted: 0,
            cooldownStartedAt: undefined,
          },
        });
      }
    }

    const downloadUnlocked = metadata?.downloadUnlocked === true;

    return NextResponse.json({
      credits,
      isSubscribed,
      readingsCompleted,
      onCooldown: isSubscribed ? false : onCooldown,
      cooldownExpiresAt,
      canBypass: isSubscribed ? false : canBypass,
      downloadUnlocked,
      freeRepliesRemaining: Number(metadata?.freeRepliesRemaining ?? 0),
    });
  } catch (error) {
    console.error("[credits GET] Error:", error);
    return NextResponse.json({ error: "Failed to get credits." }, { status: 500 });
  }
}

// ── POST /api/user/credits — deduct credits (admin can add via Clerk dashboard) ──
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const pageNumber = Number(body.pageNumber);

    if (!pageNumber || pageNumber < 1 || pageNumber > 4) {
      return NextResponse.json({ error: "Invalid pageNumber" }, { status: 400 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const metadata = user.publicMetadata;

    const currentCredits = Number(metadata?.credits ?? 0);
    const COST_PER_PAGE = 4;
    const newCredits = Math.max(0, currentCredits - COST_PER_PAGE);

    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...metadata,
        credits: newCredits,
      },
    });

    console.log(
      `[credits POST] page ${pageNumber} — deducted ${COST_PER_PAGE} credits from ${userId}. ` +
      `${currentCredits} → ${newCredits}`
    );

    return NextResponse.json({ credits: newCredits });
  } catch (error) {
    console.error("[credits POST] Error:", error);
    return NextResponse.json({ error: "Failed to deduct credits." }, { status: 500 });
  }
}