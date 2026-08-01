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
  const [showMission, setShowMission] = useState(true);
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
      className="relative h-screen w-full overflow-y-auto overscroll-none text-slate-100"
      style={{
        WebkitOverflowScrolling: "touch",
        background: "linear-gradient(180deg, #061120 0%, #050816 44%, #040611 100%)",
      }}
    >
      <style jsx>{`
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; width: 0; height: 0; }
        .tap-fix { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }

        /* ── Gold outline frame — full screen edge ── */
        .gold-frame {
          position: fixed;
          inset: 8px;
          border: 1.5px solid rgba(251,191,36,0.25);
          border-radius: 28px;
          pointer-events: none;
          z-index: 2;
          box-shadow: 0 0 60px rgba(251,191,36,0.04), inset 0 0 60px rgba(251,191,36,0.02);
          transition: border-color 0.6s ease, box-shadow 0.6s ease;
        }
        .gold-frame::before {
          content: "";
          position: absolute;
          inset: -2px;
          border-radius: 30px;
          padding: 2px;
          background: linear-gradient(135deg, rgba(251,191,36,0.08), rgba(251,191,36,0.02), rgba(251,191,36,0.08));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
        /* Subtle shimmer on the frame */
        .gold-frame::after {
          content: "";
          position: absolute;
          inset: -40%;
          background-image: linear-gradient(
            120deg,
            rgba(253,230,138,0) 0%,
            rgba(253,230,138,0.03) 40%,
            rgba(250,204,21,0.06) 50%,
            rgba(253,230,138,0.03) 60%,
            rgba(253,230,138,0) 100%
          );
          mix-blend-mode: screen;
          opacity: 0.4;
          transform: translateX(-60%);
          animation: shimmer-slow 8s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes shimmer-slow {
          0% { transform: translateX(-60%); }
          50% { transform: translateX(40%); }
          100% { transform: translateX(120%); }
        }

        /* ── Content container — uses full width with padding ── */
        .content {
          position: relative;
          z-index: 3;
          min-height: 100vh;
          padding: 60px 20px 40px;
          max-width: 480px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
        }

        /* ── Section divider ── */
        .section-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 16px 0 14px;
        }
        .section-divider .line {
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(251,191,36,0.15), transparent);
        }
        .section-divider .label {
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(251,191,36,0.35);
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
          position: relative;
        }
        .tier-card.hero {
          border: 1.5px solid rgba(251,191,36,0.4);
          background: linear-gradient(135deg, rgba(251,191,36,0.10), rgba(251,191,36,0.03));
        }
        .tier-card.hero:hover {
          border-color: rgba(251,191,36,0.7);
          background: linear-gradient(135deg, rgba(251,191,36,0.16), rgba(251,191,36,0.05));
          box-shadow: 0 0 40px rgba(251,191,36,0.06);
        }
        .tier-card.base {
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
        }
        .tier-card.base:hover {
          border-color: rgba(255,255,255,0.15);
          background: rgba(255,255,255,0.04);
        }
        .best-badge {
          position: absolute;
          top: -10px;
          left: 16px;
          border-radius: 9999px;
          border: 1px solid rgba(251,191,36,0.35);
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
          margin-top: 14px;
          padding: 12px 16px;
          border-radius: 14px;
          border: 1.5px dashed rgba(251,191,36,0.2);
          background: rgba(251,191,36,0.03);
          text-align: center;
          transition: all 0.25s ease;
        }
        .bundle-spot:hover {
          border-color: rgba(251,191,36,0.35);
          background: rgba(251,191,36,0.06);
        }
        .bundle-spot .label {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(251,191,36,0.45);
        }
        .bundle-spot .coming {
          font-size: 12px;
          color: #64748b;
          margin-top: 4px;
        }

        /* ── Founder notice ── */
        .founder-spot {
          margin-top: 14px;
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid rgba(147,197,253,0.12);
          background: rgba(147,197,253,0.03);
          text-align: center;
        }
        .founder-spot .label {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(147,197,253,0.4);
        }
        .founder-spot .coming {
          font-size: 12px;
          color: #64748b;
          margin-top: 4px;
        }

        /* ── Perks ── */
        .perk-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 4px 0;
        }
        .perk-check {
          display: flex;
          height: 18px;
          width: 18px;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          background: rgba(251,191,36,0.12);
          color: #fbbf24;
          font-size: 10px;
          font-weight: 700;
        }
        .perk-text {
          font-size: 13px;
          color: #cbd5e1;
        }

        /* ── Swipe cue ── */
        @keyframes swipeCuePulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.9; text-shadow: 0 0 14px rgba(255,255,255,0.3); }
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
          color: rgba(255,255,255,0.6);
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 8px 0;
          width: 100%;
        }
        .swipe-cue svg {
          animation: swipeCueNudge 2.1s ease-in-out infinite;
        }

        .mission-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          background: none;
          border: none;
          color: #fbbf24;
          font-size: 15px;
          font-weight: 600;
          padding: 4px 0 8px;
          cursor: pointer;
          text-align: left;
        }
        .mission-toggle svg {
          transition: transform 0.3s ease;
          color: rgba(251,191,36,0.5);
        }
        .mission-toggle svg.open {
          transform: rotate(180deg);
        }

        .cancel-anytime {
          text-align: center;
          font-size: 10px;
          color: #475569;
          margin-top: 14px;
          letter-spacing: 0.05em;
        }

        @media (prefers-reduced-motion: reduce) {
          .swipe-cue, .swipe-cue svg,
          .gold-frame::after { animation: none !important; }
        }
      `}</style>

      {/* ── Gold outline frame at screen edge ── */}
      <div className="gold-frame" aria-hidden="true" />

      {/* ── Starfield backdrop ── */}
      <StarfieldBackground />

      {/* ── Content ── */}
      <div className="content">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex flex-col flex-1"
        >
          {/* ── Swipe cue ── */}
          <button
            type="button"
            onClick={() => onSwipeRight?.()}
            className="swipe-cue tap-fix"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Swipe Right to Go Back
          </button>

          {/* ── TOP: Mission ── */}
          <div>
            <button
              type="button"
              onClick={() => setShowMission(!showMission)}
              className="mission-toggle tap-fix"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-300/60" />
                Why AstroProXL Exists
              </span>
              <ChevronDown className={`h-4 w-4 ${showMission ? "open" : ""}`} />
            </button>

            {showMission && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="mt-3 space-y-3"
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
          <div className="flex-1">
            {/* ── Perks ── */}
            <div className="space-y-1 mb-4">
              {PERKS.map((perk) => (
                <div key={perk} className="perk-item">
                  <span className="perk-check">✓</span>
                  <span className="perk-text">{perk}</span>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-amber-300/50 mb-4">
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
                            : "border border-white/15 text-white hover:bg-white/5 disabled:opacity-50"
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

            {/* ── Founder notice ── */}
            <div className="founder-spot">
              <p className="label">✨ Founder's Notice</p>
              <p className="coming">Coming soon — a special offer for early supporters</p>
            </div>

            {/* ── Cancel anytime ── */}
            <p className="cancel-anytime">Cancel anytime</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}