import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { createApiClient } from "./api/api-client.js";
import { App } from "./app.js";
import { createI18n } from "./i18n/create-i18n.js";
import { pickUiLanguage } from "./i18n/pick-ui-language.js";
import { DEFAULT_UI_LANGUAGE, UI_LANGUAGES } from "./i18n/resources.js";

const container = document.getElementById("root");
if (container === null) throw new Error("The page has no #root element");

const language = pickUiLanguage(
  navigator.languages,
  UI_LANGUAGES,
  DEFAULT_UI_LANGUAGE,
);
document.documentElement.lang = language;

createRoot(container).render(
  <StrictMode>
    <I18nextProvider i18n={createI18n(language)}>
      <App client={createApiClient()} />
    </I18nextProvider>
  </StrictMode>,
);
