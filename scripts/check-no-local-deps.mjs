// A local link or file dependency works on one machine and breaks every other
// install, so CI refuses it in every package.json and in the lockfile.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LOCAL_PROTOCOL = /^(link|file|portal):/;
const LOCKFILE_LOCAL_ENTRY =
  /^\s*(specifier|version):\s*['"]?((link|file|portal):\S*?)['"]?\s*$/;

function collectManifestOffenders(value, path, offenders) {
  if (typeof value === "string") {
    if (LOCAL_PROTOCOL.test(value)) offenders.push(`${path} = ${value}`);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    collectManifestOffenders(child, `${path}.${key}`, offenders);
  }
}

// pnpm writes the dependency of one workspace package on another as
// `link:../<package>`: that one is not a local path of one machine.
function isWorkspaceLink(reference, workspaceNames) {
  const match = /^link:\.\.\/([^/]+)$/.exec(reference);
  return match !== null && workspaceNames.has(match[1]);
}

// The root manifest and the one of each workspace package.
function manifestPaths(directory) {
  const paths = ["package.json"];
  const packagesDirectory = join(directory, "packages");
  if (existsSync(packagesDirectory)) {
    for (const entry of readdirSync(packagesDirectory, {
      withFileTypes: true,
    })) {
      const manifest = join("packages", entry.name, "package.json");
      if (entry.isDirectory() && existsSync(join(directory, manifest))) {
        paths.push(manifest);
      }
    }
  }
  return paths;
}

const directory = process.argv[2] ?? process.cwd();
const offenders = [];
const manifests = manifestPaths(directory);
const workspaceNames = new Set(
  manifests
    .filter((path) => path !== "package.json")
    .map((path) => path.split("/")[1]),
);

for (const path of manifests) {
  const manifest = JSON.parse(readFileSync(join(directory, path), "utf8"));
  collectManifestOffenders(manifest, path, offenders);
}

readFileSync(join(directory, "pnpm-lock.yaml"), "utf8")
  .split("\n")
  .forEach((line, index) => {
    const match = LOCKFILE_LOCAL_ENTRY.exec(line);
    if (match !== null && !isWorkspaceLink(match[2], workspaceNames)) {
      offenders.push(`pnpm-lock.yaml:${index + 1} ${line.trim()}`);
    }
  });

if (offenders.length > 0) {
  console.error("Local dependency references are not allowed:");
  for (const offender of offenders) console.error(`  ${offender}`);
  process.exit(1);
}
