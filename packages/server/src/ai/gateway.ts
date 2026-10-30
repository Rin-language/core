import type { z } from "zod";
import type { AppConfig } from "../config/app-config.js";
import type { PromptDefinition } from "../config/prompt-definition.js";
import type { Logger } from "../observability/logger.js";
import type { Clock } from "../ports/clock.js";
import type { UserId } from "../ports/identity.js";
import type { LLMProvider, LlmResponse } from "../ports/llm-provider.js";
import type { AiCallEvent, AiCallStatus } from "../ports/security-events.js";
import type { UsageMeter } from "../ports/usage-meter.js";
import { type OutputError, parseModelOutput } from "./output-extractor.js";
import type { PromptRegistry } from "./prompt-registry.js";
import { wrapUntrusted } from "./sanitizer.js";

export type AiSettings = AppConfig["ai"];

/** What a feature asks for: domain data and a prompt it names, never a prompt. */
export interface AiRequest<T> {
  /** One user per call: a prompt never holds data of two users. */
  userId: UserId;
  language: string;
  promptId: string;
  promptVersion: number;
  /** One value for each variable the prompt declares, no more, no less. */
  variables: Readonly<Record<string, string>>;
  outputSchema: z.ZodType<T>;
  /** Checks what the schema cannot, such as positions against the original. */
  refine?: (value: T) => string[];
}

export type AiErrorKind =
  | "unknown_prompt"
  | "version_mismatch"
  | "invalid_variables"
  | "input_too_large"
  | "provider_error"
  | "timeout"
  | "invalid_output";

export type AiResult<T> =
  | { ok: true; value: T; attempts: number }
  /** `output` says why an answer was refused, never what it said. */
  | { ok: false; error: { kind: AiErrorKind; output?: OutputError } };

export interface AiGateway {
  run<T>(request: AiRequest<T>): Promise<AiResult<T>>;
}

export interface AiGatewayOptions {
  provider: LLMProvider;
  registry: PromptRegistry;
  usageMeter: UsageMeter;
  clock: Clock;
  logger: Logger;
  settings: AiSettings;
  /** Receives one metadata-only event per call. Must not block. */
  publishEvent?: (event: AiCallEvent) => void;
}

const PLACEHOLDER = /\{\{([a-z][A-Za-z0-9]*)\}\}/g;

const codePointCount = (text: string): number => Array.from(text).length;

const errorName = (error: unknown): string =>
  error instanceof Error ? error.name : "unknown";

/** A provider's figure is untrusted too: anything odd counts as zero. */
const asAmount = (value: number): number =>
  Number.isSafeInteger(value) && value >= 0 ? value : 0;

class DeadlineExceeded extends Error {}

/** Rejects when the signal aborts, even if the promise never settles. */
function beforeDeadline<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DeadlineExceeded());
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
}

type PromptText =
  | { ok: true; system: string; user: string }
  | { ok: false; kind: "invalid_variables" | "input_too_large" };

function buildPrompt(
  prompt: PromptDefinition,
  variables: Readonly<Record<string, string>>,
  maxInputChars: number,
): PromptText {
  const declared = Object.keys(prompt.variables);
  const given = Object.keys(variables);
  if (
    declared.length !== given.length ||
    !declared.every((name) => Object.hasOwn(variables, name))
  ) {
    return { ok: false, kind: "invalid_variables" };
  }
  const filled = new Map<string, string>();
  let total = 0;
  for (const [name, definition] of Object.entries(prompt.variables)) {
    const value = variables[name] ?? "";
    const length = codePointCount(value);
    total += length;
    if (length > definition.maxLength) {
      return { ok: false, kind: "input_too_large" };
    }
    if (definition.kind === "trusted") {
      filled.set(name, value);
      continue;
    }
    const wrapped = wrapUntrusted(name, value, definition.maxLength);
    if (!wrapped.ok) return { ok: false, kind: "input_too_large" };
    filled.set(name, wrapped.block);
  }
  if (total > maxInputChars) return { ok: false, kind: "input_too_large" };
  // A replacer function, so `$&` in a value is text, not a pattern; one pass,
  // so a value that looks like a placeholder is never expanded.
  const user = prompt.user.replace(
    PLACEHOLDER,
    (_match, name: string) => filled.get(name) ?? "",
  );
  return { ok: true, system: prompt.system, user };
}

export function createAiGateway(options: AiGatewayOptions): AiGateway {
  const { provider, registry, usageMeter, clock, logger, settings } = options;

  async function recordUsage(
    userId: UserId,
    request: { language: string; promptId: string },
    usage: LlmResponse["usage"] | undefined,
  ): Promise<void> {
    try {
      await usageMeter.record(userId, {
        language: request.language,
        purpose: request.promptId,
        amounts: {
          calls: 1,
          input_tokens: asAmount(usage?.inputTokens ?? 0),
          output_tokens: asAmount(usage?.outputTokens ?? 0),
        },
      });
    } catch (error) {
      // Measuring must not take a user's result away. The message is left out:
      // a database error can quote the row.
      logger.error(
        { promptId: request.promptId, errorName: errorName(error) },
        "usage could not be recorded",
      );
    }
  }

  return {
    async run<T>(request: AiRequest<T>): Promise<AiResult<T>> {
      const startedAt = clock.now();
      let attempts = 0;
      let inputTokens = 0;
      let outputTokens = 0;

      const finish = (
        status: AiCallStatus,
        result: AiResult<T>,
      ): AiResult<T> => {
        const endedAt = clock.now();
        options.publishEvent?.({
          type: "ai_call",
          occurredAt: endedAt.toISOString(),
          userId: request.userId,
          language: request.language,
          promptId: request.promptId,
          promptVersion: request.promptVersion,
          status,
          attempts,
          durationMs: endedAt.getTime() - startedAt.getTime(),
          inputTokens,
          outputTokens,
        });
        return result;
      };
      const rejected = (kind: AiErrorKind): AiResult<T> =>
        finish("input_rejected", { ok: false, error: { kind } });

      const found = registry.get(
        request.language,
        request.promptId,
        request.promptVersion,
      );
      if (!found.ok) return rejected(found.error.kind);
      const built = buildPrompt(
        found.prompt,
        request.variables,
        settings.maxInputChars,
      );
      if (!built.ok) return rejected(built.kind);

      const maxOutputTokens = Math.min(
        found.prompt.maxOutputTokens ?? settings.maxOutputTokens,
        settings.maxOutputTokens,
      );
      // One deadline for all attempts: retries cannot stretch the wait.
      const deadline = AbortSignal.timeout(settings.timeoutMs);
      let lastOutputError: OutputError | undefined;
      let lastStatus: AiCallStatus = "provider_error";

      while (attempts < settings.maxAttempts && !deadline.aborted) {
        attempts += 1;
        let answer: LlmResponse;
        try {
          answer = await beforeDeadline(
            provider.generate({
              system: built.system,
              user: built.user,
              maxOutputTokens,
              signal: deadline,
            }),
            deadline,
          );
        } catch (error) {
          await recordUsage(request.userId, request, undefined);
          if (deadline.aborted) {
            return finish("timeout", { ok: false, error: { kind: "timeout" } });
          }
          lastStatus = "provider_error";
          logger.warn(
            {
              promptId: request.promptId,
              attempt: attempts,
              errorName: errorName(error),
            },
            "the model provider failed",
          );
          continue;
        }
        inputTokens += asAmount(answer.usage.inputTokens);
        outputTokens += asAmount(answer.usage.outputTokens);
        await recordUsage(request.userId, request, answer.usage);

        const parsed = parseModelOutput(answer.text, request.outputSchema, {
          maxChars: settings.maxOutputChars,
          ...(request.refine === undefined ? {} : { refine: request.refine }),
        });
        if (parsed.ok) {
          return finish("ok", { ok: true, value: parsed.value, attempts });
        }
        lastStatus = "invalid_output";
        lastOutputError = parsed.error;
      }

      if (deadline.aborted && lastStatus !== "invalid_output") {
        return finish("timeout", { ok: false, error: { kind: "timeout" } });
      }
      return finish(
        lastStatus,
        lastStatus === "invalid_output" && lastOutputError !== undefined
          ? {
              ok: false,
              error: { kind: "invalid_output", output: lastOutputError },
            }
          : { ok: false, error: { kind: "provider_error" } },
      );
    },
  };
}
