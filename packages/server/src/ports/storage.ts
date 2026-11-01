import type { UserProfile } from "@rin-language/contract";
import type { UserId } from "./identity.js";

/** `skillRatings` are computed by the server, so they are not stored here. */
export type StoredUserProfile = Omit<UserProfile, "skillRatings">;

/**
 * Every method takes the user: there is no way to read or write user data
 * without saying whose it is.
 */
export interface UserProfileStore {
  get(userId: UserId): Promise<StoredUserProfile | null>;
  /** Creates the profile or replaces the previous one. */
  save(userId: UserId, profile: StoredUserProfile): Promise<void>;
}

/**
 * An amount used by one user. `unit` is an open snake_case name
 * (`input_tokens`, `calls`, later perhaps seconds of audio), so counting a new
 * kind of resource needs no schema change.
 */
export interface UsageEntry {
  /** UTC date, `YYYY-MM-DD`: the window a later limit adds up over. */
  day: string;
  language: string;
  /** What the amount was spent on, for example a prompt id. */
  purpose: string;
  unit: string;
  /** A non-negative whole number. */
  quantity: number;
}

export interface UsageRange {
  /** Inclusive `YYYY-MM-DD`. */
  fromDay?: string;
  /** Inclusive `YYYY-MM-DD`. */
  toDay?: string;
}

export interface UsageStore {
  /**
   * Adds the quantities to what the user already used under the same day,
   * language, purpose and unit. All entries or none.
   */
  add(userId: UserId, entries: readonly UsageEntry[]): Promise<void>;
  /** Ordered by day, language, purpose, then unit. Only this user's rows. */
  list(userId: UserId, range?: UsageRange): Promise<UsageEntry[]>;
}

export interface Storage {
  readonly profiles: UserProfileStore;
  readonly usage: UsageStore;
  close(): Promise<void>;
}
