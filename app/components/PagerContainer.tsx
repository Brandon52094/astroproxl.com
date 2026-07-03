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
  const [touchStartX, setTouchStartX] = useState(0);
  const [touchEndX, setTouchEndX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const totalPanels = 5;
  const panelNames = [
    "Reading",
    "Unlimited",
    "Birth Chart",
    "Transits",
    "Moon & Cycles"
  ];

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

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, totalPanels - 1));
  }, []);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  // Touch swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setTouchEndX(e.touches[0].clientX);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    setTouchEndX(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    const swipeDistance = touchStartX - touchEndX;
    const minSwipeDistance = 50;

    if (swipeDistance > minSwipeDistance && currentIndex < totalPanels - 1) {
      goToNext();
    } else if (swipeDistance < -minSwipeDistance && currentIndex > 0) {
      goToPrevious();
    }

    setTouchStartX(0);
    setTouchEndX(0);
  };

  // Mouse drag for desktop
  const [mouseStartX, setMouseStartX] = useState(0);
  const [mouseEndX, setMouseEndX] = useState(0);
  const [isMouseDragging, setIsMouseDragging] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    setMouseStartX(e.clientX);
    setMouseEndX(e.clientX);
    setIsMouseDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDragging) return;
    setMouseEndX(e.clientX);
  };

  const handleMouseUp = () => {
    setIsMouseDragging(false);
    const swipeDistance = mouseStartX - mouseEndX;
    const minSwipeDistance = 50;

    if (swipeDistance > minSwipeDistance && currentIndex < totalPanels - 1) {
      goToNext();
    } else if (swipeDistance < -minSwipeDistance && currentIndex > 0) {
      goToPrevious();
    }

    setMouseStartX(0);
    setMouseEndX(0);
  };

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && currentIndex < totalPanels - 1) {
        goToNext();
      } else if (e.key === "ArrowLeft" && currentIndex > 0) {
        goToPrevious();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, goToNext, goToPrevious]);

  return (
    <div 
      className="relative h-screen overflow-hidden bg-[#050816]"
      ref={containerRef}
    >
      {/* Panel indicator dots */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex gap-2">
        {Array.from({ length: totalPanels }).map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentIndex(i)}
            className={cn(
              "h-1 rounded-full transition-all duration-300",
              i === currentIndex 
                ? "w-6 bg-amber-300/50" 
                : "w-1.5 bg-white/10 hover:bg-white/20"
            )}
            aria-label={`Go to panel ${i + 1}: ${panelNames[i]}`}
          />
        ))}
      </div>

      {/* Panel name indicator */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        <span className="text-[8px] uppercase tracking-[0.25em] text-slate-500/30 font-medium">
          {panelNames[currentIndex]}
        </span>
      </div>

      {/* Swipeable container */}
      <div
        className="h-full w-full"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="flex h-full w-full"
          style={{
            transform: `translateX(-${currentIndex * 100}%)`,
            transition: isDragging || isMouseDragging 
              ? "none" 
              : "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
            cursor: isDragging || isMouseDragging ? "grabbing" : "grab",
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

      {/* Edge gradient hints */}
      <div className={cn(
        "absolute right-0 top-0 bottom-0 w-20 pointer-events-none z-40",
        "bg-gradient-to-l from-[#050816] via-[#050816]/80 to-transparent",
        currentIndex === totalPanels - 1 && "opacity-0"
      )} />
      <div className={cn(
        "absolute left-0 top-0 bottom-0 w-20 pointer-events-none z-40",
        "bg-gradient-to-r from-[#050816] via-[#050816]/80 to-transparent",
        currentIndex === 0 && "opacity-0"
      )} />
    </div>
  );
}