"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadReading, loadIntake, clearReading } from "@/lib/chartStore";
import { getPaywallConfig } from "@/lib/paywallConfig";
import PaywallScreen from "@/app/components/PayWallScreen";
import type { StoredReading } from "@/lib/chartStore";
import type { PaywallConfig } from "@/lib/paywallConfig";

// ── Payment return flag ───────────────────────────────────────────────────────
// Written by the checkout handler before redirecting to Stripe.
// Read once on mount and immediately cleared so it never survives
// into a subsequent reading session.
const PAYMENT_FLAG_KEY = "dfp_payment_return";

function setPaymentReturnFlag() {
  if (typeof window === "undefined") return;
  localStorage.setItem(PAYMENT_FLAG_KEY, "1");
}

function consumePaymentReturnFlag(): boolean {
  if (typeof window === "undefined") return false;
  const exists = localStorage.getItem(PAYMENT_FLAG_KEY) === "1";
  localStorage.removeItem(PAYMENT_FLAG_KEY);
  return exists;
}

interface Credits {
  credits: number;
  firstReadingUsed: boolean;
  canStartReading: boolean;
  canUnlockPage4: boolean;
  paywallsCompleted?: number;
  isSubscribed?: boolean;
  readingsCompleted?: number;
  onCooldown?: boolean;
}

function ResultsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [reading, setReading] = useState<StoredReading | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [unlockedByPayment, setUnlockedByPayment] = useState(false);
  const [paywallConfig, setPaywallConfig] = useState<PaywallConfig | null>(null);
  const [readingCompleteRecorded, setReadingCompleteRecorded] = useState(false);

  const intake = loadIntake();

  // ── Fetch credit + paywall state ──────────────────────────────────────────
  const fetchCredits = useCallback(async () => {
    try {
      const response = await fetch("/api/user/credits");
      const data: Credits = await response.json();
      setCredits(data);

      const paywallsCompleted = data.paywallsCompleted ?? 0;
      if (!data.isSubscribed) {
        setPaywallConfig(getPaywallConfig(paywallsCompleted));
      }
    } catch {
      // silent
    }
  }, []);

  // ── Deduct credits for a page view ────────────────────────────────────────
  const deductCredit = useCallback(async (pageNumber: number) => {
    try {
      await fetch("/api/user/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageNumber }),
      });
      await fetchCredits();
    } catch {
      // silent
    }
  }, [fetchCredits]);

  // ── Record reading complete ───────────────────────────────────────────────
  // Only called when user leaves page 4, never on the way TO page 4.
  const recordReadingComplete = useCallback(async () => {
    if (readingCompleteRecorded) return;
    setReadingCompleteRecorded(true);
    try {
      await fetch("/api/user/reading-complete", { method: "POST" });
      await fetchCredits();
    } catch {
      // silent
    }
  }, [readingCompleteRecorded, fetchCredits]);

  // ── On mount: load reading + handle payment return ────────────────────────
  useEffect(() => {
    const stored = loadReading();
    if (!stored) {
      router.push("/reading/intake");
      return;
    }
    setReading(stored);
    setLoaded(true);

    // Consume the localStorage flag — not the URL param.
    // The flag is written by handleCheckout before redirecting to Stripe,
    // so it only exists for a genuine payment return, never for subsequent
    // client-side navigations back to this page.
    const returningFromPayment = consumePaymentReturnFlag();
    if (returningFromPayment) {
      setUnlockedByPayment(true);
      setCurrentPage(4);
    }

    // Always clean the URL regardless, so ?payment=success never lingers.
    if (searchParams.get("payment")) {
      window.history.replaceState({}, "", "/reading/results");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Empty deps: this must run exactly once on mount. router/searchParams
  // intentionally excluded — re-running on nav changes is what caused the bug.

  useEffect(() => { fetchCredits(); }, [fetchCredits]);

  useEffect(() => {
    if (unlockedByPayment) fetchCredits();
  }, [unlockedByPayment, fetchCredits]);

  // ── Checkout handler ──────────────────────────────────────────────────────
  // Sets the localStorage flag BEFORE redirecting so it's ready when Stripe
  // bounces the user back.
  const handleCheckout = async (mode: "one_time" | "subscription") => {
    if (!paywallConfig) return;

    setPaymentReturnFlag();

    const response = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        returnUrl: `${window.location.origin}/reading/results`,
        mode,
        paywallIndex: paywallConfig.paywallIndex,
      }),
    });

    const data = await response.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error("No checkout URL returned");
    }
  };

  // ── Page navigation + credit deduction ───────────────────────────────────
  const handleNext = async () => {
    if (currentPage < 4) {
      const nextPage = currentPage + 1;

      if (credits?.firstReadingUsed && !credits.isSubscribed) {
        await deductCredit(nextPage);
      }

      // recordReadingComplete intentionally NOT called here —
      // only fires when the user actually leaves page 4 below.
      setCurrentPage(nextPage);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      // User is on page 4 and clicks "Start Another Reading"
      await recordReadingComplete();
      clearReading();
      setCurrentPage(1);
      setUnlockedByPayment(false);
      setReadingCompleteRecorded(false);
      setCredits(null);
      setReading(null);
      setLoaded(false);
      router.push("/reading/intake");
    }
  };

  // ── Maybe Later — record complete then dismiss ────────────────────────────
  const handleDismiss = async () => {
    await recordReadingComplete();
    clearReading();
    router.push("/reading/intake");
  };

  // ── Derived state ─────────────────────────────────────────────────────────
  const isSubscribed = credits?.isSubscribed ?? false;
  const isPage4 = currentPage === 4;

  const showPaywall =
    isPage4 &&
    !unlockedByPayment &&
    !isSubscribed &&
    credits !== null &&
    !credits.canUnlockPage4;

  if (!loaded || !reading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#050816]">
        <div className="h-2 w-2 animate-pulse rounded-full bg-teal-300" />
      </div>
    );
  }

  const page = reading.pages.find((p) => p.pageNumber === currentPage);
  const page4 = reading.pages.find((p) => p.pageNumber === 4);
  const totalPages = 4;

  const getButtonLabel = () => {
    if (currentPage === 1) return "Continue to Page 2";
    if (currentPage === 2) return "Continue to Page 3";
    if (currentPage === 3) return "Continue to Final Insight";
    return "Start Another Reading";
  };

  return (
    <div className="flex min-h-screen justify-center bg-[#050816] text-slate-100">
      <div className="flex w-full max-w-[430px] flex-col px-4 pb-32 pt-4">

        {/* Header */}
        <header className="mb-6 flex items-center justify-between py-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300 transition hover:border-teal-300/30 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
              Direct Future Predictions
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Page {currentPage} of {totalPages}
            </p>
          </div>

          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-[11px] font-medium text-slate-400">
            4/4
          </div>
        </header>

        {/* Progress bar */}
        <div className="mb-6 flex gap-1.5">
          {Array.from({ length: totalPages }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                i + 1 <= currentPage ? "bg-teal-300" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        {/* Payment success banner */}
        {unlockedByPayment && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-[18px] border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-[12px] text-emerald-200"
          >
            ✓ Payment successful — your final insight is unlocked
          </motion.div>
        )}

        {/* Topic badge */}
        {intake && (
          <div className="mb-4 inline-flex rounded-full border border-teal-400/20 bg-teal-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-teal-200">
            {intake.area}
          </div>
        )}

        <AnimatePresence mode="wait">
          {showPaywall && paywallConfig ? (
            <PaywallScreen
              key="paywall"
              config={paywallConfig}
              readingTitle={page4?.title ?? "Your Deepest Prediction"}
              readingTeaser={page4?.content ?? ""}
              onCheckout={handleCheckout}
              onDismiss={handleDismiss}
            />
          ) : (
            <motion.div
              key={`page-${currentPage}`}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col"
            >
              <div className="mb-6 space-y-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-teal-200">
                  {currentPage === 4 ? "Final Insight" : `Page ${currentPage}`}
                </span>
                <h1 className="text-2xl font-semibold leading-tight text-white">
                  {page?.title}
                </h1>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <p className="text-sm leading-7 text-slate-300 whitespace-pre-line">
                  {page?.content}
                </p>
              </div>

              {currentPage === 3 && !credits?.firstReadingUsed && (
                <div className="mt-4 rounded-[20px] border border-amber-300/20 bg-amber-400/[0.06] px-4 py-3">
                  <p className="text-xs leading-5 text-amber-200">
                    One more page ahead — the deepest and most specific prediction in your reading.
                  </p>
                </div>
              )}

              {credits && credits.firstReadingUsed && credits.credits > 0 && (
                <div className="mt-4 flex items-center justify-end gap-1.5 text-[11px] text-slate-500">
                  <span>{credits.credits} credits remaining</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!showPaywall && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center border-t border-white/10 bg-[#050816]/90 px-4 pb-5 pt-3 backdrop-blur-xl">
          <div className="w-full max-w-[430px]">
            <button
              type="button"
              onClick={handleNext}
              className="h-14 w-full rounded-2xl bg-teal-300 text-sm font-semibold text-slate-950 shadow-lg shadow-teal-500/20 transition hover:bg-teal-200"
            >
              {getButtonLabel()}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-[#050816]">
          <div className="h-2 w-2 animate-pulse rounded-full bg-teal-300" />
        </div>
      }
    >
      <ResultsPageInner />
    </Suspense>
  );
}
