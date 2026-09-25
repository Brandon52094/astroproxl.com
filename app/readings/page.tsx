"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Crown } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  deleteSavedReading,
  listSavedReadings,
  MAX_SAVED_READINGS,
  type SavedReadingRecord,
} from "@/lib/savedReadingsStore";

const FREE_SLOTS = 4;
const TOTAL_LIBRARY_SLOTS = 16;
const DELETE_THRESHOLD = -78;

function formatTopic(topic: string) {
  return topic.replace(/[_-]+/g, " ").trim() || "Reading";
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

export default function SavedReadingsPage() {
  const router = useRouter();
  const [readings, setReadings] = useState<SavedReadingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limitNotice, setLimitNotice] = useState(false);

  // Connect this to the same membership state your app already uses.
  // The first four slots remain free either way.
  const isSubscribed = false;

  const draggedReading = useRef<string | null>(null);

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

  useEffect(() => {
    setLimitNotice(
      new URLSearchParams(window.location.search).get("limit") === "1",
    );
    void refresh();
  }, [refresh]);

  const slots = useMemo(
    () =>
      Array.from(
        { length: Math.max(TOTAL_LIBRARY_SLOTS, MAX_SAVED_READINGS) },
        (_, index) => readings[index] ?? null,
      ),
    [readings],
  );

  const removeReading = async (id: string) => {
    try {
      await deleteSavedReading(id);
      await refresh();
      setLimitNotice(false);
    } catch {
      setError("That reading could not be removed. Please try again.");
    }
  };

  return (
    <main className="saved-readings-page">
      <header className="saved-header">
        <button
          type="button"
          className="header-control back"
          onClick={() => router.back()}
          aria-label="Go back"
        >
          <ChevronLeft aria-hidden="true" />
        </button>

        <h1>Your Readings</h1>

        <span className="header-spacer" aria-hidden="true" />
      </header>

      {limitNotice && (
        <p className="notice" role="status">
          All available spaces are filled. Remove one reading to save another.
        </p>
      )}

      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}

      <section className="reading-grid" aria-label="Saved readings">
        {slots.map((reading, index) => {
          const subscriberSlot = index >= FREE_SLOTS;
          const locked = subscriberSlot && !isSubscribed;

          if (locked) {
            return (
              <div
                className="premium-slot"
                key={`premium-${index}`}
                aria-label="Astro Plus saved reading space"
              >
                <Crown aria-hidden="true" />
                <span>Astro Plus</span>
              </div>
            );
          }

          if (!reading) {
            return (
              <div
                className="empty-slot"
                key={`empty-${index}`}
                aria-hidden="true"
              >
                <span />
              </div>
            );
          }

          return (
            <div className="reading-slot" key={reading.id}>
              <motion.button
                type="button"
                className="reading-tile"
                drag="y"
                dragConstraints={{ top: -120, bottom: 0 }}
                dragElastic={0.16}
                whileTap={{ scale: 0.97 }}
                whileDrag={{ scale: 1.035, opacity: 0.68 }}
                onDragStart={() => {
                  draggedReading.current = reading.id;
                }}
                onDragEnd={(_, info) => {
                  const shouldDelete = info.offset.y <= DELETE_THRESHOLD;
                  draggedReading.current = shouldDelete ? reading.id : null;

                  if (shouldDelete) {
                    void removeReading(reading.id);
                    window.setTimeout(() => {
                      draggedReading.current = null;
                    }, 250);
                  }
                }}
                onClick={(event) => {
                  if (draggedReading.current === reading.id) {
                    event.preventDefault();
                    return;
                  }

                  router.push(
                    `/reading/results?saved=${encodeURIComponent(reading.id)}`,
                  );
                }}
                aria-label={`Open ${formatTopic(reading.topic)} reading from ${formatSavedDate(reading.savedAt)}. Swipe up to remove.`}
              >
                <span className="tile-topic">{formatTopic(reading.topic)}</span>
                <span className="tile-date">{formatSavedDate(reading.savedAt)}</span>
              </motion.button>
            </div>
          );
        })}
      </section>

      {!loading && readings.length === 0 && !error && (
        <p className="empty-copy">Saved readings will appear among the stars.</p>
      )}

      <p className="gesture-hint">Hold + swipe up to remove a saved reading</p>

      <button
        type="button"
        className="return-button"
        onClick={() => router.back()}
        aria-label="Return"
      >
        Return
      </button>

      <style jsx>{`
        .saved-readings-page {
          min-height: 100dvh;
          overflow-x: hidden;
          background: #000;
          color: #f8fafc;
          padding: max(22px, env(safe-area-inset-top)) 20px
            calc(94px + env(safe-area-inset-bottom));
          font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
        }

        .saved-header {
          width: min(100%, 440px);
          height: 48px;
          margin: 0 auto 22px;
          display: grid;
          grid-template-columns: 54px 1fr 54px;
          align-items: center;
        }

        h1 {
          margin: 0;
          text-align: center;
          font-family: var(--font-display, Georgia, serif);
          font-size: 16px;
          font-weight: 500;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: rgba(241, 245, 249, 0.86);
        }

        .header-control {
          border: 0;
          background: transparent;
          color: rgba(226, 232, 240, 0.72);
          -webkit-tap-highlight-color: transparent;
        }

        .back {
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
          cursor: pointer;
        }

        .back :global(svg) {
          width: 22px;
          height: 22px;
        }

        .header-spacer {
          width: 44px;
          height: 44px;
          justify-self: end;
        }

        .notice {
          width: min(100%, 440px);
          margin: 0 auto 18px;
          color: #d8caaa;
          font-family: var(--font-display, Georgia, serif);
          font-size: 13px;
          line-height: 1.5;
          text-align: center;
        }

        .notice.error {
          color: #fda4af;
        }

        .reading-grid {
          width: min(100%, 440px);
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px clamp(10px, 3.4vw, 18px);
        }

        .reading-slot,
        .empty-slot,
        .premium-slot {
          position: relative;
          aspect-ratio: 0.9;
        }

        .reading-tile {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          border: 1px solid transparent;
          border-radius: clamp(18px, 5vw, 24px);
          background:
            linear-gradient(
                155deg,
                rgba(15, 17, 28, 0.98),
                rgba(3, 4, 10, 0.99)
              )
              padding-box,
            linear-gradient(
                135deg,
                #fff9ea 0%,
                #b9ab84 33%,
                #fbf7eb 58%,
                #8b7b59 100%
              )
              border-box;
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.04) inset,
            0 0 18px rgba(221, 203, 183, 0.1);
          color: #f8f4e9;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 7px;
          cursor: grab;
          touch-action: pan-x;
          user-select: none;
          -webkit-user-select: none;
          -webkit-tap-highlight-color: transparent;
        }

        .reading-tile:active {
          cursor: grabbing;
        }

        .reading-tile::before {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(
            circle at 28% 18%,
            rgba(255, 255, 255, 0.11),
            transparent 42%
          );
          pointer-events: none;
        }

        .tile-topic {
          position: relative;
          max-width: 100%;
          font-family: var(--font-display, Georgia, serif);
          font-size: clamp(10px, 2.8vw, 13px);
          line-height: 1.15;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          text-align: center;
          overflow-wrap: anywhere;
        }

        .tile-date {
          position: relative;
          color: rgba(215, 204, 177, 0.68);
          font-size: clamp(8px, 2.2vw, 10px);
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        .empty-slot {
          display: grid;
          place-items: center;
        }

        .empty-slot span {
          width: 5px;
          height: 5px;
          border-radius: 999px;
          background: #fff;
          box-shadow:
            0 0 5px rgba(255, 255, 255, 0.95),
            0 0 14px rgba(255, 255, 255, 0.54);
        }

        .empty-slot:nth-child(3n) span {
          width: 3px;
          height: 3px;
          opacity: 0.76;
        }

        .empty-slot:nth-child(4n) span {
          width: 6px;
          height: 6px;
          opacity: 0.88;
        }

        .premium-slot {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: clamp(18px, 5vw, 24px);
          background:
            radial-gradient(
              circle at 50% -20%,
              rgba(255, 255, 255, 0.07),
              transparent 58%
            ),
            rgba(255, 255, 255, 0.018);
          color: rgba(226, 232, 240, 0.34);
        }

        .premium-slot :global(svg) {
          width: 15px;
          height: 15px;
          stroke-width: 1.5;
          filter: drop-shadow(0 0 7px rgba(255, 255, 255, 0.12));
        }

        .premium-slot span {
          font-size: clamp(7px, 1.9vw, 9px);
          font-weight: 500;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .empty-copy {
          width: min(100%, 440px);
          margin: 36px auto 0;
          color: rgba(148, 163, 184, 0.52);
          font-family: var(--font-display, Georgia, serif);
          font-size: 13px;
          letter-spacing: 0.05em;
          text-align: center;
        }

        .gesture-hint {
          width: min(100%, 440px);
          margin: 28px auto 0;
          color: rgba(148, 163, 184, 0.28);
          font-size: 9px;
          letter-spacing: 0.12em;
          text-align: center;
          text-transform: uppercase;
        }

        .return-button {
          position: fixed;
          left: 50%;
          bottom: max(18px, env(safe-area-inset-bottom));
          transform: translateX(-50%);
          z-index: 20;
          min-width: 108px;
          height: 42px;
          padding: 0 18px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.035);
          color: rgba(226, 232, 240, 0.58);
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          transition:
            background 160ms ease,
            color 160ms ease,
            border-color 160ms ease,
            transform 160ms ease;
        }

        .return-button:hover {
          color: rgba(248, 250, 252, 0.82);
          border-color: rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.055);
        }

        .return-button:active {
          transform: translateX(-50%) scale(0.96);
        }

        @media (max-width: 350px) {
          .saved-readings-page {
            padding-inline: 14px;
          }

          .reading-grid {
            column-gap: 8px;
            row-gap: 14px;
          }

          .saved-header {
            margin-bottom: 18px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .return-button {
            transition: none;
          }
        }
      `}</style>
    </main>
  );
}
