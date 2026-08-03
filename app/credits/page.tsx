"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Minus, Plus } from "lucide-react";

/* ────────────────────────────────────────────────────────────────────────────
   PRODUCTS — à-la-carte items. `mode` maps to your Stripe checkout route.
   grants{} is documentation for the webhook (what each unit should credit).
   ──────────────────────────────────────────────────────────────────────────── */
type ProductId = "reading" | "jxl" | "replies";

interface Product {
  id: ProductId;
  title: string;
  desc: string;
  price: number;          // USD per unit
  mode: string;           // Stripe checkout mode
  row: 1 | 2;
  grants: string;         // note for the webhook
}

const PRODUCTS: Product[] = [
  { id: "reading", title: "Reading", desc: "1 reading credit · 1 free reply", price: 4.0, mode: "one_time",   row: 1, grants: "+1 credits" },
  { id: "jxl",     title: "JXL",     desc: "1 JXL session · 2 free replies",  price: 6.0, mode: "jxl_session", row: 1, grants: "+1 jxlCredits" },
  { id: "replies", title: "Replies", desc: "Works on readings or JXL · +2",   price: 2.0, mode: "reply_pack",  row: 2, grants: "+2 replyCredits" },
];

/* Subscription tiers — rebuilt fresh here (all commerce lives on this page). */
interface Tier {
  id: string;
  price: string;
  desc: string;
  hero?: boolean;
  stripeMode: string;     // what your checkout route expects for subscriptions
}
const TIERS: Tier[] = [
  { id: "sub_base", price: "$12/mo", desc: "4 readings + 4 JXL", stripeMode: "sub_base" },
  { id: "sub_plus", price: "$16/mo", desc: "8 readings + 8 JXL", hero: true, stripeMode: "sub_plus" },
];

const PERKS = [
  "Reading credits every month",
  "JXL follow-up credits every month",
  "Free reading downloads",
  "50% off extras after you run out",
  "No cooldowns, ever",
];

export default function CreditsPage() {
  const router = useRouter();

  // quantity chosen in each stepper (min 1)
  const [pending, setPending] = useState<Record<ProductId, number>>({ reading: 1, jxl: 1, replies: 1 });
  // committed cart quantities
  const [cart, setCart] = useState<Record<ProductId, number>>({ reading: 0, jxl: 0, replies: 0 });
  const [loading, setLoading] = useState(false);

  const total = useMemo(
    () => PRODUCTS.reduce((sum, p) => sum + cart[p.id] * p.price, 0),
    [cart]
  );

  const step = (id: ProductId, delta: number) =>
    setPending((prev) => ({ ...prev, [id]: Math.max(1, prev[id] + delta) }));

  const addToCart = (id: ProductId) =>
    setCart((prev) => ({ ...prev, [id]: pending[id] }));

  /* ── CART CHECKOUT ────────────────────────────────────────────────────────
     TODO: point this at your Stripe checkout route. It should build ONE
     Checkout Session with a line item per cart entry (qty > 0).
     Recommended: add a `mode: "cart"` branch to your existing checkout route
     that accepts items[] and maps them to line_items[].
     ──────────────────────────────────────────────────────────────────────── */
  const handleCheckout = async () => {
    if (total <= 0) return;
    setLoading(true);
    try {
      const items = PRODUCTS
        .filter((p) => cart[p.id] > 0)
        .map((p) => ({ mode: p.mode, id: p.id, quantity: cart[p.id] }));

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
      if (data.url) window.location.href = data.url;
    } catch {
      // surface an error toast here if you have one
    } finally {
      setLoading(false);
    }
  };

  /* ── SUBSCRIBE ─────────────────────────────────────────────────────────────
     TODO: mirror MembershipPanel's subscribe call against your checkout route.
     ──────────────────────────────────────────────────────────────────────── */
  const handleSubscribe = async (tier: Tier) => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "subscription",
          bundleTier: tier.stripeMode,
          returnUrl: `${window.location.origin}/reading/intake`,
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      // error handling
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "linear-gradient(180deg, #061120 0%, #050816 44%, #040611 100%)",
        color: "#f1f5f9",
      }}
    >
      <style jsx>{`
        .title-row { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
        .title-row .line { height: 1px; flex: 1; background: rgba(255,255,255,0.18); }
        .title-row .t { font-size: 20px; font-weight: 700; letter-spacing: 0.06em; color: #fff; white-space: nowrap; }

        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .replies-row { margin-top: 12px; display: flex; justify-content: center; }
        .replies-row :global(.card) { width: calc(50% - 6px); }

        .card { display: flex; align-items: stretch; border-radius: 14px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.035); overflow: hidden; min-height: 118px; }
        .card-left { flex: 1; padding: 12px 10px 12px 12px; display: flex; flex-direction: column; justify-content: center; min-width: 0; }
        .card-title { font-size: 15px; font-weight: 700; color: #fff; margin: 0; }
        .card-desc { font-size: 10.5px; line-height: 1.3; color: #94a3b8; margin: 4px 0 0; }
        .card-right { width: 92px; flex-shrink: 0; border-left: 1px solid rgba(255,255,255,0.12); display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 10px 6px; gap: 6px; }
        .price { font-size: 16px; font-weight: 700; color: #fff; line-height: 1; }
        .stepper { display: flex; align-items: center; gap: 4px; }
        .stepper button { width: 20px; height: 20px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.22); background: rgba(255,255,255,0.05); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
        .stepper button:hover { background: rgba(255,255,255,0.12); }
        .stepper .qty { min-width: 16px; text-align: center; font-size: 13px; font-weight: 700; color: #fff; }
        .add-btn { width: 100%; height: 26px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.28); background: rgba(255,255,255,0.06); color: #fff; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; cursor: pointer; transition: all 0.15s ease; }
        .add-btn:hover { background: rgba(255,255,255,0.12); }
        .add-btn.added { border-color: rgba(52,211,153,0.55); background: rgba(52,211,153,0.16); color: #a7f3d0; }

        .total-line { margin: 22px 2px 8px; font-size: 20px; font-weight: 700; color: #fff; }
        .total-line span { color: #fde68a; }
        .checkout { width: 100%; height: 52px; border-radius: 10px; cursor: pointer; border: 1px solid rgba(129,140,248,0.6); background: rgba(129,140,248,0.14); color: #fff; font-size: 15px; font-weight: 700; letter-spacing: 0.08em; transition: all 0.15s ease; }
        .checkout:disabled { opacity: 0.4; cursor: default; border-color: rgba(255,255,255,0.3); background: rgba(255,255,255,0.04); }
        .checkout:not(:disabled):hover { background: rgba(129,140,248,0.22); }

        .mem-div { display: flex; align-items: center; gap: 12px; margin: 30px 0 16px; }
        .mem-div .line { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, rgba(251,191,36,0.2), transparent); }
        .mem-div .label { font-size: 9px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(251,191,36,0.4); white-space: nowrap; }
        .offer-heading { font-size: 17px; font-weight: 700; text-align: center; color: #fef3c7; letter-spacing: 0.01em; margin: 0 0 12px; }
        .perk-item { display: flex; align-items: center; gap: 10px; padding: 3px 0; }
        .perk-check { display: flex; height: 18px; width: 18px; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 9999px; background: rgba(251,191,36,0.12); color: #fbbf24; font-size: 10px; font-weight: 700; }
        .perk-text { font-size: 13px; color: #cbd5e1; }
        .mem-subline { font-size: 11px; color: rgba(251,191,36,0.5); text-align: center; margin: 12px 0 16px; }
        .tiers { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: stretch; }
        .tier-card { border-radius: 16px; padding: 18px 12px 16px; position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 4px; }
        .tier-card.hero { border: 1.5px solid rgba(251,191,36,0.5); background: linear-gradient(135deg, rgba(251,191,36,0.12), rgba(251,191,36,0.04)); }
        .tier-card.base { border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); }
        .best-badge { position: absolute; top: -10px; left: 50%; transform: translateX(-50%); border-radius: 9999px; border: 1px solid rgba(251,191,36,0.4); background: #050816; padding: 2px 12px; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #fbbf24; white-space: nowrap; }
        .tier-price { font-size: 24px; font-weight: 700; color: #fff; line-height: 1; margin: 0; }
        .tier-desc { font-size: 12px; color: #cbd5e1; line-height: 1.2; margin: 0; }
        .tier-cadence { font-size: 10px; color: #64748b; margin: 0 0 8px; }
        .tier-btn { width: 100%; padding: 8px 12px; border-radius: 9999px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; }
        .tier-btn.hero { background: #fcd34d; color: #050816; border: none; }
        .tier-btn.hero:hover { background: #fde68a; }
        .tier-btn.base { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.2); }
        .tier-btn.base:hover { background: rgba(255,255,255,0.05); }
        .cancel-anytime { text-align: center; font-size: 10px; color: #475569; margin-top: 14px; letter-spacing: 0.05em; }
      `}</style>

      {/* Back button — matches your /jxl page */}
      <button
        type="button"
        onClick={() => router.push("/reading/intake")}
        style={{
          position: "fixed", top: "calc(12px + env(safe-area-inset-top))", left: "16px", zIndex: 100,
          display: "flex", alignItems: "center", gap: "4px",
          background: "rgba(5,8,22,0.6)", border: "1px solid rgba(148,163,184,0.2)",
          borderRadius: "999px", padding: "6px 12px 6px 8px", color: "#cbd5e1",
          fontSize: "13px", cursor: "pointer", backdropFilter: "blur(8px)",
        }}
      >
        <ChevronLeft size={16} />
        Back
      </button>

      <div
        style={{
          maxWidth: 430, margin: "0 auto",
          padding: "calc(64px + env(safe-area-inset-top)) 16px calc(40px + env(safe-area-inset-bottom))",
        }}
      >
        {/* ── CART ── */}
        <div className="title-row"><span className="line" /><span className="t">Get Credits</span><span className="line" /></div>

        <div className="grid">
          {PRODUCTS.filter((p) => p.row === 1).map((p) => (
            <ProductCard key={p.id} p={p} qty={pending[p.id]} inCart={cart[p.id] > 0} onStep={step} onAdd={addToCart} />
          ))}
        </div>
        <div className="replies-row">
          {PRODUCTS.filter((p) => p.row === 2).map((p) => (
            <ProductCard key={p.id} p={p} qty={pending[p.id]} inCart={cart[p.id] > 0} onStep={step} onAdd={addToCart} />
          ))}
        </div>

        <div className="total-line">TOTAL : <span>${total.toFixed(2)}</span></div>
        <button className="checkout" disabled={total <= 0 || loading} onClick={handleCheckout}>
          {loading ? "…" : "SWIPE TO CHECKOUT"}
        </button>

        {/* ── MEMBERSHIP (offer only — no mission) ── */}
        <div className="mem-div"><span className="line" /><span className="label">Membership</span><span className="line" /></div>

        <h3 className="offer-heading">More Readings, Real Savings</h3>
        <div style={{ marginBottom: 4 }}>
          {PERKS.map((perk) => (
            <div key={perk} className="perk-item"><span className="perk-check">✓</span><span className="perk-text">{perk}</span></div>
          ))}
        </div>
        <p className="mem-subline">Less than two single readings a month.</p>

        <div className="tiers">
          {TIERS.map((t) => (
            <div key={t.id} className={`tier-card ${t.hero ? "hero" : "base"}`}>
              {t.hero && <span className="best-badge">Best Value</span>}
              <p className="tier-price">{t.price}</p>
              <p className="tier-desc">{t.desc}</p>
              <p className="tier-cadence">every month</p>
              <button
                className={`tier-btn ${t.hero ? "hero" : "base"}`}
                disabled={loading}
                onClick={() => handleSubscribe(t)}
              >
                Subscribe
              </button>
            </div>
          ))}
        </div>
        <p className="cancel-anytime">Cancel anytime</p>
      </div>
    </div>
  );
}

/* ── Single product card ── */
function ProductCard({
  p, qty, inCart, onStep, onAdd,
}: {
  p: Product;
  qty: number;
  inCart: boolean;
  onStep: (id: ProductId, delta: number) => void;
  onAdd: (id: ProductId) => void;
}) {
  return (
    <div className="card">
      <div className="card-left">
        <p className="card-title">{p.title}</p>
        <p className="card-desc">{p.desc}</p>
      </div>
      <div className="card-right">
        <span className="price">${p.price.toFixed(2)}</span>
        <div className="stepper">
          <button aria-label="decrease" onClick={() => onStep(p.id, -1)}><Minus size={13} /></button>
          <span className="qty">{qty}</span>
          <button aria-label="increase" onClick={() => onStep(p.id, 1)}><Plus size={13} /></button>
        </div>
        <button className={`add-btn ${inCart ? "added" : ""}`} onClick={() => onAdd(p.id)}>
          {inCart ? "ADDED" : "ADD"}
        </button>
      </div>
    </div>
  );
}