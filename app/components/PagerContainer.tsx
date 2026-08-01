"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import ReadingIntakeScreen from "./ReadingIntakeScreen";
import BirthChartPanel from "./BirthChartPanel";
import TodaySkyPanel from "./TodaySkyPanel";
import MembershipPanel from "./MembershipPanel";
import { migrateChartV2 } from "@/lib/chartStore";

// ── Simplified to match ReadingIntakeScreen ───────────────────────────────────
interface UserStatus {
  credits: number;
  isSubscribed: boolean;
  readingsCompleted: number;
  onCooldown: boolean;
  cooldownExpiresAt: string | null;
  canBypass: boolean;
  firstPaidReadingUsed: boolean;
  pwaFreeReadingUsed?: boolean;
}

/**
 * PAGER — four panels:
 *
 *   [0: Reading Intake (main)] ⇄ [1: Birth Chart] ⇄ [2: Today's Sky] ⇄ [3: Membership]
 *
 * The loop wraps: one more left from Membership returns to the main screen.
 *
 * The infinite-loop clone technique: a clone of the last panel sits before the
 * first, and a clone of the first sits after the last. When a transition lands
 * on a clone we disable the transition for one frame and snap to the matching
 * real panel, so the wraparound is seamless in both directions.
 */

const DIRECTION_LOCK_THRESHOLD = 12;
const SWIPE_COMMIT_THRESHOLD = 70;
const HORIZONTAL_DOMINANCE_RATIO = 1.4;

type GestureAxis = "undecided" | "horizontal" | "vertical";

export default function PagerContainer() {
  const totalPanels = 4;

  const [extendedIndex, setExtendedIndex] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [suppressTransition, setSuppressTransition] = useState(false);
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Real panel currently on screen (0-indexed), used to pause off-screen work.
  const activePanel = ((extendedIndex - 1) % totalPanels + totalPanels) % totalPanels;

  // ── Fetch user status + one-time chart migration ────────────────────
  useEffect(() => {
    migrateChartV2();

    const fetchStatus = async () => {
      try {
        const response = await fetch("/api/user/credits");
        const data = await response.json();
        setUserStatus({
          credits: Number(data.credits ?? 0),
          isSubscribed: data.isSubscribed === true,
          readingsCompleted: Number(data.readingsCompleted ?? 0),
          onCooldown: data.onCooldown === true,
          cooldownExpiresAt: data.cooldownExpiresAt ?? null,
          canBypass: data.canBypass === true,
          firstPaidReadingUsed: data.firstPaidReadingUsed === true,
          pwaFreeReadingUsed: data.pwaFreeReadingUsed === true,
        });
      } catch {
        // silent
      }
    };
    fetchStatus();
  }, []);

  // ── PWA install grant ──────────────────────────────────────────────────────
  // Fires only in standalone (installed) mode. Server guards double-claims, so
  // firing every load is safe. On grant, refetch status so the token shows now.
  useEffect(() => {
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (!isStandalone) return;

    fetch("/api/user/claim-pwa-reading", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d.granted) {
          console.log("[pwa] free reading token granted");
          // Refetch user status so the new token appears without a reload:
          return fetch("/api/user/credits").then((r) => r.json());
        }
      })
      .then((status) => {
        if (status) {
          setUserStatus({
            credits: Number(status.credits ?? 0),
            isSubscribed: status.isSubscribed === true,
            readingsCompleted: Number(status.readingsCompleted ?? 0),
            onCooldown: status.onCooldown === true,
            cooldownExpiresAt: status.cooldownExpiresAt ?? null,
            canBypass: status.canBypass === true,
            firstPaidReadingUsed: status.firstPaidReadingUsed === true,
            pwaFreeReadingUsed: status.pwaFreeReadingUsed === true,
          });
        }
      })
      .catch(() => {});
  }, []);

  const goToNext = useCallback(() => {
    setExtendedIndex((prev) => prev + 1);
  }, []);

  const goToPrevious = useCallback(() => {
    setExtendedIndex((prev) => prev - 1);
  }, []);

  // ── Clone snap-back after each transition ────────────────────────────
  const handleTrackTransitionEnd = useCallback(() => {
    // When we've swiped to the last clone (index totalPanels + 1), snap to the real first panel (index 1)
    if (extendedIndex === totalPanels + 1) {
      setSuppressTransition(true);
      setExtendedIndex(1);
    } 
    // When we've swiped to the first clone (index 0), snap to the real last panel (index totalPanels)
    else if (extendedIndex === 0) {
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
    // Let taps on interactive opt-out elements (like the install teaser) through
    // to their own handlers instead of the swipe logic.
    if ((e.target as HTMLElement).closest?.('[data-no-swipe]')) return;

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
      // Don't hijack arrows while someone is typing in Jxl's input.
      const el = document.activeElement;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) return;
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
            height: "100%",
          }}
        >
          {/* ── CLONE: Membership (before the real first panel) ── */}
          <div className="min-w-full h-full flex-shrink-0 overflow-y-auto" aria-hidden="true">
            <MembershipPanel userStatus={userStatus} onSwipeRight={goToPrevious} />
          </div>

          {/* ── PANEL 0: Reading Intake (main) ── */}
          <div className="min-w-full h-full flex-shrink-0 overflow-y-auto">
            <ReadingIntakeScreen userStatus={userStatus} onSwipeLeft={goToNext} />
          </div>

          {/* ── PANEL 1: Your Birth Chart ── */}
          <div className="min-w-full h-full flex-shrink-0 overflow-y-auto">
            <BirthChartPanel userStatus={userStatus} />
          </div>

          {/* ── PANEL 2: Today's Sky ── */}
          <div className="min-w-full h-full flex-shrink-0 overflow-y-auto">
            <TodaySkyPanel userStatus={userStatus} />
          </div>

          {/* ── PANEL 3: Membership ── */}
          <div className="min-w-full h-full flex-shrink-0 overflow-y-auto">
            <MembershipPanel userStatus={userStatus} onSwipeRight={goToPrevious} />
          </div>

          {/* ── CLONE: Reading Intake (after the real last panel) ── */}
          <div className="min-w-full h-full flex-shrink-0 overflow-y-auto" aria-hidden="true">
            <ReadingIntakeScreen userStatus={userStatus} onSwipeLeft={goToNext} />
          </div>
        </div>
      </div>
    </div>
  );
}