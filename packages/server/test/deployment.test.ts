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

  it("caps the memory the container may use", () => {
    expect(compose).toMatch(/^\s*mem_limit:\s*\S+\s*$/m);
  });

  it("caps the number of processes", () => {
    expect(compose).toMatch(/^\s*pids_limit:\s*\d+\s*$/m);
  });

  it("leaves the documentation viewer out of the image unless asked", () => {
    expect(compose).toMatch(/WITH_DOCS:\s*\$\{APP_WITH_DOCS:-false\}/);
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

  describe("Node runtime", () => {
    const versions = [
      ...dockerfile.matchAll(/^FROM node:(\d+)\.(\d+)\.(\d+)-/gm),
    ].map((match) => match.slice(1, 4).map(Number));

    it("names an exact version in every stage, so a rebuild cannot change it", () => {
      expect(versions).toHaveLength(2);
    });

    it("uses the same version to build and to run", () => {
      expect(versions[0]).toEqual(versions[1]);
    });

    it("is past the 24.4.1 fix for the V8 hash-flooding denial of service", () => {
      const [major = 0, minor = 0, patch = 0] = versions[0] ?? [];
      const isPatched =
        major > 24 ||
        (major === 24 && (minor > 4 || (minor === 4 && patch >= 1)));

      expect(isPatched).toBe(true);
    });
  });

  it("builds without the optional documentation viewer by default", () => {
    expect(dockerfile).toMatch(/^ARG WITH_DOCS=false$/m);
  });

  it("leaves the optional dependencies out of the production tree", () => {
    expect(dockerfile).toMatch(/--prod --legacy \$OPTIONAL deploy/);
  });

  it("still installs them to build, since the web build needs the native binaries that are optional too", () => {
    const install = dockerfile.match(/pnpm install[^\n]*/)?.[0] ?? "";

    expect(install).not.toMatch(/--no-optional|\$OPTIONAL/);
  });

  describe("package managers", () => {
    const runtimeStage = dockerfile.slice(dockerfile.lastIndexOf("FROM "));
    const buildStage = dockerfile.slice(0, dockerfile.lastIndexOf("FROM "));

    it.each(["npm", "npx", "corepack", "yarn"])(
      "removes %s from the image that runs the server",
      (tool) => {
        expect(runtimeStage).toMatch(
          new RegExp(
            `RUN rm -rf[^\\n]*(\\\\\\n[^\\n]*)*/usr/local/bin/${tool}\\b`,
          ),
        );
      },
    );

    it("removes the package managers' own files, not only their commands", () => {
      expect(runtimeStage).toMatch(/\/usr\/local\/lib\/node_modules\/npm/);
    });

    it("keeps corepack in the build stage, which runs pnpm", () => {
      expect(buildStage).toMatch(/corepack enable/);
    });
  });

  it("starts the compiled server, not a development tool", () => {
    expect(dockerfile).toMatch(/CMD \["node", "server\/dist\/main\.js"\]/);
  });

  it("does not bake secrets or the local database into the image", () => {
    expect(read(".dockerignore")).toMatch(/\.env/);
  });
});
