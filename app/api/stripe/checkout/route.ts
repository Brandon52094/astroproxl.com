import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import Stripe from "stripe";
import { SUB_TIERS, READING_PRICE, SUBSCRIBER_TAIL, BUNDLE_PACK } from "@/lib/paywallConfig";
import { JXL_SESSION, JXL_REPLY_PACK } from "@/lib/jxlConfig";
import { lookupReferralCode, REFERRAL_DISCOUNT_PERCENT } from "@/lib/referrals";
import { db } from "@/lib/db";
import { referralRedemptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const ONE_TIME_READING_CREDITS = 1;

const REFERRAL_COOKIE = "aproxl_ref";

function applyReferralDiscount(amountCents: number): number {
  return Math.round(amountCents * (1 - REFERRAL_DISCOUNT_PERCENT));
}

async function resolveReferral(userId: string) {
  const cookieStore = await cookies();
  const code = cookieStore.get(REFERRAL_COOKIE)?.value;
  if (!code) return null;

  const lookup = await lookupReferralCode(code, userId);
  if (!lookup) return null;

  const alreadyRedeemed = await db
    .select()
    .from(referralRedemptions)
    .where(eq(referralRedemptions.referredUserId, userId))
    .limit(1);

  if (alreadyRedeemed.length > 0) return null;

  return lookup;
}

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

    const referral =
      mode === "one_time" || mode === "subscription" || mode === "jxl_session" || mode === "cart"
        ? await resolveReferral(userId)
        : null;

    if (mode === "one_time") {
      const unitAmount = referral ? applyReferralDiscount(READING_PRICE) : READING_PRICE;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: "Astrological Reading",
              description: referral
                ? "One full personalized astrological reading — 15% referral discount applied"
                : "One full personalized astrological reading",
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        }],
        metadata: {
          userId,
          credits: ONE_TIME_READING_CREDITS,
          mode: "one_time",
          ...(referral ? { referralCodeId: referral.codeId, referralOwnerUserId: referral.ownerUserId } : {}),
        },
        success_url: `${returnUrl}?payment=success&mode=one_time`,
        cancel_url: `${returnUrl}?payment=cancelled`,
      });
      return NextResponse.json({ url: session.url });
    }

    if (mode === "subscription") {
      const tier = SUB_TIERS[bundleTier === "sub_plus" ? "sub_plus" : "sub_base"];
      const unitAmount = referral ? applyReferralDiscount(tier.price) : tier.price;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "subscription",
        allow_promotion_codes: true,
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: tier.name,
              description: referral ? `${tier.tagline} — 15% off your first month` : tier.tagline,
            },
            unit_amount: unitAmount,
            recurring: { interval: "month" },
          },
          quantity: 1,
        }],
        subscription_data: { metadata: { userId, tier: tier.key } },
        metadata: {
          userId,
          tier: tier.key,
          mode: "subscription",
          ...(referral ? { referralCodeId: referral.codeId, referralOwnerUserId: referral.ownerUserId } : {}),
        },
        success_url: `${returnUrl}?payment=success&mode=subscription`,
        cancel_url: `${returnUrl}?payment=cancelled`,
      });
      return NextResponse.json({ url: session.url });
    }

    if (mode === "followup") {
      const followupPrice = 200;
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
          replyCredits: mode === "sub_reply_tail_regular" ? tail.replies : 0,
          jxlReplyCredits: mode === "sub_reply_tail_jxl" ? tail.replies : 0,
        },
        success_url: `${returnUrl}?payment=success&mode=${mode}`,
        cancel_url: `${returnUrl}?payment=cancelled`,
      });
      return NextResponse.json({ url: session.url });
    }

    if (mode === "jxl_session") {
      const unitAmount = referral ? applyReferralDiscount(JXL_SESSION.price) : JXL_SESSION.price;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: JXL_SESSION.name,
              description: referral ? `${JXL_SESSION.tagline} — 15% referral discount applied` : JXL_SESSION.tagline,
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        }],
        metadata: {
          userId,
          mode: "jxl_session",
          jxlReplies: JXL_SESSION.replies,
          ...(referral ? { referralCodeId: referral.codeId, referralOwnerUserId: referral.ownerUserId } : {}),
        },
        success_url: `${returnUrl}?payment=success&mode=jxl_session`,
        cancel_url: `${returnUrl}?payment=cancelled`,
      });
      return NextResponse.json({ url: session.url });
    }

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
          credits: BUNDLE_PACK.credits,
          jxlCredits: BUNDLE_PACK.jxlCredits,
        },
        success_url: `${returnUrl}?payment=success&mode=bundle_pack`,
        cancel_url: `${returnUrl}?payment=cancelled`,
      });
      return NextResponse.json({ url: session.url });
    }

    if (mode === "cart") {
      const cartItems: Array<{ id?: string; quantity?: number }> =
        Array.isArray(items) ? items : [];

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
        if (!entry || qty <= 0) continue;

        const unitAmount = referral ? applyReferralDiscount(entry.unit_amount) : entry.unit_amount;

        line_items.push({
          price_data: {
            currency: "usd",
            product_data: {
              name: entry.name,
              description: referral ? `${entry.description} — 15% referral discount applied` : entry.description,
            },
            unit_amount: unitAmount,
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
          ...(referral ? { referralCodeId: referral.codeId, referralOwnerUserId: referral.ownerUserId } : {}),
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