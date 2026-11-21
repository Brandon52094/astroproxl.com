"use client";

import React, { useEffect, useRef } from "react";

/**
 * AstroProXL night sky — transparent; its positioned parent owns sizing.
 *
 * Designed to look like a real sky, not an effect:
 *  - ~150 stars at three depths. Distant ones are tiny, dim and slow; closer
 *    ones are larger, brighter and drift a little faster (parallax).
 *  - A faint Milky Way band of distant stars with a whisper of haze.
 *  - A gentle shimmer instead of blinking, near-white colors.
 *  - Every second or two a nearby star catches the light (a brief glint).
 *  - A rare, quick shooting star (every 14–30 seconds).
 *
 * Robust in installed PWAs: sizes from its own box, time-based motion (same
 * speed at 30/60/120fps), restarts on return from background, rebuilds after
 * iOS discards the canvas, and shows a still sky with Reduce Motion.
 */

const TINTS = ["232,238,255", "246,247,252", "255,244,230"]; // slightly blue · white · faintly warm

interface Depth {
  share: number;
  r: [number, number];
  a: [number, number];
  z: number; // drift multiplier
}

const DEPTHS: Depth[] = [
  { share: 0.62, r: [0.3, 0.6], a: [0.18, 0.42], z: 0.5 }, // far
  { share: 0.28, r: [0.6, 0.95], a: [0.42, 0.7], z: 1.0 }, // middle
  { share: 0.1, r: [1.05, 1.5], a: [0.72, 0.95], z: 1.8 }, // near
];

const FIELD_STARS = 112;
const BAND_STARS = 38;
const DRIFT_PX_PER_SEC = 1.6; // distant stars; nearer ones move proportionally faster
const MAX_DPR = 2;
const MAX_STEP = 0.05;

interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
  z: number;
  depth: number;
  tint: number;
  shimmer: number;
  phase: number;
  speed: number;
  sx: number;
  sy: number;
}

interface Sparkle {
  star: Star;
  age: number;
  life: number;
}

interface Shooter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  len: number;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function pickTint() {
  const r = Math.random();
  return r < 0.45 ? 0 : r < 0.85 ? 1 : 2;
}

function pickDepth() {
  const r = Math.random();
  return r < DEPTHS[0].share ? 0 : r < DEPTHS[0].share + DEPTHS[1].share ? 1 : 2;
}

function makeStar(x: number, y: number, depth: number): Star {
  const d = DEPTHS[depth];
  return {
    x,
    y,
    depth,
    r: rand(d.r[0], d.r[1]),
    a: rand(d.a[0], d.a[1]),
    z: d.z,
    tint: pickTint(),
    shimmer: 0.06 + Math.random() * 0.14 + (depth === 2 ? 0.1 : 0),
    phase: Math.random() * Math.PI * 2,
    speed: 0.35 + Math.random() * 1.1,
    sx: 0,
    sy: 0,
  };
}

function makeGlow(): HTMLCanvasElement {
  const glow = document.createElement("canvas");
  glow.width = glow.height = 32;
  const g = glow.getContext("2d");
  if (g) {
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, "rgba(255,255,255,0.9)");
    grd.addColorStop(0.25, "rgba(235,240,255,0.25)");
    grd.addColorStop(1, "rgba(235,240,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
  }
  return glow;
}

export default function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const stars: Star[] = [];
    for (let i = 0; i < FIELD_STARS; i++) stars.push(makeStar(Math.random(), Math.random(), pickDepth()));
    // Milky Way: a soft diagonal band of faint, distant stars.
    for (let i = 0; i < BAND_STARS; i++) {
      const u = Math.random();
      const off = (Math.random() + Math.random() + Math.random() - 1.5) * 0.14;
      stars.push(makeStar(u + off * 0.55, 0.12 + u * 0.78 + off, 0));
    }
    const nearbyStars = stars.filter((s) => s.depth > 0);
    const fills = TINTS.map((t) => `rgb(${t})`);
    let glow = makeGlow();

    const sparkles: Sparkle[] = [];
    let shooter: Shooter | null = null;
    let width = 0;
    let height = 0;
    let dpr = 0;
    let raf = 0;
    let lastTime = 0;
    let elapsed = 0;
    let drift = Math.random() * 1000;
    let nextSparkle = 0.8;
    let nextShooter = 9 + Math.random() * 8;
    let disposed = false;

    const animating = () => !motion.matches;

    const update = (dt: number) => {
      elapsed += dt;
      drift += dt * DRIFT_PX_PER_SEC;
      for (const s of stars) s.phase += s.speed * dt;

      if (elapsed >= nextSparkle && nearbyStars.length) {
        sparkles.push({
          star: nearbyStars[Math.floor(Math.random() * nearbyStars.length)],
          age: 0,
          life: 0.7 + Math.random() * 0.5,
        });
        nextSparkle = elapsed + 0.9 + Math.random() * 1.8;
      }
      for (let i = sparkles.length - 1; i >= 0; i--) {
        sparkles[i].age += dt;
        if (sparkles[i].age >= sparkles[i].life) sparkles.splice(i, 1);
      }

      if (!shooter && elapsed >= nextShooter) {
        const angle = Math.PI * (0.66 + Math.random() * 0.14);
        const speed = 900 + Math.random() * 500;
        shooter = {
          x: width * (0.3 + Math.random() * 0.7),
          y: height * Math.random() * 0.45,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          age: 0,
          life: 0.45 + Math.random() * 0.3,
          len: 60 + Math.random() * 60,
        };
        nextShooter = elapsed + 14 + Math.random() * 16;
      }
      if (shooter) {
        shooter.age += dt;
        shooter.x += shooter.vx * dt;
        shooter.y += shooter.vy * dt;
        if (shooter.age >= shooter.life) shooter = null;
      }
    };

    const paint = () => {
      ctx.clearRect(0, 0, width, height);
      if (width <= 0 || height <= 0) return;

      // Faint haze along the Milky Way band.
      const band = ctx.createLinearGradient(0, height * 0.05, width, height * 0.95);
      band.addColorStop(0, "rgba(180,190,230,0)");
      band.addColorStop(0.5, "rgba(180,190,230,0.035)");
      band.addColorStop(1, "rgba(180,190,230,0)");
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate(0.52);
      ctx.fillStyle = band;
      ctx.fillRect(-width, -height * 0.09, width * 2, height * 0.18);
      ctx.restore();

      const span = width + 4;
      for (const s of stars) {
        const shimmer = 1 - s.shimmer + s.shimmer * (Math.sin(s.phase) * 0.5 + 0.5);
        const x = (((s.x * width - drift * s.z) % span) + span) % span - 2;
        const y = s.y * height;
        s.sx = x;
        s.sy = y;
        if (y < -2 || y > height + 2) continue;
        ctx.globalAlpha = s.a * shimmer;
        ctx.fillStyle = fills[s.tint];
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
        if (s.depth === 2) {
          ctx.globalAlpha = s.a * shimmer * 0.35;
          ctx.drawImage(glow, x - s.r * 3.2, y - s.r * 3.2, s.r * 6.4, s.r * 6.4);
        }
      }

      if (animating()) {
        // Glints: a nearby star brightens and a small four-point flare opens and closes.
        for (const sp of sparkles) {
          const e = Math.sin((Math.PI * sp.age) / sp.life);
          const q = sp.star;
          const len = (q.r * 4 + 3) * e;
          const size = q.r * 10 * e + 4;
          ctx.globalAlpha = 0.85 * e;
          ctx.drawImage(glow, q.sx - size / 2, q.sy - size / 2, size, size);
          ctx.lineWidth = 0.6;
          const h = ctx.createLinearGradient(q.sx - len, q.sy, q.sx + len, q.sy);
          h.addColorStop(0, "rgba(255,255,255,0)");
          h.addColorStop(0.5, "rgba(255,255,255,0.9)");
          h.addColorStop(1, "rgba(255,255,255,0)");
          ctx.strokeStyle = h;
          ctx.beginPath();
          ctx.moveTo(q.sx - len, q.sy);
          ctx.lineTo(q.sx + len, q.sy);
          ctx.stroke();
          const v = ctx.createLinearGradient(q.sx, q.sy - len, q.sx, q.sy + len);
          v.addColorStop(0, "rgba(255,255,255,0)");
          v.addColorStop(0.5, "rgba(255,255,255,0.9)");
          v.addColorStop(1, "rgba(255,255,255,0)");
          ctx.strokeStyle = v;
          ctx.beginPath();
          ctx.moveTo(q.sx, q.sy - len);
          ctx.lineTo(q.sx, q.sy + len);
          ctx.stroke();
        }

        if (shooter) {
          const m = shooter;
          const fade = Math.sin((Math.PI * m.age) / m.life) * 0.8;
          const mag = Math.hypot(m.vx, m.vy);
          const tx = m.x - (m.vx / mag) * m.len;
          const ty = m.y - (m.vy / mag) * m.len;
          const trail = ctx.createLinearGradient(tx, ty, m.x, m.y);
          trail.addColorStop(0, "rgba(255,255,255,0)");
          trail.addColorStop(1, "rgba(255,255,255,0.85)");
          ctx.globalAlpha = fade;
          ctx.strokeStyle = trail;
          ctx.lineWidth = 1;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(m.x, m.y);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };

    const resize = (force = false) => {
      if (disposed) return;
      // Measure the CSS box, not the window: the pager owns viewport sizing.
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
      glow = makeGlow();
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
