"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Download, ChevronDown, CalendarDays } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import {
  loadReading,
  loadChart,
  clearIntake,
  type StoredReading,
} from "@/lib/chartStore";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

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
  | { kind: "prediction"; label: string; body: string }
  | { kind: "currentState"; label: string; body: string }
  | { kind: "whyNow"; label: string; body: string }
  | { kind: "manifestation"; label: string; body: string }
  | { kind: "prose"; label: string; body: string }
  | {
      kind: "window";
      date: string | null;
      note: string | null;
      body: string;
    }
  | {
      kind: "directive";
      directive: "GENERAL" | "DROP" | "EXECUTE" | "LOCK";
      label: string;
      date: string | null;
      body: string;
    }
  | { kind: "closing"; body: string };

// ─── ResultsStarfield Component ────────────────────────────────

function ResultsStarfield() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    type PStar = { x: number; y: number; r: number };
    type TStar = {
      x: number;
      y: number;
      r: number;
      ph: number;
      sp: number;
    };
    type Shooter = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
      len: number;
    };

    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = w * dpr;
      canvas.height = h * dpr;

      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const parallax: PStar[][] = [];
    const counts = [26, 16, 9];
    const speeds = [0.04, 0.09, 0.16];
    const sizes = [0.5, 0.8, 1.2];
    const alphas = [0.28, 0.5, 0.75];

    for (let layer = 0; layer < 3; layer++) {
      const stars: PStar[] = [];
      for (let i = 0; i < counts[layer]; i++) {
        stars.push({
          x: Math.random(),
          y: Math.random(),
          r: Math.random() * sizes[layer] + 0.3,
        });
      }
      parallax.push(stars);
    }

    const twinkling: TStar[] = [];
    for (let i = 0; i < 34; i++) {
      twinkling.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 1.1 + 0.4,
        ph: Math.random() * Math.PI * 2,
        sp: Math.random() * 0.025 + 0.008,
      });
    }

    const shooters: Shooter[] = [];
    let tick = 0;
    let nextShoot = 360;
    let raf = 0;

    const frame = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.clearRect(0, 0, w, h);

      for (let layer = 0; layer < 3; layer++) {
        for (const star of parallax[layer]) {
          star.x -= speeds[layer] / w;
          if (star.x < 0) {
            star.x = 1;
            star.y = Math.random();
          }
          ctx.fillStyle = `rgba(219,234,254,${alphas[layer]})`;
          ctx.beginPath();
          ctx.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (const star of twinkling) {
        star.ph += star.sp;
        const twinkle = (Math.sin(star.ph) + 1) / 2;
        ctx.fillStyle = `rgba(226,232,240,${0.2 + twinkle * 0.6})`;
        ctx.beginPath();
        ctx.arc(
          star.x * w,
          star.y * h,
          star.r * (0.7 + twinkle * 0.4),
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      tick++;
      if (tick >= nextShoot) {
        shooters.push({
          x: Math.random() * w * 0.7,
          y: Math.random() * h * 0.35,
          vx: Math.random() * 2 + 3,
          vy: Math.random() * 1.5 + 1.5,
          life: 0,
          maxLife: 60 + Math.random() * 20,
          len: Math.random() * 40 + 50,
        });
        nextShoot = tick + 360 + Math.random() * 240;
      }

      for (let i = shooters.length - 1; i >= 0; i--) {
        const shooter = shooters[i];
        shooter.x += shooter.vx;
        shooter.y += shooter.vy;
        shooter.life++;

        let fade = 1;
        if (shooter.life < 10) {
          fade = shooter.life / 10;
        } else if (shooter.life > shooter.maxLife - 15) {
          fade = Math.max(0, (shooter.maxLife - shooter.life) / 15);
        }

        const magnitude = Math.sqrt(shooter.vx * shooter.vx + shooter.vy * shooter.vy);
        const tailX = shooter.x - (shooter.vx / magnitude) * shooter.len;
        const tailY = shooter.y - (shooter.vy / magnitude) * shooter.len;

        const gradient = ctx.createLinearGradient(shooter.x, shooter.y, tailX, tailY);
        gradient.addColorStop(0, `rgba(226,232,240,${0.9 * fade})`);
        gradient.addColorStop(1, "rgba(147,197,253,0)");

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(shooter.x, shooter.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();

        ctx.fillStyle = `rgba(255,255,255,${0.95 * fade})`;
        ctx.beginPath();
        ctx.arc(shooter.x, shooter.y, 1.5, 0, Math.PI * 2);
        ctx.fill();

        if (shooter.life >= shooter.maxLife || shooter.x > w + 60 || shooter.y > h + 60) {
          shooters.splice(i, 1);
        }
      }

      raf = requestAnimationFrame(frame);
    };

    frame();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="results-starfield"
    />
  );
}

// ─── Parser ──────────────────────────────────────────────────────

const INTERNAL_PART_RE = /^\s*Part\s*([1-7])\s*[:—–-]\s*/i;

const HUMAN_HEADERS = [
  "The Prediction",
  "Where You Are Now",
  "Why This Is Active",
  "Why This Is Active Now",
  "How This Is Most Likely To Show Up",
  "Dated Windows",
  "The Directive",
  "Bottom Line",
];

const DATE_LEAD_RE = /^\s*\[\[DATE:\s*([^\]]+)\]\]\s*[—–-]?\s*/;
const DROP_RE = /^\s*DROP\s*:\s*/i;
const EXECUTE_RE = /^\s*EXECUTE\s+BY\s+(\[\[DATE:\s*[^\]]+\]\]|[A-Za-z]+\s+\d+(?:\s*[-–]\s*\d+)?)\s*:\s*/i;
const LOCK_RE = /^\s*LOCK\s+IN\s+BY\s+(\[\[DATE:\s*[^\]]+\]\]|[A-Za-z]+\s+\d+(?:\s*[-–]\s*\d+)?)\s*:\s*/i;

function hashKey(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function extractDateText(raw: string): string {
  const m = raw.match(/\[\[DATE:\s*([^\]]+)\]\]/);
  return m ? m[1].trim() : raw.trim();
}

function cleanInternalPartLabel(text: string): string {
  return text.replace(INTERNAL_PART_RE, "").trim();
}

function splitHumanHeader(
  paragraph: string
): { label: string | null; body: string } {
  const cleaned = cleanInternalPartLabel(paragraph);

  for (const header of HUMAN_HEADERS) {
    const exact = new RegExp(
      `^${header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
      "i"
    );

    if (exact.test(cleaned)) {
      return { label: header, body: "" };
    }

    const withColon = new RegExp(
      `^${header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:—–-]\\s*([\\s\\S]+)$`,
      "i"
    );

    const colonMatch = cleaned.match(withColon);
    if (colonMatch) {
      return { label: header, body: colonMatch[1].trim() };
    }

    const withLineBreak = new RegExp(
      `^${header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n+([\\s\\S]+)$`,
      "i"
    );

    const lineMatch = cleaned.match(withLineBreak);
    if (lineMatch) {
      return { label: header, body: lineMatch[1].trim() };
    }
  }

  return { label: null, body: cleaned };
}

function splitWindowNote(body: string): { note: string | null; rest: string } {
  const dashLead = body.match(/^\s*[—–-]\s*([^.?!]{2,40})[.?!]\s+/);
  if (dashLead) {
    return { note: dashLead[1].trim(), rest: body.slice(dashLead[0].length) };
  }
  return { note: null, rest: body };
}

function classifyProseKind(
  label: string,
  isFirst: boolean
): "prediction" | "currentState" | "whyNow" | "manifestation" | "prose" {
  const normalized = label.trim().toLowerCase();

  if (normalized === "where you are now") {
    return "currentState";
  }

  if (isFirst || normalized === "the prediction") {
    return "prediction";
  }

  if (normalized === "why this is active" || normalized === "why this is active now") {
    return "whyNow";
  }

  if (normalized === "how this is most likely to show up") {
    return "manifestation";
  }

  return "prose";
}

function parseReadingSections(content: string): ParsedSection[] | null {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length < 2) return null;

  const sections: ParsedSection[] = [];

  let phase: "opening" | "windows" | "directives" | "closing" = "opening";
  let pendingLabel: string | null = null;
  let sawStructuredHeader = false;

  for (const rawParagraph of paragraphs) {
    const parsedHeader = splitHumanHeader(rawParagraph);

    if (parsedHeader.label) {
      sawStructuredHeader = true;
    }

    if (parsedHeader.label && !parsedHeader.body) {
      const label = parsedHeader.label;

      if (label === "Dated Windows") {
        phase = "windows";
        pendingLabel = null;
        continue;
      }

      if (label === "The Directive") {
        phase = "directives";
        pendingLabel = null;
        continue;
      }

      if (label === "Bottom Line") {
        phase = "closing";
        pendingLabel = "Bottom Line";
        continue;
      }

      pendingLabel = label;
      continue;
    }

    const para = parsedHeader.body || cleanInternalPartLabel(rawParagraph);
    const labelFromParagraph = parsedHeader.label;

    if (!para) continue;

    if (labelFromParagraph === "Dated Windows") {
      phase = "windows";
      pendingLabel = null;
    } else if (labelFromParagraph === "The Directive") {
      phase = "directives";
      pendingLabel = null;
    } else if (labelFromParagraph === "Bottom Line") {
      phase = "closing";
      pendingLabel = "Bottom Line";
    }

    if (phase === "closing" || labelFromParagraph === "Bottom Line") {
      sections.push({ kind: "closing", body: para });
      pendingLabel = null;
      continue;
    }

    const isWindow = DATE_LEAD_RE.test(para);
    const isDrop = DROP_RE.test(para);
    const isExecute = EXECUTE_RE.test(para);
    const isLock = LOCK_RE.test(para);
    const isDirective = isDrop || isExecute || isLock;

    if (isDirective) {
      phase = "directives";
      pendingLabel = null;

      if (isDrop) {
        sections.push({
          kind: "directive",
          directive: "DROP",
          label: "Drop",
          date: null,
          body: para.replace(DROP_RE, "").trim(),
        });
      } else if (isExecute) {
        const match = para.match(EXECUTE_RE);
        sections.push({
          kind: "directive",
          directive: "EXECUTE",
          label: "Execute by",
          date: match ? extractDateText(match[1]) : null,
          body: para.replace(EXECUTE_RE, "").trim(),
        });
      } else {
        const match = para.match(LOCK_RE);
        sections.push({
          kind: "directive",
          directive: "LOCK",
          label: "Lock in by",
          date: match ? extractDateText(match[1]) : null,
          body: para.replace(LOCK_RE, "").trim(),
        });
      }
      continue;
    }

    if (isWindow) {
      phase = "windows";
      pendingLabel = null;

      const match = para.match(DATE_LEAD_RE);
      const rawBody = para.replace(DATE_LEAD_RE, "");
      const { note, rest } = splitWindowNote(rawBody);

      sections.push({
        kind: "window",
        date: match ? match[1].trim() : null,
        note,
        body: rest.trim(),
      });
      continue;
    }

    if (phase === "windows") {
      sections.push({
        kind: "window",
        date: null,
        note: null,
        body: para,
      });
      pendingLabel = null;
      continue;
    }

    if (phase === "directives") {
      sections.push({
        kind: "directive",
        directive: "GENERAL",
        label: "Directive",
        date: null,
        body: para,
      });
      pendingLabel = null;
      continue;
    }

    const resolvedLabel =
      labelFromParagraph ||
      pendingLabel ||
      (sections.length === 0 ? "The Prediction" : "");

    const kind = classifyProseKind(resolvedLabel, sections.length === 0);

    sections.push({ kind, label: resolvedLabel, body: para });
    pendingLabel = null;
  }

  return sawStructuredHeader && sections.length > 0 ? sections : null;
}

// ─── Main Component ─────────────────────────────────────────────

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

  // ── Reply system state ──
  const [freeRepliesUsed, setFreeRepliesUsed] = useState(0);
  const [replyCreditsRemaining, setReplyCreditsRemaining] = useState<number | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [justPurchased, setJustPurchased] = useState(false);
  const [tailMode, setTailMode] = useState<"reply_pack" | "sub_reply_tail_regular">("reply_pack");

  const followupEndRef = useRef<HTMLDivElement | null>(null);
  const hasMarkedComplete = useRef(false);

  const readingKey = useMemo(() => {
    const p = reading?.pages?.[0];
    return p ? hashKey(p.title + "::" + p.content) : "";
  }, [reading]);

  // ── Fetch reading ──
  useEffect(() => {
    const stored = loadReading();
    if (!stored) {
      router.push("/reading/intake");
      return;
    }
    setReading(stored);
    setIsLoading(false);
  }, [router]);

  // ── Mark reading complete ──
  useEffect(() => {
    if (!reading || !readingKey) return;

    if ((reading as { isSafeResponse?: boolean }).isSafeResponse) {
      hasMarkedComplete.current = true;
      return;
    }

    const completedFlag = "dfp_reading_done_" + readingKey;

    try {
      if (localStorage.getItem(completedFlag) === "1") {
        hasMarkedComplete.current = true;
        return;
      }
    } catch {
      // localStorage unavailable
    }

    if (!hasMarkedComplete.current) {
      hasMarkedComplete.current = true;
      fetch("/api/user/reading-complete", { method: "POST" })
        .then((res) => {
          if (!res.ok) throw new Error("reading-complete failed");
          try {
            localStorage.setItem(completedFlag, "1");
          } catch {
            // ignore
          }
        })
        .catch(() => {
          hasMarkedComplete.current = false;
        });
    }
  }, [reading, readingKey]);

  // ── Restore state from localStorage ──
  useEffect(() => {
    if (!reading || !readingKey) return;

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

    try {
      setFreeRepliesUsed(Math.max(0, Number(localStorage.getItem(`dfp_free_used_${readingKey}`) ?? 0)));
    } catch {
      setFreeRepliesUsed(0);
    }

    try {
      const raw = localStorage.getItem(`dfp_followups_${readingKey}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setFollowups(parsed as FollowupEntry[]);
      }
    } catch {
      // ignore
    }

    let cameFromSuccess = false;
    try {
      const params = new URLSearchParams(window.location.search);
      const returnedMode = params.get("mode");
      cameFromSuccess =
        params.get("payment") === "success" &&
        (returnedMode === "reply_pack" || returnedMode === "sub_reply_tail_regular");
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

    try {
      if (new URLSearchParams(window.location.search).has("payment")) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch {
      // ignore
    }

    setReplyCreditsRemaining(null);
  }, [reading, readingKey]);

  // ── Fetch credits ──
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

  // ─── Group sections ─────────────────────────────────────────────

  const predictionSections =
    parsedSections?.filter((section) => section.kind === "prediction") ?? [];

  const currentStateSections =
    parsedSections?.filter((section) => section.kind === "currentState") ?? [];

  const whyNowSections =
    parsedSections?.filter((section) => section.kind === "whyNow") ?? [];

  const manifestationSections =
    parsedSections?.filter((section) => section.kind === "manifestation") ?? [];

  const additionalProseSections =
    parsedSections?.filter((section) => section.kind === "prose") ?? [];

  const timingSections =
    parsedSections?.filter((section) => section.kind === "window") ?? [];

  const directiveSections =
    parsedSections?.filter((section) => section.kind === "directive") ?? [];

  const closingSections =
    parsedSections?.filter((section) => section.kind === "closing") ?? [];

  const renderContentWithBadges = (content: string) => {
    const parts = content.split(/(\[\[DATE:\s*[^\]]+\]\])/g);
    return parts.map((part, i) => {
      const match = part.match(/\[\[DATE:\s*([^\]]+)\]\]/);
      if (match) {
        const dateText = match[1].trim();
        const isRange = dateText.includes("-") || dateText.includes("to");
        return (
          <span key={i} className={`date-badge ${isRange ? "date-range" : ""}`}>
            {dateText}
          </span>
        );
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  };

  const splitPredictionLead = (body: string) => {
    const sentences =
      body.match(/[^.!?]+[.!?]+(?:["'’”)]*)|[^.!?]+$/g)?.map((s) => s.trim()) ?? [];

    if (sentences.length <= 2) {
      return { lead: body.trim(), rest: "" };
    }

    return {
      lead: sentences.slice(0, 2).join(" "),
      rest: sentences.slice(2).join(" "),
    };
  };

  const handleDownload = async () => {
    if (!reading || !page) return;
    setIsDownloading(true);
    try {
      const plain = page.content.replace(/\[\[DATE:\s*([^\]]+)\]\]/g, "$1");
      const text = `${page.title}\n\n${plain}\n\n— Generated by AstroXL`;
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
          extendedPoints: chart.chartData.extendedPoints,
          houseRulers: chart.chartData.houseRulers,
          mutualReceptions: chart.chartData.mutualReceptions,
          synodicCycles: chart.chartData.synodicCycles,
          midpoints: chart.chartData.midpoints,
          transitsToAngles: chart.chartData.transitsToAngles,
          essentialDignities: chart.chartData.essentialDignities,
          lunarReturn: chart.chartData.lunarReturn,
          eclipseActivations: chart.chartData.eclipseActivations,
          dispositorTree: chart.chartData.dispositorTree,
          conversationHistory: conversationHistory || undefined,
          freeRepliesUsed,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (response.status === 402 || data.code === "NEEDS_REPLY_PACK") {
          if (data.tailMode) setTailMode(data.tailMode);
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

  const startCheckout = async (mode: "reply_pack" | "sub_reply_tail_regular" | "subscription") => {
    if (isPurchasing) return;
    setIsPurchasing(true);
    setFollowupError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (data?.clientSecret) {
        setClientSecret(data.clientSecret);
      } else {
        setFollowupError(data?.error || "Couldn't start checkout. Please try again.");
        setIsPurchasing(false);
      }
    } catch {
      setFollowupError("Couldn't start checkout. Please try again.");
      setIsPurchasing(false);
    }
  };

  const handleBuyReplyPack = () => startCheckout(tailMode);
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

  const isSubscribed = credits?.isSubscribed === true;
  const freeBand = isSubscribed ? 4 : 1;
  const freeRemainingClient = Math.max(0, freeBand - freeRepliesUsed);
  const outOfReplies =
    !isSubscribed &&
    freeRemainingClient <= 0 &&
    replyCreditsRemaining !== null &&
    replyCreditsRemaining <= 0;
  const paywallVisible = !isSubscribed && (showPaywall || outOfReplies);

  return (
    <div
      className="results-root"
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0a0e27 0%, #0b1030 12%, #080c24 24%, #050718 36%, #02030c 48%, #000000 60%, #000000 100%)",
        color: "#e2e8f0",
        fontFamily: "var(--font-sans, ui-sans-serif, system-ui)",
        overflowX: "hidden",
        overflowY: "auto",
      }}
    >
      <style jsx global>{`
        html, body {
          overflow: auto !important;
          height: auto !important;
          min-height: 100vh;
        }

        .results-starfield {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          pointer-events: none;
          z-index: 0;
        }

        /* ─── Reading sections ──────────────────────────────────────────── */
        .reading-title {
          font-family: var(--font-display, Georgia, serif);
          font-weight: 600;
          letter-spacing: -0.01em;
          line-height: 1.15;
        }

        .reading-body {
          width: 100%;
          font-family: var(--font-display, Georgia, serif);
          font-size: 16px;
          line-height: 1.9;
          color: #e2e8f0;
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
        .date-badge.date-range {
          background: linear-gradient(135deg, rgba(94, 234, 212, 0.18), rgba(45, 212, 191, 0.12));
          border-color: rgba(94, 234, 212, 0.35);
          color: #5eead4;
          box-shadow: 0 0 18px rgba(94, 234, 212, 0.12);
        }

        /* ─── Top actions ────────────────────────────────────────────────── */
        .top-actions {
          width: 100%;
          margin-top: 14px;
          margin-bottom: 24px;
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .top-actions .download-btn {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          border: 1px solid rgba(251, 191, 36, 0.4);
          background: rgba(251, 191, 36, 0.06);
          color: #fbbf24;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.2s ease, border-color 0.2s ease;
        }

        .top-actions .download-btn:hover {
          background: rgba(251, 191, 36, 0.12);
          border-color: rgba(251, 191, 36, 0.6);
        }

        .top-actions .done-btn {
          flex: 1;
          height: 48px;
          border-radius: 14px;
          border: none;
          background: #5eead4;
          color: #042f2e;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 0 30px rgba(94, 234, 212, 0.25);
          transition: box-shadow 0.2s ease;
        }

        .top-actions .done-btn:hover {
          box-shadow: 0 0 40px rgba(94, 234, 212, 0.4);
        }

        .reply-count {
          font-size: 11px;
          color: #94a3b8;
          text-align: center;
          margin-bottom: 4px;
        }

        .reply-count strong {
          color: #cbd5e1;
        }

        /* ─── Prediction (hero) ─────────────────────────────────────────── */
        .prediction-feature {
          position: relative;
          margin-top: 4px;
          padding: 28px 8px 30px;
        }

        .prediction-feature::after {
          content: "";
          position: absolute;
          left: 18%;
          right: 18%;
          bottom: 0;
          height: 1px;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(94, 234, 212, 0.22),
            transparent
          );
        }

        .prediction-label {
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(94, 234, 212, 0.88);
          text-align: left;
        }

        .prediction-lead {
          width: 100%;
          margin-top: 14px;
          font-family: var(--font-display, Georgia, serif);
          font-size: 21px;
          line-height: 1.65;
          color: #f8fafc;
          text-align: left;
        }

        .prediction-support {
          width: 100%;
          margin-top: 16px;
          font-family: var(--font-display, Georgia, serif);
          font-size: 15px;
          line-height: 1.85;
          color: #aebbd0;
          text-align: left;
        }

        /* ─── Normal paragraph sections ────────────────────────────────── */
        .context-section {
          width: 100%;
          margin-top: 34px;
          padding-top: 28px;
          border-top: 1px solid rgba(255, 255, 255, 0.07);
        }

        .context-section .section-label {
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 11px;
          font-weight: 650;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(94, 234, 212, 0.9);
          text-align: left;
        }

        .context-section .reading-body {
          width: 100%;
          margin-top: 10px;
        }

        /* ─── Timing (teal) ────────────────────────────────────────────── */
        .reveal-zone {
          margin-top: 38px;
          padding-top: 30px;
          border-top: 1px solid rgba(255, 255, 255, 0.075);
        }

        .reveal-zone-heading {
          margin-bottom: 13px;
          text-align: center;
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 11px;
          font-weight: 650;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(94, 234, 212, 0.92);
        }

        .action-zone-frame {
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 26px;
          padding: 10px;
          background: rgba(5, 8, 24, 0.2);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.025),
            0 22px 70px rgba(0, 0, 0, 0.12);
          backdrop-filter: blur(5px);
        }

        .action-card {
          position: relative;
          border: 1px solid rgba(255, 255, 255, 0.075);
          border-radius: 18px;
          padding: 16px 17px;
          background: rgba(17, 22, 51, 0.46);
        }

        .action-card + .action-card {
          margin-top: 9px;
        }

        .action-card.window {
          border-color: rgba(94, 234, 212, 0.15);
        }

        .action-card-head {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .action-card-label {
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .action-card.window .action-card-label {
          color: #5eead4;
        }

        .action-card-note {
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 12px;
          color: #64748b;
        }

        .action-card-body {
          margin-top: 8px;
          font-family: var(--font-display, Georgia, serif);
          font-size: 15px;
          line-height: 1.8;
          color: #cbd5e1;
          white-space: pre-wrap;
        }

        /* ─── Your Move (gold) ──────────────────────────────────────────── */
        .directive-zone {
          margin-top: 28px;
        }

        .directive-zone .reveal-zone-heading {
          color: rgba(251, 191, 36, 0.95);
        }

        .directive-zone .action-zone-frame {
          border-color: rgba(251, 191, 36, 0.14);
        }

        .action-card.general {
          border-color: rgba(251, 191, 36, 0.2);
        }

        .action-card.general .action-card-label {
          color: #fbbf24;
        }

        .action-card.drop {
          border-color: rgba(248, 113, 113, 0.2);
        }

        .action-card.drop .action-card-label {
          color: #f87171;
        }

        .action-card.execute {
          border-color: rgba(45, 212, 191, 0.2);
        }

        .action-card.execute .action-card-label {
          color: #2dd4bf;
        }

        .action-card.lock {
          border-color: rgba(251, 191, 36, 0.2);
        }

        .action-card.lock .action-card-label {
          color: #fbbf24;
        }

        /* ─── Bottom Line ──────────────────────────────────────────────── */
        .bottom-line-wrap {
          position: relative;
          margin-top: 54px;
          padding: 52px 10px 48px;
          text-align: center;
        }

        .bottom-line-wrap::before {
          content: "";
          position: absolute;
          top: 0;
          left: 16%;
          right: 16%;
          height: 1px;
          background:
            linear-gradient(
              90deg,
              transparent,
              rgba(94, 234, 212, 0.28),
              transparent
            );
        }

        .bottom-line-label {
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(94, 234, 212, 0.9);
        }

        .closing-line {
          max-width: 540px;
          margin: 15px auto 0;
          font-family: var(--font-display, Georgia, serif);
          font-size: 18px;
          line-height: 1.8;
          color: #f8fafc;
          font-style: italic;
          text-align: center;
          white-space: pre-wrap;
          text-shadow: 0 0 24px rgba(226, 232, 240, 0.08);
        }

        /* ─── Sources ───────────────────────────────────────────────────── */
        .sources-wrap {
          margin-top: 34px;
          padding-top: 22px;
          border-top: 1px solid rgba(255, 255, 255, 0.07);
          text-align: center;
        }

        .sources-toggle {
          position: relative;
          overflow: hidden;
          margin: 0 auto;
          padding: 8px 14px;
          border: none;
          background: transparent;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          font-family: var(--font-sans, ui-sans-serif);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #94a3b8;
          transition: color 0.25s ease, text-shadow 0.25s ease;
        }

        .sources-toggle::before {
          content: "";
          position: absolute;
          top: -50%;
          bottom: -50%;
          width: 34%;
          left: -45%;
          transform: skewX(-18deg);
          background:
            linear-gradient(
              90deg,
              transparent,
              rgba(191, 219, 254, 0.26),
              rgba(94, 234, 212, 0.38),
              transparent
            );
          filter: blur(4px);
          animation: sourceStarlight 5.4s ease-in-out infinite;
          pointer-events: none;
        }

        .sources-toggle:hover {
          color: #cbd5e1;
          text-shadow: 0 0 18px rgba(94, 234, 212, 0.28);
        }

        .sources-toggle.open {
          color: #bae6fd;
          text-shadow: 0 0 18px rgba(94, 234, 212, 0.24);
        }

        .sources-chevron {
          transition: transform 0.3s ease, filter 0.3s ease;
        }

        .sources-toggle.open .sources-chevron {
          transform: rotate(180deg);
          filter: drop-shadow(0 0 5px rgba(94, 234, 212, 0.5));
        }

        @keyframes sourceStarlight {
          0%, 68% { left: -45%; opacity: 0; }
          74% { opacity: 1; }
          92% { left: 115%; opacity: 0.85; }
          100% { left: 115%; opacity: 0; }
        }

        /* ─── Follow-up styles ──────────────────────────────────────────── */
        .followup-input {
          width: 100%;
          background: rgba(10, 14, 39, 0.6);
          border: 1px solid rgba(45, 212, 191, 0.25);
          border-radius: 18px;
          color: #e2e8f0;
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

        /* ─── Reduced motion ────────────────────────────────────────────── */
        @media (prefers-reduced-motion: reduce) {
          .sources-toggle::before {
            animation: none !important;
          }
        }
      `}</style>

      <ResultsStarfield />

      <div
        className="relative z-10 mx-auto w-full max-w-[620px] px-4 pt-8"
        style={{
          paddingBottom: "calc(80px + env(safe-area-inset-bottom))",
          minHeight: "100vh",
        }}
      >
        {/* ── Header ── */}
        <header className="flex items-start gap-3">
          <button
            type="button"
            onClick={handleDone}
            aria-label="Back"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 text-center">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Your Direct Insights</p>
            <p className="mt-0.5 text-[13px] text-slate-300">What We've Gathered</p>
          </div>
          <div className="h-11 w-11 shrink-0" aria-hidden="true" />
        </header>

        {/* ── Topic + title ── */}
        <div className="mb-4 text-center">
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

        {/* ── Top actions + reply count ── */}
        <div className="top-actions">
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

        {credits && !credits.isSubscribed && (
          <p className="reply-count">
            <strong>{credits.credits}</strong> credits remaining
          </p>
        )}

        {isSubscribed && freeRemainingClient > 0 && (
          <p className="reply-count">
            <strong>{freeRemainingClient}</strong> free {freeRemainingClient === 1 ? "reply" : "replies"} this reading
          </p>
        )}

        {!isSubscribed && freeRemainingClient > 0 && (
          <p className="reply-count">
            <strong>{freeRemainingClient}</strong> free {freeRemainingClient === 1 ? "reply" : "replies"} remaining
          </p>
        )}

        {!isSubscribed && replyCreditsRemaining !== null && replyCreditsRemaining > 0 && (
          <p className="reply-count">
            <strong>{replyCreditsRemaining}</strong> {replyCreditsRemaining === 1 ? "reply" : "replies"} remaining
          </p>
        )}

        {/* ── THE READING ── */}
        <motion.article
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
        >
          {parsedSections ? (
            <>
              {/* ── 1. THE PREDICTION ── */}
              {predictionSections.map((section, i) => {
                const { lead, rest } = splitPredictionLead(section.body);

                return (
                  <section key={`prediction-${i}`} className="prediction-feature">
                    <p className="prediction-label">The Prediction</p>
                    <p className="prediction-lead">{renderContentWithBadges(lead)}</p>
                    {rest && <p className="prediction-support">{renderContentWithBadges(rest)}</p>}
                  </section>
                );
              })}

              {/* ── 2. WHERE YOU ARE NOW ── */}
              {currentStateSections.map((section, i) => (
                <section key={`current-${i}`} className="context-section">
                  <p className="section-label">Where You Are Now</p>
                  <p className="reading-body">{renderContentWithBadges(section.body)}</p>
                </section>
              ))}

              {/* ── 3. WHY THIS IS ACTIVE NOW ── */}
              {whyNowSections.map((section, i) => (
                <section key={`why-${i}`} className="context-section">
                  <p className="section-label">Why This Is Active Now</p>
                  <p className="reading-body">{renderContentWithBadges(section.body)}</p>
                </section>
              ))}

              {/* ── 4. HOW THIS IS MOST LIKELY TO SHOW UP ── */}
              {manifestationSections.map((section, i) => (
                <section key={`manifestation-${i}`} className="context-section">
                  <p className="section-label">How This Is Most Likely To Show Up</p>
                  <p className="reading-body">{renderContentWithBadges(section.body)}</p>
                </section>
              ))}

              {/* ── Any additional prose ── */}
              {additionalProseSections.map((section, i) => (
                <section key={`additional-${i}`} className="context-section">
                  {section.label && <p className="section-label">{section.label}</p>}
                  <p className="reading-body">{renderContentWithBadges(section.body)}</p>
                </section>
              ))}

              {/* ── 5. DATED WINDOWS / TIMING ── */}
              {timingSections.length > 0 && (
                <section className="reveal-zone">
                  <p className="reveal-zone-heading">Timing</p>
                  <div className="action-zone-frame">
                    {timingSections.map((section, i) => (
                      <div key={`timing-${i}`} className="action-card window">
                        <div className="action-card-head">
                          <CalendarDays className="h-4 w-4 text-teal-300/80" aria-hidden="true" />
                          <span className="action-card-label">
                            {section.date ? "Dated Window" : "Timing"}
                          </span>
                          {section.date && <span className="date-badge">{section.date}</span>}
                          {section.note && <span className="action-card-note">— {section.note}</span>}
                        </div>
                        <p className="action-card-body">{renderContentWithBadges(section.body)}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── 6. THE DIRECTIVE / YOUR MOVE ── */}
              {directiveSections.length > 0 && (
                <section className="reveal-zone directive-zone">
                  <p className="reveal-zone-heading">Your Move</p>
                  <div className="action-zone-frame">
                    {directiveSections.map((section, i) => {
                      const variant =
                        section.directive === "DROP"
                          ? "drop"
                          : section.directive === "EXECUTE"
                            ? "execute"
                            : section.directive === "LOCK"
                              ? "lock"
                              : "general";

                      const visibleLabel =
                        section.directive === "DROP"
                          ? "Drop"
                          : section.directive === "EXECUTE"
                            ? "Execute"
                            : section.directive === "LOCK"
                              ? "Lock In"
                              : "Directive";

                      return (
                        <div key={`directive-${i}`} className={`action-card ${variant}`}>
                          <div className="action-card-head">
                            <span className="action-card-label">{visibleLabel}</span>
                            {section.date && <span className="date-badge">{section.date}</span>}
                          </div>
                          <p className="action-card-body">{renderContentWithBadges(section.body)}</p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ── 7. BOTTOM LINE ── */}
              {closingSections.length > 0 && (
                <div className="bottom-line-wrap">
                  <p className="bottom-line-label">Bottom Line</p>
                  {closingSections.map((section, i) => (
                    <p key={i} className="closing-line">{renderContentWithBadges(section.body)}</p>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="reading-body">{renderContentWithBadges(page.content)}</div>
          )}

          {/* ── Sources ── */}
          {page.sources && page.sources.length > 0 && (
            <div className="sources-wrap">
              <button
                type="button"
                className={`sources-toggle ${showSources ? "open" : ""}`}
                onClick={() => setShowSources((s) => !s)}
                aria-expanded={showSources}
              >
                <span>Astrological Sources</span>
                <ChevronDown className="sources-chevron h-3.5 w-3.5" />
              </button>

              <AnimatePresence>
                {showSources && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="overflow-hidden text-left"
                  >
                    <div className="mt-3 space-y-2.5">
                      {page.sources.map((src, i) => {
                        const hasDate = src.placements.includes("exact on");
                        return (
                          <div key={i} className="rounded-xl bg-black/25 px-3.5 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-300/80">
                              {src.section}
                              {hasDate && <span className="ml-2 text-[9px] text-yellow-400/60">⚡ dated</span>}
                            </p>
                            <p className="mt-1 text-[12px] leading-5 text-slate-400">{src.placements}</p>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </motion.article>

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
            <div className="purchase-success">
              ✓ {isSubscribed ? "4" : "2"} replies added — ask away.
            </div>
          )}

          {paywallVisible ? (
            <div className="paywall-card">
              <p className="paywall-title">
                {isSubscribed ? "You've used your 4 free replies" : "You've used your free replies"}
              </p>
              <p className="paywall-sub">
                {isSubscribed
                  ? "As a subscriber, 4 more are half-price."
                  : "Keep the conversation going and get even more clarity."}
              </p>
              <button
                type="button"
                className="paywall-buy"
                onClick={handleBuyReplyPack}
                disabled={isPurchasing}
              >
                {isPurchasing ? "Opening checkout…" : (isSubscribed ? "Get 4 more replies · $2" : "Get 2 more replies · $2")}
              </button>
              {!isSubscribed && (
                <button
                  type="button"
                  className="paywall-sub-link"
                  onClick={handleSubscribe}
                  disabled={isPurchasing}
                >
                  or subscribe for more each month
                </button>
              )}
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
                <p className="mt-2 text-center text-[11px] text-slate-500">
                  {freeRemainingClient > 0 ? `${freeRemainingClient} free ${freeRemainingClient === 1 ? "reply" : "replies"} this reading` : "Half-price replies available"}
                </p>
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

      {/* ── Embedded Stripe checkout modal ── */}
      {clientSecret && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(4, 6, 17, 0.85)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            overflowY: "auto",
            padding: "24px 16px calc(24px + env(safe-area-inset-bottom))",
          }}
        >
          <div style={{ width: "100%", maxWidth: 480 }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setClientSecret(null);
                  setIsPurchasing(false);
                }}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#e2e8f0",
                  borderRadius: 9999,
                  width: 36,
                  height: 36,
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                }}
                aria-label="Close checkout"
              >
                ✕
              </button>
            </div>
            <div style={{ borderRadius: 16, overflow: "hidden", background: "#fff" }}>
              <EmbeddedCheckoutProvider
                stripe={stripePromise}
                options={{
                  clientSecret,
                  onComplete: () => {
                    setClientSecret(null);
                    setIsPurchasing(false);
                    setJustPurchased(true);
                    setShowPaywall(false);
                    setReplyCreditsRemaining(null);
                    try {
                      if (readingKey) localStorage.removeItem(`dfp_paywall_${readingKey}`);
                    } catch {
                      // ignore
                    }
                  },
                }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}