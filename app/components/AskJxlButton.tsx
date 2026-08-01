"use client";

import React, { useEffect, useRef } from "react";

/** Waveform look — aurora borealis palette. */
const WAVE = {
  speed: 1.0,
  colors: ["#34d399", "#22d3ee", "#38bdf8", "#a855f7"],
  idle: 0.32,
  sensitivity: 0.9,
  lines: 4,
  thickness: 2.4,
  glow: 12,
};

export interface AskJxlButtonProps {
  label?: string;
  subtitle?: string;
  onClick?: () => void;
  className?: string;
  /** Box height in px. Defaults to 184 (the shell size). */
  height?: number;
}

/**
 * "Ask JXL" button with a self-running aurora waveform background
 * and an aurora glow behind the container edges.
 *
 * The waveform rendering is lifted from JxlPanel's mic-reactive visual,
 * but the microphone analyser is replaced by a self-generating "energy"
 * value (sine waves), so it animates continuously with no mic.
 */
export default function AskJxlButton({
  label = "Ask JXL",
  subtitle = "Ask anything about your chart",
  onClick,
  className,
  height = 184,
}: AskJxlButtonProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const c2d = canvas?.getContext("2d") ?? null;
    if (!canvas || !c2d) return;

    let time = 0;
    let smooth = 0;
    let cw = 0, ch = 0, dpr = 1;

    const fit = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      cw = r.width; ch = r.height;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    window.addEventListener("resize", fit);

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const draw = () => {
      if (!cw || !ch) fit();
      time += 0.016 * WAVE.speed;

      // ── SELF-RUNNING "energy" (replaces mic getByteFrequencyData) ──
      let energy = 0.5
        + 0.30 * Math.sin(time * 0.8)
        + 0.12 * Math.sin(time * 1.7 + 1.1)
        + 0.06 * Math.sin(time * 3.1);
      energy = Math.max(0, Math.min(1, energy));
      smooth += (energy - smooth) * 0.18;

      const cy = ch / 2;
      c2d.clearRect(0, 0, cw, ch);
      const grad = c2d.createLinearGradient(0, 0, cw, 0);
      WAVE.colors.forEach((col, i) => grad.addColorStop(i / (WAVE.colors.length - 1), col));
      c2d.lineCap = "round";
      c2d.lineJoin = "round";
      c2d.globalCompositeOperation = "lighter";

      const amp = (WAVE.idle + smooth * WAVE.sensitivity) * (ch * 0.44);
      for (let l = 0; l < WAVE.lines; l++) {
        const lf = WAVE.lines > 1 ? l / (WAVE.lines - 1) : 0;
        const phase = time * (1 + lf * 0.45) + l * 0.7;
        const la = amp * (1 - lf * 0.14);
        c2d.beginPath();
        for (let x = 0; x <= cw; x += 3) {
          const tx = x / cw;
          const env = Math.pow(Math.sin(tx * Math.PI), 0.85);
          const y = cy + env * la * (
            Math.sin(tx * Math.PI * 4 + phase) * 0.6 +
            Math.sin(tx * Math.PI * 7 - phase * 0.7 + l) * 0.4
          );
          x === 0 ? c2d.moveTo(x, y) : c2d.lineTo(x, y);
        }
        c2d.strokeStyle = grad;
        c2d.globalAlpha = 0.16 + (1 - lf) * 0.22;
        c2d.lineWidth = WAVE.thickness * (0.7 + (1 - lf) * 0.8);
        c2d.shadowBlur = WAVE.glow;
        c2d.shadowColor = "rgba(45,212,191,0.5)";
        c2d.stroke();
      }

      // Hot near-white core (minty aurora halo)
      const coreAmp = (WAVE.idle * 0.5 + smooth * WAVE.sensitivity * 1.15) * (ch * 0.44);
      c2d.beginPath();
      for (let x = 0; x <= cw; x += 2) {
        const tx = x / cw;
        const env = Math.pow(Math.sin(tx * Math.PI), 0.9);
        const y = cy + env * coreAmp * Math.sin(tx * Math.PI * 5 + time * 1.4) * 0.9;
        x === 0 ? c2d.moveTo(x, y) : c2d.lineTo(x, y);
      }
      c2d.globalAlpha = 0.3 + smooth * 0.5;
      c2d.strokeStyle = "rgba(255,255,255,0.92)";
      c2d.lineWidth = Math.max(1, WAVE.thickness * 0.6);
      c2d.shadowBlur = WAVE.glow * 1.3;
      c2d.shadowColor = "rgba(190,255,225,0.7)";
      c2d.stroke();

      c2d.globalCompositeOperation = "source-over";
      c2d.globalAlpha = 1;
      c2d.shadowBlur = 0;

      if (!reduce) rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", fit);
    };
  }, []);

  return (
    <div className={`ask-jxl-wrap${className ? ` ${className}` : ""}`}>
      {/* Aurora glow bleeding out behind the container edges */}
      <div className="ask-jxl-glow" aria-hidden="true" />

      <button type="button" onClick={onClick} className="ask-jxl-btn" style={{ height }}>
        <canvas ref={canvasRef} className="ask-jxl-wave" aria-hidden="true" />
        <span className="ask-jxl-label">{label}</span>
        {subtitle && <span className="ask-jxl-sub">{subtitle}</span>}
      </button>

      <style jsx>{`
        .ask-jxl-wrap { position: relative; width: 100%; }

        .ask-jxl-glow {
          position: absolute;
          inset: -10px;
          border-radius: 38px;
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
          border-radius: 28px;
          border: 1px solid rgba(129,140,248,0.2);   /* indigo-400/20 */
          background: rgba(0,0,0,0.3);                /* bg-black/30 */
          overflow: hidden;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: border-color 0.25s ease;
        }
        .ask-jxl-btn:hover { border-color: rgba(129,140,248,0.35); }

        .ask-jxl-wave {
          position: absolute; inset: 0;
          width: 100%; height: 100%;
          z-index: 0; pointer-events: none;
        }

        .ask-jxl-label {
          position: relative; z-index: 2;
          font-size: 36px; font-weight: 800; letter-spacing: 0.05em; line-height: 1;
          background: linear-gradient(180deg, #ffffff 0%, #cffaf0 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent; color: transparent;
          filter: drop-shadow(0 2px 10px rgba(0,0,0,0.55)) drop-shadow(0 0 20px rgba(120,255,214,0.35));
        }
        .ask-jxl-sub {
          position: relative; z-index: 2;
          font-size: 11px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase;
          color: rgba(207,250,240,0.7);
          text-shadow: 0 1px 8px rgba(0,0,0,0.6);
        }

        @media (prefers-reduced-motion: reduce) {
          .ask-jxl-glow { animation: none !important; }
        }
      `}</style>
    </div>
  );
}