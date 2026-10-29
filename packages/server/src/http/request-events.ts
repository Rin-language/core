import type { MiddlewareHandler } from "hono";
import type { Logger } from "pino";
import type { Clock } from "../ports/clock.js";
import type { IpFingerprint, RequestEvent } from "../ports/security-events.js";
import { remoteAddressOf, resolveClientIp } from "../security/client-ip.js";
import type { EventPublisher } from "../security/event-publisher.js";
import { type AppEnv, UNMATCHED_ROUTE } from "./app-env.js";
import { DOCS_ROUTES } from "./docs.js";
import { WEB_ROUTE } from "./web.js";

export interface SecurityEventsOptions {
  publisher: EventPublisher;
  /** Absent means events carry no network identity. */
  fingerprint?: (address: string) => IpFingerprint | undefined;
  trustedProxyHops: number;
}

/** Served files and docs are not API traffic; a flood of them would hide the signal. */
const STATIC_ROUTES: ReadonlySet<string> = new Set([...DOCS_ROUTES, WEB_ROUTE]);

/**
 * Emits one event per API request once its response is ready. It describes the
 * request by what the server measured and never by what it carried. A failure
 * here is logged and never reaches the client.
 */
export function requestEvents(
  options: SecurityEventsOptions & {
    clock: Clock;
    logger: Logger;
    probeRoutes: ReadonlySet<string>;
  },
): MiddlewareHandler<AppEnv> {
  const { publisher, fingerprint, trustedProxyHops, clock, logger } = options;

  return async (context, next) => {
    const startedAt = clock.now();
    await next();

    const route = context.get("route") ?? UNMATCHED_ROUTE;
    if (STATIC_ROUTES.has(route) || options.probeRoutes.has(route)) return;

    try {
      const address = resolveClientIp({
        remoteAddress: remoteAddressOf(context.env),
        forwardedFor: context.req.header("x-forwarded-for"),
        trustedProxyHops,
      });
      const ipFingerprint =
        address === undefined ? undefined : fingerprint?.(address);
      const userId = context.get("userId");
      const errorCode = context.get("errorCode");
      const responseBytes = (await context.res.clone().arrayBuffer())
        .byteLength;
      const event: RequestEvent = {
        type: "request",
        occurredAt: startedAt.toISOString(),
        requestId: context.get("requestId"),
        method: context.req.method,
        route,
        status: context.res.status,
        durationMs: clock.now().getTime() - startedAt.getTime(),
        requestBytes: context.get("requestBytes") ?? 0,
        responseBytes,
        ...(userId === undefined ? {} : { userId }),
        ...(errorCode === undefined ? {} : { errorCode }),
        ...(ipFingerprint === undefined ? {} : { ipFingerprint }),
      };
      publisher.publish(event);
    } catch (error) {
      logger.error(
        { requestId: context.get("requestId"), err: error },
        "security event could not be emitted",
      );
    }
  };
}
