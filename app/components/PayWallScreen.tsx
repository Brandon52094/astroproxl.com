"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Lock, Check, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUB_TIERS, READING_PRICE } from "@/lib/paywallConfig";

type CheckoutChoice =
  | { mode: "one_time" }
  | { mode: "subscription"; tier: "sub_base" | "sub_plus" };

interface PaywallScreenProps {
  readingTitle: string;
  readingTeaser: string;
  onCheckout: (choice: CheckoutChoice) => Promise<void>;
  onDismiss: () => void;
}

export default function PaywallScreen({
  readingTitle,
  readingTeaser,
  onCheckout,
  onDismiss,
}: PaywallScreenProps) {
  const [selected, setSelected] = useState<CheckoutChoice>({ mode: "one_time" });
  const [loading, setLoading] = useState(false);

  const readingPriceLabel = `$${(READING_PRICE / 100).toFixed(0)}`;
  const base = SUB_TIERS.sub_base;
  const plus = SUB_TIERS.sub_plus;

  const isSelected = (c: CheckoutChoice) =>
    c.mode === selected.mode &&
    (c.mode !== "subscription" ||
      (selected.mode === "subscription" && c.tier === selected.tier));

  const handleContinue = async () => {
    setLoading(true);
    try {
      await onCheckout(selected);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col"
    >
      <div className="mb-5 flex items-center gap-2">
        <Lock className="h-4 w-4 text-teal-300" />
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-teal-300">
          Next Reading
        </span>
      </div>

      <div className="mb-5 space-y-1">
        <p className="text-[22px] font-semibold leading-tight text-white">
          Your next reading is ready
        </p>
        <p className="text-[13px] leading-5 text-slate-400">
          A full 30-45 day reading with specific dates, root patterns, and direct directives.
        </p>
      </div>

      <div className="mb-6 rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-4 space-y-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">What you get</p>
        <ul className="space-y-2">
          <li className="flex items-center gap-2 text-[13px] text-slate-300">
            <Check className="h-3.5 w-3.5 text-teal-300 shrink-0" />
            Full 30-45 day reading — specific dates and windows
          </li>
          <li className="flex items-center gap-2 text-[13px] text-slate-300">
            <Check className="h-3.5 w-3.5 text-teal-300 shrink-0" />
            Root pattern diagnosis — why this is happening
          </li>
          <li className="flex items-center gap-2 text-[13px] text-slate-300">
            <Check className="h-3.5 w-3.5 text-teal-300 shrink-0" />
            DROP / EXECUTE / LOCK directives — what to do now
          </li>
          <li className="flex items-center gap-2 text-[13px] text-slate-300">
            <Check className="h-3.5 w-3.5 text-teal-300 shrink-0" />
            1 free follow-up question on this reading
          </li>
        </ul>
      </div>

      <div className="mb-4 space-y-3">
        {/* One-time */}
        <button
          type="button"
          onClick={() => setSelected({ mode: "one_time" })}
          className={cn(
            "w-full rounded-[20px] border p-4 text-left transition-all duration-200",
            isSelected({ mode: "one_time" })
              ? "border-teal-300/60 bg-teal-400/[0.07] shadow-[0_0_0_1px_rgba(94,234,212,0.12)]"
              : "border-white/10 bg-white/[0.03] hover:border-white/20"
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-4 w-4 rounded-full border-2 transition-all shrink-0",
                  isSelected({ mode: "one_time" })
                    ? "border-teal-300 bg-teal-300"
                    : "border-slate-500 bg-transparent"
                )}
              />
              <div>
                <p className="text-[14px] font-semibold text-white">This reading only</p>
                <p className="text-[11px] text-slate-400">
                  One-time · no commitment
                </p>
              </div>
            </div>
            <span className={cn(
              "shrink-0 text-lg font-bold",
              isSelected({ mode: "one_time" }) ? "text-teal-300" : "text-slate-300"
            )}>
              {readingPriceLabel}
            </span>
          </div>
        </button>

        {/* $12 base subscription */}
        <button
          type="button"
          onClick={() => setSelected({ mode: "subscription", tier: "sub_base" })}
          className={cn(
            "w-full rounded-[20px] border p-4 text-left transition-all duration-200",
            isSelected({ mode: "subscription", tier: "sub_base" })
              ? "border-amber-300/50 bg-amber-400/[0.06] shadow-[0_0_0_1px_rgba(251,191,36,0.1)]"
              : "border-white/10 bg-white/[0.03] hover:border-white/20"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-0.5 h-4 w-4 rounded-full border-2 transition-all shrink-0",
                  isSelected({ mode: "subscription", tier: "sub_base" })
                    ? "border-amber-300 bg-amber-300"
                    : "border-slate-500 bg-transparent"
                )}
              />
              <div className="space-y-1">
                <p className="text-[14px] font-semibold text-white">{base.name}</p>
                <ul className="space-y-1 pt-1">
                  <li className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <Check className="h-3 w-3 text-amber-300 shrink-0" />
                    {base.readings} readings + {base.jxl} JXL every month
                  </li>
                  <li className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <Check className="h-3 w-3 text-amber-300 shrink-0" />
                    50% off extras · no cooldowns · free downloads
                  </li>
                </ul>
              </div>
            </div>
            <span className={cn(
              "shrink-0 text-lg font-bold",
              isSelected({ mode: "subscription", tier: "sub_base" }) ? "text-amber-300" : "text-slate-300"
            )}>
              {base.displayPrice}
            </span>
          </div>
        </button>

        {/* $16 plus subscription */}
        <button
          type="button"
          onClick={() => setSelected({ mode: "subscription", tier: "sub_plus" })}
          className={cn(
            "relative w-full rounded-[20px] border p-4 text-left transition-all duration-200",
            isSelected({ mode: "subscription", tier: "sub_plus" })
              ? "border-amber-300/50 bg-amber-400/[0.06] shadow-[0_0_0_1px_rgba(251,191,36,0.1)]"
              : "border-white/10 bg-white/[0.03] hover:border-white/20"
          )}
        >
          {plus.isBestOffer && (
            <div className="absolute -top-2.5 left-4">
              <span className="flex items-center gap-1 rounded-full border border-amber-300/40 bg-[#050816] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300">
                <Star className="h-2.5 w-2.5 fill-amber-300" />
                Best value
              </span>
            </div>
          )}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-0.5 h-4 w-4 rounded-full border-2 transition-all shrink-0",
                  isSelected({ mode: "subscription", tier: "sub_plus" })
                    ? "border-amber-300 bg-amber-300"
                    : "border-slate-500 bg-transparent"
                )}
              />
              <div className="space-y-1">
                <p className="text-[14px] font-semibold text-white">{plus.name}</p>
                <ul className="space-y-1 pt-1">
                  <li className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <Check className="h-3 w-3 text-amber-300 shrink-0" />
                    {plus.readings} readings + {plus.jxl} JXL every month
                  </li>
                  <li className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <Check className="h-3 w-3 text-amber-300 shrink-0" />
                    50% off extras · no cooldowns · free downloads
                  </li>
                </ul>
              </div>
            </div>
            <span className={cn(
              "shrink-0 text-lg font-bold",
              isSelected({ mode: "subscription", tier: "sub_plus" }) ? "text-amber-300" : "text-slate-300"
            )}>
              {plus.displayPrice}
            </span>
          </div>
        </button>
      </div>

      <button
        type="button"
        onClick={handleContinue}
        disabled={loading}
        className={cn(
          "h-14 w-full rounded-2xl text-sm font-semibold transition-all",
          selected.mode === "subscription"
            ? "bg-amber-300 text-slate-950 hover:bg-amber-200 shadow-lg shadow-amber-500/20"
            : "bg-teal-300 text-slate-950 hover:bg-teal-200 shadow-lg shadow-teal-500/20",
          "disabled:opacity-60 disabled:cursor-not-allowed"
        )}
      >
        {loading
          ? "Loading checkout…"
          : selected.mode === "subscription"
            ? `Subscribe — ${selected.tier === "sub_plus" ? plus.displayPrice : base.displayPrice}`
            : `Get This Reading — ${readingPriceLabel}`}
      </button>

      <button
        type="button"
        onClick={onDismiss}
        className="mt-3 w-full text-center text-xs text-slate-600 transition hover:text-slate-400"
      >
        Maybe later
      </button>
    </motion.div>
  );
}