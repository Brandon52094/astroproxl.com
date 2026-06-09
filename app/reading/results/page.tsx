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
  const [loaded, setLoaded] = useState(false);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [unlockedByPayment, setUnlockedByPayment] = useState(false);
  const [paywallConfig, setPaywallConfig] = useState<PaywallConfig | null>(null);
  const [readingCompleteRecorded, setReadingCompleteRecorded] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  const intake = loadIntake();

  const fetchCredits = useCallback(async () => {
    try {
      const response = await fetch("/api/user/credits");
      const data: Credits = await response.json();
      setCredits(data);
      const paywallsCompleted = data.paywallsCompleted ?? 0;
      if (!data.isSubscribed) {
        setPaywallConfig(getPaywallConfig(paywallsCompleted));
      }
    } catch { /* silent */ }
  }, []);

  const recordReadingComplete = useCallback(async () => {
    if (readingCompleteRecorded) return;
    setReadingCompleteRecorded(true);
    try {
      await fetch("/api/user/reading-complete", { method: "POST" });
      await fetchCredits();
    } catch { /* silent */ }
  }, [readingCompleteRecorded, fetchCredits]);

  // Runs exactly once on mount
  useEffect(() => {
    const stored = loadReading();
    if (!stored) { router.push("/reading/intake"); return; }
    setReading(stored);
    setLoaded(true);

    const returningFromPayment = consumePaymentReturnFlag();
    if (returningFromPayment) {
      setUnlockedByPayment(true);
    }
    if (searchParams.get("payment")) {
      window.history.replaceState({}, "", "/reading/results");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchCredits(); }, [fetchCredits]);
  useEffect(() => { if (unlockedByPayment) fetchCredits(); }, [unlockedByPayment, fetchCredits]);

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
    if (data.url) window.location.href = data.url;
    else throw new Error("No checkout URL returned");
  };

  const handleFinish = async () => {
    setIsFinishing(true);
    await recordReadingComplete();
    clearReading();
    router.push("/reading/intake");
  };

  const handleDismiss = async () => {
    await recordReadingComplete();
    clearReading();
    router.push("/reading/intake");
  };

  const isSubscribed = credits?.isSubscribed ?? false;

  // Payment is gated at intake — results page always shows the full reading
  const showPaywall = false;

  if (!loaded || !reading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#050816]">
        <div className="h-2 w-2 animate-pulse rounded-full bg-teal-300" />
      </div>
    );
  }

  const page = reading.pages[0];
  const page4 = reading.pages[0]; // for paywall teaser

  return (
    <div className="flex h-screen justify-center bg-[#050816] overflow-hidden">
      <div
        id="results-scroll"
        className="flex w-full max-w-[430px] flex-col overflow-y-auto px-4 pb-32 pt-4"
      >
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
            <p className="mt-1 text-xs text-slate-400">Your Reading</p>
          </div>
          <div className="w-11" />
        </header>

        {unlockedByPayment && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-[18px] border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-[12px] text-emerald-200"
          >
            ✓ Payment successful — your reading is unlocked
          </motion.div>
        )}

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
              readingTitle={page4?.title ?? "Your Reading"}
              readingTeaser={page4?.content ?? ""}
              onCheckout={handleCheckout}
              onDismiss={handleDismiss}
            />
          ) : (
            <motion.div
              key="reading"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col"
            >
              <div className="mb-6 space-y-2">
                <h1 className="text-2xl font-semibold leading-tight text-white">
                  {page?.title}
                </h1>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <p className="text-sm leading-7 text-slate-300 whitespace-pre-line">
                  {page?.content}
                </p>
              </div>

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
              onClick={handleFinish}
              disabled={isFinishing}
              className="h-14 w-full rounded-2xl bg-teal-300 text-sm font-semibold text-slate-950 shadow-lg shadow-teal-500/20 transition hover:bg-teal-200 disabled:opacity-60"
            >
              {isFinishing ? "Finishing…" : "Done"}
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
