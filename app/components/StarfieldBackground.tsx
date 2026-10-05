"use client";

import React, { useEffect, useRef } from "react";

export default function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const OVERSCAN_BOTTOM = 200;
    const TARGET_FPS = 30;

    type StarTint =
      | "blue"
      | "warm"
      | "violet"
      | "white";

    type Star = {
      x: number;
      y: number;

      radius: number;
      baseAlpha: number;

      phase: number;
      twinkleSpeed: number;
      twinkleStrength: number;

      depth: 0 | 1 | 2;

      driftX: number;
      driftY: number;

      tint: StarTint;

      glow: boolean;
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
      width: number;
    };

    let dpr = Math.min(
      window.devicePixelRatio || 1,
      1.5
    );

    let cssWidth = 0;
    let cssHeight = 0;

    let raf = 0;
    let running = true;
    let lastFrame = 0;

    const frameInterval = 1000 / TARGET_FPS;

    let nextShootingStarAt =
      performance.now() +
      5000 +
      Math.random() * 7000;

    const shootingStar: ShootingStar = {
      active: false,

      x: 0,
      y: 0,

      vx: 0,
      vy: 0,

      life: 0,
      maxLife: 0,

      length: 0,
      width: 0,
    };

    function getViewportSize() {
      const vv = window.visualViewport;

      const width = Math.max(
        window.innerWidth,
        document.documentElement.clientWidth,
        vv?.width ?? 0
      );

      const visibleBottom = vv
        ? vv.offsetTop + vv.height
        : window.innerHeight;

      const visibleHeight = Math.max(
        window.innerHeight,
        document.documentElement.clientHeight,
        visibleBottom
      );

      return {
        width: Math.ceil(width),
        height: Math.ceil(
          visibleHeight + OVERSCAN_BOTTOM
        ),
      };
    }

    function randomTint(): StarTint {
      const roll = Math.random();

      if (roll < 0.52) return "blue";
      if (roll < 0.69) return "white";
      if (roll < 0.85) return "warm";

      return "violet";
    }

    function tintRgb(
      tint: StarTint
    ): [number, number, number] {
      switch (tint) {
        case "warm":
          return [255, 226, 183];

        case "violet":
          return [216, 196, 255];

        case "white":
          return [244, 248, 255];

        case "blue":
        default:
          return [202, 225, 255];
      }
    }

    /*
     * Three depth fields:
     *
     * far:
     * many tiny stars, barely moving
     *
     * middle:
     * visible motion and brighter twinkle
     *
     * near:
     * fewer but larger / brighter stars
     */
    function makeLayer(
      count: number,
      depth: 0 | 1 | 2
    ): Star[] {
      return Array.from(
        { length: count },
        () => {
          const strongTwinkle =
            Math.random() < 0.5;

          let radiusMin = 0.25;
          let radiusRange = 0.65;
          let baseAlpha = 0.22;

          let driftScale = 0.15;

          if (depth === 1) {
            radiusMin = 0.35;
            radiusRange = 0.9;
            baseAlpha = 0.28;

            driftScale = 0.34;
          }

          if (depth === 2) {
            radiusMin = 0.5;
            radiusRange = 1.35;
            baseAlpha = 0.35;

            driftScale = 0.68;
          }

          const radius =
            radiusMin +
            Math.random() * radiusRange;

          const bright =
            radius >
              (depth === 2 ? 1.15 : 0.9) &&
            Math.random() < 0.45;

          return {
            x: Math.random(),
            y: Math.random(),

            radius,

            baseAlpha:
              baseAlpha +
              Math.random() * 0.26,

            phase:
              Math.random() *
              Math.PI *
              2,

            twinkleSpeed:
              0.012 +
              Math.random() * 0.032,

            twinkleStrength:
              strongTwinkle
                ? 0.72 +
                  Math.random() * 0.45
                : 0.22 +
                  Math.random() * 0.28,

            depth,

            driftX:
              (0.002 +
                Math.random() * 0.004) *
              driftScale,

            driftY:
              (-0.00035 +
                Math.random() * 0.0007) *
              driftScale,

            tint: randomTint(),

            glow: bright,
            spike:
              bright &&
              Math.random() < 0.46,
          };
        }
      );
    }

    /*
     * ~650 stars total.
     *
     * Dense enough to feel like a sky,
     * but not so dense that mobile Safari
     * spends the whole frame painting blur.
     */
    const farStars = makeLayer(
      360,
      0
    );

    const middleStars = makeLayer(
      200,
      1
    );

    const nearStars = makeLayer(
      90,
      2
    );

    const stars = [
      ...farStars,
      ...middleStars,
      ...nearStars,
    ];

    function applyCanvasSize() {
      dpr = Math.min(
        window.devicePixelRatio || 1,
        1.5
      );

      const {
        width,
        height,
      } = getViewportSize();

      /*
       * Critical:
       *
       * Do absolutely nothing if the
       * physical viewport did not change.
       *
       * Reassigning canvas.width or
       * canvas.height clears the canvas,
       * which was the source of the old
       * iOS toolbar flicker.
       */
      if (
        width === cssWidth &&
        height === cssHeight
      ) {
        return;
      }

      cssWidth = width;
      cssHeight = height;

      canvas.style.width =
        `${width}px`;

      canvas.style.height =
        `${height}px`;

      const bufferWidth = Math.max(
        1,
        Math.round(width * dpr)
      );

      const bufferHeight = Math.max(
        1,
        Math.round(height * dpr)
      );

      if (
        canvas.width !== bufferWidth
      ) {
        canvas.width = bufferWidth;
      }

      if (
        canvas.height !== bufferHeight
      ) {
        canvas.height =
          bufferHeight;
      }

      ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
      );
    }

    applyCanvasSize();

    /*
     * visualViewport.resize is still useful
     * because an actual viewport-size change
     * should resize the canvas.
     *
     * We intentionally DO NOT listen for
     * visualViewport.scroll anymore.
     */
    window.addEventListener(
      "resize",
      applyCanvasSize
    );

    window.addEventListener(
      "orientationchange",
      applyCanvasSize
    );

    window.visualViewport?.addEventListener(
      "resize",
      applyCanvasSize
    );

    function drawNebula(
      now: number,
      w: number,
      h: number
    ) {
      const seconds =
        now * 0.001;

      const breatheA =
        0.92 +
        Math.sin(seconds * 0.18) *
          0.08;

      const breatheB =
        0.92 +
        Math.cos(seconds * 0.14) *
          0.08;

      const swayX =
        Math.sin(seconds * 0.07) *
        w *
        0.025;

      const swayY =
        Math.cos(seconds * 0.055) *
        h *
        0.018;

      ctx.save();

      ctx.globalCompositeOperation =
        "screen";

      /*
       * Violet cloud
       */
      {
        const x =
          w * 0.18 + swayX;

        const y =
          h * 0.26 + swayY;

        const radius =
          Math.max(w, h) *
          0.38 *
          breatheA;

        const gradient =
          ctx.createRadialGradient(
            x,
            y,
            0,
            x,
            y,
            radius
          );

        gradient.addColorStop(
          0,
          "rgba(109,40,217,0.085)"
        );

        gradient.addColorStop(
          0.35,
          "rgba(76,29,149,0.054)"
        );

        gradient.addColorStop(
          1,
          "rgba(30,27,75,0)"
        );

        ctx.fillStyle = gradient;

        ctx.fillRect(
          0,
          0,
          w,
          h
        );
      }

      /*
       * Blue cloud
       */
      {
        const x =
          w * 0.78 -
          swayX * 0.7;

        const y =
          h * 0.55 -
          swayY * 0.7;

        const radius =
          Math.max(w, h) *
          0.33 *
          breatheB;

        const gradient =
          ctx.createRadialGradient(
            x,
            y,
            0,
            x,
            y,
            radius
          );

        gradient.addColorStop(
          0,
          "rgba(37,99,235,0.075)"
        );

        gradient.addColorStop(
          0.42,
          "rgba(30,64,175,0.042)"
        );

        gradient.addColorStop(
          1,
          "rgba(15,23,42,0)"
        );

        ctx.fillStyle = gradient;

        ctx.fillRect(
          0,
          0,
          w,
          h
        );
      }

      /*
       * Teal lower cloud
       */
      {
        const x =
          w * 0.52 +
          swayX * 0.5;

        const y =
          h * 0.86;

        const radius =
          Math.max(w, h) *
          0.29 *
          breatheA;

        const gradient =
          ctx.createRadialGradient(
            x,
            y,
            0,
            x,
            y,
            radius
          );

        gradient.addColorStop(
          0,
          "rgba(20,184,166,0.040)"
        );

        gradient.addColorStop(
          1,
          "rgba(13,148,136,0)"
        );

        ctx.fillStyle = gradient;

        ctx.fillRect(
          0,
          0,
          w,
          h
        );
      }

      ctx.restore();
    }

    function drawStar(
      star: Star,
      w: number,
      h: number,
      frameScale: number
    ) {
      /*
       * Parallax.
       *
       * Near stars move several times faster
       * than distant stars.
       */
      star.x +=
        star.driftX *
        frameScale;

      star.y +=
        star.driftY *
        frameScale;

      if (star.x > 1.015) {
        star.x = -0.015;
      }

      if (star.x < -0.015) {
        star.x = 1.015;
      }

      if (star.y > 1.015) {
        star.y = -0.015;
      }

      if (star.y < -0.015) {
        star.y = 1.015;
      }

      star.phase +=
        star.twinkleSpeed *
        frameScale;

      /*
       * Two waves prevent every pulse from
       * feeling like the same sine animation.
       */
      const waveA =
        (Math.sin(star.phase) + 1) /
        2;

      const waveB =
        (Math.sin(
          star.phase * 0.47 + 1.7
        ) +
          1) /
        2;

      const pulse =
        waveA * 0.72 +
        waveB * 0.28;

      const strength =
        star.twinkleStrength;

      const alpha =
        Math.min(
          1,
          star.baseAlpha *
            (
              0.55 +
              pulse * strength
            )
        );

      const radius =
        star.radius *
        (
          0.82 +
          pulse *
            Math.min(
              0.48,
              strength * 0.38
            )
        );

      const x =
        star.x * w;

      const y =
        star.y * h;

      const [r, g, b] =
        tintRgb(star.tint);

      /*
       * Glow only on selected brighter stars.
       */
      if (
        star.glow &&
        pulse > 0.58
      ) {
        const glowRadius =
          radius *
          (
            5 +
            pulse * 5
          );

        const glow =
          ctx.createRadialGradient(
            x,
            y,
            0,
            x,
            y,
            glowRadius
          );

        glow.addColorStop(
          0,
          `rgba(${r},${g},${b},${
            alpha * 0.36
          })`
        );

        glow.addColorStop(
          0.32,
          `rgba(${r},${g},${b},${
            alpha * 0.14
          })`
        );

        glow.addColorStop(
          1,
          `rgba(${r},${g},${b},0)`
        );

        ctx.fillStyle = glow;

        ctx.beginPath();

        ctx.arc(
          x,
          y,
          glowRadius,
          0,
          Math.PI * 2
        );

        ctx.fill();
      }

      /*
       * Star core.
       */
      ctx.fillStyle =
        `rgba(${r},${g},${b},${alpha})`;

      ctx.beginPath();

      ctx.arc(
        x,
        y,
        radius,
        0,
        Math.PI * 2
      );

      ctx.fill();

      /*
       * Very short diffraction flare.
       *
       * Only appears near pulse peak so it
       * looks like a flash rather than a
       * permanent plus sign.
       */
      if (
        star.spike &&
        pulse > 0.91
      ) {
        const flare =
          (pulse - 0.91) /
          0.09;

        const horizontal =
          radius *
          (
            5 +
            flare * 6
          );

        const vertical =
          radius *
          (
            3 +
            flare * 4
          );

        ctx.save();

        ctx.strokeStyle =
          `rgba(${r},${g},${b},${
            0.16 +
            flare * 0.42
          })`;

        ctx.lineWidth = 0.65;

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
    }

    function startShootingStar(
      w: number,
      h: number
    ) {
      /*
       * Start mostly in the top/right
       * portion and streak down-left.
       */
      shootingStar.active = true;

      shootingStar.x =
        w *
        (
          0.46 +
          Math.random() * 0.54
        );

      shootingStar.y =
        h *
        (
          0.04 +
          Math.random() * 0.31
        );

      const speed =
        11 +
        Math.random() * 8;

      shootingStar.vx =
        -speed;

      shootingStar.vy =
        speed *
        (
          0.34 +
          Math.random() * 0.28
        );

      shootingStar.life = 0;

      shootingStar.maxLife =
        28 +
        Math.random() * 18;

      shootingStar.length =
        78 +
        Math.random() * 95;

      shootingStar.width =
        0.8 +
        Math.random() * 0.8;
    }

    function drawShootingStar(
      frameScale: number
    ) {
      if (!shootingStar.active) {
        return;
      }

      shootingStar.life +=
        frameScale;

      shootingStar.x +=
        shootingStar.vx *
        frameScale;

      shootingStar.y +=
        shootingStar.vy *
        frameScale;

      const progress =
        shootingStar.life /
        shootingStar.maxLife;

      if (progress >= 1) {
        shootingStar.active = false;

        nextShootingStarAt =
          performance.now() +
          5000 +
          Math.random() * 7000;

        return;
      }

      const fade =
        progress < 0.18
          ? progress / 0.18
          : 1 -
            (
              progress - 0.18
            ) /
              0.82;

      const speedLength =
        Math.hypot(
          shootingStar.vx,
          shootingStar.vy
        );

      const nx =
        shootingStar.vx /
        speedLength;

      const ny =
        shootingStar.vy /
        speedLength;

      const tailX =
        shootingStar.x -
        nx *
          shootingStar.length;

      const tailY =
        shootingStar.y -
        ny *
          shootingStar.length;

      const gradient =
        ctx.createLinearGradient(
          tailX,
          tailY,
          shootingStar.x,
          shootingStar.y
        );

      gradient.addColorStop(
        0,
        "rgba(165,180,252,0)"
      );

      gradient.addColorStop(
        0.72,
        `rgba(191,219,254,${
          fade * 0.34
        })`
      );

      gradient.addColorStop(
        1,
        `rgba(255,255,255,${
          fade * 0.92
        })`
      );

      ctx.save();

      ctx.strokeStyle =
        gradient;

      ctx.lineWidth =
        shootingStar.width;

      ctx.lineCap =
        "round";

      ctx.shadowBlur = 8;

      ctx.shadowColor =
        `rgba(191,219,254,${
          fade * 0.5
        })`;

      ctx.beginPath();

      ctx.moveTo(
        tailX,
        tailY
      );

      ctx.lineTo(
        shootingStar.x,
        shootingStar.y
      );

      ctx.stroke();

      /*
       * Head flare.
       */
      ctx.fillStyle =
        `rgba(255,255,255,${
          fade * 0.95
        })`;

      ctx.beginPath();

      ctx.arc(
        shootingStar.x,
        shootingStar.y,
        1.4,
        0,
        Math.PI * 2
      );

      ctx.fill();

      ctx.restore();
    }

    const draw = (
      now: number
    ) => {
      if (!running) return;

      raf =
        requestAnimationFrame(
          draw
        );

      const elapsed =
        now - lastFrame;

      if (
        elapsed <
        frameInterval
      ) {
        return;
      }

      /*
       * Normalize motion to the intended
       * 30fps timestep.
       */
      const frameScale =
        Math.min(
          2.5,
          elapsed /
            frameInterval
        );

      lastFrame =
        now -
        (
          elapsed %
          frameInterval
        );

      const w = cssWidth;
      const h = cssHeight;

      if (!w || !h) {
        return;
      }

      ctx.clearRect(
        0,
        0,
        w,
        h
      );

      drawNebula(
        now,
        w,
        h
      );

      /*
       * Draw far → near so larger foreground
       * points naturally sit above the haze.
       */
      for (
        const star of farStars
      ) {
        drawStar(
          star,
          w,
          h,
          frameScale
        );
      }

      for (
        const star of middleStars
      ) {
        drawStar(
          star,
          w,
          h,
          frameScale
        );
      }

      for (
        const star of nearStars
      ) {
        drawStar(
          star,
          w,
          h,
          frameScale
        );
      }

      if (
        !shootingStar.active &&
        now >=
          nextShootingStarAt
      ) {
        startShootingStar(
          w,
          h
        );
      }

      drawShootingStar(
        frameScale
      );
    };

    const handleVisibility = () => {
      if (
        document.hidden
      ) {
        running = false;

        cancelAnimationFrame(
          raf
        );

        return;
      }

      if (!running) {
        running = true;

        lastFrame = 0;

        /*
         * This may no-op if dimensions did
         * not actually change.
         */
        applyCanvasSize();

        raf =
          requestAnimationFrame(
            draw
          );
      }
    };

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
        applyCanvasSize
      );

      window.removeEventListener(
        "orientationchange",
        applyCanvasSize
      );

      window.visualViewport?.removeEventListener(
        "resize",
        applyCanvasSize
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

        /*
         * The JS sizing replaces this after mount,
         * including the 200px overscan. This is
         * simply a safe first-paint fallback.
         */
        height: "calc(100dvh + 200px)",

        pointerEvents: "none",

        zIndex: 0,
      }}
    />
  );
}