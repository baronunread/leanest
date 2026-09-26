#!/usr/bin/env node

import { appendFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Leanest } from "./leanest.js";
import { MIN_CONFIDENCE, SelectionPolicy } from "./selection-policy.js";
import { runTests } from "./runner.js";
import type { SelectionResult, TestCase } from "./types.js";

export interface Flags {
  _: string[];
  changed?: boolean;
  json?: boolean;
  shadow?: boolean;
  full?: boolean;
  base?: string;
  dir?: string;
  /** Everything after `--`, forwarded to the test runner as-is. */
  passthrough?: string[];
  [key: string]: boolean | string | string[] | undefined;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const rawCommand = args[0] ?? "help";
  const command = rawCommand === "--help" ? "help" : rawCommand;
  const rest = rawCommand === "--help" ? args : args.slice(1);
  const flags = parseFlags(rest);
  const framework = flags._[0] ?? "playwright";
  const changed = flags.changed === true;
  const json = flags.json === true;
  const shadow = flags.shadow === true;
  const full = flags.full === true;
  const cwd = flags.dir ?? ".";
  const base = flags.base;
  const extra = flags.passthrough ?? [];

  const leanest = new Leanest(cwd, base);

  if (command === "help" || !command) {
    printHelp();
    return 0;
  }

  switch (command) {
    case "inspect": {
      const result = await leanest.inspect(framework);
      printInspect(result);
      return 0;
    }
    case "select": {
      const result = await leanest.select(framework, changed);
      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printSelect(result);
      }
      return 0;
    }
    case "playwright":
    case "vitest": {
      const result = await leanest.select(command, changed);
      if (result.totalTests === 0) {
        console.error(
          `No ${command} tests found in ${cwd}. Check --dir and your ${command} config.`,
        );
        return 1;
      }

      if (result.status === "error") {
        console.error(`⚠ Judge unavailable (${result.error}), running the full suite.`);
      }

      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printSelect(result);
      }
      appendReport(renderReport(command, cwd, result, shadow || full));

      const paths = result.selectedTests.map((t) => t.identity.path);
      const skippedPaths = result.skipped.map((t) => t.identity.path);

      if (shadow && skippedPaths.length > 0) {
        // Run the two halves separately: a failure in the skipped half is exactly
        // what selection alone would have missed.
        console.log(`\nShadow mode: running ${paths.length} selected test file(s)...`);
        const selectedCode = paths.length > 0 ? await runTests(command, paths, cwd, extra) : 0;
        console.log(`\nShadow mode: running ${skippedPaths.length} skipped test file(s)...`);
        const skippedCode = await runTests(command, skippedPaths, cwd, extra);
        const verdict =
          skippedCode === 0
            ? "Shadow mode: skipped tests passed, selection missed nothing."
            : "Shadow mode: MISS, skipped tests failed. Selection alone would have let this through.";
        console.log(`\n${verdict}`);
        appendReport(`\n**${verdict}**\n`);
        return selectedCode || skippedCode;
      }

      if (shadow || full) {
        console.log(`\nRunning the full suite (${shadow ? "--shadow" : "--full"})...`);
        return await runTests(command, [], cwd, extra);
      }

      if (result.selectedTests.length === 0) {
        console.log(`\nNothing to run.`);
        return 0;
      }

      console.log(`\nRunning ${command} on ${paths.length} selected test file(s)...`);
      return await runTests(command, paths, cwd, extra);
    }
    default: {
      console.error(`Unknown command: ${command}`);
      printHelp();
      return 1;
    }
  }
}

const VALUE_FLAGS = new Set(["base", "dir"]);

export function parseFlags(args: string[]): Flags {
  const flags: Flags = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      flags.passthrough = args.slice(i + 1);
      break;
    }
    if (arg?.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (VALUE_FLAGS.has(key) && next !== undefined && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (arg?.startsWith("-")) {
      flags[arg.slice(1)] = true;
    } else if (arg !== undefined) {
      flags._.push(arg);
    }
  }
  return flags;
}

function printInspect(result: any): void {
  const { change, discovered } = result;
  const noChanges = change.changedFiles.length === 0;
  if (noChanges && discovered.count > 0) {
    console.log(`No changes detected against ${change.base}...${change.head}`);
    console.log(`Evaluating all ${discovered.count} tests conservatively...\n`);
  } else {
    console.log(`Change: ${change.base}...${change.head}`);
    console.log(`\nChanged:`);
    for (const f of change.changedFiles.slice(0, 20)) {
      console.log(`  ${f}`);
    }
    if (change.changedFiles.length > 20) {
      console.log(`  ... and ${change.changedFiles.length - 20} more`);
    }
    console.log(``);
  }
  console.log(`Discovering ${discovered.framework} tests...`);
  console.log(`  ${discovered.count} tests found`);
  if (result.error) {
    console.log(
      `\n⚠ Judge unavailable (${result.error}), all ${discovered.count} tests would run.`,
    );
  }
  if (result.evaluated.length > 0) {
    console.log(`\nEvaluating semantic impact...`);
    console.log(`  ${result.evaluated.length} tests evaluated`);
    console.log(`\nSelected ${result.selected.length} / ${discovered.count} tests`);
    const policy = new SelectionPolicy();
    const ranked = result.evaluated.sort((a: any, b: any) => b.probability - a.probability);
    for (const entry of ranked.slice(0, 20)) {
      const decision = policy.decide(entry.probability, entry.confidence, false);
      console.log(`  ${decision} ${entry.test.identity.path}`);
    }
    if (ranked.length > 20) {
      console.log(`  ... and ${ranked.length - 20} more`);
    }
  }
  console.log(`\nSkipping ${result.skipped} tests.`);
}

/** One line on why the selected tests run, or null when there's nothing to explain. */
export function explainRuns(result: SelectionResult): string | null {
  const b = result.runBreakdown;
  if (!b || result.selectedTests.length === 0) return null;
  const parts = [
    b.rule > 0 ? `${b.rule} by rule` : "",
    b.judgeUnsure > 0 ? `${b.judgeUnsure} judge unsure (c < ${MIN_CONFIDENCE})` : "",
    b.judgeLikely > 0 ? `${b.judgeLikely} judged affected` : "",
  ].filter(Boolean);
  return `Why they run: ${parts.join(", ")}.`;
}

function printList(lines: string[]): void {
  for (const line of lines.slice(0, 20)) console.log(`  ${line}`);
  if (lines.length > 20) console.log(`  ... and ${lines.length - 20} more`);
}

function printSelect(result: SelectionResult): void {
  const noChanges = result.changedFiles.length === 0;
  if (noChanges && result.totalTests > 0) {
    console.log(`No changes detected.`);
    console.log(`Evaluating all ${result.totalTests} tests conservatively...\n`);
  } else {
    console.log(`Changed:`);
    printList(result.changedFiles);
    console.log(``);
  }
  console.log(`${result.totalTests} tests found`);
  console.log(`\nSelected ${result.selectedTests.length} / ${result.totalTests} tests`);
  const why = explainRuns(result);
  if (why) console.log(why);
  printList(
    result.selectedTests.map((t) => `RUN ${t.identity.path}  (${result.reasons[t.identity.path]})`),
  );
  if (result.skippedTests > 0) {
    const reasons = new Set(result.skipped.map((t) => result.reasons[t.identity.path]));
    // A suite rule gives every skip the same reason; say it once.
    const shared = reasons.size === 1 ? ` (${[...reasons][0]})` : "";
    console.log(`\nSkipping ${result.skippedTests} tests.${shared}`);
  }
}

// Written to the job summary, and to LEANEST_REPORT_FILE for the Action's PR comment.
function appendReport(markdown: string): void {
  for (const file of [process.env.GITHUB_STEP_SUMMARY, process.env.LEANEST_REPORT_FILE]) {
    if (file) appendFileSync(file, markdown);
  }
}

/** The Action finds its sticky PR comment by this first line: one comment per framework and dir. */
export const reportMarker = (command: string, dir: string) =>
  `<!-- leanest-report ${command} ${dir} -->`;

export function renderReport(
  command: string,
  dir: string,
  result: SelectionResult,
  runningAll: boolean,
): string {
  const row = (t: TestCase, decision: string) =>
    `| \`${t.identity.path}\` | ${decision} | ${result.reasons[t.identity.path] ?? ""} |`;
  const table = (rows: string[]) => [
    "| Test | Decision | Reason |",
    "| --- | --- | --- |",
    ...rows,
  ];
  const details = (summary: string, rows: string[]) =>
    rows.length === 0
      ? []
      : [`<details><summary>${summary}</summary>`, "", ...table(rows), "", "</details>", ""];
  const runRows = result.selectedTests.map((t) => row(t, "RUN"));
  const skipRows = result.skipped.map((t) => row(t, "SKIP"));
  const why = explainRuns(result);

  if (result.status === "error") {
    return [
      reportMarker(command, dir),
      `### leanest: all ${result.totalTests} ${command} test files run`,
      "",
      "> [!WARNING]",
      "> **The judge was unavailable, so leanest couldn't select tests and ran the full suite instead.**",
      `> Reason: \`${result.error}\``,
      ">",
      "> Nothing was skipped, so this run is as safe as not using leanest. The next run tries the judge again.",
      "",
      ...details(`${result.totalTests} test files, all RUN`, runRows),
    ].join("\n");
  }

  return [
    reportMarker(command, dir),
    `### leanest: ${result.selectedTests.length} of ${result.totalTests} ${command} test files selected`,
    "",
    ...(why ? [why, ""] : []),
    ...(runningAll ? ["The full suite runs anyway (`--shadow` or `--full`).", ""] : []),
    ...(runRows.length > 0 ? [...table(runRows), ""] : []),
    ...details(`${skipRows.length} skipped`, skipRows),
  ].join("\n");
}

function printHelp(): void {
  console.log(`Usage: leanest <command> [options]

Commands:
  inspect <framework>   Rank tests by relevance (no execution)
  select <framework>    Select tests to run vs skip (no execution)
  playwright [options]  Select, then actually run Playwright on the selection
  vitest [options]      Select, then actually run Vitest on the selection

Options:
  --changed             Only changed files
  --base <ref>          Base branch (default: main)
  --dir <path>          Target directory (default: current directory)
  --json                Output JSON
  --shadow              Run the full suite, but also log what would have been skipped
  --full                Skip selection, run the full suite
  -- <args>             Pass the remaining args to the test runner (e.g. -- --shard=1/3)
  --help                Show this help

Examples:
  npx leanest inspect playwright
  npx leanest select playwright --base origin/main
  npx leanest playwright --changed
  npx leanest playwright --changed --json
  npx leanest playwright --shadow
  npx leanest playwright --full
  npx leanest playwright -- --shard=1/3
  npx leanest inspect playwright --dir /path/to/repo
  leanest vitest --dir ~/projects/my-app --changed
`);
}

// Global installs run us through a symlink, so compare real paths, not raw argv.
const entry = process.argv[1];
if (entry && realpathSync(entry) === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
