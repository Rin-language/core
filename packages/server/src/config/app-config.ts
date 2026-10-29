import { LanguageCode, LimitsResponse } from "@rin-language/contract";
import { z } from "zod";
import { DEFAULT_CLIENT_KIND_PATTERNS } from "../security/client-kind.js";
import { parseConfig } from "./config-error.js";

const isExactHttpOrigin = (value: string): boolean => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  const isHttp = url.protocol === "http:" || url.protocol === "https:";
  // Comparing with the normalized origin refuses paths, trailing slashes,
  // uppercase hosts and explicit default ports, which would never match a
  // browser's Origin header.
  // The URL parser accepts "*" in a host, so a wildcard subdomain needs its own check.
  return isHttp && url.origin === value && !value.includes("*");
};

const AllowedOrigin = z
  .string()
  .refine(
    isExactHttpOrigin,
    "must be an exact http(s) origin such as https://app.example.com: no wildcard, null, path or trailing slash",
  );

// Fresh arrays: a parsed config must never share state with the defaults.
const defaultClientKinds = () => ({
  declaredBot: [...DEFAULT_CLIENT_KIND_PATTERNS.declaredBot],
  script: [...DEFAULT_CLIENT_KIND_PATTERNS.script],
  browser: [...DEFAULT_CLIENT_KIND_PATTERNS.browser],
});

const hasNoDuplicate = (values: readonly string[]) =>
  new Set(values).size === values.length;

const AppConfigShape = z.strictObject({
  dataDir: z.string().min(1),
  languages: z
    .array(LanguageCode)
    .min(1)
    .refine(hasNoDuplicate, "languages must be unique"),
  defaultLanguage: LanguageCode,
  limits: LimitsResponse,
  maxBodyBytes: z.number().int().positive(),
  // Slow-request protection: a client has this long to send its headers and its whole request.
  timeouts: z
    .strictObject({
      headersMs: z.number().int().positive(),
      requestMs: z.number().int().positive(),
      // A connection that moves no byte for this long is closed, which frees
      // what a client that never reads its answer would otherwise hold. It must
      // exceed the time the slowest route takes to start answering.
      idleMs: z.number().int().positive().default(30000),
    })
    // Node refuses a headers timeout longer than the whole-request timeout.
    .refine((timeouts) => timeouts.headersMs <= timeouts.requestMs, {
      message: "headersMs must not exceed requestMs",
    }),
  cors: z
    .strictObject({ allowedOrigins: z.array(AllowedOrigin) })
    .default({ allowedOrigins: [] }),
  // Closed by default: the viewer is a large third-party bundle. See docs/interactive-docs.md.
  docs: z.strictObject({ enabled: z.boolean() }).default({ enabled: false }),
  securityEvents: z
    .strictObject({
      // Proxies we run or trust in front of the server, such as a CDN and a PaaS
      // router. 0 means the connection address is the caller and X-Forwarded-For
      // is ignored, which is the only safe value without a proxy.
      trustedProxyHops: z.number().int().nonnegative().default(0),
      // Events held back while the receiver is slow; past this they are dropped
      // and reported, so memory stays bounded.
      queueSize: z.number().int().positive().default(1000),
      // Fragments of the User-Agent that tell what kind of client it is. Only
      // the kind is ever kept, never the User-Agent.
      clientKinds: z
        .strictObject({
          declaredBot: z.array(z.string().min(1)),
          script: z.array(z.string().min(1)),
          browser: z.array(z.string().min(1)),
        })
        .default(defaultClientKinds),
    })
    .default(() => ({
      trustedProxyHops: 0,
      queueSize: 1000,
      clientKinds: defaultClientKinds(),
    })),
});

export const AppConfig = AppConfigShape.refine(
  (config) => config.languages.includes(config.defaultLanguage),
  {
    message: "defaultLanguage must be one of languages",
    path: ["defaultLanguage"],
  },
);
export type AppConfig = z.output<typeof AppConfig>;

export const parseAppConfig = (raw: unknown, source = "app.json"): AppConfig =>
  parseConfig(AppConfig, raw, source);
