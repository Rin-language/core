import {
  ApiError,
  type ApiErrorCode,
  CapabilitiesResponse,
  HealthResponse,
  LimitsResponse,
} from "@rin-language/contract";
import type { z } from "zod";

export type ApiClientErrorCode =
  | ApiErrorCode
  | "network_error"
  | "invalid_response";

/**
 * A failed call. Messages are generic or the server's own public ApiError
 * message: an unexpected answer body is never repeated.
 */
export class ApiClientError extends Error {
  override readonly name = "ApiClientError";

  constructor(
    readonly code: ApiClientErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export type FetchFunction = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface ApiClientOptions {
  /** Empty means the server that served this page. */
  baseUrl?: string;
  fetch?: FetchFunction;
}

export interface ApiClient {
  getHealth(): Promise<z.output<typeof HealthResponse>>;
  getLimits(): Promise<z.output<typeof LimitsResponse>>;
  getCapabilities(): Promise<z.output<typeof CapabilitiesResponse>>;
}

const defaultFetch: FetchFunction = (input, init) =>
  globalThis.fetch(input, init);

/**
 * The web client talks to the public API like any other tool: documented
 * routes, answers validated against the contract's schemas.
 */
export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? "";
  const send = options.fetch ?? defaultFetch;

  async function get<Schema extends z.ZodType>(
    path: string,
    schema: Schema,
  ): Promise<z.output<Schema>> {
    let response: Response;
    try {
      response = await send(`${baseUrl}${path}`, {
        method: "GET",
        credentials: "omit",
        headers: { accept: "application/json" },
      });
    } catch (error) {
      throw new ApiClientError(
        "network_error",
        "The server could not be reached.",
        { cause: error },
      );
    }
    // A body that is not JSON is reported below as an invalid response.
    const body: unknown = await response.json().catch(() => undefined);

    if (!response.ok) {
      const apiError = ApiError.safeParse(body);
      if (apiError.success) {
        const { code, message } = apiError.data.error;
        throw new ApiClientError(code, message);
      }
      throw new ApiClientError(
        "invalid_response",
        "The server answered with an unexpected error.",
      );
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiClientError(
        "invalid_response",
        "The server answered with an unexpected response.",
      );
    }
    return parsed.data;
  }

  return {
    getHealth: () => get("/health", HealthResponse),
    getLimits: () => get("/v1/limits", LimitsResponse),
    getCapabilities: () => get("/v1/capabilities", CapabilitiesResponse),
  };
}
