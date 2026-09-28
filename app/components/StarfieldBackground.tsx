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

    let cssWidth = 0;
    let cssHeight = 0;
    let dpr = 1;

    /**
     * Keep the backing buffer matched to the canvas's *actual rendered size*.
     *
     * Standalone PWAs can correct the visual viewport after first paint without
     * dispatching a normal window.resize event. ResizeObserver +
     * visualViewport.resize handle the normal cases, and draw() also calls this
     * as a final safety net so the canvas can never stay stale.
     */
    const syncCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, rect.width);
      const nextHeight = Math.max(1, rect.height);
      const nextDpr = Math.min(window.devicePixelRatio || 1, 1.5);

      const targetWidth = Math.max(1, Math.round(nextWidth * nextDpr));
      const targetHeight = Math.max(1, Math.round(nextHeight * nextDpr));

      const sizeChanged =
        canvas.width !== targetWidth ||
        canvas.height !== targetHeight ||
        cssWidth !== nextWidth ||
        cssHeight !== nextHeight ||
        dpr !== nextDpr;

      cssWidth = nextWidth;
      cssHeight = nextHeight;
      dpr = nextDpr;

      if (!sizeChanged) return;

      canvas.width = targetWidth;
      canvas.height = targetHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    syncCanvasSize();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            syncCanvasSize();
          })
        : null;

    resizeObserver?.observe(canvas);

    window.addEventListener("resize", syncCanvasSize);
    window.addEventListener("orientationchange", syncCanvasSize);
    window.addEventListener("pageshow", syncCanvasSize);
    window.visualViewport?.addEventListener("resize", syncCanvasSize);
    window.visualViewport?.addEventListener("scroll", syncCanvasSize);

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

      // Final safety net: if the PWA viewport changed without any resize event,
      // the very next rendered frame repairs the backing buffer.
      syncCanvasSize();

      const w = cssWidth;
      const h = cssHeight;

      ctx.clearRect(0, 0, w, h);

      // ── Static stars ───────────────────────────────────────────────
      for (const star of staticStars) {
        ctx.fillStyle = `rgba(219,234,254,${star.a})`;
        ctx.beginPath();
        ctx.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2);
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
        ctx.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2);
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
        syncCanvasSize();
        raf = requestAnimationFrame(draw);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);

      resizeObserver?.disconnect();

      window.removeEventListener("resize", syncCanvasSize);
      window.removeEventListener("orientationchange", syncCanvasSize);
      window.removeEventListener("pageshow", syncCanvasSize);
      window.visualViewport?.removeEventListener("resize", syncCanvasSize);
      window.visualViewport?.removeEventListener("scroll", syncCanvasSize);

      document.removeEventListener("visibilitychange", handleVisibility);
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
