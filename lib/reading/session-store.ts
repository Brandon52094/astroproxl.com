/** Server persistence contract. Implement with the app's existing database. */
import type {
  AlignedReading,
  DirectAlignAnswer,
  InitialReading,
  PreparedReadingContext,
} from "./engine";
import type { ReadingAdmission } from "./usage-policy";

export interface ReadingSession {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  admission: ReadingAdmission;
  context: PreparedReadingContext;
  initial: InitialReading;
  answers: DirectAlignAnswer[] | null;
  answerKey: string | null;
  completion: AlignedReading | null;
}

export interface SessionOwner {
  readingId: string;
  userId: string;
}

export interface AlignmentClaim extends SessionOwner {
  initialId: string;
  answerKey: string;
  answers: DirectAlignAnswer[];
  leaseId: string;
  leaseExpiresAt: string;
  maxAttempts: number;
}

export type ClaimResult =
  | { state: "acquired" | "busy" | "complete" | "conflict" | "exhausted"; session: ReadingSession }
  | { state: "not_found" };

export interface ReadingSessionStore {
  /** Insert a unique ID and persist the full snapshot before returning. */
  create(session: ReadingSession): Promise<void>;
  /** Owner-scoped lookup. Return null for unknown, other-user, or expired IDs. */
  getOwned(owner: SessionOwner): Promise<ReadingSession | null>;
  /**
   * One atomic transaction/CAS:
   * - Check ownership, expiry, and initialId.
   * - Return the existing completion for the same answer key.
   * - Reject different answers once an answer key has been committed.
   * - Return busy while a valid lease exists; enforce the persisted attempt cap.
   * - Otherwise persist answers/key, acquire this lease, increment attempts.
   * Never implement this as an unguarded get followed by an update.
   */
  claim(input: AlignmentClaim): Promise<ClaimResult>;
  /**
   * Save only if this owner's lease ID is still current and unexpired, and the
   * completion's initialId/answerKey match. Atomically commit and clear the lease.
   * A duplicate same-key completion may return true without overwriting it.
   */
  complete(input: SessionOwner & { leaseId: string; completion: AlignedReading }): Promise<boolean>;
  /** Clear only this lease. Retain answers, answer key, and attempt count. */
  release(input: SessionOwner & { leaseId: string }): Promise<void>;
}

// Deliberately no process-local Map, localStorage, or filesystem fallback:
// the production adapter must work across server instances and restarts.
