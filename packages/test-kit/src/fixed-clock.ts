import type { Clock } from "@rin-language/core-server";

export class FixedClock implements Clock {
  private current: number;

  constructor(start: string | Date) {
    this.current = new Date(start).getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current += milliseconds;
  }
}
