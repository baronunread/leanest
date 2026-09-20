import { describe, expect, test } from "bun:test";
import { importsChangedFile } from "./import-graph.js";
import type { TestCase } from "./types.js";

function testCase(path: string, source: string): TestCase {
  return {
    identity: { framework: "vitest", path, suite: [], name: path, hash: path },
    source,
    context: source,
  };
}

describe("importsChangedFile", () => {
  test("matches a relative import resolving to a changed file", () => {
    const t = testCase(
      "tests/unit/checkout.test.ts",
      `import { total } from "../../src/checkout";`,
    );
    expect(importsChangedFile(t, ["src/checkout.ts"], ".")).toBe(true);
  });

  test("matches a bare require() of a changed file", () => {
    const t = testCase(
      "tests/unit/checkout.test.ts",
      `const { total } = require("../../src/checkout");`,
    );
    expect(importsChangedFile(t, ["src/checkout.ts"], ".")).toBe(true);
  });

  test("does not match an unrelated changed file", () => {
    const t = testCase(
      "tests/unit/checkout.test.ts",
      `import { total } from "../../src/checkout";`,
    );
    expect(importsChangedFile(t, ["src/billing.ts"], ".")).toBe(false);
  });

  test("ignores non-relative (package) specifiers", () => {
    const t = testCase("tests/unit/checkout.test.ts", `import { z } from "zod";`);
    expect(importsChangedFile(t, ["node_modules/zod/index.ts"], ".")).toBe(false);
  });
});
