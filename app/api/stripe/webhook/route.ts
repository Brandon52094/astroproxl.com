import { NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(req: Request) {
  // Safe runtime initialization with variables fully loaded
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2023-10-16", 
  });

  const body = await req.text();
  // ... the rest of your webhook execution logic stays exactly the same
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
      const currentPaywallsCompleted = Number(meta?.paywallsCompleted ?? 0);
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
            paywallsCompleted: Math.max(currentPaywallsCompleted, paywallIndex),
            lastPurchaseAt: new Date().toISOString(),
            // Paywall 4 bonus — grant 1 Jxl session
            ...(jxlCredits > 0 ? {
              jxlCredits: currentJxlCredits + jxlCredits,
            } : {}),
          },
        });

        console.log(
          `[webhook] one_time — granted ${credits} reading credits` +
          (jxlCredits > 0 ? ` + ${jxlCredits} Jxl credits` : "") +
          ` to ${userId}. Paywall ${paywallIndex} complete.`
        );

      // ── Subscription ────────────────────────────────────────────────────────
      } else if (mode === "subscription") {
        const stripeSubscriptionId = session.subscription as string;
        const tier = session.metadata?.tier ?? "unknown";
        const readingsPerMonth = Number(session.metadata?.readingsPerMonth ?? 3);
        const jxlSessionsPerMonth = Number(session.metadata?.jxlSessionsPerMonth ?? 3);

        // Convert session allocations to credits
        // readings: each reading costs 12 credits × readingsPerMonth
        // jxl: each session costs 6 credits × jxlSessionsPerMonth
        const readingCredits = readingsPerMonth * 12;
        const jxlSessionCredits = jxlSessionsPerMonth * 6;

        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            firstReadingUsed: true,
            isSubscribed: true,
            subscriptionId: stripeSubscriptionId,
            subscriptionTier: tier,
            subscriptionStartedAt: new Date().toISOString(),
            paywallsCompleted: 4,
            credits: currentCredits + readingCredits,
            jxlCredits: currentJxlCredits + jxlSessionCredits,
            lastPurchaseAt: new Date().toISOString(),
          },
        });

        console.log(
          `[webhook] subscription — activated ${tier} for ${userId}. ` +
          `Granted ${readingCredits} reading credits + ${jxlSessionCredits} Jxl credits.`
        );

      // ── Cooldown bypass ─────────────────────────────────────────────────────
      } else if (mode === "bypass") {
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...meta,
            readingsCompleted: 0,
            paywallsCompleted: 0,
            cooldownStartedAt: null,
            credits: 0,
            jxlCredits: 0,
            jxlSessionsPurchased: 0,
            jxlCycleStartedAt: null,
            bypassUsedAt: new Date().toISOString(),
            lastPurchaseAt: new Date().toISOString(),
          },
        });

        console.log(`[webhook] bypass — full cycle reset for ${userId}.`);

      // ── Jxl session purchase ────────────────────────────────────────────────
      } else if (mode === "jxl") {
        const jxlTier = session.metadata?.jxlTier ?? "";
        const jxlReplies = Number(session.metadata?.jxlReplies ?? 6);

        // Set cycle start timestamp on first session purchase
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
      console.error("[webhook] Failed to update user metadata:", err);
      return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
    }
  }

  // ── Subscription cancellation ─────────────────────────────────────────────
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
            subscriptionId: null,
            subscriptionTier: null,
            subscriptionCancelledAt: new Date().toISOString(),
          },
        });

        console.log(`[webhook] subscription cancelled for ${userId}`);
      } catch (err) {
        console.error("[webhook] Failed to update cancelled subscription:", err);
        return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}