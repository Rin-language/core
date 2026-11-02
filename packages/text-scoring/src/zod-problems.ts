import type { z } from "zod";

/** One line per issue: the field path and Zod's message, never a key or value of the file. */
export function toProblems(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".") || "(root)";
    // Zod would quote the unknown keys, which come from the file.
    if (issue.code === "unrecognized_keys") {
      return `${path}: ${issue.keys.length} unknown key(s)`;
    }
    return `${path}: ${issue.message}`;
  });
}
