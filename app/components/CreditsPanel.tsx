"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { ChevronLeft, Minus, Plus } from "lucide-react";
import StarfieldBackground from "./StarfieldBackground";
import { PRICING, formatUsd, getSubTier, SUB_TIERS } from "@/lib/paywallConfig";

/* ─────────────────────────────────────────────
   Products
───────────────────────────────────────────── */

type ProductId = "jxl" | "reading" | "replies";

interface Product {
  id: ProductId;
  title: string;
  desc: string;
  price: number; // in cents
}

const PRODUCTS: Product[] = [
  {
    id: "jxl",
    title: "JXL",
    desc: "Includes 2 replies",
    price: PRICING.jxl.price,
  },
  {
    id: "reading",
    title: "General Readings",
    desc: "Includes 1 reply",
    price: PRICING.reading.price,
  },
  {
    id: "replies",
    title: "More Replies",
    desc: "Works with any reading",
    price: PRICING.replies.priceEach,
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

/* ─────────────────────────────────────────────
   Reply pricing - removed bundle logic
   Now just $1 each, no bulk discount
───────────────────────────────────────────── */

function plural(n: number, one: string, many?: string): string {
  return n === 1 ? one : many ?? `${one}s`;
}

/* Respect the OS "reduce motion" setting for our own CSS animations. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
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
  const reducedMotion = useReducedMotion();

  const [cart, setCart] = useState<Record<ProductId, number>>({
    jxl: 0,
    reading: 0,
    replies: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
    setCart((current) => ({ ...current, [id]: Math.max(0, current[id] + amount) }));
  }, []);

  const total = useMemo(() => {
    // Simple cart math: quantity × price (all in cents)
    const totalCents =
      cart.jxl * PRICING.jxl.price +
      cart.reading * PRICING.reading.price +
      cart.replies * PRICING.replies.priceEach;
    return totalCents;
  }, [cart]);

  /* ── Credit checkout ── */
  const handleCheckout = async () => {
    if (total <= 0) return;
    setLoading(true);
    setError("");
    try {
      const items = [
        ...(cart.jxl > 0 ? [{ id: "jxl", quantity: cart.jxl }] : []),
        ...(cart.reading > 0 ? [{ id: "reading", quantity: cart.reading }] : []),
        ...(cart.replies > 0 ? [{ id: "replies", quantity: cart.replies }] : []),
      ];
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "cart",
          items,
          returnUrl: `${window.location.origin}/reading/intake`,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("Couldn't start checkout. Try again.");
      }
    } catch {
      setError("Couldn't reach checkout. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ── Membership entry ── */
  const handleGetAccess = async () => {
    setLoading(true);
    setError("");
    try {
      // Get the selected tier
      const tierKey = billingCycle === "yearly" ? "sub_plus" : "sub_base";
      const tier = getSubTier(tierKey);

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "subscription",
          tier: tierKey,
          returnUrl: `${window.location.origin}/reading/intake`,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("Couldn't start subscription. Try again.");
      }
    } catch {
      setError("Couldn't reach checkout. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const C = STYLES;

  return (
    <div style={{ ...C.root, ...(embedded ? C.rootEmbedded : {}) }}>
      <StarfieldBackground />

      {!embedded && (
        <button type="button" onClick={onClose} style={C.back} aria-label="Back">
          <ChevronLeft size={17} />
        </button>
      )}

      <div style={C.container}>
        {/* ── MEMBERSHIP ── */}
        <section style={C.membershipFrame}>
          <div style={C.leftBracket}>
            <span style={C.leftBracketTop} />
            <span style={C.leftBracketBottom} />
          </div>
          <div style={C.rightBracket}>
            <span style={C.rightBracketTop} />
            <span style={C.rightBracketBottom} />
          </div>

          <button
            type="button"
            onClick={() => setBillingCycle("monthly")}
            style={{
              ...C.membershipPriceLeft,
              ...(billingCycle === "monthly" ? C.membershipPriceActive : C.membershipPriceInactive),
            }}
          >
            {formatUsd(SUB_TIERS.sub_base.price)}
            <span style={C.priceUnit}>/mo</span>
          </button>

          <button
            type="button"
            onClick={() => setBillingCycle("yearly")}
            style={{
              ...C.membershipPriceRight,
              ...(billingCycle === "yearly" ? C.membershipPriceActive : C.membershipPriceInactive),
            }}
          >
            {formatUsd(SUB_TIERS.sub_plus.price)}
            <span style={C.priceUnit}>/mo</span>
          </button>

          <div style={C.membershipTitle}>MEMBERSHIP</div>

          {reducedMotion ? (
            <div style={C.membershipContentStatic}>
              {MEMBERSHIP_FEATURES.map((feature) => (
                <div key={feature.title} style={C.featureRow}>
                  <span style={C.featureName}>{feature.title}</span>
                  <span style={C.featureCopy}>{feature.copy}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={C.membershipWindow}>
              <div style={C.membershipTrack}>
                {[...MEMBERSHIP_FEATURES, ...MEMBERSHIP_FEATURES].map((feature, i) => (
                  <div key={i} style={C.featureRowScroll}>
                    <span style={C.featureName}>{feature.title}</span>
                    <span style={C.featureCopy}>{feature.copy}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleGetAccess}
            style={C.getAccess}
            disabled={loading}
          >
            {loading ? "Opening..." : "SUBSCRIBE"}
            {!reducedMotion && !loading && <span style={C.shimmerSweep} />}
          </button>
        </section>

        {/* ── BILLING TOGGLE ── */}
        <div style={C.billingWrap}>
          <div style={C.billingToggleRow}>
            <button
              type="button"
              onClick={() => setBillingCycle("monthly")}
              style={{ ...C.billingLabel, ...(billingCycle === "monthly" ? C.billingLabelActive : C.billingLabelInactive) }}
            >
              Base
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={billingCycle === "yearly"}
              aria-label="Toggle subscription tier"
              onClick={() =>
                setBillingCycle((current) => (current === "monthly" ? "yearly" : "monthly"))
              }
              style={{ ...C.billingSwitch, ...(billingCycle === "yearly" ? C.billingSwitchOn : {}) }}
            >
              <span style={{ ...C.billingKnob, ...(billingCycle === "yearly" ? C.billingKnobOn : {}), ...(!reducedMotion ? C.billingKnobPulse : {}) }} />
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle("yearly")}
              style={{ ...C.billingLabel, ...(billingCycle === "yearly" ? C.billingLabelActive : C.billingLabelInactive) }}
            >
              Plus
            </button>
          </div>
        </div>

        {/* ── PRODUCTS ── */}
        <div style={C.products}>
          {PRODUCTS.map((product) => {
            const quantity = cart[product.id];
            const isReplies = product.id === "replies";
            const displayedPrice = product.price;

            return (
              <div key={product.id} style={C.selector}>
                {quantity > 0 && (
                  <div style={C.inventoryCircle}>{quantity}</div>
                )}

                <button
                  type="button"
                  aria-label={`Remove ${product.title}`}
                  onClick={() => step(product.id, -1)}
                  disabled={quantity <= 0}
                  style={{ ...C.stepBtn, ...(quantity <= 0 ? C.stepBtnDisabled : {}) }}
                >
                  <Minus size={18} />
                </button>

                <div style={C.selectorCenter}>
                  <div style={C.selectorTitle}>{product.title}</div>
                  <div style={C.selectorMeta}>
                    {isReplies && quantity > 0
                      ? `${product.desc} · ${formatUsd(displayedPrice)} selected`
                      : `${product.desc} · ${formatUsd(displayedPrice)}`}
                  </div>
                </div>

                <button
                  type="button"
                  aria-label={`Add ${product.title}`}
                  onClick={() => step(product.id, 1)}
                  style={C.stepBtn}
                >
                  <Plus size={18} />
                </button>
              </div>
            );
          })}
        </div>

        {/* ── BALANCE (directly under the last product row) ── */}
        {balance && (
          <p style={C.balanceLine}>
            You currently have <b style={C.balanceStrong}>{balance.readings}</b>{" "}
            {plural(balance.readings, "reading")}, <b style={C.balanceStrong}>{balance.jxl}</b> JXL,
            and <b style={C.balanceStrong}>{balance.replies}</b>{" "}
            {plural(balance.replies, "reply", "replies")}.
          </p>
        )}

        {/* ── CHECKOUT ── */}
        <div style={C.checkoutWrap}>
          <button
            type="button"
            onClick={handleCheckout}
            disabled={total <= 0 || loading}
            style={{
              ...C.checkout,
              ...(total <= 0 || loading ? C.checkoutDisabled : C.checkoutEnabled),
              ...(!reducedMotion && total > 0 && !loading ? C.checkoutPulse : {}),
            }}
          >
            {loading ? "One moment…" : "CHECKOUT"}
          </button>

          <div style={C.totalRow}>
            <span style={C.totalLabel}>Total :</span>
            <span style={C.totalPrice}>{formatUsd(total)}</span>
          </div>

          {error && (
            <div role="alert" style={C.errorLine}>
              {error}
            </div>
          )}
        </div>

        <style>{`
          @keyframes element-shine {
            0%   { transform: translateX(-140%) skewX(-18deg); }
            60%  { transform: translateX(240%) skewX(-18deg); }
            100% { transform: translateX(240%) skewX(-18deg); }
          }
          @keyframes membership-marquee {
            from { transform: translateY(0); }
            to   { transform: translateY(-50%); }
          }
          @keyframes knob-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(251,191,36,0.0); }
            50%      { box-shadow: 0 0 7px 2px rgba(251,191,36,0.5); }
          }
          @keyframes checkout-pulse {
            0%, 100% { box-shadow: 0 0 0 1px rgba(255,255,255,0.22), 0 0 14px rgba(45,212,191,0.28); }
            50%      { box-shadow: 0 0 0 1px rgba(255,255,255,0.30), 0 0 22px rgba(45,212,191,0.42); }
          }
          @media (prefers-reduced-motion: reduce) {
            * { animation: none !important; }
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
const BORDER = "rgba(148,163,184,0.24)";
const PANEL = "#050816";

// Softened depth — the old shadows were near-opaque and muddied the dark bg.
const SHADOW_DEEP = "0 10px 24px rgba(0,0,0,0.5), 0 3px 8px rgba(0,0,0,0.4)";
const SHADOW_TEXT = "0 2px 8px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.55)";
const SHADOW_DROP_GOLD = "drop-shadow(0 8px 12px rgba(0,0,0,0.8)) drop-shadow(0 2px 4px rgba(0,0,0,0.6))";

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
    top: "calc(14px + env(safe-area-inset-top))",
    left: 18,
    zIndex: 100,
    width: 40,
    height: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(5,8,22,0.55)",
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
    maxWidth: 420,
    margin: "0 auto",
    padding: `calc(8px + env(safe-area-inset-top)) 22px calc(64px + env(safe-area-inset-bottom))`,
    minHeight: "100vh",
    boxSizing: "border-box",
  },

  /* MEMBERSHIP FRAME — brackets kept as the panel's signature */
  membershipFrame: {
    position: "relative",
    padding: "82px 36px 68px",
    minHeight: 430,
  },
  leftBracket: {
    position: "absolute", top: 22, bottom: 22, left: 0, width: 52,
    borderLeft: `1.5px solid ${GOLD}`, pointerEvents: "none", filter: SHADOW_DROP_GOLD,
  },
  leftBracketTop: { position: "absolute", left: 0, top: 0, width: 52, height: 1.5, background: GOLD },
  leftBracketBottom: { position: "absolute", left: 0, bottom: 0, width: 52, height: 1.5, background: GOLD },
  rightBracket: {
    position: "absolute", top: 22, bottom: 22, right: 0, width: 52,
    borderRight: `1.5px solid ${GOLD}`, pointerEvents: "none", filter: SHADOW_DROP_GOLD,
  },
  rightBracketTop: { position: "absolute", right: 0, top: 0, width: 52, height: 1.5, background: GOLD },
  rightBracketBottom: { position: "absolute", right: 0, bottom: 0, width: 52, height: 1.5, background: GOLD },

  membershipPriceLeft: {
    position: "absolute", left: -2, bottom: -4, border: "none", background: "transparent",
    padding: "6px 4px", fontSize: 13, fontWeight: 700, letterSpacing: "0.02em", cursor: "pointer",
    fontVariantNumeric: "tabular-nums",
  },
  membershipPriceRight: {
    position: "absolute", right: -2, bottom: -4, border: "none", background: "transparent",
    padding: "6px 4px", fontSize: 13, fontWeight: 700, letterSpacing: "0.02em", cursor: "pointer",
    fontVariantNumeric: "tabular-nums",
  },
  priceUnit: { fontSize: 10, fontWeight: 600, opacity: 0.8, marginLeft: 1 },
  membershipPriceActive: {
    color: "#fcd34d", opacity: 1, filter: "blur(0px)",
    textShadow: "0 2px 8px rgba(0,0,0,0.85), 0 0 10px rgba(251,191,36,0.28)",
  },
  membershipPriceInactive: { color: "#7c8aa3", opacity: 0.5, filter: "blur(0.6px)" },

  membershipTitle: {
    position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 3,
    padding: "0 18px", background: PANEL, color: "#fcd34d",
    fontSize: 10, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", whiteSpace: "nowrap",
  },
  membershipContentStatic: { display: "flex", flexDirection: "column", gap: 18 },
  membershipWindow: {
    position: "relative",
    height: 258,
    overflow: "hidden",
    WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 16%, #000 84%, transparent 100%)",
    maskImage: "linear-gradient(to bottom, transparent 0%, #000 16%, #000 84%, transparent 100%)",
  },
  membershipTrack: {
    display: "flex",
    flexDirection: "column",
    willChange: "transform",
    animation: "membership-marquee 24s linear infinite",
  },
  featureRow: { lineHeight: 1.3, textAlign: "center" },
  featureRowScroll: { lineHeight: 1.3, textAlign: "center", marginBottom: 26 },
  featureName: {
    display: "block", fontSize: 13, fontWeight: 500, color: "#f8fafc",
    letterSpacing: "0.01em",
  },
  featureCopy: {
    display: "block", fontSize: 11, color: "#94a3b8", marginTop: 3,
    lineHeight: 1.45,
  },

  getAccess: {
    position: "absolute", left: "50%", bottom: -4, transform: "translateX(-50%)", zIndex: 3,
    overflow: "hidden", minWidth: 172, height: 50, padding: "0 28px", borderRadius: 16,
    border: `1px solid ${GOLD}`,
    background: "rgba(255,255,255,0.03)",
    backdropFilter: "blur(4px)",
    color: "#fff",
    fontSize: 12, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase",
    cursor: "pointer",
    boxShadow: "0 0 22px rgba(251,191,36,0.26), inset 0 0 14px rgba(251,191,36,0.14)",
    whiteSpace: "nowrap",
  },
  shimmerSweep: {
    position: "absolute", top: 0, bottom: 0, left: 0, width: "45%",
    background:
      "linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.09) 45%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0.09) 55%, transparent 100%)",
    transform: "translateX(-140%) skewX(-18deg)",
    animation: "element-shine 4.6s ease-in-out infinite",
    pointerEvents: "none",
  },

  billingWrap: {
    display: "flex", flexDirection: "column", alignItems: "center", margin: "16px 0 12px",
  },
  billingToggleRow: { display: "flex", alignItems: "center", gap: 14 },
  billingLabel: {
    border: "none", background: "transparent", padding: "4px 4px", fontSize: 14, fontWeight: 700,
    color: "#7c8aa3", letterSpacing: "0.04em", cursor: "pointer",
    transition: "filter 0.2s ease, opacity 0.2s ease, color 0.2s ease",
  },
  billingLabelActive: { color: "#fde68a", opacity: 1, filter: "blur(0)", textShadow: SHADOW_TEXT },
  billingLabelInactive: { color: "#6b7691", opacity: 0.5, filter: "blur(1px)" },
  billingSwitch: {
    width: 46, height: 26, borderRadius: 999, padding: 0, cursor: "pointer",
    border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.06)", position: "relative",
    boxShadow: SHADOW_DEEP,
  },
  billingSwitchOn: { borderColor: "rgba(251,191,36,0.45)", background: "rgba(251,191,36,0.12)" },
  billingKnob: {
    position: "absolute", top: 2, left: 2, width: 20, height: 20, borderRadius: "50%",
    background: "#fde68a", transition: "left 0.2s ease",
  },
  billingKnobOn: { left: 22 },
  billingKnobPulse: { animation: "knob-pulse 2.4s ease-in-out infinite" },

  products: { display: "flex", flexDirection: "column", gap: 14 },
  selector: {
    position: "relative", minHeight: 86, display: "flex", alignItems: "center",
    justifyContent: "space-between", gap: 10, padding: "14px 16px",
    border: `1px solid ${BORDER}`, borderRadius: 20,
    background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
    boxShadow: SHADOW_DEEP,
  },
  stepBtn: {
    flexShrink: 0, width: 40, height: 40, borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.04)",
    color: "#f8fafc", cursor: "pointer", transition: "background 0.15s ease, opacity 0.15s ease",
  },
  stepBtnDisabled: { opacity: 0.28, cursor: "default", border: `1px solid rgba(148,163,184,0.12)` },
  selectorCenter: {
    flex: 1, minWidth: 0, textAlign: "center", display: "flex", flexDirection: "column",
    alignItems: "center", gap: 3,
  },
  selectorTitle: {
    fontSize: 18, fontWeight: 800, letterSpacing: "0.03em", color: "#fff",
    textTransform: "uppercase", textShadow: SHADOW_TEXT,
  },
  selectorMeta: { fontSize: 11.5, color: "#a4b0c4" },
  inventoryCircle: {
    position: "absolute", top: -10, right: -8, minWidth: 28, height: 28, padding: "0 4px",
    borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
    border: "1px solid rgba(251,191,36,0.6)", background: "#07101d", color: "#fde68a",
    fontSize: 11, fontWeight: 700, zIndex: 4, boxShadow: SHADOW_DEEP,
  },

  checkoutWrap: { display: "flex", flexDirection: "column", alignItems: "center", marginTop: 10, gap: 10 },
  totalRow: {
    display: "flex", alignItems: "baseline", justifyContent: "center", gap: 6,
  },
  totalLabel: { fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6b7691" },
  totalPrice: { color: "#cbd5e1", fontWeight: 700, fontSize: 11, letterSpacing: "0.06em" },
  checkout: {
    height: 50, padding: "0 26px", minWidth: 168, borderRadius: 11, border: `1px solid ${TEAL}`,
    background: PANEL, color: "#fff", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em",
    cursor: "pointer", whiteSpace: "nowrap", marginTop: 2,
    transition: "opacity 0.4s ease, box-shadow 0.4s ease",
  },
  checkoutEnabled: {
    opacity: 1,
    boxShadow: "0 0 0 1px rgba(255,255,255,0.22), 0 0 14px rgba(45,212,191,0.28)",
  },
  checkoutPulse: { animation: "checkout-pulse 3s ease-in-out 0.6s infinite" },
  checkoutDisabled: { opacity: 0.34, cursor: "default", boxShadow: "none", animation: "none" },
  errorLine: {
    fontSize: 11.5, color: "#fca5a5", textAlign: "center", maxWidth: 280, lineHeight: 1.4,
    marginTop: 2,
  },

  balanceLine: {
    textAlign: "center", fontSize: 11.5, lineHeight: 1.5, color: "#93a0b8", margin: "10px 2px 0",
  },
  balanceStrong: { color: "#dbe3f0", fontWeight: 700 },
};