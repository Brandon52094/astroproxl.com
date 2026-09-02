import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { clerkClient } from "@clerk/nextjs/server";
import { trackServerPurchase } from "@/lib/tiktokEvents";
import { getSubTier, renewalCredits } from "@/lib/paywallConfig";
import { recordRedemption, REFERRAL_REWARD_CREDITS } from "@/lib/referrals";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

async function processReferralReward(
  session: Stripe.Checkout.Session,
  client: Awaited<ReturnType<typeof clerkClient>>
) {
  const codeId = session.metadata?.referralCodeId;
  const ownerUserId = session.metadata?.referralOwnerUserId;
  const referredUserId = session.metadata?.userId;

  if (!codeId || !ownerUserId || !referredUserId) return;

  const isNewRedemption = await recordRedemption({
    codeId,
    referredUserId,
    stripeSessionId: session.id,
    rewardCreditsGranted: REFERRAL_REWARD_CREDITS,
  });

  if (!isNewRedemption) {
    console.log(`[webhook] referral — session ${session.id} already redeemed, skipping reward.`);
    return;
  }

  try {
    const owner = await client.users.getUser(ownerUserId);
    const ownerCredits = Number(owner.publicMetadata?.credits ?? 0);

    await client.users.updateUserMetadata(ownerUserId, {
      publicMetadata: {
        ...owner.publicMetadata,
        credits: ownerCredits + REFERRAL_REWARD_CREDITS,
      },
    });

    console.log(
      `[webhook] referral — granted ${REFERRAL_REWARD_CREDITS} credit(s) to referrer ${ownerUserId} for referring ${referredUserId}`
    );
  } catch (err) {
    console.error("[webhook] CRITICAL — referral redemption recorded but reward grant failed.", {
      ownerUserId,
      referredUserId,
      sessionId: session.id,
      error: String(err),
    });
  }
}

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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const mode = session.metadata?.mode as
      | "one_time"
      | "subscription"
      | "jxl_session"
      | "followup"
      | "reply_pack"
      | "bundle_pack"
      | "cart"
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

      await trackServerPurchase({
        email: userEmail,
        amountCents: session.amount_total ?? 0,
        currency: (session.currency ?? "usd").toUpperCase(),
        eventId: session.id,
        platform: "pwa",
      });

      if (mode === "one_time") {
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            credits: currentCredits + 1,
            firstReadingUsed: true,
            firstPaidReadingUsed: true,
            lastPurchaseAt: new Date().toISOString(),
          },
        });
        console.log(`[webhook] one_time — +1 reading credit to ${userId}`);

      } else if (mode === "subscription") {
        const stripeSubscriptionId = session.subscription as string;
        const tier = getSubTier(session.metadata?.tier);

        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            firstReadingUsed: true,
            isSubscribed: true,
            downloadUnlocked: true,
            subscriptionId: stripeSubscriptionId,
            subscriptionTier: tier.key,
            subscriptionStartedAt: new Date().toISOString(),
            credits: renewalCredits(currentCredits, tier.readings),
            jxlCredits: renewalCredits(currentJxlCredits, tier.jxl),
            lastPurchaseAt: new Date().toISOString(),
          },
        });
        console.log(
          `[webhook] subscription — ${tier.key} for ${userId}: ` +
          `${tier.readings} readings + ${tier.jxl} JXL.`
        );

      } else if (mode === "jxl_session") {
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            jxlCredits: currentJxlCredits + 1,
            firstJxlUsed: true,
            lastPurchaseAt: new Date().toISOString(),
          },
        });
        console.log(`[webhook] jxl_session — +1 JXL credit to ${userId}`);

      } else if (mode === "reply_pack") {
        const grant = Number(session.metadata?.replyCredits ?? 3);
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            replyCredits: currentReplyCredits + grant,
            lastPurchaseAt: new Date().toISOString(),
          },
        });
        console.log(`[webhook] reply_pack — +${grant} universal reply credits to ${userId}`);

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

      } else if (mode === "cart") {
        const readingGrant = Math.max(
          0,
          Number(session.metadata?.grantCredits ?? 0)
        );

        const jxlGrant = Math.max(
          0,
          Number(session.metadata?.grantJxlCredits ?? 0)
        );

        const replyGrant = Math.max(
          0,
          Number(session.metadata?.grantReplyCredits ?? 0)
        );

        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            credits: currentCredits + readingGrant,
            jxlCredits: currentJxlCredits + jxlGrant,
            replyCredits: currentReplyCredits + replyGrant,
            ...(readingGrant > 0
              ? {
                  firstReadingUsed: true,
                  firstPaidReadingUsed: true,
                }
              : {}),
            ...(jxlGrant > 0
              ? {
                  firstJxlUsed: true,
                }
              : {}),
            lastPurchaseAt: new Date().toISOString(),
          },
        });

        console.log(
          `[webhook] cart — ${userId}: ` +
            `+${readingGrant} reading(s), ` +
            `+${jxlGrant} JXL, ` +
            `+${replyGrant} universal reply/replies`
        );

      } else if (mode === "followup") {
        console.log(`[webhook] followup — charged ${userId}.`);
      }

      await processReferralReward(session, client);

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

  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;

    const subId = (invoice as unknown as { subscription?: string }).subscription;
    if (!subId) {
      return NextResponse.json({ received: true });
    }

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