import { describe, expect, it } from "vitest";
import { FakeLLMProvider } from "../src/fake-llm-provider.js";

const request = { system: "Be brief.", user: "text", maxOutputTokens: 100 };

describe("FakeLLMProvider", () => {
  it("returns the scripted responses in order", async () => {
    const provider = new FakeLLMProvider();
    provider.enqueue("first");
    provider.enqueue("second");

    const texts = [
      (await provider.generate(request)).text,
      (await provider.generate(request)).text,
    ];

    expect(texts).toEqual(["first", "second"]);
  });

  it("records the requests it received", async () => {
    const provider = new FakeLLMProvider();
    provider.enqueue("ok");

    await provider.generate(request);

    expect(provider.calls).toEqual([request]);
  });

  it("fails loudly when no response is scripted", async () => {
    const provider = new FakeLLMProvider();

    await expect(provider.generate(request)).rejects.toThrow(
      "no scripted response",
    );
  });
});
