import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import Stripe from "stripe";

import {
  SUB_TIERS,
  READING_PRICE,
  SUBSCRIBER_TAIL,
  BUNDLE_PACK,
} from "@/lib/paywallConfig";

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

/* ─────────────────────────────────────────────
   NEW STORE PRICING
───────────────────────────────────────────── */

const STORE_PRICES = {
  reading: 1000, // $10.00
  jxl: 1299, // $12.99

  // Replies:
  // $1 each normally
  // every complete group of 8 = $6
  replySingle: 100,
  replyBundle8: 600,
} as const;

/*
  Examples:

  1 reply  = $1
  3 replies = $3
  7 replies = $7
  8 replies = $6
  9 replies = $7
  10 replies = $8
  16 replies = $12
*/

function getReplyPricing(quantity: number) {
  const safeQuantity = Math.max(
    0,
    Math.floor(Number(quantity || 0))
  );

  const bundles = Math.floor(safeQuantity / 8);
  const singles = safeQuantity % 8;

  const subtotal =
    bundles * STORE_PRICES.replyBundle8 +
    singles * STORE_PRICES.replySingle;

  const normalPrice =
    safeQuantity * STORE_PRICES.replySingle;

  const savings = normalPrice - subtotal;

  return {
    quantity: safeQuantity,
    bundles,
    singles,
    subtotal,
    savings,
  };
}

function applyReferralDiscount(
  amountCents: number
): number {
  return Math.round(
    amountCents * (1 - REFERRAL_DISCOUNT_PERCENT)
  );
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
      bundleTier,
      items,
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

      bundleTier?: string;

      items?: Array<{
        id?: string;
        quantity?: number;
      }>;
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

    /* ───────────────────────────────────────
       ONE REGULAR READING
    ─────────────────────────────────────── */

    if (mode === "one_time") {
      const unitAmount = referral
        ? applyReferralDiscount(
            STORE_PRICES.reading
          )
        : STORE_PRICES.reading;

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
                    ? "One personalized reading · includes 2 replies · 15% referral discount applied"
                    : "One personalized reading · includes 2 replies",
                },

                unit_amount: unitAmount,
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
       SUBSCRIPTION
       Leaving existing tier system alone
       until we rebuild XL Access.
    ─────────────────────────────────────── */

    if (mode === "subscription") {
      const tier =
        SUB_TIERS[
          bundleTier === "sub_plus"
            ? "sub_plus"
            : "sub_base"
        ];

      const unitAmount = referral
        ? applyReferralDiscount(tier.price)
        : tier.price;

      const session =
        await stripe.checkout.sessions.create({
          payment_method_types: ["card"],

          mode: "subscription",

          allow_promotion_codes: true,

          line_items: [
            {
              price_data: {
                currency: "usd",

                product_data: {
                  name: tier.name,

                  description: referral
                    ? `${tier.tagline} — 15% off your first month`
                    : tier.tagline,
                },

                unit_amount: unitAmount,

                recurring: {
                  interval: "month",
                },
              },

              quantity: 1,
            },
          ],

          subscription_data: {
            metadata: {
              userId,
              tier: tier.key,
            },
          },

          metadata: {
            userId,
            tier: tier.key,
            mode: "subscription",

            ...(referral
              ? {
                  referralCodeId:
                    referral.codeId,

                  referralOwnerUserId:
                    referral.ownerUserId,
                }
              : {}),
          },

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
      const followupPrice = 100;

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

                unit_amount: 300,
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
      const unitAmount = referral
        ? applyReferralDiscount(
            STORE_PRICES.jxl
          )
        : STORE_PRICES.jxl;

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
                    ? "One JXL session · includes 3 replies · 15% referral discount applied"
                    : "One JXL session · includes 3 replies",
                },

                unit_amount: unitAmount,
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
            jxlReplies: 3,

            ...(referral
              ? {
                  referralCodeId:
                    referral.codeId,

                  referralOwnerUserId:
                    referral.ownerUserId,
                }
              : {}),
          },

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
                  BUNDLE_PACK.price,
              },

              quantity: 1,
            },
          ],

          metadata: {
            userId,
            mode: "bundle_pack",

            credits:
              BUNDLE_PACK.credits,

            jxlCredits:
              BUNDLE_PACK.jxlCredits,
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
        const readingAmount = referral
          ? applyReferralDiscount(
              STORE_PRICES.reading
            )
          : STORE_PRICES.reading;

        lineItems.push({
          price_data: {
            currency: "usd",

            product_data: {
              name:
                "Regular Reading",

              description: referral
                ? "Includes 2 replies · 15% referral discount applied"
                : "Includes 2 replies",
            },

            unit_amount:
              readingAmount,
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
        const jxlAmount = referral
          ? applyReferralDiscount(
              STORE_PRICES.jxl
            )
          : STORE_PRICES.jxl;

        lineItems.push({
          price_data: {
            currency: "usd",

            product_data: {
              name:
                "JXL Session",

              description: referral
                ? "Includes 3 replies · 15% referral discount applied"
                : "Includes 3 replies",
            },

            unit_amount: jxlAmount,
          },

          quantity:
            jxlQuantity,
        });

        grantJxlCredits +=
          jxlQuantity;
      }

      /* ── UNIVERSAL REPLIES ── */

      const repliesItem =
        cartItems.find(
          (item) =>
            item.id === "replies"
        );

      const replyPricing =
        getReplyPricing(
          Number(
            repliesItem?.quantity ?? 0
          )
        );

      if (
        replyPricing.quantity > 0
      ) {
        /*
          Complete groups of 8.

          Each bundle = $6.
        */

        if (
          replyPricing.bundles > 0
        ) {
          const bundleAmount =
            referral
              ? applyReferralDiscount(
                  STORE_PRICES.replyBundle8
                )
              : STORE_PRICES.replyBundle8;

          lineItems.push({
            price_data: {
              currency: "usd",

              product_data: {
                name:
                  "8 Universal Replies",

                description: referral
                  ? "Works with Reading or JXL · Save $2 · referral discount applied"
                  : "Works with Reading or JXL · Save $2",
              },

              unit_amount:
                bundleAmount,
            },

            quantity:
              replyPricing.bundles,
          });
        }

        /*
          Any replies left after bundles
          are $1 each.
        */

        if (
          replyPricing.singles > 0
        ) {
          const singleAmount =
            referral
              ? applyReferralDiscount(
                  STORE_PRICES.replySingle
                )
              : STORE_PRICES.replySingle;

          lineItems.push({
            price_data: {
              currency: "usd",

              product_data: {
                name:
                  "Universal Reply",

                description: referral
                  ? "Works with Reading or JXL · referral discount applied"
                  : "Works with Reading or JXL",
              },

              unit_amount:
                singleAmount,
            },

            quantity:
              replyPricing.singles,
          });
        }

        grantReplyCredits +=
          replyPricing.quantity;
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

            replySavingsCents:
              String(
                replyPricing.savings
              ),

            ...(referral
              ? {
                  referralCodeId:
                    referral.codeId,

                  referralOwnerUserId:
                    referral.ownerUserId,
                }
              : {}),
          },

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