import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, Minus, Plus } from "lucide-react";

/* ─────────────────────────────────────────────
   PREVIEW SHIMS (swap back for production)
   - StarfieldBackground: replace with your real import
   - balance: replace the mocked state with your
     /api/user/credits fetch (kept below, commented)
───────────────────────────────────────────── */

function StarfieldBackground() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf = 0;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const stars = Array.from({ length: 90 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.3 + 0.2,
      base: Math.random() * 0.5 + 0.2,
      tw: Math.random() * 0.5 + 0.2,
      phase: Math.random() * Math.PI * 2,
    }));

    const draw = (t) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        const a = reduce
          ? s.base
          : s.base + Math.sin(t / 1400 + s.phase) * s.tw * 0.5;
        ctx.beginPath();
        ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(226,232,240,${Math.max(0.05, a)})`;
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw(0);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1,
      }}
    />
  );
}

/* Respect the OS "reduce motion" setting for our own animations. */
function useReducedMotion() {
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
   Products
───────────────────────────────────────────── */

const PRODUCTS = [
  { id: "jxl", title: "JXL", desc: "Includes 3 replies", price: 12.99 },
  { id: "reading", title: "General Readings", desc: "Includes 2 replies", price: 10.0 },
  { id: "replies", title: "More Replies", desc: "Works with any reading", price: 1.0 },
];

/* ─────────────────────────────────────────────
   Membership
───────────────────────────────────────────── */

const MEMBERSHIP_FEATURES = [
  { title: "Unlimited Readings & Replies", copy: "Unlimited access to JXL & General Readings with replies." },
  { title: "Commission Eligible (request only)", copy: "Earn 1–5% recurring commission with subscription referrals." },
  { title: "Members-Only Features (beta)", copy: "Unlock experiences and tools only XL members can access." },
  { title: "Save Your Readings (beta)", copy: "Save your reading synopsis so you don't forget." },
  { title: "Lowered Cooldowns", copy: "More readings, less cooldowns." },
  { title: "Member Feedback Box", copy: "Send your ideas, requests, and feedback directly to us." },
];

/* ─────────────────────────────────────────────
   Reply pricing
   1–7 replies = $1 each · every group of 8 = $6
───────────────────────────────────────────── */

function getReplyPrice(quantity) {
  if (quantity <= 0) return 0;
  const groupsOfEight = Math.floor(quantity / 8);
  const remainder = quantity % 8;
  return groupsOfEight * 6 + remainder;
}

function getReplySavings(quantity) {
  return quantity - getReplyPrice(quantity);
}

function plural(n, one, many) {
  return n === 1 ? one : many ?? `${one}s`;
}

/* ─────────────────────────────────────────────
   Component
───────────────────────────────────────────── */

export default function CreditsPanel({ onClose, embedded = false }) {
  const reducedMotion = useReducedMotion();

  const [cart, setCart] = useState({ jxl: 0, reading: 0, replies: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [billingCycle, setBillingCycle] = useState("monthly");

  /* PREVIEW: mocked balance. In production keep your fetch:
     const [balance, setBalance] = useState(null);
     useEffect(() => { (async () => {
       try { const res = await fetch("/api/user/credits"); const d = await res.json();
         setBalance({ readings: Number(d.credits ?? 0), jxl: Number(d.jxlCredits ?? 0), replies: Number(d.replyCredits ?? 0) });
       } catch {} })(); }, []);                                                          */
  const [balance] = useState({ readings: 2, jxl: 1, replies: 5 });

  const step = useCallback((id, amount) => {
    setCart((current) => ({ ...current, [id]: Math.max(0, current[id] + amount) }));
  }, []);

  const replySavings = useMemo(() => getReplySavings(cart.replies), [cart.replies]);

  const total = useMemo(() => {
    return cart.jxl * 12.99 + cart.reading * 10 + getReplyPrice(cart.replies);
  }, [cart]);

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

  const handleGetAccess = () => {
    console.log(`XL Access selected: ${billingCycle}`);
    alert(`Subscribe pressed — ${billingCycle}`);
  };

  const C = STYLES;

  return (
    <div style={{ ...C.root, ...(embedded ? C.rootEmbedded : {}) }}>
      {!embedded && (
        <button type="button" onClick={onClose} style={C.back} aria-label="Back">
          <ChevronLeft size={17} />
        </button>
      )}

      <div style={C.container}>
        {/* ── MEMBERSHIP (beveled recess / frustum) ── */}
        <section style={C.membershipFrame}>
          {/* top faceplate: logo pill + title */}
          <div style={C.membershipLogo} aria-hidden="true" />
          <div style={C.membershipTitle}>MEMBERSHIP</div>

          {/* the sunken galaxy well */}
          <div style={C.recessWell}>
            <StarfieldBackground />

            {/* bevel geometry: walls (sheen), silver miter seams, subtle black fold line */}
            <svg style={C.bevelSvg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                {/* brushed-metal sweep — dark → bright band → dark, like the reference */}
                <linearGradient id="metalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#202227" />
                  <stop offset="30%" stopColor="#8c9199" />
                  <stop offset="48%" stopColor="#c9cdd4" />
                  <stop offset="62%" stopColor="#797d85" />
                  <stop offset="100%" stopColor="#1b1d21" />
                </linearGradient>
                <linearGradient id="seamGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#9aa0aa" />
                  <stop offset="50%" stopColor="#eef1f6" />
                  <stop offset="100%" stopColor="#9aa0aa" />
                </linearGradient>
                {/* anodized grain */}
                <filter id="grain" x="0" y="0" width="100%" height="100%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.9 0.5" numOctaves="2" stitchTiles="stitch" result="n" />
                  <feColorMatrix in="n" type="saturate" values="0" />
                </filter>
                {/* clip = the bevel ring (the four walls) */}
                <clipPath id="bevelClip">
                  <polygon points="0,0 100,0 93.5,7.5 6.5,7.5" />
                  <polygon points="0,0 6.5,7.5 6.5,92.5 0,100" />
                  <polygon points="100,0 100,100 93.5,92.5 93.5,7.5" />
                  <polygon points="0,100 6.5,92.5 93.5,92.5 100,100" />
                </clipPath>
              </defs>

              {/* solid metal frame walls */}
              <g clipPath="url(#bevelClip)">
                <rect x="0" y="0" width="100" height="100" fill="url(#metalGrad)" />
                {/* facet shading: top/left lifted, bottom/right deepened */}
                <polygon points="0,0 100,0 93.5,7.5 6.5,7.5" fill="rgba(255,255,255,0.10)" />
                <polygon points="0,0 6.5,7.5 6.5,92.5 0,100" fill="rgba(255,255,255,0.05)" />
                <polygon points="100,0 100,100 93.5,92.5 93.5,7.5" fill="rgba(0,0,0,0.28)" />
                <polygon points="0,100 6.5,92.5 93.5,92.5 100,100" fill="rgba(0,0,0,0.34)" />
                {/* grain */}
                <rect x="0" y="0" width="100" height="100" filter="url(#grain)" opacity="0.2" />
              </g>

              {/* inner fold line (metal → space): subtle black */}
              <rect x="6.5" y="7.5" width="87" height="85" fill="none"
                    stroke="rgba(0,0,0,0.6)" strokeWidth="1" vectorEffect="non-scaling-stroke" />

              {/* miter seams (bright silver) */}
              <g stroke="url(#seamGrad)" strokeWidth="1.2" strokeLinecap="round" vectorEffect="non-scaling-stroke">
                <line x1="0" y1="0" x2="6.5" y2="7.5" />
                <line x1="100" y1="0" x2="93.5" y2="7.5" />
                <line x1="100" y1="100" x2="93.5" y2="92.5" />
                <line x1="0" y1="100" x2="6.5" y2="92.5" />
              </g>
            </svg>

            {/* recessed viewport — the scrolling features */}
            <div style={C.recessViewport}>
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
                <div style={C.membershipTrack}>
                  {[...MEMBERSHIP_FEATURES, ...MEMBERSHIP_FEATURES].map((feature, i) => (
                    <div key={i} style={C.featureRowScroll}>
                      <span style={C.featureName}>{feature.title}</span>
                      <span style={C.featureCopy}>{feature.copy}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* billing price selectors on the bottom faceplate */}
          <button
            type="button"
            onClick={() => setBillingCycle("monthly")}
            style={{
              ...C.membershipPriceLeft,
              ...(billingCycle === "monthly" ? C.membershipPriceActive : C.membershipPriceInactive),
            }}
          >
            $20<span style={C.priceUnit}>/mo</span>
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle("yearly")}
            style={{
              ...C.membershipPriceRight,
              ...(billingCycle === "yearly" ? C.membershipPriceActive : C.membershipPriceInactive),
            }}
          >
            $200<span style={C.priceUnit}>/yr</span>
          </button>

          {/* SUBSCRIBE straddles the recess bottom edge */}
          <button type="button" onClick={handleGetAccess} style={C.getAccess}>
            SUBSCRIBE
            {!reducedMotion && <span style={C.shimmerSweep} />}
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
              M
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={billingCycle === "yearly"}
              aria-label="Toggle yearly billing"
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
              Y
            </button>
          </div>
        </div>

        {/* ── PRODUCTS ── */}
        <div style={C.products}>
          {PRODUCTS.map((product) => {
            const quantity = cart[product.id];
            const isReplies = product.id === "replies";
            const displayedPrice = isReplies ? getReplyPrice(quantity || 1) : product.price;
            const savings = isReplies ? getReplySavings(quantity) : 0;

            return (
              <div key={product.id} style={C.selector}>
                <div style={C.selectorSky} aria-hidden="true">
                  <StarfieldBackground />
                </div>

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
                      ? `${product.desc} · $${displayedPrice.toFixed(2)} selected`
                      : `${product.desc} · $${product.price.toFixed(2)}`}
                  </div>
                  {isReplies && savings > 0 && (
                    <div style={C.selectorSavings}>You save ${savings.toFixed(2)}</div>
                  )}
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
            <span style={C.totalPrice}>${total.toFixed(2)}</span>
          </div>

          {replySavings > 0 && (
            <div style={C.savingsLine}>Reply savings ${replySavings.toFixed(2)}</div>
          )}

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

const STYLES = {
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 50,
    background: "radial-gradient(150% 120% at 50% 0%, #0a0a0d 0%, #050506 55%, #020203 100%)", // black faceplate
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
    width: 40,           // was 36 — 40+ reads as a real tap target on mobile
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
    padding: `calc(10px + env(safe-area-inset-top)) 22px calc(64px + env(safe-area-inset-bottom))`,
    minHeight: "100vh",
    boxSizing: "border-box",
  },

  /* MEMBERSHIP — beveled recess (frustum). Faceplate = flat black front panel. */
  membershipFrame: {
    position: "relative",
    minHeight: 430,
    borderRadius: 26,
    background: "linear-gradient(150deg, #101017 0%, #08080d 55%, #030305 100%)", // black faceplate, faint sheen
    boxShadow:
      "0 18px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.6)",
  },
  // Small logo pill on the top faceplate — drop your mark in here.
  membershipLogo: {
    position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 4,
    width: 54, height: 15, borderRadius: 999,
    border: "1px solid rgba(200,205,216,0.35)", background: "rgba(255,255,255,0.03)",
  },
  // The sunken galaxy well.
  recessWell: {
    position: "absolute", top: 52, left: 20, right: 20, bottom: 44,
    borderRadius: 8, overflow: "hidden",
    background: "radial-gradient(125% 100% at 50% 0%, #14152c 0%, #0a0a18 46%, #050510 100%)",
    border: "1px solid rgba(0,0,0,0.6)", // outer fold line (faceplate → bevel)
    boxShadow: "inset 0 8px 20px rgba(0,0,0,0.7), inset 0 -6px 16px rgba(0,0,0,0.55)", // sunken
  },
  bevelSvg: { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 2 },
  // The recessed viewport — content sits inside the bevel walls.
  recessViewport: {
    position: "absolute", top: 24, bottom: 24, left: 24, right: 24, zIndex: 3,
    overflow: "hidden",
    WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 14%, #000 86%, transparent 100%)",
    maskImage: "linear-gradient(to bottom, transparent 0%, #000 14%, #000 86%, transparent 100%)",
  },

  membershipPriceLeft: {
    position: "absolute", left: 16, bottom: 12, border: "none", background: "transparent",
    padding: "6px 4px", fontSize: 12, fontWeight: 700, letterSpacing: "0.02em", cursor: "pointer",
    fontVariantNumeric: "tabular-nums", zIndex: 4,
  },
  membershipPriceRight: {
    position: "absolute", right: 16, bottom: 12, border: "none", background: "transparent",
    padding: "6px 4px", fontSize: 12, fontWeight: 700, letterSpacing: "0.02em", cursor: "pointer",
    fontVariantNumeric: "tabular-nums", zIndex: 4,
  },
  priceUnit: { fontSize: 9, fontWeight: 600, opacity: 0.75, marginLeft: 1 },
  membershipPriceActive: {
    color: "#fde68a", opacity: 1, filter: "blur(0px)", // gold
    textShadow: "0 1px 4px rgba(0,0,0,0.85), 0 0 8px rgba(251,191,36,0.3)",
  },
  membershipPriceInactive: { color: "#5b626e", opacity: 0.6, filter: "blur(0.6px)" }, // graphite

  membershipTitle: {
    position: "absolute", top: 36, left: "50%", transform: "translateX(-50%)", zIndex: 4,
    color: "#fde68a", // gold
    fontSize: 11, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", whiteSpace: "nowrap",
    textShadow: "0 1px 3px rgba(0,0,0,0.85), 0 0 8px rgba(251,191,36,0.25)",
  },
  // Reduced-motion fallback: the static list, fully visible.
  membershipContentStatic: { display: "flex", flexDirection: "column", gap: 18 },
  // 24s = one full drift. Lower for faster, higher for slower.
  membershipTrack: {
    display: "flex",
    flexDirection: "column",
    willChange: "transform",
    animation: "membership-marquee 24s linear infinite",
  },
  featureRow: { lineHeight: 1.3, textAlign: "center" },
  // Spacing baked into each row (not a parent gap) so both copies tile seamlessly.
  featureRowScroll: { lineHeight: 1.3, textAlign: "center", marginBottom: 26 },
  featureName: {
    display: "block", fontSize: 13, fontWeight: 600, color: "#f2d99a", // soft gold
    letterSpacing: "0.01em", textShadow: "0 1px 3px rgba(0,0,0,0.8)",
  },
  featureCopy: {
    display: "block", fontSize: 11, color: "#9aa3b4", marginTop: 3,
    lineHeight: 1.45, textShadow: "0 1px 2px rgba(0,0,0,0.7)",
  },

  getAccess: {
    position: "absolute", left: "50%", bottom: 22, transform: "translateX(-50%)", zIndex: 5,
    overflow: "hidden", minWidth: 176, height: 46, padding: "0 28px", borderRadius: 14,
    border: `1px solid ${GOLD}`,
    background: "rgba(255,255,255,0.03)",
    backdropFilter: "blur(4px)",
    color: "#fff",
    fontSize: 12, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase",
    cursor: "pointer",
    boxShadow: "0 0 22px rgba(251,191,36,0.30), inset 0 0 14px rgba(251,191,36,0.16)", // gold glow
    whiteSpace: "nowrap",
  },
  // Birthchart's exact element-shine sweep (skewX -18deg, translateX pass).
  shimmerSweep: {
    position: "absolute", top: 0, bottom: 0, left: 0, width: "45%",
    background:
      "linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.09) 45%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0.09) 55%, transparent 100%)",
    transform: "translateX(-140%) skewX(-18deg)",
    animation: "element-shine 4.6s ease-in-out infinite",
    pointerEvents: "none",
  },

  /* BILLING TOGGLE */
  // Top is 16 (not 14) because SUBSCRIBE overhangs the frame ~4px, so this lands
  // the visible subscribe→toggle gap ≈ the toggle→JXL gap (both ~12px).
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

  /* PRODUCTS */
  products: { display: "flex", flexDirection: "column", gap: 14 },
  selector: {
    position: "relative", isolation: "isolate", overflow: "hidden",
    minHeight: 86, display: "flex", alignItems: "center",
    justifyContent: "space-between", gap: 10, padding: "14px 16px",
    border: "1px solid rgba(206,211,222,0.18)", borderRadius: 20, // thin window frame
    background: "transparent",
    boxShadow: "inset 0 0 24px rgba(0,0,0,0.5)",
  },
  // Clipped starfield sitting behind the card content (window onto space).
  selectorSky: {
    position: "absolute", inset: 0, zIndex: -1, overflow: "hidden", borderRadius: 20,
    background: "radial-gradient(130% 120% at 30% 0%, #12142b 0%, #0a0a16 55%, #050510 100%)",
  },
  // NEW: circular 40px tap target with a visible ring — was a bare 30px icon
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
  selectorMeta: { fontSize: 11.5, color: "#a4b0c4" }, // was 11 / #94a3b8
  selectorSavings: { fontSize: 10.5, fontWeight: 600, color: "#fbbf24", textShadow: SHADOW_TEXT },
  inventoryCircle: {
    position: "absolute", top: -10, right: -8, minWidth: 28, height: 28, padding: "0 4px",
    borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
    border: "1px solid rgba(251,191,36,0.6)", background: "#07101d", color: "#fde68a",
    fontSize: 11, fontWeight: 700, zIndex: 4, boxShadow: SHADOW_DEEP,
  },

  /* CHECKOUT */
  checkoutWrap: { display: "flex", flexDirection: "column", alignItems: "center", marginTop: 10, gap: 10 },
  totalRow: {
    display: "flex", alignItems: "baseline", justifyContent: "center", gap: 6,
  },
  totalLabel: { fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6b7691" },
  totalPrice: { color: "#cbd5e1", fontWeight: 700, fontSize: 11, letterSpacing: "0.06em" },
  savingsLine: { fontSize: 11, fontWeight: 600, color: "#fbbf24", textShadow: SHADOW_TEXT, paddingRight: 0 },
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