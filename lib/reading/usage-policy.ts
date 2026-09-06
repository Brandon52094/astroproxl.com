/** Shared reading rules. Safe to import from browser components. */
export const CREDITS_PER_READING = 1;
export const JXL_FIRST_READING_CREDITS = 6;
export const FREE_READING_RESET_MS = 7 * 24 * 60 * 60 * 1000;
export const REGULAR_READING_REPLIES = 1;
export const SUBSCRIBER_READING_REPLIES = 8;

export type ReadingUsageKind = "subscriber" | "free" | "credit";

/** Server-created when generation is admitted; never accept it from the client. */
export interface ReadingAdmission {
  kind: ReadingUsageKind;
  checkedAt: string;
  includedReplies: number;
}

export interface ReadingAccount {
  membershipStatus: "active" | "paused" | "canceled";
  isSubscribed: boolean;
  credits: number;
  replyCredits: number;
  readingsCompleted: number;
  firstReadingUsed: boolean;
  freeReadingUsedAt: string | null;
  jxlCredits: number;
}

export class ReadingUsageError extends Error {
  constructor(
    readonly code: "INVALID_ACCOUNT" | "INSUFFICIENT_CREDITS" | "ELIGIBILITY_CHANGED",
    message: string,
  ) {
    super(message);
    this.name = "ReadingUsageError";
  }
}

function count(value: unknown, field: string): number {
  const n =
    value == null
      ? 0
      : typeof value === "number"
        ? value
        : typeof value === "string" && /^\d+$/.test(value)
          ? Number(value)
          : NaN;
  if (!Number.isSafeInteger(n) || n < 0)
    throw new ReadingUsageError("INVALID_ACCOUNT", `Invalid ${field} value.`);
  return n;
}

export function readReadingAccount(metadata: Record<string, unknown>): ReadingAccount {
  const timestamp = metadata.freeReadingUsedAt;
  if (
    timestamp != null &&
    (typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp)))
  )
    throw new ReadingUsageError("INVALID_ACCOUNT", "Invalid free-reading timestamp.");
  for (const key of ["isSubscribed", "firstReadingUsed"]) {
    if (metadata[key] != null && typeof metadata[key] !== "boolean")
      throw new ReadingUsageError("INVALID_ACCOUNT", `Invalid ${key} value.`);
  }
  const membershipStatus =
    metadata.membershipStatus === "active" ||
    metadata.membershipStatus === "paused" ||
    metadata.membershipStatus === "canceled"
      ? metadata.membershipStatus
      : metadata.isSubscribed === true
        ? "active"
        : "canceled";
  return {
    membershipStatus,
    isSubscribed: membershipStatus === "active",
    credits: count(metadata.credits, "credits"),
    replyCredits: count(metadata.replyCredits, "replyCredits"),
    readingsCompleted: count(metadata.readingsCompleted, "readingsCompleted"),
    firstReadingUsed: metadata.firstReadingUsed === true,
    freeReadingUsedAt: typeof timestamp === "string" ? timestamp : null,
    jxlCredits: count(metadata.jxlCredits, "jxlCredits"),
  };
}

function assertTime(now: number) {
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime()))
    throw new ReadingUsageError("INVALID_ACCOUNT", "Invalid accounting time.");
}

function freeAvailable(account: ReadingAccount, now: number): boolean {
  if (account.freeReadingUsedAt)
    return now >= Date.parse(account.freeReadingUsedAt) + FREE_READING_RESET_MS;
  // A used account without a reset timestamp must not become permanently free.
  return !account.firstReadingUsed && account.readingsCompleted === 0;
}

export function admitReading(
  metadata: Record<string, unknown>,
  now = Date.now(),
): ReadingAdmission {
  assertTime(now);
  const account = readReadingAccount(metadata);
  const kind: ReadingUsageKind | null = account.isSubscribed
    ? "subscriber"
    : freeAvailable(account, now)
      ? "free"
      : account.credits >= CREDITS_PER_READING
        ? "credit"
        : null;
  if (!kind)
    throw new ReadingUsageError(
      "INSUFFICIENT_CREDITS",
      "Insufficient credits. Purchase more or subscribe.",
    );
  return {
    kind,
    checkedAt: new Date(now).toISOString(),
    includedReplies: kind === "subscriber" ? SUBSCRIBER_READING_REPLIES : REGULAR_READING_REPLIES,
  };
}

export interface ReadingCompletionPlan {
  /** Only these accounting fields are changed; unrelated metadata is preserved. */
  accountPatch: {
    readingsCompleted: number;
    firstReadingUsed: true;
    credits: number;
    jxlCredits: number;
    freeReadingUsedAt?: string;
  };
  kind: ReadingUsageKind;
  includedReplies: number;
  jxlCreditsGranted: number;
}

/** Called under the user's accounting transaction, using the stored admission. */
export function planReadingCompletion(
  metadata: Record<string, unknown>,
  admission: ReadingAdmission,
  now = Date.now(),
): ReadingCompletionPlan {
  assertTime(now);
  const account = readReadingAccount(metadata);
  if (
    !admission ||
    !["subscriber", "free", "credit"].includes(admission.kind) ||
    !Number.isFinite(Date.parse(admission.checkedAt)) ||
    Date.parse(admission.checkedAt) > now ||
    admission.includedReplies !==
      (admission.kind === "subscriber" ? SUBSCRIBER_READING_REPLIES : REGULAR_READING_REPLIES)
  )
    throw new ReadingUsageError("INVALID_ACCOUNT", "Invalid stored reading admission.");
  // A free reading cannot silently turn into a credit purchase after another tab
  // uses its allowance. The initial handler should record usage before delivery.
  if (admission.kind === "free" && !freeAvailable(account, now))
    throw new ReadingUsageError(
      "ELIGIBILITY_CHANGED",
      "The free-reading allowance was already used by another reading.",
    );
  if (admission.kind === "credit" && account.credits < CREDITS_PER_READING)
    throw new ReadingUsageError(
      "ELIGIBILITY_CHANGED",
      "The credit for this reading is no longer available.",
    );
  const granted = account.readingsCompleted === 0 ? JXL_FIRST_READING_CREDITS : 0;
  const patch: ReadingCompletionPlan["accountPatch"] = {
    readingsCompleted: count(account.readingsCompleted + 1, "readingsCompleted"),
    firstReadingUsed: true,
    credits: account.credits - (admission.kind === "credit" ? CREDITS_PER_READING : 0),
    jxlCredits: count(account.jxlCredits + granted, "jxlCredits"),
    ...(admission.kind === "free" ? { freeReadingUsedAt: new Date(now).toISOString() } : {}),
  };
  return {
    accountPatch: patch,
    kind: admission.kind,
    includedReplies: admission.includedReplies,
    jxlCreditsGranted: granted,
  };
}
