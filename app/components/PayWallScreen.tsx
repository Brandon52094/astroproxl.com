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

  // Journey-complete framing on paywall 4
  const headlineText = isJourneyComplete
    ? "Your reading journey is complete"
    : "One page ahead";

  const subText = isJourneyComplete
    ? "This is your final page — the most direct prediction in the full reading."
    : "The most specific and direct page of your reading — the actual prediction, the turning point, and what to do next.";

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
        <Lock className="h-4 w-4 text-amber-300" />
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-amber-300">
          Final Insight
        </span>
        {isJourneyComplete && (
          <span className="ml-auto rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-300">
            Journey Complete
          </span>
        )}
      </div>

      {/* Page title */}
      <h1 className="mb-4 text-2xl font-semibold leading-tight text-white">
        {readingTitle}
      </h1>

      {/* Blurred teaser */}
      <div className="relative mb-6 overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
        <p className="select-none text-sm leading-7 text-slate-300 blur-[5px] line-clamp-4 pointer-events-none">
          {readingTeaser}
        </p>
        <div className="absolute inset-0 rounded-[24px] bg-gradient-to-b from-transparent via-[#050816]/50 to-[#050816]/95" />
        <div className="absolute bottom-4 left-0 right-0 flex justify-center">
          <span className="rounded-full border border-amber-300/20 bg-[#050816]/80 px-3 py-1 text-[11px] text-amber-300/80 backdrop-blur-sm">
            Unlock to read
          </span>
        </div>
      </div>

      {/* Framing copy */}
      <div className="mb-5 space-y-1">
        <p className="text-[15px] font-semibold text-white">{headlineText}</p>
        <p className="text-[13px] leading-5 text-slate-400">{subText}</p>
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
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-4 w-4 rounded-full border-2 transition-all",
                    selected === "one_time"
                      ? "border-teal-300 bg-teal-300"
                      : "border-slate-500 bg-transparent"
                  )}
                />
                <span className="text-[14px] font-semibold text-white">
                  One-time unlock
                </span>
              </div>
              <p className="pl-6 text-xs leading-5 text-slate-400">
                {oneTime.creditsLabel}
              </p>
              {!isJourneyComplete && (
                <ul className="pl-6 space-y-1 pt-1">
                  <li className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Check className="h-3 w-3 text-teal-300 shrink-0" />
                    Unlock page 4 right now
                  </li>
                  <li className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Check className="h-3 w-3 text-teal-300 shrink-0" />
                    Credits carry into your next reading
                  </li>
                </ul>
              )}
              {isJourneyComplete && (
                <p className="pl-6 text-xs text-slate-500 pt-0.5">
                  No credits — this completes your reading journey
                </p>
              )}
            </div>
            <span
              className={cn(
                "shrink-0 text-lg font-bold",
                selected === "one_time" ? "text-teal-300" : "text-slate-300"
              )}
            >
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
          {/* Best offer badge */}
          {subscription.isBestOffer && (
            <div className="absolute -top-2.5 left-4">
              <span className="flex items-center gap-1 rounded-full border border-amber-300/40 bg-[#050816] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300">
                <Star className="h-2.5 w-2.5 fill-amber-300" />
                Best offer
              </span>
            </div>
          )}

          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-4 w-4 rounded-full border-2 transition-all",
                    selected === "subscription"
                      ? "border-amber-300 bg-amber-300"
                      : "border-slate-500 bg-transparent"
                  )}
                />
                <span className="text-[14px] font-semibold text-white">
                  {subscription.name}
                </span>
              </div>
              <p className="pl-6 text-xs leading-5 text-slate-400">
                {subscription.tagline}
              </p>
              <ul className="pl-6 space-y-1 pt-1">
                <li className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Check className="h-3 w-3 text-amber-300 shrink-0" />
                  No paywalls — ever
                </li>
                <li className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Check className="h-3 w-3 text-amber-300 shrink-0" />
                  4 full readings per month
                </li>
                <li className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Check className="h-3 w-3 text-amber-300 shrink-0" />
                  10 Jxl sessions included
                </li>
                {subscription.isBestOffer && (
                  <li className="flex items-center gap-1.5 text-xs text-amber-300/80">
                    <Sparkles className="h-3 w-3 shrink-0" />
                    Lowest price — locked in forever
                  </li>
                )}
              </ul>
            </div>
            <span
              className={cn(
                "shrink-0 text-lg font-bold",
                selected === "subscription" ? "text-amber-300" : "text-slate-300"
              )}
            >
              {subscription.displayPrice}
            </span>
          </div>
        </button>
      </div>

      {/* Paywall progress indicator */}
      {paywallIndex < 4 && (
        <p className="mb-4 text-center text-[11px] text-slate-600">
          Reading {paywallIndex} of 4 · Total if completed: $26.00
        </p>
      )}

      {/* CTA */}
      <button
        type="button"
        onClick={handleContinue}
        disabled={loading}
        className={cn(
          "h-13 w-full rounded-2xl text-sm font-semibold transition-all",
          selected === "subscription"
            ? "bg-amber-300 text-slate-950 hover:bg-amber-200 shadow-lg shadow-amber-500/20"
            : "bg-teal-300 text-slate-950 hover:bg-teal-200 shadow-lg shadow-teal-500/20",
          "disabled:opacity-60 disabled:cursor-not-allowed"
        )}
      >
        {loading
          ? "Loading checkout…"
          : selected === "subscription"
            ? `Subscribe — ${subscription.displayPrice}`
            : `Unlock Now — ${oneTime.displayPrice}`}
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
