import type { ApiErrorCode } from "@rin-language/contract";
import type { z } from "zod";
import type { AuthenticatedUser } from "../ports/identity.js";
import { ApiProblem } from "./api-problem.js";
import { contractSchemaNameOf } from "./contract-schemas.js";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";
export type RouteAuth = "public" | "user";

type UserInput<Auth extends RouteAuth> = Auth extends "user"
  ? { user: AuthenticatedUser }
  : unknown;
type BodyInput<Request> = Request extends z.ZodType
  ? { body: z.output<Request> }
  : unknown;

export type HandlerInput<
  Auth extends RouteAuth,
  Request extends z.ZodType | undefined,
> = UserInput<Auth> & BodyInput<Request>;

/**
 * One API route. It is the single description used to mount the route and to
 * generate the OpenAPI document. Schemas must be the contract's own objects.
 */
export interface RouteSpec<
  Auth extends RouteAuth,
  Response extends z.ZodType,
  Request extends z.ZodType | undefined,
> {
  method: HttpMethod;
  /** Lowercase segments only for now; path parameters come with the first route that needs one. */
  path: string;
  operationId: string;
  summary: string;
  description?: string;
  auth: Auth;
  requestBody?: Request;
  response: Response;
  /** The error codes this route can answer, documented in OpenAPI. */
  errorCodes: readonly ApiErrorCode[];
  /** Polled by monitoring all day: left out of the security events, or it would drown the averages. */
  isProbe?: boolean;
  handler: (
    input: HandlerInput<Auth, Request>,
  ) => z.input<Response> | Promise<z.input<Response>>;
}

export interface RouteRunInput {
  user: AuthenticatedUser | undefined;
  rawBody: unknown;
}

export interface Route {
  readonly method: HttpMethod;
  readonly path: string;
  readonly operationId: string;
  readonly summary: string;
  readonly description: string | undefined;
  readonly auth: RouteAuth;
  readonly requestSchemaName: string | undefined;
  readonly responseSchemaName: string;
  readonly errorCodes: readonly ApiErrorCode[];
  readonly isProbe: boolean;
  /** Validates the body, calls the handler, validates what it returns. */
  run(input: RouteRunInput): Promise<unknown>;
}

const PATH_PATTERN = /^\/(?:[a-z0-9_-]+(?:\/[a-z0-9_-]+)*)?$/;
const METHODS_WITHOUT_BODY: readonly HttpMethod[] = ["get", "delete"];
const MAX_REPORTED_FIELDS = 20;
const MAX_FIELD_NAME_LENGTH = 100;

function requireContractSchemaName(schema: z.ZodType, role: string): string {
  const name = contractSchemaNameOf(schema);
  if (name === undefined) {
    throw new Error(`The ${role} schema must be exported by the contract`);
  }
  return name;
}

/** Names the faulty fields only: never the values that were sent. */
function faultyFields(error: z.ZodError): string[] {
  const fields = error.issues.flatMap((issue) => {
    const path = issue.path.map(String);
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => [...path, key].join("."));
    }
    return [path.join(".") || "(body)"];
  });
  return [...new Set(fields)]
    .slice(0, MAX_REPORTED_FIELDS)
    .map((field) => field.slice(0, MAX_FIELD_NAME_LENGTH));
}

function parseRequestBody(schema: z.ZodType, rawBody: unknown): unknown {
  const result = schema.safeParse(rawBody);
  if (result.success) return result.data;
  throw new ApiProblem("invalid_request", "The request body is not valid.", {
    fields: faultyFields(result.error),
  });
}

export function defineRoute<
  Auth extends RouteAuth,
  Response extends z.ZodType,
  Request extends z.ZodType | undefined = undefined,
>(spec: RouteSpec<Auth, Response, Request>): Route {
  if (!PATH_PATTERN.test(spec.path)) {
    throw new Error(
      `Invalid route path "${spec.path}": use lowercase segments starting with "/"`,
    );
  }
  if (
    spec.requestBody !== undefined &&
    METHODS_WITHOUT_BODY.includes(spec.method)
  ) {
    throw new Error(
      `${spec.method.toUpperCase()} ${spec.path} cannot have a request body`,
    );
  }
  const requestSchemaName =
    spec.requestBody === undefined
      ? undefined
      : requireContractSchemaName(spec.requestBody, "request body");
  const responseSchemaName = requireContractSchemaName(
    spec.response,
    "response",
  );

  return {
    method: spec.method,
    path: spec.path,
    operationId: spec.operationId,
    summary: spec.summary,
    description: spec.description,
    auth: spec.auth,
    requestSchemaName,
    responseSchemaName,
    errorCodes: spec.errorCodes,
    isProbe: spec.isProbe ?? false,
    async run({ user, rawBody }) {
      if (spec.auth === "user" && user === undefined) {
        throw new ApiProblem("unauthorized", "Authentication is required.");
      }
      const body =
        spec.requestBody === undefined
          ? undefined
          : parseRequestBody(spec.requestBody, rawBody);
      // The types of RouteSpec guarantee that this object has exactly the shape
      // the handler declares: `user` iff auth is "user", `body` iff requestBody is set.
      const input = {
        ...(spec.auth === "user" ? { user } : {}),
        ...(spec.requestBody === undefined ? {} : { body }),
      } as HandlerInput<Auth, Request>;
      return spec.response.parse(await spec.handler(input));
    },
  };
}
