# Leanest

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/baronunread/leanest/blob/main/LICENSE)
[![npm version](https://img.shields.io/npm/v/leanest)](https://www.npmjs.com/package/leanest)
[![CI](https://github.com/baronunread/leanest/actions/workflows/ci.yml/badge.svg)](https://github.com/baronunread/leanest/actions)

**[leanest.pages.dev](https://leanest.pages.dev/)**

> Leanest does not predict which tests will fail. It determines which tests are safe enough not to run.

Local-first test selection using semantic judgments (classifier.dev by default, or [Jev](https://typesafe.ai)/Laya). Leanest sits in front of your existing test runner and runs only the tests that matter for a given code change. Everything else it skips, on purpose, out loud.

---

## Install

Requires [Bun](https://bun.sh): the CLI runs on it directly, no build step.

```bash
bun add -D leanest
```

Works with no setup: leanest defaults to classifier.dev, a free, no-auth judge. Switch to Jev if you want it by exporting `TYPESAFE_API_KEY` and setting `LEANEST_PROVIDER=jev` (see [Judge provider](#judge-provider)).

## Quick Start

```bash
npx leanest playwright                       # select + actually run the affected e2e tests
npx leanest playwright --base origin/main     # diff against a specific base
npx leanest select playwright                 # just show the selection, don't run anything
npx leanest inspect playwright                # rank every test by relevance, for debugging
```

## How It Works

```
Repository
   |
   +-- Git change (base...head)
   +-- Discovered test files
   |
   v
Leanest
   |
   +-- Change resolver     (git diff)
   +-- Test discovery      (respects the framework's own config, e.g. playwright.config.ts testDir)
   +-- Context builder     (packages the diff + each test's source for Jev)
   +-- Jev evaluator       (one semantic judgment per test, in parallel)
   +-- Selection policy    (RUN / SKIP, fail-open on low confidence)
   |
   v
Selected test files
   |
   v
Your existing runner (playwright / vitest), unmodified
```

For each discovered test, Leanest asks:

> **Could the current code change affect behavior verified by this test?**

Tests that are confidently irrelevant get skipped. Everything else runs through your existing runner exactly as it would outside Leanest: same reporter, same exit code, same flags.

## Core Principles

- **Fail open**: uncertainty means RUN. A missing API key, an API timeout, or a malformed response always falls back to running the full suite, loudly (`⚠ Jev unavailable (...), running the full suite.`).
- **Deterministic overrides**: no threshold decides these, the judge isn't even asked. A test whose own file changed always runs, as does one that statically imports a changed file, or that navigates a route a changed file's own path names (e.g. `page.goto("/admin/users")` against a changed `routes/admin/users.tsx`) -- a heuristic that catches e2e route coupling no import graph can see, since a browser test never imports the page it drives.
- **Leanest doesn't run tests itself**: it selects file paths and hands them to your actual runner (`playwright test <paths>`, `vitest run <paths>`). It leaves reporters, retries, sharding, and CI-required-check behavior alone.
- **Static checks are out of scope on purpose**: lint/format/typecheck are already fast at full scope, and semantic per-rule selection would add latency for no real payoff. Leanest spends its Jev budget only on suites that are expensive to run in full: e2e today, more later.

## Adapters

| Framework  | Status      | Command                   |
| ---------- | ----------- | -------------------------- |
| Playwright | First-class | `npx leanest playwright`  |
| Vitest     | First-class | `npx leanest vitest`      |
| Jest       | Planned     | —                          |
| Pytest     | Planned     | —                          |

## CLI Usage

### Select and run (the normal case)

```bash
npx leanest playwright
```

### Working tree only (uncommitted changes)

```bash
npx leanest playwright --changed
```

### Specific base branch

```bash
npx leanest playwright --base main
```

### Target a different directory

```bash
npx leanest playwright --dir ~/projects/my-app
```

### Machine-readable output

```bash
npx leanest playwright --json
```

### Selection only, no execution

```bash
npx leanest select playwright --base origin/main
```

### Full suite, no selection

```bash
npx leanest playwright --full
```

### Shadow mode

Runs the full suite for real (it skips nothing), but logs what Leanest would have skipped, so you can build trust in the selection before turning it on:

```bash
npx leanest playwright --shadow
```

### Inspect mode (debugging / ranking)

```bash
npx leanest inspect playwright
```

```
RUN   tests/e2e/admin-users-export.pw.ts
RUN   tests/e2e/downgrade.pw.ts
SKIP  tests/e2e/qr-generator.pw.ts
SKIP  tests/e2e/avatar.pw.ts
...
```

## Configuration

Leanest loads `.env` for local convenience. The API key is never persisted or logged.

```dotenv
TYPESAFE_API_KEY=...
```

Framework choice, base ref, and target directory are all CLI flags (`--base`, `--dir`), so there's nothing else to set up per project.

### Judge provider

Leanest's selection judgment is pluggable. Pick a provider with `LEANEST_PROVIDER`:

| Provider                    | How                                              | API key needed |
| --------------------------- | ------------------------------------------------ | --------------- |
| `classifier-dev` (default)  | classifier.dev, a free zero-shot classifier       | none |
| `jev`                       | TypeSafe's Jev, over HTTP                         | `TYPESAFE_API_KEY` |
| `laya`                      | Laya, self-hosted, runs in-process via ONNX Runtime (`bun add @receptron/laya`) | none |

```bash
LEANEST_PROVIDER=jev npx leanest playwright
```

## CI Integration

### GitHub Actions

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0

- uses: baronunread/leanest@v1
  with:
    framework: playwright
```

This installs Bun, installs `leanest`, and replaces your existing "run e2e tests" step: same reporter output, same exit code, just fewer tests executed. No secret required — the default `classifier-dev` provider needs no API key, which also means forked-repo PRs can use it without access to your repo's secrets. Pass `provider: jev` and `typesafe-api-key: ${{ secrets.TYPESAFE_API_KEY }}` to use Jev instead.

### Any other CI

```bash
bun add -g leanest
leanest playwright --base origin/main
```

Works anywhere you can run a shell command and set an env var: GitLab CI, CircleCI, Buildkite.

## Development

```bash
bun install
bun run check   # lint + format check + typecheck + test
bun test        # just the test suite
```

## Contributing

See [LEANEST_SPEC.md](./LEANEST_SPEC.md) for the design rationale behind the selection policy.

## License

MIT. See [LICENSE](./LICENSE).
