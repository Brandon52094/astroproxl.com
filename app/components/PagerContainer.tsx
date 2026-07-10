"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import ReadingIntakeScreen from "./ReadingIntakeScreen";
import BirthChartPanel from "./BirthChartPanel";
import TodaySkyPanel from "./TodaySkyPanel";
import { migrateChartV2 } from "@/lib/chartStore";

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
 * PAGER — three panels:
 *
 *   [0: Reading Intake (main)]  ⇄  [1: Your Birth Chart]  ⇄  [2: Today's Sky]
 *
 * Swipe left from the main screen to reach your birth chart (who you are),
 * then again to Today's Sky (what the sky is doing now). Swipe right to
 * come back. The loop wraps: from Today's Sky one more left returns to the
 * main screen.
 *
 * The infinite-loop clone technique: a clone of the last panel sits before
 * the first, and a clone of the first sits after the last. When a transition
 * lands on a clone we disable the transition for one frame and snap to the
 * matching real panel, so the wraparound is seamless in both directions.
 */

const DIRECTION_LOCK_THRESHOLD = 12;
const SWIPE_COMMIT_THRESHOLD = 70;
const HORIZONTAL_DOMINANCE_RATIO = 1.4;

type GestureAxis = "undecided" | "horizontal" | "vertical";

export default function PagerContainer() {
  const totalPanels = 3; // real panels: Reading Intake, Birth Chart, Today's Sky

  // extendedIndex lives in [0, totalPanels + 1]:
  //   0               -> clone of LAST real panel (Today's Sky)
  //   1..totalPanels  -> real panels (1 = Reading Intake, 2 = Birth Chart, 3 = Today's Sky)
  //   totalPanels + 1 -> clone of FIRST real panel (Reading Intake)
  const [extendedIndex, setExtendedIndex] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [suppressTransition, setSuppressTransition] = useState(false);
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Fetch user status + one-time chart migration ────────────────────
  useEffect(() => {
    // Silent, guarded, one-time — heals stale charts missing retrograde data.
    // Fires before any panel reads the chart, so the panels show correct
    // retrogrades even on the first post-deploy load. Never throws.
    migrateChartV2();

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

  // ── Clone snap-back after each transition ────────────────────────────
  const handleTrackTransitionEnd = useCallback(() => {
    if (extendedIndex === totalPanels + 1) {
      setSuppressTransition(true);
      setExtendedIndex(1);
    } else if (extendedIndex === 0) {
      setSuppressTransition(true);
      setExtendedIndex(totalPanels);
    }
  }, [extendedIndex, totalPanels]);

  useEffect(() => {
    if (suppressTransition) {
      const raf = requestAnimationFrame(() => setSuppressTransition(false));
      return () => cancelAnimationFrame(raf);
    }
  }, [suppressTransition]);

  // ── Direction-locked touch handlers ─────────────────────────────────
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
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;

    if (gestureAxis.current === "undecided") {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      if (absX < DIRECTION_LOCK_THRESHOLD && absY < DIRECTION_LOCK_THRESHOLD) return;
      gestureAxis.current =
        absX > absY * HORIZONTAL_DOMINANCE_RATIO ? "horizontal" : "vertical";
    }

    if (gestureAxis.current === "vertical") return;

    e.preventDefault();
    touchDeltaX.current = deltaX;
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (gestureAxis.current === "horizontal") {
      if (touchDeltaX.current < -SWIPE_COMMIT_THRESHOLD) goToNext();
      else if (touchDeltaX.current > SWIPE_COMMIT_THRESHOLD) goToPrevious();
    }
    gestureAxis.current = "undecided";
    touchDeltaX.current = 0;
  };

  // ── Mouse drag for desktop ───────────────────────────────────────────
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
      if (absX < DIRECTION_LOCK_THRESHOLD && absY < DIRECTION_LOCK_THRESHOLD) return;
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
      if (mouseDeltaX.current < -SWIPE_COMMIT_THRESHOLD) goToNext();
      else if (mouseDeltaX.current > SWIPE_COMMIT_THRESHOLD) goToPrevious();
    }
    mouseGestureAxis.current = "undecided";
    mouseDeltaX.current = 0;
  };

  // ── Keyboard support ─────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goToNext();
      else if (e.key === "ArrowLeft") goToPrevious();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToNext, goToPrevious]);

  const noAnimation = isDragging || suppressTransition;

  return (
    <div className="relative h-screen overflow-hidden bg-[#040611]" ref={containerRef}>
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
          {/* ── CLONE: Today's Sky (before the real first panel) ── */}
          <div className="min-w-full h-full overflow-y-auto" aria-hidden="true">
            <TodaySkyPanel userStatus={userStatus} />
          </div>

          {/* ── PANEL 0: Reading Intake (main) ── */}
          <div className="min-w-full h-full overflow-y-auto">
            <ReadingIntakeScreen userStatus={userStatus} onSwipeLeft={goToNext} />
          </div>

          {/* ── PANEL 1: Your Birth Chart ── */}
          <div className="min-w-full h-full overflow-y-auto">
            <BirthChartPanel userStatus={userStatus} />
          </div>

          {/* ── PANEL 2: Today's Sky ── */}
          <div className="min-w-full h-full overflow-y-auto">
            <TodaySkyPanel userStatus={userStatus} />
          </div>

          {/* ── CLONE: Reading Intake (after the real last panel) ── */}
          <div className="min-w-full h-full overflow-y-auto" aria-hidden="true">
            <ReadingIntakeScreen userStatus={userStatus} onSwipeLeft={goToNext} />
          </div>
        </div>
      </div>
    </div>
  );
}