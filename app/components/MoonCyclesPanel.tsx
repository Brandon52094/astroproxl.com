"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { loadChart } from "@/lib/chartStore";

interface UserStatus {
  firstReadingUsed: boolean;
  paywallsCompleted: number;
  isSubscribed: boolean;
  readingsCompleted: number;
  onCooldown: boolean;
  cooldownExpiresAt: string | null;
  canBypass: boolean;
  freeReadingResetAt: string | null;
  freeReadingAvailable: boolean;
}

interface MoonCyclesPanelProps {
  userStatus: UserStatus | null;
}

interface MoonPhaseData {
  phaseName: string;
  illuminationPercent: number;
  nextEventName: "New Moon" | "Full Moon";
  daysUntilNextEvent: number;
  moonSign: string;
  moonDegree: string;
}

interface TransitPlanet {
  name: string;
  sign: string;
  degree: string;
  isRetrograde: boolean;
}

const GLYPHS: Record<string, string> = {
  Moon: "☽",
  Mercury: "☿",
};

const SIGN_EMOJIS: Record<string, string> = {
  Aries: "♈",
  Taurus: "♉",
  Gemini: "♊",
  Cancer: "♋",
  Leo: "♌",
  Virgo: "♍",
  Libra: "♎",
  Scorpio: "♏",
  Sagittarius: "♐",
  Capricorn: "♑",
  Aquarius: "♒",
  Pisces: "♓",
};

const MOON_PHASE_GLYPHS: Record<string, string> = {
  "New Moon": "🌑",
  "Waxing Crescent": "🌒",
  "First Quarter": "🌓",
  "Waxing Gibbous": "🌔",
  "Full Moon": "🌕",
  "Waning Gibbous": "🌖",
  "Last Quarter": "🌗",
  "Waning Crescent": "🌘",
};

const MOON_PHASE_ORDER = [
  "New Moon",
  "Waxing Crescent",
  "First Quarter",
  "Waxing Gibbous",
  "Full Moon",
  "Waning Gibbous",
  "Last Quarter",
  "Waning Crescent",
];

// Placeholder data - will be replaced with real calculations
const PLACEHOLDER_MOON_DATA = {
  phaseName: "Waxing Gibbous",
  illuminationPercent: 78,
  nextEventName: "Full Moon" as const,
  daysUntilNextEvent: 3,
  moonSign: "Pisces",
  moonDegree: "22°",
  nextSign: "Aries",
  ingressTime: "11:30 PM",
  voidOfCourse: true,
  voidEndsAt: "11:30 PM",
  monthlyReturnDays: 6,
};

export default function MoonCyclesPanel({ userStatus }: MoonCyclesPanelProps) {
  const [moonData, setMoonData] = useState(PLACEHOLDER_MOON_DATA);
  const [retrogrades, setRetrogrades] = useState<TransitPlanet[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const chart = loadChart();
    if (!chart?.chartData) {
      setIsLoading(false);
      return;
    }

    const data = chart.chartData as unknown as {
      moonPhase?: MoonPhaseData;
      transits?: TransitPlanet[];
    };

    if (data.moonPhase) {
      // Map real data to our display format
      setMoonData({
        phaseName: data.moonPhase.phaseName,
        illuminationPercent: data.moonPhase.illuminationPercent,
        nextEventName: data.moonPhase.nextEventName,
        daysUntilNextEvent: data.moonPhase.daysUntilNextEvent,
        moonSign: data.moonPhase.moonSign,
        moonDegree: data.moonPhase.moonDegree,
        nextSign: "Aries", // placeholder
        ingressTime: "11:30 PM", // placeholder
        voidOfCourse: false, // placeholder
        voidEndsAt: "—", // placeholder
        monthlyReturnDays: 6, // placeholder
      });
    }

    if (data.transits) {
      const retrogradePlanets = data.transits.filter(p => p.isRetrograde);
      setRetrogrades(retrogradePlanets);
    }
    setIsLoading(false);
  }, []);

  const phaseIndex = useMemo(() => {
    return MOON_PHASE_ORDER.indexOf(moonData.phaseName);
  }, [moonData.phaseName]);

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#050816]">
        <div className="text-slate-400 text-sm">Loading moon data...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-y-auto bg-[#050816]">
      {/* Ambient glow - moon-like */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-indigo-400/5 blur-[100px] pointer-events-none" />

      <div className="relative z-10 flex flex-col min-h-screen px-6 py-16 max-w-[430px] mx-auto">
        <motion.h1 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="text-xl font-semibold text-white text-center tracking-wider mb-6"
        >
          MOON & CYCLES
        </motion.h1>

        {/* Moon Phase */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="text-center mb-6"
        >
          <span className="text-6xl block mb-2">
            {MOON_PHASE_GLYPHS[moonData.phaseName] || "🌙"}
          </span>
          <h2 className="text-2xl font-medium text-white">
            {moonData.phaseName}
          </h2>
          <p className="text-sm text-slate-400">
            {moonData.illuminationPercent}% illuminated
          </p>
        </motion.div>

        {/* Moon Position + Ingress */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 mb-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Moon in</span>
            <span className="text-lg font-medium text-white flex items-center gap-2">
              <span>{SIGN_EMOJIS[moonData.moonSign]}</span>
              {moonData.moonSign} {moonData.moonDegree}
            </span>
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
            <span className="text-sm text-slate-400">Enters</span>
            <span className="text-sm text-amber-300/70">
              {moonData.nextSign} at {moonData.ingressTime}
            </span>
          </div>
        </motion.div>

        {/* Next Major Event */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="rounded-2xl border border-amber-300/10 bg-amber-300/[0.02] p-4 mb-4"
        >
          <p className="text-[10px] text-amber-300/50 uppercase tracking-[0.2em] mb-1">
            Next Major Event
          </p>
          <p className="text-base text-white">
            {moonData.nextEventName} in {moonData.daysUntilNextEvent} days
          </p>
        </motion.div>

        {/* Phase Cycle Strip */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 mb-4 overflow-x-auto"
        >
          <div className="flex items-center justify-between min-w-[320px]">
            {MOON_PHASE_ORDER.map((phase, i) => {
              const isActive = i === phaseIndex;
              const glyph = MOON_PHASE_GLYPHS[phase] || "🌙";
              return (
                <div key={phase} className="flex flex-col items-center gap-1">
                  <span className={cn(
                    "text-xl transition-all",
                    isActive ? "text-amber-300 scale-125" : "text-slate-500/30"
                  )}>
                    {glyph}
                  </span>
                  <span className={cn(
                    "text-[7px] uppercase tracking-[0.08em]",
                    isActive ? "text-amber-300/50" : "text-slate-500/20"
                  )}>
                    {phase.split(" ").slice(0, 2).join(" ")}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Monthly Return + Void of Course */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="space-y-3"
        >
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] mb-1">
              Monthly Return
            </p>
            <p className="text-sm text-white">
              Moon returns to your natal position in <span className="text-amber-300/70">{moonData.monthlyReturnDays} days</span>
            </p>
          </div>

          <div className={cn(
            "rounded-2xl border p-4",
            moonData.voidOfCourse 
              ? "border-amber-300/20 bg-amber-300/[0.03]" 
              : "border-white/5 bg-white/[0.02]"
          )}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Void of Course
              </p>
              <span className={cn(
                "text-xs font-medium",
                moonData.voidOfCourse ? "text-amber-300" : "text-emerald-400/60"
              )}>
                {moonData.voidOfCourse ? "⚠️ Currently void" : "✅ Clear"}
              </span>
            </div>
            {moonData.voidOfCourse && (
              <p className="text-xs text-slate-400 mt-1">
                Until {moonData.voidEndsAt} — not ideal for big decisions
              </p>
            )}
          </div>
        </motion.div>

        {/* Retrogrades */}
        {retrogrades.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="mt-4 rounded-2xl border border-indigo-400/10 bg-indigo-400/[0.02] p-4"
          >
            <p className="text-[10px] text-indigo-300/50 uppercase tracking-[0.2em] mb-2">
              Currently Retrograde
            </p>
            <div className="flex flex-wrap gap-3">
              {retrogrades.map((planet) => (
                <span key={planet.name} className="text-sm text-indigo-300/60">
                  {GLYPHS[planet.name] || "•"} {planet.name}
                </span>
              ))}
            </div>
          </motion.div>
        )}

        <div className="mt-4 text-center">
          <span className="text-[10px] text-slate-600">
            {retrogrades.length} planets retrograde
          </span>
        </div>
      </div>
    </div>
  );
}