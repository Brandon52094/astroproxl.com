"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crown,
  LockKeyhole,
  Pencil,
} from "lucide-react";
import { useRouter } from "next/navigation";

import {
  deleteSavedReading,
  listSavedReadings,
  MAX_SAVED_READINGS,
  type SavedReadingRecord,
} from "@/lib/savedReadingsStore";

const READINGS_PER_PAGE = 8;
const PAGE_COUNT = 3;
const FREE_SLOT_COUNT = 8;
const PLUS_SLOT_COUNT = 16;
const LONG_PRESS_MS = 550;

type ShareMode = "discount" | "commission";
type ReferralState = "loading" | "ready" | "error";

interface AccessSummary {
  credits?: number;
  jxlCredits?: number;
  replyCredits?: number;
  readingsCompleted?: number;

  membershipStatus?: string;
  isSubscribed?: boolean;

  membershipPlan?: "plus" | "plus_xl" | null;
  effectiveMembershipPlan?: "plus" | "plus_xl" | null;

  membershipReadingsUsed?: number;
  membershipJxlUsed?: number;

  membershipEntitlements?: {
    readingsPerMonth: number | null;
    jxlPerMonth: number | null;
  };
}

function formatTopic(topic: string) {
  return topic.replace(/[\_-]+/g, " ").trim() || "Reading";
}

function formatSavedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  }).format(date);
}

function getSavedReadingCapacity(access: AccessSummary | null) {
  const isSubscribed =
    access?.membershipStatus === "active" || access?.isSubscribed === true;

  if (!isSubscribed) return FREE_SLOT_COUNT;

  const plan =
    access?.effectiveMembershipPlan ?? access?.membershipPlan ?? null;

  if (plan === "plus_xl") return MAX_SAVED_READINGS;
  if (plan === "plus") return PLUS_SLOT_COUNT;

  // Fallback for legacy payloads that used subscriptionTier strings.
  const tier = (
    (access as AccessSummary & { subscriptionTier?: string | null })
      ?.subscriptionTier ?? ""
  ).toLowerCase();
  const isXl =
    tier.includes("plus_xl") ||
    tier.includes("plus-xl") ||
    tier.includes("astro_plus_xl") ||
    tier.includes("astro-plus-xl") ||
    tier.includes("proxl") ||
    tier.includes("xl");

  return isXl ? MAX_SAVED_READINGS : PLUS_SLOT_COUNT;
}

export default function SavedReadingsPage() {
  const router = useRouter();
  const [readings, setReadings] = useState<SavedReadingRecord[]>([]);
  const [access, setAccess] = useState<AccessSummary | null>(null);
  const [referralCode, setReferralCode] = useState("");
  const [referralState, setReferralState] = useState<ReferralState>("loading");
  const [currentPage, setCurrentPage] = useState(0);
  const [shareMode, setShareMode] = useState<ShareMode>("discount");
  const [selectedTheme, setSelectedTheme] = useState(0);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limitNotice, setLimitNotice] = useState(false);
  const [selectedReadingId, setSelectedReadingId] = useState<string | null>(null);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setReadings(await listSavedReadings());
      setError(null);
    } catch {
      setError("Your saved readings could not be opened on this device.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReferralCode = useCallback(async () => {
    setReferralState("loading");

    try {
      const response = await fetch("/api/user/referral-code", {
        cache: "no-store",
      });
      const data = response.ok
        ? ((await response.json()) as { code?: string })
        : null;
      const code = data?.code?.trim() ?? "";

      if (!code) throw new Error("Referral code unavailable");

      setReferralCode(code);
      setReferralState("ready");
    } catch {
      setReferralCode("");
      setReferralState("error");
    }
  }, []);

  useEffect(() => {
    setLimitNotice(
      new URLSearchParams(window.location.search).get("limit") === "1",
    );
    void refresh();

    void fetch("/api/user/credits", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: AccessSummary | null) => setAccess(data))
      .catch(() => setAccess(null));

    void loadReferralCode();
  }, [loadReferralCode, refresh]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  const capacity = getSavedReadingCapacity(access);
  const pageStart = currentPage * READINGS_PER_PAGE;
  const pageSlots = useMemo(
    () =>
      Array.from(
        { length: READINGS_PER_PAGE },
        (_, index) => readings[pageStart + index] ?? null,
      ),
    [pageStart, readings],
  );

  // ── Membership display values ─────────────────────────────────────────────

  const plan =
    access?.effectiveMembershipPlan ??
    access?.membershipPlan ??
    null;

  const isMember =
    access?.membershipStatus === "active" ||
    access?.isSubscribed === true;

  const readingAllowance =
    access?.membershipEntitlements?.readingsPerMonth ?? null;

  const jxlAllowance =
    access?.membershipEntitlements?.jxlPerMonth ?? null;

  const membershipReadingsUsed =
    Number(access?.membershipReadingsUsed ?? 0);

  const membershipJxlUsed =
    Number(access?.membershipJxlUsed ?? 0);

  const readingRemaining =
    readingAllowance === null
      ? null
      : Math.max(
          0,
          readingAllowance - membershipReadingsUsed,
        );

  const jxlRemaining =
    jxlAllowance === null
      ? null
      : Math.max(
          0,
          jxlAllowance - membershipJxlUsed,
        );

  const removeReading = async (id: string) => {
    try {
      await deleteSavedReading(id);
      setSelectedReadingId(null);
      await refresh();
      setLimitNotice(false);
    } catch {
      setError("That reading could not be removed. Please try again.");
    }
  };

  const clearLongPressTimer = () => {
    if (!longPressTimerRef.current) return;
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  const beginLongPress = (id: string) => {
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setSelectedReadingId(id);
    }, LONG_PRESS_MS);
  };

  const handleReadingClick = (reading: SavedReadingRecord) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }

    if (selectedReadingId) {
      setSelectedReadingId(null);
      return;
    }

    router.push(`/reading/results?saved=${encodeURIComponent(reading.id)}`);
  };

  const shareReferral = async () => {
    if (!referralCode || shareMode === "commission") return;

    const referralUrl = `${window.location.origin}/api/referral/capture?code=${encodeURIComponent(
      referralCode,
    )}`;

    const shareData = {
      title: "AstroProXL",
      text: "Use my ASTROSHARE link for 15% off your first eligible AstroProXL purchase.",
      url: referralUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(referralUrl);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Closing the native share sheet is not an error the page needs to surface.
    }
  };

  const setPage = (nextPage: number) => {
    setSelectedReadingId(null);
    setCurrentPage(Math.max(0, Math.min(PAGE_COUNT - 1, nextPage)));
  };

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <button type="button" className="back" onClick={() => router.back()} aria-label="Return to birth chart">
          <ChevronLeft aria-hidden="true" />
        </button>
        <h1>My Dashboard</h1>
        <span className="header-spacer" aria-hidden="true" />
      </header>

      <section className="dashboard-card" aria-label="Account overview">
        <div className="balance-block">
          <h2>{isMember && plan === "plus" ? "This Cycle" : "Balance"}</h2>
          <div className="balance-grid">
            <div>
              <strong>
                {isMember
                  ? readingAllowance === null
                    ? "∞"
                    : `${readingRemaining} / ${readingAllowance}`
                  : access?.credits ?? 0}
              </strong>
              <span>Readings</span>
            </div>
            <div>
              <strong>
                {isMember
                  ? jxlAllowance === null
                    ? "∞"
                    : `${jxlRemaining} / ${jxlAllowance}`
                  : access?.jxlCredits ?? 0}
              </strong>
              <span>JXL</span>
            </div>
            <div>
              <strong>{access?.replyCredits ?? 0}</strong>
              <span>Replies</span>
            </div>
          </div>
        </div>

        <div className="activity-grid">
          <div className="activity-stat">
            <span>Total Readings Completed</span>
            <strong>{access?.readingsCompleted ?? readings.length}</strong>
          </div>
          <div className="activity-stat">
            <span>Customized Placements</span>
            <strong>0 <small>/ 11</small></strong>
          </div>
        </div>

        <div className="share-area">
          <div className="share-heading-row">
            <h2>{shareMode === "discount" ? "Share a Discount" : "Earn a Commission"}</h2>
          </div>

          <button
            type="button"
            className="share-code"
            onClick={
              shareMode === "commission"
                ? undefined
                : referralState === "error"
                  ? () => void loadReferralCode()
                  : shareReferral
            }
            disabled={shareMode === "commission" || referralState === "loading"}
            aria-label={
              shareMode === "commission"
                ? "Commission access coming soon"
                : referralState === "error"
                  ? "Retry referral link"
                  : "Share referral link"
            }
          >
            {shareMode === "commission" ? (
              <><LockKeyhole aria-hidden="true" /><span>Coming Soon</span></>
            ) : (
              <>
                <span>
                  {referralState === "ready"
                    ? "ASTROSHARE"
                    : referralState === "error"
                      ? "Try Again"
                      : "Loading"}
                </span>
                {referralState === "ready" &&
                  (copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />)}
              </>
            )}
          </button>

          <div className="share-toggle-row">
            <span className={shareMode === "discount" ? "active" : ""}>Share</span>
            <button
              type="button"
              className={`mode-toggle ${shareMode === "commission" ? "on" : ""}`}
              onClick={() => setShareMode((mode) => mode === "discount" ? "commission" : "discount")}
              aria-label={shareMode === "discount" ? "Show earn commission" : "Show share discount"}
              aria-pressed={shareMode === "commission"}
            ><span /></button>
            <span className={shareMode === "commission" ? "active" : ""}>
              Earn
            </span>
          </div>
        </div>

        <button
          type="button"
          className="edit-chart"
          onClick={() => router.push("/chart-data?recalculate=true")}
        >
          <Pencil aria-hidden="true" /> Edit Chart
        </button>
      </section>

      <section className="theme-row" aria-label="Theme selection">
        <h2>Theme</h2>
        <div className="theme-swatches">
          {["Midnight", "Ember", "Forest"].map((theme, index) => (
            <button
              type="button"
              key={theme}
              className={`theme-swatch ${selectedTheme === index ? "active" : ""}`}
              onClick={() => setSelectedTheme(index)}
              aria-label={`${theme} theme${index > 0 ? " preview" : ""}`}
              aria-pressed={selectedTheme === index}
            />
          ))}
        </div>
      </section>

      {(limitNotice || error) && (
        <p className={`notice ${error ? "error" : ""}`} role={error ? "alert" : "status"}>
          {error ?? `All ${capacity} available spaces are filled. Remove one reading to save another.`}
        </p>
      )}

      <section className="readings-section" aria-label="Saved readings">
        <div className="readings-title-row">
          <span aria-hidden="true" />
          <h2>My Readings</h2>
          {currentPage > 0 ? <Crown className="page-crown" aria-label="Astro Plus spaces" /> : <span />}
        </div>

        <div className="reading-grid">
          {pageSlots.map((reading, index) => {
            const globalIndex = pageStart + index;
            const isLocked = globalIndex >= capacity && !reading;

            if (reading) {
              const isSelected = selectedReadingId === reading.id;
              return (
                <div className="reading-slot" key={reading.id}>
                  <button
                    type="button"
                    className={`reading-tile ${isSelected ? "selected" : ""}`}
                    onPointerDown={() => beginLongPress(reading.id)}
                    onPointerUp={clearLongPressTimer}
                    onPointerCancel={clearLongPressTimer}
                    onPointerLeave={clearLongPressTimer}
                    onClick={() => handleReadingClick(reading)}
                    aria-pressed={isSelected}
                    aria-label={isSelected ? `${formatTopic(reading.topic)} selected for deletion` : `Open ${formatTopic(reading.topic)} reading from ${formatSavedDate(reading.savedAt)}`}
                  >
                    <span className="tile-topic">{formatTopic(reading.topic)}</span>
                    <span className="tile-date">{formatSavedDate(reading.savedAt)}</span>
                  </button>
                </div>
              );
            }

            return (
              <div className={`empty-slot ${isLocked ? "locked" : "available"}`} key={`empty-${globalIndex}`} aria-label={isLocked ? "Membership saved reading space" : "Available saved reading space"}>
                <span />
              </div>
            );
          })}
        </div>

        {!loading && readings.length === 0 && !error && currentPage === 0 && (
          <p className="empty-copy">Saved readings will appear among the stars.</p>
        )}

        <nav className="page-navigation" aria-label="Reading pages">
          <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0} aria-label="Previous readings page">
            <ChevronLeft aria-hidden="true" />
          </button>

          {selectedReadingId ? (
            <button type="button" className="delete" onClick={() => void removeReading(selectedReadingId)}>Delete</button>
          ) : (
            <span>{currentPage + 1} / {PAGE_COUNT}</span>
          )}

          <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage === PAGE_COUNT - 1} aria-label="Next readings page">
            <ChevronRight aria-hidden="true" />
          </button>
        </nav>
      </section>

      <style jsx>{`
        * { box-sizing: border-box; }
        .dashboard-page {
          height: 100svh;
          height: 100dvh;
          overflow: hidden;
          padding: max(14px, env(safe-area-inset-top)) 18px max(10px, env(safe-area-inset-bottom));
          background: #000;
          color: #f8fafc;
          font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
          display: grid;
          grid-template-rows: 42px minmax(286px, 42vh) 50px minmax(0, 1fr);
          gap: 8px;
        }
        .dashboard-header, .dashboard-card, .theme-row, .readings-section, .notice {
          width: min(100%, 440px);
          margin-inline: auto;
        }
        .dashboard-header { display: grid; grid-template-columns: 46px 1fr 46px; align-items: center; }
        h1, h2 { margin: 0; font-family: var(--font-display, Georgia, serif); font-weight: 500; text-transform: uppercase; }
        h1 { text-align: center; font-size: 15px; letter-spacing: .22em; color: rgba(241,245,249,.9); }
        .back { width: 42px; height: 42px; display: grid; place-items: center; border: 0; background: transparent; color: rgba(226,232,240,.72); }
        .back :global(svg) { width: 21px; }
        .dashboard-card {
          position: relative;
          min-height: 0;
          overflow: hidden;
          border: 1px solid rgba(148,163,184,.18);
          border-radius: 28px;
          padding: 17px 18px 14px;
          background: linear-gradient(145deg, rgba(17,24,39,.78), rgba(3,5,12,.94));
          box-shadow: inset 0 1px rgba(255,255,255,.025), 0 20px 50px rgba(0,0,0,.35);
        }
        .balance-block { padding-bottom: 14px; border-bottom: 1px solid rgba(148,163,184,.14); }
        .balance-block h2, .share-area h2 { text-align: center; font-size: 11px; letter-spacing: .2em; color: rgba(174,190,216,.72); }
        .balance-grid { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 8px; }
        .balance-grid div { display: grid; place-items: center; gap: 2px; border-right: 1px solid rgba(148,163,184,.12); }
        .balance-grid div:last-child { border-right: 0; }
        .balance-grid strong { font-family: var(--font-display, Georgia, serif); font-size: 22px; font-weight: 400; }
        .balance-grid span { font-size: 8px; letter-spacing: .18em; text-transform: uppercase; color: rgba(148,163,184,.58); }
        .activity-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
        .activity-stat { text-align: center; }
        .activity-stat span { display: block; min-height: 13px; font-family: var(--font-display, Georgia, serif); font-size: 8px; letter-spacing: .12em; text-transform: uppercase; color: rgba(174,190,216,.66); }
        .activity-stat strong { display: inline-block; min-width: 46px; padding: 2px 7px 4px; border-bottom: 1px solid rgba(226,232,240,.32); font-family: var(--font-display, Georgia, serif); font-size: 19px; font-weight: 400; }
        .activity-stat small { font-size: 11px; color: rgba(148,163,184,.58); }
        .share-area { margin-top: 15px; display: grid; justify-items: center; gap: 8px; }
        .share-heading-row { width: 100%; min-height: 16px; display: grid; place-items: center; }
        .share-code { width: 154px; height: 52px; padding: 0 14px; display: flex; justify-content: center; align-items: center; gap: 9px; border: 1px solid rgba(220,205,165,.46); border-radius: 17px; background: rgba(8,9,15,.74); color: #efe7d4; font-family: var(--font-display, Georgia, serif); font-size: 12px; letter-spacing: .11em; text-transform: uppercase; box-shadow: 0 0 18px rgba(202,178,115,.08); }
        .share-code:disabled { border-color: rgba(148,163,184,.18); color: rgba(148,163,184,.5); box-shadow: none; }
        .share-code :global(svg) { width: 15px; height: 15px; }
        .share-toggle-row { width: 174px; display: grid; grid-template-columns: 54px 42px 54px; align-items: center; justify-content: center; gap: 8px; color: rgba(148,163,184,.42); font-size: 8px; letter-spacing: .12em; text-transform: uppercase; }
        .share-toggle-row > span { display: inline-flex; align-items: center; justify-content: center; }
        .share-toggle-row .active { color: rgba(226,232,240,.78); }
        .mode-toggle { width: 42px; height: 22px; padding: 2px; border: 1px solid rgba(148,163,184,.24); border-radius: 999px; background: rgba(15,23,42,.86); }
        .mode-toggle span { display: block; width: 16px; height: 16px; border-radius: 50%; background: rgba(226,232,240,.78); transition: transform 180ms ease; }
        .mode-toggle.on span { transform: translateX(19px); background: #d9c795; }
        .edit-chart { position: absolute; right: 16px; bottom: 11px; display: flex; align-items: center; gap: 6px; border: 0; background: transparent; color: rgba(174,190,216,.62); font-family: var(--font-display, Georgia, serif); font-size: 9px; letter-spacing: .16em; text-transform: uppercase; }
        .edit-chart :global(svg) { width: 12px; height: 12px; }
        .theme-row { display: grid; justify-items: center; align-content: center; gap: 6px; }
        .theme-row h2 { font-size: 10px; letter-spacing: .2em; color: rgba(174,190,216,.62); }
        .theme-swatches { display: flex; justify-content: center; gap: 12px; }
        .theme-swatch { width: 19px; height: 19px; border: 1px solid rgba(226,232,240,.3); border-radius: 5px; background: linear-gradient(145deg, #16213a, #070b15); }
        .theme-swatch:nth-child(2) { background: linear-gradient(145deg, #252025, #0b090d); }
        .theme-swatch:nth-child(3) { background: linear-gradient(145deg, #172520, #080e0b); }
        .theme-swatch.active { border-color: rgba(255,255,255,.72); box-shadow: 0 0 10px rgba(200,219,255,.24); }
        .theme-swatch:not(.active) { opacity: .48; }
        .theme-swatch:active { transform: scale(.92); }
        .notice { position: fixed; z-index: 20; left: 50%; top: max(58px, calc(env(safe-area-inset-top) + 48px)); transform: translateX(-50%); padding: 9px 16px; border-radius: 999px; background: rgba(12,14,22,.94); color: #d8caaa; font-size: 11px; text-align: center; }
        .notice.error { color: #fda4af; }
        .readings-section { min-height: 0; display: grid; grid-template-rows: 30px minmax(0, 1fr) auto 32px; gap: 5px; }
        .readings-title-row { display: grid; grid-template-columns: 28px 1fr 28px; align-items: center; border-top: 1px solid rgba(148,163,184,.12); border-bottom: 1px solid rgba(148,163,184,.12); }
        .readings-title-row h2 { text-align: center; font-size: 13px; letter-spacing: .22em; color: rgba(241,245,249,.84); }
        .page-crown { width: 16px; height: 16px; justify-self: center; color: #d9c795; filter: drop-shadow(0 0 7px rgba(221,199,143,.22)); }
        .reading-grid { min-height: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); gap: clamp(7px, 2vw, 11px); }
        .reading-slot, .empty-slot { position: relative; min-height: 0; }
        .reading-tile { width: 100%; height: 100%; min-height: 64px; overflow: hidden; padding: 6px 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; border: 1px solid transparent; border-radius: clamp(15px, 4vw, 21px); background: linear-gradient(155deg, rgba(15,17,28,.98), rgba(3,4,10,.99)) padding-box, linear-gradient(135deg, #fff9ea, #b9ab84 38%, #fbf7eb 62%, #8b7b59) border-box; color: #f8f4e9; box-shadow: inset 0 0 0 1px rgba(255,255,255,.035), 0 0 14px rgba(221,203,183,.08); transition: transform 160ms ease, filter 180ms ease; }
        .reading-tile:active { transform: scale(.96); }
        .reading-tile.selected { filter: grayscale(.8); background: linear-gradient(155deg, #4b4d54, #202127) padding-box, linear-gradient(135deg, #eee, #888) border-box; }
        .tile-topic { max-width: 100%; font-family: var(--font-display, Georgia, serif); font-size: clamp(8px, 2.35vw, 11px); line-height: 1.15; letter-spacing: .07em; text-align: center; text-transform: uppercase; overflow-wrap: anywhere; }
        .tile-date { color: rgba(215,204,177,.68); font-size: clamp(7px, 1.9vw, 9px); letter-spacing: .05em; text-transform: uppercase; }
        .empty-slot { display: grid; place-items: center; }
        .empty-slot span { width: 5px; height: 5px; border-radius: 50%; background: #fff; box-shadow: 0 0 5px #fff, 0 0 13px rgba(255,255,255,.62); }
        .empty-slot.locked span { width: 4px; height: 4px; opacity: .32; box-shadow: 0 0 6px rgba(255,255,255,.34); }
        .empty-copy { margin: 0; color: rgba(148,163,184,.48); font-family: var(--font-display, Georgia, serif); font-size: 10px; letter-spacing: .05em; text-align: center; }
        .page-navigation { display: grid; grid-template-columns: 54px 1fr 54px; align-items: center; justify-items: center; }
        .page-navigation button { width: 42px; height: 30px; display: grid; place-items: center; border: 0; background: transparent; color: rgba(226,232,240,.68); }
        .page-navigation button:disabled { opacity: 0; pointer-events: none; }
        .page-navigation :global(svg) { width: 21px; height: 21px; }
        .page-navigation > span { color: rgba(148,163,184,.52); font-size: 9px; letter-spacing: .15em; }
        .page-navigation .delete { width: auto; padding-inline: 14px; color: #fecaca; font-size: 9px; letter-spacing: .16em; text-transform: uppercase; }
        @media (max-height: 740px) {
          .dashboard-page { grid-template-rows: 38px minmax(270px, 40vh) 42px minmax(0, 1fr); gap: 5px; padding-top: max(8px, env(safe-area-inset-top)); }
          .dashboard-card { padding-top: 10px; }
          .balance-grid { margin-top: 5px; }
          .balance-block { padding-bottom: 9px; }
          .activity-grid { margin-top: 10px; }
          .share-area { margin-top: 9px; gap: 5px; }
          .share-code { height: 44px; }
        }
        @media (max-width: 350px) {
          .dashboard-page { padding-inline: 13px; }
          .dashboard-card { padding-inline: 13px; }
          .activity-stat span { font-size: 7px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .reading-tile, .mode-toggle span { transition: none; }
        }
      `}</style>
    </main>
  );
}