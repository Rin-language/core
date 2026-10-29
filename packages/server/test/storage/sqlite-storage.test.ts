import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  describeStorageConformance,
  FixedClock,
} from "@rin-language/core-test-kit";
import type Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { migrations } from "../../src/storage/sqlite/migrations/index.js";
import { runMigrations } from "../../src/storage/sqlite/migrations.js";
import { openDatabase } from "../../src/storage/sqlite/open-database.js";
import { createSqliteStorage } from "../../src/storage/sqlite/sqlite-storage.js";

const clock = new FixedClock("2026-10-29T10:00:00Z");

describeStorageConformance("SqliteStorage", () =>
  createSqliteStorage({ path: ":memory:", clock }),
);

const temporaryDirs: string[] = [];
const temporaryDatabasePath = () => {
  const dir = mkdtempSync(join(tmpdir(), "rin-db-"));
  temporaryDirs.push(dir);
  return join(dir, "rin.sqlite");
};

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const profile = {
  displayName: "Aiko",
  targetLanguage: "ja",
  uiLanguage: "fr",
  timezone: "Asia/Tokyo",
  declaredLevel: "N5",
};

describe("createSqliteStorage", () => {
  it("keeps the profiles after the database is reopened", async () => {
    const path = temporaryDatabasePath();
    const first = createSqliteStorage({ path, clock });
    await first.profiles.save("user-a", profile);
    await first.close();

    const second = createSqliteStorage({ path, clock });

    expect(await second.profiles.get("user-a")).toEqual(profile);
    await second.close();
  });

  it("treats a hostile user id as plain data", async () => {
    const storage = createSqliteStorage({ path: ":memory:", clock });
    const hostileId = "x'; DROP TABLE user_profiles; --";
    await storage.profiles.save(hostileId, profile);

    expect(await storage.profiles.get(hostileId)).toEqual(profile);
    await storage.close();
  });
});

describe("openDatabase", () => {
  it("creates a database file readable by its owner only", () => {
    const path = temporaryDatabasePath();
    openDatabase(path).close();

    expect(statSync(path).mode & 0o077).toBe(0);
  });

  it("uses write-ahead logging for a file database", () => {
    const database = openDatabase(temporaryDatabasePath());

    expect(database.pragma("journal_mode", { simple: true })).toBe("wal");
    database.close();
  });

  it("enforces foreign keys", () => {
    const database = openDatabase(":memory:");

    expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
    database.close();
  });
});

describe("schema rules", () => {
  const userDataTablesWithoutUserId = (database: Database.Database) =>
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'",
      )
      .all()
      .map((row) => (row as { name: string }).name)
      .filter((table) => {
        const columns = database.pragma(`table_info(${table})`) as {
          name: string;
        }[];
        return !columns.some((column) => column.name === "user_id");
      });

  it("gives every table of user data a user_id column", () => {
    const database = openDatabase(":memory:");
    runMigrations(database, migrations, clock);

    expect(userDataTablesWithoutUserId(database)).toEqual([]);
    database.close();
  });

  const parentAndChild = {
    id: 9000,
    name: "test only: composite foreign key",
    sql: `
      CREATE TABLE decks (
        user_id TEXT NOT NULL, id TEXT NOT NULL, language TEXT NOT NULL,
        PRIMARY KEY (user_id, id)
      ) STRICT;
      CREATE TABLE cards (
        user_id TEXT NOT NULL, id TEXT NOT NULL, deck_id TEXT NOT NULL,
        PRIMARY KEY (user_id, id),
        FOREIGN KEY (user_id, deck_id) REFERENCES decks (user_id, id)
      ) STRICT;
      INSERT INTO decks VALUES ('user-a', 'deck-1', 'ja');
    `,
  };

  const databaseWithDecks = () => {
    const database = openDatabase(":memory:");
    runMigrations(database, [...migrations, parentAndChild], clock);
    return database;
  };

  it("accepts a child row of the same user as its parent", () => {
    const database = databaseWithDecks();

    expect(() =>
      database
        .prepare("INSERT INTO cards VALUES ('user-a', 'card-1', 'deck-1')")
        .run(),
    ).not.toThrow();
    database.close();
  });

  it("refuses a child row that points to another user's parent", () => {
    const database = databaseWithDecks();

    expect(() =>
      database
        .prepare("INSERT INTO cards VALUES ('user-b', 'card-1', 'deck-1')")
        .run(),
    ).toThrow(/FOREIGN KEY/);
    database.close();
  });
});
