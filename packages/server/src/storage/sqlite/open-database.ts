import { closeSync, openSync } from "node:fs";
import Database from "better-sqlite3";

export const IN_MEMORY_DATABASE = ":memory:";

const OWNER_READ_WRITE_ONLY = 0o600;
const BUSY_TIMEOUT_MILLISECONDS = 5000;

/**
 * Opens the database with safe settings: foreign keys enforced, write-ahead
 * logging, and a new file readable by its owner only.
 */
export function openDatabase(path: string): Database.Database {
  const isFile = path !== IN_MEMORY_DATABASE;
  if (isFile) {
    // The mode only applies when the file is created; an existing file is left as is.
    closeSync(openSync(path, "a", OWNER_READ_WRITE_ONLY));
  }
  const database = new Database(path);
  database.pragma("foreign_keys = ON");
  database.pragma(`busy_timeout = ${BUSY_TIMEOUT_MILLISECONDS}`);
  if (isFile) database.pragma("journal_mode = WAL");
  return database;
}
