import { describe, expect, it } from "vitest";
import { parseAppConfig } from "../../src/config/app-config.js";
import { ConfigError } from "../../src/config/config-error.js";

const validConfig = {
  dataDir: "../data",
  languages: ["ja"],
  defaultLanguage: "ja",
  limits: { maxTextLength: 2000, maxEdits: 100, maxExplanationLength: 500 },
  maxBodyBytes: 65536,
};

const withOrigins = (allowedOrigins: string[]) => ({
  ...validConfig,
  cors: { allowedOrigins },
});

describe("parseAppConfig", () => {
  it("accepts a minimal config", () => {
    expect(parseAppConfig(validConfig)).toMatchObject({
      languages: ["ja"],
      defaultLanguage: "ja",
    });
  });

  it("allows no cross-origin caller by default", () => {
    expect(parseAppConfig(validConfig).cors.allowedOrigins).toEqual([]);
  });

  it("enables the interactive documentation by default", () => {
    expect(parseAppConfig(validConfig).docs.enabled).toBe(true);
  });

  it("accepts exact http and https origins", () => {
    const config = parseAppConfig(
      withOrigins(["https://app.example.com", "http://localhost:5173"]),
    );

    expect(config.cors.allowedOrigins).toEqual([
      "https://app.example.com",
      "http://localhost:5173",
    ]);
  });

  it.each([
    ["a wildcard", "*"],
    ["the null origin", "null"],
    ["a trailing slash", "https://app.example.com/"],
    ["a path", "https://app.example.com/app"],
    ["a wildcard subdomain", "https://*.example.com"],
    ["an uppercase host", "https://App.example.com"],
    ["an explicit default port", "https://app.example.com:443"],
    ["a non-http scheme", "ftp://app.example.com"],
    ["a blank string", " "],
  ])("rejects an allowed origin with %s", (_label, origin) => {
    expect(() => parseAppConfig(withOrigins([origin]))).toThrow(ConfigError);
  });

  it("rejects an unknown key", () => {
    expect(() => parseAppConfig({ ...validConfig, debug: true })).toThrow(
      ConfigError,
    );
  });

  it("rejects missing limits", () => {
    const { limits: _limits, ...withoutLimits } = validConfig;

    expect(() => parseAppConfig(withoutLimits)).toThrow(ConfigError);
  });

  it("rejects a non-positive body size limit", () => {
    expect(() => parseAppConfig({ ...validConfig, maxBodyBytes: 0 })).toThrow(
      ConfigError,
    );
  });

  it("rejects an empty language list", () => {
    expect(() => parseAppConfig({ ...validConfig, languages: [] })).toThrow(
      ConfigError,
    );
  });

  it("rejects duplicate languages", () => {
    expect(() =>
      parseAppConfig({ ...validConfig, languages: ["ja", "ja"] }),
    ).toThrow(ConfigError);
  });

  it("rejects a malformed language code", () => {
    expect(() =>
      parseAppConfig({ ...validConfig, languages: ["ja-JP"] }),
    ).toThrow(ConfigError);
  });

  it("rejects a default language that is not enabled", () => {
    expect(() =>
      parseAppConfig({ ...validConfig, defaultLanguage: "fr" }),
    ).toThrow(ConfigError);
  });

  it("does not repeat the rejected value in the error message", () => {
    const rejected = "https://secret-host.example/path-token-123";

    expect(() => parseAppConfig(withOrigins([rejected]))).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("secret-host"),
      }),
    );
  });
});
