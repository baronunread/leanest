import { describe, expect, test } from "bun:test";
import { buildRunCommand } from "./runner.js";

describe("buildRunCommand", () => {
  test("makes test paths relative to the runner's directory", () => {
    const cmd = buildRunCommand("vitest", ["apps/web/tests/a.test.ts"], "apps/web", [
      "--shard=1/2",
    ]);
    expect(cmd.slice(-3)).toEqual(["run", "tests/a.test.ts", "--shard=1/2"]);
  });
});
