import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = new URL(
  "../../../../scripts/check-migrations-unchanged.mjs",
  import.meta.url,
).pathname;
const migrationsDirectory = "packages/server/src/storage/sqlite/migrations";

const directories: string[] = [];

function git(repository: string, args: string[]) {
  const result = spawnSync(
    "git",
    [
      "-c",
      "user.email=t@t",
      "-c",
      "user.name=t",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd: repository, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result;
}

function writeFile(repository: string, path: string, content: string) {
  const target = join(repository, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function createRepository() {
  const repository = mkdtempSync(join(tmpdir(), "migrations-unchanged-"));
  directories.push(repository);
  git(repository, ["init", "-b", "main"]);
  writeFile(repository, `${migrationsDirectory}/0001-first.ts`, "one\n");
  writeFile(repository, `${migrationsDirectory}/index.ts`, "index\n");
  git(repository, ["add", "."]);
  git(repository, ["commit", "-m", "base"]);
  git(repository, ["checkout", "-b", "feature"]);
  return repository;
}

function commit(repository: string, message: string) {
  git(repository, ["add", "-A"]);
  git(repository, ["commit", "-m", message]);
}

function runCheck(args: string[], cwd: string) {
  return spawnSync("node", [scriptPath, ...args], {
    cwd,
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("check-migrations-unchanged", () => {
  it("passes when the branch only adds a migration", () => {
    const repository = createRepository();
    writeFile(repository, `${migrationsDirectory}/0002-second.ts`, "two\n");
    commit(repository, "add migration");

    const result = runCheck(["main", repository], repository);

    expect(result.status).toBe(0);
  });

  it("fails when a released migration is modified", () => {
    const repository = createRepository();
    writeFile(repository, `${migrationsDirectory}/0001-first.ts`, "changed\n");
    commit(repository, "modify migration");

    const result = runCheck(["main", repository], repository);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("0001-first.ts");
  });

  it("fails when a released migration is deleted", () => {
    const repository = createRepository();
    rmSync(join(repository, `${migrationsDirectory}/0001-first.ts`));
    commit(repository, "delete migration");

    const result = runCheck(["main", repository], repository);

    expect(result.status).toBe(1);
  });

  it("fails when a released migration is renamed", () => {
    const repository = createRepository();
    renameSync(
      join(repository, `${migrationsDirectory}/0001-first.ts`),
      join(repository, `${migrationsDirectory}/0001-renamed.ts`),
    );
    commit(repository, "rename migration");

    const result = runCheck(["main", repository], repository);

    expect(result.status).toBe(1);
  });

  it("passes when only the migrations index changes", () => {
    const repository = createRepository();
    writeFile(repository, `${migrationsDirectory}/index.ts`, "changed\n");
    commit(repository, "modify index");

    const result = runCheck(["main", repository], repository);

    expect(result.status).toBe(0);
  });

  it("passes when a file outside the migrations directory changes", () => {
    const repository = createRepository();
    writeFile(repository, "README.md", "docs\n");
    commit(repository, "modify readme");

    const result = runCheck(["main", repository], repository);

    expect(result.status).toBe(0);
  });

  it("exits 2 when the base ref is unknown", () => {
    const repository = createRepository();

    const result = runCheck(["missing-base", repository], repository);

    expect(result.status).toBe(2);
  });

  it("exits 2 when no argument is given", () => {
    const repository = createRepository();

    const result = runCheck([], repository);

    expect(result.status).toBe(2);
  });

  it("exits 2 for a base ref that git would read as an option", () => {
    const repository = createRepository();

    const result = runCheck(["--output=leak.txt", repository], repository);

    expect(result.status).toBe(2);
  });
});
