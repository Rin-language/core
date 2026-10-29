import type Database from "better-sqlite3";
import { z } from "zod";
import type { Clock } from "../../ports/clock.js";
import type { UserId } from "../../ports/identity.js";
import type {
  Storage,
  StoredUserProfile,
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
    async close() {
      database.close();
    },
  };
}
