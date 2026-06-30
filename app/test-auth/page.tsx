"use client";

import { useState, useEffect, useMemo } from "react";
import { useSignIn, useSignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

/**
 * Unified auth flow — themed to match the app's cosmic aesthetic.
 *
 * Built against Clerk's documented `signUpIfMissing` custom flow:
 * https://clerk.com/docs/guides/development/custom-flows/authentication/sign-in-or-up
 *
 * Why this pattern specifically (over the "standard" sign-in-or-up flow):
 * the standard flow reveals whether an account exists BEFORE any
 * verification happens, which is a user-enumeration risk. signUpIfMissing
 * sends a verification code regardless of whether the account exists,
 * and only reveals new-vs-returning AFTER the code is verified.
 *
 * Real flow, per Clerk's docs:
 *  1. signIn.create({ identifier: email, signUpIfMissing: true })
 *  2. signIn.emailCode.sendCode()  — code sent either way
 *  3. User enters code → signIn.emailCode.verifyCode({ code })
 *     - success + signIn.status === 'complete' → existing user, done
 *     - error.code === 'sign_up_if_missing_transfer' → new user,
 *       transfer to sign-up via signUp.create({ transfer: true })
 *
 * OTP input notes:
 *  - One real <input> (autoComplete="one-time-code") is the only source
 *    of truth for the code value. Six visual segments are rendered on
 *    top, reading from that single value — this is what avoids the
 *    flicker/glitch that six independently-rendered boxes had under
 *    Clerk's prebuilt OTP component when autofill wrote rapidly across
 *    them.
 *  - autoComplete="one-time-code" is what makes iOS/Android offer the
 *    code as a one-tap keyboard suggestion when it arrives by email.
 *
 * Still not handled in this build (flag during testing if hit):
 *  - signUp.status === 'missing_requirements' (extra required fields
 *    beyond email) — surfaces as a visible error for now rather than a
 *    real form, since we don't yet know which fields your Dashboard
 *    requires.
 *  - signIn 'needs_second_factor' / 'needs_client_trust' states.
 *  - Passkey conditional UI on the email field — next step after this.
 */

type Step = "email" | "verify";

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
    <div className={className} style={{ width: size, height: size, opacity }}>
      <svg viewBox="0 0 540 540" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="270" cy="270" r="220" stroke="rgba(148,163,184,0.12)" strokeWidth="1.2" />
        <circle cx="270" cy="270" r="185" stroke="rgba(251,191,36,0.15)" strokeWidth="1" />

        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
          const x = 270 + Math.cos(angle) * 202;
          const y = 270 + Math.sin(angle) * 202;
          return (
            <g key={i} transform={`translate(${x}, ${y})`}>
              <circle r="3.2" fill={i % 3 === 0 ? "rgba(251,191,36,0.68)" : "rgba(226,232,240,0.38)"} />
            </g>
          );
        })}

        <motion.g
          style={{ transformOrigin: "270px 270px" }}
          animate={shouldReduceMotion ? undefined : { rotate: -360 }}
          transition={shouldReduceMotion ? undefined : { duration: 130, repeat: Infinity, ease: "linear" }}
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
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(148,163,184,0.10)" strokeWidth="1" />
            );
          })}
        </motion.g>

        <circle cx="270" cy="270" r="10" fill="rgba(251,191,36,0.52)" />
        <circle cx="270" cy="270" r="24" stroke="rgba(251,191,36,0.12)" strokeWidth="1" />
      </svg>
    </div>
  );
}

function AuthShell({
  children,
  shouldReduceMotion,
}: {
  children: React.ReactNode;
  shouldReduceMotion: boolean | null;
}) {
  const [hasMounted, setHasMounted] = useState(false);
  const now = new Date();
  const sunPosition = getSunPosition(now);
  const moon = getMoonPhase(now);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const stars = useMemo(
    () =>
      Array.from({ length: 28 }).map((_, i) => {
        const left = `${(i * 37) % 100}%`;
        const top = `${(i * 19 + 13) % 100}%`;
        const size = i % 7 === 0 ? 2 : 1;
        const opacity = i % 5 === 0 ? 0.72 : 0.34;
        const delay = (i * 0.37) % 4;
        return { left, top, size, opacity, delay, id: i };
      }),
    []
  );

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
          </motion.div>

          <motion.div
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 20 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
            className="relative"
          >
            <style jsx>{`
              @keyframes authBreathe {
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
              .auth-glow {
                animation: authBreathe 3.4s ease-in-out infinite;
              }
            `}</style>

            <div className="auth-glow absolute inset-0 rounded-[30px]" />

            <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-2xl">
              {children}
            </div>
          </motion.div>
        </div>
      </div>
    </main>
  );
}

export default function UnifiedAuthScreen() {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Step 1: email submitted, kick off signUpIfMissing flow ────────
  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter your email to continue.");
      return;
    }

    if (!signIn) {
      setError("Still loading — try again in a moment.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error: createError } = await signIn.create({
        identifier: trimmedEmail,
        signUpIfMissing: true,
      });

      if (createError) {
        setError(
          createError.errors?.[0]?.message ?? "Couldn't start sign-in. Try again."
        );
        setIsSubmitting(false);
        return;
      }

      const { error: sendError } = await signIn.emailCode.sendCode();

      if (sendError) {
        setError(
          sendError.errors?.[0]?.message ?? "Couldn't send your code. Try again."
        );
        setIsSubmitting(false);
        return;
      }

      setStep("verify");
      setIsSubmitting(false);
    } catch (err) {
      console.error("[unified-auth] Error starting sign-in:", err);
      setError("Something went wrong. Try again.");
      setIsSubmitting(false);
    }
  }

  // ── Step 2: code submitted, verify and branch ──────────────────────
  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!signIn || !signUp) {
      setError("Still loading — try again in a moment.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error: verifyError } = await signIn.emailCode.verifyCode({ code });

      if (verifyError) {
        const isNewUser = verifyError.errors?.some(
          (err) => err.code === "sign_up_if_missing_transfer"
        );

        if (isNewUser) {
          // ── This email has no account — transfer to sign-up ──────
          const { error: transferError } = await signUp.create({ transfer: true });

          if (transferError) {
            setError(
              transferError.errors?.[0]?.message ?? "Couldn't create your account."
            );
            setIsSubmitting(false);
            return;
          }

          if (signUp.status === "complete") {
            await signUp.finalize({
              navigate: async ({ session, decorateUrl }) => {
                if (session?.currentTask) {
                  console.log("[unified-auth] session task:", session.currentTask);
                  return;
                }
                const url = decorateUrl("/");
                if (url.startsWith("http")) {
                  window.location.href = url;
                } else {
                  router.push(url);
                }
              },
            });
            return;
          }

          if (signUp.status === "missing_requirements") {
            // Account needs more info (legal acceptance, name, etc.)
            // before it can finalize. Not handled in this bare-logic
            // pass — surfacing as an error for now so we notice it
            // during testing rather than silently failing.
            setError(
              `Account needs more info to finish (missing: ${signUp.missingFields?.join(", ") ?? "unknown"}). Not yet handled in this build.`
            );
            setIsSubmitting(false);
            return;
          }

          setError(`Unexpected sign-up status: ${signUp.status}`);
          setIsSubmitting(false);
          return;
        }

        // Some other real verification error (wrong code, expired, etc.)
        setError(verifyError.errors?.[0]?.message ?? "That code didn't work. Try again.");
        setIsSubmitting(false);
        return;
      }

      // ── No error — this is an existing, verified user ─────────────
      if (signIn.status === "complete") {
        await signIn.finalize({
          navigate: async ({ session, decorateUrl }) => {
            if (session?.currentTask) {
              console.log("[unified-auth] session task:", session.currentTask);
              return;
            }
            const url = decorateUrl("/");
            if (url.startsWith("http")) {
              window.location.href = url;
            } else {
              router.push(url);
            }
          },
        });
        return;
      }

      // Not complete and not the transfer error — likely MFA or
      // client-trust. Not handled in this bare-logic pass.
      setError(`Sign-in not complete: ${signIn.status}. Not yet handled in this build.`);
      setIsSubmitting(false);
    } catch (err) {
      console.error("[unified-auth] Error verifying code:", err);
      setError("Something went wrong. Try again.");
      setIsSubmitting(false);
    }
  }

  if (step === "verify") {
    const digits = code.padEnd(6, " ").split("");

    return (
      <AuthShell shouldReduceMotion={shouldReduceMotion}>
        <motion.form
          onSubmit={handleVerify}
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 8 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="space-y-5"
        >
          <div className="text-center">
            <h1 className="text-lg font-semibold text-white">Enter your code</h1>
            <p className="mt-1 text-sm text-slate-400">
              Sent to <span className="text-slate-200">{email}</span>
            </p>
          </div>

          {/* Single real input — invisible, sized to overlay the segments below.
              This is the only source of truth for the value, so autofill or
              the OS suggestion writes to one place, not six independently
              re-rendering boxes. That's what removes the flicker entirely. */}
          <div className="relative mx-auto h-14 w-full max-w-[280px]">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => {
                const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(digitsOnly);
              }}
              className="absolute inset-0 z-10 w-full text-center text-transparent caret-transparent opacity-0"
              autoFocus
            />

            <div className="pointer-events-none absolute inset-0 flex items-center justify-between">
              {digits.map((digit, i) => {
                const filled = digit !== " ";
                const isActive = code.length === i;
                return (
                  <div
                    key={i}
                    className={`flex h-14 w-10 items-center justify-center rounded-[14px] border text-lg font-semibold transition-colors duration-150 ${
                      filled
                        ? "border-amber-300/50 bg-amber-300/[0.06] text-white"
                        : isActive
                          ? "border-amber-300/40 bg-white/[0.04] text-white"
                          : "border-white/10 bg-white/[0.03] text-white"
                    }`}
                  >
                    {filled ? digit : ""}
                  </div>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="text-center text-sm text-rose-300">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || code.length !== 6}
            className="h-14 w-full rounded-[20px] bg-amber-300 text-[15px] font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? "Verifying…" : "Verify"}
          </button>

          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
              signIn?.reset();
            }}
            className="w-full text-center text-sm text-slate-400 transition hover:text-amber-300"
          >
            Start over
          </button>
        </motion.form>
      </AuthShell>
    );
  }

  return (
    <AuthShell shouldReduceMotion={shouldReduceMotion}>
      <motion.form
        onSubmit={handleEmailSubmit}
        initial={shouldReduceMotion ? undefined : { opacity: 0, y: 8 }}
        animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="space-y-4"
      >
        <div className="mb-2 text-center">
          <h1 className="text-[2rem] font-semibold leading-[1.02] tracking-tight text-white">
            Your chart is waiting.
          </h1>
          <p className="mt-3 text-[10px] uppercase tracking-[0.34em] text-slate-500">
            Direct Future Predictions
          </p>
        </div>

        <div>
          <label htmlFor="email" className="mb-2 block text-sm text-slate-300">
            Email
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-14 w-full rounded-[20px] border border-white/10 bg-white/[0.04] px-4 text-white placeholder:text-slate-500 focus:border-amber-300/50 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-rose-300">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="h-14 w-full rounded-[20px] bg-amber-300 text-[15px] font-semibold text-slate-950 transition hover:bg-amber-200 disabled:opacity-60"
        >
          {isSubmitting ? "Sending…" : "Continue"}
        </button>

        {/* Required for sign-up flows — Clerk's bot protection mounts here */}
        <div id="clerk-captcha" />
      </motion.form>
    </AuthShell>
  );
}