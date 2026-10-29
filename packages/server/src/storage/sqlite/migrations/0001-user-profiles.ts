import type { Migration } from "../migrations.js";

export const userProfilesMigration: Migration = {
  id: 1,
  name: "create user_profiles",
  // One profile per user: the learned language is a field, not part of the key.
  sql: `
    CREATE TABLE user_profiles (
      user_id TEXT NOT NULL PRIMARY KEY,
      display_name TEXT NOT NULL,
      target_language TEXT NOT NULL,
      ui_language TEXT NOT NULL,
      timezone TEXT NOT NULL,
      declared_level TEXT NOT NULL
    ) STRICT;
  `,
};
