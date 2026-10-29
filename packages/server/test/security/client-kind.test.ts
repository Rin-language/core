import { describe, expect, it } from "vitest";
import {
  classifyClient,
  DEFAULT_CLIENT_KIND_PATTERNS,
} from "../../src/security/client-kind.js";

const classify = (userAgent: string | undefined) =>
  classifyClient(userAgent, DEFAULT_CLIENT_KIND_PATTERNS);

const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const FIREFOX =
  "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const GOOGLEBOT =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const HEADLESS =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36";

describe("classifyClient", () => {
  it.each([undefined, "", "   "])("says none for %j", (userAgent) => {
    expect(classify(userAgent)).toBe("none");
  });

  it.each([
    ["Chrome", CHROME],
    ["Firefox", FIREFOX],
    ["Safari on iOS", SAFARI_IOS],
  ])("recognizes a browser: %s", (_name, userAgent) => {
    expect(classify(userAgent)).toBe("browser");
  });

  it("recognizes a crawler that announces itself, though it says Mozilla", () => {
    expect(classify(GOOGLEBOT)).toBe("declared_bot");
  });

  it.each([
    "curl/8.4.0",
    "python-requests/2.31.0",
    "Go-http-client/1.1",
    "node",
    "Wget/1.21",
    "PostmanRuntime/7.36.0",
    "okhttp/4.12.0",
  ])("recognizes a script: %s", (userAgent) => {
    expect(classify(userAgent)).toBe("script");
  });

  it("does not take a headless browser for a person's browser", () => {
    expect(classify(HEADLESS)).toBe("script");
  });

  it("treats a client it does not recognize as a script", () => {
    expect(classify("MyApp/1.0")).toBe("script");
  });

  it("ignores the case", () => {
    expect(classify("CURL/8.4.0")).toBe("script");
  });

  it("only reads the beginning of a very long value", () => {
    expect(classify(`${"x".repeat(600)}Mozilla/5.0`)).toBe("script");
  });

  it("copes with an enormous value", () => {
    expect(classify("a".repeat(1_000_000))).toBe("script");
  });

  it("uses the patterns it is given", () => {
    const patterns = { declaredBot: ["mybot"], script: [], browser: ["acme"] };

    expect([
      classifyClient("ACME Browser", patterns),
      classifyClient("MyBot/1", patterns),
      classifyClient(CHROME, patterns),
    ]).toEqual(["browser", "declared_bot", "script"]);
  });

  it("only ever answers with one of four values", () => {
    const answers = new Set(
      [undefined, CHROME, GOOGLEBOT, "curl/1", "anything-secret"].map(classify),
    );

    expect([...answers].sort()).toEqual(
      ["browser", "declared_bot", "none", "script"].sort(),
    );
  });
});
