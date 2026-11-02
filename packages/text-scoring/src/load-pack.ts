import { readFileSync, statSync } from "node:fs";
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

/** Reads a JSON file under a size cap. Problems never quote the content. */
export function readJsonFile(
  path: string,
  label: string,
  maxBytes: number,
): unknown {
  let text: string;
  try {
    if (statSync(path).size > maxBytes) {
      throw new PackError(label, ["file too large"]);
    }
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error instanceof PackError) throw error;
    const reason = isMissingFile(error)
      ? "file not found"
      : "file not readable";
    throw new PackError(label, [reason], { cause: error });
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new PackError(label, ["not valid JSON"], { cause: error });
  }
}

export function loadFrequencyPack(
  path: string,
  options: LoadPackOptions = {},
): FrequencyPack {
  const label = path.split("/").pop() ?? path;
  const raw = readJsonFile(
    path,
    label,
    options.maxBytes ?? DEFAULT_MAX_PACK_BYTES,
  );
  return parseFrequencyPack(raw, label, options);
}

const labelOf = (path: string): string => path.split("/").pop() ?? path;

export function loadScoringConfig(
  path: string,
  levels: readonly string[],
): ScoringConfig {
  const label = labelOf(path);
  return parseScoringConfig(
    readJsonFile(path, label, MAX_CONFIG_BYTES),
    label,
    levels,
  );
}
