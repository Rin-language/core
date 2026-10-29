import { useTranslation } from "react-i18next";

export function ErrorNotice({ code }: { code: string }) {
  const { t } = useTranslation();
  return (
    <p role="alert">
      {t(`error.${code}`, { defaultValue: t("error.unknown") })}
    </p>
  );
}
