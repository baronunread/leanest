import type { TestCase } from "./types.js";

/** Below this judge confidence the probability isn't trusted, and the test runs. */
export const MIN_CONFIDENCE = 0.5;

// Files every test depends on: the runner's config, dependencies, and CI workflows.
const RUNNER_CONFIG = [
  /(^|\/)(playwright|vitest|vite)\.config\.[cm]?[jt]s$/,
  /(^|\/)package\.json$/,
  /(^|\/)(package-lock\.json|bun\.lockb?|pnpm-lock\.yaml|yarn\.lock)$/,
  /^\.github\/workflows\//,
];

/**
 * A decision for the whole suite that needs no judge: run everything when the runner's
 * own setup changed, skip everything when only Markdown changed. Null means ask per test.
 */
export function suiteRule(
  changedFiles: string[],
): { decision: "RUN" | "SKIP"; reason: string } | null {
  const config = changedFiles.find((f) => RUNNER_CONFIG.some((re) => re.test(f)));
  if (config) return { decision: "RUN", reason: `runner config changed: ${config}` };
  if (changedFiles.length > 0 && changedFiles.every((f) => f.endsWith(".md"))) {
    return { decision: "SKIP", reason: "only Markdown changed" };
  }
  return null;
}

export class SelectionPolicy {
  decide(
    probability: number | undefined | null,
    confidence: number | undefined | null,
    testChanged: boolean,
  ): "RUN" | "SKIP" {
    if (testChanged) return "RUN";
    if (probability === undefined || probability === null) return "RUN";
    if (confidence === undefined || confidence === null) return "RUN";
    if (confidence < MIN_CONFIDENCE) return "RUN";
    if (probability < 0.3) return "SKIP";
    return "RUN";
  }

  rank(tests: Array<{ test: TestCase; probability: number; confidence: number }>) {
    return [...tests].sort((a, b) => b.probability - a.probability);
  }
}
