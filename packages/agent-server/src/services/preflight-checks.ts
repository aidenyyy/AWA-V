import { accessSync, constants, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export interface PreflightResult {
  ok: boolean;
  checks: string[];
  error?: string;
}

function commandSucceeded(cmd: string, args: string[], cwd: string): boolean {
  try {
    execFileSync(cmd, args, { cwd, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function hasGitStateFile(repoPath: string, fileName: string): boolean {
  try {
    const gitDirRaw = execFileSync("git", ["rev-parse", "--git-dir"], {
      cwd: repoPath,
      stdio: "pipe",
      encoding: "utf-8",
    }).trim();
    const gitDir = gitDirRaw.startsWith("/") ? gitDirRaw : join(repoPath, gitDirRaw);
    return existsSync(join(gitDir, fileName));
  } catch {
    return false;
  }
}

export function runPreflightChecks(repoPath: string): PreflightResult {
  const checks: string[] = [];

  if (!commandSucceeded("git", ["rev-parse", "--is-inside-work-tree"], repoPath)) {
    return { ok: false, checks, error: "Repository is not a valid git work tree" };
  }
  checks.push("git_repo_ok");

  try {
    accessSync(repoPath, constants.W_OK);
  } catch {
    return { ok: false, checks, error: "Repository path is not writable" };
  }
  checks.push("repo_writable");

  const hasConflicts = (() => {
    try {
      const out = execFileSync(
        "git",
        ["diff", "--name-only", "--diff-filter=U"],
        { cwd: repoPath, stdio: "pipe", encoding: "utf-8" }
      );
      return out.trim().length > 0;
    } catch {
      return false;
    }
  })();
  if (hasConflicts) {
    return { ok: false, checks, error: "Repository has unresolved merge conflicts" };
  }
  checks.push("no_merge_conflicts");

  const inProgressGitState =
    hasGitStateFile(repoPath, "MERGE_HEAD") ||
    hasGitStateFile(repoPath, "REBASE_HEAD") ||
    hasGitStateFile(repoPath, "CHERRY_PICK_HEAD");
  if (inProgressGitState) {
    return { ok: false, checks, error: "Repository has an in-progress git operation" };
  }
  checks.push("no_in_progress_git_ops");

  return { ok: true, checks };
}
