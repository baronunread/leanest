import { describe, expect, test } from "bun:test";
import { parseFlags } from "./cli.js";

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
});
