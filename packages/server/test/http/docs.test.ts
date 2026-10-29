import { describe, expect, it } from "vitest";
import { createTestApp } from "./test-app.js";

const SCRIPT = "/* fake scalar bundle */";
const docsApp = () => createTestApp({ docs: { script: SCRIPT } });

const cspOf = async (path: string, app = docsApp().app) => {
  const response = await app.request(path);
  return response.headers.get("content-security-policy") ?? "";
};

const directive = (csp: string, name: string) =>
  csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `) || part === name);

describe("interactive documentation, closed by default", () => {
  it.each(["/docs", "/docs/scalar.js"])(
    "does not serve %s unless it is enabled",
    async (path) => {
      const { app } = createTestApp();

      const response = await app.request(path);

      expect(response.status).toBe(404);
    },
  );
});

describe("interactive documentation, when enabled", () => {
  it("serves an HTML page", async () => {
    const response = await docsApp().app.request("/docs");

    expect([response.status, response.headers.get("content-type")]).toEqual([
      200,
      "text/html; charset=utf-8",
    ]);
  });

  it("points the page at the OpenAPI document of the same server", async () => {
    const html = await (await docsApp().app.request("/docs")).text();

    expect(html).toContain('data-url="/v1/openapi.json"');
  });

  it("loads its script from this server only", async () => {
    const html = await (await docsApp().app.request("/docs")).text();

    expect(html).toContain('src="/docs/scalar.js"');
  });

  it("names no external host and runs no inline script", async () => {
    const html = await (await docsApp().app.request("/docs")).text();

    expect([
      /https?:\/\//.test(html),
      /<script(?![^>]*\bsrc=)[^>]*>\s*[^\s<]/.test(html),
    ]).toEqual([false, false]);
  });

  it("turns off the fonts, the telemetry and the agent that call Scalar's servers", async () => {
    const html = await (await docsApp().app.request("/docs")).text();
    const raw = /data-configuration='([^']*)'/.exec(html)?.[1] ?? "{}";

    expect(JSON.parse(raw.replaceAll("&quot;", '"'))).toMatchObject({
      withDefaultFonts: false,
      telemetry: false,
      agent: { disabled: true },
    });
  });

  it("serves the script with a JavaScript content type", async () => {
    const response = await docsApp().app.request("/docs/scalar.js");

    expect([
      response.status,
      response.headers.get("content-type"),
      await response.text(),
    ]).toEqual([200, "text/javascript; charset=utf-8", SCRIPT]);
  });

  it("answers GET only", async () => {
    const response = await docsApp().app.request("/docs", { method: "POST" });

    expect(response.status).toBe(404);
  });

  it("is not part of the API document", async () => {
    const response = await docsApp().app.request("/v1/openapi.json");
    const document = JSON.parse(await response.text());

    expect(
      Object.keys(document.paths).filter((p) => p.startsWith("/docs")),
    ).toEqual([]);
  });

  it("is logged under its own route pattern", async () => {
    const { app, logs } = docsApp();

    await app.request("/docs");

    expect(JSON.parse(logs.lines.at(-1) ?? "{}").route).toBe("/docs");
  });
});

describe("content security policy of the documentation", () => {
  it("only lets the page run scripts served by this server", async () => {
    expect(directive(await cspOf("/docs"), "script-src")).toBe(
      "script-src 'self'",
    );
  });

  it("only lets the page call this server", async () => {
    expect(directive(await cspOf("/docs"), "connect-src")).toBe(
      "connect-src 'self'",
    );
  });

  it("refuses to be framed and denies everything not listed", async () => {
    const csp = await cspOf("/docs");

    expect([
      directive(csp, "default-src"),
      directive(csp, "frame-ancestors"),
    ]).toEqual(["default-src 'none'", "frame-ancestors 'none'"]);
  });

  it("allows no remote source and no eval", async () => {
    const csp = await cspOf("/docs");

    expect([
      /https?:/.test(csp),
      csp.includes("unsafe-eval"),
      csp.includes("*"),
    ]).toEqual([false, false, false]);
  });

  it("keeps the same policy on the script", async () => {
    expect(await cspOf("/docs/scalar.js")).toBe(await cspOf("/docs"));
  });

  it("leaves the API routes under the strictest policy", async () => {
    expect(await cspOf("/v1/ping")).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
  });

  it("keeps the other security headers on the page", async () => {
    const response = await docsApp().app.request("/docs");

    expect([
      response.headers.get("x-content-type-options"),
      response.headers.get("referrer-policy"),
    ]).toEqual(["nosniff", "no-referrer"]);
  });
});
