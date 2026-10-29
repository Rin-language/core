import type {
  SecurityEvent,
  SecurityEventSink,
} from "@rin-language/core-server";

/**
 * Records the events it receives. It can be held shut, like a slow receiver,
 * or made to fail, like one that is down.
 */
export class FakeSecurityEventSink implements SecurityEventSink {
  readonly events: SecurityEvent[] = [];
  private gate: Promise<void> | undefined;
  private openGate: (() => void) | undefined;
  private remainingFailures = 0;

  /** Every event waits, unrecorded, until `release()`. */
  hold(): void {
    this.gate = new Promise((resolve) => {
      this.openGate = resolve;
    });
  }

  release(): void {
    this.openGate?.();
    this.gate = undefined;
    this.openGate = undefined;
  }

  /** The next `times` events are refused with an error. */
  failNext(times = 1): void {
    this.remainingFailures += times;
  }

  async emit(event: SecurityEvent): Promise<void> {
    await this.gate;
    if (this.remainingFailures > 0) {
      this.remainingFailures -= 1;
      throw new Error("The fake security event sink is down");
    }
    this.events.push(event);
  }
}
