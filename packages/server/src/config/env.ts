import { z } from "zod";
import { parseConfig } from "./config-error.js";

const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

const EnvSchema = z
  .object({
    RIN_CONFIG_DIR: z.string().min(1).default("config"),
    // Loopback by default: exposing the server on the network is an explicit choice.
    RIN_HOST: z.string().min(1).default("127.0.0.1"),
    RIN_PORT: z
      .string()
      .regex(/^\d{1,5}$/, "must be a port number")
      .default("3000")
      .transform(Number)
      .pipe(z.number().max(65535)),
    RIN_DATABASE_PATH: z.string().min(1).default("rin.sqlite"),
    RIN_LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  })
  .transform((env) => ({
    configDir: env.RIN_CONFIG_DIR,
    host: env.RIN_HOST,
    port: env.RIN_PORT,
    databasePath: env.RIN_DATABASE_PATH,
    logLevel: env.RIN_LOG_LEVEL,
  }));

export type Env = z.output<typeof EnvSchema>;

/** What depends on the deployment. Tunable settings live in config/app.json. */
export const parseEnv = (environment: NodeJS.ProcessEnv): Env =>
  parseConfig(EnvSchema, environment, "environment variables");
