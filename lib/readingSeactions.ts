/**
 * Reading sections and dates — shared by the results page and Saved Readings, so both read a reading the same way.
 * Parses the eight-part engine contract (and legacy saved readings) and finds every date the reading points to.
 */

export type ParsedSection =
  | { kind: "confirmation"; body: string }
  | { kind: "focus"; body: string }
  | { kind: "prediction"; body: string }
  | { kind: "currentState"; body: string }
  | { kind: "whyNow"; body: string }
  | { kind: "next"; body: string }
  | { kind: "prose"; body: string }
  | {
      kind: "window";
      date: string | null;
      note: string | null;
      body: string;
    }
  | {
      kind: "directive";
      directive: "GENERAL" | "DROP" | "EXECUTE" | "LOCK";
      label: string;
      date: string | null;
      body: string;
    }
  | { kind: "closing"; body: string };

export type TimingSection = Extract<ParsedSection, { kind: "window" }>;
export type DirectiveSection = Extract<ParsedSection, { kind: "directive" }>;

// Parse the streamlined eight-part engine contract while remaining compatible with saved legacy readings.
const HUMAN_HEADERS = [
  "Confirmation",
  "The Prediction",
  "Where You Are Now",
  "Why This Is Happening",
  "Why This Is Active Now",
  "Why This Is Active",
  "What Happens Next",
  "How This Is Most Likely To Show Up",
  "Dated Windows",
  "Timing",
  "The Directive",
  "Your Move",
  "Bottom Line",
] as const;
const DATE_LEAD_RE = /^\s*\[\[DATE:\s*([^\]]+)\]\]\s*[—–-]?\s*/i;
const FOCUS_RE = /^\s*FOCUS\s*:\s*(.+)$/i;
const DROP_RE = /^\s*DROP\s*:\s*/i;
const EXECUTE_RE = /^\s*EXECUTE\s+BY\s+(\[\[DATE:\s*[^\]]+\]\]|[^:\n]+)\s*:\s*/i;
const LOCK_RE = /^\s*LOCK\s+IN\s+BY\s+(\[\[DATE:\s*[^\]]+\]\]|[^:\n]+)\s*:\s*/i;


export function extractDateText(raw: string): string {
  return (raw.match(/\[\[DATE:\s*([^\]]+)\]\]/i)?.[1] ?? raw).trim();
}

export function splitHumanHeader(paragraph: string): { label: string | null; body: string } {
  const cleaned = paragraph
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/^Part\s*\d+\s*[:—–-]\s*/i, "");

  for (const header of HUMAN_HEADERS) {
    const match = cleaned.match(
      new RegExp(`^${header}(?:\\s*[:—–-]\\s*|\\s*\\n+|\\s*$)([\\s\\S]*)$`, "i"),
    );
    if (match) return { label: header, body: match[1].trim() };
  }

  return { label: null, body: paragraph.trim() };
}

export function parseReadingSections(content: string): ParsedSection[] | null {
  const normalized = content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => (splitHumanHeader(line).label ? `\n${line}\n` : line))
    .join("\n");

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const sections: ParsedSection[] = [];
  let phase: "opening" | "windows" | "directives" | "closing" = "opening";
  let activeLabel = "";
  let sawHeader = false;

  for (const paragraph of paragraphs) {
    const { label, body } = splitHumanHeader(paragraph);

    if (label) {
      sawHeader = true;
      activeLabel = label;
      phase =
        label === "Bottom Line"
          ? "closing"
          : label === "Dated Windows" || label === "Timing"
            ? "windows"
            : label === "The Directive" || label === "Your Move"
              ? "directives"
              : "opening";
    }

    if (!body) continue;

    if (phase === "closing") {
      sections.push({ kind: "closing", body });
      continue;
    }

    if (activeLabel === "Confirmation" || !activeLabel) {
      const focusLine = body
        .split("\n")
        .map((line) => line.trim())
        .find((line) => FOCUS_RE.test(line));

      if (focusLine) {
        const focus = focusLine.match(FOCUS_RE);
        const confirmationBody = body
          .split("\n")
          .filter((line) => !FOCUS_RE.test(line.trim()))
          .join("\n")
          .trim();

        if (confirmationBody) {
          sections.push({ kind: "confirmation", body: confirmationBody });
        }
        if (focus?.[1]) {
          sections.push({ kind: "focus", body: focus[1].trim() });
        }
        continue;
      }
    }

    // Several moves written on back-to-back lines ("EXECUTE BY …" then "LOCK IN BY …") are separate moves, each
    // with its own date. A line that isn't a move continues the one above it.
    const isMoveLine = (line: string) => DROP_RE.test(line) || EXECUTE_RE.test(line) || LOCK_RE.test(line);
    const bodyLines = body.split("\n").map((line) => line.trim()).filter(Boolean);
    if (bodyLines.filter(isMoveLine).length > 1) {
      phase = "directives";
      for (const line of bodyLines) {
        const lineExecute = line.match(EXECUTE_RE);
        const lineLock = line.match(LOCK_RE);
        const last = sections[sections.length - 1];
        if (!isMoveLine(line)) {
          if (last?.kind === "directive") last.body = `${last.body}\n${line}`.trim();
          else sections.push({ kind: "directive", directive: "GENERAL", label: "Your Move", date: null, body: line });
          continue;
        }
        const directive = lineExecute ? "EXECUTE" : lineLock ? "LOCK" : "DROP";
        sections.push({
          kind: "directive",
          directive,
          label: lineExecute ? "Execute by" : lineLock ? "Lock in by" : "Drop",
          date: lineExecute || lineLock ? extractDateText((lineExecute ?? lineLock)![1]) : null,
          body: line.replace(lineExecute ? EXECUTE_RE : lineLock ? LOCK_RE : DROP_RE, "").trim(),
        });
      }
      continue;
    }

    const execute = body.match(EXECUTE_RE);
    const lock = body.match(LOCK_RE);
    if (DROP_RE.test(body) || execute || lock) {
      phase = "directives";
      const directive = execute ? "EXECUTE" : lock ? "LOCK" : "DROP";
      sections.push({
        kind: "directive",
        directive,
        label: execute ? "Execute by" : lock ? "Lock in by" : "Drop",
        date: execute || lock ? extractDateText((execute ?? lock)![1]) : null,
        body: body.replace(execute ? EXECUTE_RE : lock ? LOCK_RE : DROP_RE, "").trim(),
      });
      continue;
    }

    if (phase === "directives") {
      const items = body
        .split(/\n+/)
        .map((item) => item.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim())
        .filter(Boolean);

      for (const item of items.length ? items : [body]) {
        const date = item.match(DATE_LEAD_RE);
        sections.push({
          kind: "directive",
          directive: "GENERAL",
          label: "Your Move",
          date: date?.[1].trim() ?? null,
          body: date ? item.slice(date[0].length).trim() : item,
        });
      }
      continue;
    }

    if (phase === "windows" || (!activeLabel && DATE_LEAD_RE.test(body))) {
      phase = "windows";
      const lines = body
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const markerLines = lines.filter((line) => DATE_LEAD_RE.test(line));
      if (markerLines.length > 1) {
        for (const line of markerLines) {
          const date = line.match(DATE_LEAD_RE);
          const rest = date ? line.slice(date[0].length).trim() : line;
          sections.push({
            kind: "window",
            date: date?.[1].trim() ?? null,
            note: null,
            body: rest,
          });
        }
      } else {
        const date = body.match(DATE_LEAD_RE);
        const rest = date ? body.slice(date[0].length).trim() : body;
        sections.push({ kind: "window", date: date?.[1].trim() ?? null, note: null, body: rest });
      }
      continue;
    }

    const kind: ParsedSection["kind"] =
      activeLabel === "Confirmation"
        ? "confirmation"
        : activeLabel === "Where You Are Now"
          ? "currentState"
          : activeLabel === "Why This Is Happening" ||
              activeLabel === "Why This Is Active" ||
              activeLabel === "Why This Is Active Now"
            ? "whyNow"
            : activeLabel === "What Happens Next" ||
                activeLabel === "How This Is Most Likely To Show Up"
              ? "next"
              : activeLabel === "The Prediction" || (!activeLabel && sections.length === 0)
                ? "prediction"
                : "prose";

    sections.push({ kind, body } as ParsedSection);
  }

  return sawHeader && sections.length ? sections : null;
}

export type CalendarHighlight = {
  year: number;
  month: number;
  day: number;
  label: string;
};

const CALENDAR_MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

/**
 * Every calendar day named in the reading's dates ("Dec 4", "Dec 4–12", "Jan 3, 2027", …).
 * referenceDate (optional) is when the reading was made: dates without a year take its year, and a month well
 * before it rolls into the next year (a December reading that mentions "Jan 6"). Without it: this year, as before.
 */
export function extractCalendarHighlights(labels: string[], referenceDate?: Date): CalendarHighlight[] {
  const fallbackYear = (referenceDate ?? new Date()).getFullYear();
  const monthPattern =
    "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
  const pattern = new RegExp(
    `\\b(${monthPattern})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*(?:-|–|—|to|through)\\s*(?:(?:(${monthPattern})\\.?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?))?(?:,?\\s+(\\d{4}))?`,
    "gi",
  );
  const highlights: CalendarHighlight[] = [];

  for (const label of labels.filter(Boolean)) {
    for (const match of label.matchAll(pattern)) {
      const startMonth = CALENDAR_MONTHS[match[1].toLowerCase().replace(".", "")];
      const startDay = Number(match[2]);
      const endMonth = match[3]
        ? CALENDAR_MONTHS[match[3].toLowerCase().replace(".", "")]
        : startMonth;
      const endDay = match[4] ? Number(match[4]) : startDay;
      let year = match[5] ? Number(match[5]) : fallbackYear;
      if (!match[5] && referenceDate && startMonth < referenceDate.getMonth() - 1) year += 1;
      const start = new Date(year, startMonth, startDay);
      const end = new Date(year + (endMonth < startMonth ? 1 : 0), endMonth, endDay);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) continue;

      const cursor = new Date(start);
      let guard = 0;
      while (cursor <= end && guard < 62) {
        highlights.push({
          year: cursor.getFullYear(),
          month: cursor.getMonth(),
          day: cursor.getDate(),
          label,
        });
        cursor.setDate(cursor.getDate() + 1);
        guard++;
      }
    }
  }

  return Array.from(
    new Map(
      highlights.map((highlight) => [
        `${highlight.year}-${highlight.month}-${highlight.day}`,
        highlight,
      ]),
    ).values(),
  ).sort((a, b) =>
    new Date(a.year, a.month, a.day).getTime() -
    new Date(b.year, b.month, b.day).getTime(),
  );
}

/** The dates the results page puts on "Your Calendar": the timing windows ("When It Unfolds"), then "Your Move". */
export function getReadingDateLabels(sections: ParsedSection[] | null): string[] {
  const all = sections ?? [];
  return [
    ...all.filter((s): s is TimingSection => s.kind === "window").map((s) => s.date),
    ...all.filter((s): s is DirectiveSection => s.kind === "directive").map((s) => s.date),
  ].filter((date): date is string => Boolean(date));
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * The reading's key days as "YYYY-MM-DD", for the Saved Readings calendar. Uses the same dates as the results
 * page's calendar; a reading without the section headers falls back to any [[DATE: …]] marker in its text.
 */
export function getReadingKeyDays(content: string, savedAt?: string): string[] {
  if (!content) return [];
  const ref = savedAt ? new Date(savedAt) : undefined;
  const reference = ref && !Number.isNaN(ref.getTime()) ? ref : undefined;
  let labels = getReadingDateLabels(parseReadingSections(content));
  if (!labels.length) labels = Array.from(content.matchAll(/\[\[DATE:\s*([^\]]+)\]\]/gi), (m) => m[1].trim());
  return extractCalendarHighlights(labels, reference).map((h) => `${h.year}-${pad2(h.month + 1)}-${pad2(h.day)}`);
}

const plainDates = (text: string) => text.replace(/\[\[DATE:\s*([^\]]+)\]\]/gi, "$1").trim();

/** A short preview of a reading: its headline (FOCUS) and "The First Glimpse" (the prediction). */
export function getReadingPreview(content: string): { focus: string; glimpse: string } {
  const sections = content ? parseReadingSections(content) : null;
  if (!sections) {
    const first = (content ?? "").split(/\n\s*\n/).map((p) => p.trim()).find(Boolean) ?? "";
    return { focus: "", glimpse: plainDates(first) };
  }
  const join = (kind: ParsedSection["kind"]) => sections.filter((s) => s.kind === kind).map((s) => s.body).join("\n\n");
  return { focus: plainDates(join("focus")), glimpse: plainDates(join("prediction") || join("confirmation")) };
}
