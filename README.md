# Rin core (working name)

Open-source core of a language immersion app, Japanese first. This repo holds the server, the web client and the shared logic. The schemas come from the separate [`contract`](https://www.npmjs.com/package/@rin-language/contract) package.

Status: slice 0 (foundations). The server exposes `/health`, `/v1/limits`, `/v1/capabilities`, its OpenAPI document and, if you turn it on, an interactive documentation page, and serves a minimal web client. Correction, streak, reader and list come in the next slices.

## Run it with Docker

```sh
docker compose up -d --build
```

Then open <http://127.0.0.1:3000> (the client). The OpenAPI document is at <http://127.0.0.1:3000/v1/openapi.json>; the interactive documentation page is off unless you [turn it on](docs/interactive-docs.md).

- The port is published on `127.0.0.1` only. To expose the server, put a reverse proxy with TLS in front of it. Set `APP_HOST_PORT` to use another host port.
- The container runs as an unprivileged user, with a read-only root filesystem, no Linux capabilities and `no-new-privileges`. The only writable place is the `rin-data` volume, which holds the SQLite database.
- `docker compose down` keeps the data; `docker compose down -v` deletes it.

## Develop

Requirements: Node 24 and pnpm 10.

```sh
pnpm install
pnpm dev                                  # server on http://127.0.0.1:3000
pnpm --filter @rin-language/core-web dev  # client with hot reload, proxies the API to :3000
```

To serve the built client from the server, as the Docker image does:

```sh
pnpm --filter @rin-language/core-web build
APP_WEB_DIR=packages/web/dist pnpm dev
```

| Command | What it does |
|---|---|
| `pnpm test` | All tests (offline, no real model is ever called). |
| `pnpm lint` | Biome check. |
| `pnpm format` | Biome format, writing the files. |
| `pnpm typecheck` | TypeScript strict, for the server and for the web client. |
| `pnpm --filter @rin-language/core-server build` | Compile the server to `packages/server/dist`. |
| `pnpm --filter @rin-language/core-web build` | Build the client to `packages/web/dist`. |

## Configuration

**Environment variables** describe the deployment. They are validated at startup.

| Variable | Default | Meaning |
|---|---|---|
| `APP_CONFIG_DIR` | `config` | Folder with `app.json` and `languages/`. |
| `APP_HOST` | `127.0.0.1` | Interface to listen on. The Docker image sets `0.0.0.0`. |
| `APP_PORT` | `3000` | Port to listen on. |
| `APP_DATABASE_PATH` | `rin.sqlite` | SQLite file. Created readable by its owner only. |
| `APP_LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`. |
| `APP_WEB_DIR` | unset | Built web client to serve. Unset means the server only exposes the API. |
| `APP_IP_FINGERPRINT_KEY` | unset | Secret key (32 characters or more) for the network fingerprint of [security events](docs/security-events.md). Never put it in `app.json`. |
| `APP_IP_FINGERPRINT_KEY_ID` | unset | Label of that key, set together with it, so a rotation shows in the events. |

**`config/app.json`** holds the tunable settings: enabled languages, size limits, request timeouts, CORS and the documentation page.

| Key | Meaning |
|---|---|
| `languages`, `defaultLanguage` | Languages this instance serves. Each needs a profile and an error types file, see [docs/language-data.md](docs/language-data.md). |
| `limits` | Limits announced on `/v1/limits` and enforced by the server. |
| `maxBodyBytes` | Largest request body accepted. |
| `timeouts` | `headersMs` and `requestMs`, protection against slow requests. |
| `cors.allowedOrigins` | Exact origins allowed to read the API from a browser. Empty by default. No wildcard, no `null`, no credentials. |
| `docs.enabled` | Serve the interactive documentation at `/docs`. Off by default, see [docs/interactive-docs.md](docs/interactive-docs.md). |
| `securityEvents` | `trustedProxyHops` (proxies of yours in front of the server, 0 by default), `queueSize` (events held back while the receiver is slow) and `clientKinds` (how a User-Agent is reduced to a kind). See [docs/security-events.md](docs/security-events.md). |

An invalid file stops the server at startup with a message naming the file and the rule.

## The API

Every route is declared once in a registry that mounts it and generates the OpenAPI 3.1 document, using the contract's schemas. The web client uses the same public routes as any other tool.

| Route | Purpose |
|---|---|
| `GET /health` | Liveness. |
| `GET /v1/limits` | Limits the server enforces. |
| `GET /v1/capabilities` | Languages, levels, skills and error types on offer. |
| `GET /v1/openapi.json` | The OpenAPI document of this server. |
| `GET /docs` | Interactive documentation (Scalar), served locally with no CDN. Off by default. |

Errors use the contract's `ApiError` format. They never contain user content or internal detail.

## Security defaults

Everything exposed is closed until it is opened on purpose, and each default is covered by a test.

- Loopback bind, no CORS origin, no web client folder and no interactive documentation unless asked for.
- Strict security headers and a content security policy per kind of page. API answers carry `default-src 'none'`.
- Request body size limit and slow-request timeouts, from the configuration.
- Logs hold metadata only: method, route pattern, status, duration. No query string, header, body or user content.
- Security events, off unless a host plugs a receiver in: one metadata-only event per API request (sizes, status, error code, a keyed hash of the caller's network, a coarse client kind), delivered in the background through a bounded queue that can neither slow a request nor grow without limit. See [docs/security-events.md](docs/security-events.md).
- The server owns all limits and, later, all prompts. The client never sends a free-form prompt.

## Add an interface language

The client is translated from the JSON files in `packages/web/src/i18n/locales/`.

1. Copy `en.json` to `<code>.json` and translate the values. Keep every key: `fr` is typed as `en`, so a missing or extra key fails the build.
2. Import it in `packages/web/src/i18n/resources.ts` and add the code to `UI_LANGUAGES`.

Labels for skills and error types are looked up by id. An id with no label is shown as is.

## Add a learned language

Add a profile and an error types file and list the code in `config/app.json`. No code changes. See [docs/language-data.md](docs/language-data.md).

## Repository layout

```
config/            instance settings and language profiles
data/              error types and grammar rules, one file per language
docs/              language data format, security events, interactive documentation
packages/
  server/          HTTP server, registry, OpenAPI, SQLite storage, ports
  web/             React + Vite client
  test-kit/        fakes and checks shared by the tests (not shipped)
```

The server depends on interfaces (`Storage`, `LLMProvider`, `Clock`, `Identity`) and never on a concrete provider. The coding rules are in [BIBLE.md](BIBLE.md).
