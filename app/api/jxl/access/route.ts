import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const meta = user.publicMetadata;

    const jxlCredits = Number(meta?.jxlCredits ?? 0);

    // JXL is credits-only. Entry requires a JXL credit — matches the gate in
    // /api/jxl/ask, which grants a new session only when jxlCredits > 0.
    const canAccess = jxlCredits > 0;

    return NextResponse.json({
      canAccess,
      jxlCredits,
      reason: canAccess ? "credits" : "no_access",
    });
  } catch (error) {
    console.error("[jxl/access] Error:", error);
    return NextResponse.json({ error: "Failed to check JXL access." }, { status: 500 });
  }
}