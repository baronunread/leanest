import type { JudgeAnswer, JudgeProvider, JudgeQuestion, JudgeState } from "../types.js";

interface JevResponse {
  answers: Record<string, { noul?: number; confidence?: number }>;
}

export function jevProvider(options?: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): JudgeProvider {
  const apiKey = options?.apiKey ?? process.env.TYPESAFE_API_KEY ?? "";
  const baseUrl = options?.baseUrl ?? process.env.TYPESAFE_API_BASE ?? "https://api.typesafe.ai/v1";
  const model = options?.model ?? process.env.TYPESAFE_MODEL ?? "jev-latest";

  return {
    name: "jev",
    async evaluate(state: JudgeState, questions: Record<string, JudgeQuestion>) {
      if (!apiKey) {
        throw new Error("TYPESAFE_API_KEY is not set. Export it or create a .env file.");
      }

      const jevQuestions = Object.fromEntries(
        Object.entries(questions).map(([id, q]) => [
          id,
          { type: "noul", instructions: q.instructions },
        ]),
      );

      const response = await fetch(`${baseUrl}/systemone`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ state, questions: jevQuestions, model }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`TypeSafe API error (${response.status}): ${text}`);
      }

      // SAFETY: TypeSafe /v1/systemone always returns a JSON response matching JevResponse shape
      const data = (await response.json()) as JevResponse;
      const answers: Record<string, JudgeAnswer> = {};
      for (const [id, answer] of Object.entries(data.answers)) {
        answers[id] = { probability: answer.noul ?? 0, confidence: extractConfidence(answer) };
      }
      return answers;
    },
  };
}

function extractConfidence(answer: { noul?: number; confidence?: number }): number {
  // Jev's "noul" answers carry no explicit confidence field. Derive it from
  // how decisive the probability itself is: a noul near 0 or 1 is a
  // confident answer, a noul near 0.5 is genuine uncertainty (fail open).
  if (answer.confidence !== undefined) return answer.confidence;
  const noul = answer.noul ?? 0.5;
  return Math.abs(noul - 0.5) * 2;
}
