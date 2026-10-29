import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { z } from "zod";

const requireFromHere = createRequire(import.meta.url);
const SCHEMA_NAME = /^[A-Za-z0-9]+$/;
const JsonSchemaObject = z.record(z.string(), z.unknown());

/**
 * The JSON Schema the contract ships for one of its schemas, ready to sit in
 * `components.schemas`. Contract schemas are self-contained (no `$ref`), so
 * only the dialect marker, which OpenAPI 3.1 already implies, is dropped.
 */
export function loadContractJsonSchema(name: string): Record<string, unknown> {
  if (!SCHEMA_NAME.test(name)) {
    throw new Error(`"${name}" is not a valid contract schema name`);
  }
  let path: string;
  try {
    path = requireFromHere.resolve(
      `@rin-language/contract/json-schema/${name}.json`,
    );
  } catch (error) {
    throw new Error(`The contract has no JSON Schema named ${name}`, {
      cause: error,
    });
  }
  const { $schema: _dialect, ...schema } = JsonSchemaObject.parse(
    JSON.parse(readFileSync(path, "utf8")),
  );
  return schema;
}
