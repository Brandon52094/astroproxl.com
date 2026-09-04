"use client";

import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, Minus, Plus } from "lucide-react";
import StarfieldBackground from "./StarfieldBackground";

/* ─────────────────────────────────────────────
   Products
───────────────────────────────────────────── */

type ProductId = "jxl" | "reading" | "replies";

interface Product {
  id: ProductId;
  title: string;
  desc: string;
  price: number;
}

const PRODUCTS: Product[] = [
  {
    id: "jxl",
    title: "JXL",
    desc: "Includes 3 replies",
    price: 12.99,
  },
  {
    id: "reading",
    title: "General Readings",
    desc: "Includes 2 replies",
    price: 10.0,
  },
  {
    id: "replies",
    title: "More Replies",
    desc: "Works with any reading",
    price: 1.0,
  },
];

interface Balance {
  readings: number;
  jxl: number;
  replies: number;
}

/* ─────────────────────────────────────────────
   Membership
───────────────────────────────────────────── */

const MEMBERSHIP_FEATURES = [
  {
    title: "Unlimited Readings & Replies",
    copy: "Unlimited access to JXL & General Readings with replies.",
  },
  {
    title: "Commission Eligible (request only)",
    copy: "Earn 1–5% recurring commission with subscription referrals.",
  },
  {
    title: "Members-Only Features (beta)",
    copy: "Unlock experiences and tools only XL members can access.",
  },
  {
    title: "Save Your Readings (beta)",
    copy: "Save your reading synopsis so you don't forget.",
  },
  {
    title: "Lowered Cooldowns",
    copy: "More readings, less cooldowns.",
  },
  {
    title: "Member Feedback Box",
    copy: "Send your ideas, requests, and feedback directly to us.",
  },
];

const MEMBERSHIP_PRICING = {
  monthly: {
    price: 20,
    suffix: "/mo",
  },
  yearly: {
    price: 200,
    suffix: "/yr",
  },
} as const;

/* ─────────────────────────────────────────────
   Automated reply pricing

   1–7 replies  = $1 each
   8 replies    = $6
   16 replies   = $12
   etc.

   Example:
   10 replies = $6 + $2 = $8
───────────────────────────────────────────── */

function getReplyPrice(quantity: number) {
  if (quantity <= 0) return 0;

  const groupsOfEight = Math.floor(quantity / 8);
  const remainder = quantity % 8;

  return groupsOfEight * 6 + remainder;
}

function getReplySavings(quantity: number) {
  const normalPrice = quantity;
  const actualPrice = getReplyPrice(quantity);

  return normalPrice - actualPrice;
}

function plural(n: number, one: string, many?: string) {
  return n === 1 ? one : many ?? `${one}s`;
}

/* ─────────────────────────────────────────────
   Component
───────────────────────────────────────────── */

export default function CreditsPanel({
  onClose,
  embedded = false,
}: {
  onClose?: () => void;
  embedded?: boolean;
}) {
  const [cart, setCart] = useState<Record<ProductId, number>>({
    jxl: 0,
    reading: 0,
    replies: 0,
  });

  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  /* Current balances */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/user/credits");
        const d = await res.json();

        setBalance({
          readings: Number(d.credits ?? 0),
          jxl: Number(d.jxlCredits ?? 0),
          replies: Number(d.replyCredits ?? 0),
        });
      } catch {
        // Balance line simply stays hidden.
      }
    })();
  }, []);

  const step = useCallback((id: ProductId, amount: number) => {
    setCart((current) => ({
      ...current,
      [id]: Math.max(0, current[id] + amount),
    }));
  }, []);

  const replySavings = useMemo(
    () => getReplySavings(cart.replies),
    [cart.replies]
  );

  const total = useMemo(() => {
    const jxlTotal = cart.jxl * 12.99;
    const readingTotal = cart.reading * 10;
    const repliesTotal = getReplyPrice(cart.replies);

    return jxlTotal + readingTotal + repliesTotal;
  }, [cart]);

  const inventoryFor = useCallback(
    (id: ProductId): number => {
      if (!balance) return 0;
      if (id === "jxl") return balance.jxl;
      if (id === "reading") return balance.readings;
      return balance.replies;
    },
    [balance]
  );

  /* ── Credit checkout ── */

  const handleCheckout = async () => {
    if (total <= 0) return;

    setLoading(true);

    try {
      const items = [
        ...(cart.jxl > 0
          ? [{ id: "jxl", quantity: cart.jxl }]
          : []),

        ...(cart.reading > 0
          ? [{ id: "reading", quantity: cart.reading }]
          : []),

        ...(cart.replies > 0
          ? [{ id: "replies", quantity: cart.replies }]
          : []),
      ];

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "cart",
          items,
          returnUrl: `${window.location.origin}/reading/intake`,
        }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // Add toast later if desired.
    } finally {
      setLoading(false);
    }
  };

  /* ── Membership entry ── */

  const handleGetAccess = () => {
    // NEXT STEP: Wire this to Stripe subscription checkout
    // with monthly ($20) or yearly ($200) pricing.
    console.log(`XL Access selected: ${billingCycle}`);
    alert(`Subscribe pressed — ${billingCycle}`);
  };

  const C = STYLES;

  return (
    <div
      style={{
        ...C.root,
        ...(embedded ? C.rootEmbedded : {}),
      }}
    >
      <StarfieldBackground />

      {!embedded && (
        <button
          type="button"
          onClick={onClose}
          style={C.back}
        >
          <ChevronLeft size={16} />
        </button>
      )}

      <div style={C.container}>

        {/* ─────────────────────────────
            MEMBERSHIP
        ───────────────────────────── */}

        <section style={C.membershipFrame}>

          <div style={C.leftBracket}>
            <span style={C.leftBracketTop} />
            <span style={C.leftBracketBottom} />
          </div>

          <div style={C.rightBracket}>
            <span style={C.rightBracketTop} />
            <span style={C.rightBracketBottom} />
          </div>

          {/* ── Bracket pricing ── */}

          <button
            type="button"
            onClick={() => setBillingCycle("monthly")}
            style={{
              ...C.membershipPriceLeft,
              ...(billingCycle === "monthly"
                ? C.membershipPriceActive
                : C.membershipPriceInactive),
            }}
          >
            $20.00
          </button>

          <button
            type="button"
            onClick={() => setBillingCycle("yearly")}
            style={{
              ...C.membershipPriceRight,
              ...(billingCycle === "yearly"
                ? C.membershipPriceActive
                : C.membershipPriceInactive),
            }}
          >
            $200.00
          </button>

          <div style={C.membershipTitle}>
            MEMBERSHIP
          </div>

          <div style={C.membershipContent}>
            {MEMBERSHIP_FEATURES.map((feature) => (
              <div
                key={feature.title}
                style={C.featureRow}
              >
                <span style={C.featureName}>
                  {feature.title}
                </span>
                <span style={C.featureCopy}>
                  {feature.copy}
                </span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleGetAccess}
            style={C.getAccess}
          >
            SUBSCRIBE
            <span style={C.shimmerSweep} />
          </button>
        </section>


        {/* ─────────────────────────────
            BILLING TOGGLE
        ───────────────────────────── */}

        <div style={C.billingWrap}>

          <div style={C.billingToggleRow}>

            <button
              type="button"
              onClick={() => setBillingCycle("monthly")}
              style={{
                ...C.billingLabel,
                ...(billingCycle === "monthly"
                  ? C.billingLabelActive
                  : {}),
              }}
            >
              Monthly
            </button>

            <button
              type="button"
              aria-pressed={billingCycle === "yearly"}
              onClick={() =>
                setBillingCycle((current) =>
                  current === "monthly"
                    ? "yearly"
                    : "monthly"
                )
              }
              style={{
                ...C.billingSwitch,
                ...(billingCycle === "yearly"
                  ? C.billingSwitchOn
                  : {}),
              }}
            >
              <span
                style={{
                  ...C.billingKnob,
                  ...(billingCycle === "yearly"
                    ? C.billingKnobOn
                    : {}),
                }}
              />
            </button>

            <button
              type="button"
              onClick={() => setBillingCycle("yearly")}
              style={{
                ...C.billingLabel,
                ...(billingCycle === "yearly"
                  ? C.billingLabelActive
                  : {}),
              }}
            >
              Yearly
            </button>

          </div>

        </div>


        {/* ─────────────────────────────
            GET CREDITS
        ───────────────────────────── */}

        <div style={C.creditHeader}>
          <div style={C.titleRow}>
            <div style={C.titleLine} />
            <div style={C.title}>
              GET CREDITS
            </div>
            <div style={C.titleLine} />
          </div>
        </div>


        {/* ─────────────────────────────
            PRODUCTS
        ───────────────────────────── */}

        <div style={C.products}>
          {PRODUCTS.map((product) => {
            const quantity = cart[product.id];
            const isReplies = product.id === "replies";
            const displayedPrice = isReplies
              ? getReplyPrice(quantity || 1)
              : product.price;
            const savings = isReplies ? getReplySavings(quantity) : 0;

            return (
              <div
                key={product.id}
                style={C.selector}
              >
                <div style={C.inventoryCircle}>
                  {inventoryFor(product.id) + quantity}
                </div>

                <button
                  type="button"
                  aria-label={`Remove ${product.title}`}
                  onClick={() => step(product.id, -1)}
                  disabled={quantity <= 0}
                  style={{
                    ...C.selectorAction,
                    ...(quantity <= 0
                      ? C.selectorActionDisabled
                      : {}),
                  }}
                >
                  <Minus size={18} />
                </button>

                <div style={C.selectorCenter}>
                  <div style={C.selectorTitle}>
                    {product.title}
                  </div>
                  <div style={C.selectorMeta}>
                    {isReplies && quantity > 0
                      ? `${product.desc} · $${displayedPrice.toFixed(2)} selected`
                      : `${product.desc} · $${product.price.toFixed(2)}`}
                  </div>
                  {isReplies && savings > 0 && (
                    <div style={C.selectorSavings}>
                      You save ${savings.toFixed(2)}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  aria-label={`Add ${product.title}`}
                  onClick={() => step(product.id, 1)}
                  style={C.selectorAction}
                >
                  <Plus size={20} />
                </button>
              </div>
            );
          })}
        </div>


        {/* ─────────────────────────────
            CHECKOUT
        ───────────────────────────── */}

        <div style={C.checkoutWrap}>

          <div style={C.totalRow}>
            TOTAL:{" "}
            <span style={C.totalPrice}>
              ${total.toFixed(2)}
            </span>
          </div>

          {replySavings > 0 && (
            <div style={C.savingsLine}>
              Reply savings: ${replySavings.toFixed(2)}
            </div>
          )}

          <button
            type="button"
            onClick={handleCheckout}
            disabled={total <= 0 || loading}
            style={{
              ...C.checkout,
              ...(total <= 0 || loading
                ? C.checkoutDisabled
                : C.checkoutEnabled),
            }}
          >
            {loading ? "…" : "CHECKOUT"}
          </button>

        </div>

        {/* ─────────────────────────────
            BALANCE (under checkout)
        ───────────────────────────── */}

        {balance && (
          <p style={C.balanceBottom}>
            You currently have{" "}
            <b style={C.balanceStrong}>
              {balance.readings}
            </b>{" "}
            {plural(balance.readings, "reading")}
            ,{" "}
            <b style={C.balanceStrong}>
              {balance.jxl}
            </b>{" "}
            JXL, and{" "}
            <b style={C.balanceStrong}>
              {balance.replies}
            </b>{" "}
            {plural(balance.replies, "reply", "replies")}
            .
          </p>
        )}

        <style>{`
          @keyframes shimmer-sweep {
            0% { left: -60%; }
            45% { left: 130%; }
            100% { left: 130%; }
          }
          @keyframes checkout-pulse {
            0%, 100% { 
              box-shadow: 0 0 0 1px rgba(255,255,255,0.25), 
                          0 0 16px rgba(255,255,255,0.35), 
                          0 0 22px rgba(45,212,191,0.22); 
            }
            50% { 
              box-shadow: 0 0 0 1px rgba(255,255,255,0.35), 
                          0 0 20px rgba(255,255,255,0.45), 
                          0 0 30px rgba(45,212,191,0.4); 
            }
          }
        `}</style>

      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Styles
───────────────────────────────────────────── */

const GOLD = "rgba(251,191,36,0.72)";
const TEAL = "rgba(45,212,191,0.85)";
const TEAL_SOFT = "rgba(45,212,191,0.22)";
const BORDER = "rgba(148,163,184,0.24)";
const PANEL = "#050816";

// ── Shadow system (dark depth) ──
const SHADOW_DEEP = "0 14px 30px rgba(0,0,0,0.62), 0 5px 12px rgba(0,0,0,0.48)";
const SHADOW_GOLD = "0 14px 30px rgba(0,0,0,0.62), 0 0 18px rgba(251,191,36,0.10)";
const SHADOW_TEXT = "0 4px 10px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.6)";
const SHADOW_DROP_GOLD = "drop-shadow(0 10px 14px rgba(0,0,0,0.85)) drop-shadow(0 3px 5px rgba(0,0,0,0.65))";

const STYLES: Record<string, React.CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 50,
    background: "linear-gradient(180deg, #061120 0%, #050816 44%, #040611 100%)",
    color: "#f1f5f9",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    overflowY: "auto",
    overflowX: "hidden",
    WebkitOverflowScrolling: "touch",
  },

  rootEmbedded: {
    position: "relative",
    inset: "auto",
    zIndex: "auto",
    width: "100%",
    minHeight: "100%",
    height: "auto",
    overflowY: "visible",
  },

  back: {
    position: "fixed",
    top: "calc(12px + env(safe-area-inset-top))",
    left: 20,
    zIndex: 100,
    width: 36,
    height: 36,
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(5,8,22,0.6)",
    border: `1px solid ${BORDER}`,
    borderRadius: "50%",
    color: "#cbd5e1",
    cursor: "pointer",
    backdropFilter: "blur(8px)",
    boxShadow: SHADOW_DEEP,
  },

  container: {
  position: "relative",
  zIndex: 10,
  width: "100%",
  maxWidth: 430,
  margin: "0 auto",
  padding: `calc(8px + env(safe-area-inset-top)) 20px calc(60px + env(safe-area-inset-bottom))`,
  minHeight: "100vh",
  boxSizing: "border-box",
},

  /* ─────────────────────────────────
     MEMBERSHIP FRAME
  ───────────────────────────────── */

  membershipFrame: {
    position: "relative",
    padding: "56px 34px 70px",
    minHeight: 430,
  },

  leftBracket: {
    position: "absolute",
    top: 22,
    bottom: 20,
    left: 0,
    width: 54,
    borderLeft: `1.5px solid ${GOLD}`,
    pointerEvents: "none",
    filter: SHADOW_DROP_GOLD,
  },

  leftBracketTop: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 54,
    height: 1.5,
    background: GOLD,
  },

  leftBracketBottom: {
    position: "absolute",
    left: 0,
    bottom: 0,
    width: 54,
    height: 1.5,
    background: GOLD,
  },

  rightBracket: {
    position: "absolute",
    top: 22,
    bottom: 20,
    right: 0,
    width: 54,
    borderRight: `1.5px solid ${GOLD}`,
    pointerEvents: "none",
    filter: SHADOW_DROP_GOLD,
  },

  rightBracketTop: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 54,
    height: 1.5,
    background: GOLD,
  },

  rightBracketBottom: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 54,
    height: 1.5,
    background: GOLD,
  },

  membershipPriceLeft: {
    position: "absolute",
    left: 0,
    bottom: -2,
    border: "none",
    background: "transparent",
    padding: 0,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    cursor: "pointer",
  },

  membershipPriceRight: {
    position: "absolute",
    right: 0,
    bottom: -2,
    border: "none",
    background: "transparent",
    padding: 0,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    cursor: "pointer",
  },

  membershipPriceActive: {
    color: "#fde68a",
    opacity: 1,
    filter: "blur(0px)",
    textShadow: "0 4px 10px rgba(0,0,0,0.9), 0 0 10px rgba(251,191,36,0.25)",
  },

  membershipPriceInactive: {
    color: "#64748b",
    opacity: 0.42,
    filter: "blur(0.7px)",
  },

  membershipTitle: {
    position: "absolute",
    top: 11,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 3,
    padding: "0 18px",
    background: PANEL,
    color: "#fef3c7",
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: "0.18em",
    whiteSpace: "nowrap",
    textShadow: SHADOW_TEXT,
  },

  membershipContent: {
    display: "flex",
    flexDirection: "column",
    gap: 7,
  },

  featureRow: {
    lineHeight: 1.25,
    textAlign: "center",
  },

  featureName: {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    color: "#fff",
    textShadow: SHADOW_TEXT,
  },

  featureCopy: {
    display: "block",
    fontSize: 9.5,
    color: "#a7b1c3",
    marginTop: 1,
  },

  getAccess: {
    position: "absolute",
    left: "50%",
    bottom: -2,
    transform: "translateX(-50%)",
    zIndex: 3,
    overflow: "hidden",
    minWidth: 154,
    height: 46,
    padding: "0 24px",
    borderRadius: 10,
    border: `1px solid ${GOLD}`,
    background: PANEL,
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.08em",
    cursor: "pointer",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.25), 0 0 16px rgba(255,255,255,0.35), 0 0 22px rgba(251,191,36,0.35)",
    whiteSpace: "nowrap",
  },

  shimmerSweep: {
    position: "absolute",
    top: 0,
    left: "-60%",
    width: "45%",
    height: "100%",
    background: "linear-gradient(120deg, transparent, rgba(255,255,255,0.55), transparent)",
    transform: "skewX(-20deg)",
    animation: "shimmer-sweep 3.4s ease-in-out infinite",
  },

  /* ─────────────────────────────────
     BILLING TOGGLE
  ───────────────────────────────── */

  billingWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    margin: "26px 0 20px",
  },

  billingToggleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },

  billingLabel: {
    border: "none",
    background: "transparent",
    padding: 0,
    fontSize: 11,
    fontWeight: 600,
    color: "#64748b",
    letterSpacing: "0.05em",
    cursor: "pointer",
  },

  billingLabelActive: {
    color: "#fde68a",
    textShadow: SHADOW_TEXT,
  },

  billingSwitch: {
    width: 44,
    height: 24,
    borderRadius: 999,
    padding: 0,
    cursor: "pointer",
    border: `1px solid ${BORDER}`,
    background: "rgba(255,255,255,0.06)",
    position: "relative",
    boxShadow: SHADOW_DEEP,
  },

  billingSwitchOn: {
    borderColor: "rgba(251,191,36,0.45)",
    background: "rgba(251,191,36,0.12)",
  },

  billingKnob: {
    position: "absolute",
    top: 2,
    left: 2,
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: "#fde68a",
    transition: "left 0.2s ease",
  },

  billingKnobOn: {
    left: 22,
  },

  /* ─────────────────────────────────
     GET CREDITS
  ───────────────────────────────── */

  creditHeader: {
    margin: "8px 0 26px",
  },

  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
  },

  titleLine: {
    flex: 1,
    height: 1,
    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
  },

  title: {
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: "0.16em",
    color: "#fff",
    textAlign: "center",
    whiteSpace: "nowrap",
    textShadow: "0 4px 6px rgba(255,255,255,0.4), 0 0 22px rgba(255,255,255,0.18)",
  },

  /* ─────────────────────────────────
     PRODUCTS
  ───────────────────────────────── */

  products: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },

  selector: {
    position: "relative",
    minHeight: 84,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "14px 20px",
    border: `1px solid ${BORDER}`,
    borderRadius: 22,
    background: "linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.018))",
    boxShadow: SHADOW_DEEP,
  },

  selectorAction: {
    border: "none",
    background: "transparent",
    color: "#f8fafc",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
    flexShrink: 0,
  },

  selectorActionDisabled: {
    opacity: 0.22,
    cursor: "default",
  },

  selectorCenter: {
    flex: 1,
    minWidth: 0,
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
  },

  selectorTitle: {
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: "0.03em",
    color: "#fff",
    textTransform: "uppercase",
    textShadow: SHADOW_TEXT,
  },

  selectorMeta: {
    fontSize: 11,
    color: "#94a3b8",
  },

  selectorSavings: {
    fontSize: 9.5,
    color: "#fbbf24",
    textShadow: SHADOW_TEXT,
  },

  inventoryCircle: {
    position: "absolute",
    top: -10,
    right: -8,
    width: 27,
    height: 27,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(251,191,36,0.65)",
    background: "#07101d",
    color: "#fde68a",
    fontSize: 11,
    fontWeight: 700,
    zIndex: 4,
    boxShadow: SHADOW_DEEP,
  },

  /* ─────────────────────────────────
     CHECKOUT
  ───────────────────────────────── */

  checkoutWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },

  checkout: {
    height: 46,
    padding: "0 24px",
    minWidth: 154,
    borderRadius: 10,
    border: `1px solid ${TEAL}`,
    background: PANEL,
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.08em",
    cursor: "pointer",
    whiteSpace: "nowrap",
    opacity: 0.5,
    transition: "opacity 0.5s ease, box-shadow 0.5s ease",
  },

  checkoutEnabled: {
    opacity: 1,
    boxShadow: "0 0 0 1px rgba(255,255,255,0.25), 0 0 16px rgba(255,255,255,0.35), 0 0 22px rgba(45,212,191,0.22)",
    animation: "checkout-pulse 2.6s ease-in-out 0.6s infinite",
  },

  checkoutDisabled: {
    opacity: 0.36,
    cursor: "default",
    boxShadow: "none",
    animation: "none",
  },

  totalRow: {
    fontSize: 11,
    color: "#64748b",
    textAlign: "right",
    width: "100%",
    maxWidth: 300,
    margin: "6px 6px 0",
  },

  totalPrice: {
    color: "#cbd5e1",
    fontWeight: 600,
    fontSize: 11,
  },

  savingsLine: {
    fontSize: 10.5,
    color: "#fbbf24",
    textShadow: SHADOW_TEXT,
  },

  balanceBottom: {
    textAlign: "center",
    fontSize: 10.5,
    lineHeight: 1.45,
    color: "#7f8ba3",
    margin: "32px 2px 0",
  },

  balanceStrong: {
    color: "#cbd5e1",
    fontWeight: 600,
  },
};