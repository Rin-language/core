import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type AppConfig, parseAppConfig } from "./app-config.js";
import { ConfigError } from "./config-error.js";
import {
  type LanguageProfile,
  parseLanguageProfile,
} from "./language-profile.js";

export interface LoadedConfig {
  app: AppConfig;
  languages: Readonly<Record<string, LanguageProfile>>;
}

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

/** Reads a JSON file. Errors name the file, never its content. */
function readJsonFile(path: string, label: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    const reason = isMissingFile(error)
      ? "file not found"
      : "file not readable";
    throw new ConfigError(label, [reason], { cause: error });
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ConfigError(label, ["not valid JSON"], { cause: error });
  }
}

function readOptionalJsonFile(
  path: string,
  label: string,
): unknown | undefined {
  try {
    return readJsonFile(path, label);
  } catch (error) {
    if (
      error instanceof ConfigError &&
      error.cause !== undefined &&
      isMissingFile(error.cause)
    ) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Loads and validates `app.json`, then the profile of every enabled language.
 * Language codes are validated by `app.json` before they build a path.
 */
export function loadConfig(configDir: string): LoadedConfig {
  const app = parseAppConfig(
    readJsonFile(join(configDir, "app.json"), "app.json"),
  );
  const dataDir = resolve(configDir, app.dataDir);
  const languages: Record<string, LanguageProfile> = {};
  for (const code of app.languages) {
    languages[code] = parseLanguageProfile(
      {
        profile: readJsonFile(
          join(configDir, "languages", `${code}.json`),
          `languages/${code}.json`,
        ),
        errorTypes: readJsonFile(
          join(dataDir, "error-types", `${code}.json`),
          `error-types/${code}.json`,
        ),
        grammar: readOptionalJsonFile(
          join(dataDir, "grammar", `${code}.json`),
          `grammar/${code}.json`,
        ),
      },
      code,
    );
  }
  return { app, languages };
}
