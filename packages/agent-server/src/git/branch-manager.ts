import { execFileSync } from "node:child_process";
import pino from "pino";

const log = pino({ name: "branch-manager" });

/**
 * Manages git branches for pipeline task isolation.
 * Each task or pipeline run can work on its own branch to prevent conflicts.
 */
class BranchManager {
  /**
   * Create a new branch from the current HEAD (or a specified base).
   */
  createBranch(
    repoPath: string,
    branchName: string,
    baseBranch?: string
  ): void {
    log.info({ repoPath, branchName, baseBranch }, "Creating branch");

    try {
      const args = ["checkout", "-b", branchName];
      if (baseBranch) {
        args.push(baseBranch);
      }

      execFileSync("git", args, {
        cwd: repoPath,
        stdio: "pipe",
      });

      log.info({ branchName }, "Branch created");
    } catch (err) {
      const message = (err as Error).message;
      log.error({ repoPath, branchName, error: message }, "Failed to create branch");
      throw new Error(`Failed to create branch '${branchName}': ${message}`);
    }
  }

  /**
   * Delete a local branch.
   */
  deleteBranch(repoPath: string, branchName: string, force = false): void {
    log.info({ repoPath, branchName, force }, "Deleting branch");

    try {
      const flag = force ? "-D" : "-d";
      execFileSync("git", ["branch", flag, branchName], {
        cwd: repoPath,
        stdio: "pipe",
      });

      log.info({ branchName }, "Branch deleted");
    } catch (err) {
      const message = (err as Error).message;
      log.error({ repoPath, branchName, error: message }, "Failed to delete branch");
      throw new Error(`Failed to delete branch '${branchName}': ${message}`);
    }
  }

  /**
   * Get the current branch name.
   */
  getCurrentBranch(repoPath: string): string {
    try {
      const output = execFileSync(
        "git",
        ["rev-parse", "--abbrev-ref", "HEAD"],
        {
          cwd: repoPath,
          stdio: "pipe",
          encoding: "utf-8",
        }
      );

      return output.trim();
    } catch (err) {
      const message = (err as Error).message;
      log.error({ repoPath, error: message }, "Failed to get current branch");
      throw new Error(`Failed to get current branch: ${message}`);
    }
  }

  /**
   * List all local branches.
   */
  listBranches(repoPath: string): string[] {
    try {
      const output = execFileSync(
        "git",
        ["branch", "--format=%(refname:short)"],
        {
          cwd: repoPath,
          stdio: "pipe",
          encoding: "utf-8",
        }
      );

      return output
        .trim()
        .split("\n")
        .filter((b) => b.length > 0);
    } catch (err) {
      const message = (err as Error).message;
      log.error({ repoPath, error: message }, "Failed to list branches");
      throw new Error(`Failed to list branches: ${message}`);
    }
  }

  /**
   * Check if a branch exists locally.
   */
  branchExists(repoPath: string, branchName: string): boolean {
    try {
      execFileSync(
        "git",
        ["rev-parse", "--verify", `refs/heads/${branchName}`],
        {
          cwd: repoPath,
          stdio: "pipe",
        }
      );
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton
export const branchManager = new BranchManager();
