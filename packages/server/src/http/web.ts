import type { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

export interface WebAsset {
  body: Buffer;
  contentType: string;
}

/** The built client, keyed by the exact URL path it is served at. */
export type WebAssets = ReadonlyMap<string, WebAsset>;

export const WEB_ROUTE = "web";
/** The one catch-all route that serves the client; it is not an API operation. */
export const WEB_ENDPOINT = "GET /*";

/** The page runs its own scripts and styles and calls this server, nothing else. */
export const webSecurityHeaders = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'none'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    connectSrc: ["'self'"],
    imgSrc: ["'self'", "data:"],
    fontSrc: ["'self'"],
    baseUri: ["'none'"],
    formAction: ["'none'"],
    frameAncestors: ["'none'"],
  },
  referrerPolicy: "no-referrer",
  strictTransportSecurity: false,
});

/**
 * Serves only what was loaded: a request path is looked up, never joined to a
 * folder, so there is no way to reach another file.
 */
export function mountWeb<Env extends { Variables: { route: string } }>(
  app: Hono<Env>,
  assets: WebAssets,
): void {
  app.get("/*", (context) => {
    const asset = assets.get(context.req.path);
    if (asset === undefined) return context.notFound();
    context.set("route", WEB_ROUTE);
    return context.body(new Uint8Array(asset.body), 200, {
      "Content-Type": asset.contentType,
    });
  });
}
