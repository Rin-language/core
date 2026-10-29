import { describe, expect, it } from "vitest";
import { findRouteDrift } from "../src/find-route-drift.js";

const document = {
  paths: {
    "/v1/limits": { get: {} },
    "/v1/echo": { post: {} },
  },
};

describe("findRouteDrift", () => {
  it("finds nothing when the routes and the document agree", () => {
    const mounted = [
      { method: "GET", path: "/v1/limits" },
      { method: "POST", path: "/v1/echo" },
    ];

    expect(findRouteDrift(mounted, document)).toEqual({
      undocumented: [],
      unmounted: [],
    });
  });

  it("finds a mounted route that the document does not describe", () => {
    const mounted = [
      { method: "GET", path: "/v1/limits" },
      { method: "POST", path: "/v1/echo" },
      { method: "GET", path: "/v1/rogue" },
    ];

    expect(findRouteDrift(mounted, document).undocumented).toEqual([
      "GET /v1/rogue",
    ]);
  });

  it("finds a documented operation that is not mounted", () => {
    const mounted = [{ method: "GET", path: "/v1/limits" }];

    expect(findRouteDrift(mounted, document).unmounted).toEqual([
      "POST /v1/echo",
    ]);
  });

  it("tells methods apart on the same path", () => {
    const mounted = [
      { method: "GET", path: "/v1/limits" },
      { method: "DELETE", path: "/v1/limits" },
      { method: "POST", path: "/v1/echo" },
    ];

    expect(findRouteDrift(mounted, document).undocumented).toEqual([
      "DELETE /v1/limits",
    ]);
  });

  it("ignores middleware, which is mounted for every method", () => {
    const mounted = [
      { method: "ALL", path: "/*" },
      { method: "GET", path: "/v1/limits" },
      { method: "POST", path: "/v1/echo" },
    ];

    expect(findRouteDrift(mounted, document).undocumented).toEqual([]);
  });
});
