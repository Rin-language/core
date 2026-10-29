export interface LlmRequest {
  system: string;
  user: string;
  maxOutputTokens: number;
}

export interface LlmResponse {
  /** Untrusted: the caller validates it against a schema before using it. */
  text: string;
  usage: { inputTokens: number; outputTokens: number };
}

/** No tools, no access to data: text in, text out. */
export interface LLMProvider {
  generate(request: LlmRequest): Promise<LlmResponse>;
}
