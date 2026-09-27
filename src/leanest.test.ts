import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Leanest } from "./leanest.js";

// A real git repo, so the whole-suite rules run end to end. Neither case calls the judge.
// Runs from the repo root with dir ".", like the Action's default.
describe("Leanest.select with a Markdown-only change", () => {
  const root = mkdtempSync(join(tmpdir(), "leanest-suite-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: root });

  const startDir = process.cwd();

  beforeAll(() => {
    process.chdir(root);
    git("init", "-q");
    writeFileSync(join(root, "terms.md"), "v1");
    writeFileSync(join(root, "README.md"), "v1");
    writeFileSync(
      join(root, "terms.test.ts"),
      `import terms from "./terms.md";\ntest("x", () => {});`,
    );
    writeFileSync(join(root, "math.test.ts"), `test("y", () => {});`);
    git("add", ".");
    git("commit", "-qm", "base");
  });

  afterAll(() => {
    process.chdir(startDir);
    rmSync(root, { recursive: true, force: true });
  });

  const change = (file: string) => {
    writeFileSync(join(root, file), `${Date.now()}`);
    git("commit", "-qam", file);
  };
  const names = (tests: { identity: { path: string } }[]) =>
    tests.map((t) => t.identity.path.split("/").pop());

  test("skips everything when no test depends on the Markdown", async () => {
    change("README.md");
    const result = await new Leanest(".", "HEAD~1").select("vitest");
    expect(result.selectedTests).toEqual([]);
    expect(result.suiteReason).toBe("only Markdown changed");
  });

  test("still runs a test that imports the changed Markdown", async () => {
    change("terms.md");
    const result = await new Leanest(".", "HEAD~1").select("vitest");
    expect(names(result.selectedTests)).toEqual(["terms.test.ts"]);
    expect(names(result.skipped)).toEqual(["math.test.ts"]);
    // The rule no longer explains every test, so no shared reason.
    expect(result.suiteReason).toBeUndefined();
  });
});
