import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { TestDiscovery } from "./test-discovery.js";

describe("TestDiscovery.discoverPlaywright", () => {
  const root = mkdtempSync(join(tmpdir(), "leanest-discovery-"));

  beforeAll(() => {
    mkdirSync(join(root, "tests/e2e"), { recursive: true });
    mkdirSync(join(root, "tests/unit"), { recursive: true });
    writeFileSync(join(root, "playwright.config.ts"), `export default { testDir: "./tests/e2e" };`);
    writeFileSync(join(root, "tests/e2e/checkout.pw.ts"), `test("x", () => {});`);
    writeFileSync(join(root, "tests/unit/math.test.ts"), `test("y", () => {});`);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("finds .pw.ts files under the config's testDir", () => {
    const result = new TestDiscovery().discoverPlaywright(root);
    const paths = result.tests.map((t) => t.identity.path);
    expect(paths.some((p) => p.endsWith("tests/e2e/checkout.pw.ts"))).toBe(true);
  });

  test("does not pull in unit tests outside testDir", () => {
    const result = new TestDiscovery().discoverPlaywright(root);
    const paths = result.tests.map((t) => t.identity.path);
    expect(paths.some((p) => p.includes("tests/unit"))).toBe(false);
  });
});
