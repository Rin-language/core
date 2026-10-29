import { useTranslation } from "react-i18next";
import type { ServerOverviewData } from "../load-server-overview.js";

// React escapes every value it renders, so what the server sends stays text.
export function ServerOverview({
  health,
  limits,
  capabilities,
}: ServerOverviewData) {
  const { t } = useTranslation();
  const labelOf = (group: "skill" | "errorType", id: string) =>
    t(`${group}.${id}`, { defaultValue: id });

  return (
    <>
      <section>
        <h2>{t("overview.health")}</h2>
        <p>{health.status === "ok" ? t("overview.healthOk") : health.status}</p>
      </section>
      <section>
        <h2>{t("overview.limits")}</h2>
        <dl>
          <dt>{t("overview.maxTextLength")}</dt>
          <dd>{limits.maxTextLength}</dd>
          <dt>{t("overview.maxEdits")}</dt>
          <dd>{limits.maxEdits}</dd>
          <dt>{t("overview.maxExplanationLength")}</dt>
          <dd>{limits.maxExplanationLength}</dd>
        </dl>
      </section>
      <section>
        <h2>{t("overview.languages")}</h2>
        {capabilities.languages.map((language) => (
          <article key={language.code}>
            <h3>{language.code}</h3>
            <p>
              {t("overview.levels")}: {language.levels.join(", ")}
            </p>
            <p>
              {t("overview.skills")}:{" "}
              {language.skills.map((id) => labelOf("skill", id)).join(", ")}
            </p>
            <p>
              {t("overview.errorTypes")}:{" "}
              {language.errorTypes
                .map((id) => labelOf("errorType", id))
                .join(", ")}
            </p>
          </article>
        ))}
      </section>
    </>
  );
}
