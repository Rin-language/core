import { describe, expect, it } from "vitest";
import { createTestApp, jsonPost } from "./test-app.js";

const ALLOWED = "https://app.example.com";
const OTHER = "https://evil.example.com";

const appAllowing = (...allowedOrigins: string[]) =>
  createTestApp({ allowedOrigins }).app;

const preflight = (
  app: ReturnType<typeof appAllowing>,
  headers: Record<string, string>,
  path = "/v1/echo",
) => app.request(path, { method: "OPTIONS", headers });

const corsHeaderNames = (response: Response) =>
  [...response.headers.keys()].filter((name) =>
    name.startsWith("access-control-"),
  );

describe("CORS by default", () => {
  it("sends no CORS header when no origin is configured", async () => {
    const { app } = createTestApp();

    const response = await app.request("/v1/ping", {
      headers: { origin: ALLOWED },
    });

    expect(corsHeaderNames(response)).toEqual([]);
  });

  it("does not answer a preflight when no origin is configured", async () => {
    const { app } = createTestApp();

    const response = await preflight(app, {
      origin: ALLOWED,
      "access-control-request-method": "POST",
    });

    expect([response.status, corsHeaderNames(response)]).toEqual([404, []]);
  });
});

describe("CORS on a simple request", () => {
  it("echoes an allowed origin", async () => {
    const app = appAllowing(ALLOWED);

    const response = await app.request("/v1/ping", {
      headers: { origin: ALLOWED },
    });

    expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED);
  });

  it("sends no CORS header to an origin that is not listed", async () => {
    const app = appAllowing(ALLOWED);

    const response = await app.request("/v1/ping", {
      headers: { origin: OTHER },
    });

    expect(corsHeaderNames(response)).toEqual([]);
  });

  it("sends no CORS header without an Origin header", async () => {
    const app = appAllowing(ALLOWED);

    const response = await app.request("/v1/ping");

    expect(corsHeaderNames(response)).toEqual([]);
  });

  it("does not match an origin by prefix or suffix", async () => {
    const app = appAllowing(ALLOWED);

    const lookalikes = await Promise.all(
      [
        `${ALLOWED}.evil.com`,
        "https://evil-app.example.com",
        `${ALLOWED}/`,
      ].map((origin) => app.request("/v1/ping", { headers: { origin } })),
    );

    expect(lookalikes.map(corsHeaderNames)).toEqual([[], [], []]);
  });

  it("refuses the literal null origin", async () => {
    const app = appAllowing(ALLOWED);

    const response = await app.request("/v1/ping", {
      headers: { origin: "null" },
    });

    expect(corsHeaderNames(response)).toEqual([]);
  });

  it("varies on Origin so a cache never mixes two origins", async () => {
    const app = appAllowing(ALLOWED);

    const [listed, unlisted] = await Promise.all([
      app.request("/v1/ping", { headers: { origin: ALLOWED } }),
      app.request("/v1/ping", { headers: { origin: OTHER } }),
    ]);

    expect([listed, unlisted].map((r) => r.headers.get("vary"))).toEqual([
      expect.stringContaining("Origin"),
      expect.stringContaining("Origin"),
    ]);
  });

  it("also answers errors with the CORS header so the client can read them", async () => {
    const app = appAllowing(ALLOWED);

    const response = await app.request("/v1/missing", {
      headers: { origin: ALLOWED },
    });

    expect([
      response.status,
      response.headers.get("access-control-allow-origin"),
    ]).toEqual([404, ALLOWED]);
  });

  it("supports several listed origins", async () => {
    const app = appAllowing(ALLOWED, OTHER);

    const response = await app.request("/v1/ping", {
      headers: { origin: OTHER },
    });

    expect(response.headers.get("access-control-allow-origin")).toBe(OTHER);
  });
});

describe("CORS never opens credentials or a wildcard", () => {
  it("never sends Allow-Credentials, even to an allowed origin with credentials", async () => {
    const app = appAllowing(ALLOWED);

    const response = await app.request("/v1/ping", {
      headers: {
        origin: ALLOWED,
        authorization: "Bearer token-a",
        cookie: "session=abc",
      },
    });

    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("never answers with a wildcard origin", async () => {
    const app = appAllowing(ALLOWED);

    const responses = await Promise.all([
      app.request("/v1/ping", { headers: { origin: ALLOWED } }),
      app.request("/v1/ping", { headers: { origin: OTHER } }),
      app.request("/v1/ping"),
      preflight(app, {
        origin: ALLOWED,
        "access-control-request-method": "POST",
      }),
    ]);

    expect(
      responses.map((r) => r.headers.get("access-control-allow-origin")),
    ).not.toContain("*");
  });

  it("never sends Allow-Credentials on a preflight", async () => {
    const app = appAllowing(ALLOWED);

    const response = await preflight(app, {
      origin: ALLOWED,
      "access-control-request-method": "POST",
    });

    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });
});

describe("CORS preflight", () => {
  it("answers an allowed origin asking for a method of the API", async () => {
    const app = appAllowing(ALLOWED);

    const response = await preflight(app, {
      origin: ALLOWED,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type, authorization",
    });

    expect([
      response.status,
      response.headers.get("access-control-allow-origin"),
      response.headers.get("access-control-allow-methods"),
      response.headers.get("access-control-allow-headers"),
    ]).toEqual([204, ALLOWED, "GET, POST", "Content-Type, Authorization"]);
  });

  it("varies on Origin", async () => {
    const app = appAllowing(ALLOWED);

    const response = await preflight(app, {
      origin: ALLOWED,
      "access-control-request-method": "POST",
    });

    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("refuses an origin that is not listed", async () => {
    const app = appAllowing(ALLOWED);

    const response = await preflight(app, {
      origin: OTHER,
      "access-control-request-method": "POST",
    });

    expect([response.status, corsHeaderNames(response)]).toEqual([404, []]);
  });

  it("refuses a method the API does not use", async () => {
    const app = appAllowing(ALLOWED);

    const response = await preflight(app, {
      origin: ALLOWED,
      "access-control-request-method": "DELETE",
    });

    expect(corsHeaderNames(response)).toEqual([]);
  });

  it("refuses a header the API does not read", async () => {
    const app = appAllowing(ALLOWED);

    const response = await preflight(app, {
      origin: ALLOWED,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type, x-forwarded-user",
    });

    expect(corsHeaderNames(response)).toEqual([]);
  });

  it("treats an OPTIONS request without a requested method as a normal request", async () => {
    const app = appAllowing(ALLOWED);

    const response = await preflight(app, { origin: ALLOWED });

    expect(response.status).toBe(404);
  });

  it("does not reach a route handler", async () => {
    const { app, captured } = createTestApp({ allowedOrigins: [ALLOWED] });

    await preflight(app, {
      origin: ALLOWED,
      "access-control-request-method": "POST",
    });

    expect(captured.texts).toEqual([]);
  });
});

describe("CORS does not weaken the other protections", () => {
  it("keeps the security headers on a preflight", async () => {
    const app = appAllowing(ALLOWED);

    const response = await preflight(app, {
      origin: ALLOWED,
      "access-control-request-method": "POST",
    });

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("still enforces the body limit for an allowed origin", async () => {
    const app = appAllowing(ALLOWED);

    const response = await app.request(
      "/v1/echo",
      jsonPost("x".repeat(5000), { origin: ALLOWED }),
    );

    expect(response.status).toBe(413);
  });

  it("does not log the origin", async () => {
    const { app, logs } = createTestApp({ allowedOrigins: [ALLOWED] });

    await app.request("/v1/ping", { headers: { origin: ALLOWED } });

    expect(logs.text()).not.toContain("example.com");
  });
});
