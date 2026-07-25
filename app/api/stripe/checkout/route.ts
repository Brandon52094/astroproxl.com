import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { SUBSCRIPTION_TIER, SUBSCRIBER_TOPUP, DOWNLOAD_PRICE, FOLLOWUP_PRICE, COOLDOWN_BYPASS_PRICE, BUNDLE_PACKS, isValidBundleTier } from "@/lib/paywallConfig";
import { JXL_SESSION } from "@/lib/jxlConfig";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// $4 per reading; the user's FIRST paid reading is discounted to $2 as a
// low-friction entry point. One reading costs 4 credits, so a paid reading
// grants exactly 4.
const ONE_TIME_READING_PRICE = 400; // cents — every paid reading after the first
const FIRST_PAID_READING_PRICE = 200; // cents — first paid reading only ($2)
const ONE_TIME_READING_CREDITS = 4;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { returnUrl, mode, bundleTier } = body as {
      returnUrl: string;
      mode: "one_time" | "subscription" | "bypass" | "subscriber_topup" | "reading_download" | "followup" | "bundle" | "reply_pack" | "jxl_session";
      bundleTier?: string;
    };

    if (!returnUrl) {
      return NextResponse.json({ error: "returnUrl is required" }, { status: 400 });
    }

    // ── One-time reading — $2 first paid reading, $4 after ────────────────────
    // Price is driven by `firstPaidReadingUsed`, a per-user flag stamped by the
    // webhook on the first successful one_time purchase. We deliberately do NOT
    // key this off paywallsCompleted, which currently never advances.
    if (mode === "one_time") {
      const client = await clerkClient();
      const buyer = await client.users.getUser(userId);
      const firstPaidReadingUsed = buyer.publicMetadata?.firstPaidReadingUsed === true;
      const unitAmount = firstPaidReadingUsed ? ONE_TIME_READING_PRICE : FIRST_PAID_READING_PRICE;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: "Astrological Reading",
              description: firstPaidReadingUsed
                ? "One full personalized astrological reading"
                : "Your first full reading — $2 to begin",
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        }],
        metadata: {
          userId,
          credits: ONE_TIME_READING_CREDITS,
          mode: "one_time",
          // So the webhook can stamp the flag and log which price was charged.
          isFirstPaidReading: firstPaidReadingUsed ? "false" : "true",
        },
        success_url: `${returnUrl}?payment=success&mode=one_time`,
        cancel_url: `${returnUrl}?payment=cancelled`,
      });
      return NextResponse.json({ url: session.url });
    }

    // ── Subscription — $12.99/mo ──────────────────────────────────────────────
    if (mode === "subscription") {
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
        metadata: { userId, tier: SUBSCRIPTION_TIER.tier, mode: "subscription" },
        success_url: `${returnUrl}?payment=success&mode=subscription`,
        cancel_url: `${returnUrl}?payment=cancelled`,
      });
      return NextResponse.json({ url: session.url });
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

    // ── Subscriber top-up ─────────────────────────────────────────────────────
    if (mode === "subscriber_topup") {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: SUBSCRIBER_TOPUP.name, description: SUBSCRIBER_TOPUP.description },
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

    // ── Reading download ──────────────────────────────────────────────────────
    if (mode === "reading_download") {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: "Download Your Reading", description: "Save your full reading as a PDF" },
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

    // ── Follow-up question ────────────────────────────────────────────────────
    if (mode === "followup") {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: "Ask a Follow-Up", description: "Get a deeper answer on your reading" },
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

    // ── Reading bundle ────────────────────────────────────────────────────────
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

     if (mode === "reply_pack") {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: "2 Follow-Up Replies",
              description: "Keep the conversation going — 2 more replies to your reading",
            },
            unit_amount: 200,
          },
          quantity: 1,
        }],
        metadata: {
          userId,
          mode: "reply_pack",
          replyCredits: 2,
        },
        success_url: `${returnUrl}?payment=success&mode=reply_pack`,
        cancel_url: `${returnUrl}?payment=cancelled`,
      });
      return NextResponse.json({ url: session.url });
    }

    // ── Ask JXL — one session, $6.00 → 3 replies ──────────────────────────────
    if (mode === "jxl_session") {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: JXL_SESSION.name, description: JXL_SESSION.tagline },
            unit_amount: JXL_SESSION.price,
          },
          quantity: 1,
        }],
        metadata: { userId, mode: "jxl_session", jxlReplies: JXL_SESSION.replies },
        success_url: `${returnUrl}?payment=success&mode=jxl_session`,
        cancel_url: `${returnUrl}?payment=cancelled`,
      });
      return NextResponse.json({ url: session.url });
    }

    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });

  } catch (error) {
    console.error("[checkout] Error:", error);
    return NextResponse.json({ error: "Failed to create checkout session." }, { status: 500 });
  }
}