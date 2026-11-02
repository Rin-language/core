import { describe, expect, it } from "vitest";
import { isSudachiModule, toTokens } from "../src/sudachi/module-shape.js";

const valid = { Tokenizer: class {}, SplitMode: { a: () => 0 } };

describe("isSudachiModule", () => {
  it("accepts a module with a Tokenizer class and a SplitMode object", () => {
    expect(isSudachiModule(valid)).toBe(true);
  });

  it("accepts a SplitMode that is a class with static methods, as in the real module", () => {
    const SplitMode = Object.assign(() => undefined, { a: () => 0 });
    expect(isSudachiModule({ Tokenizer: class {}, SplitMode })).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "module"],
    ["no Tokenizer", { SplitMode: {} }],
    ["a Tokenizer that is not a class", { Tokenizer: 1, SplitMode: {} }],
    ["no SplitMode", { Tokenizer: class {} }],
    ["a null SplitMode", { Tokenizer: class {}, SplitMode: null }],
  ])("rejects %s", (_name, value) => {
    expect(isSudachiModule(value)).toBe(false);
  });
});

describe("toTokens", () => {
  it("maps the morphemes of a successful call", () => {
    expect(
      toTokens([
        { surface: "行き", dictionaryForm: "行く", partOfSpeech: ["動詞"] },
      ]),
    ).toEqual([{ surface: "行き", lemma: "行く", partOfSpeech: ["動詞"] }]);
  });

  it("throws a message without the text when Sudachi returns an error value", () => {
    const failure = new Error("Tokenization failed: Input is too long");
    expect(() => toTokens(failure)).toThrowError(
      "Sudachi could not tokenize the text",
    );
  });

  it("throws for any result that is not a list", () => {
    expect(() => toTokens(undefined)).toThrowError(
      "Sudachi could not tokenize the text",
    );
  });
});
