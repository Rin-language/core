import { describe, expect, it } from "vitest";
import { createTestApp } from "./test-app.js";

// What Node hands over when the client drops the connection mid-body.
const abortedBody = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"text":'));
      controller.error(
        Object.assign(new Error("aborted"), { code: "ECONNRESET" }),
      );
    },
  });

const abortedPost = () => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: abortedBody(),
  duplex: "half" as const,
});

describe("a body the client abandoned", () => {
  it("is a client error, not a server failure", async () => {
    const { app } = createTestApp();

    const response = await app.request("/v1/echo", abortedPost());

    expect([response.status, await response.json()]).toEqual([
      400,
      {
        error: {
          code: "invalid_request",
          message: "The request body could not be read.",
        },
      },
    ]);
  });

  it("does not look like a crash in the logs", async () => {
    const { app, logs } = createTestApp();

    await app.request("/v1/echo", abortedPost());

    expect(logs.text()).not.toContain("unhandled error");
  });

  it("is also a client error on a path that does not exist", async () => {
    const { app } = createTestApp();

    const response = await app.request("/v1/missing", abortedPost());

    expect(response.status).toBe(400);
  });

  it("still logs a real failure as an error", async () => {
    const { app, logs } = createTestApp();

    await app.request("/v1/boom");

    expect(logs.text()).toContain("unhandled error");
  });
});

describe("abandoned bodies and the logs", () => {
  it("leave nothing of the body", async () => {
    const { app, logs } = createTestApp();

    await app.request("/v1/echo", abortedPost());

    expect(logs.text()).not.toContain('"text"');
  });
});
