import { z } from "zod";
import { PackError } from "./errors.js";
import type { ScoringMode } from "./types.js";
import { toProblems } from "./zod-problems.js";

const MAX_CHARS_LIMIT = 10_000_000;
const MIN_CHUNK_CHARS = 100;
const MAX_CHUNK_CHARS = 40_000;

const NonBlank = z.string().refine((value) => value.trim().length > 0, {
  message: "must not be blank",
});

const Weight = z.number().finite().min(0);
const Range = z
  .strictObject({ easy: z.number().positive(), hard: z.number().positive() })
  .refine((range) => range.easy < range.hard, "easy must be below hard");

const ModeWeights = z
  .strictObject({
    vocabulary: Weight,
    kanji: Weight,
    sentenceLength: Weight,
    dialogue: Weight,
    speechRate: Weight,
  })
  .refine(
    (weights) => Object.values(weights).some((weight) => weight > 0),
    "at least one weight must be above 0",
  );

const ConfigFile = z.strictObject({
  format: z.literal(1),
  version: NonBlank,
  language: NonBlank,
  maxChars: z.number().int().min(1).max(MAX_CHARS_LIMIT),
  tokenizerChunkChars: z
    .number()
    .int()
    .min(MIN_CHUNK_CHARS)
    .max(MAX_CHUNK_CHARS),
  unknownDifficulty: z.number().min(0).max(1),
  excludedPartsOfSpeech: z.array(NonBlank),
  sentence: z
    .strictObject({
      easyLength: z.number().positive(),
      hardLength: z.number().positive(),
    })
    .refine(
      (sentence) => sentence.easyLength < sentence.hardLength,
      "easyLength must be below hardLength",
    ),
  speechRate: Range,
  weights: z.strictObject({ spoken: ModeWeights, written: ModeWeights }),
  thresholds: z.strictObject({
    spoken: z.array(z.number()),
    written: z.array(z.number()),
  }),
});

export interface ScoringConfig {
  readonly version: string;
  readonly language: string;
  readonly maxChars: number;
  readonly tokenizerChunkChars: number;
  readonly unknownDifficulty: number;
  readonly excludedPartsOfSpeech: ReadonlySet<string>;
  readonly sentence: {
    readonly easyLength: number;
    readonly hardLength: number;
  };
  readonly speechRate: { readonly easy: number; readonly hard: number };
  readonly weights: Readonly<Record<ScoringMode, z.output<typeof ModeWeights>>>;
  readonly thresholds: Readonly<Record<ScoringMode, readonly number[]>>;
}

const isStrictlyAscendingInsideUnit = (values: readonly number[]): boolean =>
  values.every(
    (value, index) =>
      value > 0 &&
      value < 1 &&
      (index === 0 || value > (values[index - 1] ?? 0)),
  );

function findThresholdProblems(
  mode: ScoringMode,
  thresholds: readonly number[],
  levelCount: number,
): string[] {
  const problems: string[] = [];
  if (thresholds.length !== levelCount - 1) {
    problems.push(`thresholds.${mode}: expected ${levelCount - 1} values`);
  }
  if (!isStrictlyAscendingInsideUnit(thresholds)) {
    problems.push(`thresholds.${mode}: must be ascending and inside (0, 1)`);
  }
  return problems;
}

/** `levels` is the language profile's scale, ordered lowest to highest. */
export function parseScoringConfig(
  raw: unknown,
  label: string,
  levels: readonly string[],
): ScoringConfig {
  const parsed = ConfigFile.safeParse(raw);
  if (!parsed.success) {
    throw new PackError(label, toProblems(parsed.error));
  }
  const file = parsed.data;
  const problems = [
    ...findThresholdProblems("spoken", file.thresholds.spoken, levels.length),
    ...findThresholdProblems("written", file.thresholds.written, levels.length),
  ];
  if (problems.length > 0) throw new PackError(label, problems);
  return {
    ...file,
    excludedPartsOfSpeech: new Set(file.excludedPartsOfSpeech),
  };
}
