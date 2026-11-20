"use client";

import React, { useEffect, useRef } from "react";

/**
 * AstroProXL sky — the same starfield as Reading Results, adapted for the pager.
 *
 * Look is identical to ResultsStarfield: three parallax layers drifting left,
 * independent twinkling stars, and a rare shooting star. Differences are all
 * under the hood:
 *  - Sizes itself from its own box (the pager owns viewport sizing), not window.
 *  - Motion is time-based, so it runs at the same speed at 30, 60 or 120fps
 *    (iOS Low Power Mode and installed PWAs often run rAF at 30fps).
 *  - Restarts cleanly when an installed PWA returns from the background,
 *    including when iOS has discarded the canvas.
 *  - prefers-reduced-motion: draws the full sky once and holds it still.
 *
 * Transparent; its positioned parent owns sizing.
 */

// ── Tuned to match ResultsStarfield (its per-frame values × 60fps) ──
const LAYER_COUNTS = [26, 16, 9];
const LAYER_SPEEDS = [2.4, 5.4, 9.6]; // px per second, drifting left
const LAYER_SIZES = [0.5, 0.8, 1.2];
const LAYER_ALPHAS = [0.28, 0.5, 0.75];
const TWINKLE_COUNT = 34;

const FIRST_SHOOTER_AFTER = 6; // seconds
const SHOOTER_GAP: [number, number] = [6, 10]; // seconds between shooting stars

const MAX_DPR = 2;
const MAX_STEP = 0.05; // clamp long stalls so nothing jumps after a resume

interface ParallaxStar {
  x: number; // 0–1
  y: number; // 0–1
  r: number;
}

interface TwinkleStar {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number; // radians per second
}

interface Shooter {
  x: number;
  y: number;
  vx: number; // px per second
  vy: number;
  age: number; // seconds
  life: number;
  len: number;
}

export default function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const layers: ParallaxStar[][] = LAYER_COUNTS.map((count, layer) =>
      Array.from({ length: count }, () => ({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * LAYER_SIZES[layer] + 0.3,
      }))
    );
    const layerFills = LAYER_ALPHAS.map((a) => `rgba(219,234,254,${a})`);

    const twinkles: TwinkleStar[] = Array.from({ length: TWINKLE_COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.1 + 0.4,
      phase: Math.random() * Math.PI * 2,
      speed: (Math.random() * 0.025 + 0.008) * 60,
    }));

    const shooters: Shooter[] = [];
    let elapsed = 0;
    let nextShootAt = FIRST_SHOOTER_AFTER;

    let width = 0;
    let height = 0;
    let dpr = 0;
    let raf = 0;
    let lastTime = 0;
    let disposed = false;

    const animating = () => !motion.matches;

    const update = (dt: number) => {
      elapsed += dt;

      for (let layer = 0; layer < layers.length; layer++) {
        const step = (LAYER_SPEEDS[layer] * dt) / Math.max(width, 1);
        for (const star of layers[layer]) {
          star.x -= step;
          if (star.x < 0) {
            star.x += 1;
            star.y = Math.random();
          }
        }
      }

      for (const star of twinkles) star.phase += star.speed * dt;

      if (elapsed >= nextShootAt) {
        shooters.push({
          x: Math.random() * width * 0.7,
          y: Math.random() * height * 0.35,
          vx: (Math.random() * 2 + 3) * 60,
          vy: (Math.random() * 1.5 + 1.5) * 60,
          age: 0,
          life: (60 + Math.random() * 20) / 60,
          len: Math.random() * 40 + 50,
        });
        nextShootAt = elapsed + SHOOTER_GAP[0] + Math.random() * (SHOOTER_GAP[1] - SHOOTER_GAP[0]);
      }

      for (let i = shooters.length - 1; i >= 0; i--) {
        const s = shooters[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.age += dt;
        if (s.age >= s.life || s.x > width + 60 || s.y > height + 60) shooters.splice(i, 1);
      }
    };

    const paint = () => {
      ctx.clearRect(0, 0, width, height);
      if (width <= 0 || height <= 0) return;

      // Parallax stars.
      for (let layer = 0; layer < layers.length; layer++) {
        ctx.fillStyle = layerFills[layer];
        for (const star of layers[layer]) {
          ctx.beginPath();
          ctx.arc(star.x * width, star.y * height, star.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Twinkling stars.
      for (const star of twinkles) {
        const twinkle = (Math.sin(star.phase) + 1) / 2;
        ctx.fillStyle = `rgba(226,232,240,${0.2 + twinkle * 0.6})`;
        ctx.beginPath();
        ctx.arc(star.x * width, star.y * height, star.r * (0.7 + twinkle * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }

      // Shooting stars (10-frame fade in, 15-frame fade out, as in Results).
      for (const s of shooters) {
        const fadeIn = 10 / 60;
        const fadeOut = 15 / 60;
        let fade = 1;
        if (s.age < fadeIn) fade = s.age / fadeIn;
        else if (s.age > s.life - fadeOut) fade = Math.max(0, (s.life - s.age) / fadeOut);

        const magnitude = Math.hypot(s.vx, s.vy);
        const tailX = s.x - (s.vx / magnitude) * s.len;
        const tailY = s.y - (s.vy / magnitude) * s.len;
        const gradient = ctx.createLinearGradient(s.x, s.y, tailX, tailY);
        gradient.addColorStop(0, `rgba(226,232,240,${0.9 * fade})`);
        gradient.addColorStop(1, "rgba(147,197,253,0)");

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();

        ctx.fillStyle = `rgba(255,255,255,${0.95 * fade})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const resize = (force = false) => {
      if (disposed) return;
      // Measure the CSS box, not the window: the pager already handles iOS sizing.
      const box = canvas.getBoundingClientRect();
      const nextDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      if (box.width <= 0 || box.height <= 0) return;
      if (!force && width === box.width && height === box.height && dpr === nextDpr) return;
      width = box.width;
      height = box.height;
      dpr = nextDpr;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(); // resizing clears the buffer; redraw right away
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!lastTime) {
        lastTime = now;
        return;
      }
      const dt = Math.min((now - lastTime) / 1000, MAX_STEP);
      lastTime = now;
      update(dt);
      paint();
    };

    const syncAnimation = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      lastTime = 0;
      if (disposed || document.hidden) return;
      resize();
      paint();
      if (animating()) raf = requestAnimationFrame(frame);
    };

    const onResize = () => resize();

    // iOS may discard canvas memory while an installed PWA is backgrounded.
    const onContextRestored = () => {
      resize(true);
      syncAnimation();
    };

    const observer = new ResizeObserver(onResize);
    observer.observe(canvas);
    window.addEventListener("resize", onResize);
    window.addEventListener("pageshow", syncAnimation);
    window.addEventListener("focus", syncAnimation);
    document.addEventListener("visibilitychange", syncAnimation);
    motion.addEventListener("change", syncAnimation);
    canvas.addEventListener("contextrestored", onContextRestored);
    syncAnimation();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pageshow", syncAnimation);
      window.removeEventListener("focus", syncAnimation);
      document.removeEventListener("visibilitychange", syncAnimation);
      motion.removeEventListener("change", syncAnimation);
      canvas.removeEventListener("contextrestored", onContextRestored);
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
