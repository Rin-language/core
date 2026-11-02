import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PackError } from "../src/errors.js";
import { loadFrequencyPack, loadScoringConfig } from "../src/load-pack.js";
import { packErrorOf } from "./fixtures/helpers.js";

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

describe("loadScoringConfig", () => {
  const shippedPath = new URL("../../../data/scoring/ja.json", import.meta.url)
    .pathname;
  const levels = ["N5", "N4", "N3", "N2", "N1"];

  it("loads the shipped Japanese scoring file", () => {
    expect(loadScoringConfig(shippedPath, levels).language).toBe("ja");
  });

  it("reports a missing file", () => {
    expect(
      problemsOf(() => loadScoringConfig("/nonexistent/ja.json", levels)),
    ).toEqual(["file not found"]);
  });
});

describe("loadFrequencyPack file limits", () => {
  const size = readFileSync(fixturePath("written")).length;

  it("accepts a file of exactly maxBytes", () => {
    expect(
      loadFrequencyPack(fixturePath("written"), { maxBytes: size }).version,
    ).toBe("fixture-written-1");
  });

  it("refuses every file when maxBytes is 0", () => {
    expect(
      problemsOf(() =>
        loadFrequencyPack(fixturePath("written"), { maxBytes: 0 }),
      ),
    ).toEqual(["file too large"]);
  });

  it("names the file in the label, without its folder", () => {
    expect(
      packErrorOf(() => loadFrequencyPack("/nonexistent/folder/written.json"))
        .label,
    ).toBe("written.json");
  });
});

describe("loadFrequencyPack on special files and bad limits", () => {
  it("refuses a character device instead of reading it without limit", () => {
    expect(
      problemsOf(() => loadFrequencyPack("/dev/zero", { maxBytes: 1024 })),
    ).toEqual(["not a regular file"]);
  });

  it("refuses a folder as not a regular file", () => {
    expect(problemsOf(() => loadFrequencyPack(tmpdir()))).toEqual([
      "not a regular file",
    ]);
  });

  it("does not hang on a named pipe", () => {
    const pipe = join(mkdtempSync(join(tmpdir(), "pack-")), "pipe.json");
    execFileSync("mkfifo", [pipe]);
    expect(problemsOf(() => loadFrequencyPack(pipe))).toEqual([
      "not a regular file",
    ]);
  });

  it.each([Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY])(
    "refuses maxBytes %s",
    (maxBytes) => {
      expect(
        problemsOf(() =>
          loadFrequencyPack(fixturePath("written"), { maxBytes }),
        ),
      ).toEqual(["maxBytes must be a non-negative integer"]);
    },
  );

  it.each([Number.NaN, -1, 1.5])("refuses maxEntries %s", (maxEntries) => {
    expect(
      problemsOf(() =>
        loadFrequencyPack(fixturePath("written"), { maxEntries }),
      ),
    ).toEqual(["maxEntries must be a non-negative integer"]);
  });

  it("attaches no cause that could quote the file or its path", () => {
    expect(
      packErrorOf(() => loadFrequencyPack("/nonexistent/secret-dir/x.json"))
        .cause,
    ).toBeUndefined();
  });

  it("attaches no cause that could quote the file content", () => {
    expect(
      packErrorOf(() => loadFrequencyPack(writeTemp('{"a": secretvalue}')))
        .cause,
    ).toBeUndefined();
  });
});

describe("loadFrequencyPack error classes", () => {
  it("reports a path under a file as not readable, not as missing", () => {
    expect(
      problemsOf(() => loadFrequencyPack(`${fixturePath("written")}/child`)),
    ).toEqual(["file not readable"]);
  });

  it("refuses bytes that are not valid UTF-8, even inside a string", () => {
    const path = join(mkdtempSync(join(tmpdir(), "pack-")), "bad.json");
    writeFileSync(
      path,
      Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]),
    );
    expect(problemsOf(() => loadFrequencyPack(path))).toEqual([
      "not valid JSON",
    ]);
  });
});
