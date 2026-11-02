import { describe, expect, it } from "vitest";
import { isSudachiModule } from "../src/sudachi/module-shape.js";

const valid = { Tokenizer: class {}, SplitMode: { a: () => 0 } };

describe("isSudachiModule", () => {
  it("accepts a module with a Tokenizer class and a SplitMode object", () => {
    expect(isSudachiModule(valid)).toBe(true);
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
