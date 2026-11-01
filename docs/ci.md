# Continuous integration: jobs, rules and how to run them locally

What `.github/workflows/ci.yml` checks on every pull request and on every push to `main`, why, and the command that runs each check on your machine. The workflow needs no secret and no write access: a pull request from a fork runs the same jobs.

## Jobs

| Job | What it enforces | Run it locally |
|---|---|---|
| `check` | Lint, strict type check of server and web, the whole test suite, builds of the server and of the web client. The suite includes the route drift test (mounted routes match the OpenAPI document in both directions) and the test that every config key and `APP_*` variable is documented in `docs/`. | `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @rin-language/core-server build && pnpm --filter @rin-language/core-web build` |
| `offline-tests` | The tests pass in a Linux network namespace with only loopback, after `scripts/assert-offline.mjs` proved the network is cut. A test that reached a real model could not pass. | Linux with `sudo`: `scripts/run-tests-offline.sh pnpm test`. Elsewhere see below. |
| `audit` | `pnpm audit --audit-level=high`: a high or critical advisory fails the job, dev dependencies included. | `pnpm audit --audit-level=high` |
| `local-dependencies` | No `link:`, `file:` or `portal:` in any `package.json` or the lockfile, except the `link:../<package>` lines pnpm writes between two packages of `packages/`. | `node scripts/check-no-local-deps.mjs` |
| `migrations-unchanged` | Pull requests only. A released migration (`NNNN-*.ts` in `packages/server/src/storage/sqlite/migrations/`) is never modified, renamed or deleted compared with the base branch. Adding one is fine. | `node scripts/check-migrations-unchanged.mjs origin/main` |
| `secret-scan` | gitleaks over the full history, with `.gitleaks.toml`. The binary is downloaded at a fixed version and its SHA-256 is checked. | Install gitleaks, then `gitleaks git --config .gitleaks.toml --redact --no-banner .` |
| `docker` | Builds the image, scans it with Trivy (fixable `HIGH` or `CRITICAL` vulnerabilities fail the job), starts `docker compose` and waits for its health check, then requests `/health`. | `docker build -t rin-core:ci . && docker compose up -d --build --wait && curl -f http://127.0.0.1:3000/health; docker compose down -v` |

All jobs run on `ubuntu-latest` with Node 24.

## Rules every workflow follows

They are enforced by `packages/server/test/ci/workflows.test.ts` (rules in `scripts/workflow-rules.mjs`), so a change that breaks one fails `pnpm test`.

| Rule | Why |
|---|---|
| Top-level `permissions` is exactly `contents: read`. A job that needs more widens it for itself only. | A compromised step cannot write to the repository. |
| Every `uses:` is pinned to a full 40-character commit SHA, with the version in a comment. | A moved or hijacked tag cannot change what runs. |
| `actions/checkout` has `persist-credentials: false`. | The token is not left in `.git/config` for later steps. |
| No `pull_request_target`. | It runs code from a fork with the repository's secrets. |
| Every job has `timeout-minutes`. | A hung step cannot hold a runner for hours. |
| No `workflow_run` trigger, no `permissions: write-all`. | They hand secrets or every scope to code that was not reviewed. |
| No `${{ }}` expression inside a `run:` or a `script:` (github-script). Pass it through `env:` and use the shell variable. | A branch name or a title is attacker-controlled text; in a script it is code injection. |

Dependabot (`.github/dependabot.yml`) opens weekly pull requests for npm packages, GitHub Actions and the Docker base image, waits seven days after a release (`cooldown`), and groups minor and patch updates. Major updates are separate pull requests.

## Update a pinned action

1. Pick the release tag, then resolve its commit: `git ls-remote --tags https://github.com/<owner>/<repo> '<tag>^{}'` (the line with `^{}` is the commit; a tag without it points to the commit directly).
2. Put the commit SHA after `@` and the tag in the comment: `uses: owner/repo@<40 hex> # v1.2.3`.
3. Run `pnpm test`.

## Run the tests without network

The `offline-tests` job relies on a Linux network namespace. On a Mac or Windows machine, use a container with no network, after `pnpm install` inside it:

```sh
docker run --rm --network none -v "$PWD":/work -w /work node:24 sh -c \
  "corepack enable && pnpm install --frozen-lockfile --offline && node scripts/assert-offline.mjs && pnpm test"
```

`--offline` needs the pnpm store to be present; prepare it with a normal `pnpm install` first, or run the install before cutting the network.

## Add a job

1. Add it to `ci.yml`, keeping the rules above.
2. Add a row to the table above with the command to run it locally.
3. If it needs a script, put it in `scripts/` with a test in `packages/server/test/ci/`.

## Not covered yet

- `migrations-unchanged` runs on pull requests only, and it does not look at the list in `migrations/index.ts`: a migration dropped or reordered there without touching its own file is not caught. A direct push to `main` skips it.
- The Trivy action (`aquasecurity/trivy-action`) is pinned by commit SHA (release v0.36.0), and so are the actions it calls inside. The scanner it installs is pinned to **v0.69.3** with the `version` input: release v0.69.4 was compromised in a supply chain attack, so never move to it. Dependabot does not track that input; change it by hand, after reading the project's security advisories.
- Migration tests against a second database engine: they need that engine to exist in the repository.
- Automated review of pull requests and a release workflow: not part of this file, to be added as separate workflows.
- Branch protection (required checks on `main`) is a GitHub repository setting, not a file. Mark `check`, `offline-tests`, `audit`, `local-dependencies`, `secret-scan`, `docker` and `migrations-unchanged` as required.
