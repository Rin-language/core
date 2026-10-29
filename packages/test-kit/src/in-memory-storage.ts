import type {
  Storage,
  StoredUserProfile,
  UserId,
  UserProfileStore,
} from "@rin-language/core-server";

class InMemoryUserProfileStore implements UserProfileStore {
  private readonly profiles = new Map<UserId, StoredUserProfile>();

  async get(userId: UserId): Promise<StoredUserProfile | null> {
    const profile = this.profiles.get(userId);
    return profile === undefined ? null : structuredClone(profile);
  }

  async save(userId: UserId, profile: StoredUserProfile): Promise<void> {
    this.profiles.set(userId, structuredClone(profile));
  }
}

export class InMemoryStorage implements Storage {
  readonly profiles = new InMemoryUserProfileStore();

  async close(): Promise<void> {}
}
