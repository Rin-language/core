// A migration that was released is never edited, renamed or removed: databases
// already ran it, and its checksum is stored with them. A new migration may be
// added. Usage: node scripts/check-migrations-unchanged.mjs <base-ref> [repo-dir]
import { spawnSync } from "node:child_process";

const MIGRATIONS_DIRECTORY = "packages/server/src/storage/sqlite/migrations/";
const MIGRATION_FILE = /\/\d{4}-[^/]+\.ts$/;

const baseRef = process.argv[2];
const repository = process.argv[3] ?? process.cwd();
if (baseRef === undefined) {
  console.error("Usage: check-migrations-unchanged.mjs <base-ref> [repo-dir]");
  process.exit(2);
}

// Git would read a value starting with "-" as an option, and some write files.
if (baseRef.startsWith("-")) {
  console.error("The base ref must not start with '-'");
  process.exit(2);
}

// Three dots: what this branch changed since it left the base, not what the
// base gained since.
const diff = spawnSync(
  "git",
  [
    "diff",
    "--name-status",
    "--no-renames",
    `${baseRef}...HEAD`,
    "--",
    MIGRATIONS_DIRECTORY,
  ],
  { cwd: repository, encoding: "utf8" },
);
if (diff.status !== 0) {
  console.error(`git diff failed: ${diff.stderr.trim()}`);
  process.exit(2);
}

const offenders = diff.stdout
  .split("\n")
  .filter((line) => line !== "")
  .map((line) => line.split("\t"))
  .filter(
    ([status, path]) =>
      status !== "A" && path !== undefined && MIGRATION_FILE.test(path),
  );

if (offenders.length > 0) {
  console.error(
    "Released migrations must not change. Add a new migration instead:",
  );
  for (const [status, path] of offenders) console.error(`  ${status} ${path}`);
  process.exit(1);
}
