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

/**
 * SWIPE FIX — direction lock + higher commit threshold.
 *
 * The bug: the previous touch handlers only checked horizontal distance
 * (touchStartX - touchEndX), with no regard for vertical movement. Every
 * panel here scrolls vertically (planet tables, transit lists, etc.), and
 * a thumb moving diagonally while scrolling can rack up enough horizontal
 * delta to cross the old 40px threshold almost by accident — misread as
 * a deliberate swipe when the person was just scrolling content.
 *
 * The fix, in two parts:
 *   1. DIRECTION LOCK — track both X and Y movement from touch start.
 *      Once movement exceeds a small threshold (12px), decide once
 *      whether this gesture is "horizontal" or "vertical" based on
 *      which axis moved more. If vertical, do nothing here — never
 *      call preventDefault, so native scroll proceeds untouched. Only
 *      a gesture that's CLEARLY horizontal (not just barely more X than
 *      Y) gets treated as a swipe candidate.
 *   2. HIGHER THRESHOLD — once locked horizontal, require 70px of
 *      actual horizontal travel (up from 40px) before committing to a
 *      panel change. This makes accidental short flicks harmless while
 *      still feeling responsive for an intentional swipe.
 *
 * Nothing else changes: same 5 panels, same props, same existing swipe
 * hints and dot indicators in each panel — this only fixes the gesture
 * detection feeding into goToNext/goToPrevious.
 */

const DIRECTION_LOCK_THRESHOLD = 12; // px of movement before deciding the gesture's axis
const SWIPE_COMMIT_THRESHOLD = 70; // px of horizontal travel to actually change panels, once locked horizontal
const HORIZONTAL_DOMINANCE_RATIO = 1.4; // horizontal movement must exceed vertical by this factor to lock horizontal

type GestureAxis = "undecided" | "horizontal" | "vertical";

export default function PagerContainer() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const totalPanels = 5;

  // ── Fetch user status — unchanged from your original ────────────────
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
    setCurrentIndex((prev) => {
      if (prev === totalPanels - 1) return 0;
      return prev + 1;
    });
  }, [totalPanels]);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev === 0) return totalPanels - 1;
      return prev - 1;
    });
  }, [totalPanels]);

  // ── Direction-locked touch handlers ──────────────────────────────────
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchDeltaX = useRef(0);
  const gestureAxis = useRef<GestureAxis>("undecided");

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchDeltaX.current = 0;
    gestureAxis.current = "undecided";
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartX.current;
    const deltaY = currentY - touchStartY.current;

    if (gestureAxis.current === "undecided") {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (absX < DIRECTION_LOCK_THRESHOLD && absY < DIRECTION_LOCK_THRESHOLD) {
        // Not enough movement yet — wait for more before deciding.
        return;
      }

      // Require horizontal movement to clearly dominate, not just
      // slightly exceed vertical — this is what stops a diagonal
      // scroll-flick from being misread as a swipe.
      gestureAxis.current =
        absX > absY * HORIZONTAL_DOMINANCE_RATIO ? "horizontal" : "vertical";
    }

    if (gestureAxis.current === "vertical") {
      // This is a scroll gesture. Do nothing — no preventDefault, no
      // state update. Native vertical scroll inside the panel proceeds
      // exactly as it would without this component existing.
      return;
    }

    // Confirmed horizontal — safe to treat as a swipe candidate now.
    e.preventDefault();
    touchDeltaX.current = deltaX;
  };

  const handleTouchEnd = () => {
    setIsDragging(false);

    if (gestureAxis.current === "horizontal") {
      if (touchDeltaX.current < -SWIPE_COMMIT_THRESHOLD) {
        goToNext();
      } else if (touchDeltaX.current > SWIPE_COMMIT_THRESHOLD) {
        goToPrevious();
      }
    }

    gestureAxis.current = "undecided";
    touchDeltaX.current = 0;
  };

  // ── Mouse drag for desktop — same direction-lock logic applied ──────
  const mouseStartX = useRef(0);
  const mouseStartY = useRef(0);
  const mouseDeltaX = useRef(0);
  const mouseGestureAxis = useRef<GestureAxis>("undecided");
  const isMouseDown = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    mouseStartX.current = e.clientX;
    mouseStartY.current = e.clientY;
    mouseDeltaX.current = 0;
    mouseGestureAxis.current = "undecided";
    isMouseDown.current = true;
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDown.current) return;

    const deltaX = e.clientX - mouseStartX.current;
    const deltaY = e.clientY - mouseStartY.current;

    if (mouseGestureAxis.current === "undecided") {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      if (absX < DIRECTION_LOCK_THRESHOLD && absY < DIRECTION_LOCK_THRESHOLD) {
        return;
      }
      mouseGestureAxis.current =
        absX > absY * HORIZONTAL_DOMINANCE_RATIO ? "horizontal" : "vertical";
    }

    if (mouseGestureAxis.current === "vertical") return;

    mouseDeltaX.current = deltaX;
  };

  const handleMouseUp = () => {
    if (!isMouseDown.current) return;
    isMouseDown.current = false;
    setIsDragging(false);

    if (mouseGestureAxis.current === "horizontal") {
      if (mouseDeltaX.current < -SWIPE_COMMIT_THRESHOLD) {
        goToNext();
      } else if (mouseDeltaX.current > SWIPE_COMMIT_THRESHOLD) {
        goToPrevious();
      }
    }

    mouseGestureAxis.current = "undecided";
    mouseDeltaX.current = 0;
  };

  // ── Keyboard support — unchanged from your original ──────────────────
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
            transition: isDragging
              ? "none"
              : "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
            cursor: isDragging ? "grabbing" : "grab",
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