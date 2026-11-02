import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const flattenKeys = (value: Record<string, unknown>, prefix = ""): string[] =>
  Object.entries(value).flatMap(([key, child]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    return isJsonObject(child) ? flattenKeys(child, path) : [path];
  });

const readJsonObject = (url: URL): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(readFileSync(url, "utf8"));
  if (!isJsonObject(parsed)) {
    throw new Error(`${url.pathname} is not a JSON object`);
  }
  return parsed;
};

const scoringConfig = readJsonObject(
  new URL("../../../data/scoring/ja.json", import.meta.url),
);

const frequencyPack = readJsonObject(
  new URL("./fixtures/frequency/ja/written.json", import.meta.url),
);

const textScoringDoc = readFileSync(
  new URL("../../../docs/text-scoring.md", import.meta.url),
  "utf8",
);

const languageDataDoc = readFileSync(
  new URL("../../../docs/language-data.md", import.meta.url),
  "utf8",
);

const scoringKeys = flattenKeys(scoringConfig);
const packKeys = Object.keys(frequencyPack);
const problemCodes = [
  "text_empty",
  "text_too_long",
  "mode_unavailable",
  "speech_rate_invalid",
  "speech_rate_missing",
  "no_words",
];

describe("docs mention every scoring config key", () => {
  it.each(scoringKeys)("mentions %s in text-scoring.md", (key) => {
    expect(textScoringDoc).toContain(`\`${key}\``);
  });
});

describe("docs mention every frequency pack field", () => {
  it.each(packKeys)("mentions %s in language-data.md", (key) => {
    expect(languageDataDoc).toContain(`\`${key}\``);
  });
});

describe("docs mention every scoring problem code", () => {
  it.each(problemCodes)("mentions %s in text-scoring.md", (code) => {
    expect(textScoringDoc).toContain(`\`${code}\``);
  });
});
