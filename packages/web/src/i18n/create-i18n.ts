import { createInstance, type i18n } from "i18next";
import { initReactI18next } from "react-i18next";
import { resources, type UiLanguage } from "./resources.js";

/** One instance per call: no hidden global, so tests and renders stay isolated. */
export function createI18n(language: UiLanguage): i18n {
  const instance = createInstance();
  instance.use(initReactI18next);
  // The resources are in memory, so init completes before it returns.
  void instance.init({
    lng: language,
    fallbackLng: false,
    resources: {
      en: { translation: resources.en },
      fr: { translation: resources.fr },
    },
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
}
