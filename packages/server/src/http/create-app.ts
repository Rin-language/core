import type { Context } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import type { Logger } from "pino";
import type { Clock } from "../ports/clock.js";
import type { Identity } from "../ports/identity.js";
import { ApiProblem, STATUS_BY_CODE } from "./api-problem.js";
import type { Route } from "./route.js";

export interface AppOptions {
  routes: readonly Route[];
  identity: Identity;
  clock: Clock;
  logger: Logger;
  maxBodyBytes: number;
}

interface AppEnv {
  Variables: { requestId: string; route: string };
}

const UNMATCHED_ROUTE = "unmatched";
const JSON_CONTENT_TYPE = /^application\/json\s*(?:;|$)/i;
const BEARER_CHALLENGE = { "WWW-Authenticate": "Bearer" };

function assertNoDuplicates(routes: readonly Route[]): void {
  const endpoints = new Set<string>();
  const operationIds = new Set<string>();
  for (const route of routes) {
    const endpoint = `${route.method} ${route.path}`;
    if (endpoints.has(endpoint)) {
      throw new Error(`Route ${endpoint} is registered twice`);
    }
    if (operationIds.has(route.operationId)) {
      throw new Error(`The operationId ${route.operationId} is used twice`);
    }
    endpoints.add(endpoint);
    operationIds.add(route.operationId);
  }
}

function problemResponse(
  context: Context<AppEnv>,
  problem: ApiProblem,
): Response {
  return context.json(
    problem.toApiError(),
    STATUS_BY_CODE[problem.code],
    problem.headers,
  );
}

async function readJsonBody(context: Context<AppEnv>): Promise<unknown> {
  const contentType = context.req.header("content-type") ?? "";
  if (!JSON_CONTENT_TYPE.test(contentType)) {
    throw new ApiProblem("invalid_request", "The request body must be JSON.");
  }
  try {
    return await context.req.json();
  } catch (error) {
    // The parser's message can quote the input, so it only travels as the cause.
    throw new ApiProblem(
      "invalid_request",
      "The request body is not valid JSON.",
      undefined,
      {},
      { cause: error },
    );
  }
}

export function createApp(options: AppOptions): Hono<AppEnv> {
  const { routes, identity, clock, logger, maxBodyBytes } = options;
  assertNoDuplicates(routes);
  const app = new Hono<AppEnv>();

  app.use(async (context, next) => {
    const requestId = crypto.randomUUID();
    context.set("requestId", requestId);
    context.header("X-Request-Id", requestId);
    const startedAt = clock.now().getTime();
    await next();
    // Metadata only: never the raw path, query string, headers or body.
    logger.info(
      {
        requestId,
        method: context.req.method,
        route: context.get("route") ?? UNMATCHED_ROUTE,
        status: context.res.status,
        durationMs: clock.now().getTime() - startedAt,
      },
      "request",
    );
  });

  app.use(
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
      referrerPolicy: "no-referrer",
      // TLS and HSTS belong to the reverse proxy that terminates it.
      strictTransportSecurity: false,
    }),
  );
  app.use(async (context, next) => {
    context.header("Cache-Control", "no-store");
    await next();
  });

  app.use(
    bodyLimit({
      maxSize: maxBodyBytes,
      onError: (context) =>
        problemResponse(
          context,
          new ApiProblem(
            "payload_too_large",
            "The request body is too large.",
            {
              limit: maxBodyBytes,
            },
          ),
        ),
    }),
  );

  for (const route of routes) {
    app.on(route.method.toUpperCase(), route.path, async (context) => {
      context.set("route", route.path);
      const user =
        route.auth === "user"
          ? await identity.authenticate(context.req.raw)
          : null;
      if (route.auth === "user" && user === null) {
        throw new ApiProblem(
          "unauthorized",
          "Authentication is required.",
          undefined,
          BEARER_CHALLENGE,
        );
      }
      const rawBody =
        route.requestSchemaName === undefined
          ? undefined
          : await readJsonBody(context);
      return context.json(
        await route.run({ user: user ?? undefined, rawBody }),
      );
    });
  }

  app.notFound((context) =>
    problemResponse(
      context,
      new ApiProblem("not_found", "This route does not exist."),
    ),
  );

  app.onError((error, context) => {
    if (error instanceof ApiProblem) return problemResponse(context, error);
    logger.error(
      { requestId: context.get("requestId"), err: error },
      "unhandled error",
    );
    return problemResponse(
      context,
      new ApiProblem("internal_error", "Something went wrong on the server."),
    );
  });

  return app;
}
