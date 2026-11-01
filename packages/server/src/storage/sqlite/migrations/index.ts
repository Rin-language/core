import type { Migration } from "../migrations.js";
import { userProfilesMigration } from "./0001-user-profiles.js";
import { usageRecordsMigration } from "./0002-usage-records.js";

/** In order. Released migrations are never edited: append a new one. */
export const migrations: readonly Migration[] = [
  userProfilesMigration,
  usageRecordsMigration,
];
