/** The first preferred language the interface is translated into, else the default. */
export function pickUiLanguage<Supported extends string>(
  preferred: readonly string[],
  supported: readonly Supported[],
  fallback: Supported,
): Supported {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0];
    const match = supported.find((language) => language === base);
    if (match !== undefined) return match;
  }
  return fallback;
}
