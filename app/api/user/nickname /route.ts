import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

// GET — returns the user's saved nickname, or null if not set
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const nickname = (user.publicMetadata?.nickname as string | undefined) ?? null;

    return NextResponse.json({ nickname });
  } catch (error) {
    console.error("[nickname] GET error:", error);
    return NextResponse.json({ error: "Failed to load nickname." }, { status: 500 });
  }
}

// POST — saves a new nickname, max 24 characters, trimmed
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const rawNickname = body.nickname as string | undefined;

    if (!rawNickname || typeof rawNickname !== "string") {
      return NextResponse.json({ error: "Nickname is required." }, { status: 400 });
    }

    const nickname = rawNickname.trim().slice(0, 24);
    if (nickname.length === 0) {
      return NextResponse.json({ error: "Nickname cannot be empty." }, { status: 400 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);

    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...user.publicMetadata,
        nickname,
      },
    });

    return NextResponse.json({ nickname });
  } catch (error) {
    console.error("[nickname] POST error:", error);
    return NextResponse.json({ error: "Failed to save nickname." }, { status: 500 });
  }
}
