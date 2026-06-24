"use client";

import { SignIn } from "@clerk/nextjs";
import { motion, useReducedMotion } from "framer-motion";

const zodiacSigns = [
  "♈︎",
  "♉︎",
  "♊︎",
  "♋︎",
  "♌︎",
  "♍︎",
  "♎︎",
  "♏︎",
  "♐︎",
  "♑︎",
  "♒︎",
  "♓︎",
];

function ZodiacWheel({
  size = 560,
  opacity = 0.16,
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
        viewBox="0 0 560 560"
        className="h-full w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="280" cy="280" r="228" stroke="rgba(148,163,184,0.11)" strokeWidth="1.2" />
        <circle cx="280" cy="280" r="192" stroke="rgba(94,234,212,0.14)" strokeWidth="1" />
        <circle cx="280" cy="280" r="156" stroke="rgba(148,163,184,0.10)" strokeWidth="1" />
        <circle cx="280" cy="280" r="118" stroke="rgba(94,234,212,0.10)" strokeWidth="1" />

        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
          const x1 = 280 + Math.cos(angle) * 118;
          const y1 = 280 + Math.sin(angle) * 118;
          const x2 = 280 + Math.cos(angle) * 228;
          const y2 = 280 + Math.sin(angle) * 228;

          return (
            <line
              key={`line-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={i % 3 === 0 ? "rgba(94,234,212,0.14)" : "rgba(148,163,184,0.08)"}
              strokeWidth="1"
            />
          );
        })}

        {zodiacSigns.map((sign, i) => {
          const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
          const x = 280 + Math.cos(angle) * 208;
          const y = 280 + Math.sin(angle) * 208;

          return (
            <g key={sign}>
              <circle
                cx={x}
                cy={y}
                r="15"
                fill={i % 3 === 0 ? "rgba(94,234,212,0.05)" : "rgba(255,255,255,0.025)"}
                stroke={i % 3 === 0 ? "rgba(94,234,212,0.12)" : "rgba(255,255,255,0.06)"}
              />
              <text
                x={x}
                y={y + 5}
                textAnchor="middle"
                fontSize="18"
                fill={i % 3 === 0 ? "rgba(153,246,228,0.72)" : "rgba(226,232,240,0.5)"}
                style={{
                  fontFamily: '"Times New Roman", "Noto Sans Symbols 2", serif',
                  letterSpacing: "0.02em",
                }}
              >
                {sign}
              </text>
            </g>
          );
        })}

        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
          const x = 280 + Math.cos(angle) * 174;
          const y = 280 + Math.sin(angle) * 174;

          return (
            <circle
              key={`dot-${i}`}
              cx={x}
              cy={y}
              r={i % 3 === 0 ? 2.4 : 1.6}
              fill={i % 3 === 0 ? "rgba(94,234,212,0.6)" : "rgba(226,232,240,0.26)"}
            />
          );
        })}

        <circle cx="280" cy="280" r="10" fill="rgba(94,234,212,0.46)" />
        <circle cx="280" cy="280" r="24" stroke="rgba(94,234,212,0.10)" strokeWidth="1" />
        <circle cx="280" cy="280" r="42" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
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
    const opacity = i % 5 === 0 ? 0.7 : 0.3;
    return { left, top, size, opacity, id: i };
  });

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 18%, rgba(94,234,212,0.10), transparent 34%), radial-gradient(circle at 84% 80%, rgba(251,191,36,0.05), transparent 24%), linear-gradient(180deg, #061120 0%, #050816 44%, #040611 100%)",
          }}
        />

        <motion.div
          className="absolute left-1/2 top-[18%] h-[22rem] w-[22rem] -translate-x-1/2 rounded-full blur-3xl"
          animate={
            shouldReduceMotion
              ? undefined
              : { opacity: [0.12, 0.2, 0.12], scale: [1, 1.04, 1] }
          }
          transition={
            shouldReduceMotion
              ? undefined
              : { duration: 8, repeat: Infinity, ease: "easeInOut" }
          }
          style={{
            background: "radial-gradient(circle, rgba(45,212,191,0.26), transparent 70%)",
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
                  : { opacity: [star.opacity * 0.55, star.opacity, star.opacity * 0.55] }
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
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          animate={shouldReduceMotion ? undefined : { rotate: 360 }}
          transition={
            shouldReduceMotion
              ? undefined
              : { duration: 120, repeat: Infinity, ease: "linear" }
          }
        >
          <ZodiacWheel className="blur-[0.15px]" />
        </motion.div>
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-5 py-8">
        <div className="w-full max-w-sm">
          <motion.div
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 18 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="mb-6 flex flex-col items-center text-center"
          >
            <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
              Direct Future Predictions
            </p>
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-white">
              Enter your portal
            </h1>
            <p className="mt-2 max-w-[28ch] text-sm leading-6 text-slate-400">
              Sign in to continue your readings, timelines, and chart-based guidance.
            </p>
          </motion.div>

          <motion.div
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 20 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
            className="relative"
          >
            {/* Clean glass card with subtle glow - matches reference style */}
            <div
              className="absolute inset-0 rounded-[24px]"
              style={{
                boxShadow:
                  "0 0 0 1px rgba(148,163,184,0.15), 0 0 40px rgba(45,212,191,0.08), 0 0 80px rgba(45,212,191,0.04)",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(94,234,212,0.08) 46%, rgba(94,234,212,0.02) 100%)",
              }}
            />

            <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.02] backdrop-blur-2xl">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-200/20 to-transparent" />

              <SignIn
                appearance={{
                  variables: {
                    colorPrimary: "#5eead4",
                    colorBackground: "transparent",
                    colorText: "#f8fafc",
                    colorTextSecondary: "#cbd5e1",
                    colorInputBackground: "rgba(255,255,255,0.04)",
                    colorInputText: "#ffffff",
                    colorDanger: "#fb7185",
                    borderRadius: "18px",
                    fontFamily: "Inter, sans-serif",
                  },
                  elements: {
                    rootBox: "w-full",
                    card: "bg-transparent shadow-none border-0 rounded-none",
                    header: "hidden",
                    headerTitle: "hidden",
                    headerSubtitle: "hidden",
                    main: "gap-4",
                    socialButtonsBlockButton:
                      "h-12 rounded-2xl border border-white/10 bg-white/[0.02] text-white shadow-none transition hover:bg-white/[0.06]",
                    socialButtonsBlockButtonText: "text-sm font-medium text-white",
                    dividerRow: "px-6",
                    dividerLine: "bg-white/10",
                    dividerText: "text-slate-500 text-[11px] uppercase tracking-[0.18em]",
                    formContainer: "px-6 pt-6 pb-2",
                    formFieldRow: "gap-2",
                    formFieldLabel: "text-[12px] font-medium text-slate-300",
                    formFieldInput:
                      "h-12 rounded-2xl border border-white/10 bg-black/20 text-white placeholder:text-slate-500 focus:border-teal-300/50 focus:ring-1 focus:ring-teal-300/20",
                    formButtonPrimary:
                      "h-12 rounded-2xl border-0 bg-teal-300 text-[15px] font-medium text-slate-950 shadow-[0_10px_30px_rgba(45,212,191,0.22)] transition hover:bg-teal-200 active:scale-[0.99]",
                    footer: "px-6 pb-6 pt-3",
                    footerAction: "pt-1",
                    footerActionText: "text-slate-300",
                    footerActionLink: "font-medium text-teal-300 transition hover:text-teal-200",
                    identityPreviewText: "text-slate-200",
                    identityPreviewEditButton: "text-teal-300 hover:text-teal-200",
                    formResendCodeLink: "text-teal-300 hover:text-teal-200",
                    otpCodeFieldInput:
                      "h-12 w-10 rounded-2xl border border-white/10 bg-black/20 text-white",
                    alert:
                      "rounded-[18px] border border-rose-300/30 bg-rose-500/10 text-rose-100",
                    formFieldWarningText: "text-rose-300",
                    formFieldSuccessText: "text-teal-200",
                    formNotice: "text-slate-400",
                    formNoticeText: "text-slate-400",
                  },
                }}
              />
            </div>
          </motion.div>

          <motion.p
            initial={shouldReduceMotion ? undefined : { opacity: 0 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.18 }}
            className="mt-6 text-center text-[11px] leading-5 text-slate-500"
          >
            Secure access to your readings, chart data, and future timelines.
          </motion.p>
        </div>
      </div>
    </main>
  );
}