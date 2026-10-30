import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppConfig } from "../../src/config/app-config.js";

const docsDirectory = new URL("../../../../docs/", import.meta.url);
const envSource = new URL("../../src/config/env.ts", import.meta.url);

const docs = readdirSync(docsDirectory)
  .filter((name) => name.endsWith(".md"))
  .map((name) => ({
    name,
    text: readFileSync(new URL(name, docsDirectory), "utf8"),
  }));

/** Unwraps defaults and optionals down to the schema that holds the keys. */
function unwrap(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodDefault || schema instanceof z.ZodOptional) {
    return unwrap(schema.unwrap() as z.ZodType);
  }
  return schema;
}

/** Dotted path of every key of the schema, down to the first non-object. */
function keyPaths(schema: z.ZodType, prefix: string[] = []): string[][] {
  const inner = unwrap(schema);
  if (!(inner instanceof z.ZodObject))
    return prefix.length === 0 ? [] : [prefix];
  return Object.entries(inner.shape).flatMap(([key, child]) =>
    keyPaths(child as z.ZodType, [...prefix, key]),
  );
}

const isDocumented = (path: string[]): boolean => {
  const leaf = path.at(-1) ?? "";
  const top = path[0] ?? "";
  const dotted = path.join(".");
  return docs.some(
    ({ text }) =>
      (text.includes(`\`${leaf}\``) || text.includes(`\`${dotted}\``)) &&
      text.includes(top),
  );
};

describe("the documentation", () => {
  it("describes every key of config/app.json in docs/", () => {
    const undocumented = keyPaths(AppConfig)
      .filter((path) => !isDocumented(path))
      .map((path) => path.join("."));

    expect(undocumented).toEqual([]);
  });

  it("describes every APP_ environment variable in docs/", () => {
    const names = [
      ...new Set(readFileSync(envSource, "utf8").match(/APP_[A-Z0-9_]+/g)),
    ];
    const undocumented = names.filter(
      (name) => !docs.some(({ text }) => text.includes(`\`${name}\``)),
    );

    expect(undocumented).toEqual([]);
  });

  it("finds the keys it is supposed to check", () => {
    const paths = keyPaths(AppConfig).map((path) => path.join("."));

    expect(paths).toEqual(
      expect.arrayContaining([
        "ai.timeoutMs",
        "timeouts.idleMs",
        "docs.enabled",
      ]),
    );
  });
});
