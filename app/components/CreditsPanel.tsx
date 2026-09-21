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

  // Same star recipe as Today's Sky and Birth Chart so this page belongs to
  // the same visual family instead of feeling like a separate storefront.
  const stars = useMemo(
    () =>
      Array.from({ length: 68 }).map((_, i) => ({
        id: i,
        left: `${(i * 37) % 100}%`,
        top: `${(i * 19 + 13) % 100}%`,
        size: i % 7 === 0 ? 3.5 : i % 5 === 0 ? 2.5 : 1.5,
        opacity: i % 7 === 0 ? 0.72 : i % 5 === 0 ? 0.55 : 0.34,
        delay: (i * 0.37) % 4,
      })),
    []
  );

  const rootClass = embedded
    ? "relative min-h-full w-full overflow-visible font-sans text-slate-100"
    : "fixed inset-0 z-50 min-h-screen w-full overflow-y-auto overflow-x-hidden font-sans text-slate-100";

  return (
    <div
      className={rootClass}
      style={{
        background: "linear-gradient(180deg, #061120 0%, #050816 44%, #040611 100%)",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {/* Continuous AstroPro sky */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        {stars.map((star) => (
          <motion.span
            key={star.id}
            className="absolute rounded-full bg-white"
            style={{
              left: star.left,
              top: star.top,
              width: star.size,
              height: star.size,
              opacity: star.opacity,
            }}
            animate={
              shouldReduceMotion
                ? undefined
                : {
                    opacity: [
                      star.opacity * 0.4,
                      star.opacity * 1.6,
                      star.opacity * 0.4,
                    ],
                    scale: [1, 1.6, 1],
                  }
            }
            transition={
              shouldReduceMotion
                ? undefined
                : {
                    duration: 2.34 + (star.id % 5) * 0.54,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: star.delay,
                  }
            }
          />
        ))}
      </div>

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
  className="relative z-10 mx-auto w-full max-w-[430px] px-4"
  style={{
    paddingTop: "calc(env(safe-area-inset-top) + 8px)",
    paddingBottom: "calc(4rem + env(safe-area-inset-bottom))",
  }}
>
        {/* ── HERO ── */}
        <motion.header
          initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="mb-6 text-center"
        >
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
            Credits & Access
          </p>
          <h1 className="mt-1 text-[22px] font-light tracking-tight text-white">
            Choose what fits
          </h1>
          <p className="mx-auto mt-2 max-w-[300px] text-[12px] leading-5 text-slate-400">
            Subscribe for full access, or add only the readings and replies you need.
          </p>
        </motion.header>

        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
          className="space-y-3"
        >
          {/* ── BALANCE — data-first like the sibling panels ── */}
          {balance && (
            <PanelCard icon={Sparkles} label="Your Balance">
              <div className="grid grid-cols-3 divide-x divide-white/[0.06]">
                <div className="px-2 text-center">
                  <p className="text-[26px] font-extralight leading-none text-white tabular-nums">
                    {balance.readings}
                  </p>
                  <p className="mt-2 text-[9px] uppercase tracking-[0.16em] text-slate-500">
                    {plural(balance.readings, "Reading")}
                  </p>
                </div>
                <div className="px-2 text-center">
                  <p className="text-[26px] font-extralight leading-none text-white tabular-nums">
                    {balance.jxl}
                  </p>
                  <p className="mt-2 text-[9px] uppercase tracking-[0.16em] text-slate-500">
                    JXL
                  </p>
                </div>
                <div className="px-2 text-center">
                  <p className="text-[26px] font-extralight leading-none text-white tabular-nums">
                    {balance.replies}
                  </p>
                  <p className="mt-2 text-[9px] uppercase tracking-[0.16em] text-slate-500">
                    {plural(balance.replies, "Reply", "Replies")}
                  </p>
                </div>
              </div>
            </PanelCard>
          )}

          {/* ── MEMBERSHIP — premium, but still in the same family ── */}
          <div
            className="standard-shadow relative overflow-hidden rounded-[24px] border bg-black/20 p-5 backdrop-blur-sm"
            style={{
              borderColor: "rgba(251,191,36,0.42)",
              boxShadow:
                "0 0 24px rgba(245,158,11,0.10), inset 0 0 18px rgba(245,158,11,0.05)",
            }}
          >
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/50 to-transparent" />

            <div className="flex items-start gap-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border bg-black/20"
                style={{
                  borderColor: "rgba(251,191,36,0.48)",
                  boxShadow:
                    "0 0 22px rgba(245,158,11,0.14), inset 0 0 14px rgba(245,158,11,0.08)",
                }}
              >
                <Crown className="h-6 w-6 text-amber-300/90" strokeWidth={1.8} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-amber-300/70">
                  XL Membership
                </p>
                <div className="mt-1 flex items-end gap-1.5">
                  <span className="text-[30px] font-light leading-none text-white tabular-nums">
                    {formatUsd(PRICING.membership.price)}
                  </span>
                  <span className="pb-0.5 text-[11px] text-slate-500">/ month</span>
                </div>
                <p className="mt-2 text-[12px] leading-5 text-slate-400">
                  The simplest way to use AstroPro without counting individual readings.
                </p>
              </div>
            </div>

            <div className="mt-5 border-t border-white/[0.06] pt-4">
              <div className="space-y-2.5">
                {MEMBERSHIP_FEATURES.map((feature) => (
                  <div key={feature} className="flex items-start gap-2.5">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-amber-300/70" />
                    <span className="text-[12px] leading-5 text-slate-300">
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
              className="mt-5 flex h-12 w-full items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-300/[0.07] text-[11px] font-medium uppercase tracking-[0.18em] text-amber-100 transition hover:bg-amber-300/[0.11] disabled:cursor-default disabled:opacity-50"
            >
              {loading ? "Opening…" : "Subscribe"}
            </button>
          </div>

          {/* ── BUY AS YOU GO ── */}
          <div className="pt-3">
            <p className="mb-3 text-center text-[10px] uppercase tracking-[0.22em] text-slate-600">
              Or buy as you go
            </p>

            <div className="space-y-3">
              {PRODUCTS.map((product) => {
                const Icon = product.icon;
                const quantity = cart[product.id];

                return (
                  <div
                    key={product.id}
                    className="standard-shadow rounded-[24px] border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-black/20">
                        <Icon
                          className="h-4 w-4 text-slate-400"
                          strokeWidth={2}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-medium text-white">
                          {product.title}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                          {product.desc}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-[14px] font-medium text-slate-200 tabular-nums">
                          {formatUsd(product.price)}
                        </p>
                        <p className="text-[9px] uppercase tracking-[0.14em] text-slate-600">
                          each
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3">
                      <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                        Quantity
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-label={`Remove ${product.title}`}
                          onClick={() => step(product.id, -1)}
                          disabled={quantity <= 0}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300 transition hover:bg-white/[0.06] disabled:cursor-default disabled:opacity-25"
                        >
                          <Minus size={15} />
                        </button>

                        <span className="w-7 text-center text-[14px] font-medium text-white tabular-nums">
                          {quantity}
                        </span>

                        <button
                          type="button"
                          aria-label={`Add ${product.title}`}
                          onClick={() => step(product.id, 1)}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300 transition hover:bg-white/[0.06]"
                        >
                          <Plus size={15} />
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
