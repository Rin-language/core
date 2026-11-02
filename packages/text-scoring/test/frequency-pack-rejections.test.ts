import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PackError } from "../src/errors.js";
import {
  type ParsePackOptions,
  parseFrequencyPack,
} from "../src/frequency-pack.js";
import { asObject } from "./fixtures/helpers.js";

type RawPack = Record<string, unknown>;
type EntryField = "words" | "kanji";

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      new URL(`./fixtures/frequency/ja/${name}.json`, import.meta.url),
      "utf8",
    ),
  );

const written = (): RawPack => asObject(fixture("written"));

const problemsOf = (
  raw: unknown,
  options?: ParsePackOptions,
): readonly string[] => {
  try {
    parseFrequencyPack(raw, "p.json", options);
  } catch (error) {
    if (error instanceof PackError) return error.problems;
    throw error;
  }
  throw new Error("expected a PackError");
};

const hasProblem = (problems: readonly string[], text: string): boolean =>
  problems.some((problem) => problem.includes(text));

const without = (raw: RawPack, ...keys: readonly string[]): RawPack => {
  const copy: RawPack = { ...raw };
  for (const key of keys) delete copy[key];
  return copy;
};

const entriesOf = (raw: RawPack, field: EntryField): RawPack =>
  asObject(raw[field]);

const withEntry = (
  raw: RawPack,
  field: EntryField,
  key: string,
  band: number,
): RawPack => ({
  ...raw,
  [field]: { ...entriesOf(raw, field), [key]: band },
});

describe("parseFrequencyPack rejections", () => {
  it("reports a missing source", () => {
    expect(hasProblem(problemsOf(without(written(), "source")), "source")).toBe(
      true,
    );
  });

  it("reports a licence that is only whitespace", () => {
    expect(
      hasProblem(problemsOf({ ...written(), licence: "   " }), "licence"),
    ).toBe(true);
  });

  it("reports a format other than one", () => {
    expect(hasProblem(problemsOf({ ...written(), format: 2 }), "format")).toBe(
      true,
    );
  });

  it("reports a bandCount below two", () => {
    expect(
      hasProblem(problemsOf({ ...written(), bandCount: 1 }), "bandCount"),
    ).toBe(true);
  });

  it("reports a bandCount above twenty", () => {
    expect(
      hasProblem(problemsOf({ ...written(), bandCount: 21 }), "bandCount"),
    ).toBe(true);
  });

  it("reports a word band of zero", () => {
    expect(
      hasProblem(problemsOf(withEntry(written(), "words", "追加", 0)), "words"),
    ).toBe(true);
  });

  it("reports a word band above the band count", () => {
    expect(
      hasProblem(problemsOf(withEntry(written(), "words", "追加", 6)), "words"),
    ).toBe(true);
  });

  it("reports a word band that is not an integer", () => {
    expect(
      hasProblem(
        problemsOf(withEntry(written(), "words", "追加", 1.5)),
        "words",
      ),
    ).toBe(true);
  });

  it("reports a kanji key of two characters", () => {
    expect(
      hasProblem(problemsOf(withEntry(written(), "kanji", "日本", 1)), "kanji"),
    ).toBe(true);
  });

  it("reports a kanji key written in kana", () => {
    expect(
      hasProblem(problemsOf(withEntry(written(), "kanji", "あ", 1)), "kanji"),
    ).toBe(true);
  });

  it("reports a word key containing a space", () => {
    expect(
      hasProblem(problemsOf(withEntry(written(), "words", "a b", 1)), "words"),
    ).toBe(true);
  });

  it("reports a pack with neither words nor kanji", () => {
    expect(
      hasProblem(
        problemsOf(without(written(), "words", "kanji")),
        "words or kanji",
      ),
    ).toBe(true);
  });

  it("reports an unknown top-level field", () => {
    expect(hasProblem(problemsOf({ ...written(), extra: 1 }), "extra")).toBe(
      true,
    );
  });

  it("reports a pack with more entries than the limit", () => {
    expect(
      hasProblem(problemsOf(written(), { maxEntries: 3 }), "too many entries"),
    ).toBe(true);
  });

  it("reports words given as an array", () => {
    expect(hasProblem(problemsOf({ ...written(), words: [] }), "words")).toBe(
      true,
    );
  });

  it("reports a null root", () => {
    expect(hasProblem(problemsOf(null), "(root)")).toBe(true);
  });
});
