"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
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

interface BirthChartPanelProps {
  userStatus: UserStatus | null;
}

interface NatalPlacement {
  name: string;
  sign: string;
  degree: string;
  house?: string;
}

const GLYPHS: Record<string, string> = {
  Sun: "☉",
  Moon: "☽",
  Rising: "↑",
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

const ELEMENT_MAP: Record<string, string> = {
  Aries: "fire",
  Leo: "fire",
  Sagittarius: "fire",
  Taurus: "earth",
  Virgo: "earth",
  Capricorn: "earth",
  Gemini: "air",
  Libra: "air",
  Aquarius: "air",
  Cancer: "water",
  Scorpio: "water",
  Pisces: "water",
};

const ELEMENT_THEMES = {
  fire: {
    primary: "#F97316",
    secondary: "#EA580C",
    glow: "rgba(249, 115, 22, 0.12)",
    border: "rgba(249, 115, 22, 0.2)",
    bg: "rgba(249, 115, 22, 0.04)",
    text: "#FB923C",
    gradient: "linear-gradient(180deg, rgba(249,115,22,0.08), rgba(234,88,12,0.02))",
  },
  earth: {
    primary: "#65A30D",
    secondary: "#4D7C0F",
    glow: "rgba(101, 163, 13, 0.12)",
    border: "rgba(101, 163, 13, 0.2)",
    bg: "rgba(101, 163, 13, 0.04)",
    text: "#84CC16",
    gradient: "linear-gradient(180deg, rgba(101,163,13,0.08), rgba(77,124,15,0.02))",
  },
  air: {
    primary: "#3B82F6",
    secondary: "#2563EB",
    glow: "rgba(59, 130, 246, 0.12)",
    border: "rgba(59, 130, 246, 0.2)",
    bg: "rgba(59, 130, 246, 0.04)",
    text: "#60A5FA",
    gradient: "linear-gradient(180deg, rgba(59,130,246,0.08), rgba(37,99,235,0.02))",
  },
  water: {
    primary: "#8B5CF6",
    secondary: "#7C3AED",
    glow: "rgba(139, 92, 246, 0.12)",
    border: "rgba(139, 92, 246, 0.2)",
    bg: "rgba(139, 92, 246, 0.04)",
    text: "#A78BFA",
    gradient: "linear-gradient(180deg, rgba(139,92,246,0.08), rgba(124,58,237,0.02))",
  },
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

export default function BirthChartPanel({ userStatus }: BirthChartPanelProps) {
  const [allPlanets, setAllPlanets] = useState<NatalPlacement[]>([]);
  const [natalSun, setNatalSun] = useState<NatalPlacement | null>(null);
  const [natalMoon, setNatalMoon] = useState<NatalPlacement | null>(null);
  const [natalRising, setNatalRising] = useState<NatalPlacement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const chart = loadChart();
    if (!chart?.chartData) {
      setIsLoading(false);
      return;
    }

    const data = chart.chartData as unknown as {
      tropical?: { planets?: Array<{ name: string; sign: string; degree: string; house?: string }> };
    };

    const planets = data.tropical?.planets ?? [];
    
    const planetOrder = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
    const allPlanetsData: NatalPlacement[] = [];
    
    planetOrder.forEach(name => {
      const found = planets.find(p => p.name === name);
      if (found) {
        allPlanetsData.push({ ...found, house: found.house || "—" });
      }
    });

    const northNode = planets.find(p => p.name === "North Node");
    if (northNode) {
      allPlanetsData.push({ ...northNode, house: northNode.house || "—" });
    }

    const southNode = planets.find(p => p.name === "South Node");
    if (southNode) {
      allPlanetsData.push({ ...southNode, house: southNode.house || "—" });
    }

    const rising = planets.find(p => p.name === "Ascendant");
    if (rising) {
      setNatalRising({ ...rising, house: "1" });
    }

    setAllPlanets(allPlanetsData);
    setNatalSun(planets.find(p => p.name === "Sun") ?? null);
    setNatalMoon(planets.find(p => p.name === "Moon") ?? null);
    setIsLoading(false);
  }, []);

  const sunElement = useMemo(() => {
    if (!natalSun) return "fire";
    return ELEMENT_MAP[natalSun.sign] || "fire";
  }, [natalSun]);

  const theme = ELEMENT_THEMES[sunElement as keyof typeof ELEMENT_THEMES];

  const big3Data = useMemo(() => {
    return [
      { name: "Sun", data: natalSun, glyph: GLYPHS.Sun },
      { name: "Moon", data: natalMoon, glyph: GLYPHS.Moon },
      { name: "Rising", data: natalRising, glyph: GLYPHS.Rising },
    ].filter(item => item.data !== null);
  }, [natalSun, natalMoon, natalRising]);

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#050816]">
        <div className="text-slate-400 text-sm">Loading your chart...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-y-auto bg-[#050816]">
      {/* Ambient glow based on element */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px] pointer-events-none opacity-40"
        style={{ background: theme.glow }}
      />

      <div className="relative z-10 flex flex-col min-h-screen px-6 py-16 max-w-[430px] mx-auto">
        {/* Title */}
        <motion.h1 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="text-xl font-semibold text-white text-center tracking-wider mb-1"
        >
          YOUR BIRTH CHART
        </motion.h1>
        
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex justify-center mb-6"
        >
          <span 
            className="text-[10px] uppercase tracking-[0.2em] px-3 py-1 rounded-full border"
            style={{ 
              borderColor: theme.border, 
              color: theme.text,
              backgroundColor: theme.bg 
            }}
          >
            Placidus Houses
          </span>
        </motion.div>

        {/* ── BIG 3 ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="rounded-3xl p-6 mb-6"
          style={{
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.bg,
            boxShadow: `0 0 40px ${theme.glow}`,
          }}
        >
          <div className="space-y-4">
            {big3Data.map((item, index) => {
              const signEmoji = SIGN_EMOJIS[item.data?.sign || ""] || "";
              return (
                <div 
                  key={item.name}
                  className={cn(
                    "flex items-center gap-4",
                    index < big3Data.length - 1 && "pb-4 border-b border-white/5"
                  )}
                >
                  <span className="text-2xl w-10 text-center" style={{ color: theme.text }}>
                    {item.glyph}
                  </span>
                  <span className="text-sm font-medium text-slate-400 w-14 uppercase tracking-wide">
                    {item.name}
                  </span>
                  <span className="text-lg">{signEmoji}</span>
                  <span className="text-base font-medium text-white flex-1">
                    {item.data?.sign || "—"}
                  </span>
                  <span className="text-sm text-amber-300/70">
                    {item.data?.degree || "—"}
                  </span>
                  <span className="text-xs text-slate-500 w-12 text-right">
                    {item.data?.house || "—"}H
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* ── DIVIDER ── */}
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/[0.04]" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-[#050816] px-3 text-[10px] uppercase tracking-[0.2em] text-slate-600">
              All Planets
            </span>
          </div>
        </div>

        {/* ── FULL PLANET TABLE ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
          className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden flex-1"
        >
          <div 
            className="grid grid-cols-4 gap-1 px-4 py-3 border-b border-white/5 text-[10px] uppercase tracking-[0.15em]"
            style={{ color: theme.text }}
          >
            <span>Planet</span>
            <span>Sign</span>
            <span className="text-right">Degree</span>
            <span className="text-right">House</span>
          </div>

          <div className="max-h-[320px] overflow-y-auto divide-y divide-white/5">
            {allPlanets.map((planet) => {
              const glyph = GLYPHS[planet.name] || "•";
              const signEmoji = SIGN_EMOJIS[planet.sign] || "";
              const isBig3 = ["Sun", "Moon", "Rising"].includes(planet.name);

              return (
                <div 
                  key={planet.name}
                  className={cn(
                    "grid grid-cols-4 gap-1 px-4 py-3 text-sm",
                    isBig3 && "bg-white/[0.02]"
                  )}
                >
                  <span className={cn(
                    "flex items-center gap-2",
                    isBig3 && "font-medium"
                  )}>
                    <span className="text-base" style={{ color: isBig3 ? theme.text : "text-slate-500" }}>
                      {glyph}
                    </span>
                    <span className={isBig3 ? "text-white" : "text-slate-300"}>
                      {planet.name}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <span>{signEmoji}</span>
                    <span>{planet.sign}</span>
                  </span>
                  <span className="text-right text-amber-300/60">
                    {planet.degree}
                  </span>
                  <span className="text-right text-slate-500 text-xs">
                    {planet.house || "—"}H
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>

        <div className="mt-4 text-center">
          <span className="text-[10px] text-slate-600">
            {allPlanets.length} celestial bodies · Placidus house system
          </span>
        </div>
      </div>
    </div>
  );
}