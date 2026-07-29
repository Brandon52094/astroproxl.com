"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Crown, Zap, Infinity, Check } from "lucide-react";
import { SUB_TIERS } from "@/lib/paywallConfig";

interface UserStatus {
  firstReadingUsed: boolean;
  paywallsCompleted: number;
  isSubscribed: boolean;
  readingsCompleted: number;
  onCooldown: boolean;
  cooldownExpiresAt: string | null;
  canBypass: boolean;
  freeReadingResetAt: string | null;
  freeReadingAvailable: boolean;
}

interface AccessUnlimitedPanelProps {
  userStatus: UserStatus | null;
}

const FEATURES = [
  { icon: Crown, label: "4 or 8 Readings/mo", desc: "Get a full week of insights" },
  { icon: Zap, label: "Ask Follow Ups Free", desc: "No extra charges for clarity" },
  { icon: Infinity, label: "No 2-week wait", desc: "Read when you need it" },
  { icon: Sparkles, label: "Full Chart Access", desc: "Birth chart, transits, cycles" },
];

const EXTRA_FEATURES = [
  "Downloads Always Free",
  "No cooldowns, ever",
  "Unlimited Access Features",
];

export default function AccessUnlimitedPanel({ userStatus }: AccessUnlimitedPanelProps) {
  const [isSubscribeLoading, setIsSubscribeLoading] = useState(false);
  const [tier, setTier] = useState<"sub_base" | "sub_plus">("sub_base");
  const activeTier = SUB_TIERS[tier];
  const isSubscribed = userStatus?.isSubscribed || false;

  const handleSubscribe = async () => {
    setIsSubscribeLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/reading/intake`,
          mode: "subscription",
          bundleTier: tier, // "sub_base" or "sub_plus" — checkout reads this to pick the tier
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setIsSubscribeLoading(false);
    }
  };

  // Already subscribed - show minimal message
  if (isSubscribed) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#050816] px-6">
        <div className="max-w-[430px] w-full text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300 mx-auto mb-6">
              <Crown className="h-10 w-10" />
            </div>
            <h1 className="text-3xl font-semibold text-white mb-3">
              You're Subscribed! 🎉
            </h1>
            <p className="text-base text-slate-400 leading-relaxed">
              Full access to all features unlocked. Swipe right to explore your birth chart and daily transits.
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  // Not subscribed - full page
  return (
    <div className="h-screen w-full overflow-y-auto bg-[#050816]">
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 py-12 max-w-[430px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full text-center mb-8"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-300/10 border border-amber-300/20 mx-auto mb-4">
            <Sparkles className="h-8 w-8 text-amber-300" />
          </div>
          <h1 className="text-3xl font-semibold text-white mb-3 tracking-tight">
            Unlimited Access
          </h1>
          <p className="text-base text-slate-400 leading-relaxed">
            Everything you need. No waiting. No limits.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
          className="w-full space-y-3 mb-6"
        >
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <div 
                key={i}
                className="flex items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-300/10 text-amber-300">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-white">{feature.label}</p>
                  <p className="text-xs text-slate-500">{feature.desc}</p>
                </div>
              </div>
            );
          })}
        </motion.div>

        {/* Extra features as checkmarks */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15, ease: "easeOut" }}
          className="w-full space-y-1.5 mb-6"
        >
          {EXTRA_FEATURES.map((feature) => (
            <div key={feature} className="flex items-center gap-2.5 px-1">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400/10 text-[9px] text-amber-300">
                ✓
              </span>
              <span className="text-[12px] text-slate-400">{feature}</span>
            </div>
          ))}
        </motion.div>

        {/* ── Tier toggle ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.18 }}
          className="w-full mb-4"
        >
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
            {(["sub_base", "sub_plus"] as const).map((k) => {
              const t = SUB_TIERS[k];
              const on = tier === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTier(k)}
                  className={
                    "rounded-xl px-3 py-3 text-center transition-all " +
                    (on ? "bg-amber-300/20 border border-amber-300/40" : "border border-transparent")
                  }
                >
                  <p className={"text-sm font-semibold " + (on ? "text-amber-200" : "text-slate-300")}>
                    {t.readings} readings + {t.jxl} JXL
                  </p>
                  <p className={"text-[11px] " + (on ? "text-amber-300/80" : "text-slate-500")}>
                    {t.displayPrice}
                  </p>
                </button>
              );
            })}
          </div>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2, ease: "easeOut" }}
          whileTap={{ scale: 0.985 }}
          onClick={handleSubscribe}
          disabled={isSubscribeLoading}
          className="w-full h-14 rounded-2xl bg-gradient-to-r from-amber-300/20 to-amber-400/10 border border-amber-300/30 text-amber-200 text-base font-semibold transition hover:bg-amber-300/30 disabled:opacity-60"
        >
          {isSubscribeLoading ? "Loading…" : `Unlock All — ${activeTier.displayPrice}`}
        </motion.button>

        <p className="text-center text-xs text-slate-500 mt-4">
          Cancel anytime
        </p>

        {/* Swipe back hint */}
        <div className="flex items-center justify-center gap-2 mt-6 text-[10px] text-slate-500/40">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>Swipe right to go back</span>
        </div>
      </div>
    </div>
  );
}