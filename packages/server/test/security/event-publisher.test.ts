import { FakeSecurityEventSink, FixedClock } from "@rin-language/core-test-kit";
import { describe, expect, it } from "vitest";
import type {
  RequestEvent,
  SecurityEvent,
} from "../../src/ports/security-events.js";
import { createEventPublisher } from "../../src/security/event-publisher.js";
import { createTestLogs } from "../http/test-app.js";

const START = "2026-10-30T10:00:00Z";

const requestEvent = (n: number): RequestEvent => ({
  type: "request",
  occurredAt: new Date(Date.parse(START) + n).toISOString(),
  requestId: `request-${n}`,
  method: "GET",
  route: "/v1/ping",
  status: 200,
  durationMs: 1,
  requestBytes: 0,
  responseBytes: 15,
});

const setup = (queueSize = 3) => {
  const sink = new FakeSecurityEventSink();
  const clock = new FixedClock(START);
  const logs = createTestLogs();
  const publisher = createEventPublisher({
    sink,
    queueSize,
    clock,
    logger: logs.logger,
  });
  return { sink, clock, logs, publisher };
};

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("event publisher", () => {
  it("delivers the events in the order they were published", async () => {
    const { sink, publisher } = setup();

    [1, 2, 3].forEach((n) => void publisher.publish(requestEvent(n)));
    await publisher.close();

    expect(sink.events).toEqual([1, 2, 3].map(requestEvent));
  });

  it("returns at once and never calls the receiver inside the request", () => {
    const { sink, publisher } = setup();
    sink.hold();

    const result = publisher.publish(requestEvent(1));

    expect([result, sink.events]).toEqual([undefined, []]);
  });

  it("does not throw when the receiver throws synchronously", async () => {
    const throwing = {
      emit: () => {
        throw new Error("sync failure");
      },
    };
    const publisher = createEventPublisher({
      sink: throwing,
      queueSize: 3,
      clock: new FixedClock(START),
      logger: createTestLogs().logger,
    });

    expect(() => publisher.publish(requestEvent(1))).not.toThrow();
    await publisher.close();
  });
});

describe("event publisher under load", () => {
  it("keeps at most queueSize events waiting behind a slow receiver", async () => {
    const { sink, publisher } = setup(3);
    sink.hold();

    for (let n = 1; n <= 50; n++) publisher.publish(requestEvent(n));
    await settle();
    sink.release();
    await publisher.close();

    // One in flight plus the queue; the rest were dropped, then reported.
    const delivered = sink.events.filter((e) => e.type === "request");
    expect(delivered.length).toBe(1 + 3);
  });

  it("reports how many events were lost once the receiver is back", async () => {
    const { sink, publisher } = setup(2);
    sink.hold();

    for (let n = 1; n <= 6; n++) publisher.publish(requestEvent(n));
    await settle();
    sink.release();
    await publisher.close();

    expect(sink.events.at(-1)).toMatchObject({
      type: "events_dropped",
      count: 3,
    });
  });

  it("dates the gap from the first lost event", async () => {
    const { sink, clock, publisher } = setup(1);
    sink.hold();
    publisher.publish(requestEvent(1));
    publisher.publish(requestEvent(2));
    publisher.publish(requestEvent(3));
    await settle();
    clock.advance(5_000);
    sink.release();
    await publisher.close();

    expect(sink.events.at(-1)).toMatchObject({
      since: requestEvent(3).occurredAt,
      occurredAt: new Date(Date.parse(START) + 5_000).toISOString(),
    });
  });

  it("reports no gap when nothing was lost", async () => {
    const { sink, publisher } = setup();

    publisher.publish(requestEvent(1));
    await publisher.close();

    expect(sink.events.map((e) => e.type)).toEqual(["request"]);
  });

  it("reports a gap only once", async () => {
    const { sink, publisher } = setup(1);
    sink.hold();
    for (let n = 1; n <= 4; n++) publisher.publish(requestEvent(n));
    await settle();
    sink.release();
    await settle();
    publisher.publish(requestEvent(5));
    await publisher.close();

    expect(sink.events.filter((e) => e.type === "events_dropped")).toHaveLength(
      1,
    );
  });
});

describe("event publisher overflow logs", () => {
  const overflowWarnings = (lines: string[]) =>
    lines.filter((line) => line.includes("security event queue is full"));

  it("warns once when the queue overflows, not once per dropped event", async () => {
    const { sink, logs, publisher } = setup(2);
    sink.hold();

    for (let n = 1; n <= 20; n++) publisher.publish(requestEvent(n));
    await settle();
    sink.release();
    await publisher.close();

    expect(overflowWarnings(logs.lines)).toHaveLength(1);
  });

  it("does not warn while the queue holds everything", async () => {
    const { logs, publisher } = setup(10);

    for (let n = 1; n <= 5; n++) publisher.publish(requestEvent(n));
    await publisher.close();

    expect(overflowWarnings(logs.lines)).toEqual([]);
  });

  it("says how many events were lost once the loss is reported", async () => {
    const { sink, logs, publisher } = setup(2);
    sink.hold();
    for (let n = 1; n <= 6; n++) publisher.publish(requestEvent(n));
    await settle();
    sink.release();
    await publisher.close();

    const report = logs.lines
      .map((line) => JSON.parse(line))
      .find((entry) => entry.msg === "security events were dropped");
    expect(report).toMatchObject({
      count: 3,
      since: requestEvent(4).occurredAt,
    });
  });

  it("warns again for a later overflow", async () => {
    const { sink, logs, publisher } = setup(1);
    for (let round = 0; round < 2; round++) {
      sink.hold();
      for (let n = 1; n <= 4; n++) publisher.publish(requestEvent(n));
      await settle();
      sink.release();
      await settle();
    }
    await publisher.close();

    expect(overflowWarnings(logs.lines)).toHaveLength(2);
  });

  it("does not put the content of an event in these logs", async () => {
    const { sink, logs, publisher } = setup(1);
    sink.hold();
    for (let n = 1; n <= 4; n++) {
      publisher.publish({ ...requestEvent(n), route: "/secret-route-marker" });
    }
    await settle();
    sink.release();
    await publisher.close();

    expect(logs.text()).not.toContain("secret-route-marker");
  });
});

describe("event publisher when the receiver is down", () => {
  it("never makes the caller fail", async () => {
    const { sink, publisher } = setup();
    sink.failNext(10);

    expect(() => {
      for (let n = 1; n <= 5; n++) publisher.publish(requestEvent(n));
    }).not.toThrow();
    await publisher.close();
  });

  it("counts an event that could not be delivered as lost", async () => {
    const { sink, publisher } = setup();
    sink.failNext(2);

    publisher.publish(requestEvent(1));
    publisher.publish(requestEvent(2));
    publisher.publish(requestEvent(3));
    await publisher.close();

    expect(sink.events.at(-1)).toMatchObject({
      type: "events_dropped",
      count: 2,
    });
  });

  it("keeps the loss and reports it when the receiver recovers", async () => {
    const { sink, publisher } = setup();
    sink.failNext(2);
    publisher.publish(requestEvent(1));
    await settle();
    publisher.publish(requestEvent(2));
    await settle();
    publisher.publish(requestEvent(3));
    await publisher.close();

    // The first report fails too, so the loss waits for the next one.
    expect(
      sink.events.map((e) => [e.type, "count" in e ? e.count : 0]),
    ).toEqual([
      ["request", 0],
      ["events_dropped", 1],
      ["request", 0],
    ]);
  });

  it("logs the outage once, not once per lost event", async () => {
    const { sink, logs, publisher } = setup(50);
    sink.failNext(1000);

    for (let n = 1; n <= 20; n++) publisher.publish(requestEvent(n));
    await publisher.close();

    const failures = logs.lines.filter((line) =>
      line.includes("security events are not reaching their receiver"),
    );
    expect(failures).toHaveLength(1);
  });

  it("logs when the receiver is reachable again", async () => {
    const { sink, logs, publisher } = setup();
    sink.failNext(1);
    publisher.publish(requestEvent(1));
    await settle();
    publisher.publish(requestEvent(2));
    await publisher.close();

    expect(logs.text()).toContain("security events reach their receiver again");
  });

  it("does not put the content of an event in the logs", async () => {
    const { sink, logs, publisher } = setup();
    sink.failNext(1);

    publisher.publish({ ...requestEvent(1), route: "/secret-route-marker" });
    await publisher.close();

    expect(logs.text()).not.toContain("secret-route-marker");
  });
});

describe("closing the publisher", () => {
  it("delivers what is still waiting", async () => {
    const { sink, publisher } = setup();
    sink.hold();
    publisher.publish(requestEvent(1));
    publisher.publish(requestEvent(2));
    const closing = publisher.close();
    sink.release();
    await closing;

    expect(sink.events).toHaveLength(2);
  });

  it("ignores events published afterwards", async () => {
    const { sink, publisher } = setup();
    await publisher.close();

    publisher.publish(requestEvent(1));
    await settle();

    expect(sink.events).toEqual([]);
  });

  it("can be closed twice", async () => {
    const { publisher } = setup();
    await publisher.close();

    await expect(publisher.close()).resolves.toBeUndefined();
  });
});
