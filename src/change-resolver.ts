import { execSync } from "child_process";

export interface GitChange {
  base: string;
  head: string;
  changedFiles: string[];
  diff: string;
  baseRef: string;
}

export class ChangeResolver {
  private baseRef: string;

  constructor(baseRef?: string) {
    this.baseRef = baseRef ?? "main";
  }

  resolve(headRef?: string): GitChange {
    const head = headRef ?? "HEAD";
    const base = this.baseRef;
    try {
      // SAFETY: execSync returns a Buffer, we convert to string for text processing
      const diff = execSync(`git diff ${base}...${head}`, { timeout: 30000 }) as Buffer;
      // SAFETY: execSync returns a Buffer, we convert to string for file listing
      const filesOutput = execSync(`git diff ${base}...${head} --name-only`, {
        timeout: 30000,
      }) as Buffer;
      const changedFiles: string[] = filesOutput
        .toString()
        .trim()
        .split("\n")
        .filter((f: string) => f.length > 0);
      return {
        base,
        head,
        changedFiles,
        diff: diff.toString(),
        baseRef: base,
      };
    } catch {
      return {
        base,
        head,
        changedFiles: [],
        diff: "",
        baseRef: base,
      };
    }
  }

  resolveChangedOnly(): GitChange {
    try {
      // SAFETY: execSync returns a Buffer, we convert to string for file listing
      const diff = execSync(`git diff --name-only`, { timeout: 30000 }) as Buffer;
      const changedFiles: string[] = diff
        .toString()
        .trim()
        .split("\n")
        .filter((f: string) => f.length > 0);
      return {
        base: "working-tree",
        head: "HEAD",
        changedFiles,
        diff: diff.toString(),
        baseRef: "",
      };
    } catch {
      return {
        base: "working-tree",
        head: "HEAD",
        changedFiles: [],
        diff: "",
        baseRef: "",
      };
    }
  }
}
