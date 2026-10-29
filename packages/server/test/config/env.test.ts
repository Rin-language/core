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
      RIN_CONFIG_DIR: "/etc/rin",
      RIN_HOST: "0.0.0.0",
      RIN_PORT: "8080",
      RIN_DATABASE_PATH: "/var/lib/rin/rin.sqlite",
      RIN_LOG_LEVEL: "warn",
    });

    expect(env).toEqual({
      configDir: "/etc/rin",
      host: "0.0.0.0",
      port: 8080,
      databasePath: "/var/lib/rin/rin.sqlite",
      logLevel: "warn",
    });
  });

  it("ignores variables that are not its own", () => {
    expect(() => parseEnv({ PATH: "/usr/bin", HOME: "/root" })).not.toThrow();
  });

  it.each(["abc", "-1", "70000", "80.5", ""])("rejects the port %j", (port) => {
    expect(() => parseEnv({ RIN_PORT: port })).toThrow(ConfigError);
  });

  it("rejects an unknown log level", () => {
    expect(() => parseEnv({ RIN_LOG_LEVEL: "verbose" })).toThrow(ConfigError);
  });

  it("does not repeat the rejected value in the error", () => {
    expect(() => parseEnv({ RIN_PORT: "secret-port-value" })).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("secret-port-value"),
      }),
    );
  });
});
