import { describe, expect, it } from "vitest";
import { parseAppConfig } from "../../src/config/app-config.js";
import { ConfigError } from "../../src/config/config-error.js";

const validConfig = {
  dataDir: "../data",
  languages: ["ja"],
  defaultLanguage: "ja",
  limits: { maxTextLength: 2000, maxEdits: 100, maxExplanationLength: 500 },
  maxBodyBytes: 65536,
  timeouts: { headersMs: 10000, requestMs: 30000 },
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

  it("trusts no proxy by default", () => {
    expect(parseAppConfig(validConfig).securityEvents.trustedProxyHops).toBe(0);
  });

  it("reads the number of trusted proxies", () => {
    const config = parseAppConfig({
      ...validConfig,
      securityEvents: { trustedProxyHops: 2 },
    });

    expect(config.securityEvents.trustedProxyHops).toBe(2);
  });

  it("holds back a bounded number of security events by default", () => {
    expect(parseAppConfig(validConfig).securityEvents.queueSize).toBe(1000);
  });

  it("recognizes browsers, scripts and declared bots by default", () => {
    const { clientKinds } = parseAppConfig(validConfig).securityEvents;

    expect([
      clientKinds.browser.length > 0,
      clientKinds.script.length > 0,
      clientKinds.declaredBot.length > 0,
    ]).toEqual([true, true, true]);
  });

  it("reads the patterns of each kind of client", () => {
    const clientKinds = { declaredBot: ["x"], script: ["y"], browser: ["z"] };

    expect(
      parseAppConfig({ ...validConfig, securityEvents: { clientKinds } })
        .securityEvents.clientKinds,
    ).toEqual(clientKinds);
  });

  it.each([[[""]], [[1]], ["curl"]])("rejects the pattern list %j", (list) => {
    expect(() =>
      parseAppConfig({
        ...validConfig,
        securityEvents: {
          clientKinds: { declaredBot: list, script: [], browser: [] },
        },
      }),
    ).toThrow(ConfigError);
  });

  it.each([0, -5, 2.5, "10"])("rejects %j as a queue size", (queueSize) => {
    expect(() =>
      parseAppConfig({ ...validConfig, securityEvents: { queueSize } }),
    ).toThrow(ConfigError);
  });

  it.each([-1, 1.5, "1"])("rejects %j trusted proxies", (hops) => {
    expect(() =>
      parseAppConfig({
        ...validConfig,
        securityEvents: { trustedProxyHops: hops },
      }),
    ).toThrow(ConfigError);
  });

  it("keeps the interactive documentation closed by default", () => {
    expect(parseAppConfig(validConfig).docs.enabled).toBe(false);
  });

  it("opens the interactive documentation when the configuration asks", () => {
    const config = parseAppConfig({ ...validConfig, docs: { enabled: true } });

    expect(config.docs.enabled).toBe(true);
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

  it("closes a connection that stays silent after 30 seconds by default", () => {
    expect(parseAppConfig(validConfig).timeouts.idleMs).toBe(30000);
  });

  it("reads the idle timeout", () => {
    const config = parseAppConfig({
      ...validConfig,
      timeouts: { headersMs: 10000, requestMs: 30000, idleMs: 5000 },
    });

    expect(config.timeouts.idleMs).toBe(5000);
  });

  it.each([0, -1, 1.5, "30"])("rejects %j as an idle timeout", (idleMs) => {
    expect(() =>
      parseAppConfig({
        ...validConfig,
        timeouts: { headersMs: 10000, requestMs: 30000, idleMs },
      }),
    ).toThrow(ConfigError);
  });

  it("rejects missing timeouts", () => {
    const { timeouts: _timeouts, ...withoutTimeouts } = validConfig;

    expect(() => parseAppConfig(withoutTimeouts)).toThrow(ConfigError);
  });

  it("rejects a non-positive timeout", () => {
    expect(() =>
      parseAppConfig({
        ...validConfig,
        timeouts: { headersMs: 0, requestMs: 30000 },
      }),
    ).toThrow(ConfigError);
  });

  it("rejects a headers timeout longer than the request timeout", () => {
    expect(() =>
      parseAppConfig({
        ...validConfig,
        timeouts: { headersMs: 40000, requestMs: 30000 },
      }),
    ).toThrow(ConfigError);
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
