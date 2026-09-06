import type { ReadingAdmission, ReadingCompletionPlan, ReadingUsageKind } from "./usage-policy";

/** Read from the saved server session, never from the POST body. */
export interface UsageReading {
  id: string;
  userId: string;
  initialReady: boolean;
  isSafeResponse: boolean;
  expiresAt: string;
  admission: ReadingAdmission;
}

export interface ReadingUsageReceipt {
  readingId: string;
  userId: string;
  recordedAt: string;
  kind: ReadingUsageKind;
  readingsCompleted: number;
  jxlCreditsGranted: number;
  creditsRemaining: number;
  includedReplies: number;
}

export interface ReadingUsageTransaction {
  getReceipt(readingId: string): Promise<ReadingUsageReceipt | null>;
  getReading(readingId: string): Promise<UsageReading | null>;
  getAccount(): Promise<Record<string, unknown>>;
  patchAccount(patch: ReadingCompletionPlan["accountPatch"]): Promise<void>;
  /** Insert, never refill: the allowance and subsequent reply usage belong to this reading ID. */
  insertReplyAllowance(readingId: string, includedReplies: number): Promise<void>;
  insertReceipt(receipt: ReadingUsageReceipt): Promise<void>;
}

export interface ReadingUsageStore {
  /** Insert a missing account from the current Clerk snapshot; never overwrite an existing ledger. */
  ensureAccount(userId: string, initial: Record<string, unknown>): Promise<void>;
  /**
   * A real database transaction that locks this user's account, scopes all reads
   * and writes to them, and commits the account, allowance, and unique receipt
   * together. Roll back all writes if the callback throws. Lock per user, not just
   * per reading: two distinct readings must not spend the same credit or free slot.
   * Receipts outlive the private chart session so old retries remain no-ops.
   *
   * Do not call Clerk's read/modify/write metadata API inside this transaction:
   * its remote write cannot be rolled back with these database records.
   * The adapter must use the app's authoritative transactional account balance.
   * If Clerk mirrors that balance, synchronize it separately and make every credit
   * writer (purchases/refunds/replies) use the same authoritative accounting store.
   */
  transaction<T>(userId: string, run: (tx: ReadingUsageTransaction) => Promise<T>): Promise<T>;
}
