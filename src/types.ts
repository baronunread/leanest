export interface TestIdentity {
  framework: string;
  path: string;
  suite: string[];
  name: string;
  hash: string;
}

export interface TestCase {
  identity: TestIdentity;
  source: string;
  context: string;
  relevance?: number;
  decision?: "RUN" | "SKIP";
}

export interface ChangeContext {
  base: string;
  head: string;
  changedFiles: string[];
  diff: string;
  baseRef: string;
}

export interface TestContext {
  framework: string;
  relativePath: string;
  suite: string[];
  testName: string;
  source: string;
  helperContext: string;
}

export interface SelectionResult {
  command: string;
  args: string[];
  status: string;
  error?: string;
  totalTests: number;
  selectedTests: TestCase[];
  skippedTests: number;
  runTests: TestCase[];
  skipped: TestCase[];
  /** Why each test path was run or skipped. */
  reasons: Record<string, string>;
  decision?: string;
  changedFiles: string[];
  diff: string;
}

export interface PipelineResult {
  change: ChangeContext;
  discovered: { framework: string; count: number; tests: TestCase[] };
  evaluated: Array<{
    test: TestCase;
    probability: number;
    confidence: number;
  }>;
  selected: TestCase[];
  skipped: number;
  decision: "RUN" | "SKIP";
}
