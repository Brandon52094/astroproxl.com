"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, ChevronDown, Gift } from "lucide-react";
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
  const [isBundleLoading, setIsBundleLoading] = useState(false);
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

  const handleBundle = async () => {
    setIsBundleLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/reading/intake`,
          mode: "payment",
          bundleTier: "bundle_3",
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      // silent
    } finally {
      setIsBundleLoading(false);
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
      className="relative h-screen w-full overflow-hidden text-slate-100"
      style={{
        background:
          "radial-gradient(55% 40% at 18% 12%, rgba(56,60,140,0.20), transparent 60%)," +
          "radial-gradient(50% 40% at 85% 82%, rgba(120,50,120,0.16), transparent 60%)," +
          "radial-gradient(45% 35% at 70% 30%, rgba(40,90,140,0.14), transparent 60%)," +
          "linear-gradient(180deg, #061120 0%, #050816 44%, #040611 100%)",
      }}
    >
      <style jsx>{`
        .tap-fix { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }

        /* ── Safe-area aware inset so the frame clears notch + home bar ── */
        .frame-inset {
          padding-top: calc(env(safe-area-inset-top, 0px) + 10px);
          padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 10px);
          padding-left: calc(env(safe-area-inset-left, 0px) + 10px);
          padding-right: calc(env(safe-area-inset-right, 0px) + 10px);
        }

        /* ── Gold outline frame (liquid glass, phone edge) ── */
        .gold-frame {
          position: relative;
          flex: 1;
          display: flex;
          flex-direction: column;
          border: 2px solid rgba(251,191,36,0.75);
          border-radius: 40px;
          background:
            linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.015) 45%, rgba(255,255,255,0.04)),
            rgba(7,10,22,0.55);
          backdrop-filter: blur(16px) saturate(165%) brightness(1.06);
          -webkit-backdrop-filter: blur(16px) saturate(165%) brightness(1.06);
          box-shadow:
            0 0 24px rgba(251,191,36,0.22),
            0 0 70px rgba(251,191,36,0.10),
            inset 0 1px 0 rgba(255,255,255,0.20),
            inset 0 0 40px rgba(255,255,255,0.03);
          padding: 24px 20px 28px;
          transition: border-color 0.4s ease, box-shadow 0.4s ease;
          overflow-y: auto;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: none;
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .gold-frame::-webkit-scrollbar { display: none; width: 0; height: 0; }
        .gold-frame:hover {
          border-color: rgba(251,191,36,0.9);
          box-shadow:
            0 0 32px rgba(251,191,36,0.30),
            0 0 80px rgba(251,191,36,0.14),
            inset 0 1px 0 rgba(255,255,255,0.24),
            inset 0 0 60px rgba(255,255,255,0.04);
        }
        .gold-frame > * { position: relative; z-index: 1; }

        .gold-shimmer {
          position: absolute;
          inset: 0;
          border-radius: 40px;
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

        /* ── Section dividers ── */
        .section-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 22px 0 14px;
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

        /* ── Offer heading ── */
        .offer-heading {
          font-size: 17px;
          font-weight: 700;
          text-align: center;
          color: #fef3c7;
          letter-spacing: 0.01em;
          margin-bottom: 14px;
        }

        /* ── Perks ── */
        .perk-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 3px 0;
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

        /* ── Tier cards ── */
        .tier-card {
          border-radius: 16px;
          padding: 18px 12px 16px;
          transition: all 0.25s ease;
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
          left: 50%;
          transform: translateX(-50%);
          border-radius: 9999px;
          border: 1px solid rgba(251,191,36,0.4);
          background: #050816;
          padding: 2px 12px;
          font-size: 8px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #fbbf24;
          white-space: nowrap;
        }

        /* ── 3-for-10 bundle ── */
        .bundle-offer {
          width: 100%;
          margin: 16px 0 4px;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1.5px solid rgba(251,191,36,0.35);
          background: linear-gradient(135deg, rgba(251,191,36,0.10), rgba(251,191,36,0.03));
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          cursor: pointer;
          transition: all 0.25s ease;
        }
        .bundle-offer:hover {
          border-color: rgba(251,191,36,0.6);
          background: linear-gradient(135deg, rgba(251,191,36,0.16), rgba(251,191,36,0.05));
          box-shadow: 0 0 40px rgba(251,191,36,0.08);
        }
        .bundle-offer:disabled { opacity: 0.5; cursor: default; }
        .bundle-offer .bundle-title {
          font-size: 15px;
          font-weight: 700;
          color: #fde68a;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .bundle-offer .bundle-sub {
          font-size: 11px;
          color: #94a3b8;
        }

        .cancel-anytime {
          text-align: center;
          font-size: 10px;
          color: #475569;
          margin-top: 14px;
          letter-spacing: 0.05em;
        }

        @media (prefers-reduced-motion: reduce) {
          .gold-shimmer::after { animation: none !important; }
        }
      `}</style>

      {/* ── Starfield / galaxy backdrop ── */}
      <StarfieldBackground />

      {/* ── Phone-edge frame (safe-area inset so it clears the status bar) ── */}
      <div className="frame-inset relative z-10 mx-auto flex h-full w-full max-w-[430px]">
        <motion.div
          className="gold-frame"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="gold-shimmer" aria-hidden="true" />

          {/* ── TOP: Membership offer ── */}
          <div>
            {/* ── Section heading ── */}
            <h3 className="offer-heading">More Readings, Real Savings</h3>

            {/* ── Perks ── */}
            <div className="space-y-1 mb-4">
              {PERKS.map((perk) => (
                <div key={perk} className="perk-item">
                  <span className="perk-check">✓</span>
                  <span className="perk-text">{perk}</span>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-amber-300/50 mb-4 text-center">
              Less than two single readings a month.
            </p>

            {/* ── Tier cards (side by side) ── */}
            <div className="grid grid-cols-2 gap-3 items-stretch">
              {(["sub_base", "sub_plus"] as const).map((tierKey) => {
                const t = SUB_TIERS[tierKey];
                const isHero = tierKey === "sub_plus";
                return (
                  <div
                    key={tierKey}
                    className={cn("tier-card", isHero ? "hero" : "base")}
                  >
                    {isHero && <span className="best-badge">Best Value</span>}
                    <div className="flex flex-col items-center text-center gap-1">
                      <p className="text-[24px] font-bold text-white leading-none">{t.displayPrice}</p>
                      <p className="text-[12px] text-slate-300 leading-tight">
                        {t.readings} readings + {t.jxl} JXL
                      </p>
                      <p className="text-[10px] text-slate-500 mb-2">every month</p>
                      <button
                        type="button"
                        onClick={() => handleSubscribe(tierKey)}
                        disabled={isSubscribeLoading}
                        className={cn(
                          "w-full px-3 py-2 rounded-full text-[13px] font-semibold transition",
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

            {/* ── 3-for-10 one-time bundle ── */}
            <button
              type="button"
              onClick={handleBundle}
              disabled={isBundleLoading}
              className="bundle-offer tap-fix"
            >
              <span className="bundle-title">
                <Gift className="h-4 w-4 text-amber-300/80" />
                {isBundleLoading ? "..." : "3 Readings for $10"}
              </span>
              <span className="bundle-sub">One-time bundle — no subscription</span>
            </button>

            <p className="cancel-anytime">Cancel anytime</p>
          </div>

          {/* ── Divider ── */}
          <div className="section-divider">
            <span className="line" />
            <span className="label">Our Mission</span>
            <span className="line" />
          </div>

          {/* ── BOTTOM: Why AstroProXL ── */}
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
        </motion.div>
      </div>
    </div>
  );
}