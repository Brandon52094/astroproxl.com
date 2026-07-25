import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { clerkClient } from "@clerk/nextjs/server";
import { trackServerPurchase } from "@/lib/tiktokEvents";
import { JXL_REPLIES_PER_SESSION } from "@/lib/jxlConfig";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("[webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.log("[webhook] event type:", event.type, "metadata:", JSON.stringify((event.data.object as any).metadata));

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const mode = session.metadata?.mode as
      | "one_time"
      | "subscription"
      | "bypass"
      | "jxl_session"
      | "subscriber_topup"
      | "reading_download"
      | "followup"
      | "bundle"
      | "reply_pack"
      | undefined;

    if (!userId || !mode) {
      console.error("[webhook] Missing userId or mode in metadata");
      return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
    }

    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const meta = user.publicMetadata;
      const userEmail = user.emailAddresses[0]?.emailAddress;

      const currentCredits = Number(meta?.credits ?? 0);
      const currentReplyCredits = Number(meta?.replyCredits ?? 0);
      const currentJxlCredits = Number(meta?.jxlCredits ?? 0);
      const paywallIndex = Number(session.metadata?.paywallIndex ?? 0);

      // ── Fire TikTok Purchase event for every revenue-generating mode ────────
      // Fired once here, before the mode-specific branches, using the actual
      // amount charged. event_id = session.id for automatic deduplication.
      if (mode !== undefined) {
        await trackServerPurchase({
          email: userEmail,
          amountCents: session.amount_total ?? 0,
          currency: (session.currency ?? "usd").toUpperCase(),
          eventId: session.id,
        });
      }

      // ── One-time reading purchase ───────────────────────────────────────────
      if (mode === "one_time") {
        const credits = Number(session.metadata?.credits ?? 0);
        const jxlCredits = Number(session.metadata?.jxlCredits ?? 0);

        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            credits: currentCredits + credits,
            firstReadingUsed: true,
            // Once true, the $2 first-paid-reading price never applies again.
            firstPaidReadingUsed: true,
            paywallsCompleted: paywallIndex,
            lastPurchaseAt: new Date().toISOString(),
            ...(jxlCredits > 0 ? { jxlCredits: currentJxlCredits + jxlCredits } : {}),
          },
        });

        console.log(
          `[webhook] one_time — granted ${credits} reading credits` +
          (session.metadata?.isFirstPaidReading === "true" ? " ($2 first-paid entry)" : " ($4)") +
          (jxlCredits > 0 ? ` + ${jxlCredits} Jxl credits` : "") +
          ` to ${userId}. Paywall ${paywallIndex} complete.`
        );

      // ── Reading bundle purchase ──────────────────────────────────────────────
      } else if (mode === "bundle") {
        const bundleCredits = Number(session.metadata?.credits ?? 0);
        const bundleTier = session.metadata?.bundleTier ?? "";

        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            credits: currentCredits + bundleCredits,
            firstReadingUsed: true,
            lastPurchaseAt: new Date().toISOString(),
          },
        });

        console.log(
          `[webhook] bundle — granted ${bundleCredits} reading credits (tier ${bundleTier}) to ${userId}.`
        );

      // ── Subscription ────────────────────────────────────────────────────────
       } else if (mode === "subscription") {
        const stripeSubscriptionId = session.subscription as string;
        const tier = session.metadata?.tier ?? "sub_base";
        const SUBSCRIPTION_READING_CREDITS = 32;

        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            firstReadingUsed: true,
            isSubscribed: true,
            jxlUnlimited: true,
            downloadUnlocked: true,
            subscriptionId: stripeSubscriptionId,
            subscriptionTier: tier,
            subscriptionStartedAt: new Date().toISOString(),
            paywallsCompleted: 4,
            credits: currentCredits + SUBSCRIPTION_READING_CREDITS,
            lastPurchaseAt: new Date().toISOString(),
          },
        });

        console.log(
          `[webhook] subscription — activated ${tier} for ${userId}. ` +
          `Granted ${SUBSCRIPTION_READING_CREDITS} reading credits + unlimited JXL + free downloads.`
        );

      // ── Subscriber top-up ───────────────────────────────────────────────────
      } else if (mode === "subscriber_topup") {
        const TOPUP_CREDITS = 16;

        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            credits: currentCredits + TOPUP_CREDITS,
            lastPurchaseAt: new Date().toISOString(),
          },
        });

        console.log(
          `[webhook] subscriber_topup — granted ${TOPUP_CREDITS} reading credits to ${userId}.`
        );

      // ── Cooldown bypass ─────────────────────────────────────────────────────
      } else if (mode === "bypass") {
        await client.users.updateUser(userId, {
          publicMetadata: {
            lat: meta.lat,
            lng: meta.lng,
            timezone: meta.timezone,
            birthDate: meta.birthDate,
            birthTime: meta.birthTime,
            birthPlace: meta.birthPlace,
            chartSavedAt: meta.chartSavedAt,
            chartCompleted: meta.chartCompleted,
            downloadUnlocked: meta.downloadUnlocked ?? false,
            jxlFreeUsedAt: meta.jxlFreeUsedAt,
            isSubscribed: meta.isSubscribed ?? false,
            jxlUnlimited: meta.jxlUnlimited ?? false,
            subscriptionId: meta.subscriptionId,
            subscriptionTier: meta.subscriptionTier,
            credits: 0,
            firstReadingUsed: false,
            readingsCompleted: 0,
            paywallsCompleted: 0,
            jxlCredits: 0,
            jxlSessionsPurchased: 0,
            bypassUsedAt: new Date().toISOString(),
            lastPurchaseAt: new Date().toISOString(),
          },
        });

        console.log(`[webhook] bypass — full cycle reset for ${userId}. cooldownStartedAt removed via updateUser.`);

      // ── Reading download — $1.00 ───────────────────────────────────────────
      } else if (mode === "reading_download") {
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            downloadUnlocked: true,
            lastPurchaseAt: new Date().toISOString(),
          },
        });
        console.log(`[webhook] reading_download — unlocked for ${userId}.`);

      // ── Ask JXL session — $6.00 → 3 replies ─────────────────────────────────
      // One flat product now; the old 5-tier ladder is gone. Grants replies into
      // jxlCredits; the ask route spends one per reply.
      } else if (mode === "jxl_session") {
        const replies = Number(session.metadata?.jxlReplies ?? JXL_REPLIES_PER_SESSION);

        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            jxlCredits: currentJxlCredits + replies,
            lastPurchaseAt: new Date().toISOString(),
          },
        });

        console.log(
          `[webhook] jxl_session — granted ${replies} JXL replies to ${userId}. ` +
          `Total JXL credits: ${currentJxlCredits + replies}`
        );

      // ── Reply pack — $2.00 for 2 follow-up replies ──────────────────────────
      // Grants replyCredits ONLY. Never touches `credits` (readings) or
      // `readingsCompleted` — reply spending and reading spending are fully
      // separate pools, which is the whole point of this system.
      } else if (mode === "reply_pack") {
        const replyCreditsToGrant = Number(session.metadata?.replyCredits ?? 0);

        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            replyCredits: currentReplyCredits + replyCreditsToGrant,
            lastPurchaseAt: new Date().toISOString(),
          },
        });

        console.log(
          `[webhook] reply_pack — granted ${replyCreditsToGrant} reply credits to ${userId}. ` +
          `Total reply credits: ${currentReplyCredits + replyCreditsToGrant}`
        );

      } else if (mode === "followup") {
        console.log(`[webhook] followup — $2 charged to ${userId}.`);
      }

    } catch (err) {
      console.error("[webhook] CRITICAL — Stripe charged but Clerk update failed.", {
        userId,
        mode,
        sessionId: session.id,
        amount: session.amount_total,
        paywallIndex: session.metadata?.paywallIndex ?? null,
        jxlTier: session.metadata?.jxlTier ?? null,
        tier: session.metadata?.tier ?? null,
        error: String(err),
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
    }
  }

  // ── Subscription cancelled ──────────────────────────────────────────────────
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const userId = subscription.metadata?.userId;

    if (userId) {
      try {
        const client = await clerkClient();
        const user = await client.users.getUser(userId);

        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...user.publicMetadata,
            isSubscribed: false,
            jxlUnlimited: false,
            subscriptionId: undefined,
            subscriptionTier: undefined,
            subscriptionCancelledAt: new Date().toISOString(),
          },
        });

        console.log(`[webhook] subscription cancelled for ${userId}`);
      } catch (err) {
        console.error("[webhook] CRITICAL — Failed to update cancelled subscription.", {
          userId,
          subscriptionId: subscription.id,
          error: String(err),
          timestamp: new Date().toISOString(),
        });
        return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}