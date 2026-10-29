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

export interface Storage {
  readonly profiles: UserProfileStore;
  close(): Promise<void>;
}
