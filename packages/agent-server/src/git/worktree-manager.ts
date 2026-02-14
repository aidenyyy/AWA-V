import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import pino from "pino";

const log = pino({ name: "worktree-manager" });

export interface Worktree {
  path: string;
  branch: string;
  head: string;
  isBare: boolean;
}

/**
 * Manages git worktrees for parallel task execution.
 * Each task can get its own worktree to avoid file conflicts
 * when multiple agents work on the same repo simultaneously.
 */
class WorktreeManager {
  /**
   * Create a new git worktree at a derived path for the given branch.
   * If the branch does not exist, it will be created.
   */
  createWorktree(repoPath: string, branchName: string): string {
    const worktreePath = this.getWorktreePath(repoPath, branchName);

    log.info({ repoPath, branchName, worktreePath }, "Creating worktree");

    if (existsSync(worktreePath)) {
      log.warn({ worktreePath }, "Worktree path already exists, removing first");
      this.removeWorktree(worktreePath);
    }

    try {
      // Try to create worktree with a new branch
      execFileSync("git", ["worktree", "add", "-b", branchName, worktreePath], {
        cwd: repoPath,
        stdio: "pipe",
      });
    } catch {
      // Branch might already exist; try without -b
      try {
        execFileSync("git", ["worktree", "add", worktreePath, branchName], {
          cwd: repoPath,
          stdio: "pipe",
        });
      } catch (err) {
        const message = (err as Error).message;
        log.error({ repoPath, branchName, error: message }, "Failed to create worktree");
        throw new Error(`Failed to create worktree: ${message}`);
      }
    }

    log.info({ worktreePath, branchName }, "Worktree created");
    return worktreePath;
  }

  /**
   * Remove a git worktree and clean up its directory.
   */
  removeWorktree(worktreePath: string): void {
    log.info({ worktreePath }, "Removing worktree");

    try {
      execFileSync("git", ["worktree", "remove", worktreePath, "--force"], {
        stdio: "pipe",
      });
      log.info({ worktreePath }, "Worktree removed");
    } catch (err) {
      const message = (err as Error).message;
      log.error({ worktreePath, error: message }, "Failed to remove worktree");
      throw new Error(`Failed to remove worktree: ${message}`);
    }
  }

  /**
   * List all worktrees for a repository.
   */
  listWorktrees(repoPath: string): Worktree[] {
    try {
      const output = execFileSync(
        "git",
        ["worktree", "list", "--porcelain"],
        {
          cwd: repoPath,
          stdio: "pipe",
          encoding: "utf-8",
        }
      );

      return this.parseWorktreeList(output);
    } catch (err) {
      const message = (err as Error).message;
      log.error({ repoPath, error: message }, "Failed to list worktrees");
      throw new Error(`Failed to list worktrees: ${message}`);
    }
  }

  /**
   * Derive the worktree path from the repo path and branch name.
   */
  private getWorktreePath(repoPath: string, branchName: string): string {
    // Place worktrees in a sibling directory to the repo
    const safeBranch = branchName.replace(/[^a-zA-Z0-9_-]/g, "_");
    return join(repoPath, "..", `.worktrees`, safeBranch);
  }

  /**
   * Parse the porcelain output of `git worktree list`.
   */
  private parseWorktreeList(output: string): Worktree[] {
    const worktrees: Worktree[] = [];
    const blocks = output.trim().split("\n\n");

    for (const block of blocks) {
      if (!block.trim()) continue;

      const lines = block.split("\n");
      const worktree: Partial<Worktree> = { isBare: false };

      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          worktree.path = line.slice("worktree ".length);
        } else if (line.startsWith("HEAD ")) {
          worktree.head = line.slice("HEAD ".length);
        } else if (line.startsWith("branch ")) {
          worktree.branch = line.slice("branch ".length);
        } else if (line === "bare") {
          worktree.isBare = true;
        }
      }

      if (worktree.path) {
        worktrees.push({
          path: worktree.path,
          branch: worktree.branch ?? "(detached)",
          head: worktree.head ?? "unknown",
          isBare: worktree.isBare ?? false,
        });
      }
    }

    return worktrees;
  }
}

// Singleton
export const worktreeManager = new WorktreeManager();
