import type {
  LLMProvider,
  LlmRequest,
  LlmResponse,
} from "@rin-language/core-server";

/** Answers with scripted texts, in order. Tests never reach a real model. */
export class FakeLLMProvider implements LLMProvider {
  readonly calls: LlmRequest[] = [];
  private readonly scriptedTexts: string[] = [];

  enqueue(text: string): void {
    this.scriptedTexts.push(text);
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    this.calls.push(request);
    const text = this.scriptedTexts.shift();
    if (text === undefined) {
      throw new Error("FakeLLMProvider: no scripted response left");
    }
    return { text, usage: { inputTokens: 0, outputTokens: 0 } };
  }
}
