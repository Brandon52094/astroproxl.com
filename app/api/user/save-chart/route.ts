import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { birthDate, birthTime, birthPlace, lat, lng, timezone } = body;

    if (!birthDate || !birthTime || !birthPlace) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    // Save birth details and chart completion flag to Clerk public metadata
    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        chartCompleted: true,
        birthDate,
        birthTime,
        birthPlace,
        lat,
        lng,
        timezone,
        chartSavedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[save-chart] Error:", error);
    return NextResponse.json(
      { error: "Failed to save chart data." },
      { status: 500 }
    );
  }
}
