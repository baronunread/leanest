import type { Laya, NoulQuestion } from "@receptron/laya";
import type { JudgeAnswer, JudgeProvider, JudgeQuestion, JudgeState } from "../types.js";

export function layaProvider(): JudgeProvider {
  let instance: Laya | undefined;

  return {
    name: "laya",
    async evaluate(state: JudgeState, questions: Record<string, JudgeQuestion>) {
      if (!instance) {
        try {
          // Optional dependency: only installed/downloaded when the laya provider is actually selected.
          const { Laya: LayaClass } = await import("@receptron/laya");
          instance = await LayaClass.load();
        } catch {
          throw new Error(
            "The laya provider requires @receptron/laya. Install it with: bun add @receptron/laya",
          );
        }
      }

      const layaQuestions = Object.fromEntries(
        Object.entries(questions).map(([id, q]) => [
          id,
          { type: "noul", instructions: q.instructions } satisfies NoulQuestion,
        ]),
      );

      const result = await instance.systemOne(state, layaQuestions);
      const answers: Record<string, JudgeAnswer> = {};
      for (const [id, answer] of Object.entries(result.answers)) {
        answers[id] = { probability: answer.noul, confidence: Math.abs(answer.noul - 0.5) * 2 };
      }
      return answers;
    },
  };
}
