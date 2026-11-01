import type {
  LLMProvider,
  LlmRequest,
  LlmResponse,
} from "@rin-language/core-server";

type Usage = LlmResponse["usage"];

export interface ScriptedAnswerOptions {
  usage?: Usage;
  /** Waits this long, unless the request is aborted first. */
  delayMs?: number;
}

type Script =
  | { kind: "answer"; text: string; options: ScriptedAnswerOptions }
  | { kind: "failure"; error: Error }
  | { kind: "hang" };

const DEFAULT_USAGE: Usage = { inputTokens: 100, outputTokens: 50 };

/** Texts a validator must refuse, one for each way an answer can be wrong. */
export const MALFORMED_OUTPUTS = {
  noJson: "I am sorry, I cannot do that.",
  truncated: '{"score": 3, "note": "cut off',
  wrongType: '{"score": "three", "note": "ok"}',
  extraKey: '{"score": 3, "note": "ok", "isAdmin": true}',
  twoValues: '{"score": 1, "note": "a"} {"score": 2, "note": "b"}',
} as const;

const abortError = (signal: AbortSignal): unknown => signal.reason;

/** Resolves after `ms`, or rejects with the abort reason. */
function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal ? abortError(signal) : undefined);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Never settles by itself: only an abort ends it. */
function hang(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    signal?.addEventListener("abort", () => reject(abortError(signal)), {
      once: true,
    });
  });
}

/**
 * Answers with scripted texts, errors or silences, in order. Tests never
 * reach a real model.
 */
export class FakeLLMProvider implements LLMProvider {
  readonly calls: LlmRequest[] = [];
  private readonly scripts: Script[] = [];

  enqueue(text: string, options: ScriptedAnswerOptions = {}): void {
    this.scripts.push({ kind: "answer", text, options });
  }

  /** The next call fails with this error, as a provider outage would. */
  enqueueFailure(error: Error): void {
    this.scripts.push({ kind: "failure", error });
  }

  /** The next call never answers: it ends only when its signal aborts. */
  enqueueHang(): void {
    this.scripts.push({ kind: "hang" });
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    this.calls.push(request);
    const script = this.scripts.shift();
    if (script === undefined) {
      throw new Error("FakeLLMProvider: no scripted response left");
    }
    if (script.kind === "failure") throw script.error;
    if (script.kind === "hang") return hang(request.signal);
    const { delayMs, usage = DEFAULT_USAGE } = script.options;
    if (delayMs !== undefined) await wait(delayMs, request.signal);
    return { text: script.text, usage: { ...usage } };
  }
}
