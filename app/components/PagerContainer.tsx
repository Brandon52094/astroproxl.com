"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import ReadingIntakeScreen from "./ReadingIntakeScreen";
import DailyPanel from "./DailyPanel";
import TodaySkyPanel from "./TodaySkyPanel";
import CreditsPanel from "./CreditsPanel";
import StarfieldBackground from "./StarfieldBackground";
import { migrateChartV2 } from "@/lib/chartStore";

// ── Shared with ReadingIntakeScreen ───────────────────────────────────────────
interface UserStatus {
  credits: number;
  jxlCredits: number;

  isSubscribed: boolean;

  effectiveMembershipPlan:
    | "plus"
    | "plus_xl"
    | null;

  membershipJxlUsed: number;

  membershipEntitlements: {
    readingsPerMonth: number | null;
    jxlPerMonth: number | null;

    voiceReading: boolean;
    addContext: boolean;
    extendedSavedReading: boolean;
    customThemes: boolean;
    commissionAccess: boolean;
  } | null;

  readingsCompleted: number;
  onCooldown: boolean;
  cooldownExpiresAt: string | null;
  canBypass: boolean;
  pwaFreeReadingUsed?: boolean;
}

function normalizeUserStatus(data: any): UserStatus {
  return {
    credits: Number(data?.credits ?? 0),
    jxlCredits: Number(data?.jxlCredits ?? 0),

    isSubscribed: data?.isSubscribed === true,

    effectiveMembershipPlan:
      data?.effectiveMembershipPlan === "plus" ||
      data?.effectiveMembershipPlan === "plus_xl"
        ? data.effectiveMembershipPlan
        : null,

    membershipJxlUsed:
      Number(data?.membershipJxlUsed ?? 0),

    membershipEntitlements:
      data?.membershipEntitlements ?? null,

    readingsCompleted:
      Number(data?.readingsCompleted ?? 0),

    onCooldown:
      data?.onCooldown === true,

    cooldownExpiresAt:
      data?.cooldownExpiresAt ?? null,

    canBypass:
      data?.canBypass === true,

    pwaFreeReadingUsed:
      data?.pwaFreeReadingUsed === true,
  };
}

/**
 * PAGER — four real panels in a circular loop:
 *
 *   Reading Intake ⇄ Your Day ⇄ Today's Sky ⇄ Credits ⇄ Reading Intake
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

type CreditsIntent = "voice" | "context" | null;

// Panel positions in the loop. Credits must stay last so it remains the
// previous neighbor of Reading Intake (openCreditsFor swipes back to it).
const PANEL = {
  intake: 0,
  daily: 1,
  todaySky: 2,
  credits: 3,
} as const;

export default function PagerContainer() {
  const totalPanels = 4;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [slideOffset, setSlideOffset] = useState<-1 | 0 | 1>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [suppressTransition, setSuppressTransition] = useState(false);
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);

  // When a locked feature is triggered from Reading Intake, we remember
  // what the user was trying to buy, then hand it to CreditsPanel so the
  // correct item can visibly add itself after the panel is on screen.
  const [creditsIntent, setCreditsIntent] =
    useState<CreditsIntent>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const slideOffsetRef = useRef<-1 | 0 | 1>(0);
  const handoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handoffLockedRef = useRef(false);

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
        setUserStatus(normalizeUserStatus(data));
      } catch {
        // silent
      }
    };

    fetchStatus();
  }, []);

  // ── Welcome reading grant ────────────────────────────────────────────────────
  // Every AstroProXL user gets ONE free regular Reading credit, once ever.
  // The server guards duplicate claims, so this is safe to fire on every load.
  useEffect(() => {
    fetch("/api/user/claim-welcome-reading", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d.granted) {
          console.log("[welcome] free reading credit granted");

          // Refetch user status so the new credit appears immediately.
          return fetch("/api/user/credits").then((r) => r.json());
        }
      })
      .then((status) => {
        if (status) {
          setUserStatus(normalizeUserStatus(status));
        }
      })
      .catch(() => {});
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
          setUserStatus(normalizeUserStatus(status));
        }
      })
      .catch(() => {});
  }, []);

  // Finish a swipe exactly once. Mobile browsers can occasionally miss a
  // transform transitionend while the four keyed panels are being reordered,
  // so every swipe also gets a small timeout fallback. This keeps the circular
  // pager from ever getting stranded with slideOffset stuck at -1 or 1.
  const completeSlide = useCallback(() => {
    const completedDirection = slideOffsetRef.current;
    if (completedDirection === 0 || handoffLockedRef.current) return;
    handoffLockedRef.current = true;

    if (handoffTimerRef.current) {
      clearTimeout(handoffTimerRef.current);
      handoffTimerRef.current = null;
    }

    setSuppressTransition(true);
    setCurrentIndex((prev) => wrapPanelIndex(prev + completedDirection));
    slideOffsetRef.current = 0;
    setSlideOffset(0);
  }, [wrapPanelIndex]);

  const startSlide = useCallback((direction: -1 | 1) => {
    if (slideOffsetRef.current !== 0 || handoffLockedRef.current) return;
    slideOffsetRef.current = direction;
    setSlideOffset(direction);
    // The CSS transition is 500ms. This is only a backstop if transitionend
    // does not arrive; the normal path still completes from transitionend.
    handoffTimerRef.current = setTimeout(() => {
      completeSlide();
    }, 560);
  }, [completeSlide]);

  const goToNext = useCallback(() => startSlide(1), [startSlide]);
  const goToPrevious = useCallback(() => startSlide(-1), [startSlide]);

  // ── Locked feature → Credits handoff ────────────────────────────────
  // Reading Intake tells us WHAT the user wanted. We store that intent,
  // then move to the Credits panel. CreditsPanel consumes the intent and
  // plays a short delayed add-to-cart animation once it's on screen.
  const openCreditsFor = useCallback(
    (intent: "voice" | "context") => {
      setCreditsIntent(intent);
      goToPrevious();
    },
    [goToPrevious]
  );

  // Once the user has actually left the Credits panel (or swiped back to
  // Intake and then somewhere else), clear the stored intent so it only
  // fires once per locked-feature tap.
  useEffect(() => {
    if (creditsIntent === null) return;
    if (currentIndex !== PANEL.credits) return;

    // We're on Credits now. Leave the intent in place so CreditsPanel can
    // apply it; CreditsPanel guards against re-applying it internally.
    // Clear it after a beat so the next visit to Credits starts neutral.
    const timer = window.setTimeout(() => {
      setCreditsIntent(null);
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [creditsIntent, currentIndex]);

  // ── Circular handoff after each transition ──────────────────────────
  const handleTrackTransitionEnd = useCallback((event: React.TransitionEvent<HTMLDivElement>) => {
    // Ignore transitionend events bubbling up from animated children. Only the
    // pager track's own transform transition completes a page swipe.
    if (event.target !== event.currentTarget || event.propertyName !== "transform") return;
    completeSlide();
  }, [completeSlide]);

  useEffect(() => {
    if (!suppressTransition) return;

    // Two frames guarantees the no-transition snap back to the center slot is
    // actually painted before transitions are re-enabled. One frame can be
    // coalesced on Safari/Chrome during a keyed DOM reorder.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        handoffLockedRef.current = false;
        setSuppressTransition(false);
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [suppressTransition]);

  useEffect(() => () => {
    if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
  }, []);

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
    "pager-panel relative h-full min-h-0 w-full min-w-full max-w-full flex-shrink-0 overflow-y-auto overflow-x-hidden overscroll-x-none bg-transparent";

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

  // Sizing note: the pager is an in-flow block (like the Preparing screen), not
  // position: fixed, and is never measured in JS. On iOS, fixed elements in an
  // installed PWA (black-translucent status bar, iOS 26) can stop short of the
  // bottom edge, which showed up as a dark bar. Height comes from CSS only:
  // 100vh when installed (the full screen), 100dvh in the browser so panel
  // content isn't hidden behind Safari's toolbar.

  return (
    <div
      className="pager-root w-full min-w-0 max-w-full overflow-hidden text-slate-100"
      ref={containerRef}
      style={{
        background: "linear-gradient(180deg, #061120 0%, #050816 44%, #040611 100%)",
        boxSizing: "border-box",
        overscrollBehavior: "none",
      }}
    >
      <style jsx>{`
        .pager-root {
          position: relative;
          height: 100dvh;
        }
        @media (display-mode: standalone) {
          .pager-root {
            height: 100vh;
          }
        }
        .pager-panel {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .pager-panel::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }

        /* Nebula: three soft clouds that drift and breathe very slowly. */
        .sky-cloud {
          position: absolute;
          border-radius: 50%;
          will-change: transform, opacity;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
          animation-direction: alternate;
        }
        .sky-cloud-violet {
          width: 95vmax; height: 70vmax; left: -35vmax; top: -22vmax;
          background: radial-gradient(closest-side, rgba(110,60,210,0.15), rgba(91,33,182,0.05) 55%, transparent);
          animation-name: skyDriftViolet; animation-duration: 110s;
        }
        .sky-cloud-blue {
          width: 85vmax; height: 62vmax; right: -38vmax; top: 28%;
          background: radial-gradient(closest-side, rgba(37,99,235,0.12), rgba(30,64,175,0.04) 55%, transparent);
          animation-name: skyDriftBlue; animation-duration: 130s;
        }
        .sky-cloud-teal {
          width: 80vmax; height: 55vmax; left: 0; bottom: -28vmax;
          background: radial-gradient(closest-side, rgba(13,148,136,0.09), rgba(20,120,110,0.03) 55%, transparent);
          animation-name: skyDriftTeal; animation-duration: 150s;
        }
        @keyframes skyDriftViolet { from { transform: translate3d(0,0,0) scale(1); opacity: .8; } to { transform: translate3d(8%,6%,0) scale(1.12); opacity: 1; } }
        @keyframes skyDriftBlue { from { transform: translate3d(0,0,0) scale(1.05); opacity: 1; } to { transform: translate3d(-9%,-5%,0) scale(.95); opacity: .7; } }
        @keyframes skyDriftTeal { from { transform: translate3d(0,0,0) scale(1); opacity: .7; } to { transform: translate3d(6%,-7%,0) scale(1.1); opacity: 1; } }

        /* Aurora (Ask Anything): the intake sets <html data-astro-voice="on|holding"> while
           someone is asking aloud. Soft drifting bands (from the original JXL panel) fade in
           above the nebula and below the stars, a little richer while the button is held. */
        .sky-aurora {
          position: absolute;
          inset: -30%;
          opacity: 0;
          transition: opacity 0.9s cubic-bezier(0.4, 0, 0.2, 1);
        }
        :global(html[data-astro-voice]) .sky-aurora { opacity: 0.9; }
        .aurora-band {
          position: absolute;
          width: 80%;
          height: 55%;
          border-radius: 50%;
          mix-blend-mode: screen;
          will-change: transform, opacity;
          transition: filter 1.2s ease;
        }
        :global(html[data-astro-voice="holding"]) .aurora-band { filter: saturate(1.4); }
        .aurora-band-a { top: 2%; left: -10%; background: radial-gradient(closest-side, rgba(45,212,191,0.30) 0%, rgba(45,212,191,0.14) 42%, rgba(45,212,191,0) 72%); animation: auroraDriftA 48s ease-in-out infinite; }
        .aurora-band-b { top: 12%; left: 22%; background: radial-gradient(closest-side, rgba(129,90,240,0.28) 0%, rgba(129,90,240,0.12) 44%, rgba(129,90,240,0) 74%); animation: auroraDriftB 62s ease-in-out infinite; }
        .aurora-band-c { top: -4%; left: 8%; background: radial-gradient(closest-side, rgba(56,132,255,0.22) 0%, rgba(56,132,255,0.10) 46%, rgba(56,132,255,0) 74%); animation: auroraDriftC 55s ease-in-out infinite; }
        .aurora-band-d { top: 26%; left: -4%; height: 42%; background: radial-gradient(closest-side, rgba(251,191,36,0.10) 0%, rgba(251,191,36,0.04) 44%, rgba(251,191,36,0) 72%); animation: auroraDriftD 74s ease-in-out infinite; }
        @keyframes auroraDriftA { 0%,100% { transform: translate3d(-4%,0,0) scale(1); opacity: .85; } 50% { transform: translate3d(14%,4%,0) scale(1.18); opacity: 1; } }
        @keyframes auroraDriftB { 0%,100% { transform: translate3d(6%,2%,0) scale(1.1); opacity: .7; } 50% { transform: translate3d(-12%,-3%,0) scale(1); opacity: .95; } }
        @keyframes auroraDriftC { 0%,100% { transform: translate3d(8%,-2%,0) scale(1); opacity: .6; } 50% { transform: translate3d(-6%,5%,0) scale(1.22); opacity: .9; } }
        @keyframes auroraDriftD { 0%,100% { transform: translate3d(0,3%,0) scale(1.05); opacity: .5; } 50% { transform: translate3d(10%,-4%,0) scale(1.15); opacity: .8; } }

        /* Focus darkness: the intake screen sets <html data-astro-focus="hold"> for a
           press-and-hold. This layer sits above the nebula but BELOW the stars, so the
           sky goes black while the stars keep shining. One continuous 3s fade (the intake's
           HOLD_TOTAL_MS) instead of three steps; releasing early eases back in 0.7s. */
        .sky-dim {
          position: absolute;
          inset: 0;
          background: #000;
          opacity: 0;
          transition: opacity 0.7s cubic-bezier(0.4, 0, 0.2, 1);
        }
        :global(html[data-astro-focus="hold"]) .sky-dim {
          opacity: 1;
          transition: opacity 3s cubic-bezier(0.37, 0, 0.63, 1);
        }

        @media (prefers-reduced-motion: reduce) {
          .sky-cloud,
          .aurora-band { animation: none; }
        }
      `}</style>

      {/* Persistent AstroProXL sky: this never enters the translating pager track. */}
      <div
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        aria-hidden="true"
      >
        <span className="sky-cloud sky-cloud-violet" />
        <span className="sky-cloud sky-cloud-blue" />
        <span className="sky-cloud sky-cloud-teal" />
        {/* Aurora: fades in while someone is asking aloud. */}
        <div className="sky-aurora">
          <span className="aurora-band aurora-band-a" />
          <span className="aurora-band aurora-band-b" />
          <span className="aurora-band aurora-band-c" />
          <span className="aurora-band aurora-band-d" />
        </div>
        {/* Darkens everything above except the stars during a press-and-hold. */}
        <div className="sky-dim" />
        <StarfieldBackground />
      </div>

    {/* APP / PAGER CONTENT */}
    <div
      className="relative z-10 h-full w-full min-w-0 max-w-full overflow-hidden touch-pan-y"
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
          <div
            key={panelIndex}
            data-pager-panel
            className={panelClass}
          >
            {panelIndex === PANEL.intake && (
              <ReadingIntakeScreen
                userStatus={userStatus}
                onSwipeLeft={goToNext}
                onOpenCredits={openCreditsFor}
              />
            )}

            {panelIndex === PANEL.daily && (
              <DailyPanel
                userStatus={userStatus}
                isActive={currentIndex === PANEL.daily && slideOffset === 0}
              />
            )}

            {panelIndex === PANEL.todaySky && (
              <TodaySkyPanel userStatus={userStatus} />
            )}

            {panelIndex === PANEL.credits && (
              <CreditsPanel
                embedded
                initialIntent={creditsIntent}
              />
            )}
          </div>
        ))}
      </div>
    </div>

    {/* Subtle glowing outline around the whole screen. */}

    {/*
<div
  className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
  aria-hidden="true"
>
  <StarfieldForeground />
</div>
*/}

</div>
);
}