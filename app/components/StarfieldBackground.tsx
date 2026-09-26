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
    };

    type CStar = {
      x: number;
      y: number;
      r: number;
    };

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const W = () => canvas.offsetWidth;
    const H = () => canvas.offsetHeight;

    // Main depth field — fully static.
    const staticStars: Star[] = Array.from({ length: 52 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.05 + 0.3,
      a: Math.random() * 0.48 + 0.22,
    }));

    // Smaller animated layer so the sky still feels alive.
    const twink: TStar[] = Array.from({ length: 28 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.05 + 0.4,
      ph: Math.random() * Math.PI * 2,
      sp: Math.random() * 0.018 + 0.006,
    }));

    // Small fixed ambient network.
    // These points never rotate or move.
    const con: CStar[] = Array.from({ length: 10 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.1 + 0.65,
    }));

    const resize = () => {
      canvas.width = Math.max(1, Math.round(W() * dpr));
      canvas.height = Math.max(1, Math.round(H() * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let running = true;
    let lastFrame = 0;

    // Keep the animated layer capped rather than rendering at 60–120fps.
    const frameInterval = 1000 / 30;

    const draw = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(draw);
      if (now - lastFrame < frameInterval) return;
      lastFrame = now - ((now - lastFrame) % frameInterval);

      const w = W();
      const h = H();
      ctx.clearRect(0, 0, w, h);

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

      // ── Twinkle layer ─────────────────────────────────────────────
      for (const star of twink) {
        star.ph += star.sp;
        const twinkle = (Math.sin(star.ph) + 1) / 2;

        ctx.fillStyle = `rgba(
          226,
          232,
          240,
          ${0.18 + twinkle * 0.52}
        )`;
        ctx.beginPath();
        ctx.arc(
          star.x * w,
          star.y * h,
          star.r * (0.76 + twinkle * 0.28),
          0,
          Math.PI * 2
        );
        ctx.fill();
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
        raf = requestAnimationFrame(draw);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
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