import * as contract from "@rin-language/contract";
import type { z } from "zod";

/**
 * The name under which the contract exports this exact schema object, or
 * undefined for any schema defined elsewhere: core never redefines a schema.
 */
export function contractSchemaNameOf(schema: z.ZodType): string | undefined {
  for (const [name, exported] of Object.entries(contract)) {
    if (exported === schema) return name;
  }
  return undefined;
}
