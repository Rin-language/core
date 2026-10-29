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
    APP_CONFIG_DIR: z.string().min(1).default("config"),
    // Loopback by default: exposing the server on the network is an explicit choice.
    APP_HOST: z.string().min(1).default("127.0.0.1"),
    APP_PORT: z
      .string()
      .regex(/^\d{1,5}$/, "must be a port number")
      .default("3000")
      .transform(Number)
      .pipe(z.number().max(65535)),
    APP_DATABASE_PATH: z.string().min(1).default("rin.sqlite"),
    APP_LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
    // The built web client. Absent means the server only exposes the API.
    APP_WEB_DIR: z.string().min(1).optional(),
  })
  .transform((env) => ({
    configDir: env.APP_CONFIG_DIR,
    host: env.APP_HOST,
    port: env.APP_PORT,
    databasePath: env.APP_DATABASE_PATH,
    logLevel: env.APP_LOG_LEVEL,
    webDir: env.APP_WEB_DIR,
  }));

export type Env = z.output<typeof EnvSchema>;

/** What depends on the deployment. Tunable settings live in config/app.json. */
export const parseEnv = (environment: NodeJS.ProcessEnv): Env =>
  parseConfig(EnvSchema, environment, "environment variables");
