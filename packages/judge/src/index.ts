import { jevProvider } from "./providers/jev.js";
import { classifierDevProvider } from "./providers/classifier-dev.js";
import { layaProvider } from "./providers/laya.js";
import type { JudgeProvider } from "./types.js";

export type { JudgeProvider, JudgeState, JudgeQuestion, JudgeAnswer } from "./types.js";

const registry = {
  jev: jevProvider,
  "classifier-dev": classifierDevProvider,
  laya: layaProvider,
} satisfies Record<string, () => JudgeProvider>;

export function getProvider(
  name: string = process.env.LEANEST_PROVIDER ?? "classifier-dev",
): JudgeProvider {
  const entry = Object.entries(registry).find(([key]) => key === name);
  if (!entry) {
    throw new Error(`Unknown provider "${name}". Options: ${Object.keys(registry).join(", ")}`);
  }
  return entry[1]();
}
