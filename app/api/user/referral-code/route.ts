
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getOrCreateReferralCode } from "@/lib/referrals";

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
    return NextResponse.json(
      { error: "Failed to get referral code." },
      { status: 500 },
    );
  }
}
