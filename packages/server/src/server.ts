import { createServer, Server } from "node:http";
import { serve } from "@hono/node-server";
import type { DestinationStream } from "pino";
import type { Env } from "./config/env.js";
import { loadConfig } from "./config/load-config.js";
import { createApp } from "./http/create-app.js";
import { NoIdentity } from "./identity/no-identity.js";
import { createLogger } from "./observability/logger.js";
import { buildCoreRoutes } from "./routes/core-routes.js";
import { createSqliteStorage } from "./storage/sqlite/sqlite-storage.js";
import { systemClock } from "./system-clock.js";

export interface RunningServer {
  readonly host: string;
  readonly port: number;
  readonly http: Server;
  close(): Promise<void>;
}

export interface StartOptions {
  logDestination?: DestinationStream;
}

export async function startServer(
  env: Env,
  options: StartOptions = {},
): Promise<RunningServer> {
  const config = loadConfig(env.configDir);
  const logger = createLogger(options.logDestination, env.logLevel);
  const storage = createSqliteStorage({
    path: env.databasePath,
    clock: systemClock,
  });

  const app = createApp({
    routes: buildCoreRoutes(config),
    identity: new NoIdentity(),
    clock: systemClock,
    logger,
    maxBodyBytes: config.app.maxBodyBytes,
    allowedOrigins: config.app.cors.allowedOrigins,
  });

  let http: Server;
  try {
    http = await new Promise<Server>((resolve, reject) => {
      const server = serve(
        { fetch: app.fetch, hostname: env.host, port: env.port, createServer },
        () => {
          // serve() is typed for HTTP/2 too, but createServer above makes it plain HTTP.
          if (server instanceof Server) resolve(server);
          else reject(new Error("Expected a plain HTTP server"));
        },
      );
      server.once("error", reject);
    });
  } catch (error) {
    await storage.close();
    throw error;
  }
  http.headersTimeout = config.app.timeouts.headersMs;
  http.requestTimeout = config.app.timeouts.requestMs;

  const address = http.address();
  if (address === null || typeof address === "string") {
    throw new Error("The server did not report a TCP address");
  }
  logger.info({ host: address.address, port: address.port }, "server started");

  const shutDown = async () => {
    http.closeIdleConnections();
    await new Promise<void>((resolve, reject) =>
      http.close((error) => (error ? reject(error) : resolve())),
    );
    await storage.close();
  };
  let closing: Promise<void> | undefined;

  return {
    host: address.address,
    port: address.port,
    http,
    // A second shutdown signal must not fail or close the database twice.
    close: () => {
      closing ??= shutDown();
      return closing;
    },
  };
}
