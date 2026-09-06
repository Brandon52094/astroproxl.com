import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  readingReplyAllowances,
  readingSessions,
  readingUsageAccounts,
  readingUsageReceipts,
} from "@/lib/db/schema";
import type {
  AlignmentClaim,
  ClaimResult,
  ReadingSession,
  ReadingSessionStore,
  SessionOwner,
} from "./session-store";
import { readReadingAccount, type ReadingCompletionPlan } from "./usage-policy";
import type {
  ReadingUsageReceipt,
  ReadingUsageStore,
  ReadingUsageTransaction,
  UsageReading,
} from "./usage-store";

type SessionRow = typeof readingSessions.$inferSelect;
type UsageAccountRow = typeof readingUsageAccounts.$inferSelect;

const iso = (value: Date | string) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

function sessionFromRow(row: SessionRow): ReadingSession {
  return {
    id: row.id,
    userId: row.userId,
    createdAt: iso(row.createdAt),
    expiresAt: iso(row.expiresAt),
    admission: row.admission as ReadingSession["admission"],
    context: row.context as ReadingSession["context"],
    initial: row.initial as ReadingSession["initial"],
    answers: (row.answers as ReadingSession["answers"]) ?? null,
    answerKey: row.answerKey,
    completion: (row.completion as ReadingSession["completion"]) ?? null,
  };
}

async function lockedSession(tx: any, owner: SessionOwner): Promise<SessionRow | null> {
  const rows = await tx
    .select()
    .from(readingSessions)
    .where(and(eq(readingSessions.id, owner.readingId), eq(readingSessions.userId, owner.userId)))
    .for("update");
  return rows[0] ?? null;
}

export const postgresReadingSessions: ReadingSessionStore = {
  async create(session) {
    await db.insert(readingSessions).values({
      id: session.id,
      userId: session.userId,
      createdAt: new Date(session.createdAt),
      expiresAt: new Date(session.expiresAt),
      admission: session.admission,
      context: session.context,
      initial: session.initial,
      answers: session.answers,
      answerKey: session.answerKey,
      completion: session.completion,
    });
  },

  async getOwned(owner) {
    const rows = await db
      .select()
      .from(readingSessions)
      .where(
        and(
          eq(readingSessions.id, owner.readingId),
          eq(readingSessions.userId, owner.userId),
          gt(readingSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return rows[0] ? sessionFromRow(rows[0]) : null;
  },

  async claim(input: AlignmentClaim): Promise<ClaimResult> {
    return db.transaction(async (tx: any) => {
      const row = await lockedSession(tx, input);
      if (!row || row.expiresAt.getTime() <= Date.now()) return { state: "not_found" };
      const result = (
        state: Exclude<ClaimResult, { state: "not_found" }>["state"],
      ): ClaimResult => ({
        state,
        session: sessionFromRow(row),
      });
      const initial = row.initial as ReadingSession["initial"];
      if (
        initial.initialId !== input.initialId ||
        (row.answerKey && row.answerKey !== input.answerKey)
      )
        return result("conflict");
      if (row.completion) return result("complete");
      if (row.leaseId && row.leaseExpiresAt && row.leaseExpiresAt.getTime() > Date.now())
        return result("busy");
      if (row.alignmentAttempts >= input.maxAttempts) return result("exhausted");
      const [claimed] = await tx
        .update(readingSessions)
        .set({
          answers: input.answers,
          answerKey: input.answerKey,
          leaseId: input.leaseId,
          leaseExpiresAt: new Date(input.leaseExpiresAt),
          alignmentAttempts: row.alignmentAttempts + 1,
        })
        .where(
          and(eq(readingSessions.id, input.readingId), eq(readingSessions.userId, input.userId)),
        )
        .returning();
      return { state: "acquired", session: sessionFromRow(claimed) };
    });
  },

  async complete(input) {
    return db.transaction(async (tx: any) => {
      const row = await lockedSession(tx, input);
      if (!row || row.expiresAt.getTime() <= Date.now()) return false;
      const completion = input.completion;
      if (row.completion) {
        const existing = row.completion as ReadingSession["completion"];
        return existing?.answerKey === completion.answerKey;
      }
      if (
        row.leaseId !== input.leaseId ||
        !row.leaseExpiresAt ||
        row.leaseExpiresAt.getTime() <= Date.now() ||
        row.answerKey !== completion.answerKey ||
        (row.initial as ReadingSession["initial"]).initialId !== completion.initialId
      )
        return false;
      const updated = await tx
        .update(readingSessions)
        .set({ completion, leaseId: null, leaseExpiresAt: null })
        .where(
          and(
            eq(readingSessions.id, input.readingId),
            eq(readingSessions.userId, input.userId),
            eq(readingSessions.leaseId, input.leaseId),
          ),
        )
        .returning({ id: readingSessions.id });
      return updated.length === 1;
    });
  },

  async release(input) {
    await db
      .update(readingSessions)
      .set({ leaseId: null, leaseExpiresAt: null })
      .where(
        and(
          eq(readingSessions.id, input.readingId),
          eq(readingSessions.userId, input.userId),
          eq(readingSessions.leaseId, input.leaseId),
        ),
      );
  },
};

function accountRecord(row: UsageAccountRow): Record<string, unknown> {
  return {
    membershipStatus: row.membershipStatus,
    isSubscribed: row.isSubscribed,
    credits: row.credits,
    replyCredits: row.replyCredits,
    readingsCompleted: row.readingsCompleted,
    firstReadingUsed: row.firstReadingUsed,
    freeReadingUsedAt: row.freeReadingUsedAt?.toISOString() ?? null,
    jxlCredits: row.jxlCredits,
  };
}

function receiptFromRow(row: typeof readingUsageReceipts.$inferSelect): ReadingUsageReceipt {
  return {
    readingId: row.readingId,
    userId: row.userId,
    recordedAt: iso(row.recordedAt),
    kind: row.kind as ReadingUsageReceipt["kind"],
    readingsCompleted: row.readingsCompleted,
    jxlCreditsGranted: row.jxlCreditsGranted,
    creditsRemaining: row.creditsRemaining,
    includedReplies: row.includedReplies,
  };
}

export const postgresReadingUsage: ReadingUsageStore = {
  async ensureAccount(userId, initial) {
    const account = readReadingAccount(initial);
    await db
      .insert(readingUsageAccounts)
      .values({
        userId,
        membershipStatus: account.membershipStatus,
        isSubscribed: account.isSubscribed,
        credits: account.credits,
        replyCredits: account.replyCredits,
        readingsCompleted: account.readingsCompleted,
        firstReadingUsed: account.firstReadingUsed,
        freeReadingUsedAt: account.freeReadingUsedAt ? new Date(account.freeReadingUsedAt) : null,
        jxlCredits: account.jxlCredits,
      })
      .onConflictDoNothing({ target: readingUsageAccounts.userId });
  },

  async transaction<T>(userId: string, run: (tx: ReadingUsageTransaction) => Promise<T>) {
    return db.transaction(async (databaseTx: any) => {
      // The row exists before this transaction. PostgreSQL's row lock serializes
      // every reading debit/free-slot decision for this user.
      const rows = await databaseTx
        .select()
        .from(readingUsageAccounts)
        .where(eq(readingUsageAccounts.userId, userId))
        .for("update");
      const account = rows[0];
      if (!account) throw new Error("Reading usage account was not initialized.");
      const scoped: ReadingUsageTransaction = {
        async getReceipt(readingId) {
          const found = await databaseTx
            .select()
            .from(readingUsageReceipts)
            .where(
              and(
                eq(readingUsageReceipts.readingId, readingId),
                eq(readingUsageReceipts.userId, userId),
              ),
            )
            .limit(1);
          return found[0] ? receiptFromRow(found[0]) : null;
        },
        async getReading(readingId) {
          const found = await databaseTx
            .select()
            .from(readingSessions)
            .where(and(eq(readingSessions.id, readingId), eq(readingSessions.userId, userId)))
            .limit(1);
          const row = found[0];
          if (!row) return null;
          const reading: UsageReading = {
            id: row.id,
            userId: row.userId,
            initialReady: !!row.initial,
            isSafeResponse: false,
            expiresAt: iso(row.expiresAt),
            admission: row.admission as UsageReading["admission"],
          };
          return reading;
        },
        async getAccount() {
          return accountRecord(account);
        },
        async patchAccount(patch: ReadingCompletionPlan["accountPatch"]) {
          Object.assign(account, {
            ...patch,
            freeReadingUsedAt: patch.freeReadingUsedAt
              ? new Date(patch.freeReadingUsedAt)
              : account.freeReadingUsedAt,
          });
          await databaseTx
            .update(readingUsageAccounts)
            .set({
              readingsCompleted: patch.readingsCompleted,
              firstReadingUsed: patch.firstReadingUsed,
              credits: patch.credits,
              jxlCredits: patch.jxlCredits,
              ...(patch.freeReadingUsedAt
                ? { freeReadingUsedAt: new Date(patch.freeReadingUsedAt) }
                : {}),
              updatedAt: sql`now()`,
            })
            .where(eq(readingUsageAccounts.userId, userId));
        },
        async insertReplyAllowance(readingId, includedReplies) {
          await databaseTx.insert(readingReplyAllowances).values({
            readingId,
            userId,
            included: includedReplies,
            remaining: includedReplies,
          });
        },
        async insertReceipt(receipt) {
          await databaseTx.insert(readingUsageReceipts).values({
            readingId: receipt.readingId,
            userId,
            recordedAt: new Date(receipt.recordedAt),
            kind: receipt.kind,
            readingsCompleted: receipt.readingsCompleted,
            jxlCreditsGranted: receipt.jxlCreditsGranted,
            creditsRemaining: receipt.creditsRemaining,
            includedReplies: receipt.includedReplies,
          });
        },
      };
      return run(scoped);
    });
  },
};
