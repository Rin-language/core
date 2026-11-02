import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import type { Token, Tokenizer } from "../types.js";

export type SudachiSplitMode = "A" | "B" | "C";

export interface SudachiTokenizerOptions {
  /** Sudachi's unit of segmentation: A is the shortest, C the longest. */
  readonly splitMode?: SudachiSplitMode;
}

interface Morpheme {
  readonly surface: string;
  readonly dictionaryForm: string;
  readonly partOfSpeech: readonly string[];
}

interface SudachiModule {
  Tokenizer: new () => {
    tokenize(text: string, mode?: number): readonly Morpheme[];
  };
  SplitMode: { a(): number; b(): number; c(): number };
}

const SETUP_HINT =
  "Sudachi is unavailable: install @nikkei/napi-sudachi and point SUDACHI_DICT_PATH at a SudachiDict file";

// The native module aborts the whole process, instead of throwing, when the
// dictionary file is missing, so the file is checked before it is loaded.
function assertDictionaryExists(): void {
  const path = process.env.SUDACHI_DICT_PATH;
  if (path === undefined || !existsSync(path)) throw new Error(SETUP_HINT);
}

const isSudachiModule = (value: unknown): value is SudachiModule =>
  typeof value === "object" &&
  value !== null &&
  "Tokenizer" in value &&
  typeof value.Tokenizer === "function" &&
  "SplitMode" in value &&
  typeof value.SplitMode === "object" &&
  value.SplitMode !== null;

function loadModule(): SudachiModule {
  // CommonJS native package: createRequire avoids ESM named-import guessing.
  const loaded: unknown = createRequire(import.meta.url)(
    "@nikkei/napi-sudachi",
  );
  if (!isSudachiModule(loaded)) throw new Error("unexpected module shape");
  return loaded;
}

/**
 * Loads the native module and the dictionary now, not at import. The error
 * never repeats a path or a text: the cause stays attached for debugging.
 */
export function createSudachiTokenizer(
  options: SudachiTokenizerOptions = {},
): Tokenizer {
  assertDictionaryExists();
  let sudachi: InstanceType<SudachiModule["Tokenizer"]>;
  let mode: number;
  try {
    const module = loadModule();
    sudachi = new module.Tokenizer();
    const modes = {
      A: module.SplitMode.a(),
      B: module.SplitMode.b(),
      C: module.SplitMode.c(),
    };
    mode = modes[options.splitMode ?? "A"];
  } catch (error) {
    throw new Error(SETUP_HINT, { cause: error });
  }
  return {
    tokenize(text: string): readonly Token[] {
      return sudachi.tokenize(text, mode).map((morpheme) => ({
        surface: morpheme.surface,
        lemma: morpheme.dictionaryForm,
        partOfSpeech: morpheme.partOfSpeech,
      }));
    },
  };
}
