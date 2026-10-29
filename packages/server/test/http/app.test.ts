import { ApiError } from "@rin-language/contract";
import { describe, expect, it } from "vitest";
import { createTestApp, jsonPost, MAX_BODY_BYTES } from "./test-app.js";

const { app, captured } = createTestApp();

describe("responses", () => {
  it("serves a route with a JSON body validated by its schema", async () => {
    const response = await app.request("/v1/ping");

    expect([response.status, await response.json()]).toEqual([
      200,
      { status: "ok" },
    ]);
  });

  it("answers JSON", async () => {
    const response = await app.request("/v1/ping");

    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("gives each response its own server-generated request id", async () => {
    const first = await app.request("/v1/ping");
    const second = await app.request("/v1/ping");

    expect(first.headers.get("x-request-id")).not.toBe(
      second.headers.get("x-request-id"),
    );
  });

  it("ignores a request id sent by the caller", async () => {
    const response = await app.request("/v1/ping", {
      headers: { "x-request-id": "chosen-by-caller" },
    });

    expect(response.headers.get("x-request-id")).not.toBe("chosen-by-caller");
  });
});

describe("security headers", () => {
  it.each([
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "no-referrer"],
    ["cache-control", "no-store"],
    ["content-security-policy", "default-src 'none'; frame-ancestors 'none'"],
  ])("sets %s", async (name, value) => {
    const response = await app.request("/v1/ping");

    expect(response.headers.get(name)).toBe(value);
  });

  it("does not announce the server technology", async () => {
    const response = await app.request("/v1/ping");

    expect(response.headers.get("x-powered-by")).toBeNull();
  });

  it("sets them on errors too", async () => {
    const response = await app.request("/v1/nope");

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("errors", () => {
  it("answers an unknown route with a not_found ApiError", async () => {
    const response = await app.request("/v1/nope");

    expect([
      response.status,
      ApiError.parse(await response.json()).error.code,
    ]).toEqual([404, "not_found"]);
  });

  it("answers a wrong method on a known path with a not_found ApiError", async () => {
    const response = await app.request("/v1/ping", { method: "POST" });

    expect([
      response.status,
      ApiError.parse(await response.json()).error.code,
    ]).toEqual([404, "not_found"]);
  });

  it("hides the details of an unexpected failure", async () => {
    const response = await app.request("/v1/boom");

    expect([
      response.status,
      ApiError.parse(await response.json()).error.code,
    ]).toEqual([500, "internal_error"]);
  });

  it("does not put the failure message in the response", async () => {
    const response = await app.request("/v1/boom");

    expect(await response.text()).not.toContain("boom internal detail");
  });

  it("refuses to send a response that does not match its schema", async () => {
    const response = await app.request("/v1/leaky");

    expect([response.status, await response.text()]).toEqual([
      500,
      expect.not.stringContaining("leak-123"),
    ]);
  });
});

describe("request bodies", () => {
  it("gives the handler the validated body", async () => {
    await app.request(
      "/v1/echo",
      jsonPost(JSON.stringify({ text: "こんにちは" })),
    );

    expect(captured.texts).toContain("こんにちは");
  });

  it("refuses a body that does not match the schema", async () => {
    const response = await app.request(
      "/v1/echo",
      jsonPost(JSON.stringify({ text: "   " })),
    );

    expect([
      response.status,
      ApiError.parse(await response.json()).error.code,
    ]).toEqual([400, "invalid_request"]);
  });

  it("names the faulty field without repeating what was sent", async () => {
    const response = await app.request(
      "/v1/echo",
      jsonPost(JSON.stringify({ text: "x", level: 42, note: "private-note" })),
    );
    const text = await response.text();

    expect(text).toContain("level");
    expect(text).not.toContain("private-note");
  });

  it("refuses malformed JSON without repeating it", async () => {
    const response = await app.request(
      "/v1/echo",
      jsonPost('{"text": private-content'),
    );

    expect([response.status, await response.text()]).toEqual([
      400,
      expect.not.stringContaining("private-content"),
    ]);
  });

  it("refuses a body that is not declared as JSON", async () => {
    const response = await app.request("/v1/echo", {
      method: "POST",
      body: JSON.stringify({ text: "hello" }),
      headers: { "content-type": "text/plain" },
    });

    expect(response.status).toBe(400);
  });

  it("refuses a body larger than the limit", async () => {
    const big = JSON.stringify({ text: "a".repeat(MAX_BODY_BYTES) });
    const response = await app.request("/v1/echo", jsonPost(big));

    expect([
      response.status,
      ApiError.parse(await response.json()).error.code,
    ]).toEqual([413, "payload_too_large"]);
  });

  it("refuses a body that announces more than the limit", async () => {
    const response = await app.request(
      "/v1/echo",
      jsonPost("{}", { "content-length": String(MAX_BODY_BYTES + 1) }),
    );

    expect(response.status).toBe(413);
  });
});

describe("authentication", () => {
  it("refuses a protected route without credentials", async () => {
    const response = await app.request("/v1/me");

    expect([
      response.status,
      ApiError.parse(await response.json()).error.code,
    ]).toEqual([401, "unauthorized"]);
  });

  it("asks for a bearer token", async () => {
    const response = await app.request("/v1/me");

    expect(response.headers.get("www-authenticate")).toBe("Bearer");
  });

  it("refuses an unknown token", async () => {
    const response = await app.request("/v1/me", {
      headers: { authorization: "Bearer nope" },
    });

    expect(response.status).toBe(401);
  });

  it("gives the handler the user behind the token", async () => {
    await app.request("/v1/me", {
      headers: { authorization: "Bearer token-a" },
    });

    expect(captured.userIds).toEqual(["user-a"]);
  });

  it("does not look for credentials on a public route", async () => {
    let calls = 0;
    const counting = createTestApp({
      identity: {
        authenticate: async () => {
          calls += 1;
          return null;
        },
      },
    });

    await counting.app.request("/v1/ping");

    expect(calls).toBe(0);
  });
});
