import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CapabilitiesResponse, LimitsResponse } from "@rin-language/contract";
import { FixedClock } from "@rin-language/core-test-kit";
import { describe, expect, it } from "vitest";
import { parseAppConfig } from "../../src/config/app-config.js";
import { parseLanguageProfile } from "../../src/config/language-profile.js";
import type { LoadedConfig } from "../../src/config/load-config.js";
import { loadConfig } from "../../src/config/load-config.js";
import { createApp } from "../../src/http/create-app.js";
import { buildCoreRoutes } from "../../src/routes/core-routes.js";
import { createTestLogs, testIdentity } from "../http/test-app.js";

const shippedConfigDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../config",
);

const appFor = (config: LoadedConfig) =>
  createApp({
    routes: buildCoreRoutes(config),
    identity: testIdentity,
    clock: new FixedClock("2026-10-29T10:00:00Z"),
    logger: createTestLogs().logger,
    maxBodyBytes: config.app.maxBodyBytes,
  });

const shipped = loadConfig(shippedConfigDir);
const shippedApp = appFor(shipped);

function twoLanguageConfig(): LoadedConfig {
  const app = parseAppConfig({
    dataDir: "../data",
    languages: ["fr", "ja"],
    defaultLanguage: "ja",
    limits: { maxTextLength: 10, maxEdits: 5, maxExplanationLength: 20 },
    maxBodyBytes: 1024,
    timeouts: { headersMs: 1000, requestMs: 2000 },
  });
  const profile = (code: string, levels: string[]) =>
    parseLanguageProfile(
      {
        profile: {
          code,
          levels,
          skills: ["reading", "writing"],
          prompts: { correction: "SECRET-PROMPT-TEXT" },
        },
        errorTypes: {
          default: "other",
          types: [{ id: "other", description: "SECRET-DESCRIPTION" }],
        },
        grammar: [
          {
            grammar_point_id: "g1",
            pattern: "SECRET-PATTERN",
            level: levels[0],
            error_type: "other",
          },
        ],
      },
      code,
    );
  return {
    app,
    languages: {
      ja: profile("ja", ["N5", "N4"]),
      fr: profile("fr", ["A1", "A2"]),
    },
  };
}

describe("GET /health", () => {
  it("reports that the server is alive", async () => {
    const response = await shippedApp.request("/health");

    expect([response.status, await response.json()]).toEqual([
      200,
      { status: "ok" },
    ]);
  });
});

describe("GET /v1/limits", () => {
  it("publishes the limits of the configuration", async () => {
    const response = await shippedApp.request("/v1/limits");

    expect(LimitsResponse.parse(await response.json())).toEqual(
      shipped.app.limits,
    );
  });
});

describe("GET /v1/capabilities", () => {
  it("publishes the Japanese scale and skills", async () => {
    const response = await shippedApp.request("/v1/capabilities");
    const { languages } = CapabilitiesResponse.parse(await response.json());

    expect(languages[0]).toMatchObject({
      code: "ja",
      levels: ["N5", "N4", "N3", "N2", "N1"],
      skills: ["reading", "listening", "writing", "speaking"],
    });
  });

  it("publishes the error type ids of the data files", async () => {
    const response = await shippedApp.request("/v1/capabilities");
    const { languages } = CapabilitiesResponse.parse(await response.json());

    expect(languages[0]?.errorTypes).toEqual(
      shipped.languages.ja?.errorTypes.types.map((type) => type.id),
    );
  });

  it("lists the languages in the order of the configuration", async () => {
    const response = await appFor(twoLanguageConfig()).request(
      "/v1/capabilities",
    );
    const { languages } = CapabilitiesResponse.parse(await response.json());

    expect(languages.map((language) => language.code)).toEqual(["fr", "ja"]);
  });

  it("keeps prompts, descriptions and grammar on the server", async () => {
    const response = await appFor(twoLanguageConfig()).request(
      "/v1/capabilities",
    );
    const text = await response.text();

    for (const hidden of [
      "SECRET-PROMPT-TEXT",
      "SECRET-DESCRIPTION",
      "SECRET-PATTERN",
    ]) {
      expect(text).not.toContain(hidden);
    }
  });
});

describe("core routes", () => {
  it("are public: they hold no user data", () => {
    const auths = buildCoreRoutes(shipped).map((route) => route.auth);

    expect(new Set(auths)).toEqual(new Set(["public"]));
  });
});
