import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

interface PackageJsonLike {
  scripts?: Record<string, string>;
}

export interface SmokeCheckResult {
  script: "build" | "test";
  status: "passed" | "failed" | "skipped";
  detail?: string;
}

export interface SmokeResult {
  ok: boolean;
  checks: SmokeCheckResult[];
}

function detectPackageManager(repoPath: string): "pnpm" | "yarn" | "npm" {
  if (existsSync(join(repoPath, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(repoPath, "yarn.lock"))) return "yarn";
  return "npm";
}

function runScript(repoPath: string, script: string): void {
  const pm = detectPackageManager(repoPath);
  if (pm === "pnpm") {
    execFileSync("pnpm", ["run", script], { cwd: repoPath, stdio: "pipe" });
    return;
  }
  if (pm === "yarn") {
    execFileSync("yarn", [script], { cwd: repoPath, stdio: "pipe" });
    return;
  }
  execFileSync("npm", ["run", script], { cwd: repoPath, stdio: "pipe" });
}

function loadScripts(repoPath: string): Record<string, string> {
  const packageJsonPath = join(repoPath, "package.json");
  if (!existsSync(packageJsonPath)) return {};
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as PackageJsonLike;
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

export function runPostMergeSmoke(repoPath: string): SmokeResult {
  const checks: SmokeCheckResult[] = [];
  const scripts = loadScripts(repoPath);

  for (const script of ["build", "test"] as const) {
    if (!scripts[script]) {
      checks.push({ script, status: "skipped", detail: `No '${script}' script` });
      continue;
    }
    try {
      runScript(repoPath, script);
      checks.push({ script, status: "passed" });
    } catch (err) {
      const detail = err instanceof Error ? err.message.slice(0, 400) : String(err);
      checks.push({ script, status: "failed", detail });
      return { ok: false, checks };
    }
  }

  return { ok: true, checks };
}

