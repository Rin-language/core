import { HealthResponse } from "@rin-language/contract";
import { FixedClock } from "@rin-language/core-test-kit";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "../../src/http/create-app.js";
import { defineRoute } from "../../src/http/route.js";
import { createTestLogs, testIdentity } from "./test-app.js";

const base = {
  method: "get",
  path: "/v1/ping",
  operationId: "ping",
  summary: "Test.",
  auth: "public",
  response: HealthResponse,
  errorCodes: [],
  handler: () => ({ status: "ok" as const }),
} as const;

const appWith = (routes: ReturnType<typeof defineRoute>[]) =>
  createApp({
    routes,
    identity: testIdentity,
    clock: new FixedClock("2026-10-29T10:00:00Z"),
    logger: createTestLogs().logger,
    maxBodyBytes: 1024,
  });

describe("defineRoute", () => {
  it("refuses a response schema that does not come from the contract", () => {
    expect(() =>
      defineRoute({ ...base, response: z.object({ status: z.string() }) }),
    ).toThrow(/contract/);
  });

  it.each(["v1/ping", "/v1/:id", "/v1/*", "/v1/{id}", "/v1/Ping"])(
    "refuses the path %s",
    (path) => {
      expect(() => defineRoute({ ...base, path })).toThrow(/path/);
    },
  );
});

describe("createApp", () => {
  it("refuses two routes with the same method and path", () => {
    const first = defineRoute(base);
    const second = defineRoute({ ...base, operationId: "ping2" });

    expect(() => appWith([first, second])).toThrow(/twice/);
  });

  it("refuses two routes with the same operation id", () => {
    const first = defineRoute(base);
    const second = defineRoute({ ...base, path: "/v1/pong" });

    expect(() => appWith([first, second])).toThrow(/operationId/);
  });
});
