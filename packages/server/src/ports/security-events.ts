import type { ApiErrorCode } from "@rin-language/contract";
import type { UserId } from "./identity.js";

/**
 * A keyed hash of the caller's network. Two fingerprints are comparable only
 * when their `keyId` is the same: a new key cuts the link on purpose.
 */
export interface IpFingerprint {
  keyId: string;
  value: string;
}

/**
 * A coarse reading of the User-Agent, which itself is never kept: a script and
 * a browser tell a fraud rule something, the exact version only singles a
 * person out.
 */
export type ClientKind = "browser" | "script" | "declared_bot" | "none";

/**
 * What the server saw of one request, and nothing of what it carried: no body,
 * no query string, no header, no raw path, no address.
 */
export interface RequestEvent {
  type: "request";
  occurredAt: string;
  requestId: string;
  method: string;
  /** The route pattern, never the path the client sent. */
  route: string;
  status: number;
  durationMs: number;
  requestBytes: number;
  responseBytes: number;
  clientKind: ClientKind;
  userId?: UserId;
  /** The `ApiError` code of a failed request. */
  errorCode?: ApiErrorCode;
  ipFingerprint?: IpFingerprint;
}

/** Tells the receiver that events were lost, so a gap is never silent. */
export interface EventsDroppedEvent {
  type: "events_dropped";
  occurredAt: string;
  count: number;
  /** When the first lost event would have been emitted. */
  since: string;
}

export type SecurityEvent = RequestEvent | EventsDroppedEvent;

/**
 * Receives security events. Core only emits: the rules that turn events into
 * alerts belong to whoever implements this, such as the hosted offer.
 */
export interface SecurityEventSink {
  emit(event: SecurityEvent): void | Promise<void>;
}
