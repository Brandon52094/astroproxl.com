"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";

import type { ChartCalculateResponse } from "@/app/api/chart-calculate/route";
import { loadChart, saveChart } from "@/lib/chartStore";

type Step = "birthday" | "time" | "location" | "terms";

type ResolvedPlace = {
  label: string;
  lat: number;
  lon: number;
  timezone: string;
};

declare global {
  interface Window {
    ttq?: {
      track: (event: string, params?: Record<string, unknown>) => void;
    };
  }
}

const STEPS: Step[] = ["birthday", "time", "location", "terms"];

function normalizeBirthDate(raw: string): string {
  const s = raw.trim();
  const digits = s.replace(/[-/.\s]/g, "");

  if (/^\d{8}$/.test(digits)) {
    const firstFour = Number(digits.slice(0, 4));

    if (firstFour >= 1900 && firstFour <= 2099) {
      return `${digits.slice(4, 6)}/${digits.slice(6, 8)}/${digits.slice(0, 4)}`;
    }

    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
  }

  const mdy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (mdy) {
    return `${mdy[1].padStart(2, "0")}/${mdy[2].padStart(2, "0")}/${mdy[3]}`;
  }

  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    return `${iso[2].padStart(2, "0")}/${iso[3].padStart(2, "0")}/${iso[1]}`;
  }

  if (/^\d{6}$/.test(digits)) {
    const yy = Number(digits.slice(4, 6));
    const year = yy > 30 ? `19${digits.slice(4, 6)}` : `20${digits.slice(4, 6)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${year}`;
  }

  return s;
}

function birthDateLooksValid(raw: string): boolean {
  const normalized = normalizeBirthDate(raw);
  const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);

  if (year < 1900 || year > new Date().getFullYear()) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function ChartDataScreenContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldReduceMotion = useReducedMotion();

  const [step, setStep] = useState<Step>("birthday");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [resolvedPlace, setResolvedPlace] = useState<ResolvedPlace | null>(null);

  const [currentPlace, setCurrentPlace] = useState("");
  const [resolvedCurrentPlace, setResolvedCurrentPlace] = useState<ResolvedPlace | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = STEPS.indexOf(step);

  useEffect(() => {
    const saved = loadChart();
    if (!saved) return;

    setBirthDate(saved.birthDate ?? "");
    setBirthTime(saved.birthTime ?? "");
    setBirthPlace(saved.birthPlace ?? "");

    if (saved.birthPlace) {
      setResolvedPlace({
        label: saved.birthPlace,
        lat: saved.lat,
        lon: saved.lng,
        timezone: saved.timezone,
      });
    }

    if (saved.currentPlace) {
      setCurrentPlace(saved.currentPlace);
    }

    if (
      typeof saved.currentLat === "number" &&
      typeof saved.currentLng === "number"
    ) {
      setResolvedCurrentPlace({
        label: saved.currentPlace ?? "",
        lat: saved.currentLat,
        lon: saved.currentLng,
        timezone: saved.currentTimezone ?? "",
      });
    }

    // A recalc intentionally begins from the first detail so the user can edit it.
    if (searchParams.get("recalculate") === "true") {
      setStep("birthday");
    }
  }, [searchParams]);

  const resolvePlace = useCallback(
    async (query: string, required: boolean): Promise<ResolvedPlace | null> => {
      const trimmed = query.trim();
      if (!trimmed) return null;

      try {
        const response = await fetch("/api/places/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed }),
        });

        const data = await response.json();
        if (!response.ok || !data?.place) {
          if (required) throw new Error("Location not found.");
          return null;
        }

        return {
          label: data.place.label,
          lat: data.place.lat,
          lon: data.place.lon,
          timezone: data.place.timezone ?? "UTC",
        };
      } catch (err) {
        if (required) throw err;
        return null;
      }
    },
    []
  );

  const calculateAndContinue = useCallback(async () => {
    if (!resolvedPlace) return;

    setBusy(true);
    setError(null);

    const normalizedDate = normalizeBirthDate(birthDate);

    try {
      let current = resolvedCurrentPlace;

      // Current location is optional. Resolve it quietly if the user typed one.
      if (currentPlace.trim() && !current) {
        current = await resolvePlace(currentPlace, false);
        if (current) {
          setResolvedCurrentPlace(current);
          setCurrentPlace(current.label);
        }
      }

      const response = await fetch("/api/chart-calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthDate: normalizedDate,
          birthTime: birthTime.trim(),
          birthPlace: resolvedPlace.label,
          lat: resolvedPlace.lat,
          lng: resolvedPlace.lon,
          timezone: resolvedPlace.timezone,
          ...(current
            ? {
                currentLat: current.lat,
                currentLng: current.lon,
              }
            : {}),
        }),
      });

      const data: ChartCalculateResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Chart calculation failed.");
      }

      saveChart({
        birthDate: normalizedDate,
        birthTime: birthTime.trim(),
        birthPlace: resolvedPlace.label,
        lat: resolvedPlace.lat,
        lng: resolvedPlace.lon,
        timezone: resolvedPlace.timezone,
        currentLat: current?.lat,
        currentLng: current?.lon,
        currentPlace: current?.label ?? "",
        currentTimezone: current?.timezone ?? "",
        chartData: data,
      });

      await fetch("/api/user/save-chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthDate: normalizedDate,
          birthTime: birthTime.trim(),
          birthPlace: resolvedPlace.label,
          lat: resolvedPlace.lat,
          lng: resolvedPlace.lon,
          timezone: resolvedPlace.timezone,
        }),
      });

      try {
        const alreadyFired = localStorage.getItem("ttq_registration_fired");
        if (!alreadyFired && typeof window !== "undefined" && window.ttq) {
          window.ttq.track("CompleteRegistration");
          localStorage.setItem("ttq_registration_fired", "1");
        }
      } catch {
        // Analytics must never interrupt onboarding.
      }

      router.push("/reading/intake");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
      setBusy(false);
    }
  }, [
    birthDate,
    birthTime,
    currentPlace,
    resolvedCurrentPlace,
    resolvedPlace,
    resolvePlace,
    router,
  ]);

  const advance = useCallback(async () => {
    if (busy) return;
    setError(null);

    if (step === "birthday") {
      if (!birthDateLooksValid(birthDate)) {
        setError("Enter a valid birthday.");
        return;
      }

      setBirthDate(normalizeBirthDate(birthDate));
      setStep("time");
      return;
    }

    if (step === "time") {
      if (!birthTime.trim()) {
        setError("Enter your birth time.");
        return;
      }

      setStep("location");
      return;
    }

    if (step === "location") {
      if (!birthPlace.trim()) {
        setError("Enter your birth location.");
        return;
      }

      setBusy(true);

      try {
        let birth = resolvedPlace;
        if (!birth) {
          birth = await resolvePlace(birthPlace, true);
        }

        if (!birth) {
          setError("Location not found.");
          return;
        }

        setResolvedPlace(birth);
        setBirthPlace(birth.label);

        if (currentPlace.trim()) {
          const current = await resolvePlace(currentPlace, false);
          if (current) {
            setResolvedCurrentPlace(current);
            setCurrentPlace(current.label);
          }
        }

        setStep("terms");
      } catch {
        setResolvedPlace(null);
        setError("Location not found.");
      } finally {
        setBusy(false);
      }
      return;
    }

    await calculateAndContinue();
  }, [
    birthDate,
    birthPlace,
    birthTime,
    busy,
    calculateAndContinue,
    currentPlace,
    resolvedPlace,
    resolvePlace,
    step,
  ]);

  const goBack = useCallback(() => {
    if (busy) return;
    setError(null);

    if (stepIndex <= 0) {
      router.back();
      return;
    }

    setStep(STEPS[stepIndex - 1]);
  }, [busy, router, stepIndex]);

  const transition = useMemo(
    () => ({ duration: shouldReduceMotion ? 0 : 0.18, ease: "easeOut" as const }),
    [shouldReduceMotion]
  );

  const handleEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void advance();
  };

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-white text-[#111111]">
      <button
        type="button"
        onClick={goBack}
        aria-label="Back"
        className="absolute left-5 top-[max(1.25rem,env(safe-area-inset-top))] z-20 flex h-11 w-11 items-center justify-center text-[27px] font-light text-[#111111] transition-opacity hover:opacity-60"
      >
        ‹
      </button>

      <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl items-center justify-center px-7 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(4.5rem,env(safe-area-inset-top))]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.section
            key={step}
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0 }}
            transition={transition}
            className="flex w-full -translate-y-[4vh] flex-col items-center text-center"
          >
            {step === "birthday" && (
              <>
                <h1 className="text-[18px] font-medium tracking-[-0.01em] text-[#111111]">
                  Birthday
                </h1>
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  autoComplete="bday"
                  value={birthDate}
                  onChange={(event) => setBirthDate(event.target.value)}
                  onKeyDown={handleEnter}
                  placeholder="MM / DD / YYYY"
                  aria-label="Birthday"
                  className="mt-7 w-full bg-transparent text-center text-[clamp(34px,9vw,54px)] font-normal tracking-[-0.04em] text-[#111111] caret-[#0f766e] outline-none placeholder:text-[#B5B5B5]"
                />
              </>
            )}

            {step === "time" && (
              <>
                <h1 className="text-[18px] font-medium tracking-[-0.01em] text-[#111111]">
                  Birth time
                </h1>
                <input
                  autoFocus
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  value={birthTime}
                  onChange={(event) => setBirthTime(event.target.value)}
                  onKeyDown={handleEnter}
                  placeholder="2:22 AM"
                  aria-label="Birth time"
                  className="mt-7 w-full bg-transparent text-center text-[clamp(38px,10vw,58px)] font-normal tracking-[-0.04em] text-[#111111] caret-[#0f766e] outline-none placeholder:text-[#B5B5B5]"
                />
              </>
            )}

            {step === "location" && (
              <>
                <h1 className="text-[18px] font-medium tracking-[-0.01em] text-[#111111]">
                  Birth location
                </h1>
                <input
                  autoFocus
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  value={birthPlace}
                  onChange={(event) => {
                    setBirthPlace(event.target.value);
                    setResolvedPlace(null);
                  }}
                  onKeyDown={handleEnter}
                  placeholder="City"
                  aria-label="Birth location"
                  className="mt-7 w-full bg-transparent text-center text-[clamp(34px,8vw,52px)] font-normal tracking-[-0.04em] text-[#111111] caret-[#0f766e] outline-none placeholder:text-[#B5B5B5]"
                />

                <div className="mt-12 w-full">
                  <p className="text-[13px] font-medium text-[#777777]">
                    Current location <span className="font-normal text-[#AAAAAA]">optional</span>
                  </p>
                  <input
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    value={currentPlace}
                    onChange={(event) => {
                      setCurrentPlace(event.target.value);
                      setResolvedCurrentPlace(null);
                    }}
                    onKeyDown={handleEnter}
                    placeholder="City"
                    aria-label="Current location optional"
                    className="mt-3 w-full bg-transparent text-center text-[24px] font-normal tracking-[-0.03em] text-[#111111] caret-[#0f766e] outline-none placeholder:text-[#C1C1C1]"
                  />
                </div>
              </>
            )}

            {step === "terms" && (
              <div className="max-w-md">
                <p className="text-[20px] leading-8 tracking-[-0.02em] text-[#333333]">
                  By continuing, you agree to the{" "}
                  <button
                    type="button"
                    onClick={() => window.open("/terms", "_blank")}
                    className="underline decoration-[#999999] underline-offset-4 transition-opacity hover:opacity-60"
                  >
                    Terms
                  </button>
                  .
                </p>
              </div>
            )}

            {error && (
              <p className="mt-7 text-[13px] font-medium text-[#A33A3A]" role="alert">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => void advance()}
              disabled={busy}
              className="mt-12 min-h-11 px-4 text-[15px] font-medium tracking-[-0.01em] text-[#111111] transition-opacity hover:opacity-55 disabled:opacity-35"
            >
              {busy ? "…" : step === "terms" ? "Continue" : "Continue →"}
            </button>
          </motion.section>
        </AnimatePresence>
      </div>
    </main>
  );
}

export default function ChartDataScreen() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-white text-[#111111]" />
      }
    >
      <ChartDataScreenContent />
    </Suspense>
  );
}
