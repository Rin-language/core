import type { Migration } from "../migrations.js";
import { userProfilesMigration } from "./0001-user-profiles.js";

/** In order. Released migrations are never edited: append a new one. */
export const migrations: readonly Migration[] = [userProfilesMigration];
