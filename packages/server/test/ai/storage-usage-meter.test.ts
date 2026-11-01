import { FixedClock, InMemoryStorage } from "@rin-language/core-test-kit";
import { describe, expect, it } from "vitest";
import { createStorageUsageMeter } from "../../src/ai/storage-usage-meter.js";

const setup = (now = "2026-10-29T23:59:59Z") => {
  const storage = new InMemoryStorage();
  const clock = new FixedClock(now);
  return { storage, meter: createStorageUsageMeter(storage.usage, clock) };
};

const amounts = { input_tokens: 120, output_tokens: 30, calls: 1 };

describe("UsageMeter", () => {
  it("records every amount of a call under the UTC day of the clock", async () => {
    const { meter } = setup("2026-10-29T23:59:59Z");
    await meter.record("user-a", {
      language: "ja",
      purpose: "correction",
      amounts,
    });

    expect(await meter.read("user-a")).toEqual([
      {
        day: "2026-10-29",
        language: "ja",
        purpose: "correction",
        unit: "calls",
        quantity: 1,
      },
      {
        day: "2026-10-29",
        language: "ja",
        purpose: "correction",
        unit: "input_tokens",
        quantity: 120,
      },
      {
        day: "2026-10-29",
        language: "ja",
        purpose: "correction",
        unit: "output_tokens",
        quantity: 30,
      },
    ]);
  });

  it("adds up the calls it records", async () => {
    const { meter } = setup();
    const usage = { language: "ja", purpose: "correction", amounts };
    await meter.record("user-a", usage);
    await meter.record("user-a", usage);

    const calls = (await meter.read("user-a")).find(
      (entry) => entry.unit === "calls",
    );
    expect(calls?.quantity).toBe(2);
  });

  it("does not store an amount of zero", async () => {
    const { meter } = setup();
    await meter.record("user-a", {
      language: "ja",
      purpose: "correction",
      amounts: { input_tokens: 0, calls: 1 },
    });

    expect((await meter.read("user-a")).map((entry) => entry.unit)).toEqual([
      "calls",
    ]);
  });

  it("reads only the usage of the user it is asked for", async () => {
    const { meter } = setup();
    await meter.record("user-a", {
      language: "ja",
      purpose: "correction",
      amounts,
    });

    expect(await meter.read("user-b")).toEqual([]);
  });

  it("reads only the days of the range", async () => {
    const { storage } = setup();
    const meter = createStorageUsageMeter(
      storage.usage,
      new FixedClock("2026-10-30T00:00:01Z"),
    );
    await meter.record("user-a", {
      language: "ja",
      purpose: "correction",
      amounts,
    });

    expect(await meter.read("user-a", { toDay: "2026-10-29" })).toEqual([]);
  });

  it.each([
    ["a negative quantity", { calls: -1 }],
    ["a fractional quantity", { calls: 1.5 }],
    ["a quantity that is not a number", { calls: Number.NaN }],
    ["an unsafe quantity", { calls: Number.MAX_SAFE_INTEGER + 1 }],
    ["a unit that is not snake_case", { "Input Tokens": 1 }],
  ])("refuses %s", async (_name, badAmounts) => {
    const { meter } = setup();

    await expect(
      meter.record("user-a", {
        language: "ja",
        purpose: "correction",
        amounts: badAmounts,
      }),
    ).rejects.toThrow();
  });

  it.each([
    [
      "a language that is not a code",
      { language: "Japanese", purpose: "correction" },
    ],
    ["a purpose that is not snake_case", { language: "ja", purpose: "Fix It" }],
  ])("refuses %s", async (_name, label) => {
    const { meter } = setup();

    await expect(
      meter.record("user-a", { ...label, amounts }),
    ).rejects.toThrow();
  });
});
