import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";

// ONE-TIME: fold jxlReplyCredits → replyCredits, then zero the old field.
// Idempotent — a second run finds jxlReplyCredits already 0 and skips.
// Guarded by a secret. Hit once after deploy, confirm the counts, then delete.
export async function POST(request: NextRequest) {
  if (request.nextUrl.searchParams.get("secret") !== process.env.MIGRATION_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const client = await clerkClient();
  const pageSize = 100;
  let offset = 0, scanned = 0, migrated = 0;
  const failures: Array<{ userId: string; error: string }> = [];

  for (;;) {
    const { data: users } = await client.users.getUserList({ limit: pageSize, offset });
    if (users.length === 0) break;

    for (const user of users) {
      scanned++;
      const meta = user.publicMetadata ?? {};
      const jxlReply = Number(meta.jxlReplyCredits ?? 0);
      if (jxlReply <= 0) continue; // nothing to fold, or already migrated

      try {
        await client.users.updateUserMetadata(user.id, {
          publicMetadata: {
            ...meta,
            replyCredits: Number(meta.replyCredits ?? 0) + jxlReply,
            jxlReplyCredits: 0,
          },
        });
        migrated++;
      } catch (err) {
        failures.push({ userId: user.id, error: String(err) });
      }
    }
    offset += pageSize;
  }

  return NextResponse.json({ scanned, migrated, failures });
}