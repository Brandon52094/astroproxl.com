"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Crown, Zap, Infinity } from "lucide-react";

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
  { icon: Crown, label: "8 Readings, not 1" },
  { icon: Zap, label: "Ask Follow Ups Free" },
  { icon: Infinity, label: "No 2-week wait" },
  { icon: Sparkles, label: "Full Chart Access" },
];

export default function AccessUnlimitedPanel({ userStatus }: AccessUnlimitedPanelProps) {
  const [isSubscribeLoading, setIsSubscribeLoading] = useState(false);
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
          paywallIndex: 1,
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
      <div className="h-full w-full flex flex-col items-center justify-center bg-[#050816] px-6">
        <div className="max-w-[430px] w-full text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300 mx-auto mb-4">
            <Crown className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-semibold text-white mb-2">
            You're Subscribed! 🎉
          </h1>
          <p className="text-sm text-slate-400">
            Full access unlocked. Swipe to explore your birth chart and transits.
          </p>
        </div>
      </div>
    );
  }

  // Not subscribed - show the banner-style panel
  return (
    <div className="h-full w-full flex items-center justify-center bg-[#050816] px-4 py-8">
      <div className="w-full max-w-[430px]">
        {/* Compact banner card - same size as the old carousel */}
        <div className="rounded-2xl border border-amber-300/20 bg-gradient-to-b from-amber-300/5 to-amber-400/5 p-5">
          {/* Header */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/10 text-amber-200">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-amber-200">
                Unlimited Access
              </h2>
              <p className="text-[11px] text-slate-400">Everything you need. No limits.</p>
            </div>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <span 
                  key={feature.label}
                  className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full border border-amber-300/10 bg-amber-300/5 text-amber-300/60"
                >
                  <Icon className="h-2.5 w-2.5" />
                  {feature.label}
                </span>
              );
            })}
          </div>

          {/* Subscribe button */}
          <motion.button
            whileTap={{ scale: 0.985 }}
            transition={{ duration: 0.12 }}
            onClick={handleSubscribe}
            disabled={isSubscribeLoading}
            className="w-full h-10 rounded-xl bg-amber-300/20 border border-amber-300/30 text-amber-200 text-[13px] font-semibold transition hover:bg-amber-300/30 disabled:opacity-60"
          >
            {isSubscribeLoading ? "Loading…" : "Unlock All — $12.99/mo"}
          </motion.button>

          <p className="text-center text-[9px] text-slate-500 mt-2">
            Cancel anytime · 7-day free trial
          </p>
        </div>

        {/* Swipe back hint */}
        <div className="flex items-center justify-center gap-2 mt-4 text-[10px] text-slate-500/40">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>Swipe right to go back</span>
        </div>
      </div>
    </div>
  );
}