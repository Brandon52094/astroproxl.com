"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import ReadingIntakeScreen from "./ReadingIntakeScreen";
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
 * SWIPE FIX — direction lock + higher commit threshold. (unchanged)
 *
 * INFINITE LOOP FIX (new) — the wraparound glitch:
 *
 * The bug: with 4 real panels in a single row, going from the last panel
 * (index 3, translateX(-300%)) back to the first (index 0, translateX(0%))
 * forces the CSS transition to sweep backwards across every panel in
 * between. A left-swipe past the end visually reads as a hard right-swipe
 * because the transform has to travel the "long way around."
 *
 * The fix: render two extra CLONE panels — a clone of the last real panel
 * before the first, and a clone of the first real panel after the last.
 * The track becomes:
 *
 *   [clone: Moon&Cycles] [0: Reading Intake] [1: Birth Chart]
 *   [2: Daily Transits] [3: Moon & Cycles] [clone: Reading Intake]
 *
 * "extendedIndex" starts at 1 (pointing at the real Reading Intake panel).
 * Swiping left/right animates normally across this extended track. Only
 * when the animation lands on a CLONE do we do anything special: the
 * instant that transition finishes (onTransitionEnd), we disable the
 * transition for one frame and snap extendedIndex to the matching real
 * panel's position. Because the clone is visually identical to the real
 * panel, that snap is imperceptible — the loop feels seamless in both
 * directions.
 */

const DIRECTION_LOCK_THRESHOLD = 12;
const SWIPE_COMMIT_THRESHOLD = 70;
const HORIZONTAL_DOMINANCE_RATIO = 1.4;

type GestureAxis = "undecided" | "horizontal" | "vertical";

export default function PagerContainer() {
  const totalPanels = 4; // real panels: Reading Intake, Birth Chart, Daily Transits, Moon & Cycles

  // extendedIndex lives in [0, totalPanels + 1]:
  //   0                -> clone of LAST real panel
  //   1..totalPanels    -> real panels (1 = real index 0, 2 = real index 1, ...)
  //   totalPanels + 1   -> clone of FIRST real panel
  const [extendedIndex, setExtendedIndex] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [suppressTransition, setSuppressTransition] = useState(false);
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

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
    setExtendedIndex((prev) => prev + 1);
  }, []);

  const goToPrevious = useCallback(() => {
    setExtendedIndex((prev) => prev - 1);
  }, []);

  // ── After every transition, check if we landed on a clone. If so,
  // silently snap (no animation) to the matching real panel. ──────────
  const handleTrackTransitionEnd = useCallback(() => {
    if (extendedIndex === totalPanels + 1) {
      // Landed on the clone of the first panel — snap to the real first panel.
      setSuppressTransition(true);
      setExtendedIndex(1);
    } else if (extendedIndex === 0) {
      // Landed on the clone of the last panel — snap to the real last panel.
      setSuppressTransition(true);
      setExtendedIndex(totalPanels);
    }
  }, [extendedIndex, totalPanels]);

  // Re-enable the transition on the very next frame after a silent snap,
  // so the NEXT user-initiated swipe animates normally again.
  useEffect(() => {
    if (suppressTransition) {
      const raf = requestAnimationFrame(() => setSuppressTransition(false));
      return () => cancelAnimationFrame(raf);
    }
  }, [suppressTransition]);

  // ── Direction-locked touch handlers (unchanged logic) ────────────────
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
        return;
      }

      gestureAxis.current =
        absX > absY * HORIZONTAL_DOMINANCE_RATIO ? "horizontal" : "vertical";
    }

    if (gestureAxis.current === "vertical") {
      return;
    }

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

  const noAnimation = isDragging || suppressTransition;

  return (
    <div
      className="relative h-screen overflow-hidden bg-[#040611]"
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
          onTransitionEnd={handleTrackTransitionEnd}
          style={{
            transform: `translateX(-${extendedIndex * 100}%)`,
            transition: noAnimation
              ? "none"
              : "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
            cursor: isDragging ? "grabbing" : "grab",
          }}
        >
          {/* ── CLONE: Moon & Cycles (sits before the real first panel) ── */}
          <div className="min-w-full h-full overflow-y-auto" aria-hidden="true">
            <MoonCyclesPanel userStatus={userStatus} />
          </div>

          {/* ── PANEL 0: Reading Intake ── */}
          <div className="min-w-full h-full overflow-y-auto">
            <ReadingIntakeScreen
              userStatus={userStatus}
              onSwipeLeft={goToNext}
            />
          </div>

          {/* ── PANEL 1: Birth Chart ── */}
          <div className="min-w-full h-full overflow-y-auto">
            <BirthchartPanel userStatus={userStatus} />
          </div>

          {/* ── PANEL 2: Daily Transits ── */}
          <div className="min-w-full h-full overflow-y-auto">
            <DailyTransitsPanel userStatus={userStatus} />
          </div>

          {/* ── PANEL 3: Moon & Cycles ── */}
          <div className="min-w-full h-full overflow-y-auto">
            <MoonCyclesPanel userStatus={userStatus} />
          </div>

          {/* ── CLONE: Reading Intake (sits after the real last panel) ── */}
          <div className="min-w-full h-full overflow-y-auto" aria-hidden="true">
            <ReadingIntakeScreen userStatus={userStatus} onSwipeLeft={goToNext} />
          </div>
        </div>
      </div>
    </div>
  );
}