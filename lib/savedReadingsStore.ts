import type { StoredReading } from "@/lib/chartStore";

export const MAX_SAVED_READINGS = 12;

export interface SavedReadingFollowup {
  id: string;
  question: string;
  title: string;
  content: string;
}

export interface SavedReadingRecord {
  id: string;
  savedAt: string;
  topic: string;
  title: string;
  reading: StoredReading;
  followups: SavedReadingFollowup[];
}

export type SaveReadingResult =
  | { status: "saved"; record: SavedReadingRecord }
  | { status: "limit"; limit: number };

const DATABASE_NAME = "astroproxl-local";
const DATABASE_VERSION = 1;
const STORE_NAME = "saved-readings";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("Local reading storage is not available on this device."));
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("savedAt", "savedAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local storage."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local storage request failed."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, mode);
    return await requestResult(run(transaction.objectStore(STORE_NAME)));
  } finally {
    database.close();
  }
}

export async function listSavedReadings(): Promise<SavedReadingRecord[]> {
  const records = await withStore("readonly", (store) => store.getAll());
  return records.sort(
    (left, right) => new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime(),
  );
}

export async function getSavedReading(id: string): Promise<SavedReadingRecord | null> {
  const record = await withStore<SavedReadingRecord | undefined>("readonly", (store) =>
    store.get(id),
  );
  return record ?? null;
}

export async function saveReadingLocally(
  record: SavedReadingRecord,
): Promise<SaveReadingResult> {
  const existing = await getSavedReading(record.id);

  if (!existing) {
    const readings = await listSavedReadings();
    if (readings.length >= MAX_SAVED_READINGS) {
      return { status: "limit", limit: MAX_SAVED_READINGS };
    }
  }

  await withStore("readwrite", (store) => store.put(record));

  try {
    await navigator.storage?.persist?.();
  } catch {
    // Persistence is best-effort; the reading is still stored in IndexedDB.
  }

  return { status: "saved", record };
}

export async function deleteSavedReading(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}
