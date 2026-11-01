import type { UserId } from "./identity.js";
import type { UsageEntry, UsageRange } from "./storage.js";

/** What one call used, by unit: `{ input_tokens: 120, calls: 1 }`. */
export interface UsageToRecord {
  language: string;
  /** What the amounts were spent on, for example a prompt id. */
  purpose: string;
  amounts: Readonly<Record<string, number>>;
}

/**
 * Counts what each user uses. It only measures and reads: nothing here
 * refuses a call, whatever the totals.
 */
export interface UsageMeter {
  record(userId: UserId, usage: UsageToRecord): Promise<void>;
  /** Only the given user's usage. */
  read(userId: UserId, range?: UsageRange): Promise<UsageEntry[]>;
}
