import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { ConfigError } from "../config/config-error.js";
import type { DocsAssets } from "./docs.js";

const require = createRequire(import.meta.url);
const VIEWER_PACKAGE = "@scalar/api-reference";

const isModuleNotFound = (error: unknown): boolean =>
  error instanceof Error &&
  "code" in error &&
  error.code === "MODULE_NOT_FOUND";

/**
 * Reads the viewer bundle shipped with the Scalar package, so the page never
 * loads anything from a CDN. The bundle is not an exported path of the
 * package, so it is found next to its main entry. The package is an optional
 * dependency, so it can be missing: that is reported as what it is.
 */
export function loadDocsAssets(
  resolveEntry: (id: string) => string = (id) => require.resolve(id),
): DocsAssets {
  let entry: string;
  try {
    entry = resolveEntry(VIEWER_PACKAGE);
  } catch (error) {
    if (!isModuleNotFound(error)) throw error;
    throw new ConfigError(
      "app.json",
      [
        `docs.enabled is true but ${VIEWER_PACKAGE} is not installed: it is an optional dependency, which a plain pnpm install brings; for Docker build the image with WITH_DOCS=true (APP_WITH_DOCS=true with compose); or set docs.enabled to false`,
      ],
      { cause: error },
    );
  }
  const bundle = join(dirname(entry), "browser", "standalone.js");
  return { script: readFileSync(bundle) };
}
