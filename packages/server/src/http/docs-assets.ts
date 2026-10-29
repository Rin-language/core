import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { DocsAssets } from "./docs.js";

const require = createRequire(import.meta.url);

/**
 * Reads the viewer bundle shipped with the Scalar package, so the page never
 * loads anything from a CDN. The bundle is not an exported path of the
 * package, so it is found next to its main entry.
 */
export function loadDocsAssets(): DocsAssets {
  const entry = require.resolve("@scalar/api-reference");
  const bundle = join(dirname(entry), "browser", "standalone.js");
  return { script: readFileSync(bundle) };
}
