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
 * "Ask JXL" button — no waveform. Just the button with an animated
 * aurora glow bleeding out behind its edges (CSS only, no canvas).
 */
export default function AskJxlButton({
  label = "Ask JXL",
  onClick,
  className,
  height = 104,
}: AskJxlButtonProps) {
  return (
    <div className={`ask-jxl-wrap${className ? ` ${className}` : ""}`}>
      {/* Aurora glow bleeding out behind the container edges */}
      <div className="ask-jxl-glow" aria-hidden="true" />

      <button type="button" onClick={onClick} className="ask-jxl-btn" style={{ height }}>
        <span className="ask-jxl-label">{label}</span>
        <span className="ask-jxl-sub">
          Real-time astrological guidance on your current situation
          <span className="l2">Just press-and-hold, speak what's on your mind</span>
        </span>
      </button>

      <style jsx>{`
        .ask-jxl-wrap { position: relative; width: 100%; }

        .ask-jxl-glow {
          position: absolute;
          inset: -10px;
          border-radius: 34px;
          z-index: 0;
          pointer-events: none;
          background: linear-gradient(120deg, #34d399, #22d3ee, #38bdf8, #a855f7, #34d399);
          background-size: 220% 220%;
          filter: blur(22px);
          opacity: 0.5;
          animation: auroraGlow 9s ease-in-out infinite;
        }
        @keyframes auroraGlow {
          0%, 100% { background-position: 0% 50%; opacity: 0.42; }
          50% { background-position: 100% 50%; opacity: 0.62; }
        }

        .ask-jxl-btn {
          position: relative;
          z-index: 1;
          width: 100%;
          border-radius: 24px;
          border: 1px solid rgba(129,140,248,0.22);
          background: rgba(7,10,22,0.72);
          overflow: hidden;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          transition: border-color 0.25s ease;
        }
        .ask-jxl-btn:hover { border-color: rgba(129,140,248,0.4); }

        .ask-jxl-label {
          position: relative;
          z-index: 2;
          font-size: 28px;
          font-weight: 800;
          letter-spacing: 0.12em;
          line-height: 1;
          text-transform: uppercase;
          background: linear-gradient(180deg, #ffffff 0%, #cffaf0 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
          filter: drop-shadow(0 2px 8px rgba(0,0,0,0.55));
        }
        .ask-jxl-sub {
          position: relative;
          z-index: 2;
          text-align: center;
          font-size: 11.5px;
          font-weight: 500;
          line-height: 1.5;
          letter-spacing: 0.02em;
          color: rgba(214,245,238,0.85);
          text-shadow: 0 1px 8px rgba(0,0,0,0.55);
        }
        .ask-jxl-sub .l2 {
          display: block;
          color: rgba(167,243,208,0.85);
          font-weight: 600;
        }

        @media (prefers-reduced-motion: reduce) {
          .ask-jxl-glow { animation: none !important; }
        }
      `}</style>
    </div>
  );
}