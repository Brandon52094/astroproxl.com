import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { SUB_TIERS, READING_PRICE, READING_FIRST_PRICE } from "@/lib/paywallConfig";
import { JXL_SESSION, JXL_REPLY_PACK } from "@/lib/jxlConfig";

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
      mode: "one_time" | "subscription" | "followup" | "reply_pack" | "jxl_reply_pack" | "jxl_session";
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
      const unitAmount = firstPaidReadingUsed ? READING_PRICE : READING_FIRST_PRICE;

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
                : "Your first full reading — 50% off to begin",
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

    // ── Subscription — $12.99/mo or $16/mo ────────────────────────────────────
    if (mode === "subscription") {
      // tier comes in from the client: "sub_base" or "sub_plus"
      const tier = SUB_TIERS[bundleTier === "sub_plus" ? "sub_plus" : "sub_base"];

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "subscription",
        allow_promotion_codes: true,
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: tier.name, description: tier.tagline },
            unit_amount: tier.price,
            recurring: { interval: "month" },
          },
          quantity: 1,
        }],
        // CRITICAL: userId must live on the SUBSCRIPTION, not just the session —
        // renewals have no session, so the renewal webhook reads it from here.
        subscription_data: { metadata: { userId, tier: tier.key } },
        metadata: { userId, tier: tier.key, mode: "subscription" },
        success_url: `${returnUrl}?payment=success&mode=subscription`,
        cancel_url: `${returnUrl}?payment=cancelled`,
      });
      return NextResponse.json({ url: session.url });
    }

    // ── Follow-up question ────────────────────────────────────────────────────
    if (mode === "followup") {
      // Follow-up pricing from paywallConfig
      const followupPrice = 200; // $2.00
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: "Ask a Follow-Up", description: "Get a deeper answer on your reading" },
            unit_amount: followupPrice,
          },
          quantity: 1,
        }],
        metadata: { userId, mode: "followup" },
        success_url: `${returnUrl}?payment=success&mode=followup`,
        cancel_url: `${returnUrl}?payment=cancelled`,
      });
      return NextResponse.json({ url: session.url });
    }

    // ── Reply pack (legacy — kept for backward compatibility) ────────────────
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

    // ── JXL reply pack — $6.00 for 3 replies ──────────────────────────────────
    if (mode === "jxl_reply_pack") {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { 
              name: JXL_REPLY_PACK.name, 
              description: JXL_REPLY_PACK.tagline 
            },
            unit_amount: JXL_REPLY_PACK.price,
          },
          quantity: 1,
        }],
        metadata: {
          userId,
          mode: "jxl_reply_pack",
          jxlReplyCredits: JXL_REPLY_PACK.replies,
        },
        success_url: `${returnUrl}?payment=success&mode=jxl_reply_pack`,
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