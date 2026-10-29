import pino, { type DestinationStream, type Logger } from "pino";

export type { Logger };

const SENSITIVE_KEYS = [
  "authorization",
  "cookie",
  "password",
  "token",
  "secret",
  "apiKey",
];

// Callers log metadata only; this is the safety net for a mistake.
const REDACTED_PATHS = SENSITIVE_KEYS.flatMap((key) => [
  key,
  `*.${key}`,
  `*.*.${key}`,
]);

export function createLogger(
  destination?: DestinationStream,
  level = "info",
): Logger {
  return pino(
    { level, redact: { paths: REDACTED_PATHS, censor: "[redacted]" } },
    destination,
  );
}
