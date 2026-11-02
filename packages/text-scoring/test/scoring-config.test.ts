import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
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
