"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, ChevronLeft, ChevronRight, ChevronDown, Zap, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUB_TIERS } from "@/lib/paywallConfig";
import StarfieldBackground from "./StarfieldBackground";

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
  const [showMission, setShowMission] = useState(true); // Start open
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

  // Already subscribed - show minimal view
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
            <button
              type="button"
              onClick={() => onSwipeRight?.()}
              className="mt-6 text-sm text-slate-500 hover:text-slate-300 transition"
            >
              ← Swipe right to go back
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="no-scrollbar relative h-screen overflow-y-auto overscroll-none text-slate-100"
      style={{
        WebkitOverflowScrolling: "touch",
        background: "linear-gradient(180deg, #061120 0%, #050816 44%, #040611 100%)",
      }}
    >
      <style jsx>{`
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; width: 0; height: 0; }
        .tap-fix { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }

        /* ── Gold outline frame ── */
        .gold-frame {
          position: relative;
          border: 1.5px solid rgba(251,191,36,0.3);
          border-radius: 32px;
          background: rgba(5,6,15,0.6);
          backdrop-filter: blur(12px);
          box-shadow: 0 0 60px rgba(251,191,36,0.06), inset 0 0 60px rgba(251,191,36,0.03);
          padding: 24px 20px;
          margin: 0 16px 20px;
          transition: border-color 0.4s ease, box-shadow 0.4s ease;
        }
        .gold-frame::before {
          content: "";
          position: absolute;
          inset: -2px;
          border-radius: 34px;
          padding: 2px;
          background: linear-gradient(135deg, rgba(251,191,36,0.15), rgba(251,191,36,0.05), rgba(251,191,36,0.15));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
        .gold-frame:hover {
          border-color: rgba(251,191,36,0.5);
          box-shadow: 0 0 80px rgba(251,191,36,0.12), inset 0 0 80px rgba(251,191,36,0.05);
        }

        /* ── Shimmer overlay for gold frame ── */
        .gold-shimmer {
          position: absolute;
          inset: 0;
          border-radius: 32px;
          overflow: hidden;
          pointer-events: none;
          z-index: 0;
        }
        .gold-shimmer::after {
          content: "";
          position: absolute;
          inset: -40%;
          background-image: linear-gradient(
            120deg,
            rgba(253,230,138,0) 0%,
            rgba(253,230,138,0.06) 40%,
            rgba(250,204,21,0.12) 50%,
            rgba(253,230,138,0.06) 60%,
            rgba(253,230,138,0) 100%
          );
          mix-blend-mode: screen;
          opacity: 0.6;
          transform: translateX(-60%);
          animation: shimmer-slow 6s ease-in-out infinite;
        }
        @keyframes shimmer-slow {
          0% { transform: translateX(-60%); }
          50% { transform: translateX(40%); }
          100% { transform: translateX(120%); }
        }

        .gold-frame > * { position: relative; z-index: 1; }

        /* ── Section dividers ── */
        .section-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 20px 0 16px;
        }
        .section-divider .line {
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(251,191,36,0.2), transparent);
        }
        .section-divider .label {
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(251,191,36,0.4);
          white-space: nowrap;
        }

        /* ── Mission section ── */
        .mission-text {
          font-size: 13px;
          line-height: 1.7;
          color: #cbd5e1;
          margin-bottom: 12px;
        }
        .mission-text strong {
          color: #fbbf24;
          font-weight: 600;
        }
        .mission-signoff {
          margin-top: 12px;
          font-size: 13px;
          font-style: italic;
          color: #93c5fd;
        }

        /* ── Tier cards ── */
        .tier-card {
          border-radius: 16px;
          padding: 16px 18px;
          transition: all 0.25s ease;
          cursor: pointer;
          position: relative;
        }
        .tier-card.hero {
          border: 1.5px solid rgba(251,191,36,0.5);
          background: linear-gradient(135deg, rgba(251,191,36,0.12), rgba(251,191,36,0.04));
        }
        .tier-card.hero:hover {
          border-color: rgba(251,191,36,0.8);
          background: linear-gradient(135deg, rgba(251,191,36,0.18), rgba(251,191,36,0.06));
          box-shadow: 0 0 40px rgba(251,191,36,0.08);
        }
        .tier-card.base {
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.02);
        }
        .tier-card.base:hover {
          border-color: rgba(255,255,255,0.2);
          background: rgba(255,255,255,0.04);
        }
        .best-badge {
          position: absolute;
          top: -10px;
          left: 16px;
          border-radius: 9999px;
          border: 1px solid rgba(251,191,36,0.4);
          background: #050816;
          padding: 2px 14px;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #fbbf24;
        }

        /* ── Bundle placeholder ── */
        .bundle-spot {
          margin: 14px 0 8px;
          padding: 12px 16px;
          border-radius: 14px;
          border: 1.5px dashed rgba(251,191,36,0.25);
          background: rgba(251,191,36,0.04);
          text-align: center;
          transition: all 0.25s ease;
        }
        .bundle-spot:hover {
          border-color: rgba(251,191,36,0.4);
          background: rgba(251,191,36,0.07);
        }
        .bundle-spot .label {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(251,191,36,0.5);
        }
        .bundle-spot .coming {
          font-size: 12px;
          color: #64748b;
          margin-top: 4px;
        }

        /* ── Founder notice spot ── */
        .founder-spot {
          margin-top: 16px;
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid rgba(147,197,253,0.15);
          background: rgba(147,197,253,0.04);
          text-align: center;
        }
        .founder-spot .label {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(147,197,253,0.5);
        }
        .founder-spot .coming {
          font-size: 12px;
          color: #64748b;
          margin-top: 4px;
        }

        @keyframes swipeCuePulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; text-shadow: 0 0 14px rgba(255,255,255,0.55); }
        }
        @keyframes swipeCueNudge {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(-4px); }
        }
        .swipe-cue { animation: swipeCuePulse 2.1s ease-in-out infinite; background: transparent; border: none; cursor: pointer; }
        .swipe-cue svg { animation: swipeCueNudge 2.1s ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .swipe-cue, .swipe-cue svg,
          .gold-shimmer::after { animation: none !important; }
          .gold-frame:hover { border-color: rgba(251,191,36,0.3); }
        }
      `}</style>

      {/* ── Starfield backdrop (stars + shooting stars only) ── */}
      <StarfieldBackground />

      <div className="relative z-10 mx-auto w-full max-w-[430px] flex flex-col px-4 pt-14">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex flex-col top-section"
        >
          {/* ── Swipe cue ── */}
          <button
            type="button"
            onClick={() => onSwipeRight?.()}
            className="swipe-cue tap-fix mx-auto mt-1 mb-4 flex items-center justify-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-white/85"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Swipe Right to Go Back
          </button>

          {/* ── GOLD FRAME ── */}
          <div className="gold-frame">
            <div className="gold-shimmer" aria-hidden="true" />

            {/* ── TOP: Mission ── */}
            <div>
              <button
                type="button"
                onClick={() => setShowMission(!showMission)}
                className="flex items-center justify-between w-full text-left group"
              >
                <h2 className="text-[15px] font-semibold text-amber-200 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-300/70" />
                  Why AstroProXL Exists
                </h2>
                <ChevronDown
                  className={`h-4 w-4 text-amber-300/50 transition-transform duration-300 ${
                    showMission ? "rotate-180" : ""
                  }`}
                />
              </button>

              {showMission && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="mt-4 space-y-3"
                >
                  <p className="mission-text">
                    Most people look for a reading when they're going through something hard —
                    a heartbreak, a money fear, a crossroads they can't see past. That's exactly
                    when clarity matters most, and exactly when it's usually least affordable.
                  </p>
                  <p className="mission-text">
                    Readings elsewhere run $60 to $120, often from someone working off intuition
                    alone — and even the most well-meaning human carries bias they may not notice.
                  </p>
                  <p className="mission-text">
                    <strong>AstroProXL</strong> is different: a full calculation of your actual chart —
                    placements, transits, timing — with no agenda and no guesswork, at a price
                    that doesn't add to your stress. Affordable, honest clarity, for the moments
                    you need it most.
                  </p>
                  <p className="mission-signoff">— Jáneel, Founder &amp; The AstroProXL Team</p>
                </motion.div>
              )}
            </div>

            {/* ── Divider ── */}
            <div className="section-divider">
              <span className="line" />
              <span className="label">More Readings, Real Savings</span>
              <span className="line" />
            </div>

            {/* ── BOTTOM: Offer ── */}
            <div>
              {/* ── Perks ── */}
              <div className="space-y-1.5 mb-4">
                {PERKS.map((perk) => (
                  <div key={perk} className="flex items-center gap-2.5">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-[9px] text-amber-300">✓</span>
                    <span className="text-[12px] text-slate-300">{perk}</span>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-amber-300/60 mb-4">
                Less than two single readings a month.
              </p>

              {/* ── Tier cards ── */}
              <div className="space-y-3">
                {(["sub_plus", "sub_base"] as const).map((tierKey) => {
                  const t = SUB_TIERS[tierKey];
                  const isHero = tierKey === "sub_plus";
                  return (
                    <div
                      key={tierKey}
                      className={cn("tier-card", isHero ? "hero" : "base")}
                    >
                      {isHero && <span className="best-badge">Best Value</span>}
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
                              ? "bg-amber-300 text-[#050816] hover:bg-amber-200 disabled:opacity-50"
                              : "border border-white/20 text-white hover:bg-white/5 disabled:opacity-50"
                          )}
                        >
                          {isSubscribeLoading ? "..." : "Subscribe"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Bundle spot ── */}
              <div className="bundle-spot">
                <p className="label">🎁 Bundle Pack — Coming Soon</p>
                <p className="coming">Save even more with a 6-month or 12-month plan</p>
              </div>

              {/* ── Founder notice spot ── */}
              <div className="founder-spot">
                <p className="label">✨ Founder's Notice</p>
                <p className="coming">Coming soon — a special offer for early supporters</p>
              </div>

              {/* ── Footer ── */}
              <p className="mt-3 text-center text-[10px] text-slate-500">Cancel anytime</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}