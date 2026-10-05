"use client";

import React, { useEffect, useRef } from "react";

type StarTint = "blue" | "white" | "warm" | "violet";

type Star = {
  baseX: number;
  baseY: number;
  radius: number;
  alpha: number;
  phase: number;
  speed: number;
  strength: number;
  sway: number;
  tint: StarTint;
  bright: boolean;
  spike: boolean;
};

const OVERSCAN_BOTTOM = 200;
const FPS = 30;

const STAR_LAYERS = [
  { count: 175, sway: 0.45, min: 0.22, max: 0.68 },
  { count: 105, sway: 0.8, min: 0.3, max: 0.9 },
  { count: 48, sway: 1.15, min: 0.4, max: 1.15 },
] as const;

function randomTint(): StarTint {
  const n = Math.random();

  if (n < 0.5) return "blue";
  if (n < 0.7) return "white";
  if (n < 0.86) return "warm";

  return "violet";
}

function tintColor(tint: StarTint, alpha: number): string {
  switch (tint) {
    case "warm":
      return `rgba(255,226,190,${alpha})`;

    case "violet":
      return `rgba(218,200,255,${alpha})`;

    case "white":
      return `rgba(245,248,255,${alpha})`;

    default:
      return `rgba(204,226,255,${alpha})`;
  }
}

export default function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let width = 0;
    let height = 0;
    let dpr = 1;

    let raf = 0;
    let running = true;
    let lastFrame = 0;

    const getSize = () => {
      const vv = window.visualViewport;

      const visibleBottom = vv
        ? vv.offsetTop + vv.height
        : window.innerHeight;

      return {
        width: Math.ceil(
          Math.max(
            window.innerWidth,
            document.documentElement.clientWidth,
            vv?.width ?? 0
          )
        ),

        height: Math.ceil(
          Math.max(
            window.innerHeight,
            document.documentElement.clientHeight,
            visibleBottom
          ) + OVERSCAN_BOTTOM
        ),
      };
    };

    const resize = () => {
      const next = getSize();

      // Don't clear/reset the canvas unless
      // its physical size actually changed.
      if (next.width === width && next.height === height) {
        return;
      }

      width = next.width;
      height = next.height;

      const mobile = width < 600;

      dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5);

      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();

    const stars: Star[] = STAR_LAYERS.flatMap((layer) =>
      Array.from({ length: layer.count }, () => {
        const hardTwinkle = Math.random() < 0.5;

        const radius =
          layer.min + Math.random() * (layer.max - layer.min);

        const bright = radius > 0.85 && Math.random() < 0.2;

        return {
          baseX: Math.random(),
          baseY: Math.random(),

          radius,

          alpha: 0.16 + Math.random() * 0.36,

          phase: Math.random() * Math.PI * 2,

          speed: 0.7 + Math.random() * 1.5,

          strength: hardTwinkle
            ? 0.75 + Math.random() * 0.35
            : 0.2 + Math.random() * 0.3,

          sway: layer.sway,

          tint: randomTint(),

          bright,

          spike: bright && Math.random() < 0.45,
        };
      })
    );

    const drawNebula = (time: number) => {
      const seconds = time / 1000;

      const sway = Math.sin(seconds * 0.08);

      const breathe = 1 + Math.sin(seconds * 0.18) * 0.06;

      ctx.save();

      ctx.globalCompositeOperation = "screen";

      const x = width * (0.24 + sway * 0.025);

      const y = height * (0.34 + sway * 0.012);

      const radius = Math.max(width, height) * 0.48 * breathe;

      const nebula = ctx.createRadialGradient(x, y, 0, x, y, radius);

      nebula.addColorStop(0, "rgba(103,64,190,0.07)");
      nebula.addColorStop(0.35, "rgba(37,99,235,0.045)");
      nebula.addColorStop(0.7, "rgba(20,120,110,0.018)");
      nebula.addColorStop(1, "rgba(0,0,0,0)");

      ctx.fillStyle = nebula;

      ctx.fillRect(0, 0, width, height);

      ctx.restore();
    };

    const drawStar = (star: Star, time: number) => {
      const motionTime = time * 0.00012;

      const swayX = reducedMotion
        ? 0
        : Math.sin(motionTime * star.speed + star.phase) *
          star.sway *
          0.0025;

      const swayY = reducedMotion
        ? 0
        : Math.cos(motionTime * star.speed * 0.65 + star.phase) *
          star.sway *
          0.0009;

      const pulse =
        (Math.sin(star.phase + time * 0.001 * star.speed) + 1) / 2;

      const brightness = Math.min(
        1,
        star.alpha * (0.55 + pulse * star.strength)
      );

      const radius = star.radius * (0.85 + pulse * 0.25);

      const x = (star.baseX + swayX) * width;

      const y = (star.baseY + swayY) * height;

      ctx.save();

      if (star.bright && pulse > 0.72) {
        ctx.shadowBlur = 4 + pulse * 7;

        ctx.shadowColor = tintColor(star.tint, 0.55);
      }

      ctx.fillStyle = tintColor(star.tint, brightness);

      ctx.beginPath();

      ctx.arc(x, y, radius, 0, Math.PI * 2);

      ctx.fill();

      ctx.restore();

      // Brief diffraction spike only at
      // the very top of the twinkle.
      if (star.spike && pulse > 0.94) {
        const flare = (pulse - 0.94) / 0.06;

        ctx.save();

        ctx.strokeStyle = tintColor(star.tint, 0.12 + flare * 0.34);

        ctx.lineWidth = 0.55;

        const horizontal = radius * (4 + flare * 4);

        const vertical = radius * (2.5 + flare * 3);

        ctx.beginPath();

        ctx.moveTo(x - horizontal, y);
        ctx.lineTo(x + horizontal, y);

        ctx.moveTo(x, y - vertical);
        ctx.lineTo(x, y + vertical);

        ctx.stroke();

        ctx.restore();
      }
    };

    const draw = (time: number) => {
      if (!running) return;

      raf = requestAnimationFrame(draw);

      const elapsed = time - lastFrame;

      if (elapsed < 1000 / FPS) {
        return;
      }

      lastFrame = time;

      ctx.clearRect(0, 0, width, height);

      drawNebula(time);

      for (const star of stars) {
        drawStar(star, time);
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        running = false;

        cancelAnimationFrame(raf);

        return;
      }

      running = true;
      lastFrame = 0;

      resize();

      raf = requestAnimationFrame(draw);
    };

    window.addEventListener("resize", resize);

    window.addEventListener("orientationchange", resize);

    window.visualViewport?.addEventListener("resize", resize);

    document.addEventListener("visibilitychange", handleVisibility);

    raf = requestAnimationFrame(draw);

    return () => {
      running = false;

      cancelAnimationFrame(raf);

      window.removeEventListener("resize", resize);

      window.removeEventListener("orientationchange", resize);

      window.visualViewport?.removeEventListener("resize", resize);

      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,

        width: "100vw",
        height: "calc(100dvh + 200px)",

        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}