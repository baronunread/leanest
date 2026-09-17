const RUN_COMMANDS = {
  playwright: (paths: string[]) => ["bunx", "playwright", "test", ...paths],
  vitest: (paths: string[]) => ["bunx", "vitest", "run", ...paths],
} satisfies Record<string, (paths: string[]) => string[]>;

export function buildRunCommand(framework: string, paths: string[]): string[] {
  // SAFETY: an unknown framework key just misses the lookup and falls back below
  const build = RUN_COMMANDS[framework as keyof typeof RUN_COMMANDS] ?? RUN_COMMANDS.playwright;
  return build(paths);
}

export async function runTests(framework: string, paths: string[], cwd: string): Promise<number> {
  const argv = buildRunCommand(framework, paths);
  const proc = Bun.spawn(argv, { cwd, stdio: ["inherit", "inherit", "inherit"] });
  return await proc.exited;
}
