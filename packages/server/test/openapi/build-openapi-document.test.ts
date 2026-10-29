import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { validate } from "@readme/openapi-parser";
import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "../../src/openapi/build-openapi-document.js";
import { createTestApp } from "../http/test-app.js";

const { routes } = createTestApp();
const document = buildOpenApiDocument(routes);
// A plain JSON view: the tests walk it without restating the document's shape.
const json = JSON.parse(JSON.stringify(document));
const operation = (path: string, method: string) => json.paths[path]?.[method];

const contractSchema = (name: string) => {
  const path = createRequire(import.meta.url).resolve(
    `@rin-language/contract/json-schema/${name}.json`,
  );
  const { $schema: _dialect, ...schema } = JSON.parse(
    readFileSync(path, "utf8"),
  );
  return schema;
};

describe("buildOpenApiDocument", () => {
  it("produces an OpenAPI 3.1 document", () => {
    expect(document.openapi).toBe("3.1.0");
  });

  it("produces a valid document", async () => {
    const result = await validate(JSON.parse(JSON.stringify(document)));

    expect(result.valid).toBe(true);
  });

  it("describes every route with its operation id", () => {
    expect(operation("/v1/ping", "get")?.operationId).toBe("ping");
  });

  it("references the request and response schemas of the contract", () => {
    const post = operation("/v1/echo", "post");

    expect([
      post.requestBody.content["application/json"].schema,
      post.responses["200"].content["application/json"].schema,
    ]).toEqual([
      { $ref: "#/components/schemas/CorrectionRequest" },
      { $ref: "#/components/schemas/CorrectionResponse" },
    ]);
  });

  it("copies the contract's JSON Schema without redefining it", () => {
    expect(document.components.schemas.CorrectionRequest).toEqual(
      contractSchema("CorrectionRequest"),
    );
  });

  it("documents the errors a route can answer, grouped by status", () => {
    const responses = operation("/v1/echo", "post").responses;

    expect(Object.keys(responses)).toEqual(["200", "400", "413", "500"]);
  });

  it("names the error codes of each status", () => {
    const description = operation("/v1/echo", "post").responses["400"]
      .description;

    expect(description).toContain("invalid_request");
  });

  it("describes every error with the contract's ApiError", () => {
    const schema = operation("/v1/echo", "post").responses["413"].content[
      "application/json"
    ].schema;

    expect(schema).toEqual({ $ref: "#/components/schemas/ApiError" });
  });

  it("documents a 500 on every operation", () => {
    const operations = Object.keys(json.paths).flatMap((path) =>
      Object.keys(json.paths[path]).map((method) => json.paths[path][method]),
    );
    const missing = operations.filter((op) => !("500" in op.responses));

    expect(missing).toEqual([]);
  });

  it("requires a bearer token on user routes only", () => {
    expect([
      operation("/v1/me", "get").security,
      operation("/v1/ping", "get").security,
    ]).toEqual([[{ bearerAuth: [] }], undefined]);
  });

  it("documents the 401 of a user route", () => {
    expect(Object.keys(operation("/v1/me", "get").responses)).toContain("401");
  });

  it("declares the bearer scheme only when a route needs it", () => {
    const publicRoutes = routes.filter((route) => route.auth === "public");

    expect([
      document.components.securitySchemes,
      buildOpenApiDocument(publicRoutes).components.securitySchemes,
    ]).toEqual([{ bearerAuth: { type: "http", scheme: "bearer" } }, undefined]);
  });

  it("describes the OpenAPI document route itself", () => {
    expect(operation("/v1/openapi.json", "get").operationId).toBe(
      "getOpenApiDocument",
    );
  });

  it("does not guess the public URL of the server", () => {
    expect(document).not.toHaveProperty("servers");
  });

  it("is deterministic", () => {
    expect(JSON.stringify(buildOpenApiDocument(routes))).toBe(
      JSON.stringify(document),
    );
  });

  it("refuses a route whose schema is missing from the contract", () => {
    const [first] = routes;
    if (first === undefined) throw new Error("test routes are empty");
    const broken = { ...first, responseSchemaName: "DoesNotExist" };

    expect(() => buildOpenApiDocument([broken])).toThrow(/DoesNotExist/);
  });
});
