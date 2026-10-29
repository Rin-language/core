import { describe, expect, it } from "vitest";
import { ConfigError } from "../../src/config/config-error.js";
import { parseLanguageProfile } from "../../src/config/language-profile.js";

const profile = {
  code: "ja",
  levels: ["N5", "N4"],
  skills: ["reading", "writing"],
  prompts: { correction: "Correct the text." },
};

const errorTypes = {
  default: "other",
  types: [
    { id: "particles", description: "Wrong particle." },
    { id: "other", description: "Anything else." },
  ],
};

const grammar = [
  {
    grammar_point_id: "n5-wa-ga",
    pattern: "は / が",
    level: "N5",
    error_type: "particles",
  },
];

const parse = (overrides: {
  profile?: unknown;
  errorTypes?: unknown;
  grammar?: unknown;
}) =>
  parseLanguageProfile(
    {
      profile: overrides.profile ?? profile,
      errorTypes: overrides.errorTypes ?? errorTypes,
      grammar: "grammar" in overrides ? overrides.grammar : grammar,
    },
    "ja",
  );

describe("parseLanguageProfile", () => {
  it("merges the profile, its error types and its grammar rules", () => {
    expect(parse({})).toEqual({
      code: "ja",
      levels: ["N5", "N4"],
      skills: ["reading", "writing"],
      prompts: { correction: "Correct the text." },
      errorTypes: errorTypes,
      grammar: [
        {
          grammarPointId: "n5-wa-ga",
          pattern: "は / が",
          level: "N5",
          errorType: "particles",
        },
      ],
    });
  });

  it("has no grammar rules when there is no grammar pack", () => {
    expect(parse({ grammar: undefined }).grammar).toEqual([]);
  });

  it("accepts a profile without prompts yet", () => {
    expect(parse({ profile: { ...profile, prompts: {} } }).prompts).toEqual({});
  });

  it.each([
    ["no level", { ...profile, levels: [] }],
    ["duplicate levels", { ...profile, levels: ["N5", "N5"] }],
    ["no skill", { ...profile, skills: [] }],
    ["duplicate skills", { ...profile, skills: ["reading", "reading"] }],
    ["a blank prompt", { ...profile, prompts: { correction: " " } }],
    ["a malformed code", { ...profile, code: "../x" }],
    ["an unknown key", { ...profile, extra: true }],
  ])("rejects a profile with %s", (_label, invalidProfile) => {
    expect(() => parse({ profile: invalidProfile })).toThrow(ConfigError);
  });

  it.each([
    ["a default that is not a listed type", { ...errorTypes, default: "nope" }],
    [
      "duplicate ids",
      { ...errorTypes, types: [...errorTypes.types, errorTypes.types[0]] },
    ],
    [
      "an id that is not lowercase snake case",
      {
        ...errorTypes,
        types: [...errorTypes.types, { id: "Bad Id", description: "x" }],
      },
    ],
    ["no type", { default: "other", types: [] }],
  ])("rejects error types with %s", (_label, invalidErrorTypes) => {
    expect(() => parse({ errorTypes: invalidErrorTypes })).toThrow(ConfigError);
  });

  it.each([
    [
      "a duplicate grammar point id",
      [...grammar, { ...grammar[0], pattern: "other" }],
    ],
    ["a level outside the scale", [{ ...grammar[0], level: "N1" }]],
    ["an unknown error type", [{ ...grammar[0], error_type: "nope" }]],
    ["an unknown key", [{ ...grammar[0], status: "draft" }]],
    ["a blank pattern", [{ ...grammar[0], pattern: " " }]],
  ])("rejects grammar rules with %s", (_label, invalidGrammar) => {
    expect(() => parse({ grammar: invalidGrammar })).toThrow(ConfigError);
  });

  it("names the offending grammar rule when it does not match the profile", () => {
    expect(() => parse({ grammar: [{ ...grammar[0], level: "N1" }] })).toThrow(
      expect.objectContaining({ message: expect.stringContaining("n5-wa-ga") }),
    );
  });
});

describe("parseLanguageProfile expected code", () => {
  it("rejects a profile whose code differs from its file name", () => {
    expect(() =>
      parseLanguageProfile({ profile, errorTypes, grammar: undefined }, "fr"),
    ).toThrow(ConfigError);
  });
});
