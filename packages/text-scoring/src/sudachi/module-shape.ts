import type { Token } from "../types.js";

export interface SudachiMorpheme {
  readonly surface: string;
  readonly dictionaryForm: string;
  readonly partOfSpeech: readonly string[];
}

export interface SudachiModule {
  Tokenizer: new () => {
    /** A list of morphemes, or an Error value: it does not throw. */
    tokenize(text: string, mode?: number): unknown;
  };
  SplitMode: { a(): number; b(): number; c(): number };
}

const isObjectOrClass = (value: unknown): boolean =>
  (typeof value === "object" && value !== null) || typeof value === "function";

/** Checks the parts of the native module this package calls, nothing more. */
export const isSudachiModule = (value: unknown): value is SudachiModule =>
  typeof value === "object" &&
  value !== null &&
  "Tokenizer" in value &&
  typeof value.Tokenizer === "function" &&
  "SplitMode" in value &&
  isObjectOrClass(value.SplitMode);

const TOKENIZE_FAILED = "Sudachi could not tokenize the text";

/**
 * The native `tokenize` returns an Error object instead of throwing when it
 * fails (for example on an input above 49149 bytes). Its message is dropped:
 * it is not ours to forward.
 */
export function toTokens(result: unknown): readonly Token[] {
  if (!Array.isArray(result)) throw new Error(TOKENIZE_FAILED);
  return result.map((morpheme: SudachiMorpheme) => ({
    surface: morpheme.surface,
    lemma: morpheme.dictionaryForm,
    partOfSpeech: morpheme.partOfSpeech,
  }));
}
