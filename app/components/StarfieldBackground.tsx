"use client";

import React, { useEffect, useRef } from "react";

type StarTint = "blue" | "white" | "warm" | "violet";

type Star = {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  phase: number;
  speed: number;
  strength: number;
  drift: number;
  tint: StarTint;
  bright: boolean;
  spike: boolean;
};

type ShootingStar = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  length: number;
};

const OVERSCAN_BOTTOM = 200;
const FPS = 30;

const STAR_LAYERS = [
  { count: 220, drift: 0.7, min: 0.25, max: 0.8 },
  { count: 130, drift: 1.5, min: 0.35, max: 1.05 },
  { count: 60, drift: 2.6, min: 0.5, max: 1.45 },
] as const;

function randomTint(): StarTint {
  const n = Math.random();

  if (n < 0.5) return "blue";
  if (n < 0.7) return "white";
  if (n < 0.86) return "warm";

  return "violet";
}

function tintColor(
  tint: StarTint,
  alpha: number
): string {
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
  const canvasRef = useRef<HTMLCanvasElement | null>(
    null
  );

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

    const shooting: ShootingStar = {
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      length: 100,
    };

    let nextShootingStar =
      performance.now() +
      5000 +
      Math.random() * 7000;

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
      if (
        next.width === width &&
        next.height === height
      ) {
        return;
      }

      width = next.width;
      height = next.height;

      const mobile = width < 600;

      dpr = Math.min(
        window.devicePixelRatio || 1,
        mobile ? 1.25 : 1.5
      );

      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
      );
    };

    resize();

    const stars: Star[] =
      STAR_LAYERS.flatMap((layer) =>
        Array.from(
          { length: layer.count },
          () => {
            const hardTwinkle =
              Math.random() < 0.5;

            const radius =
              layer.min +
              Math.random() *
                (layer.max - layer.min);

            const bright =
              radius > 0.9 &&
              Math.random() < 0.3;

            return {
              x: Math.random(),
              y: Math.random(),

              radius,

              alpha:
                0.2 +
                Math.random() * 0.48,

              phase:
                Math.random() *
                Math.PI *
                2,

              speed:
                0.7 +
                Math.random() * 1.5,

              strength: hardTwinkle
                ? 0.75 +
                  Math.random() * 0.35
                : 0.2 +
                  Math.random() * 0.3,

              drift: layer.drift,

              tint: randomTint(),

              bright,

              spike:
                bright &&
                Math.random() < 0.45,
            };
          }
        )
      );

    const drawNebula = (time: number) => {
      const seconds = time / 1000;

      const sway =
        Math.sin(seconds * 0.08);

      const breathe =
        1 +
        Math.sin(seconds * 0.18) *
          0.06;

      ctx.save();

      ctx.globalCompositeOperation = "screen";

      const x =
        width *
        (0.24 + sway * 0.025);

      const y =
        height *
        (0.34 + sway * 0.012);

      const radius =
        Math.max(width, height) *
        0.48 *
        breathe;

      const nebula =
        ctx.createRadialGradient(
          x,
          y,
          0,
          x,
          y,
          radius
        );

      nebula.addColorStop(
        0,
        "rgba(103,64,190,0.07)"
      );

      nebula.addColorStop(
        0.35,
        "rgba(37,99,235,0.045)"
      );

      nebula.addColorStop(
        0.7,
        "rgba(20,120,110,0.018)"
      );

      nebula.addColorStop(
        1,
        "rgba(0,0,0,0)"
      );

      ctx.fillStyle = nebula;

      ctx.fillRect(
        0,
        0,
        width,
        height
      );

      ctx.restore();
    };

    const drawStar = (
      star: Star,
      dt: number,
      time: number
    ) => {
      if (!reducedMotion) {
        star.x +=
          star.drift *
          0.0000035 *
          dt;

        if (star.x > 1.02) {
          star.x = -0.02;
        }
      }

      const pulse =
        (Math.sin(
          star.phase +
            time *
              0.001 *
              star.speed
        ) +
          1) /
        2;

      const brightness =
        Math.min(
          1,
          star.alpha *
            (
              0.55 +
              pulse *
                star.strength
            )
        );

      const radius =
        star.radius *
        (
          0.85 +
          pulse * 0.25
        );

      const x = star.x * width;
      const y = star.y * height;

      ctx.save();

      if (
        star.bright &&
        pulse > 0.72
      ) {
        ctx.shadowBlur =
          4 + pulse * 7;

        ctx.shadowColor =
          tintColor(
            star.tint,
            0.55
          );
      }

      ctx.fillStyle =
        tintColor(
          star.tint,
          brightness
        );

      ctx.beginPath();

      ctx.arc(
        x,
        y,
        radius,
        0,
        Math.PI * 2
      );

      ctx.fill();

      ctx.restore();

      // Brief diffraction spike only at
      // the very top of the twinkle.
      if (
        star.spike &&
        pulse > 0.94
      ) {
        const flare =
          (pulse - 0.94) /
          0.06;

        ctx.save();

        ctx.strokeStyle =
          tintColor(
            star.tint,
            0.12 +
              flare * 0.34
          );

        ctx.lineWidth = 0.55;

        const horizontal =
          radius *
          (4 + flare * 4);

        const vertical =
          radius *
          (2.5 + flare * 3);

        ctx.beginPath();

        ctx.moveTo(
          x - horizontal,
          y
        );
        ctx.lineTo(
          x + horizontal,
          y
        );

        ctx.moveTo(
          x,
          y - vertical
        );
        ctx.lineTo(
          x,
          y + vertical
        );

        ctx.stroke();

        ctx.restore();
      }
    };

    const beginShootingStar = () => {
      shooting.active = true;

      shooting.x =
        width *
        (0.55 +
          Math.random() * 0.4);

      shooting.y =
        height *
        (0.05 +
          Math.random() * 0.28);

      shooting.vx =
        -(420 +
          Math.random() * 160);

      shooting.vy =
        150 +
        Math.random() * 100;

      shooting.life = 0;

      shooting.maxLife =
        0.45 +
        Math.random() * 0.25;

      shooting.length =
        70 +
        Math.random() * 90;
    };

    const drawShootingStar = (
      dtSeconds: number
    ) => {
      if (!shooting.active) {
        return;
      }

      shooting.life += dtSeconds;

      shooting.x +=
        shooting.vx *
        dtSeconds;

      shooting.y +=
        shooting.vy *
        dtSeconds;

      const progress =
        shooting.life /
        shooting.maxLife;

      if (progress >= 1) {
        shooting.active = false;

        nextShootingStar =
          performance.now() +
          5000 +
          Math.random() * 7000;

        return;
      }

      const alpha =
        Math.sin(
          progress * Math.PI
        );

      const magnitude =
        Math.hypot(
          shooting.vx,
          shooting.vy
        );

      const nx =
        shooting.vx /
        magnitude;

      const ny =
        shooting.vy /
        magnitude;

      const tailX =
        shooting.x -
        nx *
          shooting.length;

      const tailY =
        shooting.y -
        ny *
          shooting.length;

      const gradient =
        ctx.createLinearGradient(
          tailX,
          tailY,
          shooting.x,
          shooting.y
        );

      gradient.addColorStop(
        0,
        "rgba(191,219,254,0)"
      );

      gradient.addColorStop(
        1,
        `rgba(255,255,255,${
          alpha * 0.9
        })`
      );

      ctx.save();

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1;
      ctx.lineCap = "round";

      ctx.shadowBlur = 8;
      ctx.shadowColor =
        "rgba(191,219,254,0.45)";

      ctx.beginPath();

      ctx.moveTo(
        tailX,
        tailY
      );

      ctx.lineTo(
        shooting.x,
        shooting.y
      );

      ctx.stroke();

      ctx.restore();
    };

    const draw = (time: number) => {
      if (!running) return;

      raf =
        requestAnimationFrame(draw);

      const elapsed =
        time - lastFrame;

      if (
        elapsed <
        1000 / FPS
      ) {
        return;
      }

      lastFrame = time;

      ctx.clearRect(
        0,
        0,
        width,
        height
      );

      drawNebula(time);

      for (const star of stars) {
        drawStar(
          star,
          elapsed,
          time
        );
      }

      if (
        !reducedMotion &&
        !shooting.active &&
        time >=
          nextShootingStar
      ) {
        beginShootingStar();
      }

      if (!reducedMotion) {
        drawShootingStar(
          elapsed / 1000
        );
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        running = false;

        cancelAnimationFrame(
          raf
        );

        return;
      }

      running = true;
      lastFrame = 0;

      resize();

      raf =
        requestAnimationFrame(
          draw
        );
    };

    window.addEventListener(
      "resize",
      resize
    );

    window.addEventListener(
      "orientationchange",
      resize
    );

    window.visualViewport?.addEventListener(
      "resize",
      resize
    );

    document.addEventListener(
      "visibilitychange",
      handleVisibility
    );

    raf =
      requestAnimationFrame(draw);

    return () => {
      running = false;

      cancelAnimationFrame(
        raf
      );

      window.removeEventListener(
        "resize",
        resize
      );

      window.removeEventListener(
        "orientationchange",
        resize
      );

      window.visualViewport?.removeEventListener(
        "resize",
        resize
      );

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
        position: "fixed",
        top: 0,
        left: 0,

        width: "100vw",
        height:
          "calc(100dvh + 200px)",

        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}