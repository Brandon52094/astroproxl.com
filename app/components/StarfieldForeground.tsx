"use client";

import React, { useEffect, useRef } from "react";

type StarColor = "blue" | "white" | "warm" | "violet";

type ForegroundStar = {
  x: number;
  y: number;

  radius: number;

  phase: number;
  speed: number;

  alpha: number;

  swayX: number;
  swayY: number;

  color: StarColor;

  spikeLength: number;

  diagonal: boolean;
  soft: boolean;
};

const FPS = 30;
const OVERSCAN_BOTTOM = 200;

/*
 * Only the distinctive close stars remain.
 *
 * Every star in this layer is now a
 * "hero" star: larger, brighter, and
 * visibly animated. The tiny, static
 * background stars have been removed.
 */
const STAR_COUNT = 12;

function starColor(
  color: StarColor,
  alpha: number
) {
  switch (color) {
    case "warm":
      return `rgba(255,220,174,${alpha})`;

    case "violet":
      return `rgba(218,198,255,${alpha})`;

    case "blue":
      return `rgba(196,225,255,${alpha})`;

    default:
      return `rgba(250,252,255,${alpha})`;
  }
}

function randomColor(): StarColor {
  const n = Math.random();

  if (n < 0.42) return "white";
  if (n < 0.67) return "blue";
  if (n < 0.84) return "warm";

  return "violet";
}

export default function StarfieldForeground() {
  const canvasRef =
    useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion =
      window.matchMedia(
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
        mobile ? 1.2 : 1.4
      );

      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      canvas.width = Math.round(
        width * dpr
      );

      canvas.height = Math.round(
        height * dpr
      );

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

    const stars: ForegroundStar[] =
      Array.from(
        { length: STAR_COUNT },
        () => {
          /*
           * Every star is now a hero star:
           * larger radius, brighter alpha,
           * longer spikes, and optional
           * diagonal diffraction.
           */
          return {
            x: Math.random(),
            y: Math.random(),

            radius:
              1.15 +
              Math.random() * 1.25,

            phase:
              Math.random() *
              Math.PI *
              2,

            speed:
              0.45 +
              Math.random() * 0.75,

            alpha:
              0.48 +
              Math.random() * 0.28,

            /*
             * Different amplitudes make
             * the stars feel independent.
             */
            swayX:
              3 +
              Math.random() * 8,

            swayY:
              1 +
              Math.random() * 4,

            color: randomColor(),

            spikeLength:
              12 +
              Math.random() * 18,

            diagonal:
              Math.random() < 0.55,

            soft:
              Math.random() < 0.3,
          };
        }
      );

    const drawStar = (
      star: ForegroundStar,
      time: number
    ) => {
      const seconds =
        time / 1000;

      /*
       * Slow floating motion.
       *
       * This deliberately does NOT cross
       * the screen. Each star wanders
       * around its own home position.
       */
      const xOffset = reducedMotion
        ? 0
        : Math.sin(
            seconds *
              0.12 *
              star.speed +
              star.phase
          ) *
          star.swayX;

      const yOffset = reducedMotion
        ? 0
        : Math.cos(
            seconds *
              0.09 *
              star.speed +
              star.phase
          ) *
          star.swayY;

      const x =
        star.x * width +
        xOffset;

      const y =
        star.y * height +
        yOffset;

      /*
       * Layered pulse makes the brightness
       * less mechanically sinusoidal.
       */
      const pulseA =
        (
          Math.sin(
            seconds *
              star.speed +
              star.phase
          ) +
          1
        ) /
        2;

      const pulseB =
        (
          Math.sin(
            seconds *
              star.speed *
              0.43 +
              star.phase * 1.7
          ) +
          1
        ) /
        2;

      const pulse =
        pulseA * 0.72 +
        pulseB * 0.28;

      const alpha =
        Math.min(
          1,
          star.alpha *
            (
              0.62 +
              pulse * 0.62
            )
        );

      const radius =
        star.radius *
        (
          0.9 +
          pulse * 0.22
        );

      /*
       * Soft aura.
       */
      ctx.save();

      ctx.shadowColor =
        starColor(
          star.color,
          alpha * 0.8
        );

      ctx.shadowBlur =
        star.soft
          ? 15 + pulse * 9
          : 7 + pulse * 7;

      ctx.fillStyle =
        starColor(
          star.color,
          alpha
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

      /*
       * Diffraction spikes.
       *
       * They breathe with the star instead
       * of suddenly switching on/off.
       */
      const spikeAlpha =
        Math.max(
          0,
          (pulse - 0.35) /
            0.65
        );

      if (
        spikeAlpha <= 0.02
      ) {
        return;
      }

      const length =
        star.spikeLength *
        (
          0.65 +
          pulse * 0.55
        );

      ctx.save();

      ctx.strokeStyle =
        starColor(
          star.color,
          spikeAlpha *
            alpha *
            0.65
        );

      ctx.lineWidth = 0.65;

      ctx.beginPath();

      /*
       * Horizontal
       */
      ctx.moveTo(
        x - length,
        y
      );

      ctx.lineTo(
        x + length,
        y
      );

      /*
       * Vertical — deliberately longer,
       * like the reference stars.
       */
      ctx.moveTo(
        x,
        y - length * 1.35
      );

      ctx.lineTo(
        x,
        y + length * 1.35
      );

      /*
       * Only selected stars receive
       * diagonal diffraction spikes.
       */
      if (star.diagonal) {
        const diagonal =
          length * 0.62;

        ctx.moveTo(
          x - diagonal,
          y - diagonal
        );

        ctx.lineTo(
          x + diagonal,
          y + diagonal
        );

        ctx.moveTo(
          x + diagonal,
          y - diagonal
        );

        ctx.lineTo(
          x - diagonal,
          y + diagonal
        );
      }

      ctx.stroke();

      ctx.restore();
    };

    const draw = (
      time: number
    ) => {
      if (!running) return;

      raf =
        requestAnimationFrame(
          draw
        );

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

      for (
        const star of stars
      ) {
        drawStar(
          star,
          time
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
      requestAnimationFrame(
        draw
      );

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

        /*
         * Absolutely critical:
         * this layer can never intercept
         * app interaction.
         */
        pointerEvents: "none",

        zIndex: 20,
      }}
    />
  );
}