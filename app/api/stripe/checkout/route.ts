import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { ONE_TIME_PACKS, SUBSCRIPTION_TIERS } from "@/lib/paywallConfig";
import { JXL_PACKS, isValidJxlTier, JxlTier } from "@/lib/jxlConfig";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type PaywallIndex = 1 | 2 | 3 | 4;

function isValidPaywallIndex(n: number): n is PaywallIndex {
  return n >= 1 && n <= 4;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { returnUrl, mode, paywallIndex, jxlTier } = body as {
      returnUrl: string;
      mode: "one_time" | "subscription" | "bypass" | "jxl";
      paywallIndex?: number;
      jxlTier?: string;
    };

    if (!returnUrl) {
      return NextResponse.json({ error: "returnUrl is required" }, { status: 400 });
    }

    // ── Cooldown bypass — $4.00 ───────────────────────────────────────────────
    if (mode === "bypass") {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: "Cooldown Bypass",
              description: "Skip your cooldown period and start fresh immediately",
            },
            unit_amount: 400,
          },
          quantity: 1,
        }],
        metadata: { userId, mode: "bypass" },
        success_url: `${returnUrl}?payment=success&mode=bypass`,
        cancel_url: `${returnUrl}?payment=cancelled`,
      });
      return NextResponse.json({ url: session.url });
    }

    // ── Jxl session purchase ──────────────────────────────────────────────────
    if (mode === "jxl") {
      if (!jxlTier || !isValidJxlTier(jxlTier)) {
        return NextResponse.json({ error: "Invalid jxlTier" }, { status: 400 });
      }

      const pack = JXL_PACKS[jxlTier as JxlTier];
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: `Jxl — ${pack.name}`,
              description: pack.tagline,
            },
            unit_amount: pack.price,
          },
          quantity: 1,
        }],
        metadata: {
          userId,
          mode: "jxl",
          jxlTier,
          jxlReplies: pack.replies,
        },
        success_url: `${returnUrl}?payment=success&mode=jxl&tier=${jxlTier}`,
        cancel_url: `${returnUrl}?payment=cancelled`,
      });
      return NextResponse.json({ url: session.url });
    }

    // ── Validate paywall index ────────────────────────────────────────────────
    if (mode !== "one_time" && mode !== "subscription") {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }

    if (!isValidPaywallIndex(paywallIndex ?? 0)) {
      return NextResponse.json({ error: "paywallIndex must be 1, 2, 3, or 4" }, { status: 400 });
    }

    const index = paywallIndex as PaywallIndex;

    // ── One-time reading purchase ──────────────────────────────────────────────
    if (mode === "one_time") {
      const pack = ONE_TIME_PACKS[index];
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: pack.name,
              description: pack.description,
            },
            unit_amount: pack.price,
          },
          quantity: 1,
        }],
        metadata: {
          userId,
          credits: pack.credits,
          jxlCredits: pack.jxlCredits,
          pack: pack.pack,
          paywallIndex: index,
          mode: "one_time",
        },
        success_url: `${returnUrl}?payment=success&mode=one_time&paywall=${index}`,
        cancel_url: `${returnUrl}?payment=cancelled`,
      });
      return NextResponse.json({ url: session.url });
    }

    // ── Subscription ──────────────────────────────────────────────────────────
    const tier = SUBSCRIPTION_TIERS[index];
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: tier.name,
            description: tier.tagline,
          },
          unit_amount: tier.price,
          recurring: { interval: "month" },
        },
        quantity: 1,
      }],
      metadata: {
        userId,
        tier: tier.tier,
        paywallIndex: index,
        mode: "subscription",
        readingsPerMonth: tier.readingsPerMonth,
        jxlSessionsPerMonth: tier.jxlSessionsPerMonth,
      },
      success_url: `${returnUrl}?payment=success&mode=subscription&paywall=${index}`,
      cancel_url: `${returnUrl}?payment=cancelled`,
    });
    return NextResponse.json({ url: session.url });

  } catch (error) {
    console.error("[checkout] Error:", error);
    return NextResponse.json({ error: "Failed to create checkout session." }, { status: 500 });
  }
}