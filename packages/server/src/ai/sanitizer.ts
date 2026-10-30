export type WrapResult =
  | { ok: true; block: string }
  | { ok: false; error: { kind: "too_long" } };

const VARIABLE_NAME = /^[a-z][A-Za-z0-9]*$/;

const NEWLINE = 0x0a;
const TAB = 0x09;

/** Inclusive ranges of code points that never reach a prompt. */
const REMOVED_RANGES: ReadonlyArray<readonly [number, number]> = [
  // Control characters (the newline and the tab are kept).
  [0x00, 0x1f],
  [0x7f, 0x9f],
  // Zero-width and directional marks, line and paragraph separators,
  // directional embeddings and isolates, invisible operators: they hide
  // instructions from a human reader or reorder what the reader sees.
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x206f],
  [0xfeff, 0xfeff],
];

const isRemoved = (codePoint: number): boolean =>
  codePoint !== NEWLINE &&
  codePoint !== TAB &&
  REMOVED_RANGES.some(
    ([first, last]) => codePoint >= first && codePoint <= last,
  );

const withoutRemovedCharacters = (text: string): string =>
  Array.from(text)
    .filter((character) => !isRemoved(character.codePointAt(0) ?? 0))
    .join("");

/**
 * Turns text the server does not control (a user's writing, an excerpt, an
 * imported page) into a delimited block for a prompt. Every `&`, `<` and `>`
 * is escaped, so the text can neither close its block nor open another one.
 * Too long text is refused, never cut: a cut could drop the part that matters.
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
  const cleaned = withoutRemovedCharacters(text.normalize("NFC"))
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return {
    ok: true,
    block: `<untrusted name="${name}">\n${cleaned}\n</untrusted>`,
  };
}
