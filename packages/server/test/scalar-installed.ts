import { createRequire } from "node:module";

/**
 * Scalar is an optional dependency, so a checkout installed without optional
 * dependencies has none. The tests that need the real viewer skip then.
 */
export const isScalarInstalled = ((): boolean => {
  try {
    createRequire(import.meta.url).resolve("@scalar/api-reference");
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "MODULE_NOT_FOUND"
    ) {
      return false;
    }
    throw error;
  }
})();
