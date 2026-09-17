import { describe, expect, test } from "bun:test";
import { SelectionPolicy } from "./selection-policy.js";

describe("SelectionPolicy.decide", () => {
  const policy = new SelectionPolicy();

  test("always runs a test whose own file changed", () => {
    expect(policy.decide(0.01, 0.99, true)).toBe("RUN");
  });

  test("runs when confidence is too low to trust the probability", () => {
    expect(policy.decide(0.1, 0.4, false)).toBe("RUN");
  });

  test("skips a confidently low-probability test", () => {
    expect(policy.decide(0.1, 0.8, false)).toBe("SKIP");
  });

  test("runs a confidently high-probability test", () => {
    expect(policy.decide(0.9, 0.8, false)).toBe("RUN");
  });

  test("fails open on missing probability or confidence", () => {
    expect(policy.decide(undefined, 0.9, false)).toBe("RUN");
    expect(policy.decide(0.1, undefined, false)).toBe("RUN");
  });
});
