import { ErrorType, LanguageCode, Level } from "@rin-language/contract";
import { z } from "zod";
import { ConfigError, parseConfig } from "./config-error.js";

const NonBlank = z
  .string()
  .refine((value) => value.trim().length > 0, "must not be blank");

const hasNoDuplicate = (values: readonly string[]) =>
  new Set(values).size === values.length;

const ProfileFile = z.strictObject({
  code: LanguageCode,
  levels: z.array(Level).min(1).refine(hasNoDuplicate, "levels must be unique"),
  skills: z
    .array(NonBlank)
    .min(1)
    .refine(hasNoDuplicate, "skills must be unique"),
  prompts: z.record(z.string(), NonBlank),
});

const ErrorTypesFile = z
  .strictObject({
    default: ErrorType,
    types: z
      .array(
        z.strictObject({
          id: z
            .string()
            .regex(/^[a-z][a-z0-9_]*$/, "must be lowercase snake_case"),
          description: NonBlank,
        }),
      )
      .min(1),
  })
  .superRefine((file, context) => {
    const ids = file.types.map((type) => type.id);
    if (!hasNoDuplicate(ids)) {
      context.addIssue({
        code: "custom",
        message: "error type ids must be unique",
        path: ["types"],
      });
    }
    if (!ids.includes(file.default)) {
      context.addIssue({
        code: "custom",
        message: "default must be one of the listed types",
        path: ["default"],
      });
    }
  });

const GrammarRule = z
  .strictObject({
    grammar_point_id: NonBlank,
    pattern: NonBlank,
    level: Level,
    error_type: ErrorType,
  })
  .transform((rule) => ({
    grammarPointId: rule.grammar_point_id,
    pattern: rule.pattern,
    level: rule.level,
    errorType: rule.error_type,
  }));

const GrammarFile = z.array(GrammarRule);

export type LanguageProfile = z.output<typeof ProfileFile> & {
  errorTypes: z.output<typeof ErrorTypesFile>;
  grammar: z.output<typeof GrammarFile>;
};

export interface LanguageProfileFiles {
  profile: unknown;
  errorTypes: unknown;
  /** Absent when the language has no grammar pack: the pipeline still works. */
  grammar: unknown | undefined;
}

function findCrossFileProblems(
  profile: LanguageProfile,
  expectedCode: string,
): string[] {
  const problems: string[] = [];
  if (profile.code !== expectedCode) {
    problems.push("code must match the file name");
  }
  const errorTypeIds = profile.errorTypes.types.map((type) => type.id);
  const seen = new Set<string>();
  for (const rule of profile.grammar) {
    if (seen.has(rule.grammarPointId)) {
      problems.push(`grammar point "${rule.grammarPointId}" is defined twice`);
    }
    seen.add(rule.grammarPointId);
    if (!profile.levels.includes(rule.level)) {
      problems.push(
        `grammar point "${rule.grammarPointId}" has a level outside the language scale`,
      );
    }
    if (!errorTypeIds.includes(rule.errorType)) {
      problems.push(
        `grammar point "${rule.grammarPointId}" has an error type that is not listed`,
      );
    }
  }
  return problems;
}

export function parseLanguageProfile(
  files: LanguageProfileFiles,
  expectedCode: string,
): LanguageProfile {
  const profile: LanguageProfile = {
    ...parseConfig(
      ProfileFile,
      files.profile,
      `languages/${expectedCode}.json`,
    ),
    errorTypes: parseConfig(
      ErrorTypesFile,
      files.errorTypes,
      `error-types/${expectedCode}.json`,
    ),
    grammar:
      files.grammar === undefined
        ? []
        : parseConfig(
            GrammarFile,
            files.grammar,
            `grammar/${expectedCode}.json`,
          ),
  };
  const problems = findCrossFileProblems(profile, expectedCode);
  if (problems.length > 0) {
    throw new ConfigError(`language profile "${expectedCode}"`, problems);
  }
  return profile;
}
