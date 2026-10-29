import type { Logger } from "pino";
import type { Clock } from "../ports/clock.js";
import type {
  EventsDroppedEvent,
  SecurityEvent,
  SecurityEventSink,
} from "../ports/security-events.js";

export interface EventPublisher {
  /** Returns at once and never throws: a request never waits for its event. */
  publish(event: SecurityEvent): void;
  /** Delivers what is waiting and reports any gap. Later events are ignored. */
  close(): Promise<void>;
}

export interface EventPublisherOptions {
  sink: SecurityEventSink;
  /** The most events held back while the receiver is slow. */
  queueSize: number;
  clock: Clock;
  logger: Logger;
}

interface Loss {
  count: number;
  since: string | undefined;
}

const noLoss = (): Loss => ({ count: 0, since: undefined });

/**
 * Hands events to the receiver in the background, in order. A slow or broken
 * receiver can neither slow a request nor grow memory: past `queueSize` new
 * events are dropped. A drop is never silent: the loss is counted, and an
 * `events_dropped` event tells the receiver how many events are missing and
 * since when, so the gap itself can be treated as a signal.
 */
export function createEventPublisher(
  options: EventPublisherOptions,
): EventPublisher {
  const { sink, queueSize, clock, logger } = options;
  const queue: SecurityEvent[] = [];
  let loss = noLoss();
  let draining: Promise<void> | undefined;
  let isClosed = false;
  let isReceiverFailing = false;

  const addLoss = (since: string, count = 1): void => {
    loss.count += count;
    if (loss.since === undefined || since < loss.since) loss.since = since;
  };

  async function deliver(event: SecurityEvent): Promise<boolean> {
    try {
      await sink.emit(event);
    } catch (error) {
      // One line per outage, or a receiver that is down would flood the logs.
      if (!isReceiverFailing) {
        logger.error(
          { eventType: event.type, err: error },
          "security events are not reaching their receiver",
        );
      }
      isReceiverFailing = true;
      return false;
    }
    if (isReceiverFailing) {
      logger.info("security events reach their receiver again");
    }
    isReceiverFailing = false;
    return true;
  }

  async function reportLoss(): Promise<void> {
    if (loss.count === 0 || loss.since === undefined) return;
    const taken = loss;
    loss = noLoss();
    const marker: EventsDroppedEvent = {
      type: "events_dropped",
      occurredAt: clock.now().toISOString(),
      count: taken.count,
      since: taken.since ?? clock.now().toISOString(),
    };
    // Kept for the next attempt when the receiver is still down.
    if (!(await deliver(marker))) addLoss(marker.since, marker.count);
  }

  async function drain(): Promise<void> {
    for (
      let event = queue.shift();
      event !== undefined;
      event = queue.shift()
    ) {
      if (!(await deliver(event))) addLoss(event.occurredAt);
    }
    await reportLoss();
  }

  function schedule(): void {
    if (draining !== undefined) return;
    draining = drain().finally(() => {
      draining = undefined;
      if (queue.length > 0) schedule();
    });
  }

  return {
    publish(event) {
      if (isClosed) return;
      if (queue.length >= queueSize) addLoss(event.occurredAt);
      else queue.push(event);
      schedule();
    },
    async close() {
      isClosed = true;
      while (draining !== undefined) await draining;
      await reportLoss();
    },
  };
}
