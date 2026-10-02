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

    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const viewportSize = () => {
      const vv = window.visualViewport;

      const width = Math.max(
        window.innerWidth,
        document.documentElement.clientWidth,
        vv?.width ?? 0
      );

      /*
       * Use the visible viewport's lower edge rather than only its height.
       * On iOS Safari, visualViewport.offsetTop can be non-zero.
       */
      const visibleBottom = vv
        ? vv.offsetTop + vv.height
        : window.innerHeight;

      const height = Math.max(
        window.innerHeight,
        document.documentElement.clientHeight,
        visibleBottom
      );

      return { width, height };
    };

    const staticStars: Star[] = Array.from({ length: 52 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.05 + 0.3,
      a: Math.random() * 0.48 + 0.22,
    }));

    const twink: TStar[] = Array.from({ length: 28 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.05 + 0.4,
      ph: Math.random() * Math.PI * 2,
      sp: Math.random() * 0.018 + 0.006,
    }));

    const con: CStar[] = Array.from({ length: 10 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.1 + 0.65,
    }));

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);

      const { width, height } = viewportSize();

      /*
       * Size both the CSS canvas and its actual drawing buffer.
       * This prevents the starfield from inheriting a short parent height.
       */
      canvas.style.width = `${Math.ceil(width)}px`;
      canvas.style.height = `${Math.ceil(height)}px`;

      canvas.width = Math.max(
        1,
        Math.round(width * dpr)
      );

      canvas.height = Math.max(
        1,
        Math.round(height * dpr)
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

    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);

    window.visualViewport?.addEventListener(
      "resize",
      resize
    );

    window.visualViewport?.addEventListener(
      "scroll",
      resize
    );

    let raf = 0;
    let running = true;
    let lastFrame = 0;

    const frameInterval = 1000 / 30;

    const draw = (now: number) => {
      if (!running) return;

      raf = requestAnimationFrame(draw);

      if (now - lastFrame < frameInterval) {
        return;
      }

      lastFrame =
        now -
        ((now - lastFrame) % frameInterval);

      const { width: w, height: h } =
        viewportSize();

      ctx.clearRect(0, 0, w, h);

      /* Static stars */
      for (const star of staticStars) {
        ctx.fillStyle =
          `rgba(219,234,254,${star.a})`;

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

      /* Ambient constellation/network */
      for (let i = 0; i < con.length; i++) {
        for (
          let j = i + 1;
          j < con.length;
          j++
        ) {
          const a = con[i];
          const b = con[j];

          const dx =
            (a.x - b.x) * w;

          const dy =
            (a.y - b.y) * h;

          const distance =
            Math.sqrt(dx * dx + dy * dy);

          if (distance < 80) {
            ctx.strokeStyle =
              `rgba(
                147,
                197,
                253,
                ${0.18 * (1 - distance / 80)}
              )`;

            ctx.lineWidth = 0.6;

            ctx.beginPath();

            ctx.moveTo(
              a.x * w,
              a.y * h
            );

            ctx.lineTo(
              b.x * w,
              b.y * h
            );

            ctx.stroke();
          }
        }
      }

      for (const star of con) {
        ctx.fillStyle =
          "rgba(191,219,254,0.72)";

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

      /* Twinkle layer */
      for (const star of twink) {
        star.ph += star.sp;

        const twinkle =
          (Math.sin(star.ph) + 1) / 2;

        ctx.fillStyle =
          `rgba(
            226,
            232,
            240,
            ${0.18 + twinkle * 0.52}
          )`;

        ctx.beginPath();

        ctx.arc(
          star.x * w,
          star.y * h,
          star.r *
            (0.76 + twinkle * 0.28),
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
        resize();
        raf = requestAnimationFrame(draw);
      }
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibility
    );

    raf = requestAnimationFrame(draw);

    return () => {
      running = false;

      cancelAnimationFrame(raf);

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

      window.visualViewport?.removeEventListener(
        "scroll",
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

        /*
         * Do not inherit the PagerContainer's dimensions.
         * The starfield owns the physical viewport.
         */
        width: "100vw",
        height: "100dvh",

        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}