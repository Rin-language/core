import { describe, expect, it } from "vitest";
import {
  bandDifficulty,
  combineScores,
  linearDifficulty,
  meanOrZero,
  selectLevel,
} from "../src/difficulty.js";

describe("bandDifficulty", () => {
  it("gives the most frequent band a difficulty of 0", () => {
    expect(bandDifficulty(1, 5, 1)).toBe(0);
  });

  it("gives the rarest band a difficulty of 1", () => {
    expect(bandDifficulty(5, 5, 1)).toBe(1);
  });

  it("places a middle band halfway", () => {
    expect(bandDifficulty(3, 5, 1)).toBe(0.5);
  });

  it("gives an unknown entry the unknown difficulty", () => {
    expect(bandDifficulty(undefined, 5, 0.8)).toBe(0.8);
  });
});

describe("linearDifficulty", () => {
  it("maps the easy bound to 0", () => {
    expect(linearDifficulty(6, 6, 40)).toBe(0);
  });

  it("maps the hard bound to 1", () => {
    expect(linearDifficulty(40, 6, 40)).toBe(1);
  });

  it("maps the middle to 0.5", () => {
    expect(linearDifficulty(23, 6, 40)).toBe(0.5);
  });

  it("clamps above the hard bound", () => {
    expect(linearDifficulty(100, 6, 40)).toBe(1);
  });

  it("clamps below the easy bound", () => {
    expect(linearDifficulty(1, 6, 40)).toBe(0);
  });
});

describe("meanOrZero", () => {
  it("is 0 for no value", () => {
    expect(meanOrZero([])).toBe(0);
  });

  it("averages the values", () => {
    expect(meanOrZero([0, 1])).toBe(0.5);
  });
});

describe("combineScores", () => {
  it("weights the sub-scores", () => {
    expect(combineScores({ a: 1, b: 0 }, { a: 3, b: 1 })).toBe(0.75);
  });

  it("ignores a null sub-score whose weight is 0", () => {
    expect(combineScores({ a: 1, b: null }, { a: 1, b: 0 })).toBe(1);
  });

  it("throws on a null sub-score whose weight is above 0", () => {
    expect(() => combineScores({ a: 1, b: null }, { a: 1, b: 1 })).toThrow();
  });
});

describe("selectLevel", () => {
  const levels = ["N5", "N4", "N3", "N2", "N1"];
  const thresholds = [0.2, 0.4, 0.6, 0.8];

  it("picks the lowest level below the first threshold", () => {
    expect(selectLevel(0.1, levels, thresholds)).toBe("N5");
  });

  it("moves up at a threshold, which is inclusive", () => {
    expect(selectLevel(0.2, levels, thresholds)).toBe("N4");
  });

  it("picks the highest level above the last threshold", () => {
    expect(selectLevel(0.99, levels, thresholds)).toBe("N1");
  });
});

describe("selectLevel with surplus thresholds", () => {
  it("never goes past the highest level", () => {
    expect(selectLevel(0.99, ["A", "B"], [0.1, 0.2, 0.3])).toBe("B");
  });
});
