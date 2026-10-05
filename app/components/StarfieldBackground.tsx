"use client";

import React, { useEffect, useRef } from "react";

/**
 * StarfieldBackground
 *
 * Direction:
 *   - Reads as a galaxy, not a scatter of dots.
 *   - One diagonal galactic band carries ~60% of the star density.
 *   - Overall star count is ~20% lower than the previous version.
 *   - Weighted size + brightness distribution: a few bright anchors,
 *     many quiet dust stars. Uniform sprinkle was the thing we're avoiding.
 *   - Weighted palette biased to the app's four-tone hero system:
 *     warm champagne, cool blue-white, pale cyan, soft violet.
 *   - Twinkle is rare (~1 in 12). Most stars are still.
 *   - One very soft nebula wash behind everything keeps the sky from
 *     reading as pure black + dots.
 */
export default function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    /* ── Palettes ────────────────────────────────────────────────────────
       Four hues matching HERO_PALETTE (emerald/cyan/sky/violet) but
       desaturated enough to stay sky-like. Weighted to keep warm-white
       dominant so the field still reads as "stars" and not "confetti".
    */
    type Hue = "warm" | "cool" | "cyan" | "violet";

    const STAR_COLORS: Record<Hue, [number, number, number]> = {
      warm:   [244, 240, 232], // champagne-adjacent white
      cool:   [201, 217, 255], // classic blue-white
      cyan:   [200, 240, 255], // pale cyan (HERO c2)
      violet: [217, 200, 255], // soft violet (HERO c4)
    };

    // Weighted hue picker. Same order as HERO_PALETTE so it feels native.
    const pickHue = (): Hue => {
      const r = Math.random();
      if (r < 0.55) return "warm";
      if (r < 0.80) return "cool";
      if (r < 0.92) return "cyan";
      return "violet";
    };

    /* ── Star shape ──────────────────────────────────────────────────────
       size is in device-independent pixels.
       brightness is a 0..1 alpha multiplier.
       band tells us whether this star sits on the galactic arm.
    */
    type Star = {
      x: number;         // 0..1 viewport fraction
      y: number;         // 0..1 viewport fraction
      size: number;      // 0.5 .. 2.8
      brightness: number;// 0.35 .. 1.0
      hue: Hue;
      twinkles: boolean;
      phase: number;
      speed: number;
    };

    /* ── Galactic band ───────────────────────────────────────────────────
       The arm runs from lower-left to upper-right. Points on the band
       cluster around a straight line; the perpendicular spread is small.
       Outside the band, stars are sparser and quieter.
    */
    const BAND_ANGLE = -Math.PI / 5; // ~ -36°, lower-left → upper-right
    const BAND_CENTER_X = 0.5;
    const BAND_CENTER_Y = 0.5;
    const BAND_WIDTH = 0.42;         // perpendicular σ in viewport units

    // A cheap 2D Gaussian via Box-Muller for the perpendicular offset.
    const gaussian = () => {
      let u = 0;
      let v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };

    // Place a point either on the band (bandRatio chance) or uniformly.
    const placePoint = (bandRatio: number): { x: number; y: number } => {
      if (Math.random() < bandRatio) {
        // Distance along the arm, uniformly across the diagonal.
        const along = (Math.random() - 0.5) * 1.6;
        // Perpendicular offset, tight Gaussian so most points are on the arm.
        const perp = gaussian() * BAND_WIDTH * 0.5;

        const cosA = Math.cos(BAND_ANGLE);
        const sinA = Math.sin(BAND_ANGLE);

        // Point in band-local coordinates, then rotate into viewport space.
        const localX = along * cosA - perp * sinA;
        const localY = along * sinA + perp * cosA;

        return {
          x: BAND_CENTER_X + localX,
          y: BAND_CENTER_Y + localY,
        };
      }

      return { x: Math.random(), y: Math.random() };
    };

    // Density falloff: fade stars toward the corners so the middle of the
    // sky feels populated and the edges feel empty. Returns 0..1.
    const edgeFalloff = (x: number, y: number): number => {
      const dx = (x - 0.5) * 2;
      const dy = (y - 0.5) * 2;
      const r = Math.sqrt(dx * dx + dy * dy);
      // Fully bright through r = 0.55, fades to 0.35 by the corners.
      return Math.max(0.35, 1 - Math.max(0, r - 0.55) * 1.3);
    };

    /* ── Star populations ────────────────────────────────────────────────
       Counts are ~20% lower than the previous 52 + 28 + 10 = 90 total.
       New total ≈ 72. The saved budget goes back into size/brightness
       distribution rather than more stars.
    */
    const buildStars = (): Star[] => {
      const stars: Star[] = [];

      // Dust layer: many tiny quiet stars, mostly on the band.
      // Previous static count was 52 → now 42.
      for (let i = 0; i < 42; i++) {
        const { x, y } = placePoint(0.65);
        const falloff = edgeFalloff(x, y);
        stars.push({
          x,
          y,
          // Weighted size: most dust stars are 0.5..1.1, a few reach 1.6.
          size:
            Math.random() < 0.9
              ? 0.5 + Math.random() * 0.6
              : 1.0 + Math.random() * 0.6,
          // Quiet: alpha capped around 0.55 so the anchors stand out.
          brightness:
            (0.32 + Math.random() * 0.24) * falloff,
          hue: pickHue(),
          twinkles: Math.random() < 0.06,
          phase: Math.random() * Math.PI * 2,
          speed: 0.006 + Math.random() * 0.012,
        });
      }

      // Anchor layer: fewer, brighter stars that give the sky its depth.
      // These are the ones the eye lands on. Mostly on the band.
      // Previous twinkle count was 28 → now 22.
      for (let i = 0; i < 22; i++) {
        const { x, y } = placePoint(0.7);
        const falloff = edgeFalloff(x, y);
        stars.push({
          x,
          y,
          // Bigger anchors: 1.2 .. 2.2, occasionally 2.8.
          size:
            Math.random() < 0.85
              ? 1.2 + Math.random() * 1.0
              : 2.2 + Math.random() * 0.6,
          brightness:
            (0.72 + Math.random() * 0.28) * falloff,
          hue: pickHue(),
          // Rare twinkle: ~1 in 12 of the anchors breathe.
          twinkles: Math.random() < 0.08,
          phase: Math.random() * Math.PI * 2,
          speed: 0.005 + Math.random() * 0.008,
        });
      }

      return stars;
    };

    // Previous constellation count was 10. We keep a smaller, softer
    // version because the constellation lines were a nice touch — just
    // fewer nodes, fewer lines, lower opacity so it reads as haze.
    const buildConstellation = (): Array<{ x: number; y: number; r: number }> => {
      // 8 nodes, mostly on the band so the arm is where the "structure" is.
      return Array.from({ length: 8 }, () => {
        const { x, y } = placePoint(0.7);
        return {
          x,
          y,
          r: 0.7 + Math.random() * 0.8,
        };
      });
    };

    let stars: Star[] = buildStars();
    let constellation = buildConstellation();

    /* ── Canvas sizing ───────────────────────────────────────────────────
       Kept the same visualViewport-aware logic you already had. This is
       load-bearing on iOS Safari and I didn't want to touch it.
    */
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const viewportSize = () => {
      const vv = window.visualViewport;

      const width = Math.max(
        window.innerWidth,
        document.documentElement.clientWidth,
        vv?.width ?? 0
      );

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

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);

      const { width, height } = viewportSize();

      canvas.style.width = `${Math.ceil(width)}px`;
      canvas.style.height = `${Math.ceil(height)}px`;

      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Regenerate on resize so the band rebases against the new
      // aspect ratio. Layouts are cheap; visual continuity is not.
      stars = buildStars();
      constellation = buildConstellation();
    };

    resize();

    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);

    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);

    /* ── Draw loop ───────────────────────────────────────────────────────
       Kept the 30fps cap. For a mostly-static sky, this is the right
       tradeoff — half the CPU of 60fps with no visible loss.
    */
    let raf = 0;
    let running = true;
    let lastFrame = 0;

    const frameInterval = 1000 / 30;
    let elapsed = 0;

    const draw = (now: number) => {
      if (!running) return;

      raf = requestAnimationFrame(draw);

      if (now - lastFrame < frameInterval) return;
      lastFrame = now - ((now - lastFrame) % frameInterval);

      const { width: w, height: h } = viewportSize();

      ctx.clearRect(0, 0, w, h);

      elapsed += frameInterval / 1000;

      /* ── Nebula wash ────────────────────────────────────────────────
         One very low-opacity radial gradient offset from center. This is
         the single most important change for "galaxy" reading — it stops
         the background from being black plus dots. Two overlapping washes
         (violet top-right, cyan bottom-left) give a subtle color field.
      */
      const nebulaA = ctx.createRadialGradient(
        w * 0.72, h * 0.22, 0,
        w * 0.72, h * 0.22, Math.max(w, h) * 0.7
      );
      nebulaA.addColorStop(0, "rgba(139, 92, 246, 0.055)"); // soft violet
      nebulaA.addColorStop(0.55, "rgba(139, 92, 246, 0.018)");
      nebulaA.addColorStop(1, "rgba(139, 92, 246, 0)");
      ctx.fillStyle = nebulaA;
      ctx.fillRect(0, 0, w, h);

      const nebulaB = ctx.createRadialGradient(
        w * 0.22, h * 0.78, 0,
        w * 0.22, h * 0.78, Math.max(w, h) * 0.6
      );
      nebulaB.addColorStop(0, "rgba(56, 189, 248, 0.042)"); // soft sky/cyan
      nebulaB.addColorStop(0.6, "rgba(56, 189, 248, 0.012)");
      nebulaB.addColorStop(1, "rgba(56, 189, 248, 0)");
      ctx.fillStyle = nebulaB;
      ctx.fillRect(0, 0, w, h);

      /* ── Constellation haze ─────────────────────────────────────────
         Lines between nearby nodes only. Lower opacity than before so it
         reads as structure inside the arm, not as a diagram.
      */
      const conLink = 78;
      for (let i = 0; i < constellation.length; i++) {
        for (let j = i + 1; j < constellation.length; j++) {
          const a = constellation[i];
          const b = constellation[j];

          const dx = (a.x - b.x) * w;
          const dy = (a.y - b.y) * h;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < conLink) {
            const linkAlpha = 0.10 * (1 - distance / conLink);
            ctx.strokeStyle = `rgba(147, 197, 253, ${linkAlpha})`;
            ctx.lineWidth = 0.55;
            ctx.beginPath();
            ctx.moveTo(a.x * w, a.y * h);
            ctx.lineTo(b.x * w, b.y * h);
            ctx.stroke();
          }
        }
      }

      /* ── Star field ─────────────────────────────────────────────────
         Single pass over the merged dust + anchor population. The eye
         sees a continuum; the code sees weighted buckets.
      */
      for (const star of stars) {
        let alpha = star.brightness;

        // Rare twinkle: only ~8% of the population breathes. Anchors
        // get a slightly stronger pulse so their movement is legible.
        if (star.twinkles) {
          const twinkle = (Math.sin(elapsed * (1 + star.speed * 40) * 2 + star.phase) + 1) / 2;
          const amplitude = star.size > 1.4 ? 0.4 : 0.24;
          alpha = Math.min(1, alpha + twinkle * amplitude);
        }

        const [r, g, b] = STAR_COLORS[star.hue];

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;

        // Bright anchors get a subtle glow so they feel like real stars
        // and not just big dots. Kept very cheap — a single wider circle
        // underneath the core.
        if (star.size > 1.6) {
          ctx.beginPath();
          ctx.arc(star.x * w, star.y * h, star.size * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.09})`;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(star.x * w, star.y * h, star.size, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    /* ── Visibility handling ─────────────────────────────────────────────
       Kept as-is. Stopping the RAF loop when the tab is hidden matters on
       mobile; I didn't want to change that behavior.
    */
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

    document.addEventListener("visibilitychange", handleVisibility);

    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);

      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);

      window.visualViewport?.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("scroll", resize);

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

        /*
         * The starfield owns the physical viewport. It should not
         * inherit the PagerContainer's dimensions.
         */
        width: "100vw",
        height: "100dvh",

        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}