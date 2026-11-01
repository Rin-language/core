import { describe, expect, it, vi } from "vitest";
import {
  FakeLLMProvider,
  MALFORMED_OUTPUTS,
} from "../src/fake-llm-provider.js";

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

  it("reports a non-zero usage by default", async () => {
    const provider = new FakeLLMProvider();
    provider.enqueue("ok");

    const { usage } = await provider.generate(request);

    expect(usage.inputTokens + usage.outputTokens).toBeGreaterThan(0);
  });

  it("reports the usage it was scripted with", async () => {
    const provider = new FakeLLMProvider();
    provider.enqueue("ok", { usage: { inputTokens: 7, outputTokens: 3 } });

    expect((await provider.generate(request)).usage).toEqual({
      inputTokens: 7,
      outputTokens: 3,
    });
  });

  it("fails with the scripted error", async () => {
    const provider = new FakeLLMProvider();
    provider.enqueueFailure(new Error("provider is down"));

    await expect(provider.generate(request)).rejects.toThrow(
      "provider is down",
    );
  });

  it("still records the request of a failing call", async () => {
    const provider = new FakeLLMProvider();
    provider.enqueueFailure(new Error("down"));

    await provider.generate(request).catch(() => undefined);

    expect(provider.calls).toEqual([request]);
  });

  it("answers only after the scripted delay", async () => {
    vi.useFakeTimers();
    try {
      const provider = new FakeLLMProvider();
      provider.enqueue("slow", { delayMs: 1000 });
      let isDone = false;
      const call = provider.generate(request).then(() => {
        isDone = true;
      });

      await vi.advanceTimersByTimeAsync(999);
      const doneEarly = isDone;
      await vi.advanceTimersByTimeAsync(1);
      await call;

      expect([doneEarly, isDone]).toEqual([false, true]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up a delayed answer when the caller aborts", async () => {
    vi.useFakeTimers();
    try {
      const provider = new FakeLLMProvider();
      provider.enqueue("slow", { delayMs: 1000 });
      const controller = new AbortController();
      const call = provider.generate({ ...request, signal: controller.signal });
      const assertion = expect(call).rejects.toThrow("stop");

      controller.abort(new Error("stop"));

      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("never answers a hanging call until the caller aborts", async () => {
    const provider = new FakeLLMProvider();
    provider.enqueueHang();
    const controller = new AbortController();
    const call = provider.generate({ ...request, signal: controller.signal });
    const assertion = expect(call).rejects.toThrow("stop");

    controller.abort(new Error("stop"));

    await assertion;
  });

  it("keeps a hanging call pending when nobody aborts", async () => {
    vi.useFakeTimers();
    try {
      const provider = new FakeLLMProvider();
      provider.enqueueHang();
      let isSettled = false;
      provider
        .generate(request)
        .finally(() => {
          isSettled = true;
        })
        .catch(() => undefined);

      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

      expect(isSettled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("MALFORMED_OUTPUTS", () => {
  it("offers several kinds of answer a validator must refuse", () => {
    expect(Object.keys(MALFORMED_OUTPUTS)).toEqual(
      expect.arrayContaining(["noJson", "truncated", "wrongType", "extraKey"]),
    );
  });
});
