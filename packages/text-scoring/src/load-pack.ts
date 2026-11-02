import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { basename } from "node:path";
import { PackError } from "./errors.js";
import {
  type FrequencyPack,
  type ParsePackOptions,
  parseFrequencyPack,
} from "./frequency-pack.js";
import { parseScoringConfig, type ScoringConfig } from "./scoring-config.js";

const DEFAULT_MAX_PACK_BYTES = 64 * 1024 * 1024;
const MAX_CONFIG_BYTES = 1024 * 1024;

export interface LoadPackOptions extends ParsePackOptions {
  readonly maxBytes?: number;
}

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

function assertLimit(label: string, name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PackError(label, [`${name} must be a non-negative integer`]);
  }
}

/**
 * Opens the file once and checks the opened file, not the path: a device, a
 * pipe or a folder is refused (their size is 0, so a size cap would not stop
 * them) and a regular file that grows after the check is cut off at the cap.
 * Non-blocking open so a named pipe cannot hang the process.
 */
function readBounded(path: string, label: string, maxBytes: number): Buffer {
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  } catch (error) {
    // No cause is attached: it would quote the path.
    throw new PackError(label, [
      isMissingFile(error) ? "file not found" : "file not readable",
    ]);
  }
  try {
    const stats = fstatSync(descriptor);
    if (!stats.isFile()) throw new PackError(label, ["not a regular file"]);
    if (stats.size > maxBytes) throw new PackError(label, ["file too large"]);
    const buffer = Buffer.alloc(stats.size + 1);
    const bytesRead = readSync(descriptor, buffer, 0, buffer.length, 0);
    if (bytesRead === buffer.length) {
      throw new PackError(label, ["file too large"]);
    }
    return buffer.subarray(0, bytesRead);
  } catch (error) {
    if (error instanceof PackError) throw error;
    throw new PackError(label, ["file not readable"]);
  } finally {
    closeSync(descriptor);
  }
}

/** Reads a JSON file under a size cap. Problems never quote the content. */
export function readJsonFile(
  path: string,
  label: string,
  maxBytes: number,
): unknown {
  assertLimit(label, "maxBytes", maxBytes);
  const bytes = readBounded(path, label, maxBytes);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    // No cause is attached: a parse error quotes part of the file.
    throw new PackError(label, ["not valid JSON"]);
  }
}

export function loadFrequencyPack(
  path: string,
  options: LoadPackOptions = {},
): FrequencyPack {
  const label = basename(path);
  if (options.maxEntries !== undefined) {
    assertLimit(label, "maxEntries", options.maxEntries);
  }
  const raw = readJsonFile(
    path,
    label,
    options.maxBytes ?? DEFAULT_MAX_PACK_BYTES,
  );
  return parseFrequencyPack(raw, label, options);
}

export function loadScoringConfig(
  path: string,
  levels: readonly string[],
): ScoringConfig {
  const label = basename(path);
  return parseScoringConfig(
    readJsonFile(path, label, MAX_CONFIG_BYTES),
    label,
    levels,
  );
}
