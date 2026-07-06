"use client";

import { useEffect, useState } from "react";
import { SignIn } from "@clerk/nextjs";
import { motion, useReducedMotion } from "framer-motion";

const ZODIAC_SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

function getSunPosition(date: Date) {
  const start2000 = new Date("2000-01-01T12:00:00Z").getTime();
  const daysSince2000 = (date.getTime() - start2000) / 86400000;

  const meanLongitude = (280.46 + 0.9856474 * daysSince2000) % 360;
  const meanAnomaly = (357.528 + 0.9856003 * daysSince2000) % 360;
  const meanAnomalyRad = (meanAnomaly * Math.PI) / 180;

  const eclipticLongitude =
    (meanLongitude +
      1.915 * Math.sin(meanAnomalyRad) +
      0.02 * Math.sin(2 * meanAnomalyRad) +
      360) %
    360;

  const signIndex = Math.floor(eclipticLongitude / 30);
  const degreeInSign = eclipticLongitude % 30;

  return {
    sign: ZODIAC_SIGNS[signIndex],
    degree: Math.floor(degreeInSign),
    minute: Math.floor((degreeInSign % 1) * 60),
  };
}

function getMoonPhase(date: Date) {
  const synodicMonth = 29.530588853;
  const knownNewMoon = new Date("2000-01-06T18:14:00Z").getTime();
  const diffDays = (date.getTime() - knownNewMoon) / 86400000;
  const phase = ((diffDays % synodicMonth) + synodicMonth) % synodicMonth;
  const fraction = phase / synodicMonth;

  if (fraction < 0.03 || fraction > 0.97) return { label: "New moon", glyph: "○" };
  if (fraction < 0.22) return { label: "Waxing crescent", glyph: "◐" };
  if (fraction < 0.28) return { label: "First quarter", glyph: "◑" };
  if (fraction < 0.47) return { label: "Waxing gibbous", glyph: "◕" };
  if (fraction < 0.53) return { label: "Full moon", glyph: "●" };
  if (fraction < 0.72) return { label: "Waning gibbous", glyph: "◔" };
  if (fraction < 0.78) return { label: "Last quarter", glyph: "◒" };
  return { label: "Waning crescent", glyph: "◓" };
}

function BirthChartRing({
  size = 540,
  opacity = 0.16,
  className = "",
  shouldReduceMotion = false,
}: {
  size?: number;
  opacity?: number;
  className?: string;
  shouldReduceMotion?: boolean;
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
        <circle cx="270" cy="270" r="220" stroke="rgba(148,163,184,0.12)" strokeWidth="1.2" />
        <circle cx="270" cy="270" r="185" stroke="rgba(251,191,36,0.15)" strokeWidth="1" />

        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
          const x = 270 + Math.cos(angle) * 202;
          const y = 270 + Math.sin(angle) * 202;

          return (
            <g key={i} transform={`translate(${x}, ${y})`}>
              <circle
                r="3.2"
                fill={i % 3 === 0 ? "rgba(251,191,36,0.68)" : "rgba(226,232,240,0.38)"}
              />
            </g>
          );
        })}

        <motion.g
          style={{ transformOrigin: "270px 270px" }}
          animate={shouldReduceMotion ? undefined : { rotate: -360 }}
          transition={
            shouldReduceMotion
              ? undefined
              : { duration: 130, repeat: Infinity, ease: "linear" }
          }
        >
          <circle cx="270" cy="270" r="150" stroke="rgba(148,163,184,0.10)" strokeWidth="1" />
          <circle cx="270" cy="270" r="114" stroke="rgba(251,191,36,0.10)" strokeWidth="1" />

          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const x1 = 270 + Math.cos(angle) * 114;
            const y1 = 270 + Math.sin(angle) * 114;
            const x2 = 270 + Math.cos(angle) * 150;
            const y2 = 270 + Math.sin(angle) * 150;

            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(148,163,184,0.10)"
                strokeWidth="1"
              />
            );
          })}
        </motion.g>

        <circle cx="270" cy="270" r="10" fill="rgba(251,191,36,0.52)" />
        <circle cx="270" cy="270" r="24" stroke="rgba(251,191,36,0.12)" strokeWidth="1" />
      </svg>
    </div>
  );
}

export default function SignInPage() {
  const shouldReduceMotion = useReducedMotion();
  const [hasMounted, setHasMounted] = useState(false);
  const now = new Date();
  const sunPosition = getSunPosition(now);
  const moon = getMoonPhase(now);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const stars = Array.from({ length: 28 }).map((_, i) => {
    const left = `${((i * 37) % 100)}%`;
    const top = `${((i * 19 + 13) % 100)}%`;
    const size = i % 7 === 0 ? 2 : 1;
    const opacity = i % 5 === 0 ? 0.72 : 0.34;
    const delay = (i * 0.37) % 4;
    return { left, top, size, opacity, delay, id: i };
  });

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#040611] text-white">
      <motion.div
        className="pointer-events-none fixed inset-0 z-50 bg-black"
        initial={{ opacity: 1 }}
        animate={{ opacity: hasMounted ? 0 : 1 }}
        transition={{ duration: shouldReduceMotion ? 0.01 : 0.6, ease: "easeOut" }}
      />

      <div className="pointer-events-none fixed inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 18%, rgba(251,191,36,0.11), transparent 34%), radial-gradient(circle at 85% 82%, rgba(94,234,212,0.05), transparent 28%), linear-gradient(180deg, #1a1206 0%, #050816 44%, #040611 100%)",
          }}
        />

        <motion.div
          className="absolute left-1/2 top-[16%] h-[24rem] w-[24rem] -translate-x-1/2 rounded-full blur-3xl"
          animate={
            shouldReduceMotion
              ? undefined
              : { opacity: [0.14, 0.24, 0.14], scale: [1, 1.05, 1] }
          }
          transition={
            shouldReduceMotion
              ? undefined
              : { duration: 8, repeat: Infinity, ease: "easeInOut" }
          }
          style={{
            background: "radial-gradient(circle, rgba(251,191,36,0.24), transparent 70%)",
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
                      opacity: [star.opacity * 0.4, star.opacity * 1.6, star.opacity * 0.4],
                      scale: [1, 1.6, 1],
                    }
              }
              transition={
                shouldReduceMotion
                  ? undefined
                  : {
                      duration: 2.6 + (star.id % 5) * 0.6,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: star.delay,
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
              : { duration: 220, repeat: Infinity, ease: "linear" }
          }
        >
          <BirthChartRing className="blur-[0.2px]" shouldReduceMotion={!!shouldReduceMotion} />
        </motion.div>
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-5 pb-8 pt-4">
        <div className="w-full max-w-md -translate-y-4">
          <motion.div
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 18 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="mb-6 flex flex-col items-center text-center"
          >
            <motion.div
              className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-amber-300/25 bg-amber-300/[0.08] backdrop-blur-md"
              animate={
                shouldReduceMotion
                  ? undefined
                  : {
                      scale: [1, 1.08, 1],
                      boxShadow: [
                        "0 0 30px rgba(251,191,36,0.22)",
                        "0 0 42px rgba(251,191,36,0.34)",
                        "0 0 30px rgba(251,191,36,0.22)",
                      ],
                    }
              }
              transition={
                shouldReduceMotion
                  ? undefined
                  : { duration: 2.8, repeat: Infinity, ease: "easeInOut" }
              }
              style={
                shouldReduceMotion
                  ? { boxShadow: "0 0 30px rgba(251,191,36,0.22)" }
                  : undefined
              }
            >
              <div className="absolute inset-[6px] rounded-full border border-white/10" />
              <span className="relative text-xl text-amber-200">✦</span>
            </motion.div>

            <div className="mb-3 flex items-center gap-2 text-[11px] text-slate-400">
              <span className="text-amber-200/80">{moon.glyph}</span>
              <span>
                {moon.label} · Sun {sunPosition.degree}° {sunPosition.sign}
              </span>
            </div>

            <h1 className="text-[2rem] font-semibold leading-[1.02] tracking-tight text-white">
              Your chart is waiting.
            </h1>

            <p className="mt-3 text-[10px] uppercase tracking-[0.34em] text-slate-500">
              Direct Future Predictions
            </p>
          </motion.div>

          <motion.div
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 20 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
            className="relative"
          >
            <style jsx>{`
              @keyframes signUpBreathe {
                0%,
                100% {
                  box-shadow:
                    0 0 0 1px rgba(148, 163, 184, 0.16),
                    0 0 34px rgba(251, 191, 36, 0.14),
                    0 0 90px rgba(251, 191, 36, 0.08);
                }
                50% {
                  box-shadow:
                    0 0 0 1px rgba(253, 224, 71, 0.32),
                    0 0 46px rgba(251, 191, 36, 0.24),
                    0 0 110px rgba(251, 191, 36, 0.14);
                }
              }
              .sign-up-glow {
                animation: signUpBreathe 3.4s ease-in-out infinite;
              }

              .cl-box :global(label),
              .cl-box :global(.cl-formFieldLabel) {
                color: #cbd5e1 !important;
                opacity: 1 !important;
              }

              @keyframes cooldownPulse {
                0%,
                100% {
                  box-shadow:
                    0 0 0 1px rgba(99, 102, 241, 0.2),
                    0 0 20px rgba(99, 102, 241, 0.08);
                }
                50% {
                  box-shadow:
                    0 0 0 1px rgba(99, 102, 241, 0.4),
                    0 0 28px rgba(99, 102, 241, 0.16);
                }
              }

              /* Regular text/email/password fields keep the pulse */
              .cl-box :global(input) {
                color: #ffffff !important;
                background-color: rgba(255, 255, 255, 0.04) !important;
                border: 1px solid rgba(99, 102, 241, 0.2) !important;
                animation: cooldownPulse 3s ease-in-out infinite;
              }

              /* OTP code boxes: no pulsing animation. Autofill rewrites these
                 values in rapid succession, and an active box-shadow animation
                 on each box was causing a visible flicker/glitch as iOS/Android
                 distributed the pasted code across the six inputs. */
              .cl-box :global(.cl-otpCodeFieldInput) {
                animation: none !important;
                box-shadow:
                  0 0 0 1px rgba(99, 102, 241, 0.2),
                  0 0 20px rgba(99, 102, 241, 0.08) !important;
              }

              .cl-box :global(input:focus) {
                border-color: rgba(129, 140, 248, 0.5) !important;
              }

              .cl-box :global(input::placeholder) {
                color: rgba(148, 163, 184, 0.7) !important;
              }

              .cl-box :global(button[data-localization-key*="formButtonPrimary"]),
              .cl-box :global(.cl-formButtonPrimary) {
                background-color: #818cf8 !important;
                color: #1e1b4b !important;
                animation: cooldownPulse 3s ease-in-out infinite;
              }

              .cl-box :global(.cl-footer),
              .cl-box :global(.cl-footer *) {
                color: #94a3b8 !important;
                background: transparent !important;
              }

              .cl-box :global(.cl-footerActionLink) {
                color: #fbbf24 !important;
              }

              .cl-box :global(.cl-badge) {
                color: #64748b !important;
              }
            `}</style>

            <div className="sign-up-glow absolute inset-0 rounded-[30px]" />

            <div className="cl-box relative overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.03] backdrop-blur-2xl">
              <SignIn
                withSignUp={false}
                appearance={{
                  variables: {
                    colorPrimary: "#fbbf24",
                    colorBackground: "transparent",
                    colorText: "#f8fafc",
                    colorTextSecondary: "#cbd5e1",
                    colorInputBackground: "rgba(255,255,255,0.04)",
                    colorInputText: "#ffffff",
                    colorDanger: "#fb7185",
                    borderRadius: "24px",
                    fontFamily: "Inter, sans-serif",
                  },
                  elements: {
                    rootBox: "w-full",
                    card: "bg-transparent shadow-none border-0 rounded-none",
                    header: "hidden",
                    headerTitle: "hidden",
                    headerSubtitle: "hidden",
                    socialButtonsBlockButton:
                      "h-12 rounded-[20px] border border-white/10 bg-white/[0.03] text-white shadow-none hover:border-amber-300/30 hover:bg-white/[0.05]",
                    socialButtonsBlockButtonText: "text-sm font-medium text-white",
                    dividerLine: "bg-white/10",
                    dividerText: "text-slate-400 text-[11px] uppercase tracking-[0.18em]",
                    formFieldLabel: "!text-slate-300 text-[13px] font-medium",
                    formFieldInput:
                      "h-14 rounded-[20px] border border-indigo-400/20 !bg-white/[0.04] !text-white placeholder:text-slate-400 focus:border-indigo-300/50 focus:ring-0",
                    formButtonPrimary:
                      "h-14 rounded-[20px] border-0 !bg-indigo-400 text-[15px] font-semibold !text-indigo-950 shadow-[0_10px_30px_rgba(99,102,241,0.22)] hover:!bg-indigo-300",
                    footer: "pb-6 px-6 bg-transparent",
                    footerAction: "pt-2",
                    footerActionText: "!text-slate-400",
                    footerActionLink: "!text-amber-300 hover:!text-amber-200 font-medium",
                    identityPreviewText: "!text-slate-300",
                    identityPreviewEditButton: "!text-amber-300 hover:!text-amber-200",
                    formResendCodeLink: "!text-amber-300 hover:!text-amber-200",
                    otpCodeFieldInput:
                      "cl-otpCodeFieldInput h-12 w-10 rounded-[16px] border border-white/10 !bg-white/[0.04] !text-white",
                    alert:
                      "rounded-2xl border border-rose-400/20 bg-rose-500/10 text-rose-200",
                    formFieldWarningText: "text-rose-300",
                    formFieldSuccessText: "text-amber-200",
                    formContainer: "pt-6 px-6",
                  },
                }}
              />
            </div>
          </motion.div>
        </div>
      </div>
    </main>
  );
}