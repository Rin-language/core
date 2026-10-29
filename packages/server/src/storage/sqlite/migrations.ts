import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import type { Clock } from "../../ports/clock.js";

export interface Migration {
  /** Strictly increasing across the list. Never reused. */
  id: number;
  name: string;
  /** Never edited once released: change the schema with a new migration. */
  sql: string;
}

export class MigrationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MigrationError";
  }
}

const AppliedMigrations = z.array(
  z.object({ id: z.number().int(), checksum: z.string() }),
);

const checksumOf = (migration: Migration): string =>
  createHash("sha256").update(migration.sql).digest("hex");

function assertStrictlyIncreasing(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    const previous = migrations[index - 1];
    if (previous !== undefined && migration.id <= previous.id) {
      throw new MigrationError(
        `migration ${migration.id} is duplicated or out of order`,
      );
    }
  });
}

function assertAppliedMigrationsAreUnchanged(
  applied: z.output<typeof AppliedMigrations>,
  migrations: readonly Migration[],
): void {
  for (const row of applied) {
    const migration = migrations.find(({ id }) => id === row.id);
    if (migration === undefined) {
      throw new MigrationError(
        `the database applied migration ${row.id}, which this version does not know: refusing to run on a newer database`,
      );
    }
    if (checksumOf(migration) !== row.checksum) {
      throw new MigrationError(
        `migration ${row.id} (${migration.name}) was modified after being applied: add a new migration instead`,
      );
    }
  }
}

/** Applies the pending migrations, each in its own transaction. */
export function runMigrations(
  database: Database.Database,
  migrations: readonly Migration[],
  clock: Clock,
): void {
  assertStrictlyIncreasing(migrations);
  database.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id INTEGER PRIMARY KEY,
       name TEXT NOT NULL,
       checksum TEXT NOT NULL,
       applied_at TEXT NOT NULL
     ) STRICT`,
  );
  const applied = AppliedMigrations.parse(
    database.prepare("SELECT id, checksum FROM schema_migrations").all(),
  );
  assertAppliedMigrationsAreUnchanged(applied, migrations);

  const appliedIds = new Set(applied.map(({ id }) => id));
  const record = database.prepare(
    "INSERT INTO schema_migrations (id, name, checksum, applied_at) VALUES (?, ?, ?, ?)",
  );
  for (const migration of migrations) {
    if (appliedIds.has(migration.id)) continue;
    try {
      database.transaction(() => {
        database.exec(migration.sql);
        record.run(
          migration.id,
          migration.name,
          checksumOf(migration),
          clock.now().toISOString(),
        );
      })();
    } catch (error) {
      throw new MigrationError(
        `migration ${migration.id} (${migration.name}) failed`,
        { cause: error },
      );
    }
  }
}
