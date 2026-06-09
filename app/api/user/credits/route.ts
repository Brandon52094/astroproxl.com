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
    const firstReadingUsed = metadata?.firstReadingUsed === true;
    const paywallsCompleted = Number(metadata?.paywallsCompleted ?? 0);
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

    if (cooldownStartedAt && readingsCompleted >= 4) {
      const expiresAt = new Date(cooldownStartedAt.getTime() + COOLDOWN_MS);
      onCooldown = Date.now() < expiresAt.getTime();
      cooldownExpiresAt = expiresAt.toISOString();

      canBypass = onCooldown && (
        !bypassUsedAt ||
        bypassUsedAt.getTime() < cooldownStartedAt.getTime()
      );

      // Auto-reset if cooldown has naturally expired.
      // Resets the full cycle including firstReadingUsed so the free reading refreshes.
      // Use undefined instead of null — Clerk rejects null values in publicMetadata.
      if (!onCooldown) {
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...metadata,
            readingsCompleted: 0,
            paywallsCompleted: 0,
            cooldownStartedAt: undefined,
            credits: 0,
            firstReadingUsed: false, // free reading refreshes every cycle
          },
        });
      }
    }

    const canUnlockPage4 = isSubscribed || credits > 0;

    return NextResponse.json({
      credits,
      firstReadingUsed,
      paywallsCompleted,
      isSubscribed,
      canStartReading: isSubscribed || !firstReadingUsed || credits >= 4,
      canUnlockPage4,
      readingsCompleted,
      onCooldown: isSubscribed ? false : onCooldown,
      cooldownExpiresAt,
      canBypass: isSubscribed ? false : canBypass,
    });
  } catch (error) {
    console.error("[credits GET] Error:", error);
    return NextResponse.json({ error: "Failed to get credits." }, { status: 500 });
  }
}

// ── POST /api/user/credits ────────────────────────────────────────────────────
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