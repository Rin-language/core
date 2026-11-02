import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createSudachiTokenizer } from "../src/sudachi/index.js";

const dictionaryPath = process.env.SUDACHI_DICT_PATH;
const isNativeModuleInstalled = (): boolean => {
  try {
    createRequire(import.meta.url)("@nikkei/napi-sudachi");
    return true;
  } catch {
    return false;
  }
};
const isDictionaryAvailable =
  dictionaryPath !== undefined &&
  existsSync(dictionaryPath) &&
  isNativeModuleInstalled();

describe("createSudachiTokenizer without a usable dictionary", () => {
  it("fails with a message that does not contain the dictionary path", () => {
    const secretPath = "/nonexistent/secret-folder/system.dic";
    const previous = process.env.SUDACHI_DICT_PATH;
    process.env.SUDACHI_DICT_PATH = secretPath;
    try {
      expect(() => createSudachiTokenizer()).toThrowError(
        expect.objectContaining({
          message: expect.not.stringContaining("secret-folder"),
        }),
      );
    } finally {
      if (previous === undefined) delete process.env.SUDACHI_DICT_PATH;
      else process.env.SUDACHI_DICT_PATH = previous;
    }
  });
});

describe("createSudachiTokenizer with a path that is not a file", () => {
  it("refuses a folder before the native module can abort the process", () => {
    const previous = process.env.SUDACHI_DICT_PATH;
    process.env.SUDACHI_DICT_PATH = tmpdir();
    try {
      expect(() => createSudachiTokenizer()).toThrowError(/SUDACHI_DICT_PATH/);
    } finally {
      if (previous === undefined) delete process.env.SUDACHI_DICT_PATH;
      else process.env.SUDACHI_DICT_PATH = previous;
    }
  });
});

describe("createSudachiTokenizer with an unknown split mode", () => {
  it("refuses it instead of silently using the default", () => {
    expect(() =>
      // @ts-expect-error a JavaScript caller can pass anything
      createSudachiTokenizer({ splitMode: "X" }),
    ).toThrowError(/splitMode/);
  });
});

describe("createSudachiTokenizer with SUDACHI_DICT_PATH unset", () => {
  it("fails with the setup hint instead of aborting the process", () => {
    const previous = process.env.SUDACHI_DICT_PATH;
    delete process.env.SUDACHI_DICT_PATH;
    try {
      expect(() => createSudachiTokenizer()).toThrowError(/SUDACHI_DICT_PATH/);
    } finally {
      if (previous !== undefined) process.env.SUDACHI_DICT_PATH = previous;
    }
  });
});

describe.skipIf(!isDictionaryAvailable)("with the real dictionary", () => {
  it("returns the dictionary form of a conjugated verb", () => {
    const tokens = createSudachiTokenizer().tokenize("行きました");
    expect(tokens.map((token) => token.lemma)).toContain("行く");
  });

  it("returns the part of speech path", () => {
    const [first] = createSudachiTokenizer().tokenize("映画");
    expect(first?.partOfSpeech[0]).toBe("名詞");
  });
});
