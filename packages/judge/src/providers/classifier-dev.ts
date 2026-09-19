import type { JudgeAnswer, JudgeProvider, JudgeQuestion, JudgeState } from "../types.js";

const RUN_LABEL = "affected by this change";
const SKIP_LABEL = "not affected by this change";

interface ClassifierDevResult {
  scores: Record<string, number>;
  confidence: number;
}

export function classifierDevProvider(options?: { baseUrl?: string }): JudgeProvider {
  const baseUrl = options?.baseUrl ?? "https://classifier.dev";

  return {
    name: "classifier-dev",
    async evaluate(state: JudgeState, questions: Record<string, JudgeQuestion>) {
      const ids = Object.keys(questions);
      const inputs = ids.map((id) => {
        const question = questions[id];
        const test = state.tests.find((t) => t.id === id);
        const source = test ? `${test.path}\n${test.source}` : "";
        return `${question?.instructions ?? ""}\n\nCHANGE:\n${state.diff}\n\nTEST:\n${source}`;
      });

      const response = await fetch(`${baseUrl}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs, labels: [RUN_LABEL, SKIP_LABEL] }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`classifier.dev error (${response.status}): ${text}`);
      }

      // SAFETY: classifier.dev's batch endpoint returns one result per input, in order
      const data = (await response.json()) as { results: ClassifierDevResult[] };
      const answers: Record<string, JudgeAnswer> = {};
      ids.forEach((id, i) => {
        const result = data.results[i];
        answers[id] = {
          probability: result?.scores[RUN_LABEL] ?? 0,
          confidence: result?.confidence ?? 0,
        };
      });
      return answers;
    },
  };
}
