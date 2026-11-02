import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PackError } from "../src/errors.js";
import { parseScoringConfig } from "../src/scoring-config.js";

const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

const shipped = (): unknown =>
  JSON.parse(
    readFileSync(
      new URL("../../../data/scoring/ja.json", import.meta.url),
      "utf8",
    ),
  );

describe("shipped data/scoring/ja.json", () => {
  it("is valid for the five-level Japanese scale", () => {
    expect(parseScoringConfig(shipped(), "ja.json", LEVELS).language).toBe(
      "ja",
    );
  });

  it("is marked as not calibrated", () => {
    expect(parseScoringConfig(shipped(), "ja.json", LEVELS).version).toBe(
      "0-uncalibrated",
    );
  });

  it("gives written text no speech rate weight", () => {
    expect(
      parseScoringConfig(shipped(), "ja.json", LEVELS).weights.written
        .speechRate,
    ).toBe(0);
  });

  it("gives spoken text no dialogue weight", () => {
    expect(
      parseScoringConfig(shipped(), "ja.json", LEVELS).weights.spoken.dialogue,
    ).toBe(0);
  });

  it("exposes the excluded parts of speech as a set", () => {
    expect(
      parseScoringConfig(
        shipped(),
        "ja.json",
        LEVELS,
      ).excludedPartsOfSpeech.has("助詞"),
    ).toBe(true);
  });
});

describe("threshold problems", () => {
  const withThresholds = (written: number[]): unknown => {
    const raw = shipped() as { thresholds: Record<string, number[]> };
    return { ...raw, thresholds: { ...raw.thresholds, written } };
  };
  const problems = (raw: unknown): readonly string[] => {
    try {
      parseScoringConfig(raw, "ja.json", LEVELS);
    } catch (error) {
      return (error as PackError).problems;
    }
    return [];
  };

  it("states how many thresholds the scale needs", () => {
    expect(problems(withThresholds([0.5]))).toContain(
      "thresholds.written: expected 4 values",
    );
  });

  it("refuses two equal thresholds", () => {
    expect(
      problems(withThresholds([0.2, 0.2, 0.6, 0.8])).length,
    ).toBeGreaterThan(0);
  });
});
