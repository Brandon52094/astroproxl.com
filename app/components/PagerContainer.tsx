"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import ReadingIntakeScreen from "./ReadingIntakeScreen";
import AccessUnlimitedPanel from "./AccessUnlimitedPanel";
import BirthchartPanel from "./BirthchartPanel";
import DailyTransitsPanel from "./DailyTransitsPanel";
import MoonCyclesPanel from "./MoonCyclesPanel";

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

export default function PagerContainer() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const totalPanels = 5;

  // Fetch user status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch("/api/user/credits");
        const data = await response.json();
        setUserStatus({
          firstReadingUsed: data.firstReadingUsed === true,
          paywallsCompleted: Number(data.paywallsCompleted ?? 0),
          isSubscribed: data.isSubscribed === true,
          readingsCompleted: Number(data.readingsCompleted ?? 0),
          onCooldown: data.onCooldown === true,
          cooldownExpiresAt: data.cooldownExpiresAt ?? null,
          canBypass: data.canBypass === true,
          freeReadingResetAt: data.freeReadingResetAt ?? null,
          freeReadingAvailable: data.freeReadingAvailable === true,
        });
      } catch {
        // silent
      }
    };
    fetchStatus();
  }, []);

  // Go to next panel (triggered by button swipe)
  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev === totalPanels - 1) {
        return 0;
      }
      return prev + 1;
    });
  }, [totalPanels]);

  // Go to previous panel (for other panels' back navigation)
  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev === 0) {
        return totalPanels - 1;
      }
      return prev - 1;
    });
  }, [totalPanels]);

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        goToNext();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        goToPrevious();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToNext, goToPrevious]);

  return (
    <div 
      className="relative h-screen overflow-hidden bg-[#050816]"
      ref={containerRef}
    >
      {/* Swipeable container - NO touch/mouse handlers here anymore */}
      <div className="h-full w-full">
        <div
          className="flex h-full w-full"
          style={{
            transform: `translateX(-${currentIndex * 100}%)`,
            transition: "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {/* ── PANEL 0: Reading Intake ── */}
          <div className="min-w-full h-full overflow-y-auto">
            <ReadingIntakeScreen 
              userStatus={userStatus}
              onSwipeLeft={goToNext}
            />
          </div>

          {/* ── PANEL 1: Access Unlimited ── */}
          <div className="min-w-full h-full overflow-y-auto">
            <AccessUnlimitedPanel userStatus={userStatus} />
          </div>

          {/* ── PANEL 2: Birth Chart ── */}
          <div className="min-w-full h-full overflow-y-auto">
            <BirthchartPanel userStatus={userStatus} />
          </div>

          {/* ── PANEL 3: Daily Transits ── */}
          <div className="min-w-full h-full overflow-y-auto">
            <DailyTransitsPanel userStatus={userStatus} />
          </div>

          {/* ── PANEL 4: Moon & Cycles ── */}
          <div className="min-w-full h-full overflow-y-auto">
            <MoonCyclesPanel userStatus={userStatus} />
          </div>
        </div>
      </div>
    </div>
  );
}