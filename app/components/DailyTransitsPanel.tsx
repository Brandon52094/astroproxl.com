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
        <motion.h1 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="text-xl font-semibold text-white text-center tracking-wider mb-1"
        >
          DAILY TRANSITS
        </motion.h1>

        {/* Sun Anchor */}
        {sunTransit && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="text-center mb-6 py-3 rounded-2xl border border-amber-300/10 bg-amber-300/[0.03]"
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

        {/* Two-column layout */}
        <div className="grid grid-cols-2 gap-3 flex-1">
          {/* LEFT: All Transits */}
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden"
          >
            <div className="px-3 py-2.5 border-b border-white/5">
              <span className="text-[8px] uppercase tracking-[0.2em] text-slate-500">
                All
              </span>
            </div>
            <div className="max-h-[340px] overflow-y-auto divide-y divide-white/5">
              {transits.map((planet) => {
                const glyph = GLYPHS[planet.name] || "•";
                const signEmoji = SIGN_EMOJIS[planet.sign] || "";
                return (
                  <div key={planet.name} className="px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <span>{glyph}</span>
                        <span className="text-slate-500">{planet.name}</span>
                      </span>
                      <span className="text-slate-300">
                        {signEmoji} {planet.sign}
                      </span>
                    </div>
                    <div className="flex justify-end mt-0.5">
                      <span className="text-[10px] text-amber-300/40">
                        {planet.degree}
                        {planet.isRetrograde && " ℞"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* RIGHT: Important Transits */}
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="rounded-2xl border border-amber-300/10 bg-amber-300/[0.02] overflow-hidden"
          >
            <div className="px-3 py-2.5 border-b border-amber-300/10">
              <span className="text-[8px] uppercase tracking-[0.2em] text-amber-300/50">
                What Matters
              </span>
            </div>
            <div className="divide-y divide-amber-300/5">
              {importantTransits.map((planet) => {
                const glyph = GLYPHS[planet.name] || "•";
                const signEmoji = SIGN_EMOJIS[planet.sign] || "";
                return (
                  <div key={planet.name} className="px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className="text-amber-300/50">{glyph}</span>
                        <span className="text-slate-300">{planet.name}</span>
                      </span>
                      <span className="text-xs text-white">
                        {signEmoji} {planet.sign}
                      </span>
                    </div>
                    <div className="flex justify-end mt-0.5">
                      <span className="text-[10px] text-amber-300/40">
                        {planet.degree}
                        {planet.isRetrograde && " ℞"}
                      </span>
                    </div>
                  </div>
                );
              })}
              {importantTransits.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-slate-500">
                  No major transits
                </div>
              )}
            </div>
          </motion.div>
        </div>

        <div className="mt-4 text-center">
          <span className="text-[10px] text-slate-600">
            {transits.length} transits · {importantTransits.length} highlighted
          </span>
        </div>
      </div>
    </div>
  );
}