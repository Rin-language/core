/**
 * The route that serves the OpenAPI document. It is not in the registry: its
 * response is an OpenAPI document, which the contract does not describe. The
 * generator and the application share this one definition.
 */
export const OPENAPI_ROUTE = {
  method: "get",
  path: "/v1/openapi.json",
  operationId: "getOpenApiDocument",
  summary: "OpenAPI document of this server.",
  description:
    "The OpenAPI 3.1 description of every route of this server, generated from its route registry and the contract schemas.",
} as const;
