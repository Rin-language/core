import { z } from "zod";
import { PackError } from "./errors.js";
import type { ScoringMode } from "./types.js";

export const DEFAULT_MAX_ENTRIES = 2_000_000;
const MIN_BAND_COUNT = 2;
const MAX_BAND_COUNT = 20;
const MAX_WORD_LENGTH = 64;
const HAN_CHARACTER = /^\p{Script=Han}$/u;
const HAS_WHITESPACE = /\s/u;

export interface FrequencyPack {
  readonly version: string;
  readonly language: string;
  readonly mode: ScoringMode;
  readonly source: string;
  readonly licence: string;
  readonly bandCount: number;
  /** Band of each lemma, 1 = most frequent. */
  readonly words: ReadonlyMap<string, number>;
  /** Band of each kanji, 1 = most frequent. */
  readonly kanji: ReadonlyMap<string, number>;
}

export interface ParsePackOptions {
  readonly maxEntries?: number;
}

const NonBlank = z.string().refine((value) => value.trim().length > 0, {
  message: "must not be blank",
});

// The two maps stay `unknown` here: Zod would rebuild them as plain objects,
// where a `__proto__` key changes the prototype instead of being stored.
const PackFile = z.strictObject({
  format: z.literal(1),
  version: NonBlank,
  language: NonBlank,
  mode: z.enum(["spoken", "written"]),
  source: NonBlank,
  licence: NonBlank,
  bandCount: z.number().int().min(MIN_BAND_COUNT).max(MAX_BAND_COUNT),
  words: z.unknown().optional(),
  kanji: z.unknown().optional(),
});

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function readEntries(
  field: "words" | "kanji",
  value: unknown,
  bandCount: number,
  isValidKey: (key: string) => boolean,
  problems: string[],
): Map<string, number> {
  const entries = new Map<string, number>();
  if (value === undefined) return entries;
  if (!isPlainObject(value)) {
    problems.push(`${field}: must be an object`);
    return entries;
  }
  let badKeys = 0;
  let badBands = 0;
  for (const [key, band] of Object.entries(value)) {
    if (!isValidKey(key)) badKeys += 1;
    if (
      !Number.isInteger(band) ||
      (band as number) < 1 ||
      (band as number) > bandCount
    ) {
      badBands += 1;
    } else {
      entries.set(key, band as number);
    }
  }
  if (badKeys > 0) problems.push(`${field}: ${badKeys} invalid key(s)`);
  if (badBands > 0) {
    problems.push(
      `${field}: ${badBands} band(s) not an integer in 1..bandCount`,
    );
  }
  return entries;
}

const isWordKey = (key: string): boolean =>
  key.length >= 1 && key.length <= MAX_WORD_LENGTH && !HAS_WHITESPACE.test(key);

const isKanjiKey = (key: string): boolean => HAN_CHARACTER.test(key);

/** Problems name fields and counts, never a key or a value from the file. */
export function parseFrequencyPack(
  raw: unknown,
  label: string,
  options: ParsePackOptions = {},
): FrequencyPack {
  const parsed = PackFile.safeParse(raw);
  if (!parsed.success) {
    throw new PackError(
      label,
      parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    );
  }
  const file = parsed.data;
  const problems: string[] = [];
  if (file.words === undefined && file.kanji === undefined) {
    problems.push("words or kanji is required");
  }
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const declared =
    (isPlainObject(file.words) ? Object.keys(file.words).length : 0) +
    (isPlainObject(file.kanji) ? Object.keys(file.kanji).length : 0);
  if (declared > maxEntries) throw new PackError(label, ["too many entries"]);
  const words = readEntries(
    "words",
    file.words,
    file.bandCount,
    isWordKey,
    problems,
  );
  const kanji = readEntries(
    "kanji",
    file.kanji,
    file.bandCount,
    isKanjiKey,
    problems,
  );
  if (problems.length > 0) throw new PackError(label, problems);
  return {
    version: file.version,
    language: file.language,
    mode: file.mode,
    source: file.source,
    licence: file.licence,
    bandCount: file.bandCount,
    words,
    kanji,
  };
}
