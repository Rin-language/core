import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  findSpanProblems,
  parseModelOutput,
} from "../../src/ai/output-extractor.js";

const Answer = z.strictObject({ score: z.number(), note: z.string() });
const valid = { score: 3, note: "ok" };
const options = { maxChars: 1000 };

describe("parseModelOutput", () => {
  it("reads a bare JSON object", () => {
    expect(parseModelOutput(JSON.stringify(valid), Answer, options)).toEqual({
      ok: true,
      value: valid,
    });
  });

  it("reads JSON inside a fenced code block", () => {
    const text = `Here it is:\n\`\`\`json\n${JSON.stringify(valid)}\n\`\`\`\nDone.`;

    expect(parseModelOutput(text, Answer, options)).toEqual({
      ok: true,
      value: valid,
    });
  });

  it("reads JSON surrounded by prose", () => {
    const text = `Sure! ${JSON.stringify(valid)} Hope it helps.`;

    expect(parseModelOutput(text, Answer, options)).toEqual({
      ok: true,
      value: valid,
    });
  });

  it("reads a JSON array when the schema is an array", () => {
    const result = parseModelOutput("[1,2]", z.array(z.number()), options);

    expect(result).toEqual({ ok: true, value: [1, 2] });
  });

  it("is not fooled by braces and quotes inside strings", () => {
    const tricky = { score: 1, note: 'a "} {" b \\ c' };

    expect(parseModelOutput(JSON.stringify(tricky), Answer, options)).toEqual({
      ok: true,
      value: tricky,
    });
  });

  it("skips prose braces that are not JSON", () => {
    const text = `I used {curly} words. ${JSON.stringify(valid)}`;

    expect(parseModelOutput(text, Answer, options)).toEqual({
      ok: true,
      value: valid,
    });
  });

  it("rejects an answer longer than the limit without reading it", () => {
    const result = parseModelOutput(JSON.stringify(valid), Answer, {
      maxChars: 5,
    });

    expect(result).toEqual({
      ok: false,
      error: { kind: "too_long", issues: [] },
    });
  });

  it("rejects an answer with no JSON", () => {
    expect(parseModelOutput("I cannot help.", Answer, options)).toMatchObject({
      ok: false,
      error: { kind: "no_json" },
    });
  });

  it("rejects truncated JSON and does not repair it", () => {
    const result = parseModelOutput('{"score": 3, "note": "o', Answer, options);

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "invalid_json" },
    });
  });

  it("rejects a complete inner object of a truncated outer one", () => {
    const result = parseModelOutput(
      '{"outer": {"score": 3, "note": "ok"}, "more": ',
      Answer,
      options,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "invalid_json" },
    });
  });

  it("rejects two JSON values instead of choosing one", () => {
    const text = `${JSON.stringify(valid)}\n${JSON.stringify({ ...valid, score: 9 })}`;

    expect(parseModelOutput(text, Answer, options)).toMatchObject({
      ok: false,
      error: { kind: "multiple_json" },
    });
  });

  it("rejects a value of the wrong type", () => {
    const result = parseModelOutput(
      '{"score":"3","note":"ok"}',
      Answer,
      options,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "schema_mismatch", issues: ["score: invalid_type"] },
    });
  });

  it("rejects a key the schema does not know", () => {
    const result = parseModelOutput(
      '{"score":1,"note":"ok","isAdmin":true}',
      Answer,
      options,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "schema_mismatch" },
    });
  });

  it("does not repeat model text in the issues", () => {
    const result = parseModelOutput(
      '{"score":1,"note":"ok","SECRET-KEY":true}',
      Answer,
      options,
    );

    expect(JSON.stringify(result)).not.toContain("SECRET-KEY");
  });

  it("rejects a value the caller's check refuses", () => {
    const result = parseModelOutput(JSON.stringify(valid), Answer, {
      ...options,
      refine: () => ["span 0: outside_text"],
    });

    expect(result).toEqual({
      ok: false,
      error: { kind: "refinement_failed", issues: ["span 0: outside_text"] },
    });
  });

  it("accepts a value the caller's check finds fine", () => {
    const result = parseModelOutput(JSON.stringify(valid), Answer, {
      ...options,
      refine: () => [],
    });

    expect(result).toEqual({ ok: true, value: valid });
  });
});

describe("findSpanProblems", () => {
  const original = "私は学生です";

  it("finds no problem in spans inside the text", () => {
    expect(
      findSpanProblems(original, [
        { start: 0, end: 1 },
        { start: 2, end: 4 },
      ]),
    ).toEqual([]);
  });

  it("accepts an insertion, where start equals end", () => {
    expect(findSpanProblems(original, [{ start: 3, end: 3 }])).toEqual([]);
  });

  it("accepts a span that ends at the end of the text", () => {
    expect(
      findSpanProblems(original, [{ start: 0, end: original.length }]),
    ).toEqual([]);
  });

  it("flags a span that ends after the text", () => {
    expect(
      findSpanProblems(original, [{ start: 0, end: original.length + 1 }]),
    ).toEqual(["span 0: outside_text"]);
  });

  it("flags a span whose start is after its end", () => {
    expect(findSpanProblems(original, [{ start: 3, end: 2 }])).toEqual([
      "span 0: start_after_end",
    ]);
  });

  it("flags a negative or fractional position", () => {
    expect(
      findSpanProblems(original, [
        { start: -1, end: 2 },
        { start: 0, end: 1.5 },
      ]),
    ).toEqual(["span 0: outside_text", "span 1: outside_text"]);
  });

  it("flags a span that cuts a surrogate pair", () => {
    expect(findSpanProblems("a😀b", [{ start: 2, end: 3 }])).toEqual([
      "span 0: splits_character",
    ]);
  });

  it("flags two spans that overlap", () => {
    expect(
      findSpanProblems(original, [
        { start: 0, end: 3 },
        { start: 2, end: 4 },
      ]),
    ).toEqual(["span 1: overlaps_previous"]);
  });

  it("does not flag spans that touch", () => {
    expect(
      findSpanProblems(original, [
        { start: 0, end: 2 },
        { start: 2, end: 4 },
      ]),
    ).toEqual([]);
  });
});

describe("parseModelOutput hardening", () => {
  it("does not repeat a key the model chose in the issues", () => {
    const result = parseModelOutput(
      '{"IGNORE ALL PREVIOUS secret text":"x"}',
      z.record(z.string(), z.number()),
      options,
    );

    expect(JSON.stringify(result)).not.toContain("IGNORE");
  });

  it("keeps the names of keys the schema declares in the issues", () => {
    const result = parseModelOutput(
      '{"score":"3","note":"ok"}',
      Answer,
      options,
    );

    expect(result).toMatchObject({
      error: { issues: ["score: invalid_type"] },
    });
  });

  it("refuses JSON nested too deeply", () => {
    const deep = `${"[".repeat(1000)}${"]".repeat(1000)}`;

    expect(
      parseModelOutput(deep, z.unknown(), { maxChars: 10_000 }),
    ).toMatchObject({
      ok: false,
      error: { kind: "invalid_json" },
    });
  });

  it("takes the one JSON value that fits the schema among fragments in prose", () => {
    const text = `See [1]. ${JSON.stringify(valid)}`;

    expect(parseModelOutput(text, Answer, options)).toEqual({
      ok: true,
      value: valid,
    });
  });

  it("still refuses two values that both fit the schema", () => {
    const text = `${JSON.stringify(valid)} ${JSON.stringify(valid)}`;

    expect(parseModelOutput(text, Answer, options)).toMatchObject({
      error: { kind: "multiple_json" },
    });
  });

  it("turns a check that throws into a refusal", () => {
    const result = parseModelOutput(JSON.stringify(valid), Answer, {
      ...options,
      refine: () => {
        throw new Error("SECRET-CHECK-MESSAGE");
      },
    });

    expect(result).toEqual({
      ok: false,
      error: { kind: "refinement_failed", issues: ["refine_threw"] },
    });
  });

  it("does not flag a lone low surrogate as a split character", () => {
    expect(findSpanProblems("a\uDC00b", [{ start: 1, end: 2 }])).toEqual([]);
  });
});
