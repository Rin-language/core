import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PackError } from "../src/errors.js";
import { loadFrequencyPack } from "../src/load-pack.js";

const fixturePath = (name: string): string =>
  new URL(`./fixtures/frequency/ja/${name}.json`, import.meta.url).pathname;

const problemsOf = (run: () => unknown): readonly string[] => {
  try {
    run();
  } catch (error) {
    if (error instanceof PackError) return error.problems;
    throw error;
  }
  throw new Error("expected a PackError");
};

const writeTemp = (content: string): string => {
  const path = join(mkdtempSync(join(tmpdir(), "pack-")), "pack.json");
  writeFileSync(path, content);
  return path;
};

describe("loadFrequencyPack", () => {
  it("loads a valid pack from a file", () => {
    expect(loadFrequencyPack(fixturePath("written")).version).toBe(
      "fixture-written-1",
    );
  });

  it("reports a missing file", () => {
    expect(
      problemsOf(() => loadFrequencyPack("/nonexistent/written.json")),
    ).toEqual(["file not found"]);
  });

  it("reports a file that is not JSON", () => {
    expect(problemsOf(() => loadFrequencyPack(writeTemp("{nope")))).toEqual([
      "not valid JSON",
    ]);
  });

  it("refuses a file larger than maxBytes before reading it", () => {
    expect(
      problemsOf(() =>
        loadFrequencyPack(fixturePath("written"), { maxBytes: 10 }),
      ),
    ).toEqual(["file too large"]);
  });

  it("applies the pack validation to the file content", () => {
    expect(
      problemsOf(() => loadFrequencyPack(writeTemp('{"format":2}'))).length,
    ).toBeGreaterThan(0);
  });
});
