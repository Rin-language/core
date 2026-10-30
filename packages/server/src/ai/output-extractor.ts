import { z } from "zod";

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

/** Deeper nesting is refused: it can only be a trap for the code that reads the value later. */
const MAX_JSON_DEPTH = 64;

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
      if (depth > MAX_JSON_DEPTH) return -1;
    } else if (character === "}" || character === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

type Extraction =
  | { kind: "values"; values: unknown[] }
  | { kind: "none" }
  | { kind: "invalid_json" };

/**
 * Finds the JSON objects and arrays in a text that may hold prose or a code
 * fence around them. Nothing is repaired: a value that never closes is an
 * error rather than a guess.
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
  if (values.length > 0) return { kind: "values", values };
  return { kind: hasInvalidCandidate ? "invalid_json" : "none" };
}

/** Every key a schema declares, read from its JSON Schema form. */
function declaredKeys(schema: z.ZodType): Set<string> {
  const keys = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node === null || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      if (key === "properties" && child !== null && typeof child === "object") {
        for (const name of Object.keys(child)) keys.add(name);
      }
      visit(child);
    }
  };
  try {
    visit(z.toJSONSchema(schema, { unrepresentable: "any" }));
  } catch {
    // A schema with no JSON Schema form: no key is known, all are hidden.
  }
  return keys;
}

const UNKNOWN_KEY = "<key>";

/** Names where and why. A key the model chose is never repeated. */
function describeIssue(
  issue: z.core.$ZodIssue,
  knownKeys: ReadonlySet<string>,
): string {
  const path = issue.path.map((segment) =>
    typeof segment === "string" && !knownKeys.has(segment)
      ? UNKNOWN_KEY
      : String(segment),
  );
  return `${path.join(".") || "(root)"}: ${issue.code}`;
}

/** The only value that fits the schema among several, if there is exactly one. */
function pickFittingValue<T>(
  values: readonly unknown[],
  schema: z.ZodType<T>,
): { kind: "single"; value: unknown } | { kind: "multiple_json" } {
  if (values.length === 1) return { kind: "single", value: values[0] };
  const fitting = values.filter((value) => schema.safeParse(value).success);
  return fitting.length === 1
    ? { kind: "single", value: fitting[0] }
    : { kind: "multiple_json" };
}

/** A check that throws is a refusal too: the answer is not trusted either way. */
function runRefine<T>(
  refine: ((value: T) => string[]) | undefined,
  value: T,
): string[] {
  try {
    return refine?.(value) ?? [];
  } catch {
    return ["refine_threw"];
  }
}

export function parseModelOutput<T>(
  text: string,
  schema: z.ZodType<T>,
  options: ParseOptions<T>,
): ParsedOutput<T> {
  if (text.length > options.maxChars) return fail("too_long");
  const extraction = extractJson(text);
  if (extraction.kind === "none") return fail("no_json");
  if (extraction.kind === "invalid_json") return fail("invalid_json");
  const picked = pickFittingValue(extraction.values, schema);
  if (picked.kind === "multiple_json") return fail("multiple_json");

  const parsed = schema.safeParse(picked.value);
  if (!parsed.success) {
    const knownKeys = declaredKeys(schema);
    return fail(
      "schema_mismatch",
      parsed.error.issues.map((issue) => describeIssue(issue, knownKeys)),
    );
  }
  const problems = runRefine(options.refine, parsed.data);
  if (problems.length > 0) return fail("refinement_failed", problems);
  return { ok: true, value: parsed.data };
}

export interface Span {
  start: number;
  end: number;
}

const HIGH_SURROGATES = [0xd800, 0xdbff] as const;
const LOW_SURROGATES = [0xdc00, 0xdfff] as const;

const isWithin = (code: number, [first, last]: readonly [number, number]) =>
  code >= first && code <= last;

const isInsideSurrogatePair = (text: string, position: number): boolean =>
  position > 0 &&
  position < text.length &&
  isWithin(text.charCodeAt(position - 1), HIGH_SURROGATES) &&
  isWithin(text.charCodeAt(position), LOW_SURROGATES);

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
