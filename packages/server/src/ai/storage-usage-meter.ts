import { z } from "zod";
import { LANGUAGE_CODE, PROMPT_ID } from "../config/prompt-syntax.js";
import type { Clock } from "../ports/clock.js";
import type { UsageStore } from "../ports/storage.js";
import type { UsageMeter, UsageToRecord } from "../ports/usage-meter.js";

const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;

const UsageToRecordSchema = z.strictObject({
  language: z.string().regex(LANGUAGE_CODE),
  purpose: z.string().regex(PROMPT_ID),
  amounts: z.record(
    z.string().regex(SNAKE_CASE),
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ),
});

const dayOf = (date: Date): string => date.toISOString().slice(0, 10);

/** Keeps the usage in `Storage`, by UTC day of the injected clock. */
export function createStorageUsageMeter(
  store: UsageStore,
  clock: Clock,
): UsageMeter {
  return {
    async record(userId, usage: UsageToRecord) {
      // A malformed record is a bug in the caller: fail loudly, store nothing.
      const checked = UsageToRecordSchema.parse(usage);
      const day = dayOf(clock.now());
      const entries = Object.entries(checked.amounts)
        .filter(([, quantity]) => quantity > 0)
        .map(([unit, quantity]) => ({
          day,
          language: checked.language,
          purpose: checked.purpose,
          unit,
          quantity,
        }));
      await store.add(userId, entries);
    },
    read: (userId, range) => store.list(userId, range),
  };
}
