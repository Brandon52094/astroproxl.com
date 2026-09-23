"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import ReadingIntakeScreen from "./ReadingIntakeScreen";
import BirthChartPanel from "./BirthChartPanel";
import TodaySkyPanel from "./TodaySkyPanel";
import CreditsPanel from "./CreditsPanel";
import { migrateChartV2 } from "@/lib/chartStore";

// ── Simplified to match ReadingIntakeScreen ───────────────────────────────────
interface UserStatus {
  credits: number;
  isSubscribed: boolean;
  readingsCompleted: number;
  onCooldown: boolean;
  cooldownExpiresAt: string | null;
  canBypass: boolean; 
  pwaFreeReadingUsed?: boolean;
}

/**
 * PAGER — four real panels in a circular loop:
 *
 *   Reading Intake ⇄ Birth Chart ⇄ Today's Sky ⇄ Credits ⇄ Reading Intake
 *
 * No duplicate Reading/Credits components are mounted. Instead, the four real
 * panels are cyclically reordered after each completed swipe while transitions
 * are disabled for one frame. To the user, every swipe still moves exactly one
 * page and the loop has no visible beginning or end.
 */

const DIRECTION_LOCK_THRESHOLD = 12;
const SWIPE_COMMIT_THRESHOLD = 70;
const HORIZONTAL_DOMINANCE_RATIO = 1.4;

type GestureAxis = "undecided" | "horizontal" | "vertical";

export default function PagerContainer() {
  const totalPanels = 4;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [slideOffset, setSlideOffset] = useState<-1 | 0 | 1>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [suppressTransition, setSuppressTransition] = useState(false);
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const wrapPanelIndex = useCallback(
    (index: number) => (index + totalPanels) % totalPanels,
    [totalPanels]
  );

  // Keep the active panel in slot 1. Slot 0 is its real previous neighbor and
  // slots 2–3 are its real next neighbors. These are the same four components,
  // simply reordered after each swipe — there are no clones.
  const panelOrder = [
    wrapPanelIndex(currentIndex - 1),
    currentIndex,
    wrapPanelIndex(currentIndex + 1),
    wrapPanelIndex(currentIndex + 2),
  ];

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
            pwaFreeReadingUsed: status.pwaFreeReadingUsed === true,
          });
        }
      })
      .catch(() => {});
  }, []);

  const goToNext = useCallback(() => {
    setSlideOffset((prev) => (prev === 0 ? 1 : prev));
  }, []);

  const goToPrevious = useCallback(() => {
    setSlideOffset((prev) => (prev === 0 ? -1 : prev));
  }, []);

  // ── Circular handoff after each transition ──────────────────────────
  const handleTrackTransitionEnd = useCallback((event: React.TransitionEvent<HTMLDivElement>) => {
    // Ignore transitionend events bubbling up from animated children. Only the
    // pager track's own transform transition completes a page swipe.
    if (event.target !== event.currentTarget || event.propertyName !== "transform") return;
    if (slideOffset === 0) return;

    const completedDirection = slideOffset;
    setSuppressTransition(true);
    setCurrentIndex((prev) => wrapPanelIndex(prev + completedDirection));
    setSlideOffset(0);
  }, [slideOffset, wrapPanelIndex]);

  useEffect(() => {
    if (!suppressTransition) return;
    const raf = requestAnimationFrame(() => setSuppressTransition(false));
    return () => cancelAnimationFrame(raf);
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

  // Keep every panel locked to the pager viewport. `overflow-y-auto` by itself
  // can make overflow-x compute to `auto` on mobile browsers, which allows a
  // wide child to create a sideways scroll position inside a panel.
  const panelClass =
    "h-full w-full min-w-full max-w-full min-w-0 flex-shrink-0 overflow-y-auto overflow-x-hidden overscroll-x-none";

  // Mobile browsers can restore a horizontal scroll offset when returning to a
  // page. The pager itself is transform-driven, so document/panel scrollLeft
  // should always be zero. This does not touch the pager transform animation.
  useEffect(() => {
    const normalizeHorizontalPosition = () => {
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
      if (containerRef.current) containerRef.current.scrollLeft = 0;
      containerRef.current
        ?.querySelectorAll<HTMLElement>("[data-pager-panel]")
        .forEach((panel) => {
          panel.scrollLeft = 0;
        });
    };

    normalizeHorizontalPosition();
    window.addEventListener("pageshow", normalizeHorizontalPosition);
    return () => window.removeEventListener("pageshow", normalizeHorizontalPosition);
  }, []);

  return (
    <div className="relative h-dvh w-full min-w-0 max-w-full overflow-hidden bg-[#040611]" ref={containerRef}>
      <div
        className="h-full w-full min-w-0 max-w-full overflow-hidden touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="flex h-full w-full min-w-0 max-w-full"
          onTransitionEnd={handleTrackTransitionEnd}
          style={{
            transform: `translateX(-${(1 + slideOffset) * 100}%)`,
            transition: noAnimation
              ? "none"
              : "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
            cursor: isDragging ? "grabbing" : "grab",
            height: "100%",
          }}
        >
          {panelOrder.map((panelIndex) => (
            <div key={panelIndex} data-pager-panel className={panelClass}>
              {panelIndex === 0 && (
                <ReadingIntakeScreen userStatus={userStatus} onSwipeLeft={goToNext} />
              )}
              {panelIndex === 1 && <BirthChartPanel userStatus={userStatus} />}
              {panelIndex === 2 && <TodaySkyPanel userStatus={userStatus} />}
              {panelIndex === 3 && <CreditsPanel embedded />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}