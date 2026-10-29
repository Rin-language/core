import type { SecurityEvent } from "@rin-language/core-server";
import { describe, expect, it } from "vitest";
import { FakeSecurityEventSink } from "../src/fake-security-event-sink.js";

const event: SecurityEvent = {
  type: "events_dropped",
  occurredAt: "2026-10-30T10:00:00.000Z",
  count: 1,
  since: "2026-10-30T09:59:00.000Z",
};

describe("FakeSecurityEventSink", () => {
  it("records what it receives", async () => {
    const sink = new FakeSecurityEventSink();

    await sink.emit(event);

    expect(sink.events).toEqual([event]);
  });

  it("holds events back until it is released", async () => {
    const sink = new FakeSecurityEventSink();
    sink.hold();

    const pending = sink.emit(event);
    const heldCount = sink.events.length;
    sink.release();
    await pending;

    expect([heldCount, sink.events.length]).toEqual([0, 1]);
  });

  it("fails the requested number of times then recovers", async () => {
    const sink = new FakeSecurityEventSink();
    sink.failNext(1);

    await expect(sink.emit(event)).rejects.toThrow();
    await sink.emit(event);

    expect(sink.events).toEqual([event]);
  });
});
