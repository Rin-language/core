import type { ApiErrorCode } from "@rin-language/contract";
import { API_VERSION } from "@rin-language/contract";
import { STATUS_BY_CODE } from "../http/api-problem.js";
import type { Route } from "../http/route.js";
import { loadContractJsonSchema } from "./contract-json-schemas.js";
import { OPENAPI_ROUTE } from "./openapi-route.js";

export interface OpenApiDocument {
  openapi: "3.1.0";
  info: { title: string; version: string; description: string };
  paths: Record<string, Record<string, unknown>>;
  components: {
    schemas: Record<string, Record<string, unknown>>;
    securitySchemes?: Record<string, unknown>;
  };
}

const BEARER_SCHEME = "bearerAuth";
const JSON_CONTENT_TYPE = "application/json";

const schemaRef = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const jsonContent = (name: string) => ({
  content: { [JSON_CONTENT_TYPE]: { schema: schemaRef(name) } },
});

/** Errors the application itself can answer, besides those a route declares. */
function documentedErrorCodes(route: Route): ApiErrorCode[] {
  const codes = new Set<ApiErrorCode>(route.errorCodes);
  codes.add("internal_error");
  if (route.auth === "user") codes.add("unauthorized");
  if (route.requestSchemaName !== undefined) {
    codes.add("invalid_request");
    codes.add("payload_too_large");
  }
  return [...codes];
}

function errorResponses(codes: readonly ApiErrorCode[]) {
  const codesByStatus = new Map<number, ApiErrorCode[]>();
  for (const code of codes) {
    const status = STATUS_BY_CODE[code];
    codesByStatus.set(status, [...(codesByStatus.get(status) ?? []), code]);
  }
  return [...codesByStatus.entries()]
    .sort(([first], [second]) => first - second)
    .map(([status, statusCodes]) => [
      String(status),
      {
        description: `Error: ${statusCodes.join(", ")}.`,
        ...jsonContent("ApiError"),
      },
    ]);
}

function describeOperation(route: Route) {
  return {
    operationId: route.operationId,
    summary: route.summary,
    ...(route.description === undefined
      ? {}
      : { description: route.description }),
    ...(route.auth === "user" ? { security: [{ [BEARER_SCHEME]: [] }] } : {}),
    ...(route.requestSchemaName === undefined
      ? {}
      : {
          requestBody: {
            required: true,
            ...jsonContent(route.requestSchemaName),
          },
        }),
    responses: Object.fromEntries([
      [
        "200",
        {
          description: route.summary,
          ...jsonContent(route.responseSchemaName),
        },
      ],
      ...errorResponses(documentedErrorCodes(route)),
    ]),
  };
}

function describeOpenApiRoute() {
  return {
    operationId: OPENAPI_ROUTE.operationId,
    summary: OPENAPI_ROUTE.summary,
    description: OPENAPI_ROUTE.description,
    responses: Object.fromEntries([
      [
        "200",
        {
          description: OPENAPI_ROUTE.summary,
          content: {
            [JSON_CONTENT_TYPE]: {
              schema: {
                type: "object",
                description: "An OpenAPI 3.1 document.",
              },
            },
          },
        },
      ],
      ...errorResponses(["internal_error"]),
    ]),
  };
}

/**
 * Builds the OpenAPI 3.1 document from the route registry. Schemas are the
 * contract's own JSON Schemas; nothing is written by hand. No `servers` entry:
 * the server never guesses its public URL from a request header.
 */
export function buildOpenApiDocument(
  routes: readonly Route[],
): OpenApiDocument {
  const paths: OpenApiDocument["paths"] = {};
  const schemaNames = new Set<string>(["ApiError"]);

  for (const route of routes) {
    schemaNames.add(route.responseSchemaName);
    if (route.requestSchemaName !== undefined)
      schemaNames.add(route.requestSchemaName);
    paths[route.path] = {
      ...paths[route.path],
      [route.method]: describeOperation(route),
    };
  }
  paths[OPENAPI_ROUTE.path] = {
    ...paths[OPENAPI_ROUTE.path],
    [OPENAPI_ROUTE.method]: describeOpenApiRoute(),
  };

  const schemas = Object.fromEntries(
    [...schemaNames].sort().map((name) => [name, loadContractJsonSchema(name)]),
  );
  const needsBearer = routes.some((route) => route.auth === "user");

  return {
    openapi: "3.1.0",
    info: {
      title: "Core API",
      version: API_VERSION,
      description: "Public API of the language immersion core server.",
    },
    paths,
    components: {
      schemas,
      ...(needsBearer
        ? {
            securitySchemes: {
              [BEARER_SCHEME]: { type: "http", scheme: "bearer" },
            },
          }
        : {}),
    },
  };
}
