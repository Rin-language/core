import type { Context } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import type { Logger } from "pino";
import { buildOpenApiDocument } from "../openapi/build-openapi-document.js";
import { OPENAPI_ROUTE } from "../openapi/openapi-route.js";
import type { Clock } from "../ports/clock.js";
import type { Identity } from "../ports/identity.js";
import { ApiProblem, STATUS_BY_CODE } from "./api-problem.js";
import { type AppEnv, UNMATCHED_ROUTE } from "./app-env.js";
import { cors } from "./cors.js";
import {
  type DocsAssets,
  docsSecurityHeaders,
  isDocsPath,
  mountDocs,
} from "./docs.js";
import { requestEvents, type SecurityEventsOptions } from "./request-events.js";
import type { Route } from "./route.js";
import { mountWeb, type WebAssets, webSecurityHeaders } from "./web.js";

export interface AppOptions {
  routes: readonly Route[];
  identity: Identity;
  clock: Clock;
  logger: Logger;
  maxBodyBytes: number;
  /** Closed by default: no origin may read the API from a browser. */
  allowedOrigins?: readonly string[];
  /** Absent means the interactive documentation is not served. */
  docs?: DocsAssets;
  /** Absent means the web client is not served. */
  web?: WebAssets;
  /** Absent means nothing is measured or emitted. */
  securityEvents?: SecurityEventsOptions;
}

const JSON_CONTENT_TYPE = /^application\/json\s*(?:;|$)/i;
const BEARER_CHALLENGE = { "WWW-Authenticate": "Bearer" };

function assertNoDuplicates(routes: readonly Route[]): void {
  const endpoints = new Set<string>([
    `${OPENAPI_ROUTE.method} ${OPENAPI_ROUTE.path}`,
  ]);
  const operationIds = new Set<string>([OPENAPI_ROUTE.operationId]);
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
  context.set("errorCode", problem.code);
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
  const raw = await context.req.arrayBuffer();
  context.set("requestBytes", raw.byteLength);
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
  const allowedOrigins = options.allowedOrigins ?? [];
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

  if (options.securityEvents !== undefined) {
    app.use(
      requestEvents({
        ...options.securityEvents,
        clock,
        logger,
        probeRoutes: new Set(
          routes.filter((route) => route.isProbe).map((route) => route.path),
        ),
      }),
    );
  }

  const apiSecurityHeaders = secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
    referrerPolicy: "no-referrer",
    // TLS and HSTS belong to the reverse proxy that terminates it.
    strictTransportSecurity: false,
  });
  app.use((context, next) => {
    const path = context.req.path;
    if (options.docs !== undefined && isDocsPath(path)) {
      return docsSecurityHeaders(context, next);
    }
    if (options.web?.has(path)) return webSecurityHeaders(context, next);
    return apiSecurityHeaders(context, next);
  });
  app.use(async (context, next) => {
    context.header("Cache-Control", "no-store");
    await next();
  });

  app.use(
    cors({
      allowedOrigins,
      allowedMethods: [
        ...new Set(
          [...routes, OPENAPI_ROUTE].map((route) => route.method.toUpperCase()),
        ),
      ],
    }),
  );

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
      if (user !== null) context.set("userId", user.userId);
      const rawBody =
        route.requestSchemaName === undefined
          ? undefined
          : await readJsonBody(context);
      return context.json(
        await route.run({ user: user ?? undefined, rawBody }),
      );
    });
  }

  if (options.docs !== undefined) mountDocs(app, options.docs);

  const document = buildOpenApiDocument(routes);
  app.get(OPENAPI_ROUTE.path, (context) => {
    context.set("route", OPENAPI_ROUTE.path);
    return context.json(document);
  });

  // Last, so a path the client does not know still gets the API's JSON 404.
  if (options.web !== undefined) mountWeb(app, options.web);

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
