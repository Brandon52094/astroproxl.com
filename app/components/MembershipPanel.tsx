"use client";

import React from "react";
import { motion } from "framer-motion";
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

export default function MembershipPanel({ userStatus, onSwipeRight }: MembershipPanelProps) {
  const isSubscribed = userStatus?.isSubscribed || false;

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
              <span className="text-4xl">✨</span>
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
      className="relative min-h-screen h-full w-full overflow-hidden text-slate-100 flex items-center justify-center"
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

        /* ── Safe-area aware inset ── */
        .frame-inset {
          padding-top: calc(env(safe-area-inset-top, 0px) + 16px);
          padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
          padding-left: calc(env(safe-area-inset-left, 0px) + 16px);
          padding-right: calc(env(safe-area-inset-right, 0px) + 16px);
        }

        /* ── Gold outline frame (liquid glass) ── */
        .gold-frame {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 100%;
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
          padding: 28px 20px;
          transition: border-color 0.4s ease, box-shadow 0.4s ease;
          max-height: 100%;
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

        /* ── Mission section ── */
        .mission-heading {
          font-size: 24px;
          font-weight: 700;
          text-align: center;
          color: #fef3c7;
          letter-spacing: 0.01em;
          margin-bottom: 20px;
        }

        .mission-text {
          font-size: 14px;
          line-height: 1.8;
          color: #cbd5e1;
          max-width: 340px;
          margin-left: auto;
          margin-right: auto;
        }
        .mission-text strong {
          color: #fbbf24;
          font-weight: 600;
        }
        .mission-text em {
          color: #93c5fd;
          font-style: italic;
        }
        .mission-signoff {
          margin-top: 16px;
          font-size: 14px;
          font-style: italic;
          color: #93c5fd;
          text-align: center;
        }

        @media (prefers-reduced-motion: reduce) {
          .gold-frame:hover { border-color: rgba(251,191,36,0.75); }
        }
      `}</style>

      {/* ── Starfield background ── */}
      <StarfieldBackground />

      {/* ── Outer alignment wrapper ── */}
      <div className="frame-inset relative z-10 flex h-full w-full items-center justify-center max-w-[430px]">
        <motion.div
          className="gold-frame my-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          {/* ── Mission Statement ── */}
          <div className="text-center px-2 my-auto">
            <h3 className="mission-heading">Our Mission</h3>

            <div className="space-y-4">
              <p className="mission-text">
                Most people look to the stars when life hits a wall—a heartbreak, a financial
                crossroads, or a decision that feels too heavy to make alone.
              </p>
              <p className="mission-text">
                That&apos;s when clarity matters most, yet traditional readings often run $60 to
                $120+, relying solely on human intuition—and human bias.
              </p>
              <p className="mission-text">
                <strong>AstroProXL</strong> is built differently.
              </p>
              <p className="mission-text">
                Beyond basic birth charts, we analyze your exact placements, transits, and
                mathematical orbs through up to <strong>15 distinct calculations</strong> per
                reading. The result? Unmatched astronomical precision, total objectivity, and
                deep clarity—delivered at a price that never adds to your stress.
              </p>
              <p className="mission-text">
                High-level insight shouldn&apos;t be a luxury. It should be there when you need it most.
              </p>
              <p className="mission-signoff">— Janeel, Founder of AstroProXL</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}