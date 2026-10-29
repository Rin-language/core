import type { MiddlewareHandler } from "hono";

// The only request headers the API reads: a JSON body and a bearer token.
const ALLOWED_REQUEST_HEADERS = ["Content-Type", "Authorization"];

export interface CorsOptions {
  /** Exact origins, already validated by the configuration. Empty closes CORS. */
  allowedOrigins: readonly string[];
  /** The methods the API serves, in upper case. */
  allowedMethods: readonly string[];
}

const splitHeaderList = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item !== "");

/**
 * Lets the browser of an explicitly listed origin read the API's answers.
 * Credentials are never allowed and the origin is never a wildcard: the API
 * authenticates with a bearer token the page sends itself, not with cookies.
 */
export function cors(options: CorsOptions): MiddlewareHandler {
  const { allowedOrigins, allowedMethods } = options;
  if (allowedOrigins.length === 0) return (_context, next) => next();

  const origins = new Set(allowedOrigins);
  const methods = new Set(allowedMethods);
  const headers = new Set(
    ALLOWED_REQUEST_HEADERS.map((name) => name.toLowerCase()),
  );

  return async (context, next) => {
    // Cached answers must not be reused across origins, listed or not.
    context.header("Vary", "Origin", { append: true });
    const origin = context.req.header("origin");
    if (origin === undefined || !origins.has(origin)) return next();

    const requestedMethod = context.req.header("access-control-request-method");
    const isPreflight =
      context.req.method === "OPTIONS" && requestedMethod !== undefined;
    if (!isPreflight) {
      context.header("Access-Control-Allow-Origin", origin);
      return next();
    }

    const requestedHeaders = splitHeaderList(
      context.req.header("access-control-request-headers"),
    );
    const isAcceptable =
      methods.has(requestedMethod.toUpperCase()) &&
      requestedHeaders.every((name) => headers.has(name));
    // A refused preflight gets no CORS header, so the browser blocks the request.
    if (!isAcceptable) return next();

    context.header("Access-Control-Allow-Origin", origin);
    context.header("Access-Control-Allow-Methods", allowedMethods.join(", "));
    context.header(
      "Access-Control-Allow-Headers",
      ALLOWED_REQUEST_HEADERS.join(", "),
    );
    return context.body(null, 204);
  };
}
