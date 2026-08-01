"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, ChevronLeft, Check } from "lucide-react";
import { SUB_TIERS } from "@/lib/paywallConfig";
import { cn } from "@/lib/utils";

interface UserStatus {
  credits: number;
  isSubscribed: boolean;
  readingsCompleted: number;
  onCooldown: boolean;
  cooldownExpiresAt: string | null;
  canBypass: boolean;
  firstPaidReadingUsed: boolean;
  pwaFreeReadingUsed?: boolean;
}

interface MembershipPanelProps {
  userStatus: UserStatus | null;
  onSwipeRight?: () => void;
}

const PERKS = [
  "Reading credits every month",
  "JXL follow-up credits every month",
  "Free reading downloads",
  "50% off extras after you run out",
  "No cooldowns, ever",
];

export default function MembershipPanel({ userStatus, onSwipeRight }: MembershipPanelProps) {
  const [isSubscribeLoading, setIsSubscribeLoading] = useState(false);
  const isSubscribed = userStatus?.isSubscribed || false;

  const handleSubscribe = async (tierKey: "sub_base" | "sub_plus") => {
    setIsSubscribeLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/reading/intake`,
          mode: "subscription",
          bundleTier: tierKey,
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      // silent
    } finally {
      setIsSubscribeLoading(false);
    }
  };

  // Already subscribed
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
              <Sparkles className="h-10 w-10" />
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
      <div className="relative z-10 flex flex-col items-center px-6 py-12 max-w-[430px] mx-auto min-h-screen">
        {/* ── Back swipe cue ── */}
        <button
          type="button"
          onClick={() => onSwipeRight?.()}
          className="swipe-cue tap-fix mx-auto mb-6 flex items-center justify-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-white/85"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Swipe Right to Go Back
        </button>

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full text-center mb-6"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-300/10 border border-amber-300/20 mx-auto mb-4">
            <Sparkles className="h-8 w-8 text-amber-300" />
          </div>
          <h1 className="text-3xl font-semibold text-white mb-3 tracking-tight">
            Choose Your Access
          </h1>
          <p className="text-base text-slate-400 leading-relaxed">
            More readings, more follow-up, no waiting
          </p>
        </motion.div>

        {/* ── Perks ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="w-full mb-6"
        >
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <h3 className="text-[15px] font-semibold text-white mb-3">
              More Clarity. No Waiting.
            </h3>
            <p className="text-[12px] text-slate-400 mb-4">
              Monthly access to deeper readings, JXL follow-ups, and no cooldowns.
            </p>
            <div className="space-y-2">
              {PERKS.map((perk) => (
                <div key={perk} className="flex items-center gap-2.5">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-[9px] text-amber-300">✓</span>
                  <span className="text-[12px] text-slate-300">{perk}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-amber-300/60 mt-4">
              Less than two single readings a month.
            </p>
          </div>
        </motion.div>

        {/* ── Tier cards ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.18 }}
          className="w-full space-y-3"
        >
          {(["sub_base", "sub_plus"] as const).map((tierKey, index) => {
            const t = SUB_TIERS[tierKey];
            const isHero = tierKey === "sub_plus";
            return (
              <motion.div
                key={tierKey}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.18 + index * 0.08 }}
                className={cn(
                  "relative rounded-2xl border p-5 transition-all",
                  isHero
                    ? "border-amber-300/40 bg-amber-300/10"
                    : "border-white/10 bg-white/[0.03]"
                )}
              >
                {isHero && (
                  <span className="absolute -top-2 left-4 rounded-full border border-amber-300/50 bg-[#050816] px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-300">
                    Best Value
                  </span>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[20px] font-bold text-white">{t.displayPrice}</p>
                    <p className="text-[13px] text-slate-300">
                      {t.readings} readings + {t.jxl} JXL
                    </p>
                    <p className="text-[11px] text-slate-500">every month</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSubscribe(tierKey)}
                    disabled={isSubscribeLoading}
                    className={cn(
                      "px-6 py-2.5 rounded-full text-sm font-semibold transition",
                      isHero
                        ? "bg-amber-300 text-[#050816] hover:bg-amber-200"
                        : "border border-white/20 text-white hover:bg-white/5"
                    )}
                  >
                    {isSubscribeLoading ? "..." : "Subscribe"}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* ── Value line ── */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-4 text-center text-[11px] font-medium text-amber-300/90"
        >
          Double the access for only $4 more
        </motion.p>
        <p className="mt-1 text-center text-[10px] text-slate-500">Cancel anytime</p>

        {/* ── Mission section ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="w-full mt-8"
        >
          <div className="mission-section">
            <button
              type="button"
              className="mission-toggle tap-fix"
              data-no-swipe
              onClick={() => {
                const el = document.getElementById("mission-body");
                if (el) {
                  el.classList.toggle("open");
                }
              }}
            >
              Why AstroProXL exists
              <ChevronLeft className="h-3.5 w-3.5 rotate-90 transition-transform duration-200" />
            </button>
            <div id="mission-body" className="mission-body hidden open:block">
              <p>
                Most people look for a reading when they're going through something hard —
                a heartbreak, a money fear, a crossroads they can't see past. That's exactly
                when clarity matters most, and exactly when it's usually least affordable.
              </p>
              <p>
                Readings elsewhere run $60 to $120, often from someone working off intuition
                alone — and even the most well-meaning human carries bias they may not notice.
              </p>
              <p>
                I built AstroProXL to be different: a full calculation of your actual chart —
                placements, transits, timing — with no agenda and no guesswork, at a price
                that doesn't add to your stress. Affordable, honest clarity, for the moments
                you need it most.
              </p>
              <p className="mission-signoff">— Jáneel, Founder &amp; The AstroProXL Team</p>
            </div>
          </div>
        </motion.div>
      </div>

      <style jsx>{`
        .tap-fix {
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }

        @keyframes swipeCuePulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; text-shadow: 0 0 14px rgba(255,255,255,0.55); }
        }
        @keyframes swipeCueNudge {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(-4px); }
        }
        .swipe-cue {
          animation: swipeCuePulse 2.1s ease-in-out infinite;
          background: transparent;
          border: none;
          cursor: pointer;
        }
        .swipe-cue svg {
          animation: swipeCueNudge 2.1s ease-in-out infinite;
        }

        .mission-section {
          width: 100%;
        }
        .mission-toggle {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          width: 100%;
          background: none;
          border: none;
          color: #94a3b8;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          padding: 10px;
        }
        .mission-body {
          margin-top: 12px;
          display: none;
          animation: mission-fade 300ms ease;
        }
        .mission-body.open {
          display: block;
        }
        .mission-body p {
          font-size: 13px;
          line-height: 1.6;
          color: #cbd5e1;
          margin-bottom: 12px;
        }
        .mission-signoff {
          margin-top: 16px;
          color: #93c5fd;
          font-style: italic;
        }
        @keyframes mission-fade {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .swipe-cue, .swipe-cue svg { animation: none !important; }
        }
      `}</style>
    </div>
  );
}