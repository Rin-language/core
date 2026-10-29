import { describe, expect, it } from "vitest";
import { sharedBody } from "../../src/http/shared-body.js";

describe("sharedBody", () => {
  it("streams the bytes it was given", async () => {
    const bytes = new TextEncoder().encode("hello");

    const text = await new Response(sharedBody(bytes)).text();

    expect(text).toBe("hello");
  });

  it("hands out the very same bytes, never a copy", async () => {
    const bytes = new Uint8Array(1024);

    const chunk = await sharedBody(bytes).getReader().read();

    expect(chunk.value).toBe(bytes);
  });

  it("can be read once per request from the same bytes", async () => {
    const bytes = new TextEncoder().encode("again");

    const texts = [
      await new Response(sharedBody(bytes)).text(),
      await new Response(sharedBody(bytes)).text(),
    ];

    expect(texts).toEqual(["again", "again"]);
  });

  it("serves an empty body", async () => {
    const text = await new Response(sharedBody(new Uint8Array())).text();

    expect(text).toBe("");
  });
});
