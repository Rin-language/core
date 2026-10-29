import { createElement, type FunctionComponent } from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { ErrorNotice } from "../src/components/error-notice.js";
import { ServerOverview } from "../src/components/server-overview.js";
import { createI18n } from "../src/i18n/create-i18n.js";
import { resources } from "../src/i18n/resources.js";
import { loadServerOverview } from "../src/load-server-overview.js";

const overview = {
  health: { status: "ok" as const },
  limits: { maxTextLength: 2000, maxEdits: 100, maxExplanationLength: 500 },
  capabilities: {
    languages: [
      {
        code: "ja",
        errorTypes: ["particles", "made_up_by_a_self_hoster"],
        levels: ["N5", "N4"],
        skills: ["reading", "writing"],
      },
    ],
  },
};

const render = <Props extends object>(
  language: "en" | "fr",
  component: FunctionComponent<Props>,
  props: Props,
) =>
  renderToString(
    createElement(
      I18nextProvider,
      { i18n: createI18n(language) },
      createElement(component, props),
    ),
  );

describe("ServerOverview", () => {
  it("shows the limits the server announces", () => {
    const html = render("en", ServerOverview, overview);

    expect(html).toMatch(/2000/);
  });

  it("shows the levels of each language", () => {
    const html = render("en", ServerOverview, overview);

    expect([html.includes("N5"), html.includes("N4")]).toEqual([true, true]);
  });

  it("translates skills and known error types", () => {
    const html = render("fr", ServerOverview, overview);

    expect([
      html.includes(resources.fr.skill.reading),
      html.includes(resources.fr.errorType.particles),
    ]).toEqual([true, true]);
  });

  it("shows an error type it has no label for by its id", () => {
    const html = render("en", ServerOverview, overview);

    expect(html).toContain("made_up_by_a_self_hoster");
  });

  it("is written in the chosen interface language", () => {
    const html = render("fr", ServerOverview, overview);

    expect(html).toContain(resources.fr.overview.limits);
  });

  it("escapes what the server sends", () => {
    const hostile = {
      ...overview,
      capabilities: {
        languages: [
          {
            code: "<img src=x>",
            errorTypes: ["other"],
            levels: ["N5"],
            skills: ["reading"],
          },
        ],
      },
    };

    const html = render("en", ServerOverview, hostile);

    expect(html).not.toContain("<img src=x>");
  });
});

describe("ErrorNotice", () => {
  it("explains a known error code in the interface language", () => {
    const html = render("fr", ErrorNotice, { code: "network_error" });

    expect(html).toContain(resources.fr.error.network_error);
  });

  it("falls back to a generic message for a code it does not know", () => {
    const html = render("en", ErrorNotice, { code: "something_new" });

    expect(html).toContain(resources.en.error.unknown);
  });
});

describe("loadServerOverview", () => {
  it("gathers health, limits and capabilities from the API", async () => {
    const client = {
      getHealth: async () => overview.health,
      getLimits: async () => overview.limits,
      getCapabilities: async () => overview.capabilities,
    };

    expect(await loadServerOverview(client)).toEqual(overview);
  });

  it("fails as a whole when one call fails", async () => {
    const client = {
      getHealth: async () => overview.health,
      getLimits: async () => {
        throw new Error("down");
      },
      getCapabilities: async () => overview.capabilities,
    };

    await expect(loadServerOverview(client)).rejects.toThrow("down");
  });
});
