import type { TestCase } from "./types.js";

// ponytail: many frameworks name route/page files after the URL they serve
// (file-based routers, or just descriptive convention, e.g.
// src/app/routes/admin/users.tsx -> /admin/users). This matches a changed
// file's path-derived route fragment against literal URL strings the test
// navigates to or requests -- catching page.goto("/admin/users") coupling
// that a static import graph can never see (e2e tests don't import the
// page source they exercise). It's a naming heuristic, not a router parser:
// silently does nothing for codebases that don't name files this way
// (programmatic route tables, GraphQL, RPC), and requires >=2 meaningful
// path segments so a single generic word like "admin" doesn't match every
// test under that prefix. Upgrade path: parse a real route manifest/router
// config when the framework exposes one.
const STRIP_SEGMENTS = new Set(["src", "app", "pages", "routes", "route", "worker", "index"]);
const URL_RE = /["'`](\/[a-zA-Z0-9][a-zA-Z0-9/_-]*)["'`]/g;

function routeFragment(filePath: string): string[] {
  return filePath
    .replace(/\.[a-z]+$/i, "")
    .split("/")
    .filter((segment) => segment.length > 0 && !STRIP_SEGMENTS.has(segment.toLowerCase()));
}

export function touchesSameRoute(test: TestCase, changedFiles: string[]): boolean {
  const testUrls = [...test.source.matchAll(URL_RE)].map((m) => m[1]!.toLowerCase());
  if (testUrls.length === 0) return false;

  for (const file of changedFiles) {
    const fragment = routeFragment(file);
    if (fragment.length < 2) continue;
    const routeGuess = `/${fragment.join("/").toLowerCase()}`;
    if (testUrls.some((url) => url === routeGuess || url.startsWith(`${routeGuess}/`))) {
      return true;
    }
  }
  return false;
}
