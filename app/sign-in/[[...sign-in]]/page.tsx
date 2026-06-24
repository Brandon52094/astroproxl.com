"use client";

import { SignIn } from "@clerk/nextjs";
import { motion, useReducedMotion } from "framer-motion";

function BirthChartRing({
  size = 540,
  opacity = 0.18,
  className = "",
}: {
  size?: number;
  opacity?: number;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        opacity,
      }}
    >
      <svg
        viewBox="0 0 540 540"
        className="h-full w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="270" cy="270" r="220" stroke="rgba(148,163,184,0.14)" strokeWidth="1.2" />
        <circle cx="270" cy="270" r="185" stroke="rgba(94,234,212,0.16)" strokeWidth="1" />
        <circle cx="270" cy="270" r="150" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
        <circle cx="270" cy="270" r="114" stroke="rgba(251,191,36,0.12)" strokeWidth="1" />

        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i / 12) * Math.PI * 2;
          const x1 = 270 + Math.cos(angle) * 114;
          const y1 = 270 + Math.sin(angle) * 114;
          const x2 = 270 + Math.cos(angle) * 220;
          const y2 = 270 + Math.sin(angle) * 220;

          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(148,163,184,0.12)"
              strokeWidth="1"
            />
          );
        })}

        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
          const x = 270 + Math.cos(angle) * 202;
          const y = 270 + Math.sin(angle) * 202;

          return (
            <g key={i} transform={`translate(${x}, ${y})`}>
              <circle r="3.2" fill={i % 3 === 0 ? "rgba(94,234,212,0.75)" : "rgba(226,232,240,0.45)"} />
            </g>
          );
        })}

        <path
          d="M270 120 C308 168, 348 192, 392 204 C338 222, 306 258, 292 314 C278 258, 244 222, 190 204 C234 190, 270 164, 270 120Z"
          stroke="rgba(94,234,212,0.22)"
          strokeWidth="1"
        />
        <path
          d="M162 324 C202 292, 236 286, 270 300 C238 320, 222 350, 216 392 C206 354, 184 334, 162 324Z"
          stroke="rgba(251,191,36,0.18)"
          strokeWidth="1"
        />
        <path
          d="M322 308 C350 286, 380 278, 414 286 C388 308, 374 334, 370 372 C358 340, 344 320, 322 308Z"
          stroke="rgba(148,163,184,0.18)"
          strokeWidth="1"
        />

        <circle cx="270" cy="270" r="10" fill="rgba(94,234,212,0.65)" />
        <circle cx="270" cy="270" r="24" stroke="rgba(94,234,212,0.14)" strokeWidth="1" />
      </svg>
    </div>
  );
}

export default function SignInPage() {
  const shouldReduceMotion = useReducedMotion();

  const stars = Array.from({ length: 28 }).map((_, i) => {
    const left = `${((i * 37) % 100)}%`;
    const top = `${((i * 19 + 13) % 100)}%`;
    const size = i % 7 === 0 ? 2 : 1;
    const opacity = i % 5 === 0 ? 0.75 : 0.38;

    return { left, top, size, opacity, id: i };
  });

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 18%, rgba(94,234,212,0.10), transparent 34%), radial-gradient(circle at 85% 82%, rgba(251,191,36,0.08), transparent 28%), linear-gradient(180deg, #061120 0%, #050816 44%, #040611 100%)",
          }}
        />

        <motion.div
          className="absolute left-1/2 top-[14%] h-[26rem] w-[26rem] -translate-x-1/2 rounded-full blur-3xl"
          animate={
            shouldReduceMotion
              ? undefined
              : {
                  opacity: [0.16, 0.28, 0.16],
                  scale: [1, 1.06, 1],
                }
          }
          transition={
            shouldReduceMotion
              ? undefined
              : {
                  duration: 8,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
          }
          style={{
            background: "radial-gradient(circle, rgba(45,212,191,0.32), transparent 70%)",
          }}
        />

        <motion.div
          className="absolute bottom-[-6rem] right-[-3rem] h-[20rem] w-[20rem] rounded-full blur-3xl"
          animate={
            shouldReduceMotion
              ? undefined
              : {
                  opacity: [0.1, 0.18, 0.1],
                  scale: [1, 1.08, 1],
                }
          }
          transition={
            shouldReduceMotion
              ? undefined
              : {
                  duration: 10,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
          }
          style={{
            background: "radial-gradient(circle, rgba(251,191,36,0.22), transparent 72%)",
          }}
        />

        <div className="absolute inset-0">
          {stars.map((star) => (
            <motion.span
              key={star.id}
              className="absolute rounded-full bg-white"
              style={{
                left: star.left,
                top: star.top,
                width: star.size,
                height: star.size,
                opacity: star.opacity,
              }}
              animate={
                shouldReduceMotion
                  ? undefined
                  : {
                      opacity: [star.opacity * 0.55, star.opacity, star.opacity * 0.55],
                    }
              }
              transition={
                shouldReduceMotion
                  ? undefined
                  : {
                      duration: 3 + (star.id % 5),
                      repeat: Infinity,
                      ease: "easeInOut",
                    }
              }
            />
          ))}
        </div>

        <motion.div
          className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2"
          animate={
            shouldReduceMotion
              ? undefined
              : {
                  rotate: 360,
                }
          }
          transition={
            shouldReduceMotion
              ? undefined
              : {
                  duration: 90,
                  repeat: Infinity,
                  ease: "linear",
                }
          }
        >
          <BirthChartRing className="blur-[0.2px]" />
        </motion.div>
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10">
        <motion.div
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 18 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="mb-7 flex flex-col items-center text-center"
        >
          <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-teal-300/25 bg-teal-300/[0.08] shadow-[0_0_30px_rgba(45,212,191,0.22)] backdrop-blur-md">
            <div className="absolute inset-[6px] rounded-full border border-white/10" />
            <span className="relative text-xl text-teal-200">✦</span>
          </div>

          <p className="mb-3 text-[10px] uppercase tracking-[0.34em] text-slate-500">
            Direct Future Predictions
          </p>

          <h1 className="max-w-[12ch] text-[2rem] font-semibold leading-[1.02] tracking-tight text-white">
            Enter your portal
          </h1>

          <p className="mt-3 max-w-[28ch] text-sm leading-6 text-slate-400">
            Sign in to continue your readings, timelines, and chart-based guidance.
          </p>
        </motion.div>

        <motion.div
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 20 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
          className="relative"
        >
          <div className="absolute inset-0 rounded-[30px] bg-[radial-gradient(circle_at_top,rgba(94,234,212,0.09),transparent_42%)]" />

          <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.04] p-[1px] shadow-[0_18px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
            <div className="rounded-[29px] bg-[#07111c]/90">
              <SignIn
                appearance={{
                  variables: {
                    colorPrimary: "#5eead4",
                    colorBackground: "transparent",
                    colorText: "#e2e8f0",
                    colorTextSecondary: "#94a3b8",
                    colorInputBackground: "rgba(255,255,255,0.04)",
                    colorInputText: "#ffffff",
                    colorDanger: "#fb7185",
                    borderRadius: "18px",
                    fontFamily: "Inter, sans-serif",
                  },
                  elements: {
                    rootBox: "w-full",
                    card: "bg-transparent shadow-none border-0 rounded-none",
                    header: "pt-6 px-6",
                    headerTitle: "text-white text-[1.55rem] font-semibold tracking-tight",
                    headerSubtitle: "text-slate-400 text-sm",
                    socialButtonsBlockButton:
                      "h-12 rounded-2xl border border-white/10 bg-white/[0.03] text-white shadow-none hover:bg-white/[0.05]",
                    socialButtonsBlockButtonText: "text-sm font-medium text-white",
                    dividerLine: "bg-white/8",
                    dividerText: "text-slate-500 text-[11px] uppercase tracking-[0.18em]",
                    formFieldLabel: "text-slate-300 text-[13px] font-medium",
                    formFieldInput:
                      "h-12 rounded-2xl border border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500 focus:border-teal-300/50 focus:ring-0",
                    formButtonPrimary:
                      "h-12 rounded-2xl border-0 bg-teal-300 text-[14px] font-semibold text-slate-950 shadow-[0_10px_30px_rgba(45,212,191,0.18)] hover:bg-teal-200",
                    footer: "pb-6 px-6",
                    footerActionText: "text-slate-500",
                    footerActionLink: "text-teal-300 hover:text-teal-200",
                    identityPreviewText: "text-slate-300",
                    identityPreviewEditButton: "text-teal-300 hover:text-teal-200",
                    formResendCodeLink: "text-teal-300 hover:text-teal-200",
                    otpCodeFieldInput:
                      "h-12 w-10 rounded-2xl border border-white/10 bg-white/[0.04] text-white",
                    alert:
                      "rounded-2xl border border-rose-400/20 bg-rose-500/10 text-rose-200",
                    formFieldWarningText: "text-rose-300",
                  },
                }}
              />
            </div>
          </div>
        </motion.div>

        <motion.p
          initial={shouldReduceMotion ? undefined : { opacity: 0 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.18 }}
          className="mt-5 text-center text-[11px] leading-5 text-slate-500"
        >
          Secure access to your readings, chart data, and future timelines.
        </motion.p>
      </div>
    </main>
  );
}