export type ScoringMode = "spoken" | "written";

export interface Token {
  readonly surface: string;
  /** Dictionary form; empty when the tokenizer has none. */
  readonly lemma: string;
  /** Part-of-speech path, most general first; empty when unknown. */
  readonly partOfSpeech: readonly string[];
}

export interface Tokenizer {
  tokenize(text: string): readonly Token[];
}

export interface ScoreInput {
  readonly text: string;
  readonly mode: ScoringMode;
  /** Characters per minute, measured by the caller; never measured here. */
  readonly speechRate?: number;
}

/** Every sub-score is a difficulty between 0 (easiest) and 1 (hardest). */
export interface SubScores {
  vocabulary: number;
  kanji: number;
  sentenceLength: number;
  dialogue: number;
  speechRate: number | null;
}

export interface ScoreResult {
  readonly score: number;
  readonly subScores: SubScores;
  readonly level: string;
  readonly mode: ScoringMode;
  readonly versions: {
    readonly frequency: string;
    readonly scoring: string;
  };
}

export interface TextScorer {
  readonly language: string;
  score(input: ScoreInput): ScoreResult;
}
