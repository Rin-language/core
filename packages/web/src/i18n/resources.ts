import en from "./locales/en.json";
import fr from "./locales/fr.json";

// Display labels live in the locale files, by id. The server sends ids only,
// and a self-hoster can add some the client has no label for: the interface
// shows the id then. Typing fr as en makes a missing or extra key a build error.
const frTranslations: typeof en = fr;

export const resources = { en, fr: frTranslations };
export const UI_LANGUAGES = ["en", "fr"] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];
export const DEFAULT_UI_LANGUAGE: UiLanguage = "en";
