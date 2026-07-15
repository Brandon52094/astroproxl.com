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
  const followupEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stored = loadReading();
    if (!stored) {
      router.push("/reading/intake");
      return;
    }
    setReading(stored);
    setIsLoading(false);
  }, [router]);

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
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setFollowupError(data.error || "Something went wrong. Please try again.");
        return;
      }

      setFollowups((prev) => [
        ...prev,
        { id: crypto.randomUUID(), question, title: data.title, content: data.content },
      ]);
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
          font-size: 15px;
          padding: 14px 16px;
          outline: none;
          resize: none;
          transition: border-color 0.25s ease, box-shadow 0.25s ease;
        }
        .followup-input:focus {
          border-color: rgba(45, 212, 191, 0.6);
          box-shadow: 0 0 30px rgba(45, 212, 191, 0.12);
        }

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
        className="relative z-10 mx-auto w-full max-w-[560px] px-5 pt-5"
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
          {credits?.isSubscribed && (
            <p className="mt-2 text-center text-[11px] text-slate-500">
              {credits.freeRepliesRemaining} free replies remaining
            </p>
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