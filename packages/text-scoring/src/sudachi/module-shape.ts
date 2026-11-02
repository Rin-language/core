export interface SudachiModule {
  Tokenizer: new () => {
    tokenize(
      text: string,
      mode?: number,
    ): readonly {
      readonly surface: string;
      readonly dictionaryForm: string;
      readonly partOfSpeech: readonly string[];
    }[];
  };
  SplitMode: { a(): number; b(): number; c(): number };
}

/** Checks the parts of the native module this package calls, nothing more. */
export const isSudachiModule = (value: unknown): value is SudachiModule =>
  typeof value === "object" &&
  value !== null &&
  "Tokenizer" in value &&
  typeof value.Tokenizer === "function" &&
  "SplitMode" in value &&
  typeof value.SplitMode === "object" &&
  value.SplitMode !== null;
