import {
  CorrectionRequest,
  CorrectionResponse,
  HealthResponse,
} from "@rin-language/contract";
import { FakeIdentity, FixedClock } from "@rin-language/core-test-kit";
import pino from "pino";
import { createApp } from "../../src/http/create-app.js";
import { defineRoute } from "../../src/http/route.js";
import type { Identity } from "../../src/ports/identity.js";

export const MAX_BODY_BYTES = 1024;

export const testIdentity = new FakeIdentity({ "token-a": "user-a" });

export function createTestLogs() {
  const lines: string[] = [];
  const logger = pino(
    { level: "info" },
    { write: (line: string) => void lines.push(line) },
  );
  return { lines, logger, text: () => lines.join("") };
}

export interface Captured {
  userIds: string[];
  texts: string[];
}

export function createTestApp(
  options: { identity?: Identity; allowedOrigins?: readonly string[] } = {},
) {
  const logs = createTestLogs();
  const captured: Captured = { userIds: [], texts: [] };
  const routes = [
    defineRoute({
      method: "get",
      path: "/v1/ping",
      operationId: "ping",
      summary: "Test route.",
      auth: "public",
      response: HealthResponse,
      errorCodes: [],
      handler: () => ({ status: "ok" as const }),
    }),
    defineRoute({
      method: "get",
      path: "/v1/leaky",
      operationId: "leaky",
      summary: "Returns more than its schema allows.",
      auth: "public",
      response: HealthResponse,
      errorCodes: [],
      handler: () =>
        Object.assign({ status: "ok" as const }, { secret: "leak-123" }),
    }),
    defineRoute({
      method: "get",
      path: "/v1/boom",
      operationId: "boom",
      summary: "Always fails.",
      auth: "public",
      response: HealthResponse,
      errorCodes: [],
      handler: () => {
        throw new Error("boom internal detail");
      },
    }),
    defineRoute({
      method: "get",
      path: "/v1/me",
      operationId: "me",
      summary: "Needs a user.",
      auth: "user",
      response: HealthResponse,
      errorCodes: ["unauthorized"],
      handler: ({ user }) => {
        captured.userIds.push(user.userId);
        return { status: "ok" as const };
      },
    }),
    defineRoute({
      method: "post",
      path: "/v1/echo",
      operationId: "echo",
      summary: "Takes a body.",
      auth: "public",
      requestBody: CorrectionRequest,
      response: CorrectionResponse,
      errorCodes: ["invalid_request", "payload_too_large"],
      handler: ({ body }) => {
        captured.texts.push(body.text);
        return { edits: [], score: 100 };
      },
    }),
  ];
  const app = createApp({
    routes,
    identity: options.identity ?? testIdentity,
    clock: new FixedClock("2026-10-29T10:00:00Z"),
    logger: logs.logger,
    maxBodyBytes: MAX_BODY_BYTES,
    ...(options.allowedOrigins === undefined
      ? {}
      : { allowedOrigins: options.allowedOrigins }),
  });
  return { app, logs, captured, routes };
}

export const jsonPost = (
  body: string,
  headers: Record<string, string> = {},
) => ({
  method: "POST",
  body,
  headers: { "content-type": "application/json", ...headers },
});
