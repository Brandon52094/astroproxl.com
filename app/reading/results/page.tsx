"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Download, ChevronDown, CalendarDays } from "lucide-react";
import {
  loadReading,
  loadChart,
  clearIntake,
  type StoredReading,
} from "@/lib/chartStore";

interface FollowupEntry {
  id: string;
  question: string;
  title: string;
  content: string;
}

interface UserCredits {
  credits: number;
  isSubscribed: boolean;
  freeRepliesRemaining: number;
}

type ParsedSection =
  | { kind: "opening"; label: string; body: string }
  | { kind: "window"; date: string; note: string | null; body: string }
  | { kind: "directive"; directive: "DROP" | "EXECUTE" | "LOCK"; label: string; date: string | null; body: string }
  | { kind: "closing"; body: string };

const DATE_LEAD_RE = /^\s*\[\[DATE:\s*([^\]]+)\]\]\s*[—–-]?\s*/;
const DROP_RE = /^\s*DROP\s*:\s*/i;
const EXECUTE_RE = /^\s*EXECUTE\s+BY\s+(\[\[DATE:\s*[^\]]+\]\]|[A-Za-z]+\s+\d+(?:\s*[-–]\s*\d+)?)\s*:\s*/i;
const LOCK_RE = /^\s*LOCK\s+IN\s+BY\s+(\[\[DATE:\s*[^\]]+\]\]|[A-Za-z]+\s+\d+(?:\s*[-–]\s*\d+)?)\s*:\s*/i;

/**
 * Small, stable key derived from a reading's text. Used to (a) reset the free
 * reply counter when a NEW reading loads, and (b) mark a reading complete only
 * once — so returning from the Stripe reply-pack checkout can't re-advance the
 * reading cycle.
 */
function hashKey(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function extractDateText(raw: string): string {
  const m = raw.match(/\[\[DATE:\s*([^\]]+)\]\]/);
  return m ? m[1].trim() : raw.trim();
}

function splitWindowNote(body: string): { note: string | null; rest: string } {
  const dashLead = body.match(/^\s*[—–-]\s*([^.?!]{2,40})[.?!]\s+/);
  if (dashLead) {
    return { note: dashLead[1].trim(), rest: body.slice(dashLead[0].length) };
  }
  return { note: null, rest: body };
}

function parseReadingSections(content: string): ParsedSection[] | null {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length < 2) return null;

  const sections: ParsedSection[] = [];
  let phase: "opening" | "windows" | "directives" | "closing" = "opening";
  const openingParas: string[] = [];

  for (const para of paragraphs) {
    const isWindow = DATE_LEAD_RE.test(para);
    const isDrop = DROP_RE.test(para);
    const isExecute = EXECUTE_RE.test(para);
    const isLock = LOCK_RE.test(para);
    const isDirective = isDrop || isExecute || isLock;

    if (phase === "opening" && !isWindow && !isDirective) {
      openingParas.push(para);
      continue;
    }

    if (phase === "opening") {
      if (openingParas.length > 0) {
        sections.push({ kind: "opening", label: "Where you are now", body: openingParas[0] });
        if (openingParas.length > 1) {
          sections.push({ kind: "opening", label: "The root", body: openingParas.slice(1).join("\n\n") });
        }
      }
      phase = "windows";
    }

    if (isDirective) {
      phase = "directives";
      if (isDrop) {
        sections.push({ kind: "directive", directive: "DROP", label: "Drop", date: null, body: para.replace(DROP_RE, "") });
      } else if (isExecute) {
        const m = para.match(EXECUTE_RE);
        sections.push({
          kind: "directive",
          directive: "EXECUTE",
          label: "Execute by",
          date: m ? extractDateText(m[1]) : null,
          body: para.replace(EXECUTE_RE, ""),
        });
      } else {
        const m = para.match(LOCK_RE);
        sections.push({
          kind: "directive",
          directive: "LOCK",
          label: "Lock in by",
          date: m ? extractDateText(m[1]) : null,
          body: para.replace(LOCK_RE, ""),
        });
      }
      continue;
    }

    if (isWindow && phase !== "closing") {
      phase = "windows";
      const m = para.match(DATE_LEAD_RE);
      const rawBody = para.replace(DATE_LEAD_RE, "");
      const { note, rest } = splitWindowNote(rawBody);
      sections.push({ kind: "window", date: m ? m[1].trim() : "", note, body: rest });
      continue;
    }

    if (phase === "directives" || phase === "closing") {
      phase = "closing";
      sections.push({ kind: "closing", body: para });
      continue;
    }

    const last = sections[sections.length - 1];
    if (last && last.kind === "window") {
      last.body += "\n\n" + para;
    } else {
      sections.push({ kind: "opening", label: "", body: para });
    }
  }

  if (phase === "opening") return null;

  const hasStructure = sections.some((s) => s.kind === "window" || s.kind === "directive");
  return hasStructure ? sections : null;
}

export default function ReadingResultsPage() {
  const router = useRouter();
  const [reading, setReading] = useState<StoredReading | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSources, setShowSources] = useState(false);
  const [followups, setFollowups] = useState<FollowupEntry[]>([]);
  const [followupQuestion, setFollowupQuestion] = useState("");
  const [isGeneratingFollowup, setIsGeneratingFollowup] = useState(false);
  const [followupError, setFollowupError] = useState<string | null>(null);
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // ── Reply system state ──────────────────────────────────────────────────
  const [freeRepliesUsed, setFreeRepliesUsed] = useState(0);
  const [replyCreditsRemaining, setReplyCreditsRemaining] = useState<number | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [justPurchased, setJustPurchased] = useState(false);

  const followupEndRef = useRef<HTMLDivElement | null>(null);
  const hasMarkedComplete = useRef(false);

  // Stable per-reading key for all persisted reply state (survives the Stripe
  // round-trip). A new reading produces a new key → fresh conversation.
  const readingKey = useMemo(() => {
    const p = reading?.pages?.[0];
    return p ? hashKey(p.title + "::" + p.content) : "";
  }, [reading]);

  useEffect(() => {
    const stored = loadReading();
    if (!stored) {
      router.push("/reading/intake");
      return;
    }
    setReading(stored);
    setIsLoading(false);
  }, [router]);

  // ── Mark the reading complete exactly once PER READING (not per mount).
  // This advances readingsCompleted, deducts a per-reading credit, and triggers
  // the cooldown at 4. It must fire once for a given reading and never again —
  // otherwise returning from the reply-pack Stripe checkout (which reloads this
  // page) would count the same reading twice. We persist a per-reading flag in
  // localStorage and only set it after a successful call, so a failed call can
  // still retry.
  useEffect(() => {
    if (!reading || !readingKey) return;
    const completedFlag = "dfp_reading_done_" + readingKey;

    try {
      if (localStorage.getItem(completedFlag) === "1") {
        hasMarkedComplete.current = true;
        return;
      }
    } catch {
      // localStorage unavailable — fall through to the in-session guard.
    }

    if (!hasMarkedComplete.current) {
      hasMarkedComplete.current = true;
      fetch("/api/user/reading-complete", { method: "POST" })
        .then((res) => {
          if (!res.ok) throw new Error("reading-complete failed");
          try {
            localStorage.setItem(completedFlag, "1");
          } catch {
            // ignore persistence failure
          }
        })
        .catch(() => {
          // Allow a retry on failure rather than silently losing the count.
          hasMarkedComplete.current = false;
        });
    }
  }, [reading, readingKey]);

  // ── Restore per-reading reply state ─────────────────────────────────────
  // Rehydrates the follow-up conversation, the free-reply count, and the
  // paywall state for THIS reading — so leaving for Stripe and coming back
  // (whether you complete or cancel) lands you exactly where you were, with
  // your replies intact. A new reading has a new key, so it starts fresh.
  useEffect(() => {
    if (!reading || !readingKey) return;

    // Tidy up the previous reading's stored state when a new one loads.
    try {
      const prev = localStorage.getItem("dfp_last_reading_key") ?? "";
      if (prev && prev !== readingKey) {
        localStorage.removeItem(`dfp_followups_${prev}`);
        localStorage.removeItem(`dfp_free_used_${prev}`);
        localStorage.removeItem(`dfp_paywall_${prev}`);
      }
      localStorage.setItem("dfp_last_reading_key", readingKey);
    } catch {
      // ignore
    }

    // Free-reply count (0 for a brand-new reading).
    try {
      setFreeRepliesUsed(Math.max(0, Number(localStorage.getItem(`dfp_free_used_${readingKey}`) ?? 0)));
    } catch {
      setFreeRepliesUsed(0);
    }

    // The follow-up conversation.
    try {
      const raw = localStorage.getItem(`dfp_followups_${readingKey}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setFollowups(parsed as FollowupEntry[]);
      }
    } catch {
      // ignore malformed cache
    }

    // Paywall: clear it if we just returned from a successful purchase,
    // otherwise restore whatever we persisted (so a cancelled Stripe trip
    // keeps the paywall up instead of dropping you back to the input).
    let cameFromSuccess = false;
    try {
      const params = new URLSearchParams(window.location.search);
      cameFromSuccess =
        params.get("payment") === "success" && params.get("mode") === "reply_pack";
    } catch {
      // ignore
    }

    if (cameFromSuccess) {
      setJustPurchased(true);
      setShowPaywall(false);
      try {
        localStorage.removeItem(`dfp_paywall_${readingKey}`);
      } catch {
        // ignore
      }
    } else {
      try {
        setShowPaywall(localStorage.getItem(`dfp_paywall_${readingKey}`) === "1");
      } catch {
        setShowPaywall(false);
      }
    }

    // Clean the payment params off the URL so a refresh is tidy.
    try {
      if (new URLSearchParams(window.location.search).has("payment")) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch {
      // ignore
    }

    setReplyCreditsRemaining(null);
  }, [reading, readingKey]);

  useEffect(() => {
    const fetchCredits = async () => {
      try {
        const res = await fetch("/api/user/credits");
        const data = await res.json();
        setCredits({
          credits: Number(data.credits ?? 0),
          isSubscribed: data.isSubscribed === true,
          freeRepliesRemaining: Number(data.freeRepliesRemaining ?? 0),
        });
      } catch {
        // silent
      }
    };
    fetchCredits();
  }, [followups.length]);

  const page = reading?.pages?.[0] ?? null;

  const parsedSections = useMemo(
    () => (page?.content ? parseReadingSections(page.content) : null),
    [page?.content]
  );

  const renderContentWithBadges = (content: string) => {
    const parts = content.split(/(\[\[DATE:\s*[^\]]+\]\])/g);
    return parts.map((part, i) => {
      const match = part.match(/\[\[DATE:\s*([^\]]+)\]\]/);
      if (match) {
        return (
          <span key={i} className="date-badge">
            {match[1].trim()}
          </span>
        );
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  };

  const handleDownload = async () => {
    if (!reading || !page) return;
    setIsDownloading(true);
    try {
      const plain = page.content.replace(/\[\[DATE:\s*([^\]]+)\]\]/g, "$1");
      const text = `${page.title}\n\n${plain}\n\n— Generated by AstroProxl`;
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reading-${reading.topic}-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFollowup = async () => {
    const question = followupQuestion.trim();
    if (!question || isGeneratingFollowup || !reading || !page) return;

    setIsGeneratingFollowup(true);
    setFollowupError(null);

    try {
      const chart = loadChart();
      if (!chart?.chartData) {
        setFollowupError("Chart data missing. Please recalculate your chart.");
        return;
      }

      const conversationHistory = followups
        .map((f) => `Q: ${f.question}\nA: ${f.content}`)
        .join("\n\n");

      const response = await fetch("/api/readings/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          originalReading: page.content,
          originalTitle: page.title,
          topic: reading.topic,
          tropical: chart.chartData.tropical,
          sidereal: chart.chartData.sidereal,
          transits: chart.chartData.transits,
          transitAspects: chart.chartData.transitAspects,
          profection: chart.chartData.profection,
          progressions: chart.chartData.progressions,
          solarArcs: chart.chartData.solarArcs,
          upcomingTrigger: chart.chartData.upcomingTrigger,
          planetaryStations: chart.chartData.planetaryStations,
          solarReturn: chart.chartData.solarReturn,
          moonPhase: chart.chartData.moonPhase,
          conversationHistory: conversationHistory || undefined,
          freeRepliesUsed,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        // Out of replies → surface the paywall instead of a red error, and
        // persist it so a cancelled Stripe trip returns you to the paywall.
        if (response.status === 402 || data.code === "NO_REPLY_CREDITS") {
          setShowPaywall(true);
          try {
            if (readingKey) localStorage.setItem(`dfp_paywall_${readingKey}`, "1");
          } catch {
            // ignore
          }
          return;
        }
        setFollowupError(data.error || "Something went wrong. Please try again.");
        return;
      }

      // Update counters from the server's authoritative reply metadata.
      const meta = data.replyMeta;
      if (meta?.usedFreeReply) {
        const nextUsed = freeRepliesUsed + 1;
        setFreeRepliesUsed(nextUsed);
        try {
          if (readingKey) localStorage.setItem(`dfp_free_used_${readingKey}`, String(nextUsed));
        } catch {
          // ignore
        }
      }
      if (meta && typeof meta.replyCreditsRemaining === "number") {
        setReplyCreditsRemaining(meta.replyCreditsRemaining);
      }
      setShowPaywall(false);
      try {
        if (readingKey) localStorage.removeItem(`dfp_paywall_${readingKey}`);
      } catch {
        // ignore
      }

      // Persist the follow-up conversation so it survives the Stripe round-trip
      // (and page refreshes) instead of living only in memory.
      const newEntry: FollowupEntry = {
        id: crypto.randomUUID(),
        question,
        title: data.title,
        content: data.content,
      };
      const nextFollowups = [...followups, newEntry];
      setFollowups(nextFollowups);
      try {
        if (readingKey) localStorage.setItem(`dfp_followups_${readingKey}`, JSON.stringify(nextFollowups));
      } catch {
        // ignore
      }
      setFollowupQuestion("");
      setTimeout(() => {
        followupEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 120);
    } catch {
      setFollowupError("Something went wrong. Please try again.");
    } finally {
      setIsGeneratingFollowup(false);
    }
  };

  // ── Reply-pack / subscription checkout ──────────────────────────────────
  const startCheckout = async (mode: "reply_pack" | "subscription") => {
    if (isPurchasing) return;
    setIsPurchasing(true);
    setFollowupError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          returnUrl: typeof window !== "undefined" ? window.location.href : "",
        }),
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        setFollowupError("Couldn't start checkout. Please try again.");
        setIsPurchasing(false);
      }
    } catch {
      setFollowupError("Couldn't start checkout. Please try again.");
      setIsPurchasing(false);
    }
  };

  const handleBuyReplyPack = () => startCheckout("reply_pack");
  const handleSubscribe = () => startCheckout("subscription");

  const handleDone = () => {
    clearIntake();
    router.push("/reading/intake");
  };

  if (isLoading || !reading || !page) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "#0a0e27" }}>
        <div className="text-sm text-slate-400">Loading your reading…</div>
      </div>
    );
  }

  const firstOpeningIndex = parsedSections
    ? parsedSections.findIndex((s) => s.kind === "opening")
    : -1;

  // ── Reply availability (derived) ────────────────────────────────────────
  const isSubscribed = credits?.isSubscribed === true;
  const freeRemainingClient = Math.max(0, 2 - freeRepliesUsed);
  const outOfReplies =
    !isSubscribed &&
    freeRemainingClient <= 0 &&
    replyCreditsRemaining !== null &&
    replyCreditsRemaining <= 0;
  // Subscribers never see the paywall. Everyone else sees it when the server
  // said "no replies" (402 → showPaywall) or once we know credits hit zero.
  const paywallVisible = !isSubscribed && (showPaywall || outOfReplies);

  return (
    // 🔥 FIX: Made results-root a proper scroll container
    <div 
      className="results-root"
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0a0e27 0%, #0d1235 45%, #0a0e27 100%)",
        color: "#e2e8f0",
        fontFamily: "var(--font-sans, ui-sans-serif, system-ui)",
        overflowX: "hidden",
        overflowY: "auto",
      }}
    >
      <style jsx global>{`
        /* Reset any parent scrolling issues */
        html, body {
          overflow: auto !important;
          height: auto !important;
          min-height: 100vh;
        }
        
        .results-bg {
          position: fixed;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          z-index: 0;
        }
        .star { position: absolute; border-radius: 9999px; background: white; }
        @keyframes starTwinkle {
          0%, 100% { opacity: 0.25; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(1.5); }
        }

        .reading-title {
          font-family: var(--font-display, Georgia, serif);
          font-weight: 600;
          letter-spacing: -0.01em;
          line-height: 1.15;
        }
        .reading-body {
          font-family: var(--font-display, Georgia, serif);
          font-size: 16px;
          line-height: 1.9;
          color: #cbd5e1;
          white-space: pre-wrap;
        }

        .date-badge {
          display: inline-block;
          padding: 1px 10px;
          margin: 0 2px;
          border-radius: 9999px;
          background: linear-gradient(135deg, rgba(251, 191, 36, 0.18), rgba(217, 119, 6, 0.12));
          border: 1px solid rgba(251, 191, 36, 0.35);
          color: #fbbf24;
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          box-shadow: 0 0 18px rgba(251, 191, 36, 0.12);
          white-space: nowrap;
        }

        .section-label {
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(45, 212, 191, 0.9);
        }
        .section-block {
          border-top: 1px solid rgba(255, 255, 255, 0.07);
          margin-top: 24px;
          padding-top: 20px;
        }
        .section-block.first {
          border-top: none;
          margin-top: 0;
          padding-top: 0;
        }

        .window-card {
          background: rgba(20, 25, 55, 0.42);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 20px;
          padding: 16px 18px;
          margin-top: 14px;
          backdrop-filter: blur(8px);
        }
        .window-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .window-note { font-family: var(--font-sans, ui-sans-serif); font-size: 12px; color: #64748b; }
        .window-body {
          font-family: var(--font-display, Georgia, serif);
          font-size: 15px;
          line-height: 1.8;
          color: #cbd5e1;
          white-space: pre-wrap;
          margin-top: 8px;
        }

        .directive-strip { padding: 10px 0 10px 14px; margin-top: 14px; border-radius: 0; }
        .directive-strip.drop { border-left: 2px solid #f87171; }
        .directive-strip.execute { border-left: 2px solid #2dd4bf; }
        .directive-strip.lock { border-left: 2px solid #fbbf24; }
        .directive-label {
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .directive-strip.drop .directive-label { color: #f87171; }
        .directive-strip.execute .directive-label { color: #2dd4bf; }
        .directive-strip.lock .directive-label { color: #fbbf24; }
        .directive-body {
          font-family: var(--font-display, Georgia, serif);
          font-size: 14px;
          line-height: 1.75;
          color: #cbd5e1;
          margin-top: 5px;
          white-space: pre-wrap;
        }

        .closing-line {
          font-family: var(--font-display, Georgia, serif);
          font-size: 16px;
          line-height: 1.8;
          color: #e8e6ef;
          font-style: italic;
          text-align: center;
          margin-top: 30px;
          padding-top: 4px;
          white-space: pre-wrap;
        }

        .sources-toggle {
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #64748b;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 0;
        }
        .sources-toggle:hover { color: #94a3b8; }

        .followup-input {
          width: 100%;
          background: rgba(10, 14, 39, 0.6);
          border: 1px solid rgba(45, 212, 191, 0.25);
          border-radius: 18px;
          color: #e2e8f0;
          /* 16px keeps iOS Safari from auto-zooming the page on focus — this is
             the keyboard "zoom in to fit" issue. Must stay >= 16px. */
          font-size: 16px;
          padding: 14px 16px;
          outline: none;
          resize: none;
          transition: border-color 0.25s ease, box-shadow 0.25s ease;
        }
        .followup-input:focus {
          border-color: rgba(45, 212, 191, 0.6);
          box-shadow: 0 0 30px rgba(45, 212, 191, 0.12);
        }

        /* ── Reply paywall ── */
        .purchase-success {
          margin-bottom: 12px;
          padding: 10px 14px;
          border-radius: 12px;
          background: rgba(45, 212, 191, 0.1);
          border: 1px solid rgba(45, 212, 191, 0.3);
          color: #5eead4;
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 13px;
          text-align: center;
        }
        .paywall-card {
          background: rgba(20, 25, 55, 0.5);
          border: 1px solid rgba(251, 191, 36, 0.28);
          border-radius: 20px;
          padding: 22px 18px;
          text-align: center;
          backdrop-filter: blur(8px);
        }
        .paywall-title {
          font-family: var(--font-display, Georgia, serif);
          font-size: 19px;
          color: #ffffff;
          font-weight: 600;
        }
        .paywall-sub {
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 13px;
          line-height: 1.6;
          color: #94a3b8;
          margin-top: 8px;
        }
        .paywall-buy {
          margin-top: 18px;
          width: 100%;
          height: 54px;
          border-radius: 16px;
          border: none;
          background: linear-gradient(135deg, #fbbf24, #d97706);
          color: #1a1206;
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 0 34px rgba(251, 191, 36, 0.22);
        }
        .paywall-buy:disabled { opacity: 0.6; cursor: default; }
        .paywall-sub-link {
          margin-top: 12px;
          background: none;
          border: none;
          color: #5eead4;
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 13px;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .paywall-sub-link:disabled { opacity: 0.6; cursor: default; }

        .bottom-bar {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
          display: flex;
          gap: 12px;
          align-items: center;
          background: linear-gradient(180deg, rgba(10, 14, 39, 0) 0%, rgba(10, 14, 39, 0.94) 40%);
          z-index: 40;
        }
        @keyframes downloadPulse {
          0%, 100% { box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.4), 0 0 22px rgba(251, 191, 36, 0.18); }
          50% { box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.7), 0 0 34px rgba(251, 191, 36, 0.32); }
        }
        .download-btn {
          width: 56px;
          height: 56px;
          border-radius: 18px;
          border: 1px solid rgba(251, 191, 36, 0.5);
          background: rgba(251, 191, 36, 0.08);
          color: #fbbf24;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: downloadPulse 2.6s ease-in-out infinite;
          cursor: pointer;
          flex-shrink: 0;
        }
        .done-btn {
          flex: 1;
          height: 56px;
          border-radius: 18px;
          border: none;
          background: #5eead4;
          color: #042f2e;
          font-size: 17px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 0 40px rgba(94, 234, 212, 0.35);
        }
        @media (prefers-reduced-motion: reduce) {
          .star, .download-btn { animation: none !important; }
        }
      `}</style>

      {/* ── Fixed starfield behind everything ── */}
      <div className="results-bg" aria-hidden="true">
        {Array.from({ length: 46 }).map((_, i) => (
          <span
            key={i}
            className="star"
            style={{
              left: `${(i * 37) % 100}%`,
              top: `${(i * 19 + 13) % 100}%`,
              width: i % 7 === 0 ? 3 : 1.5,
              height: i % 7 === 0 ? 3 : 1.5,
              animation: `starTwinkle ${2.4 + (i % 5) * 0.5}s ease-in-out infinite`,
              animationDelay: `${(i * 0.37) % 4}s`,
            }}
          />
        ))}
      </div>

      {/* 🔥 FIX: Increased bottom padding to clear the fixed bar */}
      <div
        className="relative z-10 mx-auto w-full max-w-[560px] px-5 pt-14"
        style={{ 
          paddingBottom: "calc(160px + env(safe-area-inset-bottom))",
          minHeight: "calc(100vh - 40px)",
        }}
      >
        {/* ── Header ── */}
        <header className="mb-6 flex items-start gap-3">
          <button
            type="button"
            onClick={handleDone}
            aria-label="Back"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 text-center">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Your Direct Insights</p>
            <p className="mt-0.5 text-[13px] text-slate-300">What We've Gathered</p>
          </div>
          <div className="h-11 w-11 shrink-0" aria-hidden="true" />
        </header>

        {/* ── Topic + title, centered ── */}
        <div className="mb-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-300/80">{reading.topic}</p>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="reading-title mt-2 text-[27px] text-white sm:text-[31px]"
          >
            {page.title}
          </motion.h1>
        </div>

        {/* ── THE READING — borderless sections on the starfield ── */}
        <motion.article
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
        >
          {parsedSections ? (
            parsedSections.map((section, i) => {
              if (section.kind === "opening") {
                return (
                  <div key={i} className={`section-block ${i === firstOpeningIndex ? "first" : ""}`}>
                    {section.label && <p className="section-label">{section.label}</p>}
                    <p className="reading-body" style={{ marginTop: section.label ? 10 : 0 }}>
                      {renderContentWithBadges(section.body)}
                    </p>
                  </div>
                );
              }

              if (section.kind === "window") {
                return (
                  <div key={i} className="window-card">
                    <div className="window-head">
                      <CalendarDays className="h-4 w-4 text-teal-300/80" aria-hidden="true" />
                      <span className="date-badge">{section.date}</span>
                      {section.note && <span className="window-note">— {section.note}</span>}
                    </div>
                    <p className="window-body">{renderContentWithBadges(section.body)}</p>
                  </div>
                );
              }

              if (section.kind === "directive") {
                const variant =
                  section.directive === "DROP" ? "drop" : section.directive === "EXECUTE" ? "execute" : "lock";
                return (
                  <div key={i} className={`directive-strip ${variant}`}>
                    <p className="directive-label">
                      {section.label}
                      {section.date && <span className="date-badge">{section.date}</span>}
                    </p>
                    <p className="directive-body">{renderContentWithBadges(section.body)}</p>
                  </div>
                );
              }

              return (
                <p key={i} className="closing-line">
                  {renderContentWithBadges(section.body)}
                </p>
              );
            })
          ) : (
            <div className="reading-body">{renderContentWithBadges(page.content)}</div>
          )}

          {/* ── Sources dropdown ── */}
          {page.sources && page.sources.length > 0 && (
            <div className="mt-8 border-t border-white/[0.07] pt-4">
              <button
                type="button"
                className="sources-toggle"
                onClick={() => setShowSources((s) => !s)}
                aria-expanded={showSources}
              >
                Astrological sources
                <ChevronDown
                  className="h-3.5 w-3.5 transition-transform duration-200"
                  style={{ transform: showSources ? "rotate(180deg)" : undefined }}
                />
              </button>
              <AnimatePresence>
                {showSources && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 space-y-2.5">
                      {page.sources.map((src, i) => (
                        <div key={i} className="rounded-xl bg-black/25 px-3.5 py-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-300/80">
                            {src.section}
                          </p>
                          <p className="mt-1 text-[12px] leading-5 text-slate-400">{src.placements}</p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </motion.article>

        {credits && !credits.isSubscribed && (
          <p className="mt-4 text-right text-[11px] text-slate-500">{credits.credits} credits remaining</p>
        )}

        {/* ── GOING DEEPER — follow-ups ── */}
        <section className="mt-10">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.07]" />
            <span className="text-[11px] uppercase tracking-[0.24em] text-teal-300/90">Going Deeper</span>
            <div className="h-px flex-1 bg-white/[0.07]" />
          </div>

          {followups.map((f) => (
            <div key={f.id} className="mb-5">
              <p className="mb-2 px-1 text-[13px] italic leading-6 text-slate-500">"{f.question}"</p>
              <h3 className="reading-title mb-2 text-[18px] text-white">{f.title}</h3>
              <div className="reading-body" style={{ fontSize: 15 }}>
                {renderContentWithBadges(f.content)}
              </div>
            </div>
          ))}
          <div ref={followupEndRef} />

          {justPurchased && (
            <div className="purchase-success">✓ 2 replies added — ask away.</div>
          )}

          {paywallVisible ? (
            <div className="paywall-card">
              <p className="paywall-title">You've used your free replies</p>
              <p className="paywall-sub">
                Keep the conversation going and get even more clarity.
              </p>
              <button
                type="button"
                className="paywall-buy"
                onClick={handleBuyReplyPack}
                disabled={isPurchasing}
              >
                {isPurchasing ? "Opening checkout…" : "Get 2 more replies · $2"}
              </button>
              <button
                type="button"
                className="paywall-sub-link"
                onClick={handleSubscribe}
                disabled={isPurchasing}
              >
                or subscribe for unlimited replies
              </button>
              {followupError && <p className="mt-2 text-[12px] text-red-300">{followupError}</p>}
            </div>
          ) : (
            <>
              <p className="mb-2 px-1 text-[12px] text-slate-500">
                Don't over think this. Just say what's on your mind.
              </p>
              <textarea
                className="followup-input"
                rows={3}
                value={followupQuestion}
                onChange={(e) => setFollowupQuestion(e.target.value)}
                placeholder="Ask a follow up…"
                disabled={isGeneratingFollowup}
              />
              {followupError && <p className="mt-2 text-[12px] text-red-300">{followupError}</p>}
              <button
                type="button"
                onClick={handleFollowup}
                disabled={isGeneratingFollowup || !followupQuestion.trim()}
                className="mt-3 h-12 w-full rounded-2xl border border-teal-400/30 bg-teal-400/[0.08] text-[14px] font-semibold text-teal-200 transition disabled:opacity-40"
              >
                {isGeneratingFollowup ? "Reading the sky…" : "Ask"}
              </button>

              {isSubscribed ? (
                <p className="mt-2 text-center text-[11px] text-slate-500">Unlimited replies included</p>
              ) : freeRemainingClient > 0 ? (
                <p className="mt-2 text-center text-[11px] text-slate-500">
                  {freeRemainingClient} free {freeRemainingClient === 1 ? "reply" : "replies"} remaining
                </p>
              ) : replyCreditsRemaining && replyCreditsRemaining > 0 ? (
                <p className="mt-2 text-center text-[11px] text-slate-500">
                  {replyCreditsRemaining} {replyCreditsRemaining === 1 ? "reply" : "replies"} remaining
                </p>
              ) : null}
            </>
          )}
        </section>
      </div>

      {/* ── Fixed bottom bar ── */}
      <div className="bottom-bar">
        <button
          type="button"
          className="download-btn"
          onClick={handleDownload}
          disabled={isDownloading}
          aria-label="Download reading"
        >
          <Download className="h-5 w-5" />
        </button>
        <button type="button" className="done-btn" onClick={handleDone}>
          Done
        </button>
      </div>
    </div>
  );
}