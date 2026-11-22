"use client";

import React from "react";

/**
 * Shared reading ambience: the themed symbols that twinkle around the screen
 * for each reading (hearts for Love, dollar signs for Money, …).
 *
 * Used by the intake screen (fading in at ~75% of a press-and-hold) and by the
 * preparing screen. Both place the symbols at the same spots, so the handoff
 * through the fade to black reads as one continuous scene.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Reading themes — the same colors as the reading tiles and the gold mic on the
// intake screen. Values are "r,g,b" so they can be used at any opacity.
//   c — main color (glow, orb rings)
//   l — light color (inner ring, labels, button, symbols)
// ─────────────────────────────────────────────────────────────────────────────
export type ThemeKey = "love" | "money" | "career" | "other" | "ask" | "default";

export const READING_THEMES: Record<ThemeKey, { c: string; l: string; label: string }> = {
  love:    { c: "251,113,133", l: "253,164,175", label: "Love Reading" },
  money:   { c: "52,211,153",  l: "134,239,172", label: "Money Reading" },
  career:  { c: "59,130,246",  l: "147,197,253", label: "Career Reading" },
  other:   { c: "139,92,246",  l: "196,181,253", label: "What’s Coming" },
  ask:     { c: "218,183,104", l: "255,239,195", label: "Ask Anything" },
  default: { c: "45,212,191",  l: "94,234,212",  label: "Your Reading" },
};

/**
 * The intake saves `area` as the tile id ("love" | "money" | "career" | "other")
 * or "ask-anything". `topic` is the engine topic, where What's Coming is
 * "general" — so read `area` first and fall back to `topic`.
 */
export function resolveThemeKey(intake: unknown): ThemeKey {
  const rec = (intake ?? {}) as { area?: unknown; topic?: unknown };
  const pick = (v: unknown): ThemeKey | null => {
    if (typeof v !== "string") return null;
    switch (v.trim().toLowerCase()) {
      case "love": return "love";
      case "money": return "money";
      case "career": return "career";
      case "other":
      case "general": return "other";
      case "ask":
      case "ask-anything": return "ask";
      default: return null;
    }
  };
  return pick(rec.area) ?? pick(rec.topic) ?? "default";
}

// Small themed symbols that twinkle with the stars. 24×24 paths.
const SYMBOL_PATHS: Record<Exclude<ThemeKey, "default">, { d: string; stroke?: boolean }> = {
  love:   { d: "M12 21s-7.5-4.6-9.6-9.1C1 8.8 2.9 5 6.6 5c2.1 0 3.6 1.2 4.4 2.5.8-1.3 2.3-2.5 4.4-2.5 3.7 0 5.6 3.8 4.2 6.9C19.5 16.4 12 21 12 21z" },
  money:  { d: "M12 2.5v19M16.5 7.3c0-1.9-2-3-4.5-3s-4.5 1.2-4.5 3.3c0 4.6 9 2.6 9 7.4 0 2-2 3.3-4.5 3.3s-4.5-1.2-4.5-3.1", stroke: true },
  career: { d: "M3 17l6-6 4 4 8-8M15 7h6v6", stroke: true },
  other:  { d: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" },
  ask:    { d: "M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" },
};

// [left %, top %, size px, rotation deg] — kept toward the edges, behind the content.
const SYMBOL_SPOTS: Array<[number, number, number, number]> = [
  [9, 11, 14, -12], [87, 8, 11, 10], [20, 29, 10, 8], [91, 36, 13, -8], [6, 56, 12, 6],
  [82, 61, 10, -14], [15, 80, 13, 12], [72, 87, 11, -6], [94, 76, 9, 4],
];

interface ReadingAmbienceProps {
  themeKey: ThemeKey;
  /** Fades the whole layer in and out. Defaults to shown. */
  visible?: boolean;
  /** Adds the soft themed color glow behind the symbols. */
  glow?: boolean;
  /** Fade duration for `visible` changes, in ms. */
  fadeMs?: number;
}

export default function ReadingAmbience({
  themeKey,
  visible = true,
  glow = false,
  fadeMs = 700,
}: ReadingAmbienceProps) {
  const theme = READING_THEMES[themeKey];
  const symbol = themeKey === "default" ? null : SYMBOL_PATHS[themeKey];

  return (
    <div
      className="ambience"
      aria-hidden="true"
      style={{
        opacity: visible ? 1 : 0,
        transition: `opacity ${fadeMs}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        "--c": `rgb(${theme.c})`,
        "--l": `rgb(${theme.l})`,
      } as React.CSSProperties}
    >
      <style jsx>{`
        .ambience {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }
        .ambience-glow {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 50% 18%, color-mix(in srgb, var(--c) 12%, transparent), transparent 34%),
            radial-gradient(circle at 85% 82%, color-mix(in srgb, var(--l) 7%, transparent), transparent 28%);
        }

        /* Themed symbols — twinkle like the stars, subtle unless you look */
        .sym {
          position: absolute;
          color: var(--l);
          opacity: var(--o1);
          transform: translate(-50%, -50%) rotate(var(--r));
          animation: symTwinkle ease-in-out infinite;
        }
        .sym svg { display: block; width: 100%; height: 100%; overflow: visible; }
        @keyframes symTwinkle {
          0%, 100% { opacity: var(--o1); transform: translate(-50%, -50%) rotate(var(--r)) scale(1); }
          50% { opacity: var(--o2); transform: translate(-50%, -50%) rotate(var(--r)) scale(1.15); }
        }

        @media (prefers-reduced-motion: reduce) {
          .sym { animation: none; }
        }
      `}</style>

      {glow && <div className="ambience-glow" />}

      {symbol &&
        SYMBOL_SPOTS.map(([left, top, size, rotate], j) => {
          const lo = 0.1 + (j % 3) * 0.03;
          return (
            <span
              key={`${themeKey}-${j}`}
              className="sym"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                width: size,
                height: size,
                "--r": `${rotate}deg`,
                "--o1": lo,
                "--o2": lo + 0.26,
                animationDuration: `${3.4 + (j % 4) * 0.8}s`,
                animationDelay: `${(j * 0.9) % 4}s`,
              } as React.CSSProperties}
            >
              <svg viewBox="0 0 24 24">
                {symbol.stroke ? (
                  <path d={symbol.d} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <path d={symbol.d} fill="currentColor" />
                )}
              </svg>
            </span>
          );
        })}
    </div>
  );
}
