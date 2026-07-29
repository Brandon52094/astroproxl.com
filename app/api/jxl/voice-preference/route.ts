import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ preference: "unset" });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const preference = (user.publicMetadata?.voicePreference as string) ?? "unset";

  return NextResponse.json({ preference });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 });

  const { preference } = (await req.json()) as { preference?: string };
  if (!["granted", "denied", "unset"].includes(preference ?? "")) {
    return NextResponse.json({ ok: false, error: "bad preference" }, { status: 400 });
  }

  const client = await clerkClient();
  // Merge, don't clobber — preserve chartCompleted, birthDate, etc.
  const user = await client.users.getUser(userId);
  await client.users.updateUser(userId, {
    publicMetadata: {
      ...user.publicMetadata,
      voicePreference: preference,
    },
  });

  return NextResponse.json({ ok: true });
}