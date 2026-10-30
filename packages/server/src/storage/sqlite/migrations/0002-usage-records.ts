import type { Migration } from "../migrations.js";

export const usageRecordsMigration: Migration = {
  id: 2,
  name: "create usage_records",
  // Plain SQL types and no STRICT, so the same statement runs on another engine.
  // One row per user, language, purpose, day and unit: later limits sum rows.
  sql: `
    CREATE TABLE usage_records (
      user_id TEXT NOT NULL,
      language TEXT NOT NULL,
      purpose TEXT NOT NULL,
      day TEXT NOT NULL,
      unit TEXT NOT NULL,
      quantity BIGINT NOT NULL CHECK (quantity >= 0),
      PRIMARY KEY (user_id, language, purpose, day, unit)
    );
  `,
};
