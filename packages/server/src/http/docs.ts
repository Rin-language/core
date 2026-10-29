import type { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { OPENAPI_ROUTE } from "../openapi/openapi-route.js";

export const DOCS_PATH = "/docs";
export const DOCS_SCRIPT_PATH = "/docs/scalar.js";

/** What the page needs, handed in so the application never reads the disk itself. */
export interface DocsAssets {
  script: string;
}

// Turned off because each of them calls a Scalar server: fonts, telemetry and the agent.
const VIEWER_CONFIGURATION = {
  withDefaultFonts: false,
  telemetry: false,
  agent: { disabled: true },
};

const escapeAttribute = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("'", "&#39;");

export function renderDocsPage(): string {
  const configuration = escapeAttribute(JSON.stringify(VIEWER_CONFIGURATION));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>API documentation</title>
</head>
<body>
<script id="api-reference" data-url="${OPENAPI_ROUTE.path}" data-configuration='${configuration}'></script>
<script src="${DOCS_SCRIPT_PATH}"></script>
</body>
</html>
`;
}

/**
 * The page may run its own script and call this server, nothing else. The
 * viewer injects its styles at runtime, hence the inline styles.
 */
export const docsSecurityHeaders = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'none'"],
    scriptSrc: ["'self'"],
    connectSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:"],
    fontSrc: ["'self'", "data:"],
    baseUri: ["'none'"],
    formAction: ["'none'"],
    frameAncestors: ["'none'"],
  },
  referrerPolicy: "no-referrer",
  strictTransportSecurity: false,
});

export const isDocsPath = (path: string): boolean =>
  path === DOCS_PATH || path === DOCS_SCRIPT_PATH;

export const DOCS_ENDPOINTS = [`GET ${DOCS_PATH}`, `GET ${DOCS_SCRIPT_PATH}`];

export function mountDocs<Env extends { Variables: { route: string } }>(
  app: Hono<Env>,
  assets: DocsAssets,
): void {
  const page = renderDocsPage();
  app.get(DOCS_PATH, (context) => {
    context.set("route", DOCS_PATH);
    return context.body(page, 200, {
      "Content-Type": "text/html; charset=utf-8",
    });
  });
  app.get(DOCS_SCRIPT_PATH, (context) => {
    context.set("route", DOCS_SCRIPT_PATH);
    return context.body(assets.script, 200, {
      "Content-Type": "text/javascript; charset=utf-8",
    });
  });
}
