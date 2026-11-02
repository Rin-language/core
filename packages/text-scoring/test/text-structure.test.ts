import { describe, expect, it } from "vitest";
import {
  analyzeText,
  extractKanji,
  splitIntoChunks,
} from "../src/japanese/text-structure.js";

describe("analyzeText sentences", () => {
  it("splits on the Japanese full stop", () => {
    expect(analyzeText("今日は晴れ。明日は雨。").sentences).toHaveLength(2);
  });

  it("splits on exclamation and question marks", () => {
    expect(analyzeText("本当？そうだ！").sentences).toHaveLength(2);
  });

  it("keeps a full stop inside a quote in the same sentence", () => {
    expect(analyzeText("「行くよ。待って」と言った。").sentences).toHaveLength(
      1,
    );
  });

  it("ends the sentence at a newline", () => {
    expect(analyzeText("一行目\n二行目").sentences).toHaveLength(2);
  });

  it("treats CRLF like LF", () => {
    expect(analyzeText("一行目\r\n二行目").sentences).toEqual(
      analyzeText("一行目\n二行目").sentences,
    );
  });

  it("returns no sentence for punctuation only", () => {
    expect(analyzeText("。。。").sentences).toHaveLength(0);
  });

  it("returns no sentence for an empty text", () => {
    expect(analyzeText("").sentences).toHaveLength(0);
  });
});

describe("analyzeText dialogue", () => {
  it("counts the characters inside the quotes, brackets excluded", () => {
    expect(analyzeText("「行くよ。待って」と言った。").dialogueCharacters).toBe(
      7,
    );
  });

  it("counts all non-whitespace characters, brackets included", () => {
    expect(analyzeText("「行く」と 言う").totalCharacters).toBe(7);
  });

  it("counts a nested quote once, all brackets excluded", () => {
    expect(analyzeText("「彼は『行く』と言った」").dialogueCharacters).toBe(8);
  });

  it("resets an unclosed quote at the next line", () => {
    expect(analyzeText("「開いたまま\n次の段落。").dialogueCharacters).toBe(5);
  });

  it("ignores a closing bracket with no opening one", () => {
    expect(analyzeText("終わり」です。").dialogueCharacters).toBe(0);
  });
});

describe("extractKanji", () => {
  it("returns distinct kanji in first-seen order", () => {
    expect(extractKanji("野家野")).toEqual(["野", "家"]);
  });

  it("returns a supplementary-plane kanji as one character", () => {
    expect(extractKanji("𠮷野家の𠮷")).toEqual(["𠮷", "野", "家"]);
  });

  it("ignores kana", () => {
    expect(extractKanji("ひらがな")).toEqual([]);
  });
});

describe("splitIntoChunks", () => {
  it("cuts a sentence into chunks of at most the limit", () => {
    expect(
      splitIntoChunks("あ".repeat(5), 2).map((chunk) => chunk.length),
    ).toEqual([2, 2, 1]);
  });

  it("never separates a surrogate pair", () => {
    const chunks = splitIntoChunks("𠮷".repeat(3), 3);
    expect(
      chunks.every((chunk) => chunk === "𠮷".repeat(chunk.length / 2)),
    ).toBe(true);
  });

  it("returns the sentence unchanged when it fits", () => {
    expect(splitIntoChunks("短い", 10)).toEqual(["短い"]);
  });
});

describe("performance", () => {
  it("analyses a million characters in under a second", () => {
    const text = "「あ。」い。".repeat(200_000);
    const start = performance.now();
    analyzeText(text);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe("splitIntoChunks edge cases", () => {
  it("returns no chunk for an empty sentence", () => {
    expect(splitIntoChunks("", 5)).toEqual([]);
  });

  it("keeps a sentence of exactly the limit in one chunk", () => {
    expect(splitIntoChunks("あいう", 3)).toEqual(["あいう"]);
  });
});
