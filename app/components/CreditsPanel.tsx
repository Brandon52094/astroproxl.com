"use client";

import React, { useState, useMemo } from "react";
import { ChevronLeft, Minus, Plus } from "lucide-react";
import StarfieldBackground from "./StarfieldBackground";

/* ── Products ── */
type ProductId = "reading" | "jxl" | "replies";
interface Product { id: ProductId; title: string; desc: string; price: number; mode: string; row: 1 | 2; }
const PRODUCTS: Product[] = [
  { id: "reading", title: "Reading", desc: "1 reading credit · 1 free reply", price: 4.0, mode: "one_time",   row: 1 },
  { id: "jxl",     title: "JXL",     desc: "1 JXL session · 2 free replies",  price: 6.0, mode: "jxl_session", row: 1 },
  { id: "replies", title: "Replies", desc: "Works on readings or JXL · +2",   price: 2.0, mode: "reply_pack",  row: 2 },
];

interface Tier { id: string; price: string; desc: string; hero?: boolean; }
const TIERS: Tier[] = [
  { id: "sub_base", price: "$12/mo", desc: "4 readings + 4 JXL" },
  { id: "sub_plus", price: "$16/mo", desc: "8 readings + 8 JXL", hero: true },
];
const PERKS = ["Reading credits every month","JXL follow-up credits every month","Free reading downloads","50% off extras after you run out","No cooldowns, ever"];

interface Balance { readings: number; jxl: number; replies: number; }

/**
 * Credits panel. Render as an OVERLAY (createPortal) so it feels like the app,
 * not a browser tab. `onClose` returns to the previous screen.
 */
export default function CreditsPanel({ onClose }: { onClose?: () => void }) {
  const [cart, setCart] = useState<Record<ProductId, number>>({ reading: 0, jxl: 0, replies: 0 });
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Pull the user's current credits for the line under checkout.
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/user/credits");
        const d = await res.json();
        setBalance({
          readings: Number(d.credits ?? 0),
          jxl: Number(d.jxlCredits ?? 0),
          replies: Number(d.replyCredits ?? 0) + Number(d.jxlReplyCredits ?? 0),
        });
      } catch { /* leave balance null; line just won't render */ }
    })();
  }, []);

  // Pull (or auto-create) the user's referral code for the share section.
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/user/referral-code");
        const d = await res.json();
        if (d.code) setReferralCode(d.code);
      } catch { /* leave null; section just won't render */ }
    })();
  }, []);

  const total = useMemo(() => PRODUCTS.reduce((s, p) => s + cart[p.id] * p.price, 0), [cart]);
  const step = (id: ProductId, d: number) =>
    setCart((c) => ({ ...c, [id]: Math.max(0, c[id] + d) }));

  const handleCheckout = async () => {
    if (total <= 0) return;
    setLoading(true);
    try {
      const items = PRODUCTS.filter((p) => cart[p.id] > 0).map((p) => ({ mode: p.mode, id: p.id, quantity: cart[p.id] }));
      const res = await fetch("/api/stripe/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "cart", items, returnUrl: `${window.location.origin}/reading/intake` }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch { /* toast */ } finally { setLoading(false); }
  };

  const handleSubscribe = async (tier: Tier) => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "subscription", bundleTier: tier.id, returnUrl: `${window.location.origin}/reading/intake` }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch { /* toast */ } finally { setLoading(false); }
  };

  const handleCopyReferralLink = async () => {
    if (!referralCode) return;
    const link = `${window.location.origin}?ref=${referralCode}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard API can fail silently on some browsers; no-op */ }
  };

  const C = STYLES;

  return (
    <div style={C.root}>
      {/* ── Starfield backdrop ── */}
      <StarfieldBackground />

      {/* Back */}
      <button type="button" onClick={onClose} style={C.back}>
        <ChevronLeft size={16} /> Back
      </button>

      <div style={C.container}>
        {/* ── CART ── */}
        <div style={C.titleRow}>
          <span style={C.titleLine} /><span style={C.title}>Get Credits</span><span style={C.titleLine} />
        </div>

        <div style={C.grid}>
          {PRODUCTS.filter((p) => p.row === 1).map((p) => (
            <ProductCard key={p.id} p={p} qty={cart[p.id]} onStep={step} />
          ))}
        </div>
        <div style={C.repliesRow}>
          <div style={{ width: "calc(50% - 7px)" }}>
            {PRODUCTS.filter((p) => p.row === 2).map((p) => (
              <ProductCard key={p.id} p={p} qty={cart[p.id]} onStep={step} />
            ))}
          </div>
        </div>

        <div style={C.totalLine}>TOTAL : <span style={{ color: "#fde68a" }}>${total.toFixed(2)}</span></div>
        <button
          type="button"
          onClick={handleCheckout}
          disabled={total <= 0 || loading}
          style={{ ...C.checkout, ...(total <= 0 || loading ? C.checkoutDisabled : {}) }}
        >
          {loading ? "…" : "SWIPE TO CHECKOUT"}
        </button>

        {balance && (
          <p style={C.balance}>
            You currently have{" "}
            <b style={C.balanceB}>{balance.readings}</b> {plural(balance.readings, "reading")},{" "}
            <b style={C.balanceB}>{balance.jxl}</b> JXL, and{" "}
            <b style={C.balanceB}>{balance.replies}</b> {plural(balance.replies, "reply", "replies")}.
          </p>
        )}

        {/* ── REFERRAL ── */}
        {referralCode && (
          <div style={C.referralBox}>
            <p style={C.referralHeading}>Give a reading, get a reading</p>
            <p style={C.referralSub}>
              Share your code — when a friend makes their first purchase, you get{" "}
              <b style={C.balanceB}>1 free reading credit</b>, and they get{" "}
              <b style={C.balanceB}>15% off</b>.
            </p>
            <div style={C.referralCodeRow}>
              <span style={C.referralCode}>{referralCode}</span>
              <button type="button" onClick={handleCopyReferralLink} style={C.referralCopyBtn}>
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>
          </div>
        )}

        {/* ── MEMBERSHIP ── */}
        <div style={C.memDiv}>
          <span style={C.memLine} /><span style={C.memLabel}>Membership</span><span style={C.memLine} />
        </div>

        <h3 style={C.offerHeading}>More Readings, Real Savings</h3>
        <div style={{ marginBottom: 4 }}>
          {PERKS.map((perk) => (
            <div key={perk} style={C.perkItem}>
              <span style={C.perkCheck}>✓</span><span style={C.perkText}>{perk}</span>
            </div>
          ))}
        </div>
        <p style={C.memSub}>Less than two single readings a month.</p>

        <div style={C.tiers}>
          {TIERS.map((t) => (
            <div key={t.id} style={{ ...C.tierCard, ...(t.hero ? C.tierHero : C.tierBase) }}>
              {t.hero && <span style={C.bestBadge}>Best Value</span>}
              <p style={C.tierPrice}>{t.price}</p>
              <p style={C.tierDesc}>{t.desc}</p>
              <p style={C.tierCadence}>every month</p>
              <button
                type="button"
                onClick={() => handleSubscribe(t)}
                disabled={loading}
                style={{ ...C.tierBtn, ...(t.hero ? C.tierBtnHero : C.tierBtnBase) }}
              >
                Subscribe
              </button>
            </div>
          ))}
        </div>
        <p style={C.cancel}>Cancel anytime</p>
      </div>
    </div>
  );
}

function plural(n: number, one: string, many?: string) {
  return n === 1 ? one : (many ?? one + "s");
}

/* ── Product card: 60/40 split, live stepper, top-left count badge ── */
function ProductCard({ p, qty, onStep }: {
  p: Product; qty: number; onStep: (id: ProductId, d: number) => void;
}) {
  const C = STYLES;
  const active = qty > 0;
  return (
    <div style={{ ...C.card, ...(active ? C.cardActive : {}) }}>
      {active && <span style={C.badge}>{qty}</span>}
      <div style={C.cardInner}>
        <div style={C.cardLeft}>
          <p style={C.cardTitle}>{p.title}</p>
          <p style={C.cardDesc}>{p.desc}</p>
        </div>
        <div style={C.cardRight}>
          <div style={C.price}>${p.price.toFixed(2)}</div>
          <div style={C.stepper}>
            <button
              type="button" aria-label="decrease"
              onClick={() => onStep(p.id, -1)} disabled={qty <= 0}
              style={{ ...C.stepBtn, ...C.stepMinus, ...(qty <= 0 ? C.stepDisabled : {}) }}
            >
              <Minus size={16} />
            </button>
            <button
              type="button" aria-label="increase"
              onClick={() => onStep(p.id, 1)}
              style={C.stepBtn}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Styles (plain objects — no styled-jsx, guaranteed to render) ── */
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
  back: {
    position: "fixed", top: "calc(12px + env(safe-area-inset-top))", left: 16, zIndex: 100,
    display: "flex", alignItems: "center", gap: 4,
    background: "rgba(5,8,22,0.6)", border: "1px solid rgba(148,163,184,0.2)",
    borderRadius: 999, padding: "6px 12px 6px 8px", color: "#cbd5e1",
    fontSize: 13, cursor: "pointer", backdropFilter: "blur(8px)",
  },
  container: {
    position: "relative",
    zIndex: 10,
    maxWidth: 430,
    margin: "0 auto",
    padding: "calc(35px + env(safe-area-inset-top)) 16px calc(40px + env(safe-area-inset-bottom))",
    minHeight: "100vh",
  },

  titleRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 22 },
  titleLine: { height: 1, flex: 1, background: "rgba(255,255,255,0.18)" },
  title: { fontSize: 20, fontWeight: 700, letterSpacing: "0.06em", color: "#fff", whiteSpace: "nowrap" },

  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  repliesRow: { marginTop: 14, display: "flex", justifyContent: "center" },

  card: { position: "relative", display: "flex", alignItems: "stretch", borderRadius: 14, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.035)", minHeight: 120 },
  cardActive: { borderColor: "rgba(129,140,248,0.5)" },
  cardInner: { display: "flex", alignItems: "stretch", width: "100%", borderRadius: 14, overflow: "hidden" },
  cardLeft: { width: "60%", padding: "14px 10px 14px 14px", display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "#fff", margin: "0 0 6px" },
  cardDesc: { fontSize: 10.5, lineHeight: 1.35, color: "#94a3b8", margin: 0 },

  cardRight: { width: "40%", flexShrink: 0, borderLeft: "1px solid rgba(255,255,255,0.14)", display: "flex", flexDirection: "column" },
  price: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, color: "#fff" },

  stepper: { display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid rgba(255,255,255,0.14)", height: 40 },
  stepBtn: { background: "transparent", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
  stepMinus: { borderRight: "1px solid rgba(255,255,255,0.14)" },
  stepDisabled: { color: "#475569", cursor: "default" },

  badge: { position: "absolute", top: -10, left: -10, zIndex: 3, width: 28, height: 28, borderRadius: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "#6366f1", color: "#fff", fontSize: 13, fontWeight: 800, border: "2px solid #050816", boxShadow: "0 4px 12px rgba(99,102,241,0.5)" },

  totalLine: { margin: "26px 2px 10px", fontSize: 20, fontWeight: 700, color: "#fff" },
  checkout: { width: "100%", height: 52, borderRadius: 10, cursor: "pointer", border: "1px solid rgba(129,140,248,0.6)", background: "rgba(129,140,248,0.14)", color: "#fff", fontSize: 15, fontWeight: 700, letterSpacing: "0.08em" },
  checkoutDisabled: { opacity: 0.4, cursor: "default", borderColor: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.04)" },

  balance: { textAlign: "center", fontSize: 10.5, lineHeight: 1.4, color: "#94a3b8", margin: "10px 2px 0", letterSpacing: "0.01em" },
  balanceB: { color: "#cbd5e1", fontWeight: 600 },

  referralBox: {
    marginTop: 18,
    padding: "16px 14px",
    borderRadius: 16,
    border: "1px solid rgba(129,140,248,0.25)",
    background: "rgba(129,140,248,0.05)",
    textAlign: "center",
  },
  referralHeading: { fontSize: 14, fontWeight: 700, color: "#fff", margin: "0 0 6px" },
  referralSub: { fontSize: 11.5, lineHeight: 1.4, color: "#94a3b8", margin: "0 0 12px" },
  referralCodeRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  referralCode: {
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "0.1em",
    color: "#c7d2fe",
    fontFamily: "monospace",
    padding: "6px 12px",
    borderRadius: 8,
    background: "rgba(0,0,0,0.3)",
  },
  referralCopyBtn: {
    padding: "7px 14px",
    borderRadius: 999,
    border: "1px solid rgba(129,140,248,0.5)",
    background: "rgba(129,140,248,0.14)",
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },

  memDiv: { display: "flex", alignItems: "center", gap: 12, margin: "30px 0 16px" },
  memLine: { flex: 1, height: 1, background: "linear-gradient(90deg, transparent, rgba(251,191,36,0.2), transparent)" },
  memLabel: { fontSize: 9, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(251,191,36,0.4)", whiteSpace: "nowrap" },
  offerHeading: { fontSize: 17, fontWeight: 700, textAlign: "center", color: "#fef3c7", letterSpacing: "0.01em", margin: "0 0 12px" },
  perkItem: { display: "flex", alignItems: "center", gap: 10, padding: "3px 0" },
  perkCheck: { display: "flex", height: 18, width: 18, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 9999, background: "rgba(251,191,36,0.12)", color: "#fbbf24", fontSize: 10, fontWeight: 700 },
  perkText: { fontSize: 13, color: "#cbd5e1" },
  memSub: { fontSize: 11, color: "rgba(251,191,36,0.5)", textAlign: "center", margin: "12px 0 16px" },

  tiers: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "stretch" },
  tierCard: { borderRadius: 16, padding: "18px 12px 16px", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 4 },
  tierHero: { border: "1.5px solid rgba(251,191,36,0.5)", background: "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(251,191,36,0.04))" },
  tierBase: { border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" },
  bestBadge: { position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", borderRadius: 9999, border: "1px solid rgba(251,191,36,0.4)", background: "#050816", padding: "2px 12px", fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#fbbf24", whiteSpace: "nowrap" },
  tierPrice: { fontSize: 24, fontWeight: 700, color: "#fff", lineHeight: 1, margin: 0 },
  tierDesc: { fontSize: 12, color: "#cbd5e1", lineHeight: 1.2, margin: 0 },
  tierCadence: { fontSize: 10, color: "#64748b", margin: "0 0 8px" },
  tierBtn: { width: "100%", padding: "8px 12px", borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  tierBtnHero: { background: "#fcd34d", color: "#050816", border: "none" },
  tierBtnBase: { background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" },
  cancel: { textAlign: "center", fontSize: 10, color: "#475569", marginTop: 14, letterSpacing: "0.05em" },
};
