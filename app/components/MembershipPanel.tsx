"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUB_TIERS } from "@/lib/paywallConfig";

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

const CARD_TITLES = ["Choose Your Access"];

export default function MembershipPanel({ userStatus, onSwipeRight }: MembershipPanelProps) {
  const [isSubscribeLoading, setIsSubscribeLoading] = useState(false);
  const [isCarouselOpen, setIsCarouselOpen] = useState(true); // Start open
  const [showMission, setShowMission] = useState(false);
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

  const renderCardContent = () => (
    <div className="space-y-4 flex-1">
      <div>
        <h3 className="text-[15px] font-semibold leading-snug text-white">
          {userStatus?.isSubscribed ? "You're Subscribed! 🎉" : "More Clarity. No Waiting."}
        </h3>
        {!userStatus?.isSubscribed && (
          <p className="mt-1.5 text-[12px] leading-5 text-slate-400">
            Monthly access to deeper readings, JXL follow-ups, and no cooldowns.
          </p>
        )}
      </div>
      {!userStatus?.isSubscribed ? (
        <>
          <div className="space-y-2">
            {PERKS.map((perk) => (
              <div key={perk} className="flex items-center gap-2.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-[9px] text-amber-300">✓</span>
                <span className="text-[12px] text-slate-300">{perk}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-amber-300/60">Less than two single readings a month.</p>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-4 flex-1">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">
            <Sparkles className="h-6 w-6" />
          </div>
          <p className="mt-3 text-center text-sm text-slate-300">You have full access to all features.</p>
          <p className="text-center text-xs text-slate-500 mt-1">Enjoy your Unlimited Access.</p>
        </div>
      )}
    </div>
  );

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

        @keyframes jxlAmberPulse {
          0%, 100% { box-shadow: 0 0 0 1px rgba(245,158,11,0.26), 0 14px 28px rgba(0,0,0,0.64), 0 0 22px rgba(245,158,11,0.10); }
          50% { box-shadow: 0 0 0 1px rgba(251,191,36,0.46), 0 16px 32px rgba(0,0,0,0.72), 0 0 32px rgba(251,191,36,0.18); }
        }
        @keyframes jxlShimmer {
          0% { transform: translateX(-60%); }
          50% { transform: translateX(40%); }
          100% { transform: translateX(120%); }
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

        .carousel-container {
          position: relative;
          overflow: hidden;
          border-radius: 24px;
          border: 1px solid rgba(251,191,36,0.2);
          background: linear-gradient(180deg, rgba(251,191,36,0.06), rgba(251,191,36,0.02));
          animation: jxlAmberPulse 2.8s ease-in-out infinite;
        }
        .carousel-container::before {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 16% 18%, rgba(255,255,255,0.06), transparent 26%),
                      radial-gradient(circle at 80% 12%, rgba(251,191,36,0.12), transparent 24%);
          pointer-events: none;
          z-index: 0;
        }
        .carousel-container::after {
          content: "";
          position: absolute;
          inset: -40%;
          background-image: linear-gradient(120deg, rgba(253,230,138,0) 0%, rgba(253,230,138,0.12) 40%, rgba(250,204,21,0.3) 50%, rgba(253,230,138,0.12) 60%, rgba(253,230,138,0) 100%);
          mix-blend-mode: screen;
          pointer-events: none;
          opacity: 0.55;
          transform: translateX(-60%);
          animation: jxlShimmer 5s linear infinite;
          z-index: 0;
        }
        .carousel-container > * { position: relative; z-index: 1; }

        .carousel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          cursor: pointer;
          transition: background 0.15s ease;
          width: 100%;
          text-align: left;
          background: transparent;
          border: none;
          color: inherit;
          font: inherit;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }
        .carousel-header:hover { background: rgba(255,255,255,0.02); }
        .carousel-content {
          border-top: 1px solid rgba(251,191,36,0.1);
          padding: 0;
          display: flex;
          flex-direction: column;
        }

        /* ── Mission section ── */
        .mission-section {
          margin: 12px auto 20px;
          max-width: 420px;
          padding: 0 20px;
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
        .mission-chevron {
          transition: transform 250ms ease;
        }
        .mission-chevron.open {
          transform: rotate(180deg);
        }
        .mission-body {
          margin-top: 12px;
          animation: mission-fade 300ms ease;
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
          .swipe-cue, .swipe-cue svg,
          .carousel-container::after,
          .carousel-container { animation: none !important; }
        }
      `}</style>

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
            className="swipe-cue tap-fix mx-auto mt-1 mb-5 flex items-center justify-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-white/85"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Swipe Right to Go Back
          </button>

          <div className="mt-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-600">Membership</span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>

          {/* ── CAROUSEL ── */}
          <div className="mt-4">
            <div className="carousel-container">
              <button type="button" onClick={() => setIsCarouselOpen(!isCarouselOpen)} className="carousel-header" aria-expanded={isCarouselOpen}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/10 text-amber-200">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-[15px] font-semibold text-amber-200">Choose Your Access</h2>
                    <p className="text-[11px] text-slate-400">More readings, more follow-up, no waiting</p>
                  </div>
                </div>
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-300/20 bg-black/20 text-amber-300/70 transition-transform duration-200", isCarouselOpen && "rotate-180")}>
                  <ChevronRight className="h-4 w-4" />
                </div>
              </button>

              {isCarouselOpen && (
                <div className="carousel-content">
                  <div className="relative w-full min-h-[220px] bg-black/20 p-6 flex flex-col">
                    <h3 className="text-sm font-semibold text-amber-200 mb-3">{CARD_TITLES[0]}</h3>
                    <div className="flex-1">{renderCardContent()}</div>
                  </div>
                  {!userStatus?.isSubscribed && (
                    <div className="p-4 pt-3 border-t border-amber-300/10">
                      <div className="grid grid-cols-2 gap-2">
                        {(["sub_base", "sub_plus"] as const).map((tierKey) => {
                          const t = SUB_TIERS[tierKey];
                          const isHero = tierKey === "sub_plus";
                          return (
                            <button
                              key={tierKey}
                              type="button"
                              disabled={isSubscribeLoading}
                              onClick={() => handleSubscribe(tierKey)}
                              className={cn(
                                "relative flex flex-col items-center rounded-xl border px-3 py-3 text-center transition disabled:opacity-60",
                                isHero
                                  ? "border-amber-300/60 bg-amber-300/20 hover:bg-amber-300/30"
                                  : "border-amber-300/25 bg-amber-300/[0.06] hover:bg-amber-300/15"
                              )}
                            >
                              {isHero && (
                                <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-300/50 bg-[#050816] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-300">
                                  Best Value
                                </span>
                              )}
                              <span className={cn("text-[16px] font-bold", isHero ? "text-amber-100" : "text-amber-200")}>
                                {t.displayPrice}
                              </span>
                              <span className="mt-1 text-[11px] leading-4 text-slate-200">
                                {t.readings} readings + {t.jxl} JXL
                              </span>
                              <span className="text-[10px] text-slate-500">every month</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-3 text-center text-[11px] font-medium text-amber-300/90">
                        Double the access for only $4 more
                      </p>
                      <p className="mt-1 text-center text-[10px] text-slate-500">Cancel anytime</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Mission section ── */}
          <div className="mission-section">
            <button
              type="button"
              className="mission-toggle tap-fix"
              data-no-swipe
              onClick={() => setShowMission((v) => !v)}
            >
              Why AstroProXL exists
              <ChevronDown
                className={`mission-chevron ${showMission ? "open" : ""}`}
                size={14}
              />
            </button>

            {showMission && (
              <div className="mission-body">
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
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}