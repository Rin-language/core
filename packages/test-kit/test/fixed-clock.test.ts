import { describe, expect, it } from "vitest";
import { FixedClock } from "../src/fixed-clock.js";

describe("FixedClock", () => {
  it("returns the instant it was given", () => {
    const clock = new FixedClock("2026-10-29T10:00:00Z");

    expect(clock.now().toISOString()).toBe("2026-10-29T10:00:00.000Z");
  });

  it("moves forward when advanced", () => {
    const clock = new FixedClock("2026-10-29T10:00:00Z");

    clock.advance(60_000);

    expect(clock.now().toISOString()).toBe("2026-10-29T10:01:00.000Z");
  });

  it("is not changed by a caller mutating the returned date", () => {
    const clock = new FixedClock("2026-10-29T10:00:00Z");

    clock.now().setFullYear(1999);

    expect(clock.now().toISOString()).toBe("2026-10-29T10:00:00.000Z");
  });
});
