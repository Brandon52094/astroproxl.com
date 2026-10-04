import { db } from "@/lib/db";
import { readingAnalytics } from "@/lib/db/schema";
import type { MembershipPlan } from "@/lib/paywallConfig";

export type ReadingAnalyticsEventType =
  | "reading_completed"
  | "reading_feedback";

export type ReadingFeedbackRating =
  | "up"
  | "down";

export interface LogReadingCompletedParams {
  userId: string;
  readingId: string;
  topic: string;
  membershipPlan: MembershipPlan | null;
  usedMembershipAllowance: boolean;
  usedPurchasedCredit: boolean;
  source?: "typed" | "voice";
}

export interface LogReadingFeedbackParams {
  userId: string;
  readingId: string;
  topic: string;
  rating: ReadingFeedbackRating;
}

/**
 * Records privacy-safe metadata for a successfully completed reading.
 *
 * Intentionally DOES NOT accept or store:
 * - the user's question
 * - reading content
 * - follow-up content
 * - birth date / birth time / birth place
 * - chart placements
 * - transit data
 *
 * This module should remain metadata-only.
 */
export async function logReadingCompleted(
  params: LogReadingCompletedParams
): Promise<void> {
  const userId = params.userId.trim();
  const readingId = params.readingId.trim();
  const topic = params.topic.trim() || "general";

  if (!userId) {
    throw new Error(
      "[reading-analytics] Missing userId for reading completion."
    );
  }

  if (!readingId) {
    throw new Error(
      "[reading-analytics] Missing readingId for reading completion."
    );
  }

  await db.insert(readingAnalytics).values({
    userId,
    readingId,
    eventType: "reading_completed",
    topic,
    membershipPlan: params.membershipPlan,
    usedMembershipAllowance:
      params.usedMembershipAllowance,
    usedPurchasedCredit:
      params.usedPurchasedCredit,
    source: params.source ?? null,
    feedbackRating: null,
  });
}

/**
 * Records thumbs-up / thumbs-down feedback without storing the reading itself.
 *
 * The readingId lets aggregate analytics connect feedback to the same reading
 * completion event without storing the user's private question or response text.
 */
export async function logReadingFeedback(
  params: LogReadingFeedbackParams
): Promise<void> {
  const userId = params.userId.trim();
  const readingId = params.readingId.trim();
  const topic = params.topic.trim() || "general";

  if (!userId) {
    throw new Error(
      "[reading-analytics] Missing userId for reading feedback."
    );
  }

  if (!readingId) {
    throw new Error(
      "[reading-analytics] Missing readingId for reading feedback."
    );
  }

  if (
    params.rating !== "up" &&
    params.rating !== "down"
  ) {
    throw new Error(
      "[reading-analytics] Invalid feedback rating."
    );
  }

  await db.insert(readingAnalytics).values({
    userId,
    readingId,
    eventType: "reading_feedback",
    topic,
    membershipPlan: null,
    usedMembershipAllowance: null,
    usedPurchasedCredit: null,
    source: null,
    feedbackRating: params.rating,
  });
}
