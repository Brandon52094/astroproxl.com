"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, Minus, Plus } from "lucide-react";

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

/**
 * Credits page. Render this as an OVERLAY (see notes) so it feels like the app,
 * not a browser tab. `onClose` returns to the previous screen.
 */
export default function CreditsPage({ onClose }: { onClose?: () => void }) {
  const [pending, setPending] = useState<Record<ProductId, number>>({ reading: 1, jxl: 1, replies: 1 });
  const [cart, setCart] = useState<Record<ProductId, number>>({ reading: 0, jxl: 0, replies: 0 });
  const [loading, setLoading] = useState(false);

  const total = useMemo(() => PRODUCTS.reduce((s, p) => s + cart[p.id] * p.price, 0), [cart]);
  const step = (id: ProductId, d: number) => setPending((p) => ({ ...p, [id]: Math.max(1, p[id] + d) }));
  const addToCart = (id: ProductId) => setCart((c) => ({ ...c, [id]: pending[id] }));

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

  const C = STYLES;

  return (
    <div style={C.root}>
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
            <ProductCard key={p.id} p={p} qty={pending[p.id]} inCart={cart[p.id] > 0} onStep={step} onAdd={addToCart} />
          ))}
        </div>
        <div style={C.repliesRow}>
          <div style={{ width: "calc(50% - 6px)" }}>
            {PRODUCTS.filter((p) => p.row === 2).map((p) => (
              <ProductCard key={p.id} p={p} qty={pending[p.id]} inCart={cart[p.id] > 0} onStep={step} onAdd={addToCart} />
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

function ProductCard({ p, qty, inCart, onStep, onAdd }: {
  p: Product; qty: number; inCart: boolean;
  onStep: (id: ProductId, d: number) => void; onAdd: (id: ProductId) => void;
}) {
  const C = STYLES;
  return (
    <div style={C.card}>
      <div style={C.cardLeft}>
        <p style={C.cardTitle}>{p.title}</p>
        <p style={C.cardDesc}>{p.desc}</p>
      </div>
      <div style={C.cardRight}>
        <span style={C.price}>${p.price.toFixed(2)}</span>
        <div style={C.stepper}>
          <button type="button" aria-label="decrease" onClick={() => onStep(p.id, -1)} style={C.stepBtn}><Minus size={13} /></button>
          <span style={C.qty}>{qty}</span>
          <button type="button" aria-label="increase" onClick={() => onStep(p.id, 1)} style={C.stepBtn}><Plus size={13} /></button>
        </div>
        <button type="button" onClick={() => onAdd(p.id)} style={{ ...C.addBtn, ...(inCart ? C.addBtnAdded : {}) }}>
          {inCart ? "ADDED" : "ADD"}
        </button>
      </div>
    </div>
  );
}

/* ── All styles as plain objects (no styled-jsx — guaranteed to render) ── */
const STYLES: Record<string, React.CSSProperties> = {
  root: {
    position: "relative",
    minHeight: "100dvh",
    background: "linear-gradient(180deg, #061120 0%, #050816 44%, #040611 100%)",
    color: "#f1f5f9",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  back: {
    position: "fixed", top: "calc(12px + env(safe-area-inset-top))", left: 16, zIndex: 100,
    display: "flex", alignItems: "center", gap: 4,
    background: "rgba(5,8,22,0.6)", border: "1px solid rgba(148,163,184,0.2)",
    borderRadius: 999, padding: "6px 12px 6px 8px", color: "#cbd5e1",
    fontSize: 13, cursor: "pointer", backdropFilter: "blur(8px)",
  },
  container: { maxWidth: 430, margin: "0 auto", padding: "calc(64px + env(safe-area-inset-top)) 16px calc(40px + env(safe-area-inset-bottom))" },

  titleRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 20 },
  titleLine: { height: 1, flex: 1, background: "rgba(255,255,255,0.18)" },
  title: { fontSize: 20, fontWeight: 700, letterSpacing: "0.06em", color: "#fff", whiteSpace: "nowrap" },

  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  repliesRow: { marginTop: 12, display: "flex", justifyContent: "center" },

  card: { display: "flex", alignItems: "stretch", borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.035)", overflow: "hidden", minHeight: 118 },
  cardLeft: { flex: 1, padding: "12px 10px 12px 12px", display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "#fff", margin: 0 },
  cardDesc: { fontSize: 10.5, lineHeight: 1.3, color: "#94a3b8", margin: "4px 0 0" },
  cardRight: { width: 92, flexShrink: 0, borderLeft: "1px solid rgba(255,255,255,0.12)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: "10px 6px", gap: 6 },
  price: { fontSize: 16, fontWeight: 700, color: "#fff", lineHeight: 1 },
  stepper: { display: "flex", alignItems: "center", gap: 4 },
  stepBtn: { width: 20, height: 20, borderRadius: 6, border: "1px solid rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.05)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
  qty: { minWidth: 16, textAlign: "center", fontSize: 13, fontWeight: 700, color: "#fff" },
  addBtn: { width: "100%", height: 26, borderRadius: 7, border: "1px solid rgba(255,255,255,0.28)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer" },
  addBtnAdded: { borderColor: "rgba(52,211,153,0.55)", background: "rgba(52,211,153,0.16)", color: "#a7f3d0" },

  totalLine: { margin: "22px 2px 8px", fontSize: 20, fontWeight: 700, color: "#fff" },
  checkout: { width: "100%", height: 52, borderRadius: 10, cursor: "pointer", border: "1px solid rgba(129,140,248,0.6)", background: "rgba(129,140,248,0.14)", color: "#fff", fontSize: 15, fontWeight: 700, letterSpacing: "0.08em" },
  checkoutDisabled: { opacity: 0.4, cursor: "default", borderColor: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.04)" },

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