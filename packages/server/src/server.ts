import { createServer, Server } from "node:http";
import { serve } from "@hono/node-server";
import type { DestinationStream, Logger } from "pino";
import type { Env } from "./config/env.js";
import { loadConfig } from "./config/load-config.js";
import { createApp } from "./http/create-app.js";
import { loadDocsAssets } from "./http/docs-assets.js";
import type { SecurityEventsOptions } from "./http/request-events.js";
import { loadWebAssets } from "./http/web-assets.js";
import { NoIdentity } from "./identity/no-identity.js";
import { createLogger } from "./observability/logger.js";
import type { SecurityEventSink } from "./ports/security-events.js";
import { buildCoreRoutes } from "./routes/core-routes.js";
import type { ClientKindPatterns } from "./security/client-kind.js";
import { createEventPublisher } from "./security/event-publisher.js";
import { createIpFingerprinter } from "./security/ip-fingerprint.js";
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
  /**
   * Where the security events go. Without one nothing is measured or queued:
   * a self-hosted server pays nothing for a feature it does not use.
   */
  securityEventSink?: SecurityEventSink;
}

function buildSecurityEvents(
  env: Env,
  settings: {
    trustedProxyHops: number;
    queueSize: number;
    clientKinds: ClientKindPatterns;
  },
  sink: SecurityEventSink | undefined,
  logger: Logger,
): SecurityEventsOptions | undefined {
  if (sink === undefined) {
    if (env.ipFingerprint !== undefined) {
      logger.warn(
        "APP_IP_FINGERPRINT_KEY is set but no security event receiver is configured: no event is emitted",
      );
    }
    return undefined;
  }
  return {
    publisher: createEventPublisher({
      sink,
      queueSize: settings.queueSize,
      clock: systemClock,
      logger,
    }),
    trustedProxyHops: settings.trustedProxyHops,
    clientKinds: settings.clientKinds,
    ...(env.ipFingerprint === undefined
      ? {}
      : { fingerprint: createIpFingerprinter(env.ipFingerprint) }),
  };
}

export async function startServer(
  env: Env,
  options: StartOptions = {},
): Promise<RunningServer> {
  const config = loadConfig(env.configDir);
  const logger = createLogger(options.logDestination, env.logLevel);
  // Read before the database is opened, so a broken folder leaves nothing to close.
  const docs = config.app.docs.enabled ? loadDocsAssets() : undefined;
  const web = env.webDir === undefined ? undefined : loadWebAssets(env.webDir);
  const securityEvents = buildSecurityEvents(
    env,
    config.app.securityEvents,
    options.securityEventSink,
    logger,
  );
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
    ...(docs === undefined ? {} : { docs }),
    ...(web === undefined ? {} : { web }),
    ...(securityEvents === undefined ? {} : { securityEvents }),
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
    await securityEvents?.publisher.close();
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
    // After the last request, so its event is not lost.
    await securityEvents?.publisher.close();
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
