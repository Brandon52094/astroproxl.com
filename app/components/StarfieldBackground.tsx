"use client";

import React, { useEffect, useRef } from "react";

export default function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ── Type definitions for the star arrays ──
    type PStar = { x: number; y: number; r: number };
    type TStar = { x: number; y: number; r: number; ph: number; sp: number };
    type CStar = { x: number; y: number; vx: number; vy: number; r: number };

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = () => canvas.offsetWidth;
    const H = () => canvas.offsetHeight;
    const resize = () => {
      canvas.width = W() * dpr;
      canvas.height = H() * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Parallax depth layers
    const parallax: PStar[][] = [];
    const pc = [26, 16, 9], psp = [0.04, 0.09, 0.16], psz = [0.5, 0.8, 1.2], pa = [0.28, 0.5, 0.75];
    for (let L = 0; L < 3; L++) {
      const arr: PStar[] = [];
      for (let i = 0; i < pc[L]; i++) arr.push({ x: Math.random(), y: Math.random(), r: Math.random() * psz[L] + 0.3 });
      parallax.push(arr);
    }

    // Twinkling stars
    const twink: TStar[] = [];
    for (let i = 0; i < 34; i++) twink.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.1 + 0.4, ph: Math.random() * 6.28, sp: Math.random() * 0.025 + 0.008 });

    // Drifting constellation stars
    const con: CStar[] = [];
    for (let i = 0; i < 12; i++) con.push({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.0002, vy: (Math.random() - 0.5) * 0.0002, r: Math.random() * 1.2 + 0.7 });

    let raf = 0;
    const frame = () => {
      const w = W(), h = H();
      ctx.clearRect(0, 0, w, h);

      for (let L = 0; L < 3; L++) {
        const arr = parallax[L];
        for (const a of arr) {
          a.x -= psp[L] / w;
          if (a.x < 0) { a.x = 1; a.y = Math.random(); }
          ctx.fillStyle = `rgba(219,234,254,${pa[L]})`;
          ctx.beginPath(); ctx.arc(a.x * w, a.y * h, a.r, 0, 7); ctx.fill();
        }
      }

      for (const a of con) {
        a.x += a.vx; a.y += a.vy;
        if (a.x < 0 || a.x > 1) a.vx *= -1;
        if (a.y < 0 || a.y > 1) a.vy *= -1;
      }
      for (let i = 0; i < con.length; i++) {
        for (let j = i + 1; j < con.length; j++) {
          const a = con[i], b = con[j];
          const dx = (a.x - b.x) * w, dy = (a.y - b.y) * h;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 80) {
            ctx.strokeStyle = `rgba(147,197,253,${0.22 * (1 - d / 80)})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath(); ctx.moveTo(a.x * w, a.y * h); ctx.lineTo(b.x * w, b.y * h); ctx.stroke();
          }
        }
      }
      for (const a of con) {
        ctx.fillStyle = "rgba(191,219,254,0.85)";
        ctx.beginPath(); ctx.arc(a.x * w, a.y * h, a.r, 0, 7); ctx.fill();
      }

      for (const a of twink) {
        a.ph += a.sp;
        const tw = (Math.sin(a.ph) + 1) / 2;
        ctx.fillStyle = `rgba(226,232,240,${0.2 + tw * 0.6})`;
        ctx.beginPath(); ctx.arc(a.x * w, a.y * h, a.r * (0.7 + tw * 0.4), 0, 7); ctx.fill();
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
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    />
  );
}