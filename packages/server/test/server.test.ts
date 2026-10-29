import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FakeSecurityEventSink } from "@rin-language/core-test-kit";
import { afterEach, describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env.js";
import { NoIdentity } from "../src/identity/no-identity.js";
import { createIpFingerprinter } from "../src/security/ip-fingerprint.js";
import {
  type RunningServer,
  type StartOptions,
  startServer,
} from "../src/server.js";

const shippedConfigDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../config",
);
const silent = { write: () => undefined };

const running: RunningServer[] = [];
const temporaryDirs: string[] = [];

afterEach(async () => {
  for (const server of running.splice(0)) await server.close();
  for (const dir of temporaryDirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

// A copy of the shipped configuration with the given app.json overrides.
function configWith(dir: string, overrides: Record<string, unknown>): string {
  const configDir = join(dir, "config");
  cpSync(shippedConfigDir, configDir, { recursive: true });
  const app = JSON.parse(
    readFileSync(join(shippedConfigDir, "app.json"), "utf8"),
  );
  writeFileSync(
    join(configDir, "app.json"),
    JSON.stringify({
      ...app,
      dataDir: join(shippedConfigDir, app.dataDir),
      ...overrides,
    }),
  );
  return configDir;
}

async function start(
  appOverrides?: Record<string, unknown>,
  extraEnv: Record<string, string> = {},
  startOptions: StartOptions = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "rin-server-"));
  temporaryDirs.push(dir);
  const databasePath = join(dir, "rin.sqlite");
  const server = await startServer(
    parseEnv({
      APP_CONFIG_DIR:
        appOverrides === undefined
          ? shippedConfigDir
          : configWith(dir, appOverrides),
      APP_DATABASE_PATH: databasePath,
      APP_PORT: "0",
      ...extraEnv,
    }),
    { logDestination: silent, ...startOptions },
  );
  running.push(server);
  return { server, databasePath, url: `http://${server.host}:${server.port}` };
}

describe("startServer", () => {
  it.each(["/health", "/v1/limits", "/v1/capabilities"])(
    "answers a real HTTP call on %s",
    async (path) => {
      const { url } = await start();

      const response = await fetch(`${url}${path}`);

      expect(response.status).toBe(200);
    },
  );

  it("listens on the loopback interface by default", async () => {
    const { server } = await start();

    expect(server.host).toBe("127.0.0.1");
  });

  it("applies the timeouts of the configuration", async () => {
    const { server } = await start();

    expect([server.http.headersTimeout, server.http.requestTimeout]).toEqual([
      10000, 30000,
    ]);
  });

  it("creates its database readable by its owner only", async () => {
    const { databasePath } = await start();

    expect(statSync(databasePath).mode & 0o077).toBe(0);
  });

  it("sends no CORS header with the shipped configuration", async () => {
    const { url } = await start();

    const response = await fetch(`${url}/health`, {
      headers: { origin: "https://app.example.com" },
    });

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("allows the origins listed in the configuration", async () => {
    const { url } = await start({
      cors: { allowedOrigins: ["https://app.example.com"] },
    });

    const response = await fetch(`${url}/health`, {
      headers: { origin: "https://app.example.com" },
    });

    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://app.example.com",
    );
  });

  it("serves the interactive documentation with its own viewer script when enabled", async () => {
    const { url } = await start({ docs: { enabled: true } });

    const [page, script] = await Promise.all([
      fetch(`${url}/docs`),
      fetch(`${url}/docs/scalar.js`),
    ]);

    expect([
      page.status,
      script.status,
      (await script.text()).length > 1000,
    ]).toEqual([200, 200, true]);
  });

  it("does not serve the documentation with the shipped configuration", async () => {
    const { url } = await start();

    const [page, script] = await Promise.all([
      fetch(`${url}/docs`),
      fetch(`${url}/docs/scalar.js`),
    ]);

    expect([page.status, script.status]).toEqual([404, 404]);
  });

  it("serves the web client from the folder it is given", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rin-web-"));
    temporaryDirs.push(dir);
    writeFileSync(
      join(dir, "index.html"),
      "<!doctype html><title>client</title>",
    );
    const { url } = await start(undefined, { APP_WEB_DIR: dir });

    const response = await fetch(`${url}/`);

    expect([response.status, await response.text()]).toEqual([
      200,
      "<!doctype html><title>client</title>",
    ]);
  });

  it("serves no web client when no folder is given", async () => {
    const { url } = await start();

    const response = await fetch(`${url}/`);

    expect(response.status).toBe(404);
  });

  it("refuses to start when the web client folder is invalid", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rin-web-"));
    temporaryDirs.push(dir);

    await expect(start(undefined, { APP_WEB_DIR: dir })).rejects.toThrow(
      /index\.html/,
    );
  });

  it("stops accepting connections once closed", async () => {
    const { server, url } = await start();

    await server.close();

    await expect(fetch(`${url}/health`)).rejects.toThrow();
  });

  it("refuses to start with an invalid configuration", async () => {
    await expect(
      startServer(
        parseEnv({ APP_CONFIG_DIR: join(tmpdir(), "rin-no-config") }),
        { logDestination: silent },
      ),
    ).rejects.toThrow(/app\.json/);
  });
});

const FINGERPRINT_ENV = {
  APP_IP_FINGERPRINT_KEY: "k".repeat(32),
  APP_IP_FINGERPRINT_KEY_ID: "k1",
};
const fingerprint = createIpFingerprinter({ key: "k".repeat(32), keyId: "k1" });

describe("startServer security events", () => {
  async function eventsOf(
    call: (url: string) => Promise<unknown>,
    options: {
      appOverrides?: Record<string, unknown>;
      env?: Record<string, string>;
    } = {},
  ) {
    const sink = new FakeSecurityEventSink();
    const { server, url } = await start(options.appOverrides, options.env, {
      securityEventSink: sink,
    });
    await call(url);
    await server.close();
    return sink.events;
  }

  it("classifies the client with the patterns of the configuration", async () => {
    const events = await eventsOf((url) => fetch(`${url}/v1/limits`), {
      appOverrides: {
        securityEvents: {
          clientKinds: { declaredBot: [], script: [], browser: ["node"] },
        },
      },
    });

    expect(events[0]).toMatchObject({ clientKind: "browser" });
  });

  it("counts a body the client abandoned as a client error, not a crash", async () => {
    const sink = new FakeSecurityEventSink();
    const lines: string[] = [];
    const { server } = await start(undefined, undefined, {
      securityEventSink: sink,
      logDestination: { write: (line: string) => void lines.push(line) },
    });

    await new Promise<void>((resolve) => {
      const socket = connect(server.port, server.host, () => {
        socket.write(
          'POST /v1/echo HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n5\r\n{"tex\r\n',
        );
        setTimeout(() => {
          socket.destroy();
          resolve();
        }, 50);
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await server.close();

    const statuses = sink.events.flatMap((event) =>
      event.type === "request" ? [event.status] : [],
    );
    expect([
      statuses.includes(500),
      lines.join("").includes("unhandled error"),
    ]).toEqual([false, false]);
  });

  it("delivers the event of a real request to the receiver", async () => {
    const events = await eventsOf((url) => fetch(`${url}/v1/limits`));

    expect(events).toMatchObject([
      { type: "request", route: "/v1/limits", status: 200 },
    ]);
  });

  it("leaves out the health probe", async () => {
    const events = await eventsOf((url) => fetch(`${url}/health`));

    expect(events).toEqual([]);
  });

  it("fingerprints the address of the real connection", async () => {
    const events = await eventsOf((url) => fetch(`${url}/v1/limits`), {
      env: FINGERPRINT_ENV,
    });

    expect(events[0]).toMatchObject({
      ipFingerprint: fingerprint("127.0.0.1"),
    });
  });

  it("emits no fingerprint without a key", async () => {
    const events = await eventsOf((url) => fetch(`${url}/v1/limits`));

    expect(events[0]).not.toHaveProperty("ipFingerprint");
  });

  it("ignores X-Forwarded-For by default", async () => {
    const events = await eventsOf(
      (url) =>
        fetch(`${url}/v1/limits`, {
          headers: { "x-forwarded-for": "203.0.113.7" },
        }),
      { env: FINGERPRINT_ENV },
    );

    expect(events[0]).toMatchObject({
      ipFingerprint: fingerprint("127.0.0.1"),
    });
  });

  it("reads X-Forwarded-For when the configuration trusts one proxy", async () => {
    const events = await eventsOf(
      (url) =>
        fetch(`${url}/v1/limits`, {
          headers: { "x-forwarded-for": "203.0.113.7" },
        }),
      {
        env: FINGERPRINT_ENV,
        appOverrides: { securityEvents: { trustedProxyHops: 1 } },
      },
    );

    expect(events[0]).toMatchObject({
      ipFingerprint: fingerprint("203.0.113.7"),
    });
  });

  it("waits for the events still queued before it finishes closing", async () => {
    const sink = new FakeSecurityEventSink();
    const { server, url } = await start(undefined, undefined, {
      securityEventSink: sink,
    });
    sink.hold();
    await fetch(`${url}/v1/limits`);

    let isClosed = false;
    const closing = server.close().then(() => {
      isClosed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const wasClosedWhileWaiting = isClosed;
    sink.release();
    await closing;

    expect([wasClosedWhileWaiting, sink.events.length]).toEqual([false, 1]);
  });

  it("holds back as many events as the configuration allows", async () => {
    const sink = new FakeSecurityEventSink();
    const { server, url } = await start(
      { securityEvents: { queueSize: 1 } },
      undefined,
      { securityEventSink: sink },
    );
    sink.hold();
    for (let n = 0; n < 5; n++) await fetch(`${url}/v1/limits`);
    sink.release();
    await server.close();

    // One in flight and one queued; the three others are reported as lost.
    expect(sink.events.map((event) => event.type)).toEqual([
      "request",
      "request",
      "events_dropped",
    ]);
  });

  it("warns when a fingerprint key is set but nothing receives events", async () => {
    const lines: string[] = [];
    await start(undefined, FINGERPRINT_ENV, {
      logDestination: { write: (line: string) => void lines.push(line) },
    });

    expect(lines.join("")).toContain("APP_IP_FINGERPRINT_KEY");
  });

  it("does not warn about the key when a receiver is configured", async () => {
    const lines: string[] = [];
    await start(undefined, FINGERPRINT_ENV, {
      logDestination: { write: (line: string) => void lines.push(line) },
      securityEventSink: new FakeSecurityEventSink(),
    });

    expect(lines.join("")).not.toContain("APP_IP_FINGERPRINT_KEY");
  });

  it("does not repeat the fingerprint key in its logs", async () => {
    const lines: string[] = [];
    await start(undefined, FINGERPRINT_ENV, {
      logDestination: { write: (line: string) => void lines.push(line) },
    });

    expect(lines.join("")).not.toContain("k".repeat(32));
  });
});

describe("NoIdentity", () => {
  it("authenticates nobody", async () => {
    const identity = new NoIdentity();

    expect(
      await identity.authenticate(
        new Request("http://localhost/", {
          headers: { authorization: "Bearer anything" },
        }),
      ),
    ).toBeNull();
  });
});
