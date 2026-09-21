import { readFileSync, existsSync, readdirSync } from "fs";
import path from "node:path";
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

    const suffixes = patterns.map((p) => p.slice(p.lastIndexOf("*") + 1));
    for (const file of this.walk(baseDir)) {
      if (!suffixes.some((suffix) => file.endsWith(suffix))) continue;
      const relative = path.relative(baseDir, file);
      const testPath = baseDir === "." ? relative : `${baseDir}/${relative}`;
      if (seen.has(testPath)) continue;
      seen.add(testPath);
      const test = this.extractTest(framework, testPath);
      if (test) tests.push(test);
    }

    return tests;
  }

  private walk(dir: string): string[] {
    let entries: import("fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.walk(full));
      } else {
        files.push(full);
      }
    }
    return files;
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
