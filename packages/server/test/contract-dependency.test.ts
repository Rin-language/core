import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { HealthResponse } from "@rin-language/contract";
import { describe, expect, it } from "vitest";

describe("contract dependency", () => {
  it("parses a health response with the published schema", () => {
    expect(HealthResponse.parse({ status: "ok" })).toEqual({ status: "ok" });
  });

  it("resolves the JSON Schema files shipped by the contract", () => {
    const path = createRequire(import.meta.url).resolve(
      "@rin-language/contract/json-schema/HealthResponse.json",
    );

    expect(JSON.parse(readFileSync(path, "utf8"))).toHaveProperty(
      "type",
      "object",
    );
  });
});
