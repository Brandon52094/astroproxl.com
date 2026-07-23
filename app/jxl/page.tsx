"use client";

/**
 * JXL TEST HARNESS — THROWAWAY. Delete once the real panel exists.
 *
 * Deliberately plain: no sky, no animation, no styling flourish. The only job
 * is to let you read real JXL output and judge the words. Type instead of
 * speaking (voice comes later — the route doesn't care where the text is from).
 *
 * Put at: app/jxl/test/page.tsx
 */

import React, { useState } from "react";
import { loadChart } from "@/lib/chartStore";

interface Window_ {
  date: string;
  body: string;
}
interface Directive {
  type: string;
  date: string | null;
  body: string;
}
interface JxlResult {
  title: string;
  answer: string;
  windows: Window_[];
  directives: Directive[];
  confirmation: string;
  careNote?: string | null;
  isSafeResponse?: boolean;
  riskLevel?: string;
  replyNumber: number | null;
}

const SAMPLES = [
  "I have a settlement hearing next week and I keep going back and forth on whether to accept what they offered. Something feels off about it but I can't tell if that's just my anxiety.",
  "Why does this keep happening to me? Every time I get close to something good I sabotage it. I don't need a date, I just want to understand the pattern.",
  "My business partner has been weird with me for months and I don't know if I'm imagining it or if something is actually going on.",
  "I've been in a really heavy depressive stretch this month and I feel completely trapped. What is going on astrologically?",
];

export default function JxlTestPage() {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Array<{ question: string; answer: string }>>([]);
  const [results, setResults] = useState<JxlResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const ask = async () => {
    const q = question.trim();
    if (!q || loading) return;

    const chart = loadChart();
    if (!chart?.chartData) {
      setError("No chart in localStorage. Run a normal reading first, then come back.");
      return;
    }

    setLoading(true);
    setError(null);
    const started = Date.now();

    try {
      const res = await fetch("/api/jxl/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          conversationHistory: history,
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
        }),
      });

      const data = await res.json();
      setElapsed(Date.now() - started);

      if (!res.ok) {
        setError(`${res.status} — ${data.error ?? "unknown error"}`);
        return;
      }

      setResults((prev) => [...prev, data as JxlResult]);
      // Safe responses don't count as a turn, so they don't enter history.
      if (!data.isSafeResponse) {
        setHistory((prev) => [...prev, { question: q, answer: data.answer }]);
      }
      setQuestion("");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setHistory([]);
    setResults([]);
    setError(null);
    setElapsed(null);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f1115", color: "#e6e9f5", padding: 24 }}>
      <div style={{ maxWidth: 720, margin: "0 auto", fontFamily: "ui-sans-serif, system-ui" }}>
        <h1 style={{ fontSize: 18, marginBottom: 4 }}>JXL output test</h1>
        <p style={{ fontSize: 13, color: "#8b93a7", marginBottom: 20 }}>
          Plain on purpose. Read the words, not the design. Reply {history.length + 1} of 3.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {SAMPLES.map((s, i) => (
            <button
              key={i}
              onClick={() => setQuestion(s)}
              style={{
                fontSize: 11,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #2b3040",
                background: "#171a22",
                color: "#9aa3b8",
                cursor: "pointer",
              }}
            >
              sample {i + 1}
            </button>
          ))}
          <button
            onClick={reset}
            style={{
              fontSize: 11,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #3a2b2b",
              background: "#1f1717",
              color: "#c98b8b",
              cursor: "pointer",
            }}
          >
            reset session
          </button>
        </div>

        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={4}
          placeholder="Say the messy version — the way you'd actually say it out loud."
          style={{
            width: "100%",
            background: "#171a22",
            border: "1px solid #2b3040",
            borderRadius: 10,
            color: "#e6e9f5",
            padding: 12,
            fontSize: 15,
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />

        <button
          onClick={ask}
          disabled={loading || !question.trim()}
          style={{
            marginTop: 10,
            padding: "10px 18px",
            borderRadius: 10,
            border: "none",
            background: loading ? "#2b3040" : "#5eead4",
            color: loading ? "#8b93a7" : "#042f2e",
            fontWeight: 600,
            fontSize: 14,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "asking…" : "Ask"}
        </button>
        {elapsed !== null && (
          <span style={{ marginLeft: 12, fontSize: 12, color: "#6b7280" }}>{(elapsed / 1000).toFixed(1)}s</span>
        )}

        {error && (
          <pre
            style={{
              marginTop: 16,
              padding: 12,
              background: "#2a1416",
              border: "1px solid #4a2226",
              borderRadius: 8,
              color: "#f0a8a8",
              fontSize: 12,
              whiteSpace: "pre-wrap",
            }}
          >
            {error}
          </pre>
        )}

        {results.map((r, i) => (
          <div
            key={i}
            style={{
              marginTop: 28,
              paddingTop: 20,
              borderTop: "1px solid #23283a",
            }}
          >
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <Tag label={`reply ${r.replyNumber ?? "—"}`} />
              <Tag label={`risk: ${r.riskLevel ?? "none"}`} tone={r.isSafeResponse ? "warn" : "dim"} />
              <Tag label={`windows: ${r.windows?.length ?? 0}`} tone={r.windows?.length ? "ok" : "dim"} />
              <Tag label={`directives: ${r.directives?.length ?? 0}`} tone={r.directives?.length ? "ok" : "dim"} />
              {r.isSafeResponse && <Tag label="SAFE RESPONSE — blocked" tone="warn" />}
            </div>

            <h2 style={{ fontSize: 24, fontFamily: "Georgia, serif", margin: "0 0 14px" }}>{r.title}</h2>

            <div style={{ fontSize: 16, lineHeight: 1.75, whiteSpace: "pre-wrap", color: "#cbd2e2" }}>
              {r.answer}
            </div>

            {r.windows?.length > 0 && (
              <div style={{ marginTop: 18 }}>
                {r.windows.map((w, j) => (
                  <div
                    key={j}
                    style={{
                      marginTop: 8,
                      padding: "10px 14px",
                      border: "1px solid #4a3a12",
                      background: "#1d1a10",
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ color: "#fbbf24", fontSize: 13, fontWeight: 700, letterSpacing: "0.04em" }}>
                      {w.date}
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.6, marginTop: 4, color: "#cbd2e2" }}>{w.body}</div>
                  </div>
                ))}
              </div>
            )}

            {r.directives?.length > 0 && (
              <div style={{ marginTop: 14 }}>
                {r.directives.map((d, j) => (
                  <div key={j} style={{ marginTop: 8, paddingLeft: 12, borderLeft: "2px solid #2dd4bf" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#2dd4bf" }}>
                      {d.type}
                      {d.date ? ` · ${d.date}` : ""}
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.6, marginTop: 3, color: "#cbd2e2" }}>{d.body}</div>
                  </div>
                ))}
              </div>
            )}

            {r.confirmation && (
              <p
                style={{
                  marginTop: 20,
                  paddingTop: 14,
                  borderTop: "1px solid #23283a",
                  fontFamily: "Georgia, serif",
                  fontStyle: "italic",
                  fontSize: 15,
                  lineHeight: 1.7,
                  color: "#aeb6cc",
                }}
              >
                {r.confirmation}
              </p>
            )}

            {r.careNote && (
              <p
                style={{
                  marginTop: 14,
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "#141d1c",
                  border: "1px solid #1f3a36",
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "#8fbfb6",
                }}
              >
                {r.careNote}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Tag({ label, tone = "dim" }: { label: string; tone?: "dim" | "ok" | "warn" }) {
  const colors = {
    dim: { bg: "#171a22", bd: "#2b3040", fg: "#8b93a7" },
    ok: { bg: "#111f1d", bd: "#1f3a36", fg: "#5eead4" },
    warn: { bg: "#241614", bd: "#4a2620", fg: "#f0a87a" },
  }[tone];
  return (
    <span
      style={{
        fontSize: 10,
        padding: "3px 8px",
        borderRadius: 6,
        background: colors.bg,
        border: `1px solid ${colors.bd}`,
        color: colors.fg,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}