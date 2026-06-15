"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Heart,
  Briefcase,
  Wallet,
  Sparkles,
  RefreshCw,
  Lock,
  Timer,
} from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { saveIntake, loadChart, saveChart, isChartFresh, clearIntake, clearReading } from "@/lib/chartStore";

const AREAS = [
  {
    id: "love",
    title: "Love",
    description: "Relationships, romance, or emotional patterns",
    icon: Heart,
    placeholder:
      "Ask something specific about love, timing, or where this connection is headed.",
    cta: "Begin My Love Reading",
  },
  {
    id: "money",
    title: "Money",
    description: "Income, stability, opportunities, and financial timing",
    icon: Wallet,
    placeholder:
      "Ask something specific about money, stability, or the opportunities opening next.",
    cta: "Begin My Money Reading",
  },
  {
    id: "career",
    title: "Career",
    description: "Work, recognition, direction, and next steps",
    icon: Briefcase,
    placeholder:
      "Ask something specific about work, momentum, or the direction your career is moving.",
    cta: "Begin My Career Reading",
  },
  {
    id: "other",
    title: "What's Coming",
    description:
      "The next 30–45 days — timing, shifts, and what your chart says is moving toward you.",
    icon: Sparkles,
    placeholder:
      "Ask about timing, what's approaching, or what you should be ready for in the weeks ahead.",
    cta: "Begin My Reading",
  },
];

interface UserStatus {
  firstReadingUsed: boolean;
  paywallsCompleted: number;
  isSubscribed: boolean;
  readingsCompleted: number;
  onCooldown: boolean;
  cooldownExpiresAt: string | null;
  canBypass: boolean;
}

function formatTimeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "soon";
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

export default function ReadingIntakeScreen() {
  const router = useRouter();
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [isCreatingReading, setIsCreatingReading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [chartStatus, setChartStatus] = useState<
    "checking" | "ready" | "recalculating" | "error"
  >("checking");
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [isBypassLoading, setIsBypassLoading] = useState(false);

  useEffect(() => {
    async function ensureChart() {
      if (isChartFresh()) {
        setChartStatus("ready");
        return;
      }
      try {
        const response = await fetch("/api/user/get-chart");
        const data = await response.json();
        if (!data.chart) {
          router.push("/chart-data");
          return;
        }
        setChartStatus("recalculating");
        const calcResponse = await fetch("/api/chart-calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            birthDate: data.chart.birthDate,
            birthTime: data.chart.birthTime,
            birthPlace: data.chart.birthPlace,
            lat: data.chart.lat,
            lng: data.chart.lng,
            timezone: data.chart.timezone,
          }),
        });
        const calcData = await calcResponse.json();
        if (!calcResponse.ok || !calcData.success) {
          setChartStatus("error");
          return;
        }
        saveChart({
          birthDate: data.chart.birthDate,
          birthTime: data.chart.birthTime,
          birthPlace: data.chart.birthPlace,
          lat: data.chart.lat,
          lng: data.chart.lng,
          timezone: data.chart.timezone,
          chartData: calcData,
        });
        setChartStatus("ready");
      } catch {
        setChartStatus("error");
      }
    }
    ensureChart();
  }, [router]);

  const fetchInFlight = useRef(false);

  const fetchStatus = useCallback(async (): Promise<number> => {
    if (fetchInFlight.current) return 0;
    fetchInFlight.current = true;
    try {
      const response = await fetch("/api/user/credits");
      const data = await response.json();
      const rawPaywalls = Number(data.paywallsCompleted ?? 0);
      const activePaywallIndex = rawPaywalls >= 4 ? 0 : rawPaywalls;
      setUserStatus({
        firstReadingUsed: data.firstReadingUsed === true,
        paywallsCompleted: activePaywallIndex,
        isSubscribed: data.isSubscribed === true,
        readingsCompleted: Number(data.readingsCompleted ?? 0),
        onCooldown: data.onCooldown === true,
        cooldownExpiresAt: data.cooldownExpiresAt ?? null,
        canBypass: data.canBypass === true,
      });
      return activePaywallIndex;
    } catch {
      return 0;
    } finally {
      setTimeout(() => { fetchInFlight.current = false; }, 2000);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const initialPaywalls = await fetchStatus();
      if (initialPaywalls === 0) {
        let attempts = 0;
        const poll = async () => {
          const paywalls = await fetchStatus();
          attempts++;
          if (paywalls === 0 && attempts < 4) {
            setTimeout(poll, 3000);
          }
        };
        setTimeout(poll, 3000);
      }
    })();
  }, [fetchStatus]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchStatus();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchStatus]);

  const selectedAreaConfig = useMemo(() => {
    return AREAS.find((area) => area.id === selectedArea) ?? null;
  }, [selectedArea]);

  const buttonCopy = useMemo(() => {
    if (chartStatus === "recalculating") return "Loading your chart…";
    if (isCreatingReading) return "Preparing reading...";
    if (!selectedAreaConfig) return "Choose a reading type";
    if (userStatus?.firstReadingUsed && !userStatus?.isSubscribed) {
      const prices = ["$2.99", "$3.99", "$4.99", "$4.99"];
      const idx = Math.min((userStatus.paywallsCompleted ?? 0), 3);
      return `${selectedAreaConfig.cta} — ${prices[idx]}`;
    }
    return selectedAreaConfig.cta;
  }, [chartStatus, isCreatingReading, selectedAreaConfig, userStatus]);

  const canSubmit = useMemo(() => {
    if (!selectedArea) return false;
    if (chartStatus !== "ready") return false;
    if (userStatus?.onCooldown) return false;
    if (selectedArea === "other") return true;
    return question.trim().length > 0;
  }, [question, selectedArea, chartStatus, userStatus]);

  const handleStartReading = async () => {
    if (!canSubmit || !selectedArea) return;
    setIsCreatingReading(true);
    setSubmitError(null);
    try {
      clearIntake();
      clearReading();

      const topic =
        selectedArea === "love"
          ? "love"
          : selectedArea === "career"
            ? "career"
            : selectedArea === "money"
              ? "money"
              : "general";

      saveIntake({
        topic: topic as "love" | "career" | "money" | "general",
        area: selectedArea,
        question:
          selectedArea === "other"
            ? "What is coming for me in the next 30–45 days?"
            : question.trim(),
        timeframeType: "month",
        timeframeValue: "next-45-days",
      });

      if (userStatus?.firstReadingUsed && !userStatus?.isSubscribed) {
        const creditsRes = await fetch("/api/user/credits");
        const creditsData = await creditsRes.json();
        if (Number(creditsData.credits ?? 0) <= 0) {
          const paywallsCompleted = Number(creditsData.paywallsCompleted ?? 0);
          const paywallIndex = Math.min(paywallsCompleted + 1, 4);
          const checkoutRes = await fetch("/api/stripe/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              returnUrl: window.location.origin + "/reading/preparing",
              mode: "one_time",
              paywallIndex,
            }),
          });
          const checkoutData = await checkoutRes.json();
          if (checkoutData.url) {
            window.location.href = checkoutData.url;
            return;
          }
        }
      }

      router.push("/reading/preparing");
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Something went wrong"
      );
    } finally {
      setIsCreatingReading(false);
    }
  };

  const handleBypass = async () => {
    setIsBypassLoading(true);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/reading/intake`,
          mode: "bypass",
        }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // silent
    } finally {
      setIsBypassLoading(false);
    }
  };

  const onCooldown = userStatus?.onCooldown ?? false;
  const readingsCompleted = userStatus?.readingsCompleted ?? 0;

  const freeReadingCooldownLine = useMemo(() => {
    if (!userStatus?.firstReadingUsed) return null;
    if (onCooldown) return null;
    if (!userStatus?.cooldownExpiresAt) return null;
    const ms = new Date(userStatus.cooldownExpiresAt).getTime() - Date.now();
    if (ms <= 0) return null;
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `Free reading resets in ${days}d ${hours}h`;
    return `Free reading resets in ${hours}h`;
  }, [userStatus, onCooldown]);

  return (
    <div
      className="relative h-screen overflow-y-auto overscroll-none bg-[#050816] text-slate-100"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <style jsx>{`
        @keyframes jxlAmberPulse {
          0%, 100% {
            box-shadow:
              0 0 0 1px rgba(245, 158, 11, 0.18),
              0 0 20px rgba(245, 158, 11, 0.08),
              0 0 40px rgba(245, 158, 11, 0.04);
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(251, 191, 36, 0.38),
              0 0 28px rgba(251, 191, 36, 0.18),
              0 0 56px rgba(251, 191, 36, 0.08);
          }
        }

        @keyframes cooldownPulse {
          0%, 100% {
            box-shadow:
              0 0 0 1px rgba(99, 102, 241, 0.2),
              0 0 20px rgba(99, 102, 241, 0.08);
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(99, 102, 241, 0.4),
              0 0 28px rgba(99, 102, 241, 0.16);
          }
        }

        .jxl-teaser {
          animation: jxlAmberPulse 2.8s ease-in-out infinite;
          position: relative;
          overflow: hidden;
        }

        .jxl-teaser::before {
          content: "";
          position: absolute;
          inset: -40%;
          background-image: linear-gradient(
            120deg,
            rgba(253, 230, 138, 0) 0%,
            rgba(253, 230, 138, 0.12) 40%,
            rgba(250, 204, 21, 0.3) 50%,
            rgba(253, 230, 138, 0.12) 60%,
            rgba(253, 230, 138, 0) 100%
          );
          mix-blend-mode: screen;
          pointer-events: none;
          opacity: 0.85;
          transform: translateX(-60%);
          animation: jxlShimmer 3.5s linear infinite;
        }

        @keyframes jxlShimmer {
          0%   { transform: translateX(-60%); }
          50%  { transform: translateX(40%); }
          100% { transform: translateX(120%); }
        }

        .cooldown-glow {
          animation: cooldownPulse 3s ease-in-out infinite;
        }

        .jxl-teaser--subtle::before {
          opacity: 0.55;
          animation-duration: 5s;
        }
      `}</style>

      {/* ── Mobile-first ambient background ─────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          animate={{ x: [0, 10, 0], y: [0, 14, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-1/2 top-[-120px] h-[280px] w-[280px] -translate-x-1/2 rounded-full bg-teal-300/[0.10] blur-3xl"
        />
        <motion.div
          animate={{ x: [0, -12, 0], y: [0, 10, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
          className="absolute right-[-60px] top-[30%] h-[220px] w-[220px] rounded-full bg-amber-300/[0.08] blur-3xl"
        />
        <motion.div
          animate={{ x: [0, 8, 0], y: [0, -12, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-[-80px] bottom-[18%] h-[200px] w-[200px] rounded-full bg-indigo-400/[0.08] blur-3xl"
        />
        <div
          className="absolute inset-0 opacity-[0.025] mix-blend-screen"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.8) 0.6px, transparent 0.8px), radial-gradient(circle at 80% 30%, rgba(255,255,255,0.55) 0.6px, transparent 0.8px), radial-gradient(circle at 40% 70%, rgba(255,255,255,0.4) 0.6px, transparent 0.8px)",
            backgroundSize: "220px 220px, 260px 260px, 320px 320px",
          }}
        />
      </div>

      <div className="relative mx-auto w-full max-w-[430px] flex flex-col px-4 pb-44 pt-4">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex flex-col"
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
              <p className="mt-1 text-xs text-slate-400">Reading Setup</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-[11px] font-medium text-slate-400">
              3/4
            </div>
          </header>

          {/* Status banners */}
          <section className="mb-6 space-y-3">
            {chartStatus === "recalculating" && (
              <div className="flex w-fit items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/10 px-3 py-1.5 text-[11px] text-teal-100">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Refreshing your chart…
              </div>
            )}
            {chartStatus === "error" && (
              <div className="flex w-fit items-center gap-2 rounded-full border border-rose-300/20 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-100">
                Chart data unavailable — please go back and recalculate
              </div>
            )}

            <div className="inline-flex rounded-full border border-teal-400/20 bg-teal-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-teal-200">
              Reading Setup
            </div>

            {/* Upgraded title block */}
            <div className="space-y-2 pt-1">
              <h1 className="text-[32px] font-semibold leading-[1.02] tracking-[-0.03em] text-white">
                What do you want insight on?
              </h1>
              <p className="max-w-[34ch] text-[14px] leading-6 text-slate-400">
                Choose the area you want clarity on, then ask your question in a direct way.
              </p>
              {chartStatus === "ready" && (() => {
                const chart = loadChart();
                return chart ? (
                  <div className="pt-1 text-xs text-slate-500">
                    <span>Chart for {chart.birthPlace}</span>
                    <span className="mx-1.5">·</span>
                    <button
                      type="button"
                      onClick={() => router.push("/chart-data")}
                      className="text-slate-400 transition hover:text-teal-300"
                    >
                      Edit
                    </button>
                  </div>
                ) : null;
              })()}
            </div>
          </section>

          {/* Free reading cooldown one-liner */}
          {freeReadingCooldownLine && (
            <div className="mb-3 text-[11px] text-slate-500">
              {freeReadingCooldownLine}
            </div>
          )}

          {/* Reading cycle progress bar */}
          {(userStatus?.firstReadingUsed || (userStatus?.readingsCompleted ?? 0) > 0) && (
            <div className="mb-6 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  Reading cycle
                </span>
                <span className="text-[10px] text-slate-600">
                  {readingsCompleted} / 4
                </span>
              </div>
              <div className="flex gap-1.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]"
                  >
                    {i < readingsCompleted && (
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 0.6, delay: i * 0.1, ease: "easeOut" }}
                        className={cn(
                          "absolute inset-y-0 left-0 rounded-full",
                          onCooldown ? "bg-indigo-400" : "bg-teal-300"
                        )}
                        style={{
                          boxShadow: onCooldown
                            ? "0 0 8px rgba(99,102,241,0.6)"
                            : "0 0 8px rgba(94,234,212,0.6)",
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cooldown state */}
          {onCooldown ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="relative"
            >
              <div className="space-y-3 blur-[5px] pointer-events-none select-none opacity-30">
                {AREAS.map((area) => {
                  const Icon = area.icon;
                  return (
                    <div
                      key={area.id}
                      className="w-full rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-slate-300">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <h2 className="text-[15px] font-semibold text-white">{area.title}</h2>
                          <p className="mt-1 text-sm text-slate-400">{area.description}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="absolute inset-0 flex items-center justify-center px-2">
                <div className={cn(
                  "cooldown-glow w-full rounded-[28px] border border-indigo-400/20 bg-[#050816]/95 px-6 py-6 text-center backdrop-blur-sm"
                )}>
                  <div className="mb-3 flex justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-indigo-400/30 bg-indigo-400/10">
                      <Timer className="h-5 w-5 text-indigo-300" />
                    </div>
                  </div>
                  <h2 className="mb-2 text-[16px] font-semibold text-white">
                    Cooldown period active
                  </h2>
                  <p className="mb-1 text-[13px] leading-5 text-slate-400">
                    Due to safety concerns and us caring about your wellbeing, we've implemented a cooldown period between reading cycles.
                  </p>
                  {userStatus?.cooldownExpiresAt && (
                    <p className="mt-2 text-[12px] text-indigo-300/80">
                      Resets in {formatTimeRemaining(userStatus.cooldownExpiresAt)}
                    </p>
                  )}
                  {userStatus?.canBypass && (
                    <div className="mt-5 border-t border-white/10 pt-5">
                      <p className="mb-3 text-[12px] leading-5 text-slate-400">
                        You may pay to bypass this cooldown — once per cycle.
                      </p>
                      <button
                        type="button"
                        onClick={handleBypass}
                        disabled={isBypassLoading}
                        className="rounded-2xl bg-indigo-400 px-6 py-2.5 text-[13px] font-semibold text-slate-950 transition hover:bg-indigo-300 disabled:opacity-60"
                      >
                        {isBypassLoading ? "Loading…" : "Skip cooldown — $6.00"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <>
              {/* Main reading categories */}
              <section className="space-y-3">
                {AREAS.map((area, index) => {
                  const Icon = area.icon;
                  const isSelected = selectedArea === area.id;

                  return (
                    <motion.button
                      key={area.id}
                      type="button"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{
                        opacity: 1,
                        y: isSelected ? -3 : 0,
                        borderColor: isSelected
                          ? "rgba(94,234,212,0.62)"
                          : "rgba(255,255,255,0.10)",
                        backgroundColor: isSelected
                          ? "rgba(45,212,191,0.10)"
                          : "rgba(255,255,255,0.04)",
                        boxShadow: isSelected
                          ? "0 0 0 1px rgba(94,234,212,0.10), 0 14px 30px rgba(20,184,166,0.14)"
                          : "0 0 0 1px rgba(255,255,255,0.00), 0 0 0 rgba(0,0,0,0)",
                      }}
                      whileTap={{
                        scale: 0.972,
                        y: 2,
                      }}
                      transition={{
                        opacity: { duration: 0.25, delay: index * 0.04 },
                        y: { type: "spring", stiffness: 320, damping: 24 },
                        borderColor: { duration: 0.22 },
                        backgroundColor: { duration: 0.22 },
                        boxShadow: { duration: 0.25 },
                      }}
                      onClick={() => {
                        setSelectedArea(area.id);
                        setQuestion("");
                      }}
                      className={cn(
                        "relative w-full overflow-hidden rounded-[24px] border px-4 py-4 text-left backdrop-blur-md"
                      )}
                    >
                      {/* top sheen */}
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />

                      {/* selected glow wash */}
                      <AnimatePresence>
                        {isSelected && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.22 }}
                            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(94,234,212,0.14),transparent_58%)]"
                          />
                        )}
                      </AnimatePresence>

                      <div className="relative flex items-start gap-3">
                        <motion.div
                          animate={{
                            scale: isSelected ? 1.08 : 1,
                            rotate: isSelected ? -3 : 0,
                            boxShadow: isSelected
                              ? "0 0 18px rgba(94,234,212,0.22)"
                              : "0 0 0 rgba(0,0,0,0)",
                            borderColor: isSelected
                              ? "rgba(94,234,212,0.40)"
                              : "rgba(255,255,255,0.10)",
                            backgroundColor: isSelected
                              ? "rgba(94,234,212,0.10)"
                              : "rgba(0,0,0,0.20)",
                          }}
                          transition={{ type: "spring", stiffness: 280, damping: 18 }}
                          className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-slate-300"
                          style={{
                            color: isSelected ? "rgb(153 246 228)" : "rgb(203 213 225)",
                          }}
                        >
                          <Icon className="h-4 w-4" />
                        </motion.div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <motion.h2
                              animate={{
                                color: isSelected ? "#ffffff" : "#ffffff",
                              }}
                              className="text-[15px] font-semibold"
                            >
                              {area.title}
                            </motion.h2>

                            <AnimatePresence>
                              {isSelected && (
                                <motion.span
                                  initial={{ opacity: 0, scale: 0.9, y: 4 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95, y: 2 }}
                                  transition={{ duration: 0.18 }}
                                  className="rounded-full border border-teal-300/30 bg-teal-300/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-teal-200"
                                >
                                  Selected
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </div>

                          <motion.p
                            animate={{
                              color: isSelected ? "rgba(226,232,240,0.88)" : "rgba(148,163,184,1)",
                            }}
                            transition={{ duration: 0.22 }}
                            className="mt-1 text-sm leading-5"
                          >
                            {area.description}
                          </motion.p>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </section>

              {/* Question box */}
              <AnimatePresence>
                {selectedArea && selectedArea !== "other" && (
                  <motion.section
                    initial={{ opacity: 0, y: 16, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.985 }}
                    transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                    className="mt-6 space-y-2"
                  >
                    <Textarea
                      id="question"
                      rows={5}
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder={
                        AREAS.find((a) => a.id === selectedArea)?.placeholder ??
                        "Ask something specific so your reading can go deeper."
                      }
                      className="min-h-[132px] rounded-[24px] border-white/10 bg-black/20 px-4 py-4 text-[15px] leading-6 text-white placeholder:text-slate-400/80 focus-visible:ring-1 focus-visible:ring-teal-300"
                    />
                    <p className="text-xs leading-5 text-slate-400">
                      Be specific. The clearer your question, the sharper the reading.
                    </p>
                  </motion.section>
                )}
              </AnimatePresence>
            </>
          )}

          {/* Divider */}
          <div className="mt-8 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-600">
              Premium
            </span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>

          {/* Ask Jxl */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
            className="mt-4"
          >
            {(userStatus?.readingsCompleted ?? 0) >= 1 || userStatus?.isSubscribed ? (
              <button
                type="button"
                onClick={() => router.push("/jxl")}
                className="jxl-teaser w-full rounded-[28px] border border-amber-400/30 bg-black/30 px-5 py-5 text-left transition hover:border-amber-300/50 hover:bg-amber-400/[0.06]"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-300" />
                    <span className="text-[14px] font-semibold text-amber-200">
                      Ask Jxl
                    </span>
                  </div>
                  <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-300">
                    Unlocked
                  </span>
                </div>
                <p className="text-[12px] leading-5 text-slate-400">
                  A personal conversation with your chart. No categories — just tell Jxl what's going on.
                </p>
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-amber-300/70">
                  <span>Start a session →</span>
                </div>
              </button>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-center">
                  <span className="flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-amber-400/80">
                    <Lock className="h-2.5 w-2.5" />
                    Unlocks after your first reading
                  </span>
                </div>
                <div
                  className="jxl-teaser jxl-teaser--subtle relative overflow-hidden rounded-[28px] border border-amber-400/20 bg-black/30 pointer-events-none select-none"
                  aria-hidden="true"
                >
                  <div className="blur-[6px] px-5 py-5 opacity-60">
                    <div className="mb-3 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-300" />
                      <span className="text-[14px] font-semibold text-amber-200">
                        Ask Jxl
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 w-3/4 rounded-full bg-slate-400/30" />
                      <div className="h-3 w-1/2 rounded-full bg-slate-400/20" />
                      <div className="mt-4 h-16 rounded-2xl border border-white/10 bg-white/5" />
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-b from-amber-950/10 via-transparent to-amber-950/20 rounded-[28px]" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10">
                        <Lock className="h-4 w-4 text-amber-300/70" />
                      </div>
                      <span className="text-[11px] text-amber-400/60 tracking-wide">
                        Complete one reading to unlock
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </motion.div>

        </motion.div>
      </div>

      {/* Footer CTA — elevated glass panel */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[linear-gradient(180deg,rgba(5,8,22,0.72),rgba(5,8,22,0.98))] px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-2xl">
        {/* Top glow line */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div className="relative mx-auto w-full max-w-[430px] space-y-2">
          {submitError && (
            <p className="mb-2 text-center text-xs text-red-300">{submitError}</p>
          )}
          {!onCooldown && (
            <Button
              type="button"
              onClick={handleStartReading}
              disabled={!canSubmit || isCreatingReading}
              className="h-14 w-full rounded-2xl bg-teal-300 text-slate-950 shadow-lg shadow-teal-500/20 transition hover:bg-teal-200 active:scale-[0.985] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              {buttonCopy}
            </Button>
          )}
          {!userStatus?.isSubscribed && (
            <button
              type="button"
              onClick={async () => {
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
              }}
              className="relative h-12 w-full overflow-hidden rounded-2xl border border-amber-300/25 bg-[linear-gradient(180deg,rgba(251,191,36,0.10),rgba(251,191,36,0.04))] px-5 text-left transition hover:border-amber-300/45 flex items-center justify-between"
            >
              {/* Subscription row top highlight */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/40 to-transparent" />
              <span className="text-[13px] font-semibold text-amber-200">JXL Unlimited</span>
              <span className="text-[12px] text-slate-400">$20/mo · 8 readings + unlimited JXL</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
