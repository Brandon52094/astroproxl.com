import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { ONE_TIME_PACKS, SUBSCRIPTION_TIER, SUBSCRIBER_TOPUP, DOWNLOAD_PRICE, FOLLOWUP_PRICE, COOLDOWN_BYPASS_PRICE, BUNDLE_PACKS, isValidBundleTier } from "@/lib/paywallConfig";
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
    const { returnUrl, mode, paywallIndex, jxlTier, bundleTier } = body as {
      returnUrl: string;
      mode: "one_time" | "subscription" | "bypass" | "jxl" | "subscriber_topup" | "reading_download" | "followup" | "bundle";
      paywallIndex?: number;
      jxlTier?: string;
      bundleTier?: string;
    };

    if (!returnUrl) {
      return NextResponse.json({ error: "returnUrl is required" }, { status: 400 });
    }

    // ── Cooldown bypass — $6.00 ───────────────────────────────────────────────
    if (mode === "bypass") {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: "Cooldown Bypass",
              description: "Skip your cooldown period and start a fresh cycle immediately",
            },
            unit_amount: COOLDOWN_BYPASS_PRICE,
          },
          quantity: 1,
        }],
        metadata: { userId, mode: "bypass" },
        success_url: `${returnUrl}?payment=success&mode=bypass`,
        cancel_url: `${returnUrl}?payment=cancelled`,
      });
      return NextResponse.json({ url: session.url });
    }

    // ── Subscriber top-up — $4.00 ─────────────────────────────────────────────
    if (mode === "subscriber_topup") {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: SUBSCRIBER_TOPUP.name,
              description: SUBSCRIBER_TOPUP.description,
            },
            unit_amount: SUBSCRIBER_TOPUP.price,
          },
          quantity: 1,
        }],
        metadata: {
          userId,
          mode: "subscriber_topup",
          credits: SUBSCRIBER_TOPUP.credits,
          pack: SUBSCRIBER_TOPUP.pack,
        },
        success_url: `${returnUrl}?payment=success&mode=subscriber_topup`,
        cancel_url: `${returnUrl}?payment=cancelled`,
      });
      return NextResponse.json({ url: session.url });
    }

    // ── Reading download — $1.00 ──────────────────────────────────────────────
    if (mode === "reading_download") {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: "Download Your Reading",
              description: "Save your full reading as a PDF",
            },
            unit_amount: DOWNLOAD_PRICE,
          },
          quantity: 1,
        }],
        metadata: { userId, mode: "reading_download" },
        success_url: `${returnUrl}?payment=success&mode=reading_download`,
        cancel_url: `${returnUrl}?payment=cancelled`,
      });
      return NextResponse.json({ url: session.url });
    }

    // ── Follow-up question — $2.00 ────────────────────────────────────────────
    if (mode === "followup") {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: "Ask a Follow-Up",
              description: "Get a deeper answer on your reading",
            },
            unit_amount: FOLLOWUP_PRICE,
          },
          quantity: 1,
        }],
        metadata: { userId, mode: "followup" },
        success_url: `${returnUrl}?payment=success&mode=followup`,
        cancel_url: `${returnUrl}?payment=cancelled`,
      });
      return NextResponse.json({ url: session.url });
    }

    // ── Reading bundle — $7 / $10 / $13 ───────────────────────────────────────
    if (mode === "bundle") {
      if (!bundleTier || !isValidBundleTier(bundleTier)) {
        return NextResponse.json({ error: "Invalid bundleTier" }, { status: 400 });
      }
      const bundle = BUNDLE_PACKS[bundleTier];
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: bundle.name, description: bundle.description },
            unit_amount: bundle.price,
          },
          quantity: 1,
        }],
        metadata: {
          userId,
          mode: "bundle",
          bundleTier: bundle.key,
          credits: bundle.credits,
        },
        success_url: `${returnUrl}?payment=success&mode=bundle`,
        cancel_url: `${returnUrl}?payment=cancelled`,
      });
      return NextResponse.json({ url: session.url });
    }

    // ── JXL session purchase — PAUSED ─────────────────────────────────────────
    if (mode === "jxl") {
      return NextResponse.json({ error: "JXL is currently unavailable." }, { status: 503 });
    }

    // ── Validate paywall index ────────────────────────────────────────────────
    if (mode !== "one_time" && mode !== "subscription") {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }

    if (!isValidPaywallIndex(paywallIndex ?? 0)) {
      return NextResponse.json({ error: "paywallIndex must be 1, 2, 3, or 4" }, { status: 400 });
    }

    const index = paywallIndex as PaywallIndex;

    // ── One-time reading purchase — flat $4.00 ────────────────────────────────
    if (mode === "one_time") {
      const pack = ONE_TIME_PACKS[index];
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: pack.name, description: pack.description },
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

    // ── Subscription — $12.99/mo ──────────────────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      allow_promotion_codes: true,
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: SUBSCRIPTION_TIER.name, description: SUBSCRIPTION_TIER.tagline },
          unit_amount: SUBSCRIPTION_TIER.price,
          recurring: { interval: "month" },
        },
        quantity: 1,
      }],
      metadata: { userId, tier: SUBSCRIPTION_TIER.tier, paywallIndex: index, mode: "subscription" },
      success_url: `${returnUrl}?payment=success&mode=subscription&paywall=${index}`,
      cancel_url: `${returnUrl}?payment=cancelled`,
    });
    return NextResponse.json({ url: session.url });

  } catch (error) {
    console.error("[checkout] Error:", error);
    return NextResponse.json({ error: "Failed to create checkout session." }, { status: 500 });
  }
}