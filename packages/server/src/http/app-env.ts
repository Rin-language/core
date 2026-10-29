import type { ApiErrorCode } from "@rin-language/contract";
import type { UserId } from "../ports/identity.js";

/** What the middleware of one request share. */
export interface AppEnv {
  Variables: {
    requestId: string;
    route: string;
    userId?: UserId;
    errorCode?: ApiErrorCode;
    /** Bytes of body the server actually read, whatever the client announced. */
    requestBytes?: number;
  };
}

/** The route label of a request that matched none, so an unknown path is never logged. */
export const UNMATCHED_ROUTE = "unmatched";
