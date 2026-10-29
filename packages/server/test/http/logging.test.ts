import { describe, expect, it } from "vitest";
import { createTestApp, jsonPost } from "./test-app.js";

describe("request logs", () => {
  it("records the method, the route pattern and the status", async () => {
    const { app, logs } = createTestApp();

    await app.request("/v1/ping");

    expect(JSON.parse(logs.lines.at(-1) ?? "{}")).toMatchObject({
      method: "GET",
      route: "/v1/ping",
      status: 200,
    });
  });

  it("links the log line to the request id sent back", async () => {
    const { app, logs } = createTestApp();

    const response = await app.request("/v1/ping");

    expect(JSON.parse(logs.lines.at(-1) ?? "{}").requestId).toBe(
      response.headers.get("x-request-id"),
    );
  });

  it("does not log the query string, credentials or the body", async () => {
    const { app, logs } = createTestApp();

    await app.request("/v1/ping?token=query-secret", {
      headers: {
        authorization: "Bearer header-secret",
        cookie: "session=cookie-secret",
      },
    });
    await app.request(
      "/v1/echo",
      jsonPost(JSON.stringify({ text: "body-secret" })),
    );

    for (const secret of [
      "query-secret",
      "header-secret",
      "cookie-secret",
      "body-secret",
    ]) {
      expect(logs.text()).not.toContain(secret);
    }
  });

  it("does not log the path of an unknown route", async () => {
    const { app, logs } = createTestApp();

    await app.request("/v1/attacker-chosen-path");

    expect(logs.text()).not.toContain("attacker-chosen-path");
  });

  it("logs the cause of an unexpected failure", async () => {
    const { app, logs } = createTestApp();

    await app.request("/v1/boom");

    expect(logs.text()).toContain("boom internal detail");
  });
});

describe("logger redaction", () => {
  it("masks credentials even when a caller logs them by mistake", async () => {
    const { createLogger } = await import("../../src/observability/logger.js");
    const lines: string[] = [];
    const logger = createLogger({
      write: (line: string) => void lines.push(line),
    });

    logger.info(
      { authorization: "Bearer leaked", headers: { cookie: "leaked" } },
      "oops",
    );

    expect(lines.join("")).not.toContain("leaked");
  });
});
