/** Shared browser/server delivery types. No server runtime imports. */
import type { DirectAlignAnswer, DirectAlignQuestion, InitialReadingDelivery } from "./engine";

export type { DirectAlignAnswer, DirectAlignQuestion };

export interface ReadingAlignment {
  version: "reading-v2";
  phase: "awaiting_alignment" | "complete";
  contextId: string;
  initialId: string;
  directAlign: DirectAlignQuestion[];
  calendar: InitialReadingDelivery["calendar"];
  answers: DirectAlignAnswer[];
  /** Persist before sending; retries must send this same set of answers. */
  submittedAnswers?: DirectAlignAnswer[];
  answerKey?: string;
}

export interface DirectAlignRequest {
  readingId: string;
  initialId: string;
  answers: DirectAlignAnswer[];
}

export interface ReadingDelivery {
  id: string;
  pages: {
    pageNumber: 1 | 2 | 3 | 4;
    title: string;
    content: string;
    sources?: { section: string; placements: string }[];
  }[];
  topic: string;
  question: string;
  generatedAt: string;
  status?: "awaiting_alignment" | "complete";
  alignment?: ReadingAlignment;
  isSafeResponse?: boolean;
  riskLevel?: string | null;
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export function validAnswers(
  value: unknown,
  questions: DirectAlignQuestion[],
  complete = false,
): value is DirectAlignAnswer[] {
  if (!Array.isArray(value) || (complete && value.length !== questions.length)) return false;
  const ids = new Set<string>();
  return value.every((answer) => {
    if (
      !record(answer) ||
      typeof answer.questionId !== "string" ||
      !questions.some((question) => question.id === answer.questionId) ||
      ids.has(answer.questionId) ||
      (answer.answer !== "yes" && answer.answer !== "no")
    )
      return false;
    ids.add(answer.questionId);
    return true;
  });
}

export function isReadingAlignment(value: unknown): value is ReadingAlignment {
  if (
    !record(value) ||
    value.version !== "reading-v2" ||
    !["awaiting_alignment", "complete"].includes(String(value.phase)) ||
    !nonempty(value.contextId) ||
    !nonempty(value.initialId) ||
    !Array.isArray(value.directAlign) ||
    value.directAlign.length !== 5 ||
    !value.directAlign.every((q) => record(q) && nonempty(q.id) && nonempty(q.question)) ||
    new Set(value.directAlign.map((q) => q.id)).size !== 5 ||
    !Array.isArray(value.calendar) ||
    !value.calendar.every(
      (date) =>
        record(date) &&
        nonempty(date.id) &&
        nonempty(date.date) &&
        typeof date.isoDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(date.isoDate),
    )
  )
    return false;
  const questions = value.directAlign as DirectAlignQuestion[];
  return (
    validAnswers(value.answers, questions, value.phase === "complete") &&
    (value.submittedAnswers === undefined ||
      validAnswers(value.submittedAnswers, questions, true)) &&
    (value.phase !== "complete" || nonempty(value.answerKey))
  );
}

/** Cache/API shape check, not proof of ownership or trusted chart calculations. */
export function isReadingDelivery(value: unknown): value is ReadingDelivery {
  return (
    record(value) &&
    nonempty(value.id) &&
    nonempty(value.topic) &&
    typeof value.question === "string" &&
    nonempty(value.generatedAt) &&
    Array.isArray(value.pages) &&
    value.pages.length > 0 &&
    value.pages.every(
      (page) =>
        record(page) &&
        [1, 2, 3, 4].includes(Number(page.pageNumber)) &&
        typeof page.title === "string" &&
        nonempty(page.content) &&
        (page.sources === undefined ||
          (Array.isArray(page.sources) &&
            page.sources.every(
              (source) =>
                record(source) &&
                typeof source.section === "string" &&
                typeof source.placements === "string",
            ))),
    ) &&
    (value.alignment === undefined ||
      (isReadingAlignment(value.alignment) &&
        (value.status === undefined || value.status === value.alignment.phase)))
  );
}
