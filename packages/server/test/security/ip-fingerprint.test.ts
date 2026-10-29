import { describe, expect, it } from "vitest";
import { createIpFingerprinter } from "../../src/security/ip-fingerprint.js";

const KEY = "k".repeat(32);
const fingerprinter = (key = KEY, keyId = "2026-10") =>
  createIpFingerprinter({ key, keyId });

describe("ip fingerprint", () => {
  it("is stable for the same address and key", () => {
    const fingerprint = fingerprinter();

    expect(fingerprint("203.0.113.7")).toEqual(fingerprint("203.0.113.7"));
  });

  it("differs between two addresses", () => {
    const fingerprint = fingerprinter();

    expect(fingerprint("203.0.113.7")?.value).not.toBe(
      fingerprint("203.0.113.8")?.value,
    );
  });

  it("differs between two keys, so a rotation cuts the link", () => {
    expect(fingerprinter("a".repeat(32))("203.0.113.7")?.value).not.toBe(
      fingerprinter("b".repeat(32))("203.0.113.7")?.value,
    );
  });

  it("names the key it was made with", () => {
    expect(fingerprinter(KEY, "2026-11")("203.0.113.7")?.keyId).toBe("2026-11");
  });

  it("never contains the address", () => {
    const fingerprint = fingerprinter()("203.0.113.7");

    expect(JSON.stringify(fingerprint)).not.toMatch(/203|113/);
  });

  it("is a short lowercase hexadecimal value", () => {
    expect(fingerprinter()("203.0.113.7")?.value).toMatch(/^[0-9a-f]{32}$/);
  });

  it("treats an IPv4-mapped IPv6 address as the IPv4 address", () => {
    const fingerprint = fingerprinter();

    expect(fingerprint("::ffff:203.0.113.7")).toEqual(
      fingerprint("203.0.113.7"),
    );
  });

  it("groups IPv6 addresses of the same /64, which one household rotates through", () => {
    const fingerprint = fingerprinter();

    expect(fingerprint("2001:db8:aaaa:bbbb:1:2:3:4")).toEqual(
      fingerprint("2001:db8:aaaa:bbbb:ffff::1"),
    );
  });

  it("tells two IPv6 /64 networks apart", () => {
    const fingerprint = fingerprinter();

    expect(fingerprint("2001:db8:aaaa:bbbb::1")?.value).not.toBe(
      fingerprint("2001:db8:aaaa:cccc::1")?.value,
    );
  });

  it("reads a compressed IPv6 address like its expanded form", () => {
    const fingerprint = fingerprinter();

    expect(fingerprint("2001:db8::1")).toEqual(
      fingerprint("2001:0db8:0000:0000:0000:0000:0000:0001"),
    );
  });

  it.each(["", "not-an-ip", "999.1.1.1", "1.2.3", "::g"])(
    "makes no fingerprint for %j",
    (value) => {
      expect(fingerprinter()(value)).toBeUndefined();
    },
  );

  it("refuses a key that is too short", () => {
    expect(() => createIpFingerprinter({ key: "short", keyId: "a" })).toThrow(
      /key/i,
    );
  });

  it("does not repeat the key when it refuses it", () => {
    expect(() =>
      createIpFingerprinter({ key: "short-secret", keyId: "a" }),
    ).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("short-secret"),
      }),
    );
  });
});
