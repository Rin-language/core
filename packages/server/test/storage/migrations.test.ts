import { FixedClock } from "@rin-language/core-test-kit";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type Migration,
  MigrationError,
  runMigrations,
} from "../../src/storage/sqlite/migrations.js";

const createTable: Migration = {
  id: 1,
  name: "create things",
  sql: "CREATE TABLE things (id TEXT PRIMARY KEY) STRICT;",
};
const addTable: Migration = {
  id: 2,
  name: "create others",
  sql: "CREATE TABLE others (id TEXT PRIMARY KEY) STRICT;",
};

const clock = new FixedClock("2026-10-29T10:00:00Z");
let database: Database.Database;

beforeEach(() => {
  database = new Database(":memory:");
});
afterEach(() => {
  database.close();
});

const appliedIds = () =>
  database
    .prepare("SELECT id FROM schema_migrations ORDER BY id")
    .all()
    .map((row) => (row as { id: number }).id);

describe("runMigrations", () => {
  it("applies the migrations in order and records them", () => {
    runMigrations(database, [createTable, addTable], clock);

    expect(appliedIds()).toEqual([1, 2]);
  });

  it("records when a migration was applied", () => {
    runMigrations(database, [createTable], clock);

    const row = database
      .prepare("SELECT applied_at FROM schema_migrations")
      .get();
    expect(row).toEqual({ applied_at: "2026-10-29T10:00:00.000Z" });
  });

  it("does not apply a migration twice", () => {
    runMigrations(database, [createTable], clock);

    expect(() => runMigrations(database, [createTable], clock)).not.toThrow();
  });

  it("applies only the new migrations on a later run", () => {
    runMigrations(database, [createTable], clock);
    runMigrations(database, [createTable, addTable], clock);

    expect(appliedIds()).toEqual([1, 2]);
  });

  it("refuses a migration modified after it was applied", () => {
    runMigrations(database, [createTable], clock);
    const modified = { ...createTable, sql: `${createTable.sql} -- edited` };

    expect(() => runMigrations(database, [modified], clock)).toThrow(
      MigrationError,
    );
  });

  it("refuses a database that is ahead of this version of the code", () => {
    runMigrations(database, [createTable, addTable], clock);

    expect(() => runMigrations(database, [createTable], clock)).toThrow(
      MigrationError,
    );
  });

  it("keeps nothing of a migration that fails", () => {
    const broken: Migration = {
      id: 2,
      name: "broken",
      sql: "CREATE TABLE half_done (id TEXT) STRICT; SELECT * FROM missing_table;",
    };
    runMigrations(database, [createTable], clock);

    expect(() =>
      runMigrations(database, [createTable, broken], clock),
    ).toThrow();
    const leftover = database
      .prepare("SELECT name FROM sqlite_master WHERE name = 'half_done'")
      .get();
    expect(leftover).toBeUndefined();
  });

  it("does not record a migration that fails", () => {
    const broken: Migration = { id: 1, name: "broken", sql: "NOT SQL" };

    expect(() => runMigrations(database, [broken], clock)).toThrow();
    expect(appliedIds()).toEqual([]);
  });

  it.each([
    ["duplicate ids", [createTable, createTable]],
    ["ids out of order", [addTable, createTable]],
  ])("refuses migrations with %s", (_label, migrations) => {
    expect(() => runMigrations(database, migrations, clock)).toThrow(
      MigrationError,
    );
  });
});
