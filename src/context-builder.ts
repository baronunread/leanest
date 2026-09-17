import type { ChangeContext, TestCase } from "./types.js";

export class ContextBuilder {
  buildState(change: ChangeContext, tests: TestCase[]) {
    return {
      changedFiles: change.changedFiles,
      diff: change.diff.slice(0, 15000),
      base: change.base,
      head: change.head,
      tests: tests.map((t) => ({
        id: t.identity.hash,
        path: t.identity.path,
        suite: t.identity.suite,
        name: t.identity.name,
        source: t.source.slice(0, 2000),
      })),
    };
  }
}
