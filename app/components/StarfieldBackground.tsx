
"use client";

import React, { useEffect, useRef } from "react";

/** Transparent sky layer. Its positioned parent owns viewport sizing. */
export default function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stars = Array.from({ length: 52 }, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.05 + 0.3, a: Math.random() * 0.48 + 0.22,
    }));
    const twinkles = Array.from({ length: 28 }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.05 + 0.4,
      phase: Math.random() * Math.PI * 2,
      speed: (Math.random() * 0.018 + 0.006) * 30,
    }));
    const constellation = Array.from({ length: 10 }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.1 + 0.65,
    }));

    let width = 0;
    let height = 0;
    let dpr = 0;
    let raf = 0;
    let previousTime = 0;
    let elapsed = 0;
    let disposed = false;
    const frameInterval = 1000 / 30;

    const dot = (x: number, y: number, radius: number, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x * width, y * height, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    const paint = () => {
      ctx.clearRect(0, 0, width, height);
      for (const star of stars) {
        dot(star.x, star.y, star.r, `rgba(219,234,254,${star.a})`);
      }
      for (let i = 0; i < constellation.length; i++) {
        const a = constellation[i];
        for (let j = i + 1; j < constellation.length; j++) {
          const b = constellation[j];
          const distance = Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
          if (distance >= 80) continue;
          ctx.strokeStyle = `rgba(147,197,253,${0.18 * (1 - distance / 80)})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(a.x * width, a.y * height);
          ctx.lineTo(b.x * width, b.y * height);
          ctx.stroke();
        }
      }
      for (const star of constellation) {
        dot(star.x, star.y, star.r, "rgba(191,219,254,0.72)");
      }
      for (const star of twinkles) {
        const glow = (Math.sin(star.phase + elapsed * star.speed) + 1) / 2;
        dot(star.x, star.y, star.r * (0.76 + glow * 0.28),
          `rgba(226,232,240,${0.18 + glow * 0.52})`);
      }
    };

    const resize = () => {
      if (disposed) return;
      // Measure the CSS box, not the document: the pager already handles iOS sizing.
      const box = canvas.getBoundingClientRect();
      const nextWidth = box.width;
      const nextHeight = box.height;
      const nextDpr = Math.min(window.devicePixelRatio || 1, 1.5);
      if (nextWidth <= 0 || nextHeight <= 0) return;
      if (width === nextWidth && height === nextHeight && dpr === nextDpr) return;
      width = nextWidth;
      height = nextHeight;
      dpr = nextDpr;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(); // Redraw immediately after clearing the drawing buffer.
    };

    const frame = (now: number) => {
      raf = 0;
      if (disposed || document.hidden || motion.matches) return;
      if (!previousTime) previousTime = now;
      const delta = now - previousTime;
      if (delta >= frameInterval) {
        elapsed += delta / 1000;
        previousTime = now;
        paint();
      }
      raf = requestAnimationFrame(frame);
    };

    const syncAnimation = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      previousTime = 0;
      if (disposed || document.hidden) return;
      resize();
      paint();
      // Reduced-motion users still see the complete sky, without twinkling.
      if (!motion.matches) raf = requestAnimationFrame(frame);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("resize", resize);
    window.addEventListener("pageshow", syncAnimation);
    document.addEventListener("visibilitychange", syncAnimation);
    motion.addEventListener("change", syncAnimation);
    syncAnimation();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pageshow", syncAnimation);
      document.removeEventListener("visibilitychange", syncAnimation);
      motion.removeEventListener("change", syncAnimation);
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
        display: "block",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}


