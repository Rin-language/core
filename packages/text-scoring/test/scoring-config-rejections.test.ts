import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PackError } from "../src/errors.js";
import { parseScoringConfig } from "../src/scoring-config.js";
import { asObject } from "./fixtures/helpers.js";

type RawConfig = Record<string, unknown>;

const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

const shipped = (): unknown =>
  JSON.parse(
    readFileSync(
      new URL("../../../data/scoring/ja.json", import.meta.url),
      "utf8",
    ),
  );

const clone = (): RawConfig => asObject(structuredClone(shipped()));

const problemsOf = (
  raw: unknown,
  levels: readonly string[] = LEVELS,
): readonly string[] => {
  try {
    parseScoringConfig(raw, "ja.json", levels);
  } catch (error) {
    if (error instanceof PackError) return error.problems;
    throw error;
  }
  throw new Error("expected a PackError");
};

const hasProblem = (problems: readonly string[], text: string): boolean =>
  problems.some((problem) => problem.includes(text));

const without = (raw: RawConfig, ...keys: readonly string[]): RawConfig => {
  const copy: RawConfig = { ...raw };
  for (const key of keys) delete copy[key];
  return copy;
};

const objectAt = (raw: RawConfig, key: string): RawConfig => asObject(raw[key]);

const withNested = (
  raw: RawConfig,
  outer: string,
  inner: string,
  value: unknown,
): RawConfig => ({
  ...raw,
  [outer]: { ...objectAt(raw, outer), [inner]: value },
});

const withModeWeight = (
  raw: RawConfig,
  mode: string,
  key: string,
  value: number,
): RawConfig => {
  const weights = objectAt(raw, "weights");
  return {
    ...raw,
    weights: {
      ...weights,
      [mode]: { ...objectAt(weights, mode), [key]: value },
    },
  };
};

const zeroedModeWeights = (raw: RawConfig, mode: string): RawConfig => {
  const weights = objectAt(raw, "weights");
  const zeros = Object.fromEntries(
    Object.keys(objectAt(weights, mode)).map((key) => [key, 0]),
  );
  return { ...raw, weights: { ...weights, [mode]: zeros } };
};

describe("parseScoringConfig rejections", () => {
  it("reports a missing language", () => {
    expect(
      hasProblem(problemsOf(without(clone(), "language")), "language"),
    ).toBe(true);
  });

  it("reports a format other than one", () => {
    expect(hasProblem(problemsOf({ ...clone(), format: 2 }), "format")).toBe(
      true,
    );
  });

  it("reports written weights that are all zero", () => {
    expect(
      hasProblem(
        problemsOf(zeroedModeWeights(clone(), "written")),
        "at least one weight",
      ),
    ).toBe(true);
  });

  it("reports a negative written kanji weight", () => {
    expect(
      hasProblem(
        problemsOf(withModeWeight(clone(), "written", "kanji", -1)),
        "weights.written.kanji",
      ),
    ).toBe(true);
  });

  it("reports written thresholds of the wrong length", () => {
    expect(
      hasProblem(
        problemsOf(
          withNested(clone(), "thresholds", "written", [0.2, 0.4, 0.6]),
        ),
        "thresholds.written",
      ),
    ).toBe(true);
  });

  it("reports spoken thresholds that are not ascending", () => {
    expect(
      hasProblem(
        problemsOf(
          withNested(clone(), "thresholds", "spoken", [0.4, 0.2, 0.6, 0.8]),
        ),
        "thresholds.spoken",
      ),
    ).toBe(true);
  });

  it("reports a written threshold equal to one", () => {
    expect(
      hasProblem(
        problemsOf(
          withNested(clone(), "thresholds", "written", [0.2, 0.4, 0.6, 1]),
        ),
        "thresholds.written",
      ),
    ).toBe(true);
  });

  it("reports a written threshold equal to zero", () => {
    expect(
      hasProblem(
        problemsOf(
          withNested(clone(), "thresholds", "written", [0, 0.4, 0.6, 0.8]),
        ),
        "thresholds.written",
      ),
    ).toBe(true);
  });

  it("reports an easy sentence length above the hard length", () => {
    expect(
      hasProblem(
        problemsOf(withNested(clone(), "sentence", "easyLength", 40)),
        "easyLength",
      ),
    ).toBe(true);
  });

  it("reports an easy speech rate above the hard rate", () => {
    expect(
      hasProblem(
        problemsOf(withNested(clone(), "speechRate", "easy", 500)),
        "easy must be below hard",
      ),
    ).toBe(true);
  });

  it("reports a tokenizer chunk size below the minimum", () => {
    expect(
      hasProblem(
        problemsOf({ ...clone(), tokenizerChunkChars: 10 }),
        "tokenizerChunkChars",
      ),
    ).toBe(true);
  });

  it("reports a tokenizer chunk size above the maximum", () => {
    expect(
      hasProblem(
        problemsOf({ ...clone(), tokenizerChunkChars: 50000 }),
        "tokenizerChunkChars",
      ),
    ).toBe(true);
  });

  it("reports a max character count of zero", () => {
    expect(
      hasProblem(problemsOf({ ...clone(), maxChars: 0 }), "maxChars"),
    ).toBe(true);
  });

  it("reports an unknown difficulty above one", () => {
    expect(
      hasProblem(
        problemsOf({ ...clone(), unknownDifficulty: 1.5 }),
        "unknownDifficulty",
      ),
    ).toBe(true);
  });

  it("reports an unknown top-level field", () => {
    expect(hasProblem(problemsOf({ ...clone(), extra: 1 }), "extra")).toBe(
      true,
    );
  });

  it("reports thresholds for a three-level scale", () => {
    expect(hasProblem(problemsOf(clone(), ["A", "B", "C"]), "thresholds")).toBe(
      true,
    );
  });

  it("reports an excluded part of speech that is blank", () => {
    expect(
      hasProblem(
        problemsOf({ ...clone(), excludedPartsOfSpeech: [" "] }),
        "excludedPartsOfSpeech",
      ),
    ).toBe(true);
  });
});
