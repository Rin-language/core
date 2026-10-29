import {
  CapabilitiesResponse,
  HealthResponse,
  LimitsResponse,
} from "@rin-language/contract";
import type { LoadedConfig } from "../config/load-config.js";
import { defineRoute, type Route } from "../http/route.js";

function buildCapabilities({
  app,
  languages,
}: LoadedConfig): CapabilitiesResponse {
  return {
    languages: app.languages.map((code) => {
      const profile = languages[code];
      if (profile === undefined) {
        throw new Error(`No profile loaded for the enabled language ${code}`);
      }
      return {
        code,
        // Ids only: descriptions, prompts and grammar stay on the server.
        errorTypes: profile.errorTypes.types.map((type) => type.id),
        levels: profile.levels,
        skills: profile.skills,
      };
    }),
  };
}

export function buildCoreRoutes(config: LoadedConfig): Route[] {
  const capabilities = buildCapabilities(config);
  return [
    defineRoute({
      method: "get",
      path: "/health",
      operationId: "getHealth",
      summary: "Liveness check.",
      description:
        "Answers ok while the server process is running. It checks nothing else.",
      auth: "public",
      isProbe: true,
      response: HealthResponse,
      errorCodes: [],
      handler: () => ({ status: "ok" as const }),
    }),
    defineRoute({
      method: "get",
      path: "/v1/limits",
      operationId: "getLimits",
      summary: "Limits of this server.",
      description:
        "The limits the server enforces, so a client can adapt before sending.",
      auth: "public",
      response: LimitsResponse,
      errorCodes: [],
      handler: () => config.app.limits,
    }),
    defineRoute({
      method: "get",
      path: "/v1/capabilities",
      operationId: "getCapabilities",
      summary: "What this server offers.",
      description:
        "The languages the server has a profile for, with their error types, levels and skills.",
      auth: "public",
      response: CapabilitiesResponse,
      errorCodes: [],
      handler: () => capabilities,
    }),
  ];
}
