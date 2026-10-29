import { describe, expect, it } from "vitest";
import { ApiClientError, createApiClient } from "../src/api/api-client.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const clientAnswering = (response: () => Response | Promise<Response>) => {
  const requested: string[] = [];
  const client = createApiClient({
    fetch: async (input) => {
      requested.push(String(input));
      return response();
    },
  });
  return { client, requested };
};

const failureOf = async (call: Promise<unknown>) => {
  try {
    await call;
  } catch (error) {
    return error;
  }
  throw new Error("The call was expected to fail");
};

describe("api client", () => {
  it("reads the limits through the public route", async () => {
    const limits = {
      maxTextLength: 2000,
      maxEdits: 100,
      maxExplanationLength: 500,
    };
    const { client, requested } = clientAnswering(() => json(limits));

    expect([await client.getLimits(), requested]).toEqual([
      limits,
      ["/v1/limits"],
    ]);
  });

  it("reads the health and the capabilities", async () => {
    const health = clientAnswering(() => json({ status: "ok" }));
    const languages = [
      {
        code: "ja",
        errorTypes: ["other"],
        levels: ["N5"],
        skills: ["reading"],
      },
    ];
    const capabilities = clientAnswering(() => json({ languages }));

    expect([
      await health.client.getHealth(),
      health.requested,
      await capabilities.client.getCapabilities(),
      capabilities.requested,
    ]).toEqual([
      { status: "ok" },
      ["/health"],
      { languages },
      ["/v1/capabilities"],
    ]);
  });

  it("prefixes every route with the base URL", async () => {
    const requested: string[] = [];
    const client = createApiClient({
      baseUrl: "https://rin.example.com",
      fetch: async (input) => {
        requested.push(String(input));
        return json({ status: "ok" });
      },
    });

    await client.getHealth();

    expect(requested).toEqual(["https://rin.example.com/health"]);
  });

  it("refuses an answer that does not match the contract", async () => {
    const { client } = clientAnswering(() => json({ status: "maybe" }));

    const error = await failureOf(client.getHealth());

    expect(error).toMatchObject({
      name: "ApiClientError",
      code: "invalid_response",
    });
  });

  it("turns an ApiError answer into a typed error", async () => {
    const { client } = clientAnswering(() =>
      json({ error: { code: "rate_limited", message: "Slow down." } }, 429),
    );

    const error = await failureOf(client.getLimits());

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      code: "rate_limited",
      message: "Slow down.",
    });
  });

  it("does not repeat an unexpected error body", async () => {
    const { client } = clientAnswering(
      () =>
        new Response("<html>stack trace secret-detail</html>", { status: 502 }),
    );

    const error = await failureOf(client.getLimits());

    expect([(error as ApiClientError).code, (error as Error).message]).toEqual([
      "invalid_response",
      expect.not.stringContaining("secret-detail"),
    ]);
  });

  it("reports a network failure and keeps its cause", async () => {
    const cause = new TypeError("fetch failed");
    const client = createApiClient({
      fetch: async () => {
        throw cause;
      },
    });

    const error = await failureOf(client.getHealth());

    expect(error).toMatchObject({ code: "network_error", cause });
  });

  it("sends no credentials and asks for JSON", async () => {
    const seen: RequestInit[] = [];
    const client = createApiClient({
      fetch: async (_input, init) => {
        seen.push(init ?? {});
        return json({ status: "ok" });
      },
    });

    await client.getHealth();

    expect(seen[0]).toMatchObject({
      method: "GET",
      credentials: "omit",
      headers: { accept: "application/json" },
    });
  });
});
