import { z } from "zod";

export const ReadingTopicSchema = z.enum([
  "love",
  "career",
  "money",
  "general",
]);

export const ReadingTimeframeTypeSchema = z.enum(["date", "month"]);

export const CreateReadingSchema = z.object({
  topic: ReadingTopicSchema,
  question: z.string().min(1, "Question is required"),
  timeframeType: ReadingTimeframeTypeSchema,
  timeframeValue: z.string().min(1, "Timeframe value is required"),
});

export type CreateReadingInput = z.infer<typeof CreateReadingSchema>;
export type ReadingTopic = z.infer<typeof ReadingTopicSchema>;