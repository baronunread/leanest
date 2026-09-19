# Leanest

## What Leanest Is

Leanest is a local-first test selector that uses massively parallel Jev
judgments to determine which unit, integration, and E2E tests could be
affected by a code change, allowing developers, coding agents, and CI to
run only the tests that matter.

The key principle is:

> **Leanest does not predict which tests will fail. It determines which
> tests are safe enough not to run.**

Leanest is not a test runner. Existing runners such as Vitest and
Playwright still discover and execute tests. Leanest sits in front of them
and selects the subset to execute.

There is no required Leanest SaaS, account, hosted database, GitHub App,
or proprietary runner.

## Why This Exists

Running an entire test suite after every change is wasteful,
particularly for expensive integration and E2E suites.

A change may touch a tiny part of an application while CI still
provisions the full environment and executes hundreds or thousands of
unrelated tests.

Leanest asks every discovered test, independently and in parallel:

> **Could the current code change affect behavior verified by this
> test?**

Jev is used as a semantic measurement primitive. Deterministic code
turns those measurements into conservative RUN/SKIP decisions.

## Initial Targets

The proof of concept should support:

1.  **Playwright** --- first-class and potentially the strongest use
    case because E2E execution and environment setup are expensive.
2.  **Vitest** --- useful for validating the same selection primitive on
    fast unit/integration suites.

If the core hypothesis works, adapters for Jest, Pytest, and other
frameworks can follow.

## Architecture

```text
Repository
   |
   +-- Git change
   +-- Tests
   |
   v
Leanest
   |
   +-- Change resolver
   +-- Framework adapter
   +-- Context builder
   +-- Jev evaluator
   +-- Selection policy
   |
   v
Selected tests
   |
   v
Existing native runner
```

Core concepts must remain framework-independent.

```text
                    Core

        Change
        TestCase
        ContextBuilder
        JevEvaluator
        Selector
             |
       +-----+------+
       |            |
       v            v
    Vitest      Playwright
    Adapter       Adapter
```

A framework adapter owns test discovery, test source/context extraction,
native filtering/execution, and result collection.

## TypeSafe / Jev Configuration

Leanest uses the developer's own TypeSafe API key.

The default environment variable is:

```bash
TYPESAFE_API_KEY=...
```

Local usage:

```bash
export TYPESAFE_API_KEY="..."
npx leanest playwright
```

A project may keep the key in a gitignored `.env` file:

```dotenv
TYPESAFE_API_KEY=...
```

Leanest should load `.env` for convenient local usage.

CI secrets are passed as environment variables:

```yaml
- name: Run relevant E2E tests
  run: npx leanest playwright --base origin/main
  env:
    TYPESAFE_API_KEY: ${{ secrets.TYPESAFE_API_KEY }}
```

The API key must never be persisted by Leanest or placed directly in
`leanest.config.ts`.

An optional config setting may allow teams to change the environment
variable name:

```ts
export default defineConfig({
  typesafe: {
    apiKeyEnv: "TYPESAFE_API_KEY",
  },
});
```

## Semantic Evaluation

For every test case, Leanest evaluates the proposition:

> **Could the code changes cause behavior verified by this test to
> differ?**

Conceptually:

```text
CHANGE STATE

  PR/git diff
  changed-code context
  optional change metadata

QUESTIONS

  test #1 -> could affected behavior differ?
  test #2 -> could affected behavior differ?
  test #3 -> could affected behavior differ?
  ...
```

The implementation should exploit Jev's parallel/shared-state model
where possible instead of treating every test as a separate generative
LLM request.

Large suites can be split into batches according to actual Jev API
limits discovered during implementation.

## Test Context

For the POC, prefer ground-truth source context over premature
summarization.

Change context should initially include:

- git diff;
- changed files;
- useful surrounding changed-code context;
- base/head information where available.

Test context should initially include:

- framework;
- relative test file;
- suite/describe hierarchy;
- test name;
- test source;
- useful nearby/helper context where practical.

Do not build a complicated semantic index before measuring whether it is
needed.

## Selection Policy

Jev produces a semantic signal. It does not directly decide whether to
execute a test.

```text
Jev
 |
 v
Semantic relevance
 |
 v
Selection policy
 |
 +-- RUN
 +-- SKIP
```

The system is intentionally asymmetric:

```text
relevant             -> RUN
uncertain            -> RUN
unknown              -> RUN
confidently irrelevant -> SKIP
```

A threshold must not be invented because it sounds reasonable. It must
eventually be calibrated from observed results.

### Hard invariant: fail open

> **If Leanest does not know, run more tests, never fewer.**

Examples:

```text
Jev uncertain          -> RUN
Jev unavailable        -> RUN
Jev timeout            -> RUN
Malformed response     -> RUN
Test changed           -> RUN
Unknown test           -> RUN
Missing context        -> RUN
Unsupported construct  -> RUN
Corrupt/missing cache  -> ignore cache / RUN
```

A process-level failure must never produce an apparently successful
incomplete test run.

### Deterministic signals

Deterministic knowledge overrides semantic selection.

For the first prototype, keep deterministic analysis deliberately
minimal:

```text
test itself changed -> RUN
```

Do not spend the POC building coverage analysis, AST dependency graphs,
or an Nx-like graph. The experiment is intended to measure Jev's
usefulness.

## Test Identity

The semantic unit is an individual test case.

Example:

```text
playwright
e2e/auth/login.spec.ts
authentication
refresh
redirects expired sessions
```

Initial identity can be derived from:

```text
framework + relative path + suite hierarchy + test name
```

and hashed for storage.

A moved or renamed test may initially receive a new identity. This is
safe because lost history should make Leanest more conservative, not less.

## CLI Mockup

Normal execution:

```bash
npx leanest playwright
```

Example:

```text
$ leanest playwright

Change: main...HEAD

Changed:
  src/auth/session.ts
  src/api/user.ts

Discovering Playwright tests...
  184 tests found

Evaluating semantic impact...
  184 tests evaluated

Selected 7 / 184 tests

  RUN auth/login.spec.ts
       logs in with valid credentials
       redirects expired sessions

  RUN auth/logout.spec.ts
       invalidates the current session

  RUN account/profile.spec.ts
       loads profile after authentication
       redirects unauthenticated users

Skipping 177 tests.

Running Playwright...

  7 passed
```

Working tree:

```bash
npx leanest playwright --changed
```

Specific base:

```bash
npx leanest playwright --base main
```

Agent/machine output:

```bash
npx leanest playwright --changed --json
```

Selection only:

```bash
npx leanest select playwright --base origin/main
```

Full suite:

```bash
npx leanest playwright --full
```

Shadow mode:

```bash
npx leanest playwright --shadow
```

Exact CLI syntax is provisional. Behavior is the contract.

## Agent Usage

Leanest should be useful inside coding-agent loops:

```text
agent edits code
      |
      v
leanest playwright --changed --json
      |
      v
3 / 184 E2E tests relevant
      |
      v
run selected tests
      |
      v
agent continues
```

The same applies to Vitest and other adapters.

`--json` must expose stable structured data without requiring an agent
to parse terminal prose.

## E2E Is First-Class

E2E may be Leanest's strongest initial use case.

The cost of an E2E job includes more than individual test runtime:

- application startup;
- database/services;
- browser provisioning;
- fixtures/seeding;
- external test infrastructure;
- CI runner time.

Therefore Leanest must support **selection without execution**.

```bash
npx leanest select playwright --base origin/main
```

This allows CI to decide whether the E2E job should exist at all:

```text
git diff
   |
   v
Leanest selection
   |
   +-- 0 relevant E2E tests
   |        |
   |        v
   |    SKIP E2E JOB
   |
   +-- relevant E2E tests
            |
            v
       provision environment
       start application
       start browser
       run selected Playwright tests
```

A docs/config-only change could therefore avoid the entire E2E
environment.

## CI Usage

Leanest should require no dedicated GitHub integration.

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0

- run: npm ci

- name: Run relevant E2E tests
  run: npx leanest playwright --base origin/main
  env:
    TYPESAFE_API_KEY: ${{ secrets.TYPESAFE_API_KEY }}
```

The same CLI should work in GitLab CI, CircleCI, Buildkite, self-hosted
CI, and local shells.

## Shadow Mode and Ground Truth

Before real skipping is trusted, Leanest should support shadow mode.

```text
Leanest predicts subset
        |
        +---- would RUN
        +---- would SKIP
                 |
                 v
        but execute FULL suite
                 |
                 v
          compare prediction
          with ground truth
```

A **Miss** is:

```text
Decision.SKIP
AND
GroundTruth.FAIL
```

A miss is the catastrophic metric.

Local observations may eventually live under:

```text
.leanest/
  observations.jsonl
  cache/
```

This is not required for the first inspect-only POC.

## Metrics

Primary metric:

### Observed Failure Recall

```text
failing tests selected
----------------------
all tests that failed
```

Secondary metric:

### Test Reduction

```text
tests skipped
-------------
total tests
```

Generic classification accuracy is not an important product metric.

Passing tests are weak labels: a relevant test may still pass. A skipped
test that would have failed is the important negative outcome.

## POC: Falsify Before Building

The first implementation must **not skip tests**.

Build an inspect/ranking prototype first:

```bash
npx leanest inspect playwright
```

Example:

```text
0.998  auth > logs in
0.982  auth > refreshes expired session
0.913  account > loads authenticated profile
0.083  checkout > applies coupon
0.004  admin > creates organization
```

Do the same for Vitest.

The POC pipeline:

```text
git diff
   +
all discovered tests
   |
   v
Jev
   |
   v
relevance ranking
   |
   v
compare against known failing tests
```

Use real/historical changes where ground truth is known.

Produce a curve such as:

---

Selection Tests eliminated Observed failure recall
aggressiveness

---

extremely ? ?
conservative

conservative ? ?

moderate ? ?

aggressive ? ?
---------------------------------------------------------------------

The first go/no-go question is:

> **Do failing tests consistently concentrate at high semantic
> relevance?**

If Leanest cannot eliminate a useful fraction of the suite while retaining
extremely high observed failure recall, stop the project before building
the production selector.

## POC Implementation Order

1.  Verify the current TypeSafe/Jev SDK and make one real multi-question
    Jev request using `TYPESAFE_API_KEY`.
2.  Resolve a Git diff/change.
3.  Discover Playwright tests as individual test cases.
4.  Extract useful test source/context.
5.  Evaluate all Playwright tests with Jev.
6.  Print ranked relevance results.
7.  Repeat with Vitest.
8.  Run the experiment against known changes/failures.
9.  Measure failure-recall/reduction curves.
10. Only if results are compelling, implement actual selective
    execution, shadow history, caching, and polished CI behavior.

## Explicitly Out of Scope for the POC

- Leanest SaaS;
- accounts;
- dashboard;
- hosted database;
- GitHub App;
- custom test runner;
- AI code review;
- code fixing;
- test generation;
- flaky-test analysis;
- failure triage;
- generalized dependency graph;
- coverage platform;
- arbitrary framework support;
- pricing implementation;
- production-grade threshold selection before evidence exists.

## Naming

**Leanest** (formerly `jev-test`, then `Sieve` during early design).

The metaphor is:

```text
2,847 tests
     |
     v
   LEANEST
     |
     v
  183 tests
```

Potential package/CLI:

```bash
npm install -D leanest
npx leanest playwright
```

\# TypeSafe / Jev Design Guidance

The implementation agent **must read the current TypeSafe documentation
before designing the Jev integration**. Do not infer Jev behavior from
this specification alone, and do not treat Jev as a generic LLM API.

Primary references:

- TypeSafe --- How to build with TypeSafe / System One:
  https://docs.typesafe.ai/concepts/how-to-build-with-system-one
- TypeSafe --- Example use cases / use-case map:
  https://docs.typesafe.ai/concepts/use-case-map

The agent should also follow links from those pages to the current
SDK/API documentation, patterns, confidence guidance, parallel-questions
examples, and relevant cookbooks when implementation details depend on
them. TypeSafe's documentation may evolve; prefer the current docs over
stale assumptions in this file.

## System One principles Leanest should follow

TypeSafe's System One guidance maps unusually well to Leanest. Preserve
these principles in the implementation:

1.  **Code owns control flow.** Jev supplies narrow semantic judgments;
    Leanest's deterministic code decides RUN/SKIP, execution, failure
    handling, caching, and side effects.
2.  **Use code when the answer is deterministic.** Do not ask Jev
    whether a test changed, whether a path matches, whether
    configuration exists, or anything else normal code can establish
    reliably.
3.  **Send only relevant context.** Avoid dumping an entire repository
    into the state. Build focused change and verification-target
    context.
4.  **Use structured state.** Prefer explicit nested data for change
    metadata, changed code, test metadata, and test source rather than
    one giant prose prompt.
5.  **Ask narrow, atomic questions.** Avoid asking Jev to reason through
    the whole selection workflow or produce a list of tests to run.
6.  **Fan out independent questions.** Leanest's core economic hypothesis
    is that many narrow judgments over the same change can be evaluated
    in parallel.
7.  **Compose signals in code.** Jev probabilities remain inspectable
    signals. Thresholds, deterministic overrides, and any later
    weighted/model-based composition live outside Jev.
8.  **Route on uncertainty.** For Leanest, uncertainty routes toward RUN.
    A test is skipped only when the selection policy has sufficient
    evidence that skipping is safe.
9.  **Calibrate thresholds using real data.** Do not invent
    confidence/relevance cutoffs. Evaluate them against known ground
    truth.
10. **Do not turn System One into an agent.** Jev should not choose its
    next action, execute tests, mutate the repository, or control the
    workflow.

## Current Jev task shape

For the initial Leanest experiment, the best conceptual task shape is
**Detection**: obtain a probability that a property is present.

For each test:

> Could the current code change affect behavior verified by this test?

The POC may rank those probabilities for inspection, but ranking is an
analysis/output step rather than the fundamental semantic operation.

Leanest then performs deterministic routing:

```text
Change × TestCase
       |
       v
Jev Detection
       |
       v
semantic probability
       |
       v
Leanest policy
   |         |
   v         v
  RUN       SKIP
```

This also resembles TypeSafe's "AI Map Reduce over Big Data" category: a
potentially very large set of test candidates is evaluated with cheap
parallel semantic decisions.

## Future semantic features

The first POC should use the smallest useful semantic signal possible.
Do not prematurely create a large feature set.

If experiments show that one relevance probability is insufficient,
Leanest may later ask several independent atomic questions for each
verification target, for example:

```text
Could this change affect behavior verified by this target?
Could this change invalidate an assumption this target relies on?
How strongly is this target relevant to the changed behavior?
```

Those outputs can be combined with structured signals such as:

```text
test changed
coverage/dependency information
historical failure correlation
runtime cost
framework metadata
```

TypeSafe explicitly supports composing independent System One outputs in
deterministic code or using probabilities as features in a downstream
classical ML model. That gives Leanest a possible future path beyond a
single hard-coded threshold.

This is **future work**, not part of the initial falsification POC.

# Generalized Verification Model

Leanest's first implementation selects individual tests, but the
underlying product primitive is broader:

> **Given a code change, which existing verification work is relevant
> enough to execute?**

To avoid painting the architecture into a corner, treat `TestCase` as
the first concrete kind of a broader conceptual `VerificationTarget`.

```text
VerificationTarget
    |
    +-- TestCase          <- POC implements this
    |    +-- Playwright
    |    +-- Vitest
    |
    +-- TestSuite         <- future
    +-- CIJob             <- future
    +-- MatrixEntry       <- future
    +-- Environment       <- future
    +-- Validator         <- future
```

Do **not** implement all of these abstractions in the POC merely because
they are documented here. The purpose is to preserve the product
direction while keeping the experiment small.

## Future verification-selection use cases

If test-level selection succeeds, the same primitive may later apply to:

### E2E environment selection

Determine whether a change requires specific browsers, services,
databases, or external sandboxes.

```text
Chromium        RUN
Firefox         SKIP
WebKit          SKIP
Postgres        RUN
Stripe sandbox  SKIP
OAuth sandbox   RUN
```

### CI job selection

Determine which expensive verification jobs are relevant to a change.

```text
unit                 RUN
integration          RUN
playwright           RUN
visual-regression    SKIP
accessibility        SKIP
```

### CI matrix reduction

Select only relevant OS/runtime/database combinations rather than
blindly expanding every matrix entry.

### Expensive validators

Potential targets include visual regression, accessibility checks,
performance benchmarks, bundle-size checks, compatibility tests,
migration checks, and other existing verification steps.

### Coding-agent verification planning

After an agent edits code, Leanest can return the verification work
relevant to the edit instead of forcing the agent to guess which
tests/checks should run.

### Deployment verification

The same primitive could eventually select relevant smoke tests,
synthetics, migration checks, or post-deploy verification steps.

These are future directions. **The falsification POC remains
Playwright + Vitest TestCase selection.**

# Product Boundary

Leanest should remain about **selecting existing verification work**.

Do not expand Leanest into a generic semantic code linter, AI code
reviewer, security reviewer, policy engine, or agent harness merely
because TypeSafe can support those use cases.

The boundary is:

> **Leanest decides what existing verification needs to run after a
> change.**

It does not decide whether the code itself is good.
