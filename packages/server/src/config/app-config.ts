import { LanguageCode, LimitsResponse } from "@rin-language/contract";
import { z } from "zod";
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
  timeouts: z.strictObject({
    headersMs: z.number().int().positive(),
    requestMs: z.number().int().positive(),
  }),
  cors: z
    .strictObject({ allowedOrigins: z.array(AllowedOrigin) })
    .default({ allowedOrigins: [] }),
  docs: z.strictObject({ enabled: z.boolean() }).default({ enabled: true }),
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
