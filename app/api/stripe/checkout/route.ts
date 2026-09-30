import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import Stripe from "stripe";
import { PRICING } from "@/lib/paywallConfig";
import { JXL_SESSION } from "@/lib/jxlConfig";
import {
  lookupReferralCode,
  REFERRAL_DISCOUNT_PERCENT,
} from "@/lib/referrals";
import { db } from "@/lib/db";
import { referralRedemptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const ONE_TIME_READING_CREDITS = 1;
const REFERRAL_COOKIE = "aproxl_ref";
const ASTROSHARE_COUPON_ID =
  process.env.STRIPE_REFERRAL_COUPON_ID ?? "ASTROSHARE";

async function getAstroshareCouponId(): Promise<string> {
  try {
    const coupon = await stripe.coupons.retrieve(ASTROSHARE_COUPON_ID);
    return coupon.id;
  } catch (error) {
    const stripeError = error as { code?: string };
    if (stripeError.code !== "resource_missing") throw error;
  }

  try {
    const coupon = await stripe.coupons.create({
      id: ASTROSHARE_COUPON_ID,
      name: `ASTROSHARE · ${Math.round(REFERRAL_DISCOUNT_PERCENT * 100)}% referral`,
      percent_off: REFERRAL_DISCOUNT_PERCENT * 100,
      duration: "once",
      metadata: {
        program: "astroshare",
      },
    });
    return coupon.id;
  } catch (error) {
    // Another request may have created the coupon between retrieve and create.
    const coupon = await stripe.coupons.retrieve(ASTROSHARE_COUPON_ID);
    return coupon.id;
  }
}
async function resolveReferral(userId: string) {
  const cookieStore = await cookies();
  const code =
    cookieStore.get(REFERRAL_COOKIE)?.value;
  if (!code) return null;
  const lookup = await lookupReferralCode(
    code,
    userId
  );
  if (!lookup) return null;
  const alreadyRedeemed = await db
    .select()
    .from(referralRedemptions)
    .where(
      eq(
        referralRedemptions.referredUserId,
        userId
      )
    )
    .limit(1);
  if (alreadyRedeemed.length > 0) {
    return null;
  }
  return lookup;
}
/* ─────────────────────────────────────────────
   POST
───────────────────────────────────────────── */
export async function POST(
  request: NextRequest
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    const body = await request.json();
    const {
      returnUrl,
      mode,
      items,
      pledgeAmountCents,
    } = body as {
      returnUrl: string;
      mode:
        | "one_time"
        | "subscription"
        | "followup"
        | "reply_pack"
        | "jxl_session"
        | "bundle_pack"
        | "cart";
      items?: Array<{
        id?: string;
        quantity?: number;
      }>;
      pledgeAmountCents?: number;
    };
    if (!returnUrl) {
      return NextResponse.json(
        {
          error: "returnUrl is required",
        },
        {
          status: 400,
        }
      );
    }
    const referral =
      mode === "one_time" ||
      mode === "subscription" ||
      mode === "jxl_session" ||
      mode === "cart"
        ? await resolveReferral(userId)
        : null;
    const referralCouponId = referral
      ? await getAstroshareCouponId()
      : null;
    /* ───────────────────────────────────────
       ONE REGULAR READING
    ─────────────────────────────────────── */
    if (mode === "one_time") {
      const session =
        await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name:
                    "Astrological Reading",
                  description: referral
                    ? `One personalized reading · includes ${PRICING.reading.includedReplies} reply · 15% referral discount applied`
                    : `One personalized reading · includes ${PRICING.reading.includedReplies} reply`,
                },
                unit_amount: PRICING.reading.price,
              },
              quantity: 1,
            },
          ],
          metadata: {
            userId,
            credits:
              ONE_TIME_READING_CREDITS,
            mode: "one_time",
            ...(referral
              ? {
                  referralCodeId:
                    referral.codeId,
                  referralOwnerUserId:
                    referral.ownerUserId,
                }
              : {}),
          },
          discounts: referralCouponId
            ? [{ coupon: referralCouponId }]
            : undefined,
          success_url:
            `${returnUrl}?payment=success&mode=one_time`,
          cancel_url:
            `${returnUrl}?payment=cancelled`,
        });
      return NextResponse.json({
        url: session.url,
      });
    }
    /* ───────────────────────────────────────
       SUBSCRIPTION — SINGLE XL MEMBERSHIP
    ─────────────────────────────────────── */
    if (mode === "subscription") {
      const session =
        await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "subscription",
          allow_promotion_codes: referralCouponId ? undefined : true,
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: "AstroProXL Membership",
                  description: referral
                    ? "Unlimited General Readings + JXL · up to 8 replies per conversation · members-only access · 15% referral discount applied"
                    : "Unlimited General Readings + JXL · up to 8 replies per conversation · members-only access",
                },
                unit_amount: PRICING.membership.price,
                recurring: {
                  interval: PRICING.membership.interval,
                },
              },
              quantity: 1,
            },
          ],
          subscription_data: {
            metadata: {
              userId,
              membership: "astroproxl",
              // Temporary compatibility for the current webhook until it is migrated.
              tier: "sub_base",
            },
          },
          metadata: {
            userId,
            mode: "subscription",
            membership: "astroproxl",
            // Temporary compatibility for the current webhook until it is migrated.
            tier: "sub_base",
            ...(referral
              ? {
                  referralCodeId:
                    referral.codeId,
                  referralOwnerUserId:
                    referral.ownerUserId,
                }
              : {}),
          },
          discounts: referralCouponId
            ? [{ coupon: referralCouponId }]
            : undefined,
          success_url:
            `${returnUrl}?payment=success&mode=subscription`,
          cancel_url:
            `${returnUrl}?payment=cancelled`,
        });
      return NextResponse.json({
        url: session.url,
      });
    }
    /* ───────────────────────────────────────
       LEGACY FOLLOW-UP CHECKOUT
       Leaving this route temporarily so
       anything else still calling it does
       not break.
       New Credits UI uses CART instead.
    ─────────────────────────────────────── */
    if (mode === "followup") {
      const followupPrice = PRICING.replies.priceEach;
      const session =
        await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name:
                    "Ask a Follow-Up",
                  description:
                    "One additional reply",
                },
                unit_amount:
                  followupPrice,
              },
              quantity: 1,
            },
          ],
          metadata: {
            userId,
            mode: "followup",
          },
          success_url:
            `${returnUrl}?payment=success&mode=followup`,
          cancel_url:
            `${returnUrl}?payment=cancelled`,
        });
      return NextResponse.json({
        url: session.url,
      });
    }
    /* ───────────────────────────────────────
       REPLY PACK
       3 universal replies = $3
       This remains available for any old UI
       that may still call reply_pack.
       New Credits UI uses CART.
    ─────────────────────────────────────── */
    if (mode === "reply_pack") {
      const session =
        await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name:
                    "3 Follow-Up Replies",
                  description:
                    "3 universal replies · works with Reading or JXL",
                },
                unit_amount: PRICING.replies.priceEach * 3,
              },
              quantity: 1,
            },
          ],
          metadata: {
            userId,
            mode: "reply_pack",
            replyCredits: 3,
          },
          success_url:
            `${returnUrl}?payment=success&mode=reply_pack`,
          cancel_url:
            `${returnUrl}?payment=cancelled`,
        });
      return NextResponse.json({
        url: session.url,
      });
    }
    /* ───────────────────────────────────────
       ONE JXL
    ─────────────────────────────────────── */
    if (mode === "jxl_session") {
      const session =
        await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name:
                    JXL_SESSION.name,
                  description: referral
                    ? `One JXL session · includes ${PRICING.jxl.includedReplies} replies · 15% referral discount applied`
                    : `One JXL session · includes ${PRICING.jxl.includedReplies} replies`,
                },
                unit_amount: PRICING.jxl.price,
              },
              quantity: 1,
            },
          ],
          metadata: {
            userId,
            mode: "jxl_session",
            /*
              Keep this at 3 so the existing
              JXL session logic can still read
              the included allowance.
            */
            jxlReplies: PRICING.jxl.includedReplies,
            ...(referral
              ? {
                  referralCodeId:
                    referral.codeId,
                  referralOwnerUserId:
                    referral.ownerUserId,
                }
              : {}),
          },
          discounts: referralCouponId
            ? [{ coupon: referralCouponId }]
            : undefined,
          success_url:
            `${returnUrl}?payment=success&mode=jxl_session`,
          cancel_url:
            `${returnUrl}?payment=cancelled`,
        });
      return NextResponse.json({
        url: session.url,
      });
    }
    /* ───────────────────────────────────────
       LEGACY BUNDLE
    ─────────────────────────────────────── */
    if (mode === "bundle_pack") {
      const session =
        await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name:
                    "Reading Bundle — 2 Readings + 1 JXL",
                  description:
                    "Two full readings and one JXL session",
                },
                unit_amount:
                  PRICING.reading.price * 2 + PRICING.jxl.price,
              },
              quantity: 1,
            },
          ],
          metadata: {
            userId,
            mode: "bundle_pack",
            credits:
              2,
            jxlCredits:
              1,
          },
          success_url:
            `${returnUrl}?payment=success&mode=bundle_pack`,
          cancel_url:
            `${returnUrl}?payment=cancelled`,
        });
      return NextResponse.json({
        url: session.url,
      });
    }
    /* ═══════════════════════════════════════
       NEW CREDITS CART
    ═══════════════════════════════════════ */
    if (mode === "cart") {
      const cartItems:
        Array<{
          id?: string;
          quantity?: number;
        }> = Array.isArray(items)
          ? items
          : [];
      const lineItems:
        Stripe.Checkout.SessionCreateParams.LineItem[] =
        [];
      const parsedPledgeAmount = Number(pledgeAmountCents ?? 0);
      if (
        !Number.isFinite(parsedPledgeAmount) ||
        !Number.isInteger(parsedPledgeAmount) ||
        parsedPledgeAmount < 0 ||
        parsedPledgeAmount > 100_000_000 ||
        (parsedPledgeAmount > 0 && parsedPledgeAmount < 50)
      ) {
        return NextResponse.json(
          {
            error:
              "Pledge must be between $0.50 and $1,000,000.00.",
          },
          { status: 400 }
        );
      }
      if (referralCouponId && parsedPledgeAmount > 0) {
        return NextResponse.json(
          {
            error:
              "Please complete the ASTROSHARE purchase separately from your pledge so the pledge is not discounted.",
          },
          { status: 400 }
        );
      }
      let grantCredits = 0;
      let grantJxlCredits = 0;
      /*
        Universal purchased replies.
        These will eventually be the ONLY
        reply-credit balance.
      */
      let grantReplyCredits = 0;
      /* ── Reading ── */
      const readingItem =
        cartItems.find(
          (item) =>
            item.id === "reading"
        );
      const readingQuantity =
        Math.max(
          0,
          Math.floor(
            Number(
              readingItem?.quantity ?? 0
            )
          )
        );
      if (readingQuantity > 0) {
        lineItems.push({
          price_data: {
            currency: "usd",
            product_data: {
              name:
                "Regular Reading",
              description: referral
                ? `Includes ${PRICING.reading.includedReplies} reply · 15% referral discount applied`
                : `Includes ${PRICING.reading.includedReplies} reply`,
            },
            unit_amount: PRICING.reading.price,
          },
          quantity:
            readingQuantity,
        });
        grantCredits +=
          readingQuantity;
      }
      /* ── JXL ── */
      const jxlItem =
        cartItems.find(
          (item) =>
            item.id === "jxl"
        );
      const jxlQuantity =
        Math.max(
          0,
          Math.floor(
            Number(
              jxlItem?.quantity ?? 0
            )
          )
        );
      if (jxlQuantity > 0) {
        lineItems.push({
          price_data: {
            currency: "usd",
            product_data: {
              name:
                "JXL Session",
              description: referral
                ? `Includes ${PRICING.jxl.includedReplies} replies · 15% referral discount applied`
                : `Includes ${PRICING.jxl.includedReplies} replies`,
            },
            unit_amount: PRICING.jxl.price,
          },
          quantity:
            jxlQuantity,
        });
        grantJxlCredits +=
          jxlQuantity;
      }
      /* ── UNIVERSAL REPLIES — $1 EACH ── */
      const repliesItem =
        cartItems.find(
          (item) =>
            item.id === "replies"
        );
      const replyQuantity =
        Math.max(
          0,
          Math.floor(
            Number(
              repliesItem?.quantity ?? 0
            )
          )
        );
      if (replyQuantity > 0) {
        lineItems.push({
          price_data: {
            currency: "usd",
            product_data: {
              name:
                "Universal Reply",
              description: referral
                ? "Works with Reading or JXL · 15% referral discount applied"
                : "Works with Reading or JXL",
            },
            unit_amount: PRICING.replies.priceEach,
          },
          quantity:
            replyQuantity,
        });
        grantReplyCredits +=
          replyQuantity;
      }
      /* ── Optional one-time pledge ── */
      if (parsedPledgeAmount > 0) {
        lineItems.push({
          price_data: {
            currency: "usd",
            product_data: {
              name: "Pledge to AstroProXL",
              description:
                "Supporting the continued expansion of AstroProXL",
            },
            unit_amount: parsedPledgeAmount,
          },
          quantity: 1,
        });
      }
      /* Nothing selected */
      if (
        lineItems.length === 0
      ) {
        return NextResponse.json(
          {
            error:
              "Cart is empty.",
          },
          {
            status: 400,
          }
        );
      }
      /* Stripe Checkout */
      const session =
        await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          line_items: lineItems,
          metadata: {
            userId,
            mode: "cart",
            grantCredits:
              String(grantCredits),
            grantJxlCredits:
              String(grantJxlCredits),
            grantReplyCredits:
              String(
                grantReplyCredits
              ),
            pledgeAmountCents:
              String(parsedPledgeAmount),
            replySavingsCents: "0",
            ...(referral &&
            (grantCredits > 0 ||
              grantJxlCredits > 0 ||
              grantReplyCredits > 0)
              ? {
                  referralCodeId:
                    referral.codeId,
                  referralOwnerUserId:
                    referral.ownerUserId,
                }
              : {}),
          },
          discounts:
            referralCouponId &&
            (grantCredits > 0 ||
              grantJxlCredits > 0 ||
              grantReplyCredits > 0)
              ? [{ coupon: referralCouponId }]
              : undefined,
          success_url:
            `${returnUrl}?payment=success&mode=cart`,
          cancel_url:
            `${returnUrl}?payment=cancelled`,
        });
      return NextResponse.json({
        url: session.url,
      });
    }
    return NextResponse.json(
      {
        error: "Invalid mode",
      },
      {
        status: 400,
      }
    );
  } catch (error) {
    console.error(
      "[checkout] Error:",
      error
    );
    return NextResponse.json(
      {
        error:
          "Failed to create checkout session.",
      },
      {
        status: 500,
      }
    );
  }
}
