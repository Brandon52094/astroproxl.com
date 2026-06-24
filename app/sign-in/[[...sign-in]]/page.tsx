"use client";

import { SignIn } from "@clerk/nextjs";
import { motion, useReducedMotion } from "framer-motion";

const ZODIAC_SIGNS = [
  { name: "Capricorn", start: [12, 22], end: [1, 19] },
  { name: "Aquarius", start: [1, 20], end: [2, 18] },
  { name: "Pisces", start: [2, 19], end: [3, 20] },
  { name: "Aries", start: [3, 21], end: [4, 19] },
  { name: "Taurus", start: [4, 20], end: [5, 20] },
  { name: "Gemini", start: [5, 21], end: [6, 20] },
  { name: "Cancer", start: [6, 21], end: [7, 22] },
  { name: "Leo", start: [7, 23], end: [8, 22] },
  { name: "Virgo", start: [8, 23], end: [9, 22] },
  { name: "Libra", start: [9, 23], end: [10, 22] },
  { name: "Scorpio", start: [10, 23], end: [11, 21] },
  { name: "Sagittarius", start: [11, 22], end: [12, 21] },
];

function getSunSign(date: Date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  for (const sign of ZODIAC_SIGNS) {
    const [startMonth, startDay] = sign.start;
    const [endMonth, endDay] = sign.end;
    if (startMonth === endMonth) {
      if (month === startMonth && day >= startDay && day <= endDay) return sign.name;
    } else if (
      (month === startMonth && day >= startDay) ||
      (month === endMonth && day <= endDay)
    ) {
      return sign.name;
    }
  }
  return "Capricorn";
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
        <circle cx="270" cy="270" r="185" stroke="rgba(94,234,212,0.15)" strokeWidth="1" />

        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
          const x = 270 + Math.cos(angle) * 202;
          const y = 270 + Math.sin(angle) * 202;

          return (
            <g key={i} transform={`translate(${x}, ${y})`}>
              <circle
                r="3.2"
                fill={i % 3 === 0 ? "rgba(94,234,212,0.68)" : "rgba(226,232,240,0.38)"}
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

        <circle cx="270" cy="270" r="10" fill="rgba(94,234,212,0.52)" />
        <circle cx="270" cy="270" r="24" stroke="rgba(94,234,212,0.12)" strokeWidth="1" />
      </svg>
    </div>
  );
}

export default function SignInPage() {
  const shouldReduceMotion = useReducedMotion();
  const now = new Date();
  const sunSign = getSunSign(now);
  const moon = getMoonPhase(now);

  const stars = Array.from({ length: 28 }).map((_, i) => {
    const left = `${((i * 37) % 100)}%`;
    const top = `${((i * 19 + 13) % 100)}%`;
    const size = i % 7 === 0 ? 2 : 1;
    const opacity = i % 5 === 0 ? 0.72 : 0.34;
    return { left, top, size, opacity, id: i };
  });

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 18%, rgba(94,234,212,0.10), transparent 34%), radial-gradient(circle at 85% 82%, rgba(251,191,36,0.07), transparent 28%), linear-gradient(180deg, #061120 0%, #050816 44%, #040611 100%)",
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
            background: "radial-gradient(circle, rgba(45,212,191,0.28), transparent 70%)",
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
              : { duration: 220, repeat: Infinity, ease: "linear" }
          }
        >
          <BirthChartRing className="blur-[0.2px]" shouldReduceMotion={!!shouldReduceMotion} />
        </motion.div>
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-5 py-8">
        <div className="w-full max-w-md">
          <motion.div
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 18 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="mb-6 flex flex-col items-center text-center"
          >
            <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-teal-300/25 bg-teal-300/[0.08] shadow-[0_0_30px_rgba(45,212,191,0.22)] backdrop-blur-md">
              <div className="absolute inset-[6px] rounded-full border border-white/10" />
              <span className="relative text-xl text-teal-200">✦</span>
            </div>

            <div className="mb-3 flex items-center gap-2 text-[11px] text-slate-400">
              <span className="text-teal-200/80">{moon.glyph}</span>
              <span>
                {moon.label} · Sun in {sunSign}
              </span>
            </div>

            <p className="mb-3 text-[10px] uppercase tracking-[0.34em] text-slate-500">
              Direct Future Predictions
            </p>

            <h1 className="text-[2rem] font-semibold leading-[1.02] tracking-tight text-white">
              Personal. Accurate. Unbiased.
            </h1>
          </motion.div>

          <motion.div
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 20 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
            className="relative"
          >
            <div
              className="absolute inset-0 rounded-[30px]"
              style={{
                boxShadow:
                  "0 0 0 1px rgba(148,163,184,0.16), 0 0 34px rgba(45,212,191,0.14), 0 0 90px rgba(45,212,191,0.08)",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(94,234,212,0.16) 46%, rgba(94,234,212,0.06) 100%)",
              }}
            />

            <div className="relative overflow-hidden rounded-[30px] bg-[#07111c]/92 backdrop-blur-2xl">
              <SignIn
                appearance={{
                  variables: {
                    colorPrimary: "#5eead4",
                    colorBackground: "transparent",
                    colorText: "#f8fafc",
                    colorTextSecondary: "#cbd5e1",
                    colorInputBackground: "rgba(255,255,255,0.06)",
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
                    socialButtonsBlockButton:
                      "h-12 rounded-2xl border border-white/10 bg-white/[0.03] text-white shadow-none hover:bg-white/[0.05]",
                    socialButtonsBlockButtonText: "text-sm font-medium text-white",
                    dividerLine: "bg-white/10",
                    dividerText: "text-slate-500 text-[11px] uppercase tracking-[0.18em]",
                    formFieldLabel: "text-slate-200 text-[13px] font-medium",
                    formFieldInput:
                      "h-14 rounded-[22px] border border-white/10 bg-white/[0.06] text-white placeholder:text-slate-500 focus:border-teal-300/60 focus:bg-white/[0.08] focus:ring-0",
                    formButtonPrimary:
                      "h-14 rounded-[22px] border-0 bg-teal-300 text-[15px] font-semibold text-slate-950 shadow-[0_10px_30px_rgba(45,212,191,0.22)] hover:bg-teal-200",
                    footer: "pb-6 px-6",
                    footerAction: "pt-2",
                    footerActionText: "text-slate-300",
                    footerActionLink: "text-teal-300 hover:text-teal-200 font-medium",
                    identityPreviewText: "text-slate-200",
                    identityPreviewEditButton: "text-teal-300 hover:text-teal-200",
                    formResendCodeLink: "text-teal-300 hover:text-teal-200",
                    otpCodeFieldInput:
                      "h-12 w-10 rounded-2xl border border-white/10 bg-white/[0.06] text-white",
                    alert:
                      "rounded-2xl border border-rose-400/20 bg-rose-500/10 text-rose-200",
                    formFieldWarningText: "text-rose-300",
                    formFieldSuccessText: "text-teal-200",
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