"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Check, Crown, Zap, Infinity } from "lucide-react";

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
  { icon: Crown, label: "8 Readings, not 1", desc: "Get a full week of insights" },
  { icon: Zap, label: "Ask Follow Ups Free", desc: "No extra charges for clarity" },
  { icon: Infinity, label: "No 2-week wait", desc: "Read when you need it" },
  { icon: Sparkles, label: "Full Chart Access", desc: "Birth chart, transits, cycles" },
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

  return (
    <div className="h-screen w-full overflow-y-auto bg-[#050816]">
      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-amber-300/5 blur-[100px] pointer-events-none" />
      
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
          className="w-full space-y-3 mb-8"
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

        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2, ease: "easeOut" }}
          whileTap={{ scale: 0.985 }}
          onClick={handleSubscribe}
          disabled={isSubscribeLoading}
          className="w-full h-14 rounded-2xl bg-gradient-to-r from-amber-300/20 to-amber-400/10 border border-amber-300/30 text-amber-200 text-base font-semibold transition hover:bg-amber-300/30 disabled:opacity-60"
        >
          {isSubscribeLoading ? "Loading…" : "Unlock All — $12.99/mo"}
        </motion.button>

        <p className="text-center text-xs text-slate-500 mt-4">
          Cancel anytime · 7-day free trial
        </p>

        <p className="text-center text-[10px] text-slate-600 mt-6 max-w-[280px]">
          Swipe right to explore your free preview →<br />
          <span className="text-slate-700">Subscribers see everything unlocked</span>
        </p>
      </div>
    </div>
  );
}