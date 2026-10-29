import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (file: string) => readFileSync(join(root, file), "utf8");
const compose = read("compose.yaml");
const dockerfile = read("Dockerfile");

describe("compose.yaml", () => {
  it("publishes the port on the loopback interface only", () => {
    const ports = [...compose.matchAll(/^\s*-\s*"?([^"\n]*:\d+)"?\s*$/gm)].map(
      (match) => match[1],
    );

    expect(
      ports.length > 0 && ports.every((p) => p?.startsWith("127.0.0.1:")),
    ).toBe(true);
  });

  it("runs with a read-only root filesystem", () => {
    expect(compose).toMatch(/^\s*read_only:\s*true\s*$/m);
  });

  it("drops every Linux capability", () => {
    expect(compose).toMatch(/cap_drop:\s*\n\s*-\s*ALL/);
  });

  it("forbids gaining privileges", () => {
    expect(compose).toContain("no-new-privileges:true");
  });

  it("mounts a volume for the data and nothing from the host", () => {
    const mounts = [
      ...compose.matchAll(/^\s{6}-\s*"?([^"\n]+:\/[^"\n]*)"?\s*$/gm),
    ].map((match) => match[1] ?? "");

    expect(mounts.filter((mount) => /^[./~]/.test(mount))).toEqual([]);
  });

  it("checks the health of the server", () => {
    expect(compose).toMatch(/healthcheck:/);
  });
});

describe("Dockerfile", () => {
  it("runs as an unprivileged user", () => {
    const user = [...dockerfile.matchAll(/^USER\s+(\S+)/gm)].at(-1)?.[1];

    expect(user).toBe("node");
  });

  it("does not run the application as root in its last stage", () => {
    const lastStage = dockerfile.slice(dockerfile.lastIndexOf("FROM "));

    expect(lastStage).toMatch(/^USER\s+node\s*$/m);
  });

  it("starts the compiled server, not a development tool", () => {
    expect(dockerfile).toMatch(/CMD \["node", "server\/dist\/main\.js"\]/);
  });

  it("does not bake secrets or the local database into the image", () => {
    expect(read(".dockerignore")).toMatch(/\.env/);
  });
});
