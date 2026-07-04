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

  // Go to next panel (swipe left)
  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => {
      // If on last panel, go back to first (wrap around)
      if (prev === totalPanels - 1) {
        return 0;
      }
      return prev + 1;
    });
  }, [totalPanels]);

  // Go to previous panel (swipe right)
  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => {
      // If on first panel, go to last (wrap around)
      if (prev === 0) {
        return totalPanels - 1;
      }
      return prev - 1;
    });
  }, [totalPanels]);

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
    const minSwipeDistance = 40;

    if (swipeDistance > minSwipeDistance) {
      // Swipe left → go to next panel
      goToNext();
    } else if (swipeDistance < -minSwipeDistance) {
      // Swipe right → go to previous panel
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
    const minSwipeDistance = 40;

    if (swipeDistance > minSwipeDistance) {
      goToNext();
    } else if (swipeDistance < -minSwipeDistance) {
      goToPrevious();
    }

    setMouseStartX(0);
    setMouseEndX(0);
  };

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
    </div>
  );
}