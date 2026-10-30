import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = new URL(
  "../../../../scripts/check-no-local-deps.mjs",
  import.meta.url,
).pathname;
const cleanLockfile = [
  "lockfileVersion: '9.0'",
  "settings:",
  "  excludeLinksFromLockfile: false",
  "importers:",
  "  .:",
  "    devDependencies:",
  "      zod:",
  "        specifier: 4.6.7",
  "        version: 4.6.7",
  "",
].join("\n");

const directories: string[] = [];

function runCheck(
  packageJson: object,
  lockfile: string,
  extraFiles: Record<string, string> = {},
) {
  const directory = mkdtempSync(join(tmpdir(), "no-local-deps-"));
  directories.push(directory);
  writeFileSync(join(directory, "package.json"), JSON.stringify(packageJson));
  writeFileSync(join(directory, "pnpm-lock.yaml"), lockfile);
  for (const [path, content] of Object.entries(extraFiles)) {
    const target = join(directory, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return spawnSync("node", [scriptPath, directory], { encoding: "utf8" });
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("check-no-local-deps", () => {
  it("passes when no dependency points at a local path", () => {
    const result = runCheck(
      { devDependencies: { zod: "4.6.7" } },
      cleanLockfile,
    );

    expect(result.status).toBe(0);
  });

  it.each(["link:../contract", "file:../contract", "portal:../contract"])(
    "rejects %s in package.json",
    (specifier) => {
      const result = runCheck(
        { devDependencies: { zod: specifier } },
        cleanLockfile,
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("package.json");
    },
  );

  it("rejects a local path in package.json overrides", () => {
    const result = runCheck(
      { pnpm: { overrides: { zod: "link:../zod" } } },
      cleanLockfile,
    );

    expect(result.status).toBe(1);
  });

  it("rejects a link: entry in the lockfile", () => {
    const lockfile = `${cleanLockfile}        version: link:../contract\n`;
    const result = runCheck({ devDependencies: { zod: "4.6.7" } }, lockfile);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("pnpm-lock.yaml");
  });

  it("rejects a link dependency in a workspace package manifest", () => {
    const result = runCheck({}, cleanLockfile, {
      "packages/web/package.json": JSON.stringify({
        dependencies: { x: "link:../x" },
      }),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("packages/web/package.json");
  });

  it("passes a workspace dependency in a package manifest", () => {
    const result = runCheck({}, cleanLockfile, {
      "packages/web/package.json": JSON.stringify({
        dependencies: { "@rin-language/contract": "workspace:*" },
      }),
    });

    expect(result.status).toBe(0);
  });

  it("ignores a packages directory without a manifest", () => {
    const result = runCheck({}, cleanLockfile, {
      "packages/empty/.keep": "",
    });

    expect(result.status).toBe(0);
  });

  const workspacePackages = {
    "packages/web/package.json": "{}",
    "packages/server/package.json": "{}",
  };

  it("allows the link pnpm writes between two workspace packages", () => {
    const lockfile = `${cleanLockfile}        version: link:../server\n`;

    const result = runCheck({}, lockfile, workspacePackages);

    expect(result.status).toBe(0);
  });

  it("rejects a lockfile link that leaves the workspace", () => {
    const lockfile = `${cleanLockfile}        version: link:../../contract\n`;

    const result = runCheck({}, lockfile, workspacePackages);

    expect(result.status).toBe(1);
  });

  it("rejects a lockfile link to a package that is not in the workspace", () => {
    const lockfile = `${cleanLockfile}        version: link:../contract\n`;

    const result = runCheck({}, lockfile, workspacePackages);

    expect(result.status).toBe(1);
  });

  it("rejects a file: entry in the lockfile even for a workspace name", () => {
    const lockfile = `${cleanLockfile}        version: file:../server\n`;

    const result = runCheck({}, lockfile, workspacePackages);

    expect(result.status).toBe(1);
  });
});
