import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PackError, ScoringInputError } from "../src/errors.js";
import {
  type FrequencyPack,
  parseFrequencyPack,
} from "../src/frequency-pack.js";
import { createJapaneseTextScorer } from "../src/japanese/japanese-text-scorer.js";
import {
  parseScoringConfig,
  type ScoringConfig,
} from "../src/scoring-config.js";
import type { ScoringMode } from "../src/types.js";
import { FakeTokenizer, JAPANESE_LEXICON } from "./fixtures/fake-tokenizer.js";

const LEVELS = ["N5", "N4", "N3", "N2", "N1"];
const readJson = (relative: string): unknown =>
  JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8"));

const shipped = parseScoringConfig(
  readJson("../../../data/scoring/ja.json"),
  "ja.json",
  LEVELS,
);
const packs = {
  written: parseFrequencyPack(
    readJson("./fixtures/frequency/ja/written.json"),
    "written.json",
  ),
  spoken: parseFrequencyPack(
    readJson("./fixtures/frequency/ja/spoken.json"),
    "spoken.json",
  ),
};

function build(
  config: ScoringConfig = shipped,
  available: Partial<Record<ScoringMode, FrequencyPack>> = packs,
) {
  const tokenizer = new FakeTokenizer(JAPANESE_LEXICON);
  const scorer = createJapaneseTextScorer({
    tokenizer,
    levels: LEVELS,
    config,
    packs: available,
  });
  return { scorer, tokenizer };
}

const score = (
  text: string,
  mode: ScoringMode = "written",
  speechRate?: number,
) =>
  build().scorer.score(
    speechRate === undefined ? { text, mode } : { text, mode, speechRate },
  );

const problemOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    if (error instanceof ScoringInputError) return error.problem;
    throw error;
  }
  throw new Error("expected a ScoringInputError");
};

const EASY = "私は行きます。";
const HARD = "憂鬱蹉跌。";

describe("sub-scores", () => {
  it("rates band 1 vocabulary as easiest", () => {
    expect(score(EASY).subScores.vocabulary).toBe(0);
  });

  it("rates rare and unknown vocabulary as hardest", () => {
    expect(score(HARD).subScores.vocabulary).toBe(1);
  });

  it("rates band 1 kanji as easiest", () => {
    expect(score(EASY).subScores.kanji).toBe(0);
  });

  it("rates rare and unknown kanji as hardest", () => {
    expect(score(HARD).subScores.kanji).toBe(1);
  });

  it("gives a text without kanji a kanji difficulty of 0", () => {
    expect(score("あ。").subScores.kanji).toBe(0);
  });

  it("counts an unknown lemma as the configured unknown difficulty", () => {
    const { scorer } = build({ ...shipped, unknownDifficulty: 0.5 });
    expect(
      scorer.score({ text: "犬。", mode: "written" }).subScores.vocabulary,
    ).toBe(0.5);
  });

  it("ignores tokens of an excluded part of speech", () => {
    expect(score("私は").subScores.vocabulary).toBe(0);
  });

  it("counts a verb through its lemma", () => {
    expect(score("行きます").subScores.vocabulary).toBe(0);
  });

  it("rates a short sentence as easy", () => {
    expect(score(EASY).subScores.sentenceLength).toBe(0);
  });

  it("rates a very long sentence as hard", () => {
    expect(score(`${"私".repeat(60)}。`).subScores.sentenceLength).toBe(1);
  });

  it("rates dialogue as easier than narration", () => {
    expect(score("「私は行きます。」").subScores.dialogue).toBeLessThan(
      score(EASY).subScores.dialogue,
    );
  });

  it("gives narration a dialogue difficulty of 1", () => {
    expect(score(EASY).subScores.dialogue).toBe(1);
  });
});

describe("score and level", () => {
  it("combines the written weights", () => {
    expect(score(EASY).score).toBeCloseTo(0.1, 10);
  });

  it("scores a hard text higher than an easy one", () => {
    expect(score(HARD).score).toBeGreaterThan(score(EASY).score);
  });

  it("maps the easy text to the lowest level", () => {
    expect(score(EASY).level).toBe("N5");
  });

  it("maps the hard text to the highest level", () => {
    expect(score(HARD).level).toBe("N1");
  });

  it("returns the same result for the same input", () => {
    expect(score(EASY)).toEqual(score(EASY));
  });

  it("reports the version of the list used", () => {
    expect(score(EASY).versions.frequency).toBe("fixture-written-1");
  });

  it("reports the version of the scoring data", () => {
    expect(score(EASY).versions.scoring).toBe("0-uncalibrated");
  });

  it("reports the mode", () => {
    expect(score(EASY, "spoken", 300).mode).toBe("spoken");
  });
});

describe("spoken mode", () => {
  it("maps the speech rate between the easy and hard bounds", () => {
    expect(score(EASY, "spoken", 375).subScores.speechRate).toBe(0.5);
  });

  it("uses the spoken list version", () => {
    expect(score(EASY, "spoken", 375).versions.frequency).toBe(
      "fixture-spoken-1",
    );
  });

  it("does not let dialogue change a spoken score", () => {
    expect(score("「私は行きます。」", "spoken", 300).score).toBe(
      score(EASY, "spoken", 300).score,
    );
  });

  it("still reports the dialogue sub-score", () => {
    expect(
      score("「私は行きます。」", "spoken", 300).subScores.dialogue,
    ).toBeLessThan(1);
  });

  it("ignores a speech rate in written mode", () => {
    expect(score(EASY, "written", 300).subScores.speechRate).toBeNull();
  });
});

describe("refused input", () => {
  it("refuses an empty text", () => {
    expect(problemOf(() => score(""))).toBe("text_empty");
  });

  it("refuses a blank text", () => {
    expect(problemOf(() => score("  \n "))).toBe("text_empty");
  });

  it("refuses a text with no word", () => {
    expect(problemOf(() => score("。！"))).toBe("no_words");
  });

  it("refuses a text made only of excluded parts of speech", () => {
    expect(problemOf(() => score("はを"))).toBe("no_words");
  });

  it("accepts a text of exactly maxChars", () => {
    const { scorer } = build({ ...shipped, maxChars: 4 });
    expect(scorer.score({ text: "私は行き", mode: "written" }).mode).toBe(
      "written",
    );
  });

  it("refuses a text of maxChars plus one", () => {
    const { scorer } = build({ ...shipped, maxChars: 4 });
    expect(
      problemOf(() => scorer.score({ text: "私は行きま", mode: "written" })),
    ).toBe("text_too_long");
  });

  it("refuses a mode with no list", () => {
    const { scorer } = build(shipped, { written: packs.written });
    expect(
      problemOf(() =>
        scorer.score({ text: EASY, mode: "spoken", speechRate: 300 }),
      ),
    ).toBe("mode_unavailable");
  });

  it("refuses spoken text without a speech rate", () => {
    expect(problemOf(() => score(EASY, "spoken"))).toBe("speech_rate_missing");
  });

  it.each([Number.NaN, -1, Number.POSITIVE_INFINITY])(
    "refuses the speech rate %s",
    (rate) => {
      expect(problemOf(() => score(EASY, "spoken", rate))).toBe(
        "speech_rate_invalid",
      );
    },
  );

  it("never puts the text in the error message", () => {
    expect(() => score("秘密の文", "spoken", Number.NaN)).toThrowError(
      expect.objectContaining({
        message: expect.not.stringContaining("秘密"),
      }),
    );
  });
});

describe("tokenizer input", () => {
  it("never sends the tokenizer more than tokenizerChunkChars", () => {
    const { scorer, tokenizer } = build({
      ...shipped,
      tokenizerChunkChars: 100,
    });
    scorer.score({ text: "私".repeat(250), mode: "written" });
    expect(Math.max(...tokenizer.calls.map((call) => call.length))).toBe(100);
  });

  it("counts the tokens of a chunked sentence together", () => {
    const { scorer } = build({ ...shipped, tokenizerChunkChars: 100 });
    expect(
      scorer.score({ text: "私".repeat(250), mode: "written" }).subScores
        .sentenceLength,
    ).toBe(1);
  });
});

describe("exact values and small weights", () => {
  it("measures dialogue as the share of the text between quotes", () => {
    expect(score("「私は行きます。」").subScores.dialogue).toBeCloseTo(
      1 - 7 / 9,
      10,
    );
  });

  it("requires a speech rate for a weight below 1", () => {
    const { scorer } = build({
      ...shipped,
      weights: {
        ...shipped.weights,
        spoken: { ...shipped.weights.spoken, speechRate: 0.5 },
      },
    });
    expect(problemOf(() => scorer.score({ text: EASY, mode: "spoken" }))).toBe(
      "speech_rate_missing",
    );
  });

  it("scores the speech rate for a weight below 1", () => {
    const { scorer } = build({
      ...shipped,
      weights: {
        ...shipped.weights,
        spoken: { ...shipped.weights.spoken, speechRate: 0.5 },
      },
    });
    expect(
      scorer.score({ text: EASY, mode: "spoken", speechRate: 500 }).subScores
        .speechRate,
    ).toBe(1);
  });
});

describe("hardening", () => {
  it("refuses a pack whose own mode differs from the requested one", () => {
    const { scorer } = build(shipped, {
      written: packs.written,
      spoken: packs.written,
    });
    expect(
      problemOf(() =>
        scorer.score({ text: EASY, mode: "spoken", speechRate: 300 }),
      ),
    ).toBe("mode_unavailable");
  });

  it.each(["__proto__", "constructor", "toString"])(
    "refuses the mode %s",
    (mode) => {
      expect(
        problemOf(() =>
          build().scorer.score({ text: EASY, mode: mode as ScoringMode }),
        ),
      ).toBe("mode_unavailable");
    },
  );

  it("refuses a scorer whose levels do not fit the thresholds", () => {
    expect(() =>
      createJapaneseTextScorer({
        tokenizer: new FakeTokenizer(JAPANESE_LEXICON),
        levels: ["A", "B"],
        config: shipped,
        packs,
      }),
    ).toThrow(PackError);
  });

  it("refuses a scoring file written for another language", () => {
    expect(() =>
      createJapaneseTextScorer({
        tokenizer: new FakeTokenizer(JAPANESE_LEXICON),
        levels: LEVELS,
        config: { ...shipped, language: "zh" },
        packs,
      }),
    ).toThrow(PackError);
  });

  it("checks the size before looking at blank text", () => {
    const { scorer } = build({ ...shipped, maxChars: 3 });
    expect(
      problemOf(() => scorer.score({ text: "     ", mode: "written" })),
    ).toBe("text_too_long");
  });

  it("refuses a speech rate that is invalid even when it would be ignored", () => {
    expect(problemOf(() => score(EASY, "written", Number.NaN))).toBe(
      "speech_rate_invalid",
    );
  });

  it("ignores a line of symbols when measuring sentence length", () => {
    expect(
      score("私は行きます。\n＊＊＊\n私は行きます。").subScores.sentenceLength,
    ).toBe(score("私は行きます。\n私は行きます。").subScores.sentenceLength);
  });

  it("counts the tokens of every chunk of a long sentence", () => {
    const { scorer } = build({
      ...shipped,
      tokenizerChunkChars: 100,
      sentence: { easyLength: 6, hardLength: 206 },
    });
    expect(
      scorer.score({ text: "私".repeat(120), mode: "written" }).subScores
        .sentenceLength,
    ).toBeCloseTo(0.57, 10);
  });
});

describe("speech rate boundary", () => {
  it("accepts a speech rate of zero", () => {
    expect(score(EASY, "spoken", 0).subScores.speechRate).toBe(0);
  });
});
