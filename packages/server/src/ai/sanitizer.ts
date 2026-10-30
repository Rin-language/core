import { UNTRUSTED_TAG, VARIABLE_NAME } from "../config/prompt-syntax.js";

export type WrapResult =
  | { ok: true; block: string }
  | { ok: false; error: { kind: "too_long" } };

const NEWLINE = 0x0a;
const TAB = 0x09;
const ASCII_LIMIT = 0x7f;

/** Inclusive ranges of code points that never reach a prompt. */
const HIDDEN_RANGES: ReadonlyArray<readonly [number, number]> = [
  // Control characters.
  [0x00, 0x1f],
  [0x7f, 0x9f],
  // Soft hyphen, combining grapheme joiner, Arabic letter mark.
  [0xad, 0xad],
  [0x34f, 0x34f],
  [0x61c, 0x61c],
  // Mongolian variation selectors and vowel separator.
  [0x180b, 0x180f],
  // Zero-width and directional marks, line and paragraph separators,
  // directional embeddings and isolates, invisible operators.
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x206f],
  // Hangul filler, byte order mark, interlinear annotation marks.
  [0x3164, 0x3164],
  [0xfeff, 0xfeff],
  [0xffa0, 0xffa0],
  [0xfff9, 0xfffb],
  // Tag characters: invisible ASCII that some models read as text.
  [0xe0000, 0xe007f],
];

// Variation selectors (U+FE00 to FE0F, U+E0100 to E01EF) are kept: Japanese
// writes rare kanji forms with them, and they carry only a glyph choice.

const isHidden = (codePoint: number): boolean =>
  HIDDEN_RANGES.some(
    ([first, last]) => codePoint >= first && codePoint <= last,
  );

const isRemoved = (codePoint: number): boolean =>
  codePoint !== NEWLINE && codePoint !== TAB && isHidden(codePoint);

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

const DELIMITER_CHARACTER = /[&<>]/;

/** True for a non-ASCII character that Unicode folding turns into `&`, `<` or `>`. */
const isLookAlikeDelimiter = (character: string, codePoint: number): boolean =>
  codePoint > ASCII_LIMIT &&
  DELIMITER_CHARACTER.test(character.normalize("NFKC"));

const escapeCharacter = (character: string): string => {
  const codePoint = character.codePointAt(0) ?? 0;
  const escaped = ESCAPES[character];
  if (escaped !== undefined) return escaped;
  if (isLookAlikeDelimiter(character, codePoint)) {
    return `&#x${codePoint.toString(16).toUpperCase()};`;
  }
  return character;
};

/**
 * A value the server chose, such as a level: no markup, no look-alike of
 * markup, no hidden character, no line break. The gateway refuses any other
 * `trusted` value, so "trusted" means checked and not only declared.
 */
export function isPlainTrustedText(text: string): boolean {
  return Array.from(text).every((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (
      !isHidden(codePoint) &&
      !DELIMITER_CHARACTER.test(character) &&
      !isLookAlikeDelimiter(character, codePoint)
    );
  });
}

/**
 * Turns text the server does not control (a user's writing, an excerpt, an
 * imported page) into a delimited block for a prompt. Every `&`, `<` and `>`,
 * and every look-alike a folding model could read as one, is escaped, so the
 * text can neither close its block nor open another one. Too long text is
 * refused, never cut: a cut could drop the part that matters.
 */
export function wrapUntrusted(
  name: string,
  text: string,
  maxLength: number,
): WrapResult {
  if (!VARIABLE_NAME.test(name)) {
    throw new Error("A variable name is lowerCamelCase letters and digits");
  }
  // Measured before cleaning: padding with invisible characters buys nothing.
  if (Array.from(text).length > maxLength) {
    return { ok: false, error: { kind: "too_long" } };
  }
  const cleaned = Array.from(text.normalize("NFC"))
    .filter((character) => !isRemoved(character.codePointAt(0) ?? 0))
    .map(escapeCharacter)
    .join("");
  return {
    ok: true,
    block: `<${UNTRUSTED_TAG} name="${name}">\n${cleaned}\n</${UNTRUSTED_TAG}>`,
  };
}
