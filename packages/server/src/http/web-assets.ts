import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import type { WebAsset, WebAssets } from "./web.js";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
const INDEX_PAGE = "/index.html";

function collect(
  directory: string,
  urlPrefix: string,
  assets: Map<string, WebAsset>,
): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    // Hidden files (.env, .DS_Store) are never part of a client.
    if (entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    const urlPath = `${urlPrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      collect(path, urlPath, assets);
      continue;
    }
    // A link could lead outside the folder, so only plain files are served.
    if (!entry.isFile()) {
      throw new Error(
        `The web client folder has an unsupported entry: ${urlPath}`,
      );
    }
    const contentType = CONTENT_TYPES[extname(entry.name).toLowerCase()];
    if (contentType === undefined) {
      throw new Error(
        `The web client has a file type it cannot serve: ${urlPath}`,
      );
    }
    assets.set(urlPath, { body: readFileSync(path), contentType });
  }
}

/** Reads the built client once at startup, so a broken folder stops the server early. */
export function loadWebAssets(directory: string): WebAssets {
  if (!statSync(directory, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`The web client folder does not exist: ${directory}`);
  }
  const assets = new Map<string, WebAsset>();
  collect(directory, "", assets);
  const index = assets.get(INDEX_PAGE);
  if (index === undefined) {
    throw new Error(`The web client folder has no ${INDEX_PAGE.slice(1)}`);
  }
  assets.set("/", index);
  return assets;
}
