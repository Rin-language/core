import { describe, expect, it } from "vitest";
import { createI18n } from "../src/i18n/create-i18n.js";
import { pickUiLanguage } from "../src/i18n/pick-ui-language.js";
import { resources } from "../src/i18n/resources.js";

const keysOf = (value: unknown, prefix = ""): string[] =>
  typeof value === "object" && value !== null
    ? Object.entries(value).flatMap(([key, child]) =>
        keysOf(child, `${prefix}${key}.`),
      )
    : [prefix.slice(0, -1)];

describe("translations", () => {
  it("define the same keys in every language", () => {
    expect(keysOf(resources.fr).sort()).toEqual(keysOf(resources.en).sort());
  });

  it("have no empty text", () => {
    const empty = [resources.en, resources.fr].flatMap((language) =>
      JSON.stringify(language).includes('""') ? ["empty"] : [],
    );

    expect(empty).toEqual([]);
  });

  it("translate in the requested language", () => {
    expect(createI18n("fr").t("app.title")).toBe(resources.fr.app.title);
  });

  it("show the key's own text rather than the key when a label is unknown", () => {
    const i18n = createI18n("en");

    expect(
      i18n.t("errorType.never_heard_of_it", {
        defaultValue: "never_heard_of_it",
      }),
    ).toBe("never_heard_of_it");
  });
});

describe("pickUiLanguage", () => {
  const supported = ["en", "fr"] as const;

  it("takes the first preferred language that is supported", () => {
    expect(pickUiLanguage(["de-DE", "fr-CA", "en"], supported, "en")).toBe(
      "fr",
    );
  });

  it("matches a regional tag on its base language", () => {
    expect(pickUiLanguage(["en-GB"], supported, "fr")).toBe("en");
  });

  it("falls back to the default language", () => {
    expect(pickUiLanguage(["ja", "de"], supported, "en")).toBe("en");
  });

  it("falls back to the default language without any preference", () => {
    expect(pickUiLanguage([], supported, "en")).toBe("en");
  });
});
