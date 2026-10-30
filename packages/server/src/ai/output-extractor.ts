import type { z } from "zod";

export type OutputErrorKind =
  | "too_long"
  | "no_json"
  | "invalid_json"
  | "multiple_json"
  | "schema_mismatch"
  | "refinement_failed";

/**
 * `issues` name where and why, never what the model wrote: the answer is
 * untrusted and may echo the prompt.
 */
export interface OutputError {
  kind: OutputErrorKind;
  issues: string[];
}

export type ParsedOutput<T> =
  | { ok: true; value: T }
  | { ok: false; error: OutputError };

export interface ParseOptions<T> {
  /** Longer answers are refused before anything is read. */
  maxChars: number;
  /**
   * Checks the value against what the schema cannot see, such as edit
   * positions against the original text. Returns the problems found, none
   * when the value is fine.
   */
  refine?: (value: T) => string[];
}

const fail = (kind: OutputErrorKind, issues: string[] = []) => ({
  ok: false as const,
  error: { kind, issues },
});

/** Index of the bracket that closes the one at `start`, or -1 when none does. */
function findClosingIndex(text: string, start: number): number {
  let depth = 0;
  let isInString = false;
  let isEscaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (isInString) {
      if (isEscaped) isEscaped = false;
      else if (character === "\\") isEscaped = true;
      else if (character === '"') isInString = false;
    } else if (character === '"') {
      isInString = true;
    } else if (character === "{" || character === "[") {
      depth += 1;
    } else if (character === "}" || character === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

type Extraction =
  | { kind: "found"; value: unknown }
  | { kind: "none" | "invalid_json" | "multiple_json" };

/**
 * Finds the one JSON object or array in a text that may hold prose or a code
 * fence around it. Nothing is repaired: a truncated value, or two values, is
 * an error rather than a guess.
 */
function extractJson(text: string): Extraction {
  const values: unknown[] = [];
  let hasInvalidCandidate = false;
  let index = 0;
  while (index < text.length) {
    if (text[index] !== "{" && text[index] !== "[") {
      index += 1;
      continue;
    }
    const closing = findClosingIndex(text, index);
    if (closing === -1) return { kind: "invalid_json" };
    try {
      values.push(JSON.parse(text.slice(index, closing + 1)));
    } catch {
      // Braces in prose, such as "{curly}": not JSON, so not a candidate.
      hasInvalidCandidate = true;
    }
    index = closing + 1;
  }
  if (values.length > 1) return { kind: "multiple_json" };
  const [value] = values;
  if (values.length === 1) return { kind: "found", value };
  return { kind: hasInvalidCandidate ? "invalid_json" : "none" };
}

const describeIssue = (issue: z.core.$ZodIssue): string =>
  `${issue.path.map(String).join(".") || "(root)"}: ${issue.code}`;

export function parseModelOutput<T>(
  text: string,
  schema: z.ZodType<T>,
  options: ParseOptions<T>,
): ParsedOutput<T> {
  if (text.length > options.maxChars) return fail("too_long");
  const extraction = extractJson(text);
  if (extraction.kind === "none") return fail("no_json");
  if (extraction.kind !== "found") return fail(extraction.kind);

  const parsed = schema.safeParse(extraction.value);
  if (!parsed.success) {
    return fail("schema_mismatch", parsed.error.issues.map(describeIssue));
  }
  const problems = options.refine?.(parsed.data) ?? [];
  if (problems.length > 0) return fail("refinement_failed", problems);
  return { ok: true, value: parsed.data };
}

export interface Span {
  start: number;
  end: number;
}

const isLowSurrogate = (code: number): boolean =>
  code >= 0xdc00 && code <= 0xdfff;

const isInsideSurrogatePair = (text: string, position: number): boolean =>
  position > 0 &&
  position < text.length &&
  isLowSurrogate(text.charCodeAt(position));

function findProblemOfSpan(original: string, span: Span): string | undefined {
  const { start, end } = span;
  const isPosition = (value: number) =>
    Number.isInteger(value) && value >= 0 && value <= original.length;
  if (!isPosition(start) || !isPosition(end)) return "outside_text";
  if (start > end) return "start_after_end";
  if (
    isInsideSurrogatePair(original, start) ||
    isInsideSurrogatePair(original, end)
  ) {
    return "splits_character";
  }
  return undefined;
}

/**
 * Checks spans of the original text, in UTF-16 units like `String.slice`:
 * inside the text, ordered, not cutting a character, not overlapping. The
 * result is usable as the `refine` of `parseModelOutput`; it names spans by
 * position in the list, never by their content.
 */
export function findSpanProblems(
  original: string,
  spans: readonly Span[],
): string[] {
  const problems = new Map<number, string>();
  spans.forEach((span, index) => {
    const problem = findProblemOfSpan(original, span);
    if (problem !== undefined) problems.set(index, problem);
  });
  const sound = spans
    .map((span, index) => ({ span, index }))
    .filter(({ index }) => !problems.has(index))
    .sort((a, b) => a.span.start - b.span.start || a.span.end - b.span.end);
  let furthestEnd = 0;
  for (const { span, index } of sound) {
    if (span.start < furthestEnd) problems.set(index, "overlaps_previous");
    furthestEnd = Math.max(furthestEnd, span.end);
  }
  return [...problems.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, problem]) => `span ${index}: ${problem}`);
}
