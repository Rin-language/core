import { FakeSecurityEventSink, FixedClock } from "@rin-language/core-test-kit";
import { describe, expect, it } from "vitest";
import type { RequestEvent } from "../../src/ports/security-events.js";
import { createEventPublisher } from "../../src/security/event-publisher.js";
import { createIpFingerprinter } from "../../src/security/ip-fingerprint.js";
import { createTestApp, createTestLogs, jsonPost } from "./test-app.js";

const START = "2026-10-29T10:00:00Z";
const CLIENT_IP = "203.0.113.7";
const fingerprint = createIpFingerprinter({ key: "k".repeat(32), keyId: "k1" });
const connection = (address: string) => ({
  incoming: { socket: { remoteAddress: address } },
});

function setup(
  options: {
    trustedProxyHops?: number;
    withFingerprint?: boolean;
    publisher?: { publish: () => void; close: () => Promise<void> };
  } = {},
) {
  const sink = new FakeSecurityEventSink();
  const logs = createTestLogs();
  const real = createEventPublisher({
    sink,
    queueSize: 100,
    clock: new FixedClock(START),
    logger: logs.logger,
  });
  const publisher = options.publisher ?? real;
  const harness = createTestApp({
    securityEvents: {
      publisher,
      trustedProxyHops: options.trustedProxyHops ?? 0,
      ...(options.withFingerprint === false ? {} : { fingerprint }),
    },
  });
  const events = async (): Promise<RequestEvent[]> => {
    await real.close();
    return sink.events.filter((event) => event.type === "request");
  };
  return { ...harness, sink, events, logs: harness.logs, appLogs: logs };
}

describe("request events", () => {
  it("emits one event per request", async () => {
    const { app, events } = setup();

    await app.request("/v1/ping");
    await app.request("/v1/ping");

    expect(await events()).toHaveLength(2);
  });

  it("describes the request by its route pattern, status and duration", async () => {
    const { app, events } = setup();

    await app.request("/v1/ping");

    expect((await events())[0]).toMatchObject({
      type: "request",
      occurredAt: new Date(START).toISOString(),
      method: "GET",
      route: "/v1/ping",
      status: 200,
      durationMs: 0,
    });
  });

  it("carries the request id the client received", async () => {
    const { app, events } = setup();

    const response = await app.request("/v1/ping");

    expect((await events())[0]?.requestId).toBe(
      response.headers.get("x-request-id"),
    );
  });

  it("names an unknown route 'unmatched' and never repeats its path", async () => {
    const { app, events } = setup();

    await app.request("/v1/attacker-chosen-path");

    const [event] = await events();
    expect([event?.route, JSON.stringify(event)]).toEqual([
      "unmatched",
      expect.not.stringContaining("attacker-chosen-path"),
    ]);
  });

  it("holds nothing the request carried", async () => {
    const { app, events } = setup();

    await app.request("/v1/ping?token=query-secret", {
      headers: {
        authorization: "Bearer header-secret",
        cookie: "session=cookie-secret",
        "user-agent": "agent-secret",
        "x-forwarded-for": "9.9.9.9",
      },
    });
    await app.request(
      "/v1/echo",
      jsonPost(JSON.stringify({ text: "body-secret" })),
    );

    const text = JSON.stringify(await events());
    for (const secret of [
      "query-secret",
      "header-secret",
      "cookie-secret",
      "agent-secret",
      "body-secret",
      "9.9.9.9",
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("has only the fields of the event type", async () => {
    const { app, events } = setup();

    await app.request("/v1/ping", { headers: { origin: "https://x.example" } });

    expect(Object.keys((await events())[0] ?? {}).sort()).toEqual(
      [
        "type",
        "occurredAt",
        "requestId",
        "method",
        "route",
        "status",
        "durationMs",
        "requestBytes",
        "responseBytes",
        "clientKind",
      ].sort(),
    );
  });
});

describe("request events: sizes", () => {
  it("counts the bytes of the body the server read, not characters", async () => {
    const { app, events } = setup();
    const body = JSON.stringify({ text: "日本語の文章です" });

    await app.request("/v1/echo", jsonPost(body));

    expect((await events())[0]?.requestBytes).toBe(Buffer.byteLength(body));
  });

  it("does not trust the Content-Length the client announced", async () => {
    const { app, events } = setup();
    const body = JSON.stringify({ text: "x".repeat(40) });

    await app.request("/v1/echo", jsonPost(body, { "content-length": "1" }));

    expect((await events())[0]?.requestBytes).toBe(Buffer.byteLength(body));
  });

  it("counts the body even when it is not valid JSON", async () => {
    const { app, events } = setup();

    await app.request("/v1/echo", jsonPost("{not json"));

    expect((await events())[0]).toMatchObject({
      status: 400,
      requestBytes: Buffer.byteLength("{not json"),
    });
  });

  it("is zero for a request without body", async () => {
    const { app, events } = setup();

    await app.request("/v1/ping");

    expect((await events())[0]?.requestBytes).toBe(0);
  });

  it("counts the bytes of the response", async () => {
    const { app, events } = setup();

    const response = await app.request("/v1/ping");
    const sent = Buffer.byteLength(await response.text());

    expect((await events())[0]?.responseBytes).toBe(sent);
  });

  it("counts the bytes of an error response", async () => {
    const { app, events } = setup();

    const response = await app.request("/v1/missing");
    const sent = Buffer.byteLength(await response.text());

    expect((await events())[0]?.responseBytes).toBe(sent);
  });

  it("still delivers the whole response to the client", async () => {
    const { app } = setup();

    const response = await app.request("/v1/ping");

    expect(await response.json()).toEqual({ status: "ok" });
  });
});

describe("request events: the kind of client", () => {
  it.each([
    [
      { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0.0.0" },
      "browser",
    ],
    [{ "user-agent": "curl/8.4.0" }, "script"],
    [
      { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
      "declared_bot",
    ],
    [{}, "none"],
  ])("classifies the headers %j as %s", async (headers, kind) => {
    const { app, events } = setup();

    await app.request("/v1/ping", { headers });

    expect((await events())[0]?.clientKind).toBe(kind);
  });

  it("never carries the User-Agent itself", async () => {
    const { app, events } = setup();

    await app.request("/v1/ping", {
      headers: { "user-agent": "Mozilla/5.0 unique-agent-marker" },
    });

    expect(JSON.stringify(await events())).not.toContain("unique-agent-marker");
  });
});

describe("request events: who and why", () => {
  it("names the user of an authenticated request", async () => {
    const { app, events } = setup();

    await app.request("/v1/me", {
      headers: { authorization: "Bearer token-a" },
    });

    expect((await events())[0]?.userId).toBe("user-a");
  });

  it("names no user for an anonymous request", async () => {
    const { app, events } = setup();

    await app.request("/v1/ping");

    expect((await events())[0]).not.toHaveProperty("userId");
  });

  it.each([
    ["/v1/me", undefined, 401, "unauthorized"],
    ["/v1/missing", undefined, 404, "not_found"],
    ["/v1/boom", undefined, 500, "internal_error"],
  ])("gives the error code of %s", async (path, _body, status, code) => {
    const { app, events } = setup();

    await app.request(path);

    expect((await events())[0]).toMatchObject({ status, errorCode: code });
  });

  it("gives invalid_request for a body that is not valid", async () => {
    const { app, events } = setup();

    await app.request("/v1/echo", jsonPost(JSON.stringify({ nope: 1 })));

    expect((await events())[0]).toMatchObject({
      status: 400,
      errorCode: "invalid_request",
    });
  });

  it("gives payload_too_large for a body over the limit", async () => {
    const { app, events } = setup();

    await app.request("/v1/echo", jsonPost("x".repeat(5000)));

    expect((await events())[0]).toMatchObject({
      status: 413,
      errorCode: "payload_too_large",
    });
  });

  it("gives no error code to a successful request", async () => {
    const { app, events } = setup();

    await app.request("/v1/ping");

    expect((await events())[0]).not.toHaveProperty("errorCode");
  });
});

describe("request events: the caller's network", () => {
  const request = (app: ReturnType<typeof setup>["app"], headers = {}) =>
    app.request("/v1/ping", { headers }, connection(CLIENT_IP));

  it("carries the fingerprint of the connection address", async () => {
    const { app, events } = setup();

    await request(app);

    expect((await events())[0]?.ipFingerprint).toEqual(fingerprint(CLIENT_IP));
  });

  it("never carries the address itself", async () => {
    const { app, events } = setup();

    await request(app);

    expect(JSON.stringify(await events())).not.toContain("203.0.113");
  });

  it("ignores X-Forwarded-For when no proxy is trusted", async () => {
    const { app, events } = setup();

    await request(app, { "x-forwarded-for": "6.6.6.6" });

    expect((await events())[0]?.ipFingerprint).toEqual(fingerprint(CLIENT_IP));
  });

  it("reads the address a trusted proxy forwarded", async () => {
    const { app, events } = setup({ trustedProxyHops: 1 });

    await app.request(
      "/v1/ping",
      { headers: { "x-forwarded-for": `6.6.6.6, ${CLIENT_IP}` } },
      connection("10.0.0.5"),
    );

    expect((await events())[0]?.ipFingerprint).toEqual(fingerprint(CLIENT_IP));
  });

  it("has no fingerprint without a key", async () => {
    const { app, events } = setup({ withFingerprint: false });

    await request(app);

    expect((await events())[0]).not.toHaveProperty("ipFingerprint");
  });

  it("has no fingerprint when the connection has no address", async () => {
    const { app, events } = setup();

    await app.request("/v1/ping");

    expect((await events())[0]).not.toHaveProperty("ipFingerprint");
  });
});

describe("request events: what is left out", () => {
  it("skips a probe, which would drown the averages", async () => {
    const { app, events } = setup();

    await app.request("/v1/live");
    await app.request("/v1/ping");

    expect((await events()).map((event) => event.route)).toEqual(["/v1/ping"]);
  });

  it("skips the documentation and the web client", async () => {
    const sink = new FakeSecurityEventSink();
    const publisher = createEventPublisher({
      sink,
      queueSize: 100,
      clock: new FixedClock(START),
      logger: createTestLogs().logger,
    });
    const index = { body: Buffer.from("x"), contentType: "text/html" };
    const { app } = createTestApp({
      docs: { script: "x" },
      web: new Map([["/", index]]),
      securityEvents: { publisher, trustedProxyHops: 0 },
    });

    await app.request("/docs");
    await app.request("/docs/scalar.js");
    await app.request("/");
    await publisher.close();

    expect(sink.events).toEqual([]);
  });

  it("measures nothing when no receiver is configured", async () => {
    const { app } = createTestApp();

    const response = await app.request("/v1/ping");

    expect(response.status).toBe(200);
  });
});

describe("request events never break a request", () => {
  it("serves the request when the publisher throws", async () => {
    const { app, logs } = setup({
      publisher: {
        publish: () => {
          throw new Error("publisher bug");
        },
        close: async () => undefined,
      },
    });

    const response = await app.request("/v1/ping");

    expect([response.status, logs.text()]).toEqual([
      200,
      expect.stringContaining("security event could not be emitted"),
    ]);
  });
});
