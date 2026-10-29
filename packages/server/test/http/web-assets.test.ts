import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadWebAssets } from "../../src/http/web-assets.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function webDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "rin-web-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
  }
  return dir;
}

const built = {
  "index.html": "<!doctype html><title>x</title>",
  "assets/app-123.js": "console.log(1)",
  "assets/app-123.css": "body{}",
};

describe("loadWebAssets", () => {
  it("indexes every file under its URL path", () => {
    const assets = loadWebAssets(webDir(built));

    expect(
      ["/", "/index.html", "/assets/app-123.js", "/assets/app-123.css"].map(
        (path) => assets.get(path) !== undefined,
      ),
    ).toEqual([true, true, true, true]);
  });

  it("serves the index page at the root", () => {
    const assets = loadWebAssets(webDir(built));

    expect(assets.get("/")?.body.toString()).toBe(built["index.html"]);
  });

  it("gives each file the content type of its extension", () => {
    const assets = loadWebAssets(webDir(built));

    expect([
      assets.get("/")?.contentType,
      assets.get("/assets/app-123.js")?.contentType,
      assets.get("/assets/app-123.css")?.contentType,
    ]).toEqual([
      "text/html; charset=utf-8",
      "text/javascript; charset=utf-8",
      "text/css; charset=utf-8",
    ]);
  });

  it("only knows the files that were in the folder", () => {
    const assets = loadWebAssets(webDir(built));

    expect(
      ["/../secret", "/assets/", "/assets", "/missing.js", "/%2e%2e/x"].map(
        (path) => assets.get(path),
      ),
    ).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  it("never serves hidden files", () => {
    const assets = loadWebAssets(
      webDir({ ...built, ".env": "SECRET=1", "assets/.hidden.js": "x" }),
    );

    expect([assets.get("/.env"), assets.get("/assets/.hidden.js")]).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("refuses a folder that does not exist", () => {
    expect(() => loadWebAssets(join(tmpdir(), "rin-no-web-dir"))).toThrow(
      /web/i,
    );
  });

  it("refuses a folder without an index page", () => {
    expect(() => loadWebAssets(webDir({ "assets/app.js": "x" }))).toThrow(
      /index\.html/,
    );
  });

  it("refuses a file type it does not know how to serve", () => {
    expect(() =>
      loadWebAssets(webDir({ ...built, "assets/run.exe": "x" })),
    ).toThrow(/run\.exe/);
  });
});
