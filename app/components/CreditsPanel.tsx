"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ChevronLeft,
  Crown,
  Sparkles,
  MessageCircleMore,
  BookOpen,
  Plus,
  Minus,
} from "lucide-react";
import { PRICING, formatUsd } from "@/lib/paywallConfig";

/* ─────────────────────────────────────────────
   Products
───────────────────────────────────────────── */

type ProductId = "jxl" | "reading" | "replies";

interface Product {
  id: ProductId;
  title: string;
  desc: string;
  price: number;
  icon: React.ElementType;
}

const PRODUCTS: Product[] = [
  {
    id: "jxl",
    title: "JXL",
    desc: `Premium ask-anything astrology · includes ${PRICING.jxl.includedReplies} replies`,
    price: PRICING.jxl.price,
    icon: Sparkles,
  },
  {
    id: "reading",
    title: "General Reading",
    desc: "One focused reading · includes 1 reply",
    price: PRICING.reading.price,
    icon: BookOpen,
  },
  {
    id: "replies",
    title: "More Replies",
    desc: "Add another reply to any eligible reading",
    price: PRICING.replies.priceEach,
    icon: MessageCircleMore,
  },
];

interface Balance {
  readings: number;
  jxl: number;
  replies: number;
}

const MEMBERSHIP_FEATURES = [
  "Unlimited Readings",
  "Unlimited JXL",
  "8 Replies Per Conversation",
  "Members-Only Access",
  "Readings Saved to Photos",
  "Commission Eligibility · Coming Soon",
];

function plural(n: number, one: string, many?: string): string {
  return n === 1 ? one : many ?? `${one}s`;
}

/* ─────────────────────────────────────────────
   Shared visual language
───────────────────────────────────────────── */

function PanelCard({
  icon: Icon,
  label,
  children,
  className = "",
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "standard-shadow rounded-[24px] border border-white/10",
        "bg-white/[0.03] p-4 backdrop-blur-sm",
        className,
      ].join(" ")}
    >
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-slate-400" strokeWidth={2.2} />
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

export default function CreditsPanel({
  onClose,
  embedded = false,
}: {
  onClose?: () => void;
  embedded?: boolean;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [cart, setCart] = useState<Record<ProductId, number>>({
    jxl: 0,
    reading: 0,
    replies: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [balance, setBalance] = useState<Balance | null>(null);

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
        // Balance stays hidden if this endpoint is unavailable.
      }
    })();
  }, []);

  const step = useCallback((id: ProductId, amount: number) => {
    setCart((current) => ({
      ...current,
      [id]: Math.max(0, current[id] + amount),
    }));
  }, []);

  const total = useMemo(
    () =>
      cart.jxl * PRICING.jxl.price +
      cart.reading * PRICING.reading.price +
      cart.replies * PRICING.replies.priceEach,
    [cart]
  );

  const selectedItems = useMemo(
    () => Object.values(cart).reduce((sum, qty) => sum + qty, 0),
    [cart]
  );

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

  /* ── Membership checkout ── */
  const handleGetAccess = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "subscription",
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

  const rootClass = embedded
    ? "relative min-h-full w-full min-w-0 max-w-full overflow-x-hidden overflow-y-visible font-sans text-slate-100"
    : "fixed inset-0 z-50 min-h-[100dvh] w-full min-w-0 max-w-full overflow-y-auto overflow-x-hidden font-sans text-slate-100";

  return (
    <div
      className={rootClass}
      style={{
        WebkitOverflowScrolling: "touch",
      }}
    >
      {!embedded && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="fixed left-4 top-[calc(14px+env(safe-area-inset-top))] z-[100] flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#050816]/60 text-slate-300 backdrop-blur-md transition hover:bg-white/[0.06]"
        >
          <ChevronLeft size={17} />
        </button>
      )}

      <div
        className="relative z-10 mx-auto w-full min-w-0 max-w-[430px] px-[clamp(12px,4vw,16px)]"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 8px)",
          paddingBottom: "calc(4rem + env(safe-area-inset-bottom))",
        }}
      >
        {/* ── HERO ── */}
        <motion.header
          initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="mb-3 text-center"
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-300">
            Credits & Access
          </p>
        </motion.header>

        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
          className="space-y-2.5"
        >
          {/* ── BALANCE — compact, matching View My Chart footprint ── */}
          {balance && (
            <section className="overflow-hidden rounded-[18px] border border-white/10 bg-transparent">
              <div
                className="flex w-full items-center justify-center px-4 py-[12px] text-[12px] font-medium uppercase tracking-[0.18em] text-slate-200"
                style={{
                  background:
                    "radial-gradient(circle at 18% 0%, rgba(96,165,250,0.10), transparent 44%), linear-gradient(145deg, rgba(17,29,52,0.92), rgba(8,13,28,0.88))",
                  WebkitBackdropFilter: "blur(14px)",
                  backdropFilter: "blur(14px)",
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.055), inset 0 -1px 0 rgba(255,255,255,0.025)",
                }}
              >
                Your Balance
              </div>

              <div className="grid grid-cols-3 divide-x divide-white/[0.06] border-t border-white/[0.06] px-2 py-3">
                <div className="text-center">
                  <p className="text-[20px] font-light leading-none text-white tabular-nums">
                    {balance.readings}
                  </p>
                  <p className="mt-1 text-[8px] uppercase tracking-[0.14em] text-slate-500">
                    {plural(balance.readings, "Reading")}
                  </p>
                </div>

                <div className="text-center">
                  <p className="text-[20px] font-light leading-none text-white tabular-nums">
                    {balance.jxl}
                  </p>
                  <p className="mt-1 text-[8px] uppercase tracking-[0.14em] text-slate-500">
                    JXL
                  </p>
                </div>

                <div className="text-center">
                  <p className="text-[20px] font-light leading-none text-white tabular-nums">
                    {balance.replies}
                  </p>
                  <p className="mt-1 text-[8px] uppercase tracking-[0.14em] text-slate-500">
                    {plural(balance.replies, "Reply", "Replies")}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* ── ASTRO PLUS — white/gold premium treatment ── */}
          <div
            className="standard-shadow relative overflow-hidden rounded-[22px] border p-4 backdrop-blur-sm"
            style={{
              borderColor: "rgba(255,255,255,0.38)",
              background:
                "radial-gradient(circle at 50% -70%, rgba(255,255,255,0.11), transparent 66%), linear-gradient(145deg, rgba(19,18,24,0.96), rgba(7,10,21,0.97))",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.08), 0 0 22px rgba(203,164,78,0.12), 0 16px 38px rgba(0,0,0,0.46)",
            }}
          >
            <div
              className="pointer-events-none absolute inset-x-10 top-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.88), rgba(218,183,104,0.80), transparent)",
              }}
            />

            <div className="flex items-start gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"
                style={{
                  borderColor: "rgba(255,255,255,0.20)",
                  background:
                    "linear-gradient(145deg, rgba(255,255,255,0.08), rgba(203,164,78,0.08))",
                  boxShadow:
                    "0 0 18px rgba(203,164,78,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
                }}
              >
                <Crown className="h-5 w-5 text-amber-200/90" strokeWidth={1.8} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.20em] text-white">
                  Astro Plus
                </p>

                <div className="mt-1 flex items-end gap-1.5">
                  <span className="text-[27px] font-light leading-none text-white tabular-nums">
                    {formatUsd(PRICING.membership.price)}
                  </span>
                  <span className="pb-0.5 text-[10px] text-slate-500">/ month</span>
                </div>

                <p className="mt-1 whitespace-nowrap text-[11px] leading-4 text-slate-400">
                  Full access without counting individual readings.
                </p>
              </div>
            </div>

            <div className="mt-4 border-t border-white/[0.06] pt-3">
              <div className="grid grid-cols-1 gap-2">
                {MEMBERSHIP_FEATURES.map((feature) => (
                  <div key={feature} className="flex items-center gap-2.5">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(218,183,104,0.90))",
                        boxShadow: "0 0 8px rgba(218,183,104,0.28)",
                      }}
                    />
                    <span className="text-[11px] leading-4 text-slate-300">
                      {feature}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleGetAccess}
              disabled={loading}
              className="mt-4 flex h-11 w-full items-center justify-center rounded-2xl border text-[11px] font-medium uppercase tracking-[0.18em] transition disabled:cursor-default disabled:opacity-50"
              style={{
                borderColor: "rgba(255,255,255,0.28)",
                background:
                  "linear-gradient(145deg, rgba(255,255,255,0.08), rgba(203,164,78,0.08))",
                color: "#F8FAFC",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.08), 0 0 14px rgba(203,164,78,0.10)",
              }}
            >
              {loading ? "Opening…" : "Subscribe"}
            </button>
          </div>

          {/* ── GET WHAT YOU NEED ── */}
          <div className="pt-2">
            <div
              className="mb-3 flex w-full items-center justify-center rounded-[18px] border border-white/10 px-4 py-[12px] text-[12px] font-medium uppercase tracking-[0.18em] text-slate-200"
              style={{
                background:
                  "radial-gradient(circle at 18% 0%, rgba(96,165,250,0.10), transparent 44%), linear-gradient(145deg, rgba(17,29,52,0.92), rgba(8,13,28,0.88))",
                WebkitBackdropFilter: "blur(14px)",
                backdropFilter: "blur(14px)",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.055), inset 0 -1px 0 rgba(255,255,255,0.025)",
              }}
            >
              Get What You Need
            </div>

            <div className="space-y-2.5">
              {PRODUCTS.map((product) => {
                const Icon = product.icon;
                const quantity = cart[product.id];

                return (
                  <div
                    key={product.id}
                    className="standard-shadow rounded-[20px] border border-white/10 bg-white/[0.03] px-3.5 py-3 backdrop-blur-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-black/20">
                        <Icon
                          className="h-4 w-4 text-slate-400"
                          strokeWidth={2}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-medium text-white">
                          {product.title}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] leading-4 text-slate-500">
                          {product.desc}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={`Remove ${product.title}`}
                          onClick={() => step(product.id, -1)}
                          disabled={quantity <= 0}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 transition hover:bg-white/[0.06] disabled:cursor-default disabled:opacity-25"
                        >
                          <Minus size={14} />
                        </button>

                        <span className="w-5 text-center text-[13px] font-medium text-white tabular-nums">
                          {quantity}
                        </span>

                        <button
                          type="button"
                          aria-label={`Add ${product.title}`}
                          onClick={() => step(product.id, 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 transition hover:bg-white/[0.06]"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── CHECKOUT ── */}
          <PanelCard icon={Sparkles} label="Checkout">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  {selectedItems === 0
                    ? "Nothing selected"
                    : `${selectedItems} ${plural(selectedItems, "item")} selected`}
                </p>
                <p className="mt-1 text-[28px] font-light leading-none text-white tabular-nums">
                  {formatUsd(total)}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCheckout}
                disabled={total <= 0 || loading}
                className="h-11 rounded-2xl border border-teal-300/35 bg-teal-300/[0.07] px-5 text-[10px] font-medium uppercase tracking-[0.16em] text-teal-100 transition hover:bg-teal-300/[0.11] disabled:cursor-default disabled:opacity-30"
              >
                {loading ? "One moment…" : "Checkout"}
              </button>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-3 border-t border-white/[0.06] pt-3 text-center text-[11px] leading-4 text-red-300"
              >
                {error}
              </p>
            )}
          </PanelCard>
        </motion.div>
      </div>
    </div>
  );
}