import { describe, expect, it } from "vitest";
import {
  remoteAddressOf,
  resolveClientIp,
} from "../../src/security/client-ip.js";

const PROXY = "10.0.0.5";
const CLIENT = "203.0.113.7";

describe("resolveClientIp without a trusted proxy", () => {
  it("uses the address of the connection", () => {
    expect(
      resolveClientIp({ remoteAddress: CLIENT, trustedProxyHops: 0 }),
    ).toBe(CLIENT);
  });

  it("ignores X-Forwarded-For, which the client can write", () => {
    expect(
      resolveClientIp({
        remoteAddress: CLIENT,
        forwardedFor: "6.6.6.6",
        trustedProxyHops: 0,
      }),
    ).toBe(CLIENT);
  });

  it("has no address when the connection has none", () => {
    expect(resolveClientIp({ trustedProxyHops: 0 })).toBeUndefined();
  });
});

describe("resolveClientIp behind trusted proxies", () => {
  it("takes the address the one proxy saw", () => {
    expect(
      resolveClientIp({
        remoteAddress: PROXY,
        forwardedFor: CLIENT,
        trustedProxyHops: 1,
      }),
    ).toBe(CLIENT);
  });

  it("ignores what the client wrote to the left of the proxy's entry", () => {
    expect(
      resolveClientIp({
        remoteAddress: PROXY,
        forwardedFor: `6.6.6.6, 7.7.7.7, ${CLIENT}`,
        trustedProxyHops: 1,
      }),
    ).toBe(CLIENT);
  });

  it("counts two proxies from the right", () => {
    expect(
      resolveClientIp({
        remoteAddress: PROXY,
        forwardedFor: `6.6.6.6, ${CLIENT}, 172.16.0.9`,
        trustedProxyHops: 2,
      }),
    ).toBe(CLIENT);
  });

  it("copes with spaces around the entries", () => {
    expect(
      resolveClientIp({
        remoteAddress: PROXY,
        forwardedFor: `  ${CLIENT}  `,
        trustedProxyHops: 1,
      }),
    ).toBe(CLIENT);
  });

  it("falls back to the connection when the request skipped a proxy", () => {
    expect(
      resolveClientIp({ remoteAddress: CLIENT, trustedProxyHops: 1 }),
    ).toBe(CLIENT);
  });

  it("falls back to the connection when the chain is shorter than the proxies", () => {
    expect(
      resolveClientIp({
        remoteAddress: PROXY,
        forwardedFor: CLIENT,
        trustedProxyHops: 2,
      }),
    ).toBe(PROXY);
  });

  it.each(["not-an-ip", "", "203.0.113.7:8080", "203.0.113.7, "])(
    "falls back to the connection for an unreadable entry %j",
    (entry) => {
      expect(
        resolveClientIp({
          remoteAddress: PROXY,
          forwardedFor: entry,
          trustedProxyHops: 1,
        }),
      ).toBe(PROXY);
    },
  );

  it("reads an IPv6 client", () => {
    expect(
      resolveClientIp({
        remoteAddress: PROXY,
        forwardedFor: "2001:db8::1",
        trustedProxyHops: 1,
      }),
    ).toBe("2001:db8::1");
  });

  it("has no address when the connection has none", () => {
    expect(
      resolveClientIp({ forwardedFor: CLIENT, trustedProxyHops: 1 }),
    ).toBeUndefined();
  });
});

describe("remoteAddressOf", () => {
  it("reads the address of the Node connection", () => {
    const env = { incoming: { socket: { remoteAddress: CLIENT } } };

    expect(remoteAddressOf(env)).toBe(CLIENT);
  });

  it("reads it through the server binding too", () => {
    const env = { server: { incoming: { socket: { remoteAddress: CLIENT } } } };

    expect(remoteAddressOf(env)).toBe(CLIENT);
  });

  it.each([
    undefined,
    null,
    {},
    { incoming: {} },
    { incoming: { socket: {} } },
    "text",
    42,
  ])("has no address in %j", (env) => {
    expect(remoteAddressOf(env)).toBeUndefined();
  });

  it("ignores an address that is not text", () => {
    const env = { incoming: { socket: { remoteAddress: 42 } } };

    expect(remoteAddressOf(env)).toBeUndefined();
  });
});
