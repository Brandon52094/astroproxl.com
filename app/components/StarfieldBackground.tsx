"use client";

import React, { useEffect, useRef } from "react";

/**
 * Full-viewport galaxy: nebula clouds, a dense Milky Way band, three
 * parallax depth layers that drift, twinkling stars with soft glows,
 * and the occasional shooting star.
 *
 * The canvas is fixed to the screen and overscans past the bottom edge,
 * so there is never a visible border when mobile browser chrome collapses.
 */

const OVERSCAN = 200; // extra px below the viewport (iOS toolbar, rubber-banding)
const BAND_ANGLE = -0.42; // tilt of the Milky Way band (radians)

type Star = {
  x: number; // 0..1
  y: number; // 0..1
  r: number;
  a: number; // base alpha
  amp: number; // twinkle depth 0..1
  sp: number; // twinkle speed (rad/sec)
  ph: number;
  vx: number; // drift, normalized units per second
  vy: number;
  c: number; // colour index
  glow: boolean;
};

type Shooter = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  len: number;
};

const TINTS: [number, number, number][] = [
  [226, 236, 255], // blue-white
  [255, 255, 255], // white
  [255, 232, 200], // warm
  [200, 190, 255], // violet
  [190, 225, 255], // ice
];

export default function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    let stars: Star[] = [];
    let shooters: Shooter[] = [];
    let nebula: HTMLCanvasElement | null = null;
    let nextShooter = 3;
    let raf = 0;
    let running = true;
    let last = 0;
    let time = 0;

    /* ---------- sprites ---------- */
    const sprites = TINTS.map(([r, g, b]) => {
      const s = document.createElement("canvas");
      s.width = s.height = 64;
      const c = s.getContext("2d")!;
      const grad = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
      grad.addColorStop(0.18, `rgba(${r},${g},${b},0.35)`);
      grad.addColorStop(0.5, `rgba(${r},${g},${b},0.07)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      c.fillStyle = grad;
      c.fillRect(0, 0, 64, 64);
      return s;
    });

    /* ---------- helpers ---------- */
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const gauss = () =>
      (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; // ~-1..1 bell
    const wrap = (v: number) => ((v % 1) + 1) % 1;

    const viewport = () => {
      const vv = window.visualViewport;
      const width = Math.max(
        window.innerWidth,
        document.documentElement.clientWidth,
        vv?.width ?? 0
      );
      const height = Math.max(
        window.innerHeight,
        document.documentElement.clientHeight,
        vv ? vv.offsetTop + vv.height : 0
      );
      return { width, height };
    };

    /* ---------- star generation ---------- */
    const makeStar = (x: number, y: number, depth: number): Star => {
      // depth 0 = far (tiny, slow), 1 = near (bigger, faster)
      const bright = Math.random() < 0.06 * (0.4 + depth);
      const twinkler = Math.random() < 0.45;
      return {
        x,
        y,
        r: bright ? rand(1.1, 1.9) : rand(0.25, 0.7) + depth * 0.55,
        a: bright ? rand(0.8, 1) : rand(0.25, 0.7) * (0.55 + depth * 0.45),
        amp: twinkler ? rand(0.5, 0.95) : rand(0.05, 0.25),
        sp: rand(0.8, 3.2),
        ph: rand(0, Math.PI * 2),
        vx: (0.0009 + depth * 0.0034) * (Math.random() < 0.15 ? -0.6 : 1),
        vy: -(0.0004 + depth * 0.0014),
        c: Math.floor(Math.random() * TINTS.length),
        glow: bright,
      };
    };

    const buildStars = () => {
      const area = W * H;
      const field = Math.min(520, Math.max(220, Math.round(area / 3200)));
      const band = Math.round(field * 0.9);
      const out: Star[] = [];

      // Scattered field everywhere (reaches the very bottom)
      for (let i = 0; i < field; i++) {
        out.push(makeStar(Math.random(), Math.random(), Math.random()));
      }

      // Dense Milky Way band running diagonally across the screen
      const cos = Math.cos(BAND_ANGLE);
      const sin = Math.sin(BAND_ANGLE);
      for (let i = 0; i < band; i++) {
        const u = (Math.random() - 0.5) * 1.7;
        const v = gauss() * 0.11;
        const x = wrap(0.5 + u * cos - v * sin);
        const y = wrap(0.5 + u * sin + v * cos);
        const s = makeStar(x, y, Math.random() * 0.7);
        s.a = Math.min(1, s.a * 1.15);
        out.push(s);
      }
      stars = out;
    };

    /* ---------- nebula (pre-rendered once per resize) ---------- */
    const buildNebula = () => {
      const scale = 0.5; // low-res is plenty for soft clouds
      const nw = Math.max(1, Math.round(W * scale));
      const nh = Math.max(1, Math.round(H * scale));
      const off = document.createElement("canvas");
      off.width = nw;
      off.height = nh;
      const c = off.getContext("2d")!;
      c.globalCompositeOperation = "lighter";

      const cos = Math.cos(BAND_ANGLE);
      const sin = Math.sin(BAND_ANGLE);
      const palette = [
        [99, 102, 241], // indigo
        [139, 92, 246], // violet
        [56, 189, 248], // sky
        [236, 72, 153], // magenta
        [45, 212, 191], // teal
      ];

      const blob = (
        nx: number,
        ny: number,
        radius: number,
        col: number[],
        alpha: number
      ) => {
        const x = nx * nw;
        const y = ny * nh;
        const r = radius * Math.max(nw, nh);
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${alpha})`);
        g.addColorStop(
          0.5,
          `rgba(${col[0]},${col[1]},${col[2]},${alpha * 0.35})`
        );
        g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
        c.fillStyle = g;
        c.fillRect(0, 0, nw, nh);
      };

      // Clouds along the band
      for (let i = 0; i < 16; i++) {
        const u = (Math.random() - 0.5) * 1.5;
        const v = gauss() * 0.09;
        blob(
          0.5 + u * cos - v * sin,
          0.5 + u * sin + v * cos,
          rand(0.16, 0.3),
          palette[Math.floor(Math.random() * palette.length)],
          rand(0.08, 0.16)
        );
      }
      // Bright galactic core
      blob(0.5, 0.5, 0.32, [180, 160, 255], 0.14);
      blob(0.5, 0.5, 0.14, [255, 230, 210], 0.09);

      // Faint colour washes elsewhere so the lower screen isn't empty
      for (let i = 0; i < 6; i++) {
        blob(
          Math.random(),
          Math.random(),
          rand(0.2, 0.38),
          palette[Math.floor(Math.random() * palette.length)],
          rand(0.035, 0.07)
        );
      }

      nebula = off;
    };

    /* ---------- sizing ---------- */
    const resize = () => {
      const { width, height } = viewport();
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
      if (
        Math.abs(width - W) < 1 &&
        Math.abs(height - H) < 1 &&
        nextDpr === dpr &&
        stars.length
      ) {
        return; // nothing changed; don't wipe the canvas
      }
      const firstBuild = stars.length === 0;
      const sizeChanged = Math.abs(width - W) > 40 || Math.abs(height - H) > 160;

      dpr = nextDpr;
      W = Math.ceil(width);
      H = Math.ceil(height) + OVERSCAN;

      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (firstBuild || sizeChanged || !nebula) {
        buildStars();
        buildNebula();
      }
      if (reduceMotion) render(0);
    };

    /* ---------- drawing ---------- */
    const spawnShooter = () => {
      const fromLeft = Math.random() < 0.5;
      const speed = rand(520, 820);
      const ang = rand(0.35, 0.75); // downward slope
      shooters.push({
        x: rand(0.1, 0.9) * W,
        y: rand(0, 0.45) * H,
        vx: Math.cos(ang) * speed * (fromLeft ? 1 : -1),
        vy: Math.sin(ang) * speed,
        life: 0,
        max: rand(0.7, 1.1),
        len: rand(90, 160),
      });
    };

    const render = (dt: number) => {
      ctx.clearRect(0, 0, W, H);

      /* Nebula: slow sway + gentle breathing */
      if (nebula) {
        const sway = Math.sin(time * 0.05) * 14;
        const swayY = Math.cos(time * 0.037) * 10;
        ctx.globalAlpha = 0.85 + Math.sin(time * 0.3) * 0.1;
        ctx.drawImage(nebula, -20 + sway, -20 + swayY, W + 40, H + 40);
        ctx.globalAlpha = 1;
      }

      /* Stars */
      for (const s of stars) {
        if (dt) {
          s.x = wrap(s.x + s.vx * dt);
          s.y = wrap(s.y + s.vy * dt);
          s.ph += s.sp * dt;
        }
        const tw = (Math.sin(s.ph) + 1) / 2;
        const alpha = s.a * (1 - s.amp + s.amp * tw);
        const x = s.x * W;
        const y = s.y * H;
        const tint = TINTS[s.c];

        if (s.glow) {
          const size = s.r * 9 * (0.8 + tw * 0.35);
          ctx.globalAlpha = Math.min(1, alpha * 0.9);
          ctx.drawImage(sprites[s.c], x - size / 2, y - size / 2, size, size);

          // Diffraction spikes on the brightest stars
          if (s.r > 1.5 && tw > 0.55) {
            const len = s.r * 5 * tw;
            ctx.globalAlpha = alpha * 0.45;
            ctx.strokeStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(x - len, y);
            ctx.lineTo(x + len, y);
            ctx.moveTo(x, y - len);
            ctx.lineTo(x, y + len);
            ctx.stroke();
          }
        }

        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`;
        ctx.beginPath();
        ctx.arc(x, y, s.r * (0.85 + tw * 0.25), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* Shooting stars */
      if (dt) {
        nextShooter -= dt;
        if (nextShooter <= 0) {
          spawnShooter();
          nextShooter = rand(5, 12);
        }
      }
      for (let i = shooters.length - 1; i >= 0; i--) {
        const sh = shooters[i];
        sh.life += dt;
        sh.x += sh.vx * dt;
        sh.y += sh.vy * dt;
        const p = sh.life / sh.max;
        if (p >= 1) {
          shooters.splice(i, 1);
          continue;
        }
        const fade = Math.sin(p * Math.PI); // in, then out
        const mag = Math.hypot(sh.vx, sh.vy);
        const tx = sh.x - (sh.vx / mag) * sh.len;
        const ty = sh.y - (sh.vy / mag) * sh.len;
        const g = ctx.createLinearGradient(sh.x, sh.y, tx, ty);
        g.addColorStop(0, `rgba(255,255,255,${0.95 * fade})`);
        g.addColorStop(0.3, `rgba(190,215,255,${0.45 * fade})`);
        g.addColorStop(1, "rgba(160,190,255,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(sh.x, sh.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }
    };

    const frame = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      time += dt;
      render(dt);
    };

    /* ---------- wiring ---------- */
    resize();

    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    window.visualViewport?.addEventListener("resize", resize);

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running && !reduceMotion) {
        running = true;
        last = 0;
        resize();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    if (reduceMotion) {
      render(0);
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
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
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
