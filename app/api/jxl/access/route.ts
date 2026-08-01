import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// GET /api/jxl/access
// Server-authoritative check: can this user open a JXL session?
// Returns { canAccess, reason } — used by the JXL button to route to panel or paywall.
// Because this is decided server-side, closing/reopening the app can't bypass it.
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ canAccess: false, reason: "unauthorized" }, { status: 401 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const meta = user.publicMetadata;

    const jxlCredits = Number(meta?.jxlCredits ?? 0);
    const hasFreeSession = !meta?.jxlFreeUsedAt;

    // Access rule: has JXL credits OR an unused free session.
    const canAccess = jxlCredits > 0 || hasFreeSession;

    return NextResponse.json({
      canAccess,
      hasFreeSession,
      jxlCredits,
      reason: canAccess ? (hasFreeSession ? "free_session" : "credits") : "no_access",
    });
  } catch (error) {
    console.error("[jxl/access] Error:", error);
    return NextResponse.json({ canAccess: false, reason: "error" }, { status: 500 });
  }
}