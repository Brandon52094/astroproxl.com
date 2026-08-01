"use client";

import React from "react";

export interface AskJxlButtonProps {
  label?: string;
  subtitle?: string;
  onClick?: () => void;
  className?: string;
  /** Box height in px. Defaults to 104. */
  height?: number;
}

/**
 * "Ask JXL" button — plain translucent card.
 * No canvas / waveform. Any glow (e.g. the page's bottom aurora) shows
 * through the translucent background from behind.
 */
export default function AskJxlButton({
  label = "Ask JXL",
  subtitle = "Ask anything about your chart",
  onClick,
  className,
  height = 104,
}: AskJxlButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height,
        borderRadius: 24,
        border: "1px solid rgba(129,140,248,0.28)",
        background: "rgba(7,10,22,0.5)",   // translucent so the aurora behind shows through
        overflow: "hidden",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        boxShadow: "0 8px 44px rgba(52,211,153,0.12)",
      }}
    >
      <span
        style={{
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: "0.05em",
          lineHeight: 1,
          background: "linear-gradient(180deg, #ffffff 0%, #cffaf0 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          color: "transparent",
          filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.6))",
        }}
      >
        {label}
      </span>
      {subtitle && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "rgba(207,250,240,0.8)",
          }}
        >
          {subtitle}
        </span>
      )}
    </button>
  );
}