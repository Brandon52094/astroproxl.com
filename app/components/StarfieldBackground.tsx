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

    // ── Zodiac constellations ────────────────────────────────────────────────────
    // Fixed shapes that hold still while stars drift.
    const constellations = [
      { cx: 0.20, cy: 0.16, s: 0.11, stars: [[0,0],[0.7,0.05],[0.35,0.5],[0.2,0.95],[0.5,0.95],[0.35,0.7],[-0.05,1.35],[0.75,1.3]], lines: [[0,1],[0,2],[1,2],[2,3],[2,4],[3,4],[3,6],[4,7]] },
      { cx: 0.74, cy: 0.14, s: 0.12, stars: [[0,0.2],[0.25,0],[0.5,0.15],[0.55,0.5],[1,0.75],[0.6,0.85],[0.15,0.55]], lines: [[0,1],[1,2],[2,3],[3,4],[3,5],[0,6],[6,5]] },
      { cx: 0.16, cy: 0.60, s: 0.11, stars: [[0,0],[0.4,0.3],[0.7,0.25],[1.1,0.05],[0.6,0.55],[0.9,0.7]], lines: [[0,1],[1,2],[2,3],[1,4],[4,5]] },
      { cx: 0.72, cy: 0.78, s: 0.10, stars: [[0,0.4],[0.35,0.45],[0.7,0.4],[1.0,0.5],[1.0,0.15],[0.65,0.05],[0.35,0.1]], lines: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,0]] },
    ];
    const cstars: { c: number; i: number; ph: number; sp: number }[] = [];
    constellations.forEach((c, ci) => {
      c.stars.forEach((_, i) => {
        cstars.push({ c: ci, i, ph: Math.random() * 6.28, sp: Math.random() * 0.015 + 0.005 });
      });
    });
    const cpx = (c: typeof constellations[0], p: number[], w: number, h: number) => ({
      x: (c.cx + p[0] * c.s) * w,
      y: (c.cy + p[1] * c.s) * h,
    });

    let raf = 0;
    const frame = () => {
      const w = W(), h = H();
      ctx.clearRect(0, 0, w, h);

      // ── Parallax stars ──
      for (let L = 0; L < 3; L++) {
        const arr = parallax[L];
        for (const a of arr) {
          a.x -= psp[L] / w;
          if (a.x < 0) { a.x = 1; a.y = Math.random(); }
          ctx.fillStyle = `rgba(219,234,254,${pa[L]})`;
          ctx.beginPath(); ctx.arc(a.x * w, a.y * h, a.r, 0, 7); ctx.fill();
        }
      }

      // ── Drifting constellation stars (ambient) ──
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

      // ── Zodiac constellation lines ──
      constellations.forEach((c) => {
        ctx.strokeStyle = "rgba(147,197,253,0.28)";
        ctx.lineWidth = 0.8;
        c.lines.forEach((ln) => {
          const A = cpx(c, c.stars[ln[0]], w, h);
          const B = cpx(c, c.stars[ln[1]], w, h);
          ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
        });
      });

      // ── Zodiac constellation stars (brighter than ambient so shapes read) ──
      for (const s of cstars) {
        s.ph += s.sp;
        const tw = (Math.sin(s.ph) + 1) / 2;
        const c = constellations[s.c];
        const pt = cpx(c, c.stars[s.i], w, h);
        ctx.fillStyle = `rgba(226,232,240,${0.55 + tw * 0.45})`;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 1.6 + tw * 0.6, 0, 7); ctx.fill();
      }

      // ── Twinkling stars ──
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
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}
    />
  );
}