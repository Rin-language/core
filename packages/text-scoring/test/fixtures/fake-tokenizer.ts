import type { Token, Tokenizer } from "../../src/types.js";

export interface FakeEntry {
  readonly lemma: string;
  readonly partOfSpeech: readonly string[];
}

const PUNCTUATION = new Set(["。", "、", "！", "？", "「", "」", "『", "』"]);

/**
 * Greedy longest match over a small lexicon. Punctuation becomes 補助記号, any
 * other unknown character a one-character noun. Records every input it gets.
 */
export class FakeTokenizer implements Tokenizer {
  readonly calls: string[] = [];
  private readonly longest: number;

  constructor(private readonly lexicon: ReadonlyMap<string, FakeEntry>) {
    this.longest = Math.max(1, ...[...lexicon.keys()].map((s) => s.length));
  }

  tokenize(text: string): readonly Token[] {
    this.calls.push(text);
    const tokens: Token[] = [];
    let position = 0;
    while (position < text.length) {
      const token = this.matchAt(text, position);
      tokens.push(token);
      position += token.surface.length;
    }
    return tokens;
  }

  private matchAt(text: string, position: number): Token {
    for (let length = this.longest; length >= 1; length -= 1) {
      const surface = text.slice(position, position + length);
      const entry = this.lexicon.get(surface);
      if (entry !== undefined && surface.length === length) {
        return { surface, ...entry };
      }
    }
    const surface = String.fromCodePoint(text.codePointAt(position) ?? 0);
    return {
      surface,
      lemma: surface,
      partOfSpeech: PUNCTUATION.has(surface) ? ["補助記号"] : ["名詞"],
    };
  }
}

const noun = (lemma: string): FakeEntry => ({ lemma, partOfSpeech: ["名詞"] });

export const JAPANESE_LEXICON: ReadonlyMap<string, FakeEntry> = new Map([
  ["私", noun("私")],
  ["映画", noun("映画")],
  ["憂鬱", noun("憂鬱")],
  ["蹉跌", noun("蹉跌")],
  ["は", { lemma: "は", partOfSpeech: ["助詞"] }],
  ["を", { lemma: "を", partOfSpeech: ["助詞"] }],
  ["行き", { lemma: "行く", partOfSpeech: ["動詞"] }],
  ["ます", { lemma: "ます", partOfSpeech: ["助動詞"] }],
]);
