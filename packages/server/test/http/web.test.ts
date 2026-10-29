import { describe, expect, it } from "vitest";
import type { WebAssets } from "../../src/http/web.js";
import { createTestApp } from "./test-app.js";

const entry = (body: string, contentType: string) => ({
  body: Buffer.from(body),
  contentType,
});
const INDEX = entry(
  "<!doctype html><title>app</title>",
  "text/html; charset=utf-8",
);
const assets: WebAssets = new Map([
  ["/", INDEX],
  ["/index.html", INDEX],
  ["/assets/app.js", entry("console.log(1)", "text/javascript; charset=utf-8")],
]);
const webApp = () => createTestApp({ web: assets });

const directive = (csp: string | null, name: string) =>
  (csp ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));

describe("web client, closed by default", () => {
  it.each(["/", "/index.html", "/assets/app.js"])(
    "does not serve %s unless a client is provided",
    async (path) => {
      const response = await createTestApp().app.request(path);

      expect(response.status).toBe(404);
    },
  );
});

describe("web client, when provided", () => {
  it("serves the page at the root", async () => {
    const response = await webApp().app.request("/");

    expect([
      response.status,
      response.headers.get("content-type"),
      await response.text(),
    ]).toEqual([
      200,
      "text/html; charset=utf-8",
      "<!doctype html><title>app</title>",
    ]);
  });

  it("serves the bytes it holds without copying them for each request", async () => {
    const response = await webApp().app.request("/assets/app.js");

    const chunk = await response.body?.getReader().read();

    expect(chunk?.value).toBe(assets.get("/assets/app.js")?.body);
  });

  it("announces the exact size of what it serves", async () => {
    const response = await webApp().app.request("/assets/app.js");

    expect(response.headers.get("content-length")).toBe(
      String(Buffer.byteLength("console.log(1)")),
    );
  });

  it("serves an asset with its content type", async () => {
    const response = await webApp().app.request("/assets/app.js");

    expect([response.status, response.headers.get("content-type")]).toEqual([
      200,
      "text/javascript; charset=utf-8",
    ]);
  });

  it("keeps answering unknown paths with the API error format", async () => {
    const response = await webApp().app.request("/v1/missing");

    expect([response.status, await response.json()]).toEqual([
      404,
      { error: { code: "not_found", message: "This route does not exist." } },
    ]);
  });

  it.each([
    "/assets/../secret",
    "/%2e%2e/secret",
    "/assets/%2e%2e/%2e%2e/etc/passwd",
    "//etc/passwd",
  ])("does not serve %s", async (path) => {
    const response = await webApp().app.request(path);

    expect(response.status).toBe(404);
  });

  it("answers GET only", async () => {
    const response = await webApp().app.request("/", { method: "POST" });

    expect(response.status).toBe(404);
  });

  it("does not shadow an API route", async () => {
    const response = await webApp().app.request("/v1/ping");

    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("is not part of the API document", async () => {
    const response = await webApp().app.request("/v1/openapi.json");
    const document = JSON.parse(await response.text());

    expect(Object.keys(document.paths)).not.toContain("/");
  });

  it("is logged without the path the client asked for", async () => {
    const { app, logs } = webApp();

    await app.request("/assets/app.js");

    expect(JSON.parse(logs.lines.at(-1) ?? "{}").route).toBe("web");
  });
});

describe("content security policy of the web client", () => {
  const cspOf = async (path: string) =>
    (await webApp().app.request(path)).headers.get("content-security-policy");

  it("only runs scripts and styles served by this server", async () => {
    const csp = await cspOf("/");

    expect([directive(csp, "script-src"), directive(csp, "style-src")]).toEqual(
      ["script-src 'self'", "style-src 'self'"],
    );
  });

  it("only calls this server and denies the rest", async () => {
    const csp = await cspOf("/");

    expect([
      directive(csp, "default-src"),
      directive(csp, "connect-src"),
      directive(csp, "frame-ancestors"),
    ]).toEqual([
      "default-src 'none'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ]);
  });

  it("allows no remote source, no inline code and no eval", async () => {
    const csp = (await cspOf("/")) ?? "";

    expect([
      /https?:/.test(csp),
      csp.includes("unsafe-"),
      csp.includes("*"),
    ]).toEqual([false, false, false]);
  });

  it("applies to the assets too", async () => {
    expect(await cspOf("/assets/app.js")).toBe(await cspOf("/"));
  });

  it("leaves the API routes under the strictest policy", async () => {
    expect(await cspOf("/v1/ping")).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
  });

  it("keeps the other security headers", async () => {
    const response = await webApp().app.request("/");

    expect([
      response.headers.get("x-content-type-options"),
      response.headers.get("referrer-policy"),
    ]).toEqual(["nosniff", "no-referrer"]);
  });
});
