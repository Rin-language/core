const OPENING_QUOTES = new Set(["「", "『"]);
const CLOSING_QUOTES = new Set(["」", "』"]);
const SENTENCE_ENDINGS = new Set(["。", "！", "？", "!", "?", "…"]);
const HAN_CHARACTER = /^\p{Script=Han}$/u;
const WHITESPACE = /^\s$/u;

export interface TextStructure {
  readonly sentences: readonly string[];
  /** Non-whitespace characters inside 「」 or 『』, the brackets excluded. */
  readonly dialogueCharacters: number;
  /** Non-whitespace characters of the whole text, brackets included. */
  readonly totalCharacters: number;
}

const isBracket = (character: string): boolean =>
  OPENING_QUOTES.has(character) || CLOSING_QUOTES.has(character);

function nextDepth(character: string, depth: number): number {
  if (OPENING_QUOTES.has(character)) return depth + 1;
  if (CLOSING_QUOTES.has(character)) return Math.max(0, depth - 1);
  return depth;
}

/**
 * One linear pass. A sentence ends at a terminator outside any quote or at a
 * newline; a newline also closes every open quote, so an unbalanced 「 spoils
 * its own paragraph only.
 */
export function analyzeText(text: string): TextStructure {
  const sentences: string[] = [];
  let current = "";
  let depth = 0;
  let dialogueCharacters = 0;
  let totalCharacters = 0;

  const endSentence = () => {
    sentences.push(current);
    current = "";
  };

  for (const character of text.replace(/\r\n?/g, "\n")) {
    if (character === "\n") {
      endSentence();
      depth = 0;
      continue;
    }
    current += character;
    if (WHITESPACE.test(character)) continue;
    totalCharacters += 1;
    if (depth > 0 && !isBracket(character)) dialogueCharacters += 1;
    depth = nextDepth(character, depth);
    if (depth === 0 && SENTENCE_ENDINGS.has(character)) endSentence();
  }
  endSentence();
  return {
    sentences: sentences.filter(hasContent),
    dialogueCharacters,
    totalCharacters,
  };
}

/** A sentence made only of terminators or quote marks carries no words. */
function hasContent(sentence: string): boolean {
  for (const character of sentence) {
    if (
      !WHITESPACE.test(character) &&
      !SENTENCE_ENDINGS.has(character) &&
      !OPENING_QUOTES.has(character) &&
      !CLOSING_QUOTES.has(character)
    ) {
      return true;
    }
  }
  return false;
}

export function extractKanji(text: string): readonly string[] {
  const seen = new Set<string>();
  for (const character of text) {
    if (HAN_CHARACTER.test(character)) seen.add(character);
  }
  return [...seen];
}

/** Cuts at most `maxChars` UTF-16 units per chunk, never inside a surrogate pair. */
export function splitIntoChunks(
  sentence: string,
  maxChars: number,
): readonly string[] {
  const chunks: string[] = [];
  let current = "";
  for (const character of sentence) {
    if (current.length + character.length > maxChars) {
      chunks.push(current);
      current = "";
    }
    current += character;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
