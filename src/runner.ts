import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const FRAMEWORKS = new Set(["playwright", "vitest"]);

export function buildRunCommand(
  framework: string,
  paths: string[],
  cwd: string,
  extra: string[] = [],
): string[] {
  const name = FRAMEWORKS.has(framework) ? framework : "playwright";
  const localBin = path.join(cwd, "node_modules", ".bin", name);
  // ponytail: prefer the locally installed binary; fall back to npx for global/workspace installs
  const runner = existsSync(localBin) ? localBin : "npx";
  const args = existsSync(localBin) ? [] : [name];
  // Discovery paths are relative to where leanest started; the runner runs inside cwd.
  const local = paths.map((p) => path.relative(cwd, p));
  return [runner, ...args, name === "vitest" ? "run" : "test", ...local, ...extra];
}

export async function runTests(
  framework: string,
  paths: string[],
  cwd: string,
  extra: string[] = [],
): Promise<number> {
  const [cmd, ...args] = buildRunCommand(framework, paths, cwd, extra);
  return await new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: "inherit" });
    proc.on("exit", (code) => resolve(code ?? 1));
    proc.on("error", reject);
  });
}
