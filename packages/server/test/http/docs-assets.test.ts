import { describe, expect, it } from "vitest";
import { ConfigError } from "../../src/config/config-error.js";
import { loadDocsAssets } from "../../src/http/docs-assets.js";
import { isScalarInstalled } from "../scalar-installed.js";

const notInstalled = () => {
  throw Object.assign(new Error("Cannot find module"), {
    code: "MODULE_NOT_FOUND",
  });
};

describe("loadDocsAssets", () => {
  it.skipIf(!isScalarInstalled)(
    "reads the viewer bundle of the installed package",
    () => {
      expect(loadDocsAssets().script.byteLength).toBeGreaterThan(1000);
    },
  );

  it("reports a missing viewer as a configuration problem", () => {
    expect(() => loadDocsAssets(notInstalled)).toThrow(ConfigError);
  });

  it("names the package and the ways out", () => {
    expect(() => loadDocsAssets(notInstalled)).toThrow(
      expect.objectContaining({
        message: expect.stringMatching(
          /docs\.enabled.*@scalar\/api-reference.*WITH_DOCS/s,
        ),
      }),
    );
  });

  it("does not hide any other failure", () => {
    const broken = () => {
      throw new Error("disk exploded");
    };

    expect(() => loadDocsAssets(broken)).toThrow("disk exploded");
  });
});
