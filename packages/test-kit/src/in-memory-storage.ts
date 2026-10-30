import type {
  Storage,
  StoredUserProfile,
  UsageEntry,
  UsageRange,
  UsageStore,
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

const compareText = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

class InMemoryUsageStore implements UsageStore {
  private readonly totals = new Map<UserId, Map<string, UsageEntry>>();

  async add(userId: UserId, entries: readonly UsageEntry[]): Promise<void> {
    const owned = this.totals.get(userId) ?? new Map<string, UsageEntry>();
    this.totals.set(userId, owned);
    for (const entry of entries) {
      const key = JSON.stringify([
        entry.day,
        entry.language,
        entry.purpose,
        entry.unit,
      ]);
      const previous = owned.get(key)?.quantity ?? 0;
      owned.set(key, { ...entry, quantity: previous + entry.quantity });
    }
  }

  async list(userId: UserId, range: UsageRange = {}): Promise<UsageEntry[]> {
    const { fromDay = "", toDay = "\uffff" } = range;
    return [...(this.totals.get(userId)?.values() ?? [])]
      .filter((entry) => entry.day >= fromDay && entry.day <= toDay)
      .sort(
        (a, b) =>
          compareText(a.day, b.day) ||
          compareText(a.language, b.language) ||
          compareText(a.purpose, b.purpose) ||
          compareText(a.unit, b.unit),
      )
      .map((entry) => ({ ...entry }));
  }
}

export class InMemoryStorage implements Storage {
  readonly profiles = new InMemoryUserProfileStore();
  readonly usage = new InMemoryUsageStore();

  async close(): Promise<void> {}
}
