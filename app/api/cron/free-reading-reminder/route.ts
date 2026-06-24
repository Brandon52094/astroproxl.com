// app/api/cron/free-reading-reminder/route.ts
// Scheduled job — checks all users for free reading resets and emails them.
// Trigger this via Railway Cron, Vercel Cron, or any external scheduler hitting
// this URL once daily with the secret header.

import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { freeReadingResetEmail } from "@/lib/email/templates";

const FREE_READING_RESET_MS = 7 * 24 * 60 * 60 * 1000; // 1 week — matches credits route

export async function GET(request: NextRequest) {
  try {
    // Protect this route — only callable by the scheduler with the secret
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clerkClient();
    // Paginate through all users — Clerk returns max 500 per page
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
      try {
        const metadata = user.publicMetadata;
        const freeReadingUsedAt = metadata?.freeReadingUsedAt as string | undefined;
        const isSubscribed = metadata?.isSubscribed === true;
        const alreadyNotified = metadata?.resetNotifiedAt as string | undefined;

        // Skip subscribers — they don't have a free reading cycle
        if (isSubscribed) continue;
        // Skip users who haven't used their free reading yet — nothing to reset
        if (!freeReadingUsedAt) continue;

        const usedAt = new Date(freeReadingUsedAt).getTime();
        const resetAt = usedAt + FREE_READING_RESET_MS;
        const hasReset = Date.now() >= resetAt;

        // Skip if not reset yet, or if we already notified them for this reset cycle
        if (!hasReset) continue;
        if (alreadyNotified && new Date(alreadyNotified).getTime() > usedAt) continue;

        const email = user.emailAddresses[0]?.emailAddress;
        if (!email) continue;

        const { subject, html } = freeReadingResetEmail();

        await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/email/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": process.env.INTERNAL_API_SECRET!,
          },
          body: JSON.stringify({ to: email, subject, html }),
        });

        // Mark as notified so we don't email them again for this same reset
        await client.users.updateUserMetadata(user.id, {
          publicMetadata: {
            ...metadata,
            resetNotifiedAt: new Date().toISOString(),
          },
        });

        sentCount++;
      } catch (err) {
        console.error(`[cron/free-reading-reminder] Failed for user ${user.id}:`, err);
        errorCount++;
      }
    }

    console.log(`[cron/free-reading-reminder] Sent ${sentCount}, errors ${errorCount}, total users checked ${allUsers.length}`);

    return NextResponse.json({ sentCount, errorCount, totalChecked: allUsers.length });

  } catch (error) {
    console.error("[cron/free-reading-reminder] Unexpected error:", error);
    return NextResponse.json({ error: "Failed to run reminder job." }, { status: 500 });
  }
}