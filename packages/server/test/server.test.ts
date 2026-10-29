import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env.js";
import { NoIdentity } from "../src/identity/no-identity.js";
import { type RunningServer, startServer } from "../src/server.js";

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

async function start() {
  const dir = mkdtempSync(join(tmpdir(), "rin-server-"));
  temporaryDirs.push(dir);
  const databasePath = join(dir, "rin.sqlite");
  const server = await startServer(
    parseEnv({
      RIN_CONFIG_DIR: shippedConfigDir,
      RIN_DATABASE_PATH: databasePath,
      RIN_PORT: "0",
    }),
    { logDestination: silent },
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

  it("stops accepting connections once closed", async () => {
    const { server, url } = await start();

    await server.close();

    await expect(fetch(`${url}/health`)).rejects.toThrow();
  });

  it("refuses to start with an invalid configuration", async () => {
    await expect(
      startServer(
        parseEnv({ RIN_CONFIG_DIR: join(tmpdir(), "rin-no-config") }),
        { logDestination: silent },
      ),
    ).rejects.toThrow(/app\.json/);
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
