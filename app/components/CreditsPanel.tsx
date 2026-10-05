"use client";

import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
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
type MembershipTierId = "astro_plus" | "astro_plus_xl";

const MIN_PLEDGE_CENTS = 50;
const MAX_PLEDGE_CENTS = 100_000_000;

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
    title: "Ask Anything Voice feature",
    desc: `Private ask-anything astrology · includes ${PRICING.jxl.includedReplies} replies`,
    price: PRICING.jxl.price,
    icon: Sparkles,
  },
  {
    id: "reading",
    title: "Signature Reading",
    desc: "One personalized, focused reading · includes 1 reply",
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
  isSubscribed: boolean;
}

const MEMBERSHIP_TIERS: Record<
  MembershipTierId,
  {
    name: string;
    price: number;
    tagline: string;
    features: string[];
  }
> = {
  astro_plus: {
    name: "Astro Plus",
    price: 999,
    tagline: "A generous monthly rhythm for deeper guidance.",
    features: [
      "16 Signature Readings Monthly",
      "12 JXL Private Sessions Monthly",
      "Replies Included",
      "16 Saved Reading Spaces",
      "Gift 5 Readings Monthly",
      "Add Context Access",
    ],
  },
  astro_plus_xl: {
    name: "Astro Plus XL",
    price: 1899,
    tagline: "The complete AstroProXL experience, without counting.",
    features: [
      "Unlimited Signature Readings",
      "Unlimited JXL Private Sessions",
      "Replies+ · Up To 8 Per Conversation",
      "24 Saved Reading Spaces",
      "Gift 10 Readings Monthly",
      "Custom Themes · Commission Access Coming Soon",
    ],
  },
};

function plural(n: number, one: string, many?: string): string {
  return n === 1 ? one : many ?? `${one}s`;
}

export default function CreditsPanel({
  onClose,
  embedded = false,
  initialIntent = null,
}: {
  onClose?: () => void;
  embedded?: boolean;
  /**
   * When the panel opens as a result of a locked feature tap, this tells it
   * which product or membership to visibly add to the cart after a short
   * delay. This makes the arrival feel intentional rather than preloaded.
   */
  initialIntent?: "voice" | "context" | null;
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
  const [membershipTier, setMembershipTier] =
    useState<MembershipTierId>("astro_plus");
  const [pledgeAmount, setPledgeAmount] = useState("");
  const activeMembership = MEMBERSHIP_TIERS[membershipTier];
  const isXlMembership = membershipTier === "astro_plus_xl";
  const parsedPledgeAmountCents = useMemo(() => {
    const normalized = pledgeAmount.replace(/[^0-9.]/g, "");
    const amount = Number(normalized);
    if (!Number.isFinite(amount)) return 0;
    return Math.max(0, Math.round(amount * 100));
  }, [pledgeAmount]);
  const pledgeIsOverLimit = parsedPledgeAmountCents > MAX_PLEDGE_CENTS;
  const pledgeIsBelowMinimum =
    parsedPledgeAmountCents > 0 &&
    parsedPledgeAmountCents < MIN_PLEDGE_CENTS;
  const pledgeAmountCents = Math.min(
    parsedPledgeAmountCents,
    MAX_PLEDGE_CENTS
  );

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
          isSubscribed:
            d.isSubscribed === true || d.membershipStatus === "active",
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

  // Visual add-to-cart for locked feature intent.
  // The delay is what creates the moment: the panel is already on screen,
  // then the requested item adds itself.
  const intentAppliedRef = useRef(false);
  useEffect(() => {
    if (!initialIntent) return;
    if (intentAppliedRef.current) return;
    intentAppliedRef.current = true;

    const timer = window.setTimeout(() => {
      if (initialIntent === "voice") {
        step("jxl", 1);
      }

      if (initialIntent === "context") {
        setMembershipTier("astro_plus");
      }
    }, shouldReduceMotion ? 0 : 550);

    return () => window.clearTimeout(timer);
  }, [initialIntent, shouldReduceMotion, step]);

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

  const checkoutTotal = total + pledgeAmountCents;

  /* ── Credit checkout ── */
  const handleCheckout = async () => {
    if (checkoutTotal <= 0) return;
    if (pledgeIsOverLimit) {
      setError("The maximum pledge is $1,000,000.00.");
      return;
    }
    if (pledgeIsBelowMinimum) {
      setError("The minimum pledge is $0.50.");
      return;
    }
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
          pledgeAmountCents,
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
  membershipPlan:
    membershipTier === "astro_plus_xl"
      ? "plus_xl"
      : "plus",
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
    ? "credits-scroll-shell relative min-h-full w-full min-w-0 max-w-full overflow-x-hidden overflow-y-visible font-sans text-slate-100"
    : "credits-scroll-shell fixed inset-0 z-50 min-h-[100dvh] w-full min-w-0 max-w-full overflow-y-auto overflow-x-hidden font-sans text-slate-100";

  const astroPlusPremiumCss = `
    .credits-scroll-shell {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .credits-scroll-shell::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none;
    }
    @property --astro-plus-angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
    .astro-plus-shell,
    .astro-plus-xl-shell {
      position: relative;
      isolation: isolate;
      border-radius: 22px;
      padding: 1.25px;
      background:
        conic-gradient(
          from var(--astro-plus-angle),
          rgba(255,255,255,0.94) 0deg,
          rgba(255,255,255,0.72) 52deg,
          rgba(218,183,104,0.94) 116deg,
          rgba(255,236,184,0.88) 178deg,
          rgba(255,255,255,0.96) 232deg,
          rgba(193,151,67,0.90) 300deg,
          rgba(255,255,255,0.94) 360deg
        );
      box-shadow:
        0 0 20px rgba(218,183,104,0.16),
        0 14px 34px rgba(0,0,0,0.44);
      animation: astroPlusOrbit 8s linear infinite;
    }
    .astro-plus-xl-shell {
      background:
        conic-gradient(
          from var(--astro-plus-angle),
          rgba(255,255,255,0.98) 0deg,
          rgba(171,196,232,0.80) 72deg,
          rgba(255,255,255,0.72) 136deg,
          rgba(226,235,248,0.98) 210deg,
          rgba(140,171,219,0.76) 292deg,
          rgba(255,255,255,0.98) 360deg
        );
      box-shadow:
        0 0 22px rgba(255,255,255,0.20),
        0 0 38px rgba(140,171,219,0.10),
        0 14px 34px rgba(0,0,0,0.44);
    }
    .astro-plus-shell::after,
    .astro-plus-xl-shell::after {
      content: "";
      position: absolute;
      inset: -2px;
      z-index: -1;
      border-radius: inherit;
      background: inherit;
      opacity: 0.30;
      filter: blur(8px);
      pointer-events: none;
    }
    .astro-plus-inner {
      position: relative;
      z-index: 1;
      overflow: hidden;
      border-radius: 20.75px;
      background:
        radial-gradient(circle at 20% 0%, rgba(218,183,104,0.08), transparent 42%),
        radial-gradient(circle at 82% 0%, rgba(255,255,255,0.055), transparent 42%),
        linear-gradient(145deg, rgba(10,10,14,0.99), rgba(4,7,16,0.99));
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
    }
    @keyframes astroPlusOrbit { to { --astro-plus-angle: 360deg; } }
    @media (prefers-reduced-motion: reduce) {
      .astro-plus-shell,
      .astro-plus-xl-shell { animation: none !important; }
    }
  `;

  return (
    <div
      className={rootClass}
      style={{
        WebkitOverflowScrolling: "touch",
      }}
    >
      <style>{astroPlusPremiumCss}</style>

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
        {/* ── CREDITS + BALANCE — compressed header + balance strip ── */}
        <motion.section
          initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="mb-2"
        >
          <p className="mb-1.5 text-center text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500">
            Credits And Balance
          </p>
          {balance &&
            (balance.isSubscribed ? (
              <div className="rounded-[14px] border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-center text-[9px] font-medium uppercase tracking-[0.20em] text-white backdrop-blur-sm">
                Subscribed
              </div>
            ) : (
              <div className="grid grid-cols-3 divide-x divide-white/[0.06] rounded-[14px] border border-white/[0.08] bg-white/[0.025] px-1 py-2 backdrop-blur-sm">
                <div className="text-center">
                  <p className="text-[16px] font-light leading-none text-white tabular-nums">
                    {balance.readings}
                  </p>
                  <p className="mt-1 text-[8px] uppercase tracking-[0.14em] text-slate-500">
                    {plural(balance.readings, "Reading")}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[16px] font-light leading-none text-white tabular-nums">
                    {balance.jxl}
                  </p>
                  <p className="mt-1 text-[8px] uppercase tracking-[0.14em] text-slate-500">
                    Ask Anything
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[16px] font-light leading-none text-white tabular-nums">
                    {balance.replies}
                  </p>
                  <p className="mt-1 text-[8px] uppercase tracking-[0.14em] text-slate-500">
                    {plural(balance.replies, "Reply", "Replies")}
                  </p>
                </div>
              </div>
            ))}
        </motion.section>

        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
          className="space-y-2"
        >
          {/* ── MEMBERSHIP — selected with the compact toggle below ── */}
          <div
            className={`${
              isXlMembership ? "astro-plus-xl-shell" : "astro-plus-shell"
            } standard-shadow`}
          >
            <div className="astro-plus-inner p-[14px] backdrop-blur-sm">
              <div className="relative z-10 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.20em] text-white">
                    {activeMembership.name}
                  </p>
                  <div className="mt-1 flex items-end gap-1.5">
                    <span className="text-[27px] font-light leading-none text-white tabular-nums">
                      {formatUsd(activeMembership.price)}
                    </span>
                    <span className="pb-0.5 text-[10px] text-slate-500">/ month</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">
                    {activeMembership.tagline}
                  </p>
                </div>
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/[0.035]"
                  style={{ boxShadow: "0 0 12px rgba(255,255,255,0.12), 0 0 24px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.08)" }}
                >
                  <Crown className="h-5 w-5 text-white" strokeWidth={1.8} style={{ filter: "drop-shadow(0 0 4px rgba(255,255,255,0.95)) drop-shadow(0 0 10px rgba(255,255,255,0.55))" }} />
                </div>
              </div>

              <div className="mt-3 border-t border-white/[0.06] pt-2.5">
                <div className="grid grid-cols-1 gap-1.5">
                  {activeMembership.features.map((feature) => (
                    <div key={feature} className="flex items-center gap-2.5">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{
                          background: isXlMembership
                            ? "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(171,196,232,0.88))"
                            : "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(218,183,104,0.90))",
                          boxShadow: isXlMembership
                            ? "0 0 8px rgba(220,234,255,0.34)"
                            : "0 0 8px rgba(218,183,104,0.28)",
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
                className="mt-3 flex h-10 w-full items-center justify-center rounded-xl border text-[10px] font-medium uppercase tracking-[0.18em] transition disabled:cursor-default disabled:opacity-50"
                style={{
                  borderColor: "rgba(255,255,255,0.28)",
                  background:
                    isXlMembership
                      ? "linear-gradient(145deg, rgba(255,255,255,0.10), rgba(140,171,219,0.08))"
                      : "linear-gradient(145deg, rgba(255,255,255,0.08), rgba(203,164,78,0.08))",
                  color: "#F8FAFC",
                  boxShadow:
                    isXlMembership
                      ? "inset 0 1px 0 rgba(255,255,255,0.10), 0 0 16px rgba(220,234,255,0.14)"
                      : "inset 0 1px 0 rgba(255,255,255,0.08), 0 0 14px rgba(203,164,78,0.10)",
                }}
              >
                {loading ? "Opening…" : "Subscribe"}
              </button>
            </div>
          </div>

          {/* Small membership switch, intentionally outside both cards. */}
          <div
            role="radiogroup"
            aria-label="Choose a membership"
            className="mx-auto grid w-[76%] grid-cols-2 rounded-full border border-white/10 bg-black/35 p-1 backdrop-blur-md"
          >
            {(
              [
                ["astro_plus", "Astro Plus"],
                ["astro_plus_xl", "Astro Plus XL"],
              ] as const
            ).map(([tier, label]) => {
              const selected = membershipTier === tier;
              return (
                <button
                  key={tier}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setMembershipTier(tier)}
                  className="h-8 rounded-full text-[9px] font-medium uppercase tracking-[0.12em] transition"
                  style={{
                    color: selected ? "#F8FAFC" : "#64748B",
                    background: selected
                      ? tier === "astro_plus_xl"
                        ? "linear-gradient(145deg, rgba(255,255,255,0.14), rgba(140,171,219,0.10))"
                        : "linear-gradient(145deg, rgba(255,255,255,0.10), rgba(203,164,78,0.10))"
                      : "transparent",
                    boxShadow: selected
                      ? tier === "astro_plus_xl"
                        ? "0 0 12px rgba(220,234,255,0.12)"
                        : "0 0 12px rgba(203,164,78,0.10)"
                      : "none",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* ── INDIVIDUAL PURCHASE OPTIONS ── */}
          <div className="pt-2">
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

          {/* ── PLEDGE — intentionally presented without a card ── */}
          <section className="px-3 py-2 text-center">
            <div className="mx-auto flex max-w-[300px] items-center gap-2.5 border-b border-white/30 pb-2">
              <span className="text-[22px] font-light text-slate-200">$</span>
              <input
                type="text"
                inputMode="decimal"
                aria-label="Pledge amount in dollars"
                aria-describedby="pledge-statement"
                value={pledgeAmount}
                onChange={(event) => {
                  setPledgeAmount(event.target.value);
                  if (error) setError("");
                }}
                placeholder="Enter amount"
                className="min-w-0 flex-1 bg-transparent text-[18px] font-light text-white outline-none placeholder:text-slate-400/90"
              />
            </div>
            <p
              id="pledge-statement"
              className="mx-auto mt-1.5 max-w-[300px] text-[11px] leading-4 text-slate-400"
            >
              Pledge toward the continued expansion of{" "}
              <span className="font-medium text-[#E6C87D]">AstroProXL</span>
            </p>
          </section>

          {error && (
            <p
              role="alert"
              className="px-3 text-center text-[11px] leading-4 text-red-300"
            >
              {error}
            </p>
          )}

          {/* ── COMPACT CHECKOUT ── */}
          <section className="standard-shadow rounded-[20px] border border-white/10 bg-white/[0.03] px-3.5 py-3 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  {selectedItems === 0
                    ? pledgeAmountCents > 0
                      ? "Pledge included"
                      : "Nothing selected"
                    : pledgeAmountCents > 0
                      ? `${selectedItems} ${plural(selectedItems, "item")} + pledge`
                      : `${selectedItems} ${plural(selectedItems, "item")} selected`}
                </p>
                <p className="mt-1 text-[24px] font-light leading-none text-white tabular-nums">
                  {formatUsd(checkoutTotal)}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCheckout}
                disabled={
                  checkoutTotal <= 0 ||
                  loading ||
                  pledgeIsOverLimit ||
                  pledgeIsBelowMinimum
                }
                className="h-10 rounded-xl border border-teal-300/35 bg-teal-300/[0.07] px-4 text-[10px] font-medium uppercase tracking-[0.16em] text-teal-100 transition hover:bg-teal-300/[0.11] disabled:cursor-default disabled:opacity-30"
              >
                {loading ? "One moment…" : "Checkout"}
              </button>
            </div>
          </section>
        </motion.div>
      </div>
    </div>
  );
}