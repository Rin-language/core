import type { z } from "zod";

/** A configuration problem. Lists where and why, never the rejected value. */
export class ConfigError extends Error {
  constructor(
    readonly source: string,
    readonly problems: readonly string[],
  ) {
    super(
      `Invalid configuration in ${source}:\n${problems.map((problem) => `- ${problem}`).join("\n")}`,
    );
    this.name = "ConfigError";
  }
}

export function parseConfig<Schema extends z.ZodType>(
  schema: Schema,
  raw: unknown,
  source: string,
): z.output<Schema> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  throw new ConfigError(
    source,
    result.error.issues.map((issue) => {
      const path = issue.path.map(String).join(".") || "(root)";
      return `${path}: ${issue.message}`;
    }),
  );
}
