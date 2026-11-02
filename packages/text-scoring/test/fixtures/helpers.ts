import { PackError } from "../../src/errors.js";

export type JsonObject = Record<string, unknown>;

export function asObject(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("expected a JSON object");
  }
  return Object.fromEntries(Object.entries(value));
}

/** Runs `run`, which must throw a PackError, and returns it. */
export function packErrorOf(run: () => unknown): PackError {
  try {
    run();
  } catch (error) {
    if (error instanceof PackError) return error;
    throw error;
  }
  throw new Error("expected a PackError");
}
