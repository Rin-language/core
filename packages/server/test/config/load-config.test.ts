import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError } from "../../src/config/config-error.js";
import { loadConfig } from "../../src/config/load-config.js";

const shippedConfigDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../config",
);

const temporaryDirs: string[] = [];

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

interface Fixture {
  app?: unknown;
  profile?: unknown;
  errorTypes?: unknown;
  grammar?: unknown;
}

function writeFixture(fixture: Fixture = {}): string {
  const root = mkdtempSync(join(tmpdir(), "rin-config-"));
  temporaryDirs.push(root);
  const configDir = join(root, "config");
  for (const dir of [
    join(configDir, "languages"),
    join(root, "data/error-types"),
    join(root, "data/grammar"),
  ]) {
    mkdirSync(dir, { recursive: true });
  }
  const write = (path: string, content: unknown) =>
    writeFileSync(
      path,
      typeof content === "string" ? content : JSON.stringify(content),
    );
  write(
    join(configDir, "app.json"),
    fixture.app ?? {
      dataDir: "../data",
      languages: ["xx"],
      defaultLanguage: "xx",
      limits: { maxTextLength: 10, maxEdits: 5, maxExplanationLength: 20 },
      maxBodyBytes: 1024,
      timeouts: { headersMs: 1000, requestMs: 2000 },
    },
  );
  write(
    join(configDir, "languages/xx.json"),
    fixture.profile ?? {
      code: "xx",
      levels: ["L1"],
      skills: ["reading"],
      prompts: {},
    },
  );
  write(
    join(root, "data/error-types/xx.json"),
    fixture.errorTypes ?? {
      default: "other",
      types: [{ id: "other", description: "Anything." }],
    },
  );
  if (fixture.grammar !== null) {
    write(join(root, "data/grammar/xx.json"), fixture.grammar ?? []);
  }
  return configDir;
}

describe("loadConfig with the shipped configuration", () => {
  it("loads the Japanese profile", () => {
    const { languages } = loadConfig(shippedConfigDir);

    expect(languages.ja?.levels).toEqual(["N5", "N4", "N3", "N2", "N1"]);
  });

  it("keeps every shipped grammar rule consistent with the profile", () => {
    const { languages } = loadConfig(shippedConfigDir);

    expect(languages.ja?.grammar.length).toBeGreaterThan(0);
  });

  it("ships with the interactive documentation and CORS closed", () => {
    const { app } = loadConfig(shippedConfigDir);

    expect([app.docs.enabled, app.cors.allowedOrigins]).toEqual([false, []]);
  });
});

describe("loadConfig", () => {
  it("loads a language without a grammar pack", () => {
    const { languages } = loadConfig(writeFixture({ grammar: null }));

    expect(languages.xx?.grammar).toEqual([]);
  });

  it("refuses a missing app.json", () => {
    expect(() => loadConfig(join(tmpdir(), "rin-does-not-exist"))).toThrow(
      ConfigError,
    );
  });

  it("refuses a language without a profile file", () => {
    const configDir = writeFixture({
      app: {
        dataDir: "../data",
        languages: ["xx", "yy"],
        defaultLanguage: "xx",
        limits: { maxTextLength: 10, maxEdits: 5, maxExplanationLength: 20 },
        maxBodyBytes: 1024,
        timeouts: { headersMs: 1000, requestMs: 2000 },
      },
    });

    expect(() => loadConfig(configDir)).toThrow(ConfigError);
  });

  it("refuses a language without an error types file", () => {
    const configDir = writeFixture({ errorTypes: "" });
    rmSync(join(configDir, "../data/error-types/xx.json"));

    expect(() => loadConfig(configDir)).toThrow(ConfigError);
  });

  it("refuses a file that is not valid JSON without echoing its content", () => {
    const configDir = writeFixture({ app: "{ secret-content-123" });

    expect(() => loadConfig(configDir)).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("secret-content"),
      }),
    );
  });

  it("refuses a language code that could escape the config folders", () => {
    const configDir = writeFixture({
      app: {
        dataDir: "../data",
        languages: [".."],
        defaultLanguage: "..",
        limits: { maxTextLength: 10, maxEdits: 5, maxExplanationLength: 20 },
        maxBodyBytes: 1024,
        timeouts: { headersMs: 1000, requestMs: 2000 },
      },
    });

    expect(() => loadConfig(configDir)).toThrow(ConfigError);
  });
});
