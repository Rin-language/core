import { closeSync, openSync, readSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import type { Token, Tokenizer } from "../types.js";
import { isSudachiModule, type SudachiModule } from "./module-shape.js";

export type SudachiSplitMode = "A" | "B" | "C";

export interface SudachiTokenizerOptions {
  /** Sudachi's unit of segmentation: A is the shortest, C the longest. */
  readonly splitMode?: SudachiSplitMode;
}

const NEWER_FORMAT_HINT =
  "The SudachiDict file is in a newer format than @nikkei/napi-sudachi can read: use an older SudachiDict release";

const SETUP_HINT =
  "Sudachi is unavailable: install @nikkei/napi-sudachi and point SUDACHI_DICT_PATH at a SudachiDict file";

// The native module aborts the whole process, instead of throwing, when the
// dictionary is missing, is not a file or is not a valid dictionary. Only the
// first two can be checked here: a corrupt dictionary still aborts.
function assertDictionaryIsAFile(): void {
  const path = process.env.SUDACHI_DICT_PATH;
  if (path === undefined || !isRegularFile(path)) throw new Error(SETUP_HINT);
  if (hasNewerFormatMagic(path)) throw new Error(NEWER_FORMAT_HINT);
}

// Dictionaries built in the newer format start with this signature; the engine
// inside @nikkei/napi-sudachi 0.12.0 predates it and aborts the process on one
// ("Invalid header version"). Seen with a SudachiDict dated 2026-10-15.
const NEWER_FORMAT_MAGIC = "SudachiBinaryDic";

function hasNewerFormatMagic(path: string): boolean {
  const descriptor = openSync(path, "r");
  try {
    const head = Buffer.alloc(NEWER_FORMAT_MAGIC.length);
    readSync(descriptor, head, 0, head.length, 0);
    return head.toString("latin1") === NEWER_FORMAT_MAGIC;
  } finally {
    closeSync(descriptor);
  }
}

const SPLIT_MODES: readonly SudachiSplitMode[] = ["A", "B", "C"];

function assertSplitMode(splitMode: SudachiSplitMode | undefined): void {
  if (splitMode !== undefined && !SPLIT_MODES.includes(splitMode)) {
    throw new Error("splitMode must be A, B or C");
  }
}

function isRegularFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

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
 * messages never repeat a path or a text, but the native module itself may
 * print the dictionary path to stderr when it aborts.
 */
export function createSudachiTokenizer(
  options: SudachiTokenizerOptions = {},
): Tokenizer {
  assertSplitMode(options.splitMode);
  assertDictionaryIsAFile();
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
