"use client";

import React, { useEffect, useRef } from "react";

export default function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    type Star = {
      x: number;
      y: number;
      r: number;
      a: number;
    };

    type TStar = {
      x: number;
      y: number;
      r: number;
      ph: number;
      sp: number;
      glow: number;
    };

    type CStar = {
      x: number;
      y: number;
      r: number;
    };

    type DStar = {
      x: number;
      y: number;
      r: number;
      a: number;
      vx: number;
      vy: number;
    };

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const W = () => canvas.offsetWidth;
    const H = () => canvas.offsetHeight;

    // Main depth field — fully static. Larger count for a denser sky.
    const staticStars: Star[] = Array.from({ length: 90 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.05 + 0.3,
      a: Math.random() * 0.48 + 0.22,
    }));

    // Twinkle layer — more stars, wider variation in speed and brightness.
    const twink: TStar[] = Array.from({ length: 60 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.05 + 0.4,
      ph: Math.random() * Math.PI * 2,
      sp: Math.random() * 0.018 + 0.006,
      glow: Math.random() * 0.5 + 0.5,
    }));

    // Small fixed ambient network. These points never rotate or move.
    const con: CStar[] = Array.from({ length: 14 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.1 + 0.65,
    }));

    // Drift layer — slow-moving stars that pan and wrap at the edges.
    const drift: DStar[] = Array.from({ length: 22 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 0.8 + 0.4,
      a: Math.random() * 0.35 + 0.25,
      vx: (Math.random() * 0.4 + 0.15) * (Math.random() < 0.5 ? -1 : 1),
      vy: (Math.random() * 0.4 + 0.15) * (Math.random() < 0.5 ? -1 : 1),
    }));

    const resize = () => {
      canvas.width = Math.max(1, Math.round(W() * dpr));
      canvas.height = Math.max(1, Math.round(H() * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);

    let raf = 0;
    let running = true;
    let lastFrame = 0;
    let lastDrift = performance.now();

    // Keep the animated layers capped at ~40fps — cheap enough for mobile,
    // smooth enough that the drift and twinkle both read as motion.
    const frameInterval = 1000 / 40;

    const draw = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(draw);
      if (now - lastFrame < frameInterval) return;
      lastFrame = now - ((now - lastFrame) % frameInterval);

      const w = W();
      const h = H();
      ctx.clearRect(0, 0, w, h);

      // ── Drift layer — moves first so static stars stay on top of it ──
      const dtSeconds = Math.min((now - lastDrift) / 1000, 0.1);
      lastDrift = now;

      for (const star of drift) {
        star.x += star.vx * dtSeconds;
        star.y += star.vy * dtSeconds;

        if (star.x < -0.05) star.x = 1.05;
        else if (star.x > 1.05) star.x = -0.05;

        if (star.y < -0.05) star.y = 1.05;
        else if (star.y > 1.05) star.y = -0.05;

        ctx.fillStyle = `rgba(203,220,246,${star.a})`;
        ctx.beginPath();
        ctx.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Static stars ───────────────────────────────────────────────
      for (const star of staticStars) {
        ctx.fillStyle = `rgba(219,234,254,${star.a})`;
        ctx.beginPath();
        ctx.arc(
          star.x * w,
          star.y * h,
          star.r,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      // ── Fixed ambient network ─────────────────────────────────────
      for (let i = 0; i < con.length; i++) {
        for (let j = i + 1; j < con.length; j++) {
          const a = con[i];
          const b = con[j];
          const dx = (a.x - b.x) * w;
          const dy = (a.y - b.y) * h;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 80) {
            ctx.strokeStyle = `rgba(
              147,
              197,
              253,
              ${0.18 * (1 - distance / 80)}
            )`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x * w, a.y * h);
            ctx.lineTo(b.x * w, b.y * h);
            ctx.stroke();
          }
        }
      }

      for (const star of con) {
        ctx.fillStyle = "rgba(191,219,254,0.72)";
        ctx.beginPath();
        ctx.arc(
          star.x * w,
          star.y * h,
          star.r,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      // ── Twinkle layer — brightest phase now blooms with a soft glow ──
      for (const star of twink) {
        star.ph += star.sp;
        const twinkle = (Math.sin(star.ph) + 1) / 2;
        const alpha = 0.18 + twinkle * 0.52;
        const radius = star.r * (0.76 + twinkle * 0.28);

        if (twinkle > 0.72) {
          ctx.shadowBlur = 6 * star.glow;
          ctx.shadowColor = "rgba(191,219,254,0.55)";
        }

        ctx.fillStyle = `rgba(226,232,240,${alpha})`;
        ctx.beginPath();
        ctx.arc(star.x * w, star.y * h, radius, 0, Math.PI * 2);
        ctx.fill();

        if (twinkle > 0.72) {
          ctx.shadowBlur = 0;
        }
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
        return;
      }
      if (!running) {
        running = true;
        lastFrame = 0;
        lastDrift = performance.now();
        raf = requestAnimationFrame(draw);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      document.removeEventListener(
        "visibilitychange",
        handleVisibility
      );
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}