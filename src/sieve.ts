import { JevClient, type JevQuestion, type JevResponse } from "./jev-client.js";
import { ChangeResolver } from "./git-diff.js";
import { TestDiscovery } from "./test-discovery.js";
import { ContextBuilder } from "./context-builder.js";
import { SelectionPolicy } from "./selection-policy.js";
import type { TestCase, SelectionResult, PipelineResult } from "./types.js";

export class Sieve {
  private jev: JevClient;
  private git: ChangeResolver;
  private discovery: TestDiscovery;
  private context: ContextBuilder;
  private policy: SelectionPolicy;

  private cwd: string;

  constructor(cwd?: string, baseRef?: string) {
    this.cwd = cwd ?? ".";
    this.jev = new JevClient();
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
    let response: JevResponse;
    try {
      response = await this.jev.evaluate(state, questions);
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

    const evaluated = discovery.tests.map((test, _i) => {
      const answer = response.answers[test.identity.hash];
      const probability = extractNoul(answer);
      const confidence = extractConfidence(answer);
      return { test, probability, confidence };
    });

    const ranked = this.policy.rank(evaluated);
    const selected = ranked
      .filter((e) => this.policy.decide(e.probability, e.confidence, false) === "RUN")
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
        changedFiles: change.changedFiles,
        diff: change.diff,
      };
    }

    const state = this.context.buildState(change, tests);
    const questions = this.buildQuestions(tests, change.changedFiles.length === 0);
    let response: JevResponse;
    try {
      response = await this.jev.evaluate(state, questions);
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
        changedFiles: change.changedFiles,
        diff: change.diff,
      };
    }

    const evaluated = tests.map((test, _i) => {
      const answer = response.answers[test.identity.hash];
      return {
        test,
        probability: extractNoul(answer),
        confidence: extractConfidence(answer),
      };
    });

    const ranked = this.policy.rank(evaluated);
    const runTests: TestCase[] = [];
    const skipTests: TestCase[] = [];

    for (const entry of ranked) {
      if (this.policy.decide(entry.probability, entry.confidence, false) === "RUN") {
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
      changedFiles: change.changedFiles,
      diff: change.diff,
    };
  }

  private buildQuestions(tests: TestCase[], noChanges: boolean = false) {
    const questions: Record<string, JevQuestion> = {};
    for (const test of tests) {
      questions[test.identity.hash] = {
        type: "noul",
        instructions: noChanges
          ? `No code changes detected. Could ${test.identity.framework} test at ${test.identity.path} still be affected by any latent issue?`
          : `Could the current code change affect behavior verified by ${test.identity.framework} test at ${test.identity.path}?`,
      };
    }
    return questions;
  }
}

function extractNoul(answer: { noul?: number; confidence?: number }): number {
  return answer.noul ?? 0;
}

function extractConfidence(answer: { noul?: number; confidence?: number }): number {
  // The API's "noul" answers carry no explicit confidence field. Derive it
  // from how decisive the probability itself is: a noul near 0 or 1 is a
  // confident answer, a noul near 0.5 is genuine uncertainty (fail open).
  if (answer.confidence !== undefined) return answer.confidence;
  const noul = answer.noul ?? 0.5;
  return Math.abs(noul - 0.5) * 2;
}

export async function runSieve(framework: string, command: string, cwd?: string): Promise<any> {
  const sieve = new Sieve(cwd);
  if (command === "inspect") {
    return await sieve.inspect(framework);
  }
  return await sieve.select(framework);
}
