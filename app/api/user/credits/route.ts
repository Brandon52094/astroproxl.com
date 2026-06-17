import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks
const FREE_READING_RESET_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

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

    // ── Free weekly reading reset logic ───────────────────────────────────────
    const freeReadingUsedAt = metadata?.freeReadingUsedAt
      ? new Date(metadata.freeReadingUsedAt as string)
      : null;

    let freeReadingAvailable = !firstReadingUsed; // brand new user
    let freeReadingResetAt: string | null = null;

    if (freeReadingUsedAt && !isSubscribed) {
      const resetAt = new Date(freeReadingUsedAt.getTime() + FREE_READING_RESET_MS);
      const resetted = Date.now() >= resetAt.getTime();

      if (resetted) {
        // Weekly reset — give them a free reading again
        freeReadingAvailable = true;
        freeReadingResetAt = null;
        // Clear freeReadingUsedAt so they can take the free reading
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...metadata,
            freeReadingUsedAt: undefined,
            firstReadingUsed: false,
          },
        });
      } else {
        freeReadingAvailable = false;
        freeReadingResetAt = resetAt.toISOString();
      }
    }

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
            paywallsCompleted: 0,
            cooldownStartedAt: undefined,
            credits: 0,
            firstReadingUsed: false,
            freeReadingUsedAt: undefined,
          },
        });
      }
    }

    const canUnlockPage4 = isSubscribed || credits > 0;
    const downloadUnlocked = metadata?.downloadUnlocked === true;

    return NextResponse.json({
      credits,
      firstReadingUsed: firstReadingUsed && !freeReadingAvailable,
      paywallsCompleted,
      isSubscribed,
      canStartReading: isSubscribed || freeReadingAvailable || credits >= 4,
      canUnlockPage4,
      readingsCompleted,
      onCooldown: isSubscribed ? false : onCooldown,
      cooldownExpiresAt,
      canBypass: isSubscribed ? false : canBypass,
      downloadUnlocked,
      freeReadingResetAt, // new — countdown for UI
      freeReadingAvailable, // new — whether free reading is available
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