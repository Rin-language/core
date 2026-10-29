# BIBLE: coding rules for this project

These rules apply to every change. If a rule gets in the way, say so and propose a change to this file instead of silently breaking it.

## 1. Process

- TDD: red, green, refactor. Write a failing test first, write the minimum code to pass, then refactor with the tests green. No production code without a test that demanded it.
- One slice at a time. Do not start the next one before the current one is done and committed.
- Small steps: each change should be reviewable in minutes.
- Before coding a non-trivial slice, state a short plan and the acceptance criteria.

## 2. Design principles

- DRY, with the rule of three: tolerate a first duplication, extract on the third occurrence, and only when the duplicated things change for the same reason. A wrong abstraction costs more than duplication.
- KISS: the simplest thing that satisfies the tests and the current slice.
- YAGNI: no feature, option, or abstraction for a hypothetical future. The only planned extension points are the ones named in CLAUDE.md.
- Single responsibility: one reason to change per module and per function.
- Depend on abstractions (interfaces), inject dependencies through constructors or parameters. No hidden globals or singletons.
- Prefer pure functions and immutable data. Isolate side effects (network, disk, clock, randomness) at the edges.
- Composition over inheritance.
- Make illegal states unrepresentable with types.
- API-first: the web client is a consumer of the public API like any other tool, with no private route. Every UI feature exists as a documented API, and every slice declares its routes in the route registry that generates the OpenAPI document.
- Tunable values (prompts, rate limits, quotas, size limits, user preferences) live in config files validated at startup, never hardcoded. Only true invariants (e.g. milliseconds per day) are named constants in code.

## 3. Code style

- TypeScript strict mode. No `any`, no unchecked `as` casts, no non-null assertions without a comment explaining why.
- Names say what things are or do. No abbreviations except universal ones. Booleans read as questions (`isExpired`, `hasQuota`).
- Functions are short and do one thing. If you need a comment to explain a block, extract a function with a good name.
- Comments explain why, never what. Delete dead code and commented-out code; git remembers.
- No magic numbers or strings: tunables go to config (see section 2), invariants to named constants defined once.
- Early returns over deep nesting.
- Consistent formatting enforced by tooling (formatter and linter), never by hand.

## 4. Errors and boundaries

- Validate all external input at the boundary with Zod: HTTP requests, LLM output, files, epubs, environment variables. Inside the boundary, trust the types.
- Fail fast and loudly on programmer errors. Handle expected failures explicitly with typed results or typed errors.
- Never swallow errors. Never use empty catch blocks.
- Error messages for users are clear and safe; internal details go to logs only.
- Time and randomness come from injected sources so tests are deterministic (streaks depend on dates and time zones: test them explicitly).

## 5. Testing

- Test pyramid: many fast unit tests, fewer integration tests, very few end-to-end tests.
- Tests are fast, deterministic, isolated, and run without network. No real LLM call in any test; use `FakeLLMProvider`.
- Test behavior through public interfaces, not implementation details.
- One logical assertion per test, descriptive test names, arrange/act/assert layout.
- Every bug fix starts with a test that reproduces the bug.
- Security behaviors are tested explicitly: oversized input rejected, malformed or injected LLM output rejected, quota exceeded refused.
- Do not lower or delete a test to make the build pass. Fix the code or discuss it.

## 6. Security and privacy

- No secrets in code, tests, logs, or commits. Configuration comes from environment variables, validated at startup.
- Do not log user content (texts, epub excerpts) or personal data. Log metadata only.
- Least privilege everywhere: the LLM, the database user, the API tokens.
- Minimal dependencies. Before adding one, check that it is maintained, widely used, and that the standard library cannot do the job. Pin versions.
- Never trust the client: authorization, quotas, and validation are server-side only.
- Security first: security is a design input of every slice, not a final pass. Each slice states its threats and abuse cases in its plan. Defaults are the safest ones, access is least-privilege, and everything exposed (API, tokens, webhooks, CORS, uploads, interactive docs) is closed by default, opened explicitly, and covered by a test.

## 7. Git and documentation

- Conventional commits (feat, fix, refactor, test, docs, chore), imperative mood, one logical change per commit.
- Never commit with failing tests, lint errors, or type errors.
- Public APIs are documented by their schemas. Update README and CLAUDE.md when commands or structure change.
- A change to the contract is its own commit and its own release, made before the code that uses it. Never edit a published version.

## 8. Definition of done (every slice)

1. Acceptance criteria of the slice are met and tested.
2. All tests, lint, and typecheck pass.
3. No code or option outside the slice was added.
4. Security rules from CLAUDE.md are respected and tested where relevant.
5. Docs and commands are updated.
6. Committed on the slice branch with clean history.
