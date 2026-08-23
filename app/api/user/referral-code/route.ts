import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getOrCreateReferralCode } from "@/lib/referrals";

// GET /api/user/referral-code
// Returns the logged-in user's personal referral code, creating one on
// first request if they don't have one yet. Safe to call on every load of
// whatever screen displays "share your code" — getOrCreateReferralCode is
// idempotent, so repeated calls just return the same existing code.
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const code = await getOrCreateReferralCode(userId);

    return NextResponse.json({ code });
  } catch (error) {
    console.error("[referral-code] Error:", error);
    return NextResponse.json({ error: "Failed to get referral code." }, { status: 500 });
  }
}
