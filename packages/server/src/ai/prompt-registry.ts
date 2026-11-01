import { ConfigError } from "../config/config-error.js";
import type {
  PromptDefinition,
  PromptDefinitions,
} from "../config/prompt-definition.js";

export interface PromptReference {
  id: string;
  version: number;
}

export type PromptLookup =
  | { ok: true; prompt: PromptDefinition }
  | { ok: false; error: { kind: "unknown_prompt" | "version_mismatch" } };

export interface PromptRegistry {
  /** The caller names the version it was written for: another one is refused. */
  get(language: string, id: string, version: number): PromptLookup;
  /**
   * Startup check for the prompts the code needs. Throws, so a missing or
   * outdated prompt stops the server instead of failing a user's request.
   */
  assertAvailable(references: readonly PromptReference[]): void;
}

export function createPromptRegistry(
  languages: Readonly<Record<string, { prompts: PromptDefinitions }>>,
): PromptRegistry {
  const get = (language: string, id: string, version: number): PromptLookup => {
    // Own properties only: "constructor" is not a language nor a prompt.
    const profile = Object.hasOwn(languages, language)
      ? languages[language]
      : undefined;
    const prompt =
      profile !== undefined && Object.hasOwn(profile.prompts, id)
        ? profile.prompts[id]
        : undefined;
    if (prompt === undefined) {
      return { ok: false, error: { kind: "unknown_prompt" } };
    }
    if (prompt.version !== version) {
      return { ok: false, error: { kind: "version_mismatch" } };
    }
    return { ok: true, prompt };
  };

  return {
    get,
    assertAvailable(references) {
      const problems: string[] = [];
      for (const language of Object.keys(languages)) {
        for (const { id, version } of references) {
          const found = get(language, id, version);
          if (found.ok) continue;
          const state =
            found.error.kind === "unknown_prompt"
              ? "missing"
              : "at another version";
          problems.push(
            `language "${language}": prompt "${id}" version ${version} is ${state}`,
          );
        }
      }
      if (problems.length > 0) throw new ConfigError("prompts", problems);
    },
  };
}
