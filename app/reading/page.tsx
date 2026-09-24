"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  deleteSavedReading,
  listSavedReadings,
  MAX_SAVED_READINGS,
  type SavedReadingRecord,
} from "@/lib/savedReadingsStore";
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
  const [managing, setManaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitNotice, setLimitNotice] = useState(false);
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
    setLimitNotice(new URLSearchParams(window.location.search).get("limit") === "1");
    void refresh();
  }, [refresh]);
  const slots = useMemo(
    () => Array.from({ length: MAX_SAVED_READINGS }, (_, index) => readings[index] ?? null),
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
        <button type="button" className="header-control back" onClick={() => router.back()} aria-label="Go back">
          <ChevronLeft aria-hidden="true" />
        </button>
        <h1>Your Readings</h1>
        <button
          type="button"
          className="header-control manage"
          onClick={() => setManaging((current) => !current)}
          disabled={readings.length === 0}
        >
          {managing ? "Done" : "Edit"}
        </button>
      </header>
      {limitNotice && (
        <p className="notice" role="status">
          All {MAX_SAVED_READINGS} spaces are filled. Remove one reading to save another.
        </p>
      )}
      {error && <p className="notice error" role="alert">{error}</p>}
      <section className="reading-grid" aria-label="Saved readings">
        {slots.map((reading, index) =>
          reading ? (
            <div className="reading-slot" key={reading.id}>
              <button
                type="button"
                className="reading-tile"
                onClick={() => router.push(`/reading/results?saved=${encodeURIComponent(reading.id)}`)}
                aria-label={`Open ${formatTopic(reading.topic)} reading from ${formatSavedDate(reading.savedAt)}`}
              >
                <span className="tile-topic">{formatTopic(reading.topic)}</span>
                <span className="tile-date">{formatSavedDate(reading.savedAt)}</span>
              </button>
              {managing && (
                <button
                  type="button"
                  className="delete-reading"
                  onClick={() => void removeReading(reading.id)}
                  aria-label={`Delete ${formatTopic(reading.topic)} reading`}
                >
                  <X aria-hidden="true" />
                </button>
              )}
            </div>
          ) : (
            <div className="empty-slot" key={`empty-${index}`} aria-hidden="true">
              <span />
            </div>
          ),
        )}
      </section>
      {!loading && readings.length === 0 && !error && (
        <p className="empty-copy">Saved readings will appear among the stars.</p>
      )}
      <style jsx>{`
        .saved-readings-page {
          min-height: 100dvh;
          overflow-x: hidden;
          background: #000;
          color: #f8fafc;
          padding: max(22px, env(safe-area-inset-top)) 20px max(40px, env(safe-area-inset-bottom));
          font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
        }
        .saved-header {
          width: min(100%, 440px);
          height: 48px;
          margin: 0 auto clamp(78px, 17vh, 150px);
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
        .back :global(svg) { width: 22px; height: 22px; }
        .manage {
          justify-self: end;
          font-size: 12px;
          letter-spacing: 0.08em;
          cursor: pointer;
        }
        .manage:disabled { opacity: 0; pointer-events: none; }
        .notice {
          width: min(100%, 440px);
          margin: -54px auto 34px;
          color: #d8caaa;
          font-family: var(--font-display, Georgia, serif);
          font-size: 13px;
          line-height: 1.5;
          text-align: center;
        }
        .notice.error { color: #fda4af; }
        .reading-grid {
          width: min(100%, 440px);
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: clamp(18px, 5.5vw, 28px) clamp(10px, 3.4vw, 18px);
        }
        .reading-slot, .empty-slot { position: relative; aspect-ratio: 0.9; }
        .reading-tile {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          border: 1px solid transparent;
          border-radius: clamp(18px, 5vw, 24px);
          background:
            linear-gradient(155deg, rgba(15, 17, 28, 0.98), rgba(3, 4, 10, 0.99)) padding-box,
            linear-gradient(135deg, #fff9ea 0%, #b9ab84 33%, #fbf7eb 58%, #8b7b59 100%) border-box;
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
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          transition: transform 160ms ease, box-shadow 160ms ease;
        }
        .reading-tile::before {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 28% 18%, rgba(255,255,255,0.11), transparent 42%);
          pointer-events: none;
        }
        .reading-tile:active { transform: scale(0.96); }
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
        .empty-slot { display: grid; place-items: center; }
        .empty-slot span {
          width: 5px;
          height: 5px;
          border-radius: 999px;
          background: #fff;
          box-shadow: 0 0 5px rgba(255,255,255,0.95), 0 0 14px rgba(255,255,255,0.54);
        }
        .empty-slot:nth-child(3n) span { width: 3px; height: 3px; opacity: 0.76; }
        .empty-slot:nth-child(4n) span { width: 6px; height: 6px; opacity: 0.88; }
        .delete-reading {
          position: absolute;
          z-index: 2;
          top: -7px;
          right: -7px;
          width: 24px;
          height: 24px;
          border: 1px solid rgba(255,255,255,0.36);
          border-radius: 999px;
          background: #080808;
          color: #fff;
          display: grid;
          place-items: center;
          cursor: pointer;
        }
        .delete-reading :global(svg) { width: 13px; height: 13px; }
        .empty-copy {
          width: min(100%, 440px);
          margin: 54px auto 0;
          color: rgba(148, 163, 184, 0.52);
          font-family: var(--font-display, Georgia, serif);
          font-size: 13px;
          letter-spacing: 0.05em;
          text-align: center;
        }
        @media (max-width: 350px) {
          .saved-readings-page { padding-inline: 14px; }
          .reading-grid { column-gap: 8px; }
          .saved-header { margin-bottom: 62px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .reading-tile { transition: none; }
        }
      `}</style>
    </main>
  );
}
