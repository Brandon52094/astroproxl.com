// app/api/admin/announce/route.ts
// Manually triggered — sends an announcement email to ALL users.
// Call this yourself whenever you ship a new feature or update.
//
// Example usage (from your terminal or a simple form):
// curl -X POST https://astroproxl.com/api/admin/announce \
//   -H "Content-Type: application/json" \
//   -H "x-admin-secret: YOUR_SECRET" \
//   -d '{"headline": "JXL is back", "body": "...", "ctaText": "Try it now", "ctaUrl": "https://astroproxl.com/jxl"}'

import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { announcementEmail } from "@/lib/email/templates";

export async function POST(request: NextRequest) {
  try {
    const adminSecret = request.headers.get("x-admin-secret");
    if (adminSecret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as {
      headline: string;
      body: string;
      ctaText?: string;
      ctaUrl?: string;
    };

    if (!body.headline || !body.body) {
      return NextResponse.json({ error: "headline and body are required." }, { status: 400 });
    }

    const { subject, html } = announcementEmail(body);

    const client = await clerkClient();
    let allUsers: Awaited<ReturnType<typeof client.users.getUserList>>["data"] = [];
    let offset = 0;
    const limit = 500;

    while (true) {
      const page = await client.users.getUserList({ limit, offset });
      allUsers = allUsers.concat(page.data);
      if (page.data.length < limit) break;
      offset += limit;
    }

    let sentCount = 0;
    let errorCount = 0;

    for (const user of allUsers) {
      const email = user.emailAddresses[0]?.emailAddress;
      if (!email) continue;

      try {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/email/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": process.env.INTERNAL_API_SECRET!,
          },
          body: JSON.stringify({ to: email, subject, html }),
        });
        sentCount++;
        // Small delay to stay under Resend rate limits on free tier
        await new Promise((r) => setTimeout(r, 150));
      } catch (err) {
        console.error(`[admin/announce] Failed for ${email}:`, err);
        errorCount++;
      }
    }

    console.log(`[admin/announce] Sent ${sentCount}, errors ${errorCount}`);

    return NextResponse.json({ sentCount, errorCount, totalUsers: allUsers.length });

  } catch (error) {
    console.error("[admin/announce] Unexpected error:", error);
    return NextResponse.json({ error: "Failed to send announcement." }, { status: 500 });
  }
}