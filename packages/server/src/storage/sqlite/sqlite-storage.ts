import type Database from "better-sqlite3";
import { z } from "zod";
import type { Clock } from "../../ports/clock.js";
import type { UserId } from "../../ports/identity.js";
import type {
  Storage,
  StoredUserProfile,
  UsageEntry,
  UsageRange,
  UsageStore,
  UserProfileStore,
} from "../../ports/storage.js";
import { migrations } from "./migrations/index.js";
import { runMigrations } from "./migrations.js";
import { openDatabase } from "./open-database.js";

const ProfileRow = z
  .object({
    display_name: z.string(),
    target_language: z.string(),
    ui_language: z.string(),
    timezone: z.string(),
    declared_level: z.string(),
  })
  .transform(
    (row): StoredUserProfile => ({
      displayName: row.display_name,
      targetLanguage: row.target_language,
      uiLanguage: row.ui_language,
      timezone: row.timezone,
      declaredLevel: row.declared_level,
    }),
  );

class SqliteUserProfileStore implements UserProfileStore {
  private readonly selectProfile: Database.Statement;
  private readonly upsertProfile: Database.Statement;

  constructor(database: Database.Database) {
    this.selectProfile = database.prepare(
      `SELECT display_name, target_language, ui_language, timezone, declared_level
         FROM user_profiles WHERE user_id = ?`,
    );
    this.upsertProfile = database.prepare(
      `INSERT INTO user_profiles
         (user_id, display_name, target_language, ui_language, timezone, declared_level)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         display_name = excluded.display_name,
         target_language = excluded.target_language,
         ui_language = excluded.ui_language,
         timezone = excluded.timezone,
         declared_level = excluded.declared_level`,
    );
  }

  async get(userId: UserId): Promise<StoredUserProfile | null> {
    const row = this.selectProfile.get(userId);
    return row === undefined ? null : ProfileRow.parse(row);
  }

  async save(userId: UserId, profile: StoredUserProfile): Promise<void> {
    this.upsertProfile.run(
      userId,
      profile.displayName,
      profile.targetLanguage,
      profile.uiLanguage,
      profile.timezone,
      profile.declaredLevel,
    );
  }
}

const UsageRow = z.object({
  day: z.string(),
  language: z.string(),
  purpose: z.string(),
  unit: z.string(),
  quantity: z.number().int().nonnegative(),
});

// Sorting the days as text is right because they are ISO dates.
const FIRST_DAY = "0000-00-00";
const LAST_DAY = "9999-99-99";

class SqliteUsageStore implements UsageStore {
  private readonly insertUsage: Database.Statement;
  private readonly selectUsage: Database.Statement;
  private readonly addAll: (
    userId: UserId,
    entries: readonly UsageEntry[],
  ) => void;

  constructor(database: Database.Database) {
    this.insertUsage = database.prepare(
      `INSERT INTO usage_records (user_id, language, purpose, day, unit, quantity)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, language, purpose, day, unit) DO UPDATE SET
         quantity = usage_records.quantity + excluded.quantity`,
    );
    this.selectUsage = database.prepare(
      `SELECT day, language, purpose, unit, quantity FROM usage_records
         WHERE user_id = ? AND day >= ? AND day <= ?
         ORDER BY day, language, purpose, unit`,
    );
    this.addAll = database.transaction(
      (userId: UserId, entries: readonly UsageEntry[]) => {
        for (const entry of entries) {
          this.insertUsage.run(
            userId,
            entry.language,
            entry.purpose,
            entry.day,
            entry.unit,
            entry.quantity,
          );
        }
      },
    );
  }

  async add(userId: UserId, entries: readonly UsageEntry[]): Promise<void> {
    this.addAll(userId, entries);
  }

  async list(userId: UserId, range: UsageRange = {}): Promise<UsageEntry[]> {
    const rows = this.selectUsage.all(
      userId,
      range.fromDay ?? FIRST_DAY,
      range.toDay ?? LAST_DAY,
    );
    return rows.map((row) => UsageRow.parse(row));
  }
}

export interface SqliteStorageOptions {
  path: string;
  clock: Clock;
}

export function createSqliteStorage({
  path,
  clock,
}: SqliteStorageOptions): Storage {
  const database = openDatabase(path);
  try {
    runMigrations(database, migrations, clock);
  } catch (error) {
    database.close();
    throw error;
  }
  return {
    profiles: new SqliteUserProfileStore(database),
    usage: new SqliteUsageStore(database),
    async close() {
      database.close();
    },
  };
}
