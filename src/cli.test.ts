import { describe, expect, test } from "bun:test";
import { parseFlags, renderReport, REPORT_MARKER } from "./cli.js";
import type { SelectionResult, TestCase } from "./types.js";

describe("parseFlags", () => {
  test("reads --base and --dir as string values, not booleans", () => {
    const flags = parseFlags(["--base", "origin/main", "--dir", "."]);
    expect(flags.base).toBe("origin/main");
    expect(flags.dir).toBe(".");
    expect(flags._).toEqual([]);
  });

  test("keeps boolean flags as booleans", () => {
    const flags = parseFlags(["--changed", "--json", "--shadow", "--full"]);
    expect(flags.changed).toBe(true);
    expect(flags.json).toBe(true);
    expect(flags.shadow).toBe(true);
    expect(flags.full).toBe(true);
  });

  test("does not swallow the next flag as a value", () => {
    const flags = parseFlags(["--base", "--changed"]);
    // SAFETY: --base with no value falls through the index signature as a boolean flag
    expect(flags.base as unknown).toBe(true);
    expect(flags.changed).toBe(true);
  });

  test("collects bare positional args", () => {
    const flags = parseFlags(["playwright", "--changed"]);
    expect(flags._).toEqual(["playwright"]);
  });

  test("forwards everything after -- to the runner untouched", () => {
    const flags = parseFlags(["--full", "--", "--shard=1/3", "--project", "chromium"]);
    expect(flags.full).toBe(true);
    expect(flags.passthrough).toEqual(["--shard=1/3", "--project", "chromium"]);
    expect(flags.project).toBeUndefined();
  });
});

describe("renderReport", () => {
  const tc = (path: string): TestCase => ({
    identity: { framework: "playwright", path, suite: [], name: path, hash: path },
    source: "",
    context: "",
  });
  const result = (over: Partial<SelectionResult>): SelectionResult => ({
    command: "select",
    args: [],
    status: "complete",
    totalTests: 2,
    selectedTests: [tc("a.spec.ts")],
    skippedTests: 1,
    runTests: [tc("a.spec.ts")],
    skipped: [tc("b.spec.ts")],
    reasons: { "a.spec.ts": "test file changed", "b.spec.ts": "judge p=0.04 c=0.91" },
    changedFiles: [],
    diff: "",
    ...over,
  });

  test("starts with the marker, shows RUN rows, folds SKIP rows into details", () => {
    const md = renderReport("playwright", result({}), false);
    expect(md.startsWith(REPORT_MARKER)).toBe(true);
    expect(md).toContain("1 of 2 playwright test files selected");
    expect(md).toContain("| `a.spec.ts` | RUN | test file changed |");
    expect(md).toContain("<details><summary>1 skipped</summary>");
    expect(md.indexOf("<details>")).toBeLessThan(md.indexOf("| `b.spec.ts` | SKIP |"));
  });

  test("judge down: warning with the reason, every test still runs", () => {
    const md = renderReport(
      "playwright",
      result({
        status: "error",
        error: "classifier.dev error (503): upstream timeout",
        selectedTests: [tc("a.spec.ts"), tc("b.spec.ts")],
        skipped: [],
      }),
      false,
    );
    expect(md).toContain("all 2 playwright test files run");
    expect(md).toContain("> [!WARNING]");
    expect(md).toContain("> Reason: `classifier.dev error (503): upstream timeout`");
    expect(md).toContain("<details><summary>2 test files, all RUN</summary>");
  });
});
