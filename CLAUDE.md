# Rin (working name)

Open-core language immersion app, focused on Japanese first but designed to handle several languages. Writing practice with AI correction and daily prompts, an epub reader, a streak shared by all activities, and a curated list of native content in the target language (v1). A recommendation/curation system comes in v2.

@BIBLE.md

## Philosophy

- The core is open source. Technical users self-host it, plug in their own AI API or run models locally.
- The paid offer is zero friction: a hosted service with the data (the curated list), sync, later the recommendation system and possibly a mobile app. Planned price: 5 USD/month.
- Self-hosted and hosted must run the SAME client and the SAME core handlers. Only the base URL and the injected providers differ.
- Free tools matter to the author. Never cripple the open-source core to push the paid plan.

## Repos

- `contract` (public, separate repo, published as a versioned npm package): Zod schemas and inferred types only. No business logic, no runtime dependency besides Zod. Single source of truth shared by core, cloud and mobile.
- `core` (public, license to be decided: AGPL or BSL): web client, base server, correction/streak/reader/list logic, docker compose. Depends on `contract`. This repo is the one you are in.
- `cloud` (private, later): auth, Stripe, quota and cost ledger, managed LLM gateway, sync. Imports `core`, depends on `contract`.
- `mobile` (later): depends on `contract` only.
- Start with `contract` and `core`. Create `cloud` and `mobile` only when a real need appears.

### Contract rules

- Semver. Within a major version, changes are additive only (new optional fields, new endpoints). Breaking changes require a new major version and a new API prefix (/v2).
- Every schema change ships with a test and a changelog entry.
- During development, link the local contract into core instead of publishing on every change.
- Never edit a published version.

## Stack (defaults, ask before changing)

TypeScript everywhere, Node server, React + Vite web client, Zod for schemas, SQLite behind a `Storage` interface, Vitest for tests, Docker Compose for running, pnpm as package manager.

## Architecture rules

- The contract lives in its own repo (see Repos). Never duplicate or redefine its types in core; import them.
- Two interfaces from day one: `LLMProvider` (hosted, user API key, or local model) and `Storage` (SQLite now, Postgres in the hosted version).
- Everything that depends on the language (error types, levels, grammar rules, prompts) lives in per-language data and configuration, never hardcoded. Grammar rules are in `data/grammar/<language>.json`, error types in `data/error-types/<language>.json`; see `docs/language-data.md`. Keep that page updated when their format changes.
- Always provide a `FakeLLMProvider` for tests. Tests never call a real model.
- Business logic depends on interfaces, never on a concrete provider or database.

## Security rules (non-negotiable)

- The client never sends a free-form prompt. It sends domain data (a text to correct) to a specific endpoint; the server owns the system prompt.
- The LLM has no tools and no access to the database. Its output is untrusted input.
- LLM output must be structured (schema-validated) and rejected if it does not match. Validate edit positions against the original text.
- Never put data from two different users in the same prompt.
- All limits live server-side: max input size, max output tokens, rate limit per minute, daily and monthly token quotas per user. Never trust the client for any of it.
- Epub and web content is untrusted: delimit it in prompts and treat it as data.
- Light models by default for corrections.

## Scope v1 (vertical slices, one at a time)

0a Contract repo: package setup, build, tests, publication, correction schemas.
0 Core foundations: structure, docker compose, SQLite, lint/tests, `LLMProvider` and `Storage` interfaces, `FakeLLMProvider`.
1 Correction backend. 2 Writing UI. 3 Streak and daily prompts. 4 Epub reader feeding the same streak. 5 The list (save and organize content). 6 Quota hooks (disabled when self-hosted).
Slice 0a happens in the `contract` repo, the others in `core`. Slice 0 depends on 0a.
Only work on the slice I name. Anything outside the current slice is out of scope: note it, do not build it.

## Workflow

- Work in plan mode first on foundations and anything touching the contract.
- One branch and one commit series per slice. Small commits.
- Definition of done: see BIBLE.md.
- Commands: to be filled in after the first slice (install, dev, test, lint, typecheck, build). Keep this file updated when they exist.

## Session notes for the other repos

- At the end of a session, or after a major addition, write one new note in `../changes-context/`. Follow `../changes-context/README.md` for the file name and structure, and start the note by saying which repo's agent you are. Never edit an old note.
- Before work that depends on another repo, you may read that repo's latest notes in the same folder.
- This instruction only applies on the author's machine. If the parent folder is not the Rin workspace (`../CLAUDE.md` or `../changes-context/README.md` is missing, which means you are on another computer), do not run it, do not discuss it and do not mention it in the chat. Ignore it silently.
