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
    (!Number.isFinite(speechRate) || speechRate < 0)
  ) {
    throw new ScoringInputError("speech_rate_invalid");
  }
  if (weight > 0 && speechRate === undefined) {
    throw new ScoringInputError("speech_rate_missing");
  }
}

export function createJapaneseTextScorer(
  options: JapaneseTextScorerOptions,
): TextScorer {
  const { tokenizer, levels, config } = options;

  function tokenizeSentence(sentence: string): readonly Token[] {
    return splitIntoChunks(sentence, config.tokenizerChunkChars).flatMap(
      (chunk) => tokenizer.tokenize(chunk),
    );
  }

  function scoreVocabulary(
    tokens: readonly Token[],
    pack: FrequencyPack,
  ): number {
    const lemmas = new Set<string>();
    for (const token of tokens) {
      if (config.excludedPartsOfSpeech.has(token.partOfSpeech[0] ?? ""))
        continue;
      if (isPunctuation(token)) continue;
      lemmas.add(token.lemma === "" ? token.surface : token.lemma);
    }
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

  function scoreKanji(text: string, pack: FrequencyPack): number {
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
    return totalCharacters === 0 ? 1 : 1 - dialogueCharacters / totalCharacters;
  }

  function scoreSpeechRate(input: ScoreInput, weight: number): number | null {
    if (weight <= 0 || input.speechRate === undefined) return null;
    return linearDifficulty(
      input.speechRate,
      config.speechRate.easy,
      config.speechRate.hard,
    );
  }

  return {
    language: LANGUAGE,
    score(input: ScoreInput): ScoreResult {
      if (input.text.trim().length === 0)
        throw new ScoringInputError("text_empty");
      if (input.text.length > config.maxChars) {
        throw new ScoringInputError("text_too_long");
      }
      const pack = options.packs[input.mode];
      if (pack === undefined || pack.language !== LANGUAGE) {
        throw new ScoringInputError("mode_unavailable");
      }
      const weights = config.weights[input.mode];
      validateSpeechRate(input, weights.speechRate);

      const structure = analyzeText(input.text);
      const sentenceTokens = structure.sentences.map(tokenizeSentence);
      const subScores: SubScores = {
        vocabulary: scoreVocabulary(sentenceTokens.flat(), pack),
        kanji: scoreKanji(input.text, pack),
        sentenceLength: scoreSentenceLength(sentenceTokens),
        dialogue: scoreDialogue(
          structure.dialogueCharacters,
          structure.totalCharacters,
        ),
        speechRate: scoreSpeechRate(input, weights.speechRate),
      };
      const score = combineScores(subScores, weights);
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
