import {
  getProvider,
  type JudgeProvider,
  type JudgeQuestion,
} from "../packages/judge/src/index.js";
import { ChangeResolver, type GitChange } from "./git-diff.js";
import { TestDiscovery } from "./test-discovery.js";
import { ContextBuilder } from "./context-builder.js";
import { SelectionPolicy } from "./selection-policy.js";
import { importsChangedFile } from "./import-graph.js";
import { touchesSameRoute } from "./route-heuristic.js";
import type { TestCase, SelectionResult, PipelineResult } from "./types.js";

export class Leanest {
  private judge: JudgeProvider;
  private git: ChangeResolver;
  private discovery: TestDiscovery;
  private context: ContextBuilder;
  private policy: SelectionPolicy;

  private cwd: string;

  constructor(cwd?: string, baseRef?: string) {
    this.cwd = cwd ?? ".";
    // A bad provider name fails at evaluate(), so it gets the same full-suite fallback
    // as any other judge failure instead of crashing before a report is written.
    try {
      this.judge = getProvider();
    } catch (error) {
      this.judge = { name: "unavailable", evaluate: () => Promise.reject(error) };
    }
    this.git = new ChangeResolver(baseRef, this.cwd);
    this.discovery = new TestDiscovery();
    this.context = new ContextBuilder();
    this.policy = new SelectionPolicy();
  }

  async inspect(framework: string): Promise<PipelineResult> {
    const change = this.git.resolve();
    const discovery =
      framework === "playwright"
        ? this.discovery.discoverPlaywright(this.cwd)
        : this.discovery.discoverVitest(this.cwd);

    if (discovery.tests.length === 0) {
      return {
        change,
        discovered: { framework, count: 0, tests: [] },
        evaluated: [],
        selected: [],
        skipped: 0,
        decision: "RUN",
      };
    }

    const state = this.context.buildState(change, discovery.tests);
    const questions = this.buildQuestions(discovery.tests, change.changedFiles.length === 0);
    let answers: Record<string, { probability: number; confidence: number }>;
    try {
      answers = await this.judge.evaluate(state, questions);
    } catch {
      return {
        change,
        discovered: { framework, count: discovery.tests.length, tests: discovery.tests },
        evaluated: [],
        selected: [],
        skipped: 0,
        decision: "RUN",
      };
    }

    const evaluated = discovery.tests.map((test) => {
      const answer = answers[test.identity.hash];
      return { test, probability: answer?.probability ?? 0, confidence: answer?.confidence ?? 0 };
    });

    const ranked = this.policy.rank(evaluated);
    const selected = ranked
      .filter(
        (e) =>
          this.policy.decide(
            e.probability,
            e.confidence,
            this.deterministicReason(e.test, change) !== null,
          ) === "RUN",
      )
      .map((e) => e.test);

    return {
      change,
      discovered: { framework, count: discovery.tests.length, tests: discovery.tests },
      evaluated,
      selected,
      skipped: discovery.tests.length - selected.length,
      decision: "RUN",
    };
  }

  async select(framework: string, changedOnly: boolean = false): Promise<SelectionResult> {
    const change = changedOnly ? this.git.resolveChangedOnly() : this.git.resolve();
    const discovery =
      framework === "playwright"
        ? this.discovery.discoverPlaywright(this.cwd)
        : this.discovery.discoverVitest(this.cwd);

    const tests = discovery.tests;
    if (tests.length === 0) {
      return {
        command: "select",
        args: [framework],
        status: "complete",
        totalTests: 0,
        selectedTests: [],
        skippedTests: 0,
        runTests: [],
        skipped: [],
        reasons: {},
        changedFiles: change.changedFiles,
        diff: change.diff,
      };
    }

    const state = this.context.buildState(change, tests);
    const questions = this.buildQuestions(tests, change.changedFiles.length === 0);
    let answers: Record<string, { probability: number; confidence: number }>;
    try {
      answers = await this.judge.evaluate(state, questions);
    } catch (error) {
      return {
        command: "select",
        args: [framework],
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        totalTests: tests.length,
        selectedTests: tests,
        skippedTests: 0,
        runTests: tests,
        skipped: [],
        reasons: Object.fromEntries(tests.map((t) => [t.identity.path, "judge unavailable"])),
        changedFiles: change.changedFiles,
        diff: change.diff,
      };
    }

    const evaluated = tests.map((test) => {
      const answer = answers[test.identity.hash];
      return {
        test,
        probability: answer?.probability ?? 0,
        confidence: answer?.confidence ?? 0,
      };
    });

    const ranked = this.policy.rank(evaluated);
    const runTests: TestCase[] = [];
    const skipTests: TestCase[] = [];
    const reasons: Record<string, string> = {};

    for (const entry of ranked) {
      const deterministic = this.deterministicReason(entry.test, change);
      reasons[entry.test.identity.path] =
        deterministic ?? `judge p=${entry.probability.toFixed(2)} c=${entry.confidence.toFixed(2)}`;
      if (
        this.policy.decide(entry.probability, entry.confidence, deterministic !== null) === "RUN"
      ) {
        runTests.push(entry.test);
      } else {
        skipTests.push(entry.test);
      }
    }

    return {
      command: "select",
      args: [framework],
      status: "complete",
      totalTests: tests.length,
      selectedTests: runTests,
      skippedTests: skipTests.length,
      runTests,
      skipped: skipTests,
      reasons,
      changedFiles: change.changedFiles,
      diff: change.diff,
    };
  }

  private deterministicReason(test: TestCase, change: GitChange): string | null {
    if (change.changedFiles.includes(test.identity.path)) return "test file changed";
    if (importsChangedFile(test, change.changedFiles, this.cwd)) return "imports a changed file";
    if (touchesSameRoute(test, change.changedFiles)) return "touches a changed route";
    return null;
  }

  private buildQuestions(tests: TestCase[], noChanges: boolean = false) {
    const questions: Record<string, JudgeQuestion> = {};
    for (const test of tests) {
      questions[test.identity.hash] = {
        instructions: noChanges
          ? `No code changes detected. Could ${test.identity.framework} test at ${test.identity.path} still be affected by any latent issue?`
          : `Could the current code change affect behavior verified by ${test.identity.framework} test at ${test.identity.path}?`,
      };
    }
    return questions;
  }
}

export async function runLeanest(framework: string, command: string, cwd?: string): Promise<any> {
  const leanest = new Leanest(cwd);
  if (command === "inspect") {
    return await leanest.inspect(framework);
  }
  return await leanest.select(framework);
}
