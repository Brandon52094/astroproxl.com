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
    const metadata = user.publicMetadata;

    // Accept the chart if either the chartCompleted flag is set,
    // or if birthDate is present (handles users whose flag was never written)
    const hasChart = metadata?.chartCompleted === true || !!metadata?.birthDate;

    if (!hasChart) {
      return NextResponse.json({ chart: null });
    }

    return NextResponse.json({
      chart: {
        birthDate: metadata.birthDate,
        birthTime: metadata.birthTime,
        birthPlace: metadata.birthPlace,
        lat: metadata.lat,
        lng: metadata.lng,
        timezone: metadata.timezone,
        chartSavedAt: metadata.chartSavedAt,
      },
    });
  } catch (error) {
    console.error("[get-chart] Error:", error);
    return NextResponse.json(
      { error: "Failed to get chart data." },
      { status: 500 }
    );
  }
}