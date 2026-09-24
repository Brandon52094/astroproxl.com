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