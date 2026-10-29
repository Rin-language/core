import type { ApiError, ApiErrorCode } from "@rin-language/contract";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const STATUS_BY_CODE = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  payload_too_large: 413,
  rate_limited: 429,
  quota_exceeded: 429,
  unsupported_language: 400,
  ai_unavailable: 503,
  ai_output_invalid: 502,
  internal_error: 500,
} as const satisfies Record<ApiErrorCode, ContentfulStatusCode>;

/**
 * An expected failure, answered to the client as an `ApiError`. The message and
 * details are public: no user content and no internal detail.
 */
export class ApiProblem extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly headers: Record<string, string> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ApiProblem";
  }

  toApiError(): ApiError {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}
