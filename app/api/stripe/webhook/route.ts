import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { clerkClient } from "@clerk/nextjs/server";

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
      | "jxl"
      | "subscriber_topup"
      | "reading_download"
      | undefined;

    if (!userId || !mode) {
      console.error("[webhook] Missing userId or mode in metadata");
      return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
    }

    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const meta = user.publicMetadata;

      const currentCredits = Number(meta?.credits ?? 0);
      const currentJxlCredits = Number(meta?.jxlCredits ?? 0);
      const currentJxlSessionsPurchased = Number(meta?.jxlSessionsPurchased ?? 0);
      const paywallIndex = Number(session.metadata?.paywallIndex ?? 0);

      // ── One-time reading purchase ───────────────────────────────────────────
      if (mode === "one_time") {
        const credits = Number(session.metadata?.credits ?? 0);
        const jxlCredits = Number(session.metadata?.jxlCredits ?? 0);

        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            credits: currentCredits + credits,
            firstReadingUsed: true,
            paywallsCompleted: paywallIndex,
            lastPurchaseAt: new Date().toISOString(),
            ...(jxlCredits > 0 ? { jxlCredits: currentJxlCredits + jxlCredits } : {}),
          },
        });

        console.log(
          `[webhook] one_time — granted ${credits} reading credits` +
          (jxlCredits > 0 ? ` + ${jxlCredits} Jxl credits` : "") +
          ` to ${userId}. Paywall ${paywallIndex} complete.`
        );

      // ── Subscription ────────────────────────────────────────────────────────
      // $20/mo — 8 readings (96 credits) + unlimited JXL
      // jxlUnlimited flag means the JXL chat route skips credit checks
      } else if (mode === "subscription") {
        const stripeSubscriptionId = session.subscription as string;
        const tier = session.metadata?.tier ?? "sub_base";
        const SUBSCRIPTION_READING_CREDITS = 96; // 8 readings × 12 credits

        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            firstReadingUsed: true,
            isSubscribed: true,
            jxlUnlimited: true,
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
          `Granted ${SUBSCRIPTION_READING_CREDITS} reading credits + unlimited JXL.`
        );

      // ── Subscriber top-up ───────────────────────────────────────────────────
      // Subscriber ran out of 8 monthly readings — $4 for 4 more
      } else if (mode === "subscriber_topup") {
        const TOPUP_CREDITS = 48; // 4 readings × 12 credits

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
      // $6 to skip 2-week cooldown and start fresh cycle immediately
      // Use undefined not null — Clerk rejects null in publicMetadata
      } else if (mode === "bypass") {
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            readingsCompleted: 0,
            paywallsCompleted: 0,
            cooldownStartedAt: undefined,
            credits: 0,
            jxlCredits: 0,
            jxlSessionsPurchased: 0,
            jxlCycleStartedAt: undefined,
            bypassUsedAt: new Date().toISOString(),
            lastPurchaseAt: new Date().toISOString(),
          },
        });

        console.log(`[webhook] bypass — full cycle reset for ${userId}.`);

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

      // ── JXL session purchase ────────────────────────────────────────────────
      } else if (mode === "jxl") {
        const jxlTier = session.metadata?.jxlTier ?? "";
        const jxlReplies = Number(session.metadata?.jxlReplies ?? 6);
        const isFirstSession = currentJxlSessionsPurchased === 0;
        const cycleStartedAt = isFirstSession
          ? new Date().toISOString()
          : (meta?.jxlCycleStartedAt as string ?? new Date().toISOString());

        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            jxlCredits: currentJxlCredits + jxlReplies,
            jxlSessionsPurchased: currentJxlSessionsPurchased + 1,
            jxlCycleStartedAt: cycleStartedAt,
            lastPurchaseAt: new Date().toISOString(),
          },
        });

        console.log(
          `[webhook] jxl — granted ${jxlReplies} replies (${jxlTier}) to ${userId}. ` +
          `Sessions this cycle: ${currentJxlSessionsPurchased + 1}. ` +
          `Total credits: ${currentJxlCredits + jxlReplies}`
        );
      }

    } catch (err) {
      // Clerk update failed AFTER Stripe charged the card.
      // Log everything needed to manually recover — userId, mode, amount, session ID.
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
      // Return 500 so Stripe retries the webhook up to 3 times over 24 hours.
      // If all retries fail, the log above has everything needed to fix manually.
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