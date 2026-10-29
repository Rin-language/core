import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ApiClient, ApiClientError } from "./api/api-client.js";
import { ErrorNotice } from "./components/error-notice.js";
import { ServerOverview } from "./components/server-overview.js";
import { UI_LANGUAGES, type UiLanguage } from "./i18n/resources.js";
import {
  loadServerOverview,
  type ServerOverviewData,
} from "./load-server-overview.js";

type LoadState =
  | { status: "loading" }
  | { status: "failed"; code: string }
  | { status: "ready"; data: ServerOverviewData };

export function App({ client }: { client: ApiClient }) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let isCurrent = true;
    loadServerOverview(client).then(
      (data) => isCurrent && setState({ status: "ready", data }),
      (error: unknown) =>
        isCurrent &&
        setState({
          status: "failed",
          code: error instanceof ApiClientError ? error.code : "unknown",
        }),
    );
    return () => {
      isCurrent = false;
    };
  }, [client]);

  return (
    <main>
      <h1>{t("app.title")}</h1>
      <label>
        {t("app.language")}
        <select
          value={i18n.language}
          onChange={(event) => {
            const chosen = UI_LANGUAGES.find((l) => l === event.target.value);
            if (chosen !== undefined)
              void i18n.changeLanguage(chosen satisfies UiLanguage);
          }}
        >
          {UI_LANGUAGES.map((language) => (
            <option key={language} value={language}>
              {language}
            </option>
          ))}
        </select>
      </label>
      {state.status === "loading" && <p>{t("loading")}</p>}
      {state.status === "failed" && <ErrorNotice code={state.code} />}
      {state.status === "ready" && <ServerOverview {...state.data} />}
    </main>
  );
}
