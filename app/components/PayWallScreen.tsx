"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Lock, Sparkles, Check, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaywallConfig } from "@/lib/paywallConfig";

interface PaywallScreenProps {
  config: PaywallConfig;
  readingTitle: string;
  readingTeaser: string;
  onCheckout: (mode: "one_time" | "subscription") => Promise<void>;
  onDismiss: () => void;
}

export default function PaywallScreen({
  config,
  readingTitle,
  readingTeaser,
  onCheckout,
  onDismiss,
}: PaywallScreenProps) {
  const [selected, setSelected] = useState<"one_time" | "subscription">("one_time");
  const [loading, setLoading] = useState(false);

  const { oneTime, subscription, isJourneyComplete, paywallIndex } = config;

  const handleContinue = async () => {
    setLoading(true);
    try {
      await onCheckout(selected);
    } finally {
      setLoading(false);
    }
  };

  const headlineText = isJourneyComplete
    ? "Your final reading this cycle"
    : "Your next reading is ready";

  const subText = isJourneyComplete
    ? "This is your 4th reading — the most direct prediction of the cycle. After this, a 2-week reset begins."
    : "A full 30-45 day reading with specific dates, root patterns, and direct directives.";

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col"
    >
      {/* Lock badge */}
      <div className="mb-5 flex items-center gap-2">
        <Lock className="h-4 w-4 text-teal-300" />
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-teal-300">
          Next Reading
        </span>
        {isJourneyComplete && (
          <span className="ml-auto rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-300">
            Final in Cycle
          </span>
        )}
      </div>

      {/* Framing copy */}
      <div className="mb-5 space-y-1">
        <p className="text-[22px] font-semibold leading-tight text-white">{headlineText}</p>
        <p className="text-[13px] leading-5 text-slate-400">{subText}</p>
      </div>

      {/* What's included */}
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
          {isJourneyComplete && (
            <li className="flex items-center gap-2 text-[13px] text-amber-300/80">
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              Includes 1 JXL session — live chart conversation
            </li>
          )}
        </ul>
      </div>

      {/* Option selector */}
      <div className="mb-4 space-y-3">

        {/* One-time option */}
        <button
          type="button"
          onClick={() => setSelected("one_time")}
          className={cn(
            "w-full rounded-[20px] border p-4 text-left transition-all duration-200",
            selected === "one_time"
              ? "border-teal-300/60 bg-teal-400/[0.07] shadow-[0_0_0_1px_rgba(94,234,212,0.12)]"
              : "border-white/10 bg-white/[0.03] hover:border-white/20"
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-4 w-4 rounded-full border-2 transition-all shrink-0",
                  selected === "one_time"
                    ? "border-teal-300 bg-teal-300"
                    : "border-slate-500 bg-transparent"
                )}
              />
              <div>
                <p className="text-[14px] font-semibold text-white">This reading only</p>
                <p className="text-[11px] text-slate-400">One-time · no commitment</p>
              </div>
            </div>
            <span className={cn(
              "shrink-0 text-lg font-bold",
              selected === "one_time" ? "text-teal-300" : "text-slate-300"
            )}>
              {oneTime.displayPrice}
            </span>
          </div>
        </button>

        {/* Subscription option */}
        <button
          type="button"
          onClick={() => setSelected("subscription")}
          className={cn(
            "relative w-full rounded-[20px] border p-4 text-left transition-all duration-200",
            selected === "subscription"
              ? "border-amber-300/50 bg-amber-400/[0.06] shadow-[0_0_0_1px_rgba(251,191,36,0.1)]"
              : "border-white/10 bg-white/[0.03] hover:border-white/20"
          )}
        >
          {subscription.isBestOffer && (
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
                  selected === "subscription"
                    ? "border-amber-300 bg-amber-300"
                    : "border-slate-500 bg-transparent"
                )}
              />
              <div className="space-y-1">
                <p className="text-[14px] font-semibold text-white">{subscription.name}</p>
                <p className="text-[11px] text-slate-400">{subscription.tagline}</p>
                <ul className="space-y-1 pt-1">
                  <li className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <Check className="h-3 w-3 text-amber-300 shrink-0" />
                    Unlimited readings — no paywalls
                  </li>
                  <li className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <Check className="h-3 w-3 text-amber-300 shrink-0" />
                    JXL sessions included every month
                  </li>
                  <li className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <Check className="h-3 w-3 text-amber-300 shrink-0" />
                    No cooldown periods
                  </li>
                </ul>
              </div>
            </div>
            <span className={cn(
              "shrink-0 text-lg font-bold",
              selected === "subscription" ? "text-amber-300" : "text-slate-300"
            )}>
              {subscription.displayPrice}
            </span>
          </div>
        </button>
      </div>

      {/* Cycle indicator */}
      <p className="mb-4 text-center text-[11px] text-slate-600">
        Reading {paywallIndex} of 4 in your cycle · resets every 2 weeks
      </p>

      {/* CTA */}
      <button
        type="button"
        onClick={handleContinue}
        disabled={loading}
        className={cn(
          "h-14 w-full rounded-2xl text-sm font-semibold transition-all",
          selected === "subscription"
            ? "bg-amber-300 text-slate-950 hover:bg-amber-200 shadow-lg shadow-amber-500/20"
            : "bg-teal-300 text-slate-950 hover:bg-teal-200 shadow-lg shadow-teal-500/20",
          "disabled:opacity-60 disabled:cursor-not-allowed"
        )}
      >
        {loading
          ? "Loading checkout…"
          : selected === "subscription"
            ? "Subscribe — " + subscription.displayPrice
            : "Get This Reading — " + oneTime.displayPrice}
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
