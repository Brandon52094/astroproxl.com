"use client";

import React, { useMemo, useState } from "react";
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
    title: "Regular Reading",
    desc: "Includes 2 replies",
    price: 10.0,
  },
  {
    id: "replies",
    title: "Replies",
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
    title: "Commission Eligible",
    copy:
      "Earn 1–5% recurring commission when someone you refer becomes a member.",
  },
  {
    title: "Members-Only Features",
    copy:
      "Unlock experiences and tools only XL members can access.",
  },
  {
    title: "Unlimited Readings & Replies",
    copy:
      "Regular readings and replies, whenever you want. Unlimited averages may change.",
  },
  {
    title: "No Cooldowns",
    copy:
      "Start another reading whenever you're ready.",
  },
  {
    title: "Member Feedback Box",
    copy:
      "Send your ideas, requests, and feedback directly to us.",
  },
];

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

/* ─────────────────────────────────────────────
   Component
───────────────────────────────────────────── */

export default function CreditsPanel({
  onClose,
}: {
  onClose?: () => void;
}) {
  const [cart, setCart] = useState<Record<ProductId, number>>({
    jxl: 0,
    reading: 0,
    replies: 0,
  });

  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<Balance | null>(null);

  /* Current balances */
  React.useEffect(() => {
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

  const step = (id: ProductId, amount: number) => {
    setCart((current) => ({
      ...current,
      [id]: Math.max(0, current[id] + amount),
    }));
  };

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
    /*
      NEXT STEP:
      Route this into MembershipPanel or your new
      monthly/yearly XL Access selector.

      We intentionally do NOT send the user into
      the old $12 / $16 subscription checkout here.
    */

    console.log("Open XL Access membership");
  };

  const C = STYLES;

  return (
    <div style={C.root}>
      <StarfieldBackground />

      {/* Back */}
      <button
        type="button"
        onClick={onClose}
        style={C.back}
      >
        <ChevronLeft size={16} />
        Back
      </button>

      <div style={C.container}>

        {/* ─────────────────────────────
            GET CREDITS
        ───────────────────────────── */}

        <div style={C.creditHeader}>
          <div style={C.title}>GET CREDITS</div>

          {balance && (
            <p style={C.balance}>
              You currently have{" "}
              <b style={C.balanceStrong}>{balance.readings}</b>{" "}
              {plural(balance.readings, "reading")},{" "}
              <b style={C.balanceStrong}>{balance.jxl}</b> JXL, and{" "}
              <b style={C.balanceStrong}>{balance.replies}</b>{" "}
              {plural(balance.replies, "reply", "replies")}.
            </p>
          )}

          <div style={C.headerDivider} />
        </div>

        <div style={C.products}>
          {PRODUCTS.map((product) => (
            <CreditSelector
              key={product.id}
              product={product}
              quantity={cart[product.id]}
              inventory={
                product.id === "jxl"
                  ? balance?.jxl ?? 0
                  : product.id === "reading"
                  ? balance?.readings ?? 0
                  : balance?.replies ?? 0
              }
              onStep={step}
              replySavings={
                product.id === "replies"
                  ? replySavings
                  : 0
              }
            />
          ))}
        </div>

        {/* TOTAL */}

        <div style={C.totalRow}>
          TOTAL :{" "}
          <span style={C.totalPrice}>
            ${total.toFixed(2)}
          </span>
        </div>

        {replySavings > 0 && (
          <div style={C.savingsLine}>
            Reply savings: ${replySavings.toFixed(2)}
          </div>
        )}

        {/* CHECKOUT */}

        <button
          type="button"
          onClick={handleCheckout}
          disabled={total <= 0 || loading}
          style={{
            ...C.checkout,
            ...(total <= 0 || loading
              ? C.checkoutDisabled
              : {}),
          }}
        >
          {loading ? "…" : "CHECKOUT"}
        </button>

        {/* ─────────────────────────────
            MEMBERSHIP

            Exactly TWO large brackets:
            1 left
            1 right
        ───────────────────────────── */}

        <section style={C.membershipFrame}>

          {/* LEFT LARGE BRACKET */}
          <div style={C.leftBracket}>
            <span style={C.leftBracketTop} />
            <span style={C.leftBracketBottom} />
          </div>

          {/* RIGHT LARGE BRACKET */}
          <div style={C.rightBracket}>
            <span style={C.rightBracketTop} />
            <span style={C.rightBracketBottom} />
          </div>

          {/* Top opening */}
          <div style={C.membershipTitle}>
            MEMBERSHIP
          </div>

          {/* Feature matrix */}
          <div style={C.membershipContent}>
            {MEMBERSHIP_FEATURES.map((feature) => (
              <div
                key={feature.title}
                style={C.featureRow}
              >
                <div style={C.featureName}>
                  {feature.title}
                </div>

                <div style={C.featureCopy}>
                  {feature.copy}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom opening */}
          <button
            type="button"
            onClick={handleGetAccess}
            style={C.getAccess}
          >
            GET ACCESS
          </button>
        </section>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Credit selector
───────────────────────────────────────────── */

function CreditSelector({
  product,
  quantity,
  inventory,
  onStep,
  replySavings,
}: {
  product: Product;
  quantity: number;
  inventory: number;
  onStep: (id: ProductId, amount: number) => void;
  replySavings: number;
}) {
  const isReplies = product.id === "replies";

  const displayedPrice = isReplies
    ? getReplyPrice(quantity || 1)
    : product.price;

  return (
    <div style={STYLES.selector}>
      {/* Minus */}

      <button
        type="button"
        aria-label={`Remove ${product.title}`}
        onClick={() => onStep(product.id, -1)}
        disabled={quantity <= 0}
        style={{
          ...STYLES.selectorAction,
          ...(quantity <= 0
            ? STYLES.selectorActionDisabled
            : {}),
        }}
      >
        <Minus size={18} />
      </button>

      {/* Center */}

      <div style={STYLES.selectorCenter}>
        <div style={STYLES.selectorTitle}>
          {product.title}
        </div>

        <div style={STYLES.selectorMeta}>
          {product.desc}
        </div>

        <div style={STYLES.selectorPrice}>
          {isReplies && quantity > 0
            ? `$${displayedPrice.toFixed(2)} selected`
            : `$${product.price.toFixed(2)}`}
        </div>

        {isReplies && replySavings > 0 && (
          <div style={STYLES.selectorSavings}>
            You save ${replySavings.toFixed(2)}
          </div>
        )}
      </div>

      {/* Inventory badge + Plus */}

      <div style={STYLES.selectorRight}>
        <div style={STYLES.inventoryCircle}>
          {inventory}
        </div>

        <button
          type="button"
          aria-label={`Add ${product.title}`}
          onClick={() => onStep(product.id, 1)}
          style={STYLES.selectorAction}
        >
          <Plus size={20} />
        </button>
      </div>
    </div>
  );
}

function plural(
  n: number,
  one: string,
  many?: string
) {
  return n === 1
    ? one
    : many ?? `${one}s`;
}

/* ─────────────────────────────────────────────
   Styles
───────────────────────────────────────────── */

const GOLD = "rgba(251,191,36,0.72)";
const GOLD_SOFT = "rgba(251,191,36,0.18)";
const BORDER = "rgba(148,163,184,0.24)";
const PANEL = "#050816";

const STYLES: Record<
  string,
  React.CSSProperties
> = {
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 50,
    background:
      "linear-gradient(180deg, #061120 0%, #050816 44%, #040611 100%)",
    color: "#f1f5f9",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    overflowY: "auto",
    overflowX: "hidden",
    WebkitOverflowScrolling: "touch",
  },

  back: {
    position: "fixed",
    top: "calc(12px + env(safe-area-inset-top))",
    left: 16,
    zIndex: 100,
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: "rgba(5,8,22,0.6)",
    border: `1px solid ${BORDER}`,
    borderRadius: 999,
    padding: "6px 12px 6px 8px",
    color: "#cbd5e1",
    fontSize: 13,
    cursor: "pointer",
    backdropFilter: "blur(8px)",
  },

  container: {
    position: "relative",
    zIndex: 10,
    width: "100%",
    maxWidth: 430,
    margin: "0 auto",
    padding:
      "calc(70px + env(safe-area-inset-top)) 20px calc(70px + env(safe-area-inset-bottom))",
    minHeight: "100vh",
    boxSizing: "border-box",
  },

  /* HEADER */

  creditHeader: {
    marginBottom: 24,
  },

  title: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: "0.12em",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },

  headerDivider: {
    height: 1,
    width: "100%",
    background:
      "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
    marginTop: 14,
  },

  /* PRODUCT SELECTORS */

  products: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  selector: {
    position: "relative",
    minHeight: 82,
    display: "grid",
    gridTemplateColumns: "52px 1fr 72px",
    alignItems: "stretch",
    border: `1px solid ${BORDER}`,
    borderRadius: 18,
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.018))",
    overflow: "visible",
    boxShadow:
      "0 10px 35px rgba(0,0,0,0.16)",
  },

  selectorAction: {
    border: "none",
    background: "transparent",
    color: "#f8fafc",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
  },

  selectorActionDisabled: {
    opacity: 0.22,
    cursor: "default",
  },

  selectorCenter: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: "12px 10px",
    minWidth: 0,
  },

  selectorTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#fff",
    marginBottom: 3,
  },

  selectorMeta: {
    fontSize: 10.5,
    color: "#94a3b8",
    lineHeight: 1.3,
  },

  selectorPrice: {
    fontSize: 11,
    color: "#d8dee9",
    marginTop: 4,
  },

  selectorSavings: {
    fontSize: 9.5,
    color: "#fbbf24",
    marginTop: 2,
  },

  selectorRight: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderLeft: `1px solid ${BORDER}`,
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
  },

  /* TOTAL / CHECKOUT */

  totalRow: {
    textAlign: "center",
    margin: "20px 0 0",
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: "0.16em",
    color: "#f8fafc",
  },

  totalPrice: {
    color: "#fde68a",
    fontSize: 14,
  },

  savingsLine: {
    textAlign: "right",
    fontSize: 10.5,
    color: "#fbbf24",
    margin: "0 4px 10px",
  },

  checkout: {
    width: "74%",
    minHeight: 48,
    display: "block",
    margin: "12px auto 0",
    borderRadius: 999,
    cursor: "pointer",
    border:
      "1px solid rgba(129,140,248,0.55)",
    background:
      "rgba(129,140,248,0.13)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: "0.1em",
  },

  checkoutDisabled: {
    opacity: 0.36,
    cursor: "default",
  },

  balance: {
    textAlign: "center",
    fontSize: 10.5,
    lineHeight: 1.45,
    color: "#7f8ba3",
    margin: "4px 2px 0",
  },

  balanceStrong: {
    color: "#cbd5e1",
    fontWeight: 600,
  },

  /* ─────────────────────────────────
     MEMBERSHIP FRAME
  ───────────────────────────────── */

  membershipFrame: {
    position: "relative",
    marginTop: 34,
    padding:
      "56px 34px 70px",
    minHeight: 430,
  },

  /* LEFT BRACKET — ONE element */

  leftBracket: {
    position: "absolute",
    top: 22,
    bottom: 20,
    left: 0,
    width: 54,
    borderLeft: `1.5px solid ${GOLD}`,
    pointerEvents: "none",
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

  /* RIGHT BRACKET — ONE element */

  rightBracket: {
    position: "absolute",
    top: 22,
    bottom: 20,
    right: 0,
    width: 54,
    borderRight: `1.5px solid ${GOLD}`,
    pointerEvents: "none",
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

  /* TOP OPENING */

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
  },

  /* FEATURE MATRIX */

  membershipContent: {
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },

  featureRow: {
    display: "grid",
    gridTemplateColumns:
      "minmax(105px, 0.72fr) minmax(0, 1.5fr)",
    columnGap: 22,
    alignItems: "start",
  },

  featureName: {
    fontSize: 11,
    lineHeight: 1.3,
    fontWeight: 700,
    color: "#f8fafc",
  },

  featureCopy: {
    fontSize: 11,
    lineHeight: 1.5,
    color: "#a7b1c3",
  },

  /* BOTTOM OPENING */

  getAccess: {
    position: "absolute",
    left: "50%",
    bottom: -2,
    transform: "translateX(-50%)",
    zIndex: 3,
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
    boxShadow:
      `0 0 24px ${GOLD_SOFT}`,
    whiteSpace: "nowrap",
  },
};