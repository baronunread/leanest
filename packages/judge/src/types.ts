export interface JudgeState {
  changedFiles: string[];
  diff: string;
  base: string;
  head: string;
  tests: Array<{ id: string; path: string; suite: string[]; name: string; source: string }>;
}

export interface JudgeQuestion {
  instructions: string;
}

export interface JudgeAnswer {
  probability: number;
  confidence: number;
}

export interface JudgeProvider {
  name: string;
  evaluate(
    state: JudgeState,
    questions: Record<string, JudgeQuestion>,
  ): Promise<Record<string, JudgeAnswer>>;
}
