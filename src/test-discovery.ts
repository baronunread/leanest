import { readFileSync, existsSync } from "fs";
import { Glob } from "bun";
import type { TestCase } from "./types.js";

export interface DiscoveryResult {
  framework: string;
  tests: TestCase[];
  count: number;
}

const FRAMEWORK_PATTERNS = {
  playwright: [
    "**/*.spec.ts",
    "**/*.spec.tsx",
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.pw.ts",
    "**/*.pw.tsx",
  ],
  vitest: ["**/*.spec.ts", "**/*.spec.tsx", "**/*.test.ts", "**/*.test.tsx"],
} satisfies Record<string, string[]>;

export class TestDiscovery {
  discoverPlaywright(baseDir: string = "."): DiscoveryResult {
    const testDir = this.readPlaywrightTestDir(baseDir);
    const scanDir = testDir ? `${baseDir === "." ? "" : `${baseDir}/`}${testDir}` : baseDir;
    const tests = this.discoverTests("playwright", scanDir);
    return { framework: "playwright", tests, count: tests.length };
  }

  private readPlaywrightTestDir(baseDir: string): string | null {
    for (const name of ["playwright.config.ts", "playwright.config.js", "playwright.config.mjs"]) {
      const configPath = `${baseDir === "." ? "." : baseDir}/${name}`;
      if (!existsSync(configPath)) continue;
      try {
        const source = readFileSync(configPath, "utf-8");
        const match = source.match(/testDir\s*:\s*["']([^"']+)["']/);
        if (match) return match[1].replace(/^\.\//, "");
      } catch {
        // fall through to default scan
      }
    }
    return null;
  }

  discoverVitest(baseDir: string = "."): DiscoveryResult {
    const tests = this.discoverTests("vitest", baseDir);
    return { framework: "vitest", tests, count: tests.length };
  }

  private discoverTests(framework: string, baseDir: string): TestCase[] {
    const tests: TestCase[] = [];
    // SAFETY: an unknown framework key just misses the lookup and falls back below
    const patterns =
      FRAMEWORK_PATTERNS[framework as keyof typeof FRAMEWORK_PATTERNS] ??
      FRAMEWORK_PATTERNS.playwright;
    const seen = new Set<string>();

    for (const pattern of patterns) {
      const glob = new Glob(pattern);
      for (const file of glob.scanSync({ cwd: baseDir })) {
        if (file.includes("node_modules/") || file.includes("dist/")) continue;
        const path = baseDir === "." ? file : `${baseDir}/${file}`;
        if (seen.has(path)) continue;
        seen.add(path);
        const test = this.extractTest(framework, path);
        if (test) tests.push(test);
      }
    }

    return tests;
  }

  private extractTest(framework: string, filePath: string): TestCase | null {
    try {
      const source = readFileSync(filePath, "utf-8");
      const dir = filePath.split("/").slice(0, -1).join("/");
      const filename = filePath.split("/").pop() ?? filePath;
      const hash = this.hashString(filePath);

      return {
        identity: {
          framework,
          path: filePath,
          suite: [dir],
          name: filename,
          hash,
        },
        source,
        context: source.slice(0, 500),
      };
    } catch {
      return null;
    }
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}
