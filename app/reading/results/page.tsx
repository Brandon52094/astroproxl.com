"use client";

import React, { useEffect, useState, useCallback, useRef, Suspense, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Download, Send } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadReading, loadIntake, loadChart, clearReading } from "@/lib/chartStore";
import { getPaywallConfig } from "@/lib/paywallConfig";
import PaywallScreen from "@/app/components/PayWallScreen";
import type { StoredReading } from "@/lib/chartStore";
import type { PaywallConfig } from "@/lib/paywallConfig";

const PAYMENT_FLAG_KEY = "dfp_payment_return";
const DOWNLOAD_FLAG_KEY = "dfp_download_return";
const FOLLOWUP_FLAG_KEY = "dfp_followup_return";
const FOLLOWUP_QUESTION_KEY = "dfp_followup_question";

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

function setDownloadReturnFlag() {
  if (typeof window === "undefined") return;
  localStorage.setItem(DOWNLOAD_FLAG_KEY, "1");
}

function setFollowupReturnFlag(question: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(FOLLOWUP_FLAG_KEY, "1");
  localStorage.setItem(FOLLOWUP_QUESTION_KEY, question);
}

function consumeFollowupReturnFlag(): { isReturn: boolean; question: string } {
  if (typeof window === "undefined") return { isReturn: false, question: "" };
  const isReturn = localStorage.getItem(FOLLOWUP_FLAG_KEY) === "1";
  const question = localStorage.getItem(FOLLOWUP_QUESTION_KEY) ?? "";
  localStorage.removeItem(FOLLOWUP_FLAG_KEY);
  localStorage.removeItem(FOLLOWUP_QUESTION_KEY);
  return { isReturn, question };
}

// ── Parse content and pull out [[DATE: ...]] markers into simple yellow text ──
function renderContentWithDateBadges(content: string): React.ReactNode[] {
  const parts = content.split(/(\[\[DATE:[^\]]+\]\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[\[DATE:\s*(.+?)\]\]$/);
    if (match) {
      return (
        <span key={i} className="font-semibold text-amber-300">
          {match[1]}
        </span>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
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
  downloadUnlocked?: boolean;
  freeRepliesRemaining?: number;
}

interface FollowupEntry {
  question: string;
  title: string;
  content: string;
}

function ResultsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [reading, setReading] = useState<StoredReading | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [unlockedByPayment, setUnlockedByPayment] = useState(false);
  const [paywallConfig, setPaywallConfig] = useState<PaywallConfig | null>(null);
  const readingCompleteRecorded = useRef(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadPaymentReturn, setDownloadPaymentReturn] = useState(false);
  const [showSources, setShowSources] = useState(false);

  const [followupQuestion, setFollowupQuestion] = useState("");
  const [followupThread, setFollowupThread] = useState<FollowupEntry[]>([]);
  const [isGeneratingFollowup, setIsGeneratingFollowup] = useState(false);
  const [followupError, setFollowupError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
    if (readingCompleteRecorded.current) return;
    readingCompleteRecorded.current = true;
    try {
      await fetch("/api/user/reading-complete", { method: "POST" });
      await fetchCredits();
    } catch { /* silent */ }
  }, [fetchCredits]);

  const generateFollowup = useCallback(async (question: string, existingThread: FollowupEntry[]) => {
    const storedReading = loadReading();
    const chart = loadChart();
    if (!storedReading || !chart) return;

    setIsGeneratingFollowup(true);
    setFollowupError(null);

    const conversationHistory = existingThread.map(entry =>
      `Q: ${entry.question}\nA: ${entry.content}`
    ).join("\n\n");

    try {
      const response = await fetch("/api/readings/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          originalReading: storedReading.pages[0]?.content ?? "",
          originalTitle: storedReading.pages[0]?.title ?? "",
          topic: storedReading.topic,
          // ── Full chart payload ──
          tropical: chart.chartData.tropical,
          sidereal: chart.chartData.sidereal,
          transits: chart.chartData.transits,
          profection: chart.chartData.profection,
          progressions: chart.chartData.progressions,
          solarArcs: chart.chartData.solarArcs,
          upcomingTrigger: chart.chartData.upcomingTrigger,
          planetaryStations: chart.chartData.planetaryStations,
          solarReturn: chart.chartData.solarReturn,
          conversationHistory: conversationHistory || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.content) throw new Error(data.error ?? "Failed to generate response.");

      setFollowupThread(prev => [...prev, {
        question,
        title: data.title,
        content: data.content,
      }]);
      setFollowupQuestion("");

      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      setFollowupError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsGeneratingFollowup(false);
    }
  }, []);

  useEffect(() => {
    const paymentMode = searchParams.get("mode");
    const paymentStatus = searchParams.get("payment");
    const returningFromDownload = paymentMode === "reading_download" && paymentStatus === "success";
    const returningFromCancelledFollowup = paymentMode === "followup" && paymentStatus === "cancelled";
    const returningFromPayment = consumePaymentReturnFlag() || (paymentStatus === "success" && paymentMode !== "reading_download" && paymentMode !== "followup");
    const { isReturn: returningFromFollowup, question: savedQuestion } = consumeFollowupReturnFlag();

    if (returningFromCancelledFollowup) {
      localStorage.removeItem("dfp_followup_return");
      localStorage.removeItem("dfp_followup_question");
    }

    const stored = loadReading();

    if (!stored && !returningFromDownload && !returningFromCancelledFollowup) {
      router.push("/reading/intake");
      return;
    }

    if (stored) {
      setReading(stored);
      // Record completion the moment the reading loads — counts even if
      // the user backs out without tapping Done
      recordReadingComplete();
    }
    setLoaded(true);

    if (returningFromPayment) setUnlockedByPayment(true);
    if (returningFromDownload) setDownloadPaymentReturn(true);

    if (returningFromFollowup && savedQuestion && stored) {
      setFollowupQuestion(savedQuestion);
      generateFollowup(savedQuestion, []);
    }

    if (paymentStatus) window.history.replaceState({}, "", "/reading/results");
  }, [recordReadingComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchCredits(); }, [fetchCredits]);

  useEffect(() => {
    if (!unlockedByPayment) return;
    fetchCredits();
    setTimeout(() => fetchCredits(), 2000);
  }, [unlockedByPayment, fetchCredits]);

  useEffect(() => {
    if (!downloadPaymentReturn) return;
    let attempts = 0;
    const poll = async () => {
      try {
        const response = await fetch("/api/user/credits");
        const data: Credits = await response.json();
        setCredits(data);
        const paywallsCompleted = data.paywallsCompleted ?? 0;
        if (!data.isSubscribed) setPaywallConfig(getPaywallConfig(paywallsCompleted));
        attempts++;
        if (!data.downloadUnlocked && !data.isSubscribed && attempts < 10) {
          setTimeout(poll, 1500);
        }
      } catch { /* silent */ }
    };
    poll();
  }, [downloadPaymentReturn]);

  const handleFollowupSend = async () => {
    const question = followupQuestion.trim();
    if (!question) return;

    const isSubscribed = credits?.isSubscribed ?? false;
    const hasFreeRepliesRemaining = (credits?.freeRepliesRemaining ?? 0) > 0;

    if (isSubscribed && hasFreeRepliesRemaining) {
      await generateFollowup(question, followupThread);
      fetchCredits();
      return;
    }

    setFollowupReturnFlag(question);
    const response = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        returnUrl: `${window.location.origin}/reading/results`,
        mode: "followup",
      }),
    });
    const data = await response.json();
    if (data.url) window.location.href = data.url;
  };

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

  const handleDownload = async () => {
    const downloadUnlocked = credits?.downloadUnlocked ?? false;
    const isSubscribed = credits?.isSubscribed ?? false;

    if (!downloadUnlocked && !isSubscribed) {
      setDownloadReturnFlag();
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/reading/results`,
          mode: "reading_download",
        }),
      });
      const data = await response.json();
      if (data.url) window.location.href = data.url;
      return;
    }

    setIsDownloading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const maxWidth = pageWidth - margin * 2;

      doc.setFillColor(5, 8, 22);
      doc.rect(0, 0, pageWidth, 297, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("DIRECT FUTURE PREDICTIONS", pageWidth / 2, 18, { align: "center" });
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 170);
      doc.text("astroproxl.com", pageWidth / 2, 24, { align: "center" });

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      const titleLines = doc.splitTextToSize(page?.title ?? "Your Reading", maxWidth);
      doc.text(titleLines, margin, 38);

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(150, 150, 170);
      doc.text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), margin, 38 + titleLines.length * 7 + 4);

      doc.setDrawColor(50, 50, 70);
      doc.line(margin, 52, pageWidth - margin, 52);

      doc.setTextColor(200, 200, 215);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const cleanContent = (page?.content ?? "").replace(/\[\[DATE:\s*(.+?)\]\]/g, "$1");
      const contentLines = doc.splitTextToSize(cleanContent, maxWidth);
      let y = 60;
      for (const line of contentLines) {
        if (y > 275) {
          doc.addPage();
          doc.setFillColor(5, 8, 22);
          doc.rect(0, 0, pageWidth, 297, "F");
          y = 20;
        }
        doc.text(line, margin, y);
        y += 6;
      }

      doc.setFontSize(7);
      doc.setTextColor(80, 80, 100);
      doc.text("Generated by AstroProXL · astroproxl.com", pageWidth / 2, 290, { align: "center" });

      const pdfBlob = doc.output("blob");
      const blobUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = "astroproxl-reading.pdf";
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setIsDownloading(false);
    }
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
  const showPaywall = false;
  const hasThread = followupThread.length > 0;
  const freeRepliesRemaining = credits?.freeRepliesRemaining ?? 0;
  const sendButtonLabel = isSubscribed && freeRepliesRemaining > 0 ? "Send" : "Send — $2.00";
  const downloadGlowing = !!(credits?.downloadUnlocked || credits?.isSubscribed);

  if (!loaded) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#050816]">
        <div className="h-2 w-2 animate-pulse rounded-full bg-teal-300" />
      </div>
    );
  }

  const page = reading?.pages[0];
  const page4 = reading?.pages[0];
  const hasSources = page?.sources && page.sources.length > 0;

  return (
    <div className="flex h-screen justify-center bg-[#050816] overflow-hidden">
      <style jsx>{`
        @keyframes downloadPulse {
          0%, 100% {
            transform: scale(1);
            box-shadow:
              0 0 0 1px rgba(251, 191, 36, 0.4),
              0 0 16px rgba(251, 191, 36, 0.25),
              0 0 32px rgba(251, 191, 36, 0.12);
          }
          50% {
            transform: scale(1.06);
            box-shadow:
              0 0 0 2px rgba(251, 191, 36, 0.85),
              0 0 30px rgba(251, 191, 36, 0.6),
              0 0 60px rgba(251, 191, 36, 0.3);
          }
        }
        .download-pulse {
          animation: downloadPulse 1.6s ease-in-out infinite;
        }
        .date-badge {
          box-shadow: 0 0 12px rgba(251, 191, 36, 0.35), 0 0 4px rgba(251, 191, 36, 0.5);
        }
        @keyframes askMoreGlow {
          0%, 100% {
            box-shadow: 0 0 0 1px rgba(94, 234, 212, 0.12), 0 0 10px rgba(94, 234, 212, 0.06);
          }
          50% {
            box-shadow: 0 0 0 1px rgba(94, 234, 212, 0.3), 0 0 18px rgba(94, 234, 212, 0.14);
          }
        }
        .ask-more-glow {
          animation: askMoreGlow 3.2s ease-in-out infinite;
        }
        @keyframes followupLabelGlow {
          0%, 100% {
            text-shadow: 0 0 6px rgba(94, 234, 212, 0.3);
            opacity: 0.85;
          }
          50% {
            text-shadow: 0 0 14px rgba(94, 234, 212, 0.7), 0 0 24px rgba(94, 234, 212, 0.35);
            opacity: 1;
          }
        }
        .ask-followup-label {
          animation: followupLabelGlow 2.8s ease-in-out infinite;
        }
      `}</style>

      <div
        id="results-scroll"
        className="flex w-full max-w-[430px] flex-col overflow-y-auto px-4 pb-52 pt-4"
      >
        {/* Header */}
        <header className="mb-6 flex items-center justify-between py-2">
          <button
            type="button"
            onClick={() => router.push("/reading/intake")}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300 transition hover:border-teal-300/30 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Your Direct Insights</p>
            <p className="mt-1 text-xs text-slate-400">What We've Gathered</p>
            <p className="mt-0.5 text-xs font-medium text-amber-300/80"> You can download the synopsis</p>
          </div>
          <div className="w-11" />
        </header>

        {unlockedByPayment && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-[18px] border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-[12px] text-emerald-200"
          >
            ✓ Thanks for your support! — Lets get you your reading
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
              {/* Main reading */}
              <div className="mb-6 space-y-2">
                <h1 className="text-2xl font-semibold leading-tight text-white">{page?.title}</h1>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <p className="text-sm leading-7 text-slate-300 whitespace-pre-line">
                  {page?.content ? renderContentWithDateBadges(page.content) : null}
                </p>
              </div>

              {credits && credits.firstReadingUsed && credits.credits > 0 && (
                <div className="mt-4 flex items-center justify-end gap-1.5 text-[11px] text-slate-500">
                  <span>{credits.credits} credits remaining</span>
                </div>
              )}

              {/* ── Follow-up conversation thread ────────────────────────── */}
              <AnimatePresence>
                {followupThread.map((entry, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="mt-6"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <div className="h-px flex-1 bg-white/[0.06]" />
                      <span className="text-[10px] uppercase tracking-[0.2em] text-slate-600">
                        {index === 0 ? "Going deeper" : `Follow-up ${index + 1}`}
                      </span>
                      <div className="h-px flex-1 bg-white/[0.06]" />
                    </div>
                    <div className="mb-2 text-[11px] text-slate-500 italic">"{entry.question}"</div>
                    <h2 className="mb-3 text-lg font-semibold text-white">{entry.title}</h2>
                    <div className="rounded-[24px] border border-teal-300/20 bg-teal-400/[0.04] p-5">
                      <p className="text-sm leading-7 text-slate-300 whitespace-pre-line">
                        {renderContentWithDateBadges(entry.content)}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* ── Ask another question ─────────────────────────────────── */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: hasThread ? 0 : 0.3 }}
                className="mt-6"
              >
                {!hasThread && (
                  <>
                    <div className="mb-3 flex items-center gap-2">
                      <div className="h-px flex-1 bg-white/[0.06]" />
                      <span className="ask-followup-label text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-300">
                        Ask a Follow Up
                      </span>
                      <div className="h-px flex-1 bg-white/[0.06]" />
                    </div>
                    <p className="mb-3 text-[11px] text-slate-500">
                      Don't over think this. Just say what's on your mind.
                    </p>
                  </>
                )}
                {hasThread && (
                  <p className="mb-3 text-[12px] text-slate-500">
                    Still got more? Keep going.
                  </p>
                )}
                <textarea
                  value={followupQuestion}
                  onChange={(e) => setFollowupQuestion(e.target.value)}
                  placeholder={hasThread ? "Ask another question…" : "What do you want to understand better?"}
                  rows={3}
                  className={`w-full resize-none rounded-[20px] border bg-black/20 px-4 py-3 text-[14px] leading-6 text-white placeholder:text-slate-500 transition focus:outline-none focus:ring-1 focus:ring-teal-300 ${
                    followupQuestion.trim() ? "border-teal-300/40" : "border-white/10 ask-more-glow"
                  }`}
                />
                {followupError && (
                  <p className="mt-2 text-[12px] text-rose-300">{followupError}</p>
                )}

                {/* ── Astrological sources — centered below the follow-up box ── */}
                {hasSources && (
                  <div className="mt-4 flex flex-col items-center">
                    <button
                      type="button"
                      onClick={() => setShowSources((s) => !s)}
                      className="text-[11px] text-slate-500 underline transition hover:text-slate-400"
                    >
                      {showSources ? "Hide astrological sources" : "Show astrological sources"}
                    </button>
                    <AnimatePresence>
                      {showSources && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                          className="w-full overflow-hidden"
                        >
                          <div className="mt-3 space-y-2.5 rounded-[18px] border border-white/[0.06] bg-black/20 p-4">
                            {page!.sources!.map((src, i) => (
                              <div key={i} className="text-[11px] leading-5">
                                <span className="font-medium text-slate-500">{src.section}:</span>{" "}
                                <span className="text-slate-600">{src.placements}</span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>

              <div ref={bottomRef} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!showPaywall && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center border-t border-white/10 bg-[#050816]/90 px-4 pb-5 pt-3 backdrop-blur-xl">
          <div className="w-full max-w-[430px] space-y-2">

            <AnimatePresence>
              {followupQuestion.trim() && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  type="button"
                  onClick={handleFollowupSend}
                  disabled={isGeneratingFollowup}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-teal-300/30 bg-teal-400/[0.08] text-[13px] font-semibold text-teal-200 transition hover:bg-teal-400/[0.14] disabled:opacity-60"
                >
                  {isGeneratingFollowup ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-teal-300 border-t-transparent" />
                      Getting your answer…
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      {sendButtonLabel}
                    </>
                  )}
                </motion.button>
              )}
            </AnimatePresence>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border transition disabled:opacity-60
                  border-amber-300/50 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20
                  ${!isDownloading ? "download-pulse" : ""}
                `}
                title={downloadGlowing ? "Download PDF" : "Download PDF — $1.00"}
              >
                {isDownloading
                  ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
                  : <Download className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={handleFinish}
                disabled={isFinishing}
                className="h-14 flex-1 rounded-2xl bg-teal-300 text-sm font-semibold text-slate-950 shadow-lg shadow-teal-500/20 transition hover:bg-teal-200 disabled:opacity-60"
              >
                {isFinishing ? "Finishing…" : "Done"}
              </button>
            </div>
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