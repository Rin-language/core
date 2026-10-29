import type { ClientKind } from "../ports/security-events.js";

/** Lists of lowercase fragments; a User-Agent that contains one belongs to that kind. */
export interface ClientKindPatterns {
  declaredBot: readonly string[];
  script: readonly string[];
  browser: readonly string[];
}

// A real User-Agent is a few hundred characters. Reading no more bounds the
// work an attacker can make us do with a huge header.
const MAX_USER_AGENT_LENGTH = 512;

export const DEFAULT_CLIENT_KIND_PATTERNS: ClientKindPatterns = {
  declaredBot: ["bot", "crawler", "spider", "slurp"],
  script: [
    "curl/",
    "wget/",
    "python",
    "httpx",
    "aiohttp",
    "scrapy",
    "axios",
    "node-fetch",
    "undici",
    "go-http-client",
    "java/",
    "okhttp",
    "libwww",
    "restsharp",
    "postmanruntime",
    "insomnia",
    "headlesschrome",
    "phantomjs",
  ],
  browser: ["mozilla/", "opera/"],
};

const includesAny = (text: string, fragments: readonly string[]): boolean =>
  fragments.some((fragment) => text.includes(fragment.toLowerCase()));

/**
 * Reduces a User-Agent to one of four coarse kinds, so the event carries the
 * signal ("a script, not a browser") without the string, which singles out a
 * person when combined with an address. The order matters: crawlers and
 * headless browsers also say "Mozilla/".
 */
export function classifyClient(
  userAgent: string | undefined,
  patterns: ClientKindPatterns,
): ClientKind {
  const text = userAgent?.slice(0, MAX_USER_AGENT_LENGTH).trim().toLowerCase();
  if (text === undefined || text === "") return "none";
  if (includesAny(text, patterns.declaredBot)) return "declared_bot";
  if (includesAny(text, patterns.script)) return "script";
  if (includesAny(text, patterns.browser)) return "browser";
  // Anything that does not look like a browser is a program.
  return "script";
}
