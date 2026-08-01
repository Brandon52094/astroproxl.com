import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { clerkClient } from "@clerk/nextjs/server";
import { trackServerPurchase } from "@/lib/tiktokEvents";
import { getSubTier, renewalCredits } from "@/lib/paywallConfig";

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

  console.log("[webhook] event type:", event.type);

  // ══════════════════════════════════════════════════════════════════════════
  // INITIAL PURCHASE — checkout.session.completed
  // ══════════════════════════════════════════════════════════════════════════
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const mode = session.metadata?.mode as
      | "one_time"
      | "subscription"
      | "jxl_session"
      | "followup"
      | "reply_pack"
      | "jxl_reply_pack"
      | "sub_reply_tail_regular"
      | "sub_reply_tail_jxl"
      | "bundle_pack"
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
      const currentJxlReplyCredits = Number(meta?.jxlReplyCredits ?? 0);
      const currentJxlCredits = Number(meta?.jxlCredits ?? 0);

      // ── Fire TikTok Purchase for every revenue-generating mode ──────────────
      // event_id = session.id for automatic dedupe.
      await trackServerPurchase({
        email: userEmail,
        amountCents: session.amount_total ?? 0,
        currency: (session.currency ?? "usd").toUpperCase(),
        eventId: session.id,
      });

      // ── One-time regular reading (1 credit = 1 reading) ─────────────────────
      if (mode === "one_time") {
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            credits: currentCredits + 1,
            firstReadingUsed: true,
            // Once true, the $2 first-reading price never applies again.
            firstPaidReadingUsed: true,
            lastPurchaseAt: new Date().toISOString(),
          },
        });
        console.log(`[webhook] one_time — +1 reading credit to ${userId}`);

      // ── Subscription — grant reads the tier, not a hardcoded number ─────────
      } else if (mode === "subscription") {
        const stripeSubscriptionId = session.subscription as string;
        const tier = getSubTier(session.metadata?.tier);

        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            firstReadingUsed: true,
            isSubscribed: true,
            downloadUnlocked: true, // downloads free for everyone now; harmless to keep true
            subscriptionId: stripeSubscriptionId,
            subscriptionTier: tier.key,
            subscriptionStartedAt: new Date().toISOString(),
            // Never set below current balance — protects any top-ups bought pre-sub.
            credits: renewalCredits(currentCredits, tier.readings),
            jxlCredits: renewalCredits(currentJxlCredits, tier.jxl),
            lastPurchaseAt: new Date().toISOString(),
          },
        });
        console.log(
          `[webhook] subscription — ${tier.key} for ${userId}: ` +
          `${tier.readings} readings + ${tier.jxl} JXL.`
        );

      // ── Ask JXL session — one flat product, grants 1 JXL credit ─────────────
      } else if (mode === "jxl_session") {
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            jxlCredits: currentJxlCredits + 1,
            firstJxlUsed: true, // stamps out the $3 first-JXL discount
            lastPurchaseAt: new Date().toISOString(),
          },
        });
        console.log(`[webhook] jxl_session — +1 JXL credit to ${userId}`);

      // ── Regular reading reply pack — $2 → 2 replies (regular pool ONLY) ─────
      } else if (mode === "reply_pack") {
        const grant = Number(session.metadata?.replyCredits ?? 2);
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            replyCredits: currentReplyCredits + grant,
            lastPurchaseAt: new Date().toISOString(),
          },
        });
        console.log(`[webhook] reply_pack — +${grant} regular reply credits to ${userId}`);

      // ── JXL reply pack — $3 → 2 replies (JXL pool ONLY, never mixes) ────────
      } else if (mode === "jxl_reply_pack") {
        const grant = Number(session.metadata?.jxlReplyCredits ?? 2);
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            jxlReplyCredits: currentJxlReplyCredits + grant,
            lastPurchaseAt: new Date().toISOString(),
          },
        });
        console.log(`[webhook] jxl_reply_pack — +${grant} JXL reply credits to ${userId}`);

      // ── Subscriber discounted reply tail — grants into the persistent pool ──
      // Reuses the same pools as the regular packs. The metadata carries the
      // amount for exactly one pool (the other is 0), so we add both safely.
      } else if (mode === "sub_reply_tail_regular" || mode === "sub_reply_tail_jxl") {
        const regularGrant = Number(session.metadata?.replyCredits ?? 0);
        const jxlGrant = Number(session.metadata?.jxlReplyCredits ?? 0);

        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            replyCredits: currentReplyCredits + regularGrant,
            jxlReplyCredits: currentJxlReplyCredits + jxlGrant,
            lastPurchaseAt: new Date().toISOString(),
          },
        });

        console.log(
          `[webhook] ${mode} — granted ${regularGrant || jxlGrant} discounted tail replies to ${userId}`
        );

      // ── Bundle pack — grant 2 regular + 1 JXL credit ───────────────────────
      } else if (mode === "bundle_pack") {
        const creditsToGrant = Number(session.metadata?.credits ?? 0);
        const jxlToGrant = Number(session.metadata?.jxlCredits ?? 0);

        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            credits: currentCredits + creditsToGrant,
            jxlCredits: currentJxlCredits + jxlToGrant,
            lastPurchaseAt: new Date().toISOString(),
          },
        });

        console.log(
          `[webhook] bundle_pack — granted ${creditsToGrant} readings + ${jxlToGrant} JXL to ${userId}`
        );

      } else if (mode === "followup") {
        console.log(`[webhook] followup — charged ${userId}.`);
      }

    } catch (err) {
      console.error("[webhook] CRITICAL — Stripe charged but Clerk update failed.", {
        userId,
        mode,
        sessionId: session.id,
        amount: session.amount_total,
        error: String(err),
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MONTHLY RENEWAL — invoice.payment_succeeded
  // ══════════════════════════════════════════════════════════════════════════
  // This is the ONLY genuinely new branch. It resets a subscriber's credits to
  // their plan amount each billing cycle (use-it-or-lose-it via renewalCredits,
  // which never sets below the current balance so top-ups survive).
  //
  // Stripe sends this for BOTH the first invoice and every renewal. We skip the
  // first one (billing_reason === "subscription_create") because the initial
  // checkout.session.completed above already granted those credits — otherwise
  // signup would double-grant.
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;

    // Only subscription invoices matter here.
    const subId = (invoice as unknown as { subscription?: string }).subscription;
    if (!subId) {
      return NextResponse.json({ received: true });
    }

    // Skip the very first invoice — checkout.session.completed handled it.
    if (invoice.billing_reason === "subscription_create") {
      console.log("[webhook] invoice — first invoice, skipping (handled at checkout).");
      return NextResponse.json({ received: true });
    }

    try {
      const subscription = await stripe.subscriptions.retrieve(subId);
      const userId = subscription.metadata?.userId;
      if (!userId) {
        console.error("[webhook] renewal — no userId on subscription", subId);
        return NextResponse.json({ received: true });
      }

      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const meta = user.publicMetadata;
      const tier = getSubTier(meta?.subscriptionTier as string | undefined);

      const currentCredits = Number(meta?.credits ?? 0);
      const currentJxlCredits = Number(meta?.jxlCredits ?? 0);

      await client.users.updateUserMetadata(userId, {
        publicMetadata: {
          ...meta,
          // Reset UP to plan amount; never claw back a purchased balance.
          credits: renewalCredits(currentCredits, tier.readings),
          jxlCredits: renewalCredits(currentJxlCredits, tier.jxl),
          lastRenewalAt: new Date().toISOString(),
        },
      });

      console.log(
        `[webhook] renewal — ${tier.key} reset for ${userId}: ` +
        `readings→${renewalCredits(currentCredits, tier.readings)}, ` +
        `jxl→${renewalCredits(currentJxlCredits, tier.jxl)}`
      );
    } catch (err) {
      console.error("[webhook] CRITICAL — renewal reset failed.", {
        subId,
        error: String(err),
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json({ error: "Renewal reset failed" }, { status: 500 });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CANCELLATION — customer.subscription.deleted
  // ══════════════════════════════════════════════════════════════════════════
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