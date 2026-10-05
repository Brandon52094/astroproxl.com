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
  accent: boolean;
  spikeScale: number;
};

const OVERSCAN_BOTTOM = 200;
const FPS = 30;

const STAR_LAYERS = [
  { count: 205, sway: 0.7, min: 0.24, max: 0.78 },
  { count: 125, sway: 1.1, min: 0.34, max: 1.02 },
  { count: 60, sway: 1.5, min: 0.48, max: 1.28 },
] as const;

function randomTint(): StarTint {
  const n = Math.random();

  if (n < 0.5) return "blue";
  if (n < 0.7) return "white";
  if (n < 0.86) return "warm";

  return "violet";
}

function accentTint(): StarTint {
  if (Math.random() < 0.55) return "white";
  if (Math.random() < 0.75) return "blue";

  return "warm";
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
      Array.from({ length: layer.count }, (): Star => {
        const hardTwinkle = Math.random() < 0.5;

        const radius =
          layer.min + Math.random() * (layer.max - layer.min);

        const accent = Math.random() < 0.08;
        const bright =
          accent || (radius > 0.9 && Math.random() < 0.28);

        return {
          baseX: Math.random(),
          baseY: Math.random(),

          radius,

          alpha: accent
            ? 0.34 + Math.random() * 0.28
            : 0.2 + Math.random() * 0.42,

          phase: Math.random() * Math.PI * 2,

          speed: accent
            ? 1.3 + Math.random() * 1.2
            : 0.9 + Math.random() * 1.5,

          strength: accent
            ? 0.85 + Math.random() * 0.4
            : hardTwinkle
              ? 0.65 + Math.random() * 0.35
              : 0.22 + Math.random() * 0.28,

          sway: layer.sway,

          tint: accent ? accentTint() : randomTint(),

          bright,

          spike: accent
            ? Math.random() < 0.75
            : bright && Math.random() < 0.4,

          accent,

          spikeScale: accent ? 1.6 + Math.random() * 1.4 : 1,
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
      const motionTime = time * 0.00032;

      const swayX = reducedMotion
        ? 0
        : Math.sin(motionTime * star.speed + star.phase) *
          star.sway *
          0.0045;

      const swayY = reducedMotion
        ? 0
        : Math.cos(motionTime * star.speed * 0.72 + star.phase) *
          star.sway *
          0.0018;

      const pulse =
        (Math.sin(star.phase + time * 0.001 * star.speed) + 1) / 2;

      const brightness = Math.min(
        1,
        star.alpha * (0.55 + pulse * star.strength)
      );

      const radius =
        star.radius *
        (star.accent ? 0.95 + pulse * 0.38 : 0.85 + pulse * 0.25);

      const x = (star.baseX + swayX) * width;

      const y = (star.baseY + swayY) * height;

      ctx.save();

      if (star.bright && pulse > 0.62) {
        ctx.shadowBlur = star.accent ? 10 + pulse * 10 : 4 + pulse * 7;

        ctx.shadowColor = tintColor(star.tint, star.accent ? 0.75 : 0.55);
      }

      ctx.fillStyle = tintColor(star.tint, brightness);

      ctx.beginPath();

      ctx.arc(x, y, radius, 0, Math.PI * 2);

      ctx.fill();

      ctx.restore();

      // Diffraction spikes near the top of the twinkle.
      // Accent stars get longer spikes plus diagonals.
      if (star.spike && pulse > 0.82) {
        const flare = (pulse - 0.82) / 0.18;

        ctx.save();

        ctx.strokeStyle = tintColor(
          star.tint,
          star.accent ? 0.2 + flare * 0.42 : 0.1 + flare * 0.24
        );

        ctx.lineWidth = star.accent ? 0.8 : 0.5;

        const spikeScale = star.spikeScale;

        const horizontal =
          radius *
          (star.accent ? 7 : 4.5) *
          spikeScale *
          (0.7 + flare * 0.5);

        const vertical =
          radius *
          (star.accent ? 6 : 3.2) *
          spikeScale *
          (0.7 + flare * 0.5);

        ctx.beginPath();

        ctx.moveTo(x - horizontal, y);
        ctx.lineTo(x + horizontal, y);

        ctx.moveTo(x, y - vertical);
        ctx.lineTo(x, y + vertical);

        if (star.accent) {
          ctx.moveTo(x - horizontal * 0.7, y - vertical * 0.7);
          ctx.lineTo(x + horizontal * 0.7, y + vertical * 0.7);

          ctx.moveTo(x + horizontal * 0.7, y - vertical * 0.7);
          ctx.lineTo(x - horizontal * 0.7, y + vertical * 0.7);
        }

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
