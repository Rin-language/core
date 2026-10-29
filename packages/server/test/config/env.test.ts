import { describe, expect, it } from "vitest";
import { ConfigError } from "../../src/config/config-error.js";
import { parseEnv } from "../../src/config/env.js";

describe("parseEnv", () => {
  it("listens on the loopback interface by default", () => {
    expect(parseEnv({}).host).toBe("127.0.0.1");
  });

  it("has defaults for everything", () => {
    expect(parseEnv({})).toEqual({
      configDir: "config",
      host: "127.0.0.1",
      port: 3000,
      databasePath: "rin.sqlite",
      logLevel: "info",
    });
  });

  it("reads the values it is given", () => {
    const env = parseEnv({
      APP_CONFIG_DIR: "/etc/rin",
      APP_HOST: "0.0.0.0",
      APP_PORT: "8080",
      APP_DATABASE_PATH: "/var/lib/rin/rin.sqlite",
      APP_LOG_LEVEL: "warn",
    });

    expect(env).toEqual({
      configDir: "/etc/rin",
      host: "0.0.0.0",
      port: 8080,
      databasePath: "/var/lib/rin/rin.sqlite",
      logLevel: "warn",
    });
  });

  it("serves no web client unless a folder is given", () => {
    expect([
      parseEnv({}).webDir,
      parseEnv({ APP_WEB_DIR: "/srv/web" }).webDir,
    ]).toEqual([undefined, "/srv/web"]);
  });

  it("computes no IP fingerprint unless a key is given", () => {
    expect(parseEnv({}).ipFingerprint).toBeUndefined();
  });

  it("reads the IP fingerprint key and its identifier", () => {
    const env = parseEnv({
      APP_IP_FINGERPRINT_KEY: "k".repeat(32),
      APP_IP_FINGERPRINT_KEY_ID: "2026-10",
    });

    expect(env.ipFingerprint).toEqual({
      key: "k".repeat(32),
      keyId: "2026-10",
    });
  });

  it("refuses a fingerprint key without an identifier", () => {
    expect(() => parseEnv({ APP_IP_FINGERPRINT_KEY: "k".repeat(32) })).toThrow(
      ConfigError,
    );
  });

  it("refuses a fingerprint identifier without a key", () => {
    expect(() => parseEnv({ APP_IP_FINGERPRINT_KEY_ID: "2026-10" })).toThrow(
      ConfigError,
    );
  });

  it("refuses a fingerprint key shorter than 32 characters", () => {
    expect(() =>
      parseEnv({
        APP_IP_FINGERPRINT_KEY: "short",
        APP_IP_FINGERPRINT_KEY_ID: "2026-10",
      }),
    ).toThrow(ConfigError);
  });

  it("refuses an identifier that is not a plain label", () => {
    expect(() =>
      parseEnv({
        APP_IP_FINGERPRINT_KEY: "k".repeat(32),
        APP_IP_FINGERPRINT_KEY_ID: "has space",
      }),
    ).toThrow(ConfigError);
  });

  it("never repeats the fingerprint key in an error", () => {
    const key = "super-secret-key-".padEnd(40, "x");

    expect(() => parseEnv({ APP_IP_FINGERPRINT_KEY: key })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(key) }),
    );
  });

  it("ignores variables that are not its own", () => {
    expect(() => parseEnv({ PATH: "/usr/bin", HOME: "/root" })).not.toThrow();
  });

  it.each(["abc", "-1", "70000", "80.5", ""])("rejects the port %j", (port) => {
    expect(() => parseEnv({ APP_PORT: port })).toThrow(ConfigError);
  });

  it("rejects an unknown log level", () => {
    expect(() => parseEnv({ APP_LOG_LEVEL: "verbose" })).toThrow(ConfigError);
  });

  it("does not repeat the rejected value in the error", () => {
    expect(() => parseEnv({ APP_PORT: "secret-port-value" })).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("secret-port-value"),
      }),
    );
  });
});
