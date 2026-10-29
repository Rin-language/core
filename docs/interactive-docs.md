# Interactive API documentation

The server describes every route in an OpenAPI 3.1 document at `/v1/openapi.json`, always. On top of it, an optional page at `/docs` shows that document with [Scalar](https://scalar.com), where you can read the routes and try them.

The page is **off by default**.

## Why it is off

- The viewer is a large third-party package: its dependency tree adds hundreds of packages. That makes installs and Docker builds slower and widens the supply chain you have to trust.
- It is a 5 MB script served by your own server, on the same origin as the web client, and it needs a looser content security policy than the rest (inline styles).

Nothing exposed is open until you open it on purpose, so you choose to take on that weight.

## Turn it on

In `config/app.json`:

```json
"docs": { "enabled": true }
```

Restart the server and open `http://127.0.0.1:3000/docs`.

With Docker the configuration is baked into the image. Either edit `config/app.json` and rebuild:

```sh
docker compose up -d --build
```

or keep your own copy of the folder and mount it read-only, in a `compose.override.yaml` next to `compose.yaml`:

```yaml
services:
  app:
    volumes:
      - ./config:/app/config:ro
```

## What it serves

`/docs` (the page) and `/docs/scalar.js` (the viewer, read from the installed package). Nothing comes from a CDN. The viewer's default fonts, telemetry and agent are switched off, since each of them calls Scalar's servers, and the page may only run scripts and call the server it is served from.

## Without the page

Any OpenAPI viewer or client reads `/v1/openapi.json` just as well: Swagger UI, Scalar's own app, Bruno or Postman.
