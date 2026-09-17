import type { TestCase } from "./types.js";

export class SelectionPolicy {
  decide(
    probability: number | undefined | null,
    confidence: number | undefined | null,
    testChanged: boolean,
  ): "RUN" | "SKIP" {
    if (testChanged) return "RUN";
    if (probability === undefined || probability === null) return "RUN";
    if (confidence === undefined || confidence === null) return "RUN";
    if (confidence < 0.5) return "RUN";
    if (probability < 0.3) return "SKIP";
    return "RUN";
  }

  rank(tests: Array<{ test: TestCase; probability: number; confidence: number }>) {
    return [...tests].sort((a, b) => b.probability - a.probability);
  }
}
