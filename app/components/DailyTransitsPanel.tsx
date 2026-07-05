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

interface DailyTransitsPanelProps {
  userStatus: UserStatus | null;
}

interface TransitPlanet {
  name: string;
  sign: string;
  degree: string;
  isRetrograde: boolean;
}

const GLYPHS: Record<string, string> = {
  Sun: "☉",
  Moon: "☽",
  Mercury: "☿",
  Venus: "♀",
  Mars: "♂",
  Jupiter: "♃",
  Saturn: "♄",
  Uranus: "♅",
  Neptune: "♆",
  Pluto: "♇",
  "North Node": "☊",
  "South Node": "☋",
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

const IMPORTANT_PLANETS = ["North Node", "South Node", "Venus", "Mercury", "Mars", "Moon"];

// Same amber theme used for the highlighted section, to echo the Big 3
// card treatment on the Birth Chart panel.
const THEME = {
  border: "rgba(251, 191, 36, 0.2)",
  bg: "rgba(251, 191, 36, 0.04)",
  glow: "rgba(251, 191, 36, 0.12)",
  text: "#FBBF24",
};

export default function DailyTransitsPanel({ userStatus }: DailyTransitsPanelProps) {
  const [transits, setTransits] = useState<TransitPlanet[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const chart = loadChart();
    if (!chart?.chartData) {
      setIsLoading(false);
      return;
    }

    const data = chart.chartData as unknown as {
      transits?: TransitPlanet[];
    };

    if (data.transits) {
      setTransits(data.transits);
    }
    setIsLoading(false);
  }, []);

  const sunTransit = useMemo(() => transits.find(p => p.name === "Sun"), [transits]);
  const importantTransits = useMemo(() => {
    return transits.filter(p => IMPORTANT_PLANETS.includes(p.name));
  }, [transits]);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }, []);

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#050816]">
        <div className="text-slate-400 text-sm">Loading transits...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-y-auto bg-[#050816]">
      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-blue-400/5 blur-[100px] pointer-events-none" />

      <div className="relative z-10 flex flex-col min-h-screen px-6 py-16 max-w-[430px] mx-auto">
        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="text-xl font-semibold text-white text-center tracking-wider mb-1"
        >
          DAILY TRANSITS
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="text-center text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-6"
        >
          {todayLabel}
        </motion.p>

        {/* Sun Anchor */}
        {sunTransit && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="text-center mb-4 py-3 rounded-2xl border border-amber-300/10 bg-amber-300/[0.03]"
          >
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Today's Anchor</span>
            <div className="flex items-center justify-center gap-3 mt-1">
              <span className="text-2xl text-amber-300/60">{GLYPHS.Sun}</span>
              <span className="text-lg font-medium text-white">
                {sunTransit.sign} {sunTransit.degree}
              </span>
              <span className="text-xl">{SIGN_EMOJIS[sunTransit.sign]}</span>
            </div>
          </motion.div>
        )}

        {/* ── WHAT MATTERS (prominent, non-scrolling — mirrors the Big 3 card) ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="rounded-3xl p-6 mb-6"
          style={{
            border: `1px solid ${THEME.border}`,
            backgroundColor: THEME.bg,
            boxShadow: `0 0 40px ${THEME.glow}`,
          }}
        >
          <p className="text-[10px] uppercase tracking-[0.2em] mb-4" style={{ color: THEME.text }}>
            What Matters Today
          </p>
          <div className="space-y-4">
            {importantTransits.map((planet, index) => {
              const glyph = GLYPHS[planet.name] || "•";
              const signEmoji = SIGN_EMOJIS[planet.sign] || "";
              return (
                <div
                  key={planet.name}
                  className={cn(
                    "flex items-center gap-4",
                    index < importantTransits.length - 1 && "pb-4 border-b border-white/5"
                  )}
                >
                  <span className="text-2xl w-10 text-center" style={{ color: THEME.text }}>
                    {glyph}
                  </span>
                  <span className="text-sm font-medium text-slate-400 w-20 uppercase tracking-wide">
                    {planet.name}
                  </span>
                  <span className="text-lg">{signEmoji}</span>
                  <span className="text-base font-medium text-white flex-1">
                    {planet.sign}
                  </span>
                  <span className="text-sm text-amber-300/70">
                    {planet.degree}
                    {planet.isRetrograde && " ℞"}
                  </span>
                </div>
              );
            })}
            {importantTransits.length === 0 && (
              <div className="py-4 text-center text-xs text-slate-500">
                No major transits today
              </div>
            )}
          </div>
        </motion.div>

        {/* ── DIVIDER ── */}
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/[0.04]" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-[#050816] px-3 text-[10px] uppercase tracking-[0.2em] text-slate-600">
              All Transits
            </span>
          </div>
        </div>

        {/* ── FULL TRANSIT TABLE (scrollable) ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
          className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden flex-1"
        >
          <div
            className="grid grid-cols-3 gap-1 px-4 py-3 border-b border-white/5 text-[10px] uppercase tracking-[0.15em]"
            style={{ color: THEME.text }}
          >
            <span>Planet</span>
            <span>Sign</span>
            <span className="text-right">Degree</span>
          </div>

          <div className="max-h-[360px] overflow-y-auto divide-y divide-white/5">
            {transits.map((planet) => {
              const glyph = GLYPHS[planet.name] || "•";
              const signEmoji = SIGN_EMOJIS[planet.sign] || "";
              const isHighlighted = IMPORTANT_PLANETS.includes(planet.name);

              return (
                <div
                  key={planet.name}
                  className={cn(
                    "grid grid-cols-3 gap-1 px-4 py-3 text-sm",
                    isHighlighted && "bg-white/[0.02]"
                  )}
                >
                  <span className={cn("flex items-center gap-2", isHighlighted && "font-medium")}>
                    <span className="text-base" style={{ color: isHighlighted ? THEME.text : undefined }}>
                      {glyph}
                    </span>
                    <span className={isHighlighted ? "text-white" : "text-slate-300"}>
                      {planet.name}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <span>{signEmoji}</span>
                    <span>{planet.sign}</span>
                  </span>
                  <span className="text-right text-amber-300/60">
                    {planet.degree}
                    {planet.isRetrograde && " ℞"}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>

        <div className="mt-4 text-center">
          <span className="text-[10px] text-slate-600">
            {transits.length} transits · {importantTransits.length} highlighted
          </span>
        </div>
      </div>
    </div>
  );
}