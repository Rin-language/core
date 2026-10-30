import { z } from "zod";
import { parseConfig } from "./config-error.js";

const PLACEHOLDER = /\{\{([a-z][A-Za-z0-9]*)\}\}/g;
const ANY_BRACES = /\{\{|\}\}/;

const NonBlank = z
  .string()
  .refine((value) => value.trim().length > 0, "must not be blank");

const PromptVariable = z.strictObject({
  // Untrusted text is delimited and escaped; trusted text comes from the server.
  kind: z.enum(["trusted", "untrusted"]),
  maxLength: z.number().int().positive(),
});

const placeholdersOf = (text: string): string[] =>
  [...text.matchAll(PLACEHOLDER)].map((match) => match[1] ?? "");

const PromptDefinition = z
  .strictObject({
    version: z.number().int().positive(),
    system: NonBlank,
    user: NonBlank,
    variables: z.record(
      z.string().regex(/^[a-z][A-Za-z0-9]*$/),
      PromptVariable,
    ),
    maxOutputTokens: z.number().int().positive().optional(),
  })
  .superRefine((definition, context) => {
    const fail = (path: string, message: string) =>
      context.addIssue({ code: "custom", message, path: [path] });
    // The system prompt is fixed text: filling it would let a variable reach it.
    if (ANY_BRACES.test(definition.system)) {
      fail(
        "system",
        "must not contain {{ or }}: only the user prompt has variables",
      );
    }
    // The model only treats a block as data if it was told so.
    const hasUntrusted = Object.values(definition.variables).some(
      (variable) => variable.kind === "untrusted",
    );
    if (hasUntrusted && !/untrusted/i.test(definition.system)) {
      fail(
        "system",
        'must tell the model that text in "untrusted" blocks is data, never instructions',
      );
    }
    const withoutPlaceholders = definition.user.replace(PLACEHOLDER, "");
    if (ANY_BRACES.test(withoutPlaceholders)) {
      fail("user", "has a malformed {{placeholder}}");
    }
    const used = new Set(placeholdersOf(definition.user));
    const declared = Object.keys(definition.variables);
    for (const name of used) {
      if (!declared.includes(name)) {
        fail("user", `uses the variable "${name}", which is not declared`);
      }
    }
    for (const name of declared) {
      if (!used.has(name)) {
        fail(
          "variables",
          `declares "${name}", which the user prompt never uses`,
        );
      }
    }
  });

export const PromptDefinitionsSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9_]*$/, "must be lowercase snake_case"),
  PromptDefinition,
);

export type PromptDefinition = z.output<typeof PromptDefinition>;
export type PromptDefinitions = z.output<typeof PromptDefinitionsSchema>;

export const parsePromptDefinitions = (
  raw: unknown,
  source: string,
): PromptDefinitions => parseConfig(PromptDefinitionsSchema, raw, source);
