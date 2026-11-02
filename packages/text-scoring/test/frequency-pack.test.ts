import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PackError } from "../src/errors.js";
import { parseFrequencyPack } from "../src/frequency-pack.js";
import { asObject, packErrorOf } from "./fixtures/helpers.js";

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      new URL(`./fixtures/frequency/ja/${name}.json`, import.meta.url),
      "utf8",
    ),
  );

describe("parseFrequencyPack", () => {
  it("reads the band of a word", () => {
    const pack = parseFrequencyPack(fixture("written"), "written.json");
    expect(pack.words.get("食べる")).toBe(1);
  });

  it("reads the band of a kanji", () => {
    const pack = parseFrequencyPack(fixture("written"), "written.json");
    expect(pack.kanji.get("鬱")).toBe(5);
  });

  it("carries the version, source and licence", () => {
    const pack = parseFrequencyPack(fixture("written"), "written.json");
    expect([pack.version, pack.source, pack.licence]).toEqual([
      "fixture-written-1",
      "invented for the tests",
      "CC0-1.0",
    ]);
  });

  it("accepts a pack without kanji", () => {
    const pack = parseFrequencyPack(fixture("spoken"), "spoken.json");
    expect(pack.kanji.size).toBe(0);
  });

  it("keeps a __proto__ key as data", () => {
    const raw = JSON.parse(
      '{"format":1,"version":"v","language":"ja","mode":"written","source":"s","licence":"l","bandCount":3,"words":{"__proto__":2}}',
    );
    const pack = parseFrequencyPack(raw, "p.json");
    expect(pack.words.get("__proto__")).toBe(2);
  });

  it("does not pollute Object.prototype through a __proto__ key", () => {
    const raw = JSON.parse(
      '{"format":1,"version":"v","language":"ja","mode":"written","source":"s","licence":"l","bandCount":3,"words":{"__proto__":2}}',
    );
    parseFrequencyPack(raw, "p.json");
    expect(Object.keys(Object.prototype)).toEqual([]);
  });

  it("does not put a word in the message of a rejected pack", () => {
    const raw = { ...asObject(fixture("written")), words: { 秘密の語: 99 } };
    expect(
      packErrorOf(() => parseFrequencyPack(raw, "p.json")).message,
    ).not.toContain("秘密の語");
  });
});

describe("parseFrequencyPack limits", () => {
  const raw = (): unknown => fixture("written");

  it("accepts exactly maxEntries entries", () => {
    expect(
      parseFrequencyPack(raw(), "p.json", { maxEntries: 22 }).words.size,
    ).toBe(12);
  });

  it("refuses everything when maxEntries is 0", () => {
    expect(() =>
      parseFrequencyPack(raw(), "p.json", { maxEntries: 0 }),
    ).toThrow(PackError);
  });

  it("refuses an empty word key", () => {
    const pack = { ...asObject(raw()), words: { "": 1 } };
    expect(() => parseFrequencyPack(pack, "p.json")).toThrow(PackError);
  });
});
