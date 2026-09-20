import { dirname, join, relative } from "path";
import type { TestCase } from "./types.js";

// ponytail: regex-based specifier extraction, not a real parser -- TypeScript
// 7's package no longer exposes the classic AST API, and a full parser
// dependency is overkill for "does this string literal look like an import".
// Ceiling: relative imports only (no tsconfig path aliases), one hop (the
// test's own imports, not transitive), and it can't see e2e route-level
// coupling at all -- a Playwright test that hits a page through the browser
// has no static import to that page's source. See route-heuristic.ts for
// that case. Remaining upgrade path here: resolve tsconfig path aliases.
const IMPORT_RE = /(?:from|import)\s*\(?\s*["'](\.[^"']+)["']|require\(\s*["'](\.[^"']+)["']\s*\)/g;
const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

export function importsChangedFile(test: TestCase, changedFiles: string[], cwd: string): boolean {
  const changed = new Set(changedFiles);
  const testDir = dirname(join(cwd, test.identity.path));

  for (const match of test.source.matchAll(IMPORT_RE)) {
    const specifier = match[1] ?? match[2];
    if (!specifier) continue;
    const base = join(testDir, specifier);
    for (const ext of EXTENSIONS) {
      if (changed.has(toPosixRelative(cwd, base + ext))) return true;
      if (ext && changed.has(toPosixRelative(cwd, join(base, `index${ext}`)))) return true;
    }
  }
  return false;
}

function toPosixRelative(cwd: string, absolutePath: string): string {
  return relative(cwd, absolutePath).split("\\").join("/");
}
