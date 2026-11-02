import type { z } from "zod";

/** One line per issue: the field path and Zod's message, never the value. */
export function toProblems(error: z.ZodError): string[] {
  return error.issues.map(
    (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
  );
}
