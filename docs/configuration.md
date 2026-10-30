# Configuration: `config/app.json` and environment variables

Every setting of the server: what each key of `config/app.json` and each `APP_*` environment variable does, its default, what it accepts, and what happens when it is wrong. The `ai` keys are detailed in [ai-gateway.md](ai-gateway.md), the `securityEvents` keys in [security-events.md](security-events.md), the language files in [language-data.md](language-data.md).

An invalid file or variable stops the server at startup with a message naming the file and the rule, never the rejected value. Unknown keys are refused. There is no reload: restart the server after a change.

## Where things are read

| Source | What it holds | Located by |
|---|---|---|
| `config/app.json` | Tunable settings of the instance (this page). | `APP_CONFIG_DIR` (default `config`). |
| `config/languages/<code>.json` | Profile and prompts of one language. | The `languages` key. |
| `data/error-types/<code>.json`, `data/grammar/<code>.json` | Language data. | `dataDir`, relative to the config folder. |
| Environment variables | What depends on the deployment, including secrets. | The process environment. |

A secret (a key, a token) is only ever read from the environment, never from `app.json`.

## Keys of `config/app.json`

| Key | Default | Allowed values | Effect |
|---|---|---|---|
| `dataDir` | none (required) | Non-empty path, relative to the config folder | Folder with `error-types/` and `grammar/`. |
| `languages` | none (required) | Non-empty list of unique two-letter codes (`ja`) | Languages this instance serves. Each needs a profile and an error types file, or the server does not start. |
| `defaultLanguage` | none (required) | One of `languages` | Language used when a request names none. |
| `limits.maxTextLength` | none (required) | Positive integer | Longest text a user may submit, announced on `GET /v1/limits` and enforced by the server. |
| `limits.maxEdits` | none (required) | Positive integer | Most corrections returned for one text. |
| `limits.maxExplanationLength` | none (required) | Positive integer | Longest explanation of one correction. |
| `maxBodyBytes` | none (required) | Positive integer | Largest request body read. A larger one is refused with 413 before it is read in full. |
| `timeouts.headersMs` | none (required) | Positive integer, at most `requestMs` | Time a client has to send its request headers. |
| `timeouts.requestMs` | none (required) | Positive integer | Time a client has to send the whole request. |
| `timeouts.idleMs` | `30000` | Positive integer, at least `ai.timeoutMs + ai.idleMarginMs` | A connection that moves no byte for this long is closed. It frees what a client that never reads its answer would hold, and it must outlast the slowest answer: a model call keeps the connection silent until it ends. There is no per-route exception. |
| `cors.allowedOrigins` | `[]` | List of exact `http(s)` origins such as `https://app.example.com` | Origins allowed to read the API from a browser. No wildcard, no `null`, no path, no trailing slash. Credentials are never allowed. |
| `docs.enabled` | `false` | `true` or `false` | Serves the interactive documentation at `/docs`. Needs the optional viewer, see [interactive-docs.md](interactive-docs.md). |
| `ai` | see [ai-gateway.md](ai-gateway.md) | Object | Limits on calls to a model: `timeoutMs`, `maxAttempts`, `maxInputChars`, `maxOutputTokens`, `maxOutputChars`, `idleMarginMs`. |
| `securityEvents` | see [security-events.md](security-events.md) | Object | `trustedProxyHops`, `queueSize`, `clientKinds`. |

Cross-key rules the server checks at startup:

- `defaultLanguage` is one of `languages`.
- `timeouts.headersMs` does not exceed `timeouts.requestMs`.
- `timeouts.idleMs` is at least `ai.timeoutMs + ai.idleMarginMs`.

### Complete example

```json
{
  "dataDir": "../data",
  "languages": ["ja"],
  "defaultLanguage": "ja",
  "limits": { "maxTextLength": 2000, "maxEdits": 100, "maxExplanationLength": 500 },
  "maxBodyBytes": 65536,
  "timeouts": { "headersMs": 10000, "requestMs": 30000, "idleMs": 30000 },
  "cors": { "allowedOrigins": [] },
  "docs": { "enabled": false },
  "ai": {
    "timeoutMs": 20000,
    "maxAttempts": 2,
    "maxInputChars": 8000,
    "maxOutputTokens": 1024,
    "maxOutputChars": 16000,
    "idleMarginMs": 5000
  },
  "securityEvents": { "trustedProxyHops": 0, "queueSize": 1000 }
}
```

Allow one web client origin:

```json
{ "cors": { "allowedOrigins": ["https://app.example.com"] } }
```

## Environment variables

| Variable | Default | Allowed values | Effect |
|---|---|---|---|
| `APP_CONFIG_DIR` | `config` | Non-empty path | Folder with `app.json` and `languages/`. |
| `APP_HOST` | `127.0.0.1` | Non-empty interface address | Interface to listen on. The Docker image sets `0.0.0.0` inside the container; the compose file publishes the port on `127.0.0.1` only. |
| `APP_PORT` | `3000` | Integer 0 to 65535 | Port to listen on. `0` picks a free one. |
| `APP_DATABASE_PATH` | `rin.sqlite` | Non-empty path | SQLite file. Created readable by its owner only. |
| `APP_LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` | Log level. Logs hold metadata only, whatever the level. |
| `APP_WEB_DIR` | unset | Path of the built web client | Serves the client from the server. Unset means the server only exposes the API. |
| `APP_IP_FINGERPRINT_KEY` | unset | Secret of 32 characters or more | Key of the network fingerprint in [security events](security-events.md). Set together with `APP_IP_FINGERPRINT_KEY_ID`. |
| `APP_IP_FINGERPRINT_KEY_ID` | unset | 1 to 32 letters, digits, `-` or `_` | Label of that key, so a rotation shows in the events. |

The last two enable the network fingerprint and must be set together: setting only one stops the server at startup.

```sh
APP_PORT=8080 APP_DATABASE_PATH=/var/lib/rin/rin.sqlite APP_LOG_LEVEL=warn pnpm dev
```

## Security notes

- Keep `APP_HOST` on loopback unless a reverse proxy with TLS is in front. The server has no TLS and no authentication of its own.
- Never put `APP_IP_FINGERPRINT_KEY`, or the key of a model provider, in `app.json`, in the image or in a commit.
- A wildcard in `cors.allowedOrigins` is refused on purpose. List each origin.
