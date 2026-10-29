import { describe, expect, it } from "vitest";
import { FakeIdentity } from "../src/fake-identity.js";

const identity = new FakeIdentity({ "token-a": "user-a" });
const requestWith = (authorization?: string) =>
  new Request("http://localhost/v1/limits", {
    headers: authorization === undefined ? {} : { authorization },
  });

describe("FakeIdentity", () => {
  it("identifies the user of a known bearer token", async () => {
    expect(await identity.authenticate(requestWith("Bearer token-a"))).toEqual({
      userId: "user-a",
    });
  });

  it("rejects an unknown token", async () => {
    expect(await identity.authenticate(requestWith("Bearer nope"))).toBeNull();
  });

  it("rejects a request without credentials", async () => {
    expect(await identity.authenticate(requestWith())).toBeNull();
  });

  it("rejects another authorization scheme", async () => {
    expect(
      await identity.authenticate(requestWith("Basic token-a")),
    ).toBeNull();
  });
});
