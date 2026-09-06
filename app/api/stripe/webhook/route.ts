import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { clerkClient } from "@clerk/nextjs/server";

import { trackServerPurchase } from "@/lib/tiktokEvents";
import {
  getReferralOwnerById,
  grantReferralReward,
  REFERRAL_REWARD_CREDITS,
} from "@/lib/referrals";
import type { MembershipStatus } from "@/lib/paywallConfig";
import { ensureUsageAccount, fulfillUsageAccount, mutateUsageAccount } from "@/lib/reading/account-store";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/* ─────────────────────────────────────────────
   Referral reward
   Buyer gets the referral discount at checkout.
   Referrer gets 1 free regular Reading here.
───────────────────────────────────────────── */

async function processReferralReward(
  session: Stripe.Checkout.Session,
  client: Awaited<ReturnType<typeof clerkClient>>
) {
  const codeId = session.metadata?.referralCodeId;
  const referredUserId = session.metadata?.userId;

  if (!codeId || !referredUserId) return;

  try {
    // Resolve the owner from the referral table, never from mutable Stripe metadata.
    const storedOwner = await getReferralOwnerById(codeId);
    if (!storedOwner) throw new Error("Referral code not found.");
    // Initialize before the transactional grant; ensureAccount never overwrites.
    const owner = await client.users.getUser(storedOwner);
    await ensureUsageAccount(storedOwner, owner.publicMetadata);
    const result = await grantReferralReward({
      codeId,
      referredUserId,
      stripeSessionId: session.id,
      rewardCreditsGranted: REFERRAL_REWARD_CREDITS,
    });
    if (result.ownerUserId !== storedOwner) throw new Error("Referral owner changed during grant.");

    await client.users.updateUserMetadata(result.ownerUserId, {
      publicMetadata: {
        ...owner.publicMetadata,
        credits: result.credits,
      },
    });

    console.log(
      `[webhook] referral — granted ${REFERRAL_REWARD_CREDITS} reading credit(s) ` +
        `to referrer ${result.ownerUserId} for referring ${referredUserId}`
    );
  } catch (err) {
    console.error(
      "[webhook] CRITICAL — referral redemption recorded but reward grant failed.",
      {
        ownerUserId: session.metadata?.referralOwnerUserId,
        referredUserId,
        sessionId: session.id,
        error: String(err),
      }
    );
  }
}

/* ─────────────────────────────────────────────
   Normalize Stripe's detailed status into the
   3 membership states AstroProXL actually uses.
───────────────────────────────────────────── */

function normalizeMembershipStatus(
  subscription: Stripe.Subscription
): MembershipStatus {
  if (
    subscription.status === "active" ||
    subscription.status === "trialing"
  ) {
    return "active";
  }

  if (subscription.status === "canceled") {
    return "canceled";
  }

  // past_due, unpaid, incomplete, incomplete_expired, paused, etc.
  // are intentionally collapsed into the app's simple "paused" state.
  return "paused";
}

async function syncSubscriptionState(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;

  if (!userId) {
    console.error(
      "[webhook] subscription sync — no userId on Stripe subscription",
      subscription.id
    );
    return;
  }

  const membershipStatus = normalizeMembershipStatus(subscription);

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  await ensureUsageAccount(userId, user.publicMetadata);
  await mutateUsageAccount(userId, { membershipStatus });

  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      ...user.publicMetadata,

      membershipStatus,
      isSubscribed: membershipStatus === "active",

      subscriptionId:
        membershipStatus === "canceled" ? undefined : subscription.id,

      // Retired tier system. Clear it while new membership is synchronized.
      subscriptionTier: undefined,

      ...(membershipStatus === "canceled"
        ? {
            subscriptionCancelledAt: new Date().toISOString(),
          }
        : {}),
    },
  });

  console.log(
    `[webhook] subscription sync — ${userId}: ${membershipStatus}`
  );
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

    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  console.log("[webhook] event type:", event.type);

  /* ═══════════════════════════════════════════
     CHECKOUT COMPLETE
  ═══════════════════════════════════════════ */

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

      return NextResponse.json(
        { error: "Missing metadata" },
        { status: 400 }
      );
    }

    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const meta = user.publicMetadata;
      const userEmail = user.emailAddresses[0]?.emailAddress;

      await ensureUsageAccount(userId, meta);
      const ledgerMutation =
        mode === "one_time"
          ? { credits: 1 }
          : mode === "subscription"
            ? { membershipStatus: "active" as const }
            : mode === "jxl_session"
              ? { jxlCredits: 1 }
              : mode === "reply_pack"
                ? { replyCredits: Math.max(0, Number(session.metadata?.replyCredits ?? 0)) }
                : mode === "bundle_pack"
                  ? {
                      credits: Math.max(0, Number(session.metadata?.credits ?? 0)),
                      jxlCredits: Math.max(0, Number(session.metadata?.jxlCredits ?? 0)),
                    }
                  : mode === "cart"
                    ? {
                        credits: Math.max(0, Number(session.metadata?.grantCredits ?? 0)),
                        jxlCredits: Math.max(0, Number(session.metadata?.grantJxlCredits ?? 0)),
                        replyCredits: Math.max(0, Number(session.metadata?.grantReplyCredits ?? 0)),
                      }
                    : { replyCredits: 1 };
      const fulfillment = await fulfillUsageAccount(
        userId,
        session.id,
        event.type,
        ledgerMutation,
      );
      if (!fulfillment.applied) {
        console.log(`[webhook] checkout — ${session.id} already fulfilled.`);
      }

      await trackServerPurchase({
        email: userEmail,
        amountCents: session.amount_total ?? 0,
        currency: (session.currency ?? "usd").toUpperCase(),
        eventId: session.id,
        platform: "pwa",
      });

      /* ── One regular Reading ── */

      if (mode === "one_time") {
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            credits: fulfillment.account.credits,
            firstReadingUsed: true,
            firstPaidReadingUsed: true,
            lastPurchaseAt: new Date().toISOString(),
          },
        });

        console.log(
          `[webhook] one_time — +1 reading credit to ${userId}`
        );

      /* ── Membership started ── */

      } else if (mode === "subscription") {
        const stripeSubscriptionId = session.subscription as string | null;

        if (!stripeSubscriptionId) {
          throw new Error(
            "Subscription checkout completed without a subscription ID."
          );
        }

        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,

            membershipStatus: "active",
            isSubscribed: true,

            subscriptionId: stripeSubscriptionId,
            subscriptionTier: undefined,

            subscriptionStartedAt:
              (meta?.subscriptionStartedAt as string | undefined) ??
              new Date().toISOString(),

            lastPurchaseAt: new Date().toISOString(),

            // Downloads are free for everyone, but preserve compatibility.
            downloadUnlocked: true,
          },
        });

        console.log(
          `[webhook] subscription — active membership for ${userId}`
        );

      /* ── One JXL ── */

      } else if (mode === "jxl_session") {
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            jxlCredits: fulfillment.account.jxlCredits,
            firstJxlUsed: true,
            lastPurchaseAt: new Date().toISOString(),
          },
        });

        console.log(
          `[webhook] jxl_session — +1 JXL credit to ${userId}`
        );

      /* ── Universal reply credits ── */

      } else if (mode === "reply_pack") {
        const grant = Math.max(
          0,
          Number(session.metadata?.replyCredits ?? 0)
        );

        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            replyCredits: fulfillment.account.replyCredits,
            lastPurchaseAt: new Date().toISOString(),
          },
        });

        console.log(
          `[webhook] reply_pack — +${grant} universal reply credits to ${userId}`
        );

      /* ── Legacy bundle compatibility ── */

      } else if (mode === "bundle_pack") {
        const creditsToGrant = Math.max(
          0,
          Number(session.metadata?.credits ?? 0)
        );

        const jxlToGrant = Math.max(
          0,
          Number(session.metadata?.jxlCredits ?? 0)
        );

        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            credits: fulfillment.account.credits,
            jxlCredits: fulfillment.account.jxlCredits,
            lastPurchaseAt: new Date().toISOString(),
          },
        });

        console.log(
          `[webhook] bundle_pack — granted ${creditsToGrant} readings + ` +
            `${jxlToGrant} JXL to ${userId}`
        );

      /* ── Credits-panel cart ── */

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

            credits: fulfillment.account.credits,
            jxlCredits: fulfillment.account.jxlCredits,
            replyCredits: fulfillment.account.replyCredits,

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

      /* ── Legacy followup fallback ── */

      } else if (mode === "followup") {
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            replyCredits: fulfillment.account.replyCredits,
            lastPurchaseAt: new Date().toISOString(),
          },
        });

        console.log(
          `[webhook] followup — +1 universal reply credit to ${userId}`
        );
      }

      await processReferralReward(session, client);

    } catch (err) {
      console.error(
        "[webhook] CRITICAL — Stripe charged but fulfillment failed.",
        {
          userId,
          mode,
          sessionId: session.id,
          amount: session.amount_total,
          error: String(err),
          timestamp: new Date().toISOString(),
        }
      );

      return NextResponse.json(
        { error: "Failed to update user" },
        { status: 500 }
      );
    }
  }

  /* ═══════════════════════════════════════════
     SUCCESSFUL SUBSCRIPTION INVOICE
     No credit reset anymore — membership is unlimited.
  ═══════════════════════════════════════════ */

  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;

    const subId = (
      invoice as unknown as { subscription?: string | null }
    ).subscription;

    if (!subId) {
      return NextResponse.json({ received: true });
    }

    // The initial subscription was already activated by checkout.session.completed.
    if (invoice.billing_reason === "subscription_create") {
      console.log(
        "[webhook] invoice — first subscription invoice, skipping duplicate activation."
      );

      return NextResponse.json({ received: true });
    }

    try {
      const subscription = await stripe.subscriptions.retrieve(subId);
      const userId = subscription.metadata?.userId;

      if (!userId) {
        console.error(
          "[webhook] renewal — no userId on subscription",
          subId
        );

        return NextResponse.json({ received: true });
      }

      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      await ensureUsageAccount(userId, user.publicMetadata);
      await fulfillUsageAccount(
        userId,
        invoice.id,
        event.type,
        { membershipStatus: "active" },
      );

      await client.users.updateUserMetadata(userId, {
        publicMetadata: {
          ...user.publicMetadata,

          membershipStatus: "active",
          isSubscribed: true,

          subscriptionId: subscription.id,
          subscriptionTier: undefined,

          lastRenewalAt: new Date().toISOString(),
        },
      });

      console.log(
        `[webhook] renewal — membership remains active for ${userId}`
      );

    } catch (err) {
      console.error(
        "[webhook] CRITICAL — renewal membership sync failed.",
        {
          subId,
          invoiceId: invoice.id,
          error: String(err),
          timestamp: new Date().toISOString(),
        }
      );

      return NextResponse.json(
        { error: "Renewal sync failed" },
        { status: 500 }
      );
    }
  }

  /* ═══════════════════════════════════════════
     SUBSCRIPTION STATUS CHANGE
  ═══════════════════════════════════════════ */

  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;

    try {
      await syncSubscriptionState(subscription);
    } catch (err) {
      console.error(
        "[webhook] CRITICAL — subscription update sync failed.",
        {
          subscriptionId: subscription.id,
          error: String(err),
          timestamp: new Date().toISOString(),
        }
      );

      return NextResponse.json(
        { error: "Failed to sync subscription" },
        { status: 500 }
      );
    }
  }

  /* ═══════════════════════════════════════════
     SUBSCRIPTION DELETED / CANCELED
  ═══════════════════════════════════════════ */

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const userId = subscription.metadata?.userId;

    if (userId) {
      try {
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        await ensureUsageAccount(userId, user.publicMetadata);
        await mutateUsageAccount(userId, { membershipStatus: "canceled" });

        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...user.publicMetadata,

            membershipStatus: "canceled",
            isSubscribed: false,

            subscriptionId: undefined,
            subscriptionTier: undefined,

            subscriptionCancelledAt: new Date().toISOString(),
          },
        });

        console.log(
          `[webhook] subscription canceled for ${userId}`
        );

      } catch (err) {
        console.error(
          "[webhook] CRITICAL — failed to update canceled subscription.",
          {
            userId,
            subscriptionId: subscription.id,
            error: String(err),
            timestamp: new Date().toISOString(),
          }
        );

        return NextResponse.json(
          { error: "Failed to update subscription" },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({ received: true });
}
