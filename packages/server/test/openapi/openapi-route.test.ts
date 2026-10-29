import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "@readme/openapi-parser";
import { FixedClock, findRouteDrift } from "@rin-language/core-test-kit";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { createApp } from "../../src/http/create-app.js";
import { DOCS_ENDPOINTS } from "../../src/http/docs.js";
import { buildOpenApiDocument } from "../../src/openapi/build-openapi-document.js";
import { buildCoreRoutes } from "../../src/routes/core-routes.js";
import {
  createTestApp,
  createTestLogs,
  testIdentity,
} from "../http/test-app.js";

const config = loadConfig(
  join(dirname(fileURLToPath(import.meta.url)), "../../../../config"),
);
const routes = buildCoreRoutes(config);
const options = {
  routes,
  identity: testIdentity,
  clock: new FixedClock("2026-10-29T10:00:00Z"),
  logger: createTestLogs().logger,
  maxBodyBytes: config.app.maxBodyBytes,
};
const app = createApp(options);

describe("GET /v1/openapi.json", () => {
  it("serves the document generated from the registry", async () => {
    const response = await app.request("/v1/openapi.json");

    expect(JSON.parse(await response.text())).toEqual(
      buildOpenApiDocument(routes),
    );
  });

  it("serves JSON", async () => {
    const response = await app.request("/v1/openapi.json");

    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("serves a valid OpenAPI document", async () => {
    const response = await app.request("/v1/openapi.json");

    expect((await validate(JSON.parse(await response.text()))).valid).toBe(
      true,
    );
  });

  it("describes the core routes and itself", async () => {
    const response = await app.request("/v1/openapi.json");
    const { paths } = JSON.parse(await response.text());

    expect(Object.keys(paths).sort()).toEqual([
      "/health",
      "/v1/capabilities",
      "/v1/limits",
      "/v1/openapi.json",
    ]);
  });

  it("needs no credentials", async () => {
    let calls = 0;
    const counting = createApp({
      ...options,
      identity: {
        authenticate: async () => {
          calls += 1;
          return null;
        },
      },
    });

    await counting.request("/v1/openapi.json");

    expect(calls).toBe(0);
  });

  it("refuses a route that takes its path", () => {
    const [first] = routes;
    if (first === undefined) throw new Error("core routes are empty");
    const clash = { ...first, path: "/v1/openapi.json", operationId: "other" };

    expect(() => createApp({ ...options, routes: [clash] })).toThrow(/twice/);
  });
});

describe("drift between the mounted routes and the document", () => {
  const drift = async (target: typeof app, ignore: readonly string[] = []) => {
    const response = await target.request("/v1/openapi.json");
    return findRouteDrift(target.routes, JSON.parse(await response.text()), {
      ignore,
    });
  };
  const withDocs = () => createApp({ ...options, docs: { script: "" } });

  it("finds none in the core application", async () => {
    expect(await drift(app)).toEqual({ undocumented: [], unmounted: [] });
  });

  it("finds none with routes that have a body and need a user", async () => {
    expect(await drift(createTestApp().app)).toEqual({
      undocumented: [],
      unmounted: [],
    });
  });

  it("catches a route mounted outside the registry", async () => {
    const rogue = createApp(options);
    rogue.get("/v1/rogue", (context) => context.json({}));

    expect((await drift(rogue)).undocumented).toEqual(["GET /v1/rogue"]);
  });

  it("finds none once the documentation routes are declared as not part of the API", async () => {
    expect(await drift(withDocs(), DOCS_ENDPOINTS)).toEqual({
      undocumented: [],
      unmounted: [],
    });
  });

  it("reports the documentation routes when they are not declared", async () => {
    expect((await drift(withDocs())).undocumented).toEqual(DOCS_ENDPOINTS);
  });
});
