import { describe, expect, test } from "bun:test";
import { touchesSameRoute } from "./route-heuristic.js";
import type { TestCase } from "./types.js";

function testCase(path: string, source: string): TestCase {
  return {
    identity: { framework: "playwright", path, suite: [], name: path, hash: path },
    source,
    context: source,
  };
}

describe("touchesSameRoute", () => {
  test("matches a page.goto against a same-named route file", () => {
    const t = testCase("tests/e2e/downgrade.pw.ts", `await page.goto("/admin/users");`);
    expect(touchesSameRoute(t, ["src/app/routes/admin/users.tsx"])).toBe(true);
  });

  test("matches a sub-path under the route", () => {
    const t = testCase("tests/e2e/downgrade.pw.ts", `await page.goto("/admin/users/42");`);
    expect(touchesSameRoute(t, ["src/app/routes/admin/users.tsx"])).toBe(true);
  });

  test("does not match on a single generic segment", () => {
    const t = testCase("tests/e2e/billing.pw.ts", `await page.goto("/admin/billing");`);
    expect(touchesSameRoute(t, ["src/worker/routes/admin.ts"])).toBe(false);
  });

  test("does not match an unrelated route", () => {
    const t = testCase("tests/e2e/downgrade.pw.ts", `await page.goto("/dashboard");`);
    expect(touchesSameRoute(t, ["src/app/routes/admin/users.tsx"])).toBe(false);
  });

  test("ignores template-literal interpolations", () => {
    const t = testCase("tests/e2e/x.pw.ts", "await page.request.get(`${appUrl}/admin/users`);");
    expect(touchesSameRoute(t, ["src/app/routes/admin/users.tsx"])).toBe(false);
  });
});
