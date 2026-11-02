import {
  bandDifficulty,
  combineScores,
  linearDifficulty,
  meanOrZero,
  selectLevel,
} from "../difficulty.js";
import { ScoringInputError } from "../errors.js";
import type { FrequencyPack } from "../frequency-pack.js";
import type { ScoringConfig } from "../scoring-config.js";
import type {
  ScoreInput,
  ScoreResult,
  ScoringMode,
  SubScores,
  TextScorer,
  Token,
  Tokenizer,
} from "../types.js";
import {
  analyzeText,
  extractKanji,
  splitIntoChunks,
} from "./text-structure.js";

const LANGUAGE = "ja";
const SUB_SCORE_NAMES = [
  "vocabulary",
  "kanji",
  "sentenceLength",
  "dialogue",
  "speechRate",
] as const;
const HAS_LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;

export interface JapaneseTextScorerOptions {
  readonly tokenizer: Tokenizer;
  /** The language profile's scale, ordered lowest to highest. */
  readonly levels: readonly string[];
  readonly config: ScoringConfig;
  readonly packs: Readonly<Partial<Record<ScoringMode, FrequencyPack>>>;
}

const isPunctuation = (token: Token): boolean =>
  !HAS_LETTER_OR_NUMBER.test(token.surface);

function validateSpeechRate(input: ScoreInput, weight: number): void {
  const { speechRate } = input;
  if (
    speechRate !== undefined &&
    !(Number.isFinite(speechRate) && speechRate >= 0)
  ) {
    throw new ScoringInputError("speech_rate_invalid");
  }
  if (weight > 0 && speechRate === undefined) {
    throw new ScoringInputError("speech_rate_missing");
  }
}

function selectPack(
  input: ScoreInput,
  packs: JapaneseTextScorerOptions["packs"],
): FrequencyPack {
  const pack = packs[input.mode];
  if (pack === undefined || pack.language !== LANGUAGE) {
    throw new ScoringInputError("mode_unavailable");
  }
  return pack;
}

function assertTextAllowed(text: string, config: ScoringConfig): void {
  if (text.trim().length === 0) throw new ScoringInputError("text_empty");
  if (text.length > config.maxChars)
    throw new ScoringInputError("text_too_long");
}

function tokenizeSentence(
  sentence: string,
  tokenizer: Tokenizer,
  chunkChars: number,
): readonly Token[] {
  return splitIntoChunks(sentence, chunkChars).flatMap((chunk) =>
    tokenizer.tokenize(chunk),
  );
}

function countedLemmas(
  tokens: readonly Token[],
  excluded: ReadonlySet<string>,
): ReadonlySet<string> {
  const lemmas = new Set<string>();
  for (const token of tokens) {
    const [mainPartOfSpeech = ""] = token.partOfSpeech;
    const isExcluded = excluded.has(mainPartOfSpeech);
    if (isExcluded || isPunctuation(token)) continue;
    lemmas.add(token.lemma === "" ? token.surface : token.lemma);
  }
  return lemmas;
}

function scoreVocabulary(
  tokens: readonly Token[],
  pack: FrequencyPack,
  config: ScoringConfig,
): number {
  const lemmas = countedLemmas(tokens, config.excludedPartsOfSpeech);
  if (lemmas.size === 0) throw new ScoringInputError("no_words");
  return meanOrZero(
    [...lemmas].map((lemma) =>
      bandDifficulty(
        pack.words.get(lemma),
        pack.bandCount,
        config.unknownDifficulty,
      ),
    ),
  );
}

function scoreKanji(
  text: string,
  pack: FrequencyPack,
  config: ScoringConfig,
): number {
  return meanOrZero(
    extractKanji(text).map((kanji) =>
      bandDifficulty(
        pack.kanji.get(kanji),
        pack.bandCount,
        config.unknownDifficulty,
      ),
    ),
  );
}

function scoreSentenceLength(
  sentenceTokens: readonly (readonly Token[])[],
  config: ScoringConfig,
): number {
  const lengths = sentenceTokens.map(
    (tokens) => tokens.filter((token) => !isPunctuation(token)).length,
  );
  return linearDifficulty(
    meanOrZero(lengths),
    config.sentence.easyLength,
    config.sentence.hardLength,
  );
}

function scoreDialogue(
  dialogueCharacters: number,
  totalCharacters: number,
): number {
  return 1 - dialogueCharacters / totalCharacters;
}

function scoreSpeechRate(
  input: ScoreInput,
  weight: number,
  config: ScoringConfig,
): number | null {
  if (weight <= 0 || input.speechRate === undefined) return null;
  return linearDifficulty(
    input.speechRate,
    config.speechRate.easy,
    config.speechRate.hard,
  );
}

function computeSubScores(
  input: ScoreInput,
  pack: FrequencyPack,
  options: JapaneseTextScorerOptions,
): SubScores {
  const { config, tokenizer } = options;
  const structure = analyzeText(input.text);
  const sentenceTokens = structure.sentences.map((sentence) =>
    tokenizeSentence(sentence, tokenizer, config.tokenizerChunkChars),
  );
  return {
    vocabulary: scoreVocabulary(sentenceTokens.flat(), pack, config),
    kanji: scoreKanji(input.text, pack, config),
    sentenceLength: scoreSentenceLength(sentenceTokens, config),
    dialogue: scoreDialogue(
      structure.dialogueCharacters,
      structure.totalCharacters,
    ),
    speechRate: scoreSpeechRate(
      input,
      config.weights[input.mode].speechRate,
      config,
    ),
  };
}

export function createJapaneseTextScorer(
  options: JapaneseTextScorerOptions,
): TextScorer {
  const { levels, config } = options;
  return {
    language: LANGUAGE,
    score(input: ScoreInput): ScoreResult {
      assertTextAllowed(input.text, config);
      const pack = selectPack(input, options.packs);
      const weights = config.weights[input.mode];
      validateSpeechRate(input, weights.speechRate);
      const subScores = computeSubScores(input, pack, options);
      const score = combineScores(SUB_SCORE_NAMES, subScores, weights);
      return {
        score,
        subScores,
        level: selectLevel(score, levels, config.thresholds[input.mode]),
        mode: input.mode,
        versions: { frequency: pack.version, scoring: config.version },
      };
    },
  };
}
