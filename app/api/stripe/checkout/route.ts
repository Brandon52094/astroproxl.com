import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { SUB_TIERS, READING_PRICE, SUBSCRIBER_TAIL, BUNDLE_PACK } from "@/lib/paywallConfig";
import { JXL_SESSION, JXL_REPLY_PACK } from "@/lib/jxlConfig";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const ONE_TIME_READING_CREDITS = 4;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { returnUrl, mode, bundleTier, items } = body as {
      returnUrl: string;
      mode: "one_time" | "subscription" | "followup" | "reply_pack" | "jxl_reply_pack" | "sub_reply_tail_regular" | "sub_reply_tail_jxl" | "jxl_session" | "bundle_pack" | "cart";
      bundleTier?: string;
      items?: Array<{ id?: string; quantity?: number }>;
    };

    if (!returnUrl) {
      return NextResponse.json({ error: "returnUrl is required" }, { status: 400 });
    }

    // ── One-time reading — $4, no discounts ────────────────────────────────
    if (mode === "one_time") {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: "Astrological Reading",
              description: "One full personalized astrological reading",
            },
            unit_amount: READING_PRICE,
          },
          quantity: 1,
        }],
        metadata: {
          userId,
          credits: ONE_TIME_READING_CREDITS,
          mode: "one_time",
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
              description: JXL_REPLY_PACK.description
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

    // ── Subscriber discounted reply tail — $2 regular / $3 JXL ──────────────
    // CRITICAL: the 50% price is ONLY for verified subscribers. We check
    // server-side against Clerk metadata — NEVER trust a client claim of
    // subscriber status. A non-subscriber hitting this mode is rejected.
    if (mode === "sub_reply_tail_regular" || mode === "sub_reply_tail_jxl") {
      const client = await clerkClient();
      const buyer = await client.users.getUser(userId);
      const isSubscribed = buyer.publicMetadata?.isSubscribed === true;

      if (!isSubscribed) {
        return NextResponse.json(
          { error: "This discounted pack is for subscribers only." },
          { status: 403 }
        );
      }

      const tail = mode === "sub_reply_tail_jxl" ? SUBSCRIBER_TAIL.jxl : SUBSCRIBER_TAIL.regular;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: "4 More Replies — Subscriber Price",
              description: "Half-price follow-up replies to keep this conversation going",
            },
            unit_amount: tail.price,
          },
          quantity: 1,
        }],
        metadata: {
          userId,
          mode,
          // which pool the webhook credits, and how many
          replyCredits: mode === "sub_reply_tail_regular" ? tail.replies : 0,
          jxlReplyCredits: mode === "sub_reply_tail_jxl" ? tail.replies : 0,
        },
        success_url: `${returnUrl}?payment=success&mode=${mode}`,
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

    // ── Bundle pack — one-time, grants 2 regular + 1 JXL credit ─────────────
    if (mode === "bundle_pack") {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: "Reading Bundle — 2 Readings + 1 JXL",
              description: "Two full readings and one JXL session",
            },
            unit_amount: BUNDLE_PACK.price,
          },
          quantity: 1,
        }],
        metadata: {
          userId,
          mode: "bundle_pack",
          credits: BUNDLE_PACK.credits,       // 2 regular
          jxlCredits: BUNDLE_PACK.jxlCredits, // 1 JXL
        },
        success_url: `${returnUrl}?payment=success&mode=bundle_pack`,
        cancel_url: `${returnUrl}?payment=cancelled`,
      });
      return NextResponse.json({ url: session.url });
    }

    // ── Cart — à-la-carte checkout from the Get Credits panel ──────────────────
    // Client sends items: [{ mode, id, quantity }]. We NEVER trust a client price;
    // each id maps to a server-side price + grant here. One line_item per product,
    // and we pre-sum the grants into flat metadata so the webhook just reads three
    // numbers and adds them (same pattern as bundle_pack).
    if (mode === "cart") {
      const cartItems: Array<{ id?: string; quantity?: number }> =
        Array.isArray(items) ? items : [];

      // Server-side source of truth for price + what each unit grants.
      const CART_CATALOG: Record<
        string,
        { name: string; description: string; unit_amount: number;
          grant: { credits?: number; jxlCredits?: number; replyCredits?: number } }
      > = {
        reading: { name: "Reading",           description: "1 reading credit · 1 free reply",        unit_amount: 400, grant: { credits: 1 } },
        jxl:     { name: "JXL Session",        description: "1 JXL session · 2 free replies",         unit_amount: 600, grant: { jxlCredits: 1 } },
        replies: { name: "Follow-Up Replies",  description: "2 replies — works on readings or JXL",   unit_amount: 200, grant: { replyCredits: 2 } },
      };

      const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
      let grantCredits = 0, grantJxlCredits = 0, grantReplyCredits = 0;

      for (const item of cartItems) {
        const entry = item?.id ? CART_CATALOG[item.id] : undefined;
        const qty = Math.max(0, Math.floor(Number(item?.quantity ?? 0)));
        if (!entry || qty <= 0) continue; // ignore anything not in the catalog

        line_items.push({
          price_data: {
            currency: "usd",
            product_data: { name: entry.name, description: entry.description },
            unit_amount: entry.unit_amount,
          },
          quantity: qty,
        });

        grantCredits      += (entry.grant.credits      ?? 0) * qty;
        grantJxlCredits   += (entry.grant.jxlCredits   ?? 0) * qty;
        grantReplyCredits += (entry.grant.replyCredits ?? 0) * qty;
      }

      if (line_items.length === 0) {
        return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items,
        metadata: {
          userId,
          mode: "cart",
          grantCredits: String(grantCredits),
          grantJxlCredits: String(grantJxlCredits),
          grantReplyCredits: String(grantReplyCredits),
        },
        success_url: `${returnUrl}?payment=success&mode=cart`,
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