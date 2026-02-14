import { execFileSync } from "node:child_process";
import pino from "pino";

const log = pino({ name: "commit-manager" });

export interface GitStatus {
  staged: string[];
  unstaged: string[];
  untracked: string[];
  clean: boolean;
}

/**
 * Manages git commits and staging operations.
 * Used by the pipeline to commit task outputs and track changes.
 */
class CommitManager {
  /**
   * Stage all changes and commit with the given message.
   */
  commit(repoPath: string, message: string): string {
    log.info({ repoPath, message: message.slice(0, 80) }, "Creating commit");

    try {
      // Stage all changes
      execFileSync("git", ["add", "-A"], {
        cwd: repoPath,
        stdio: "pipe",
      });

      // Commit
      execFileSync("git", ["commit", "-m", message], {
        cwd: repoPath,
        stdio: "pipe",
      });

      // Get the commit hash
      const hash = execFileSync(
        "git",
        ["rev-parse", "HEAD"],
        {
          cwd: repoPath,
          stdio: "pipe",
          encoding: "utf-8",
        }
      ).trim();

      log.info({ repoPath, hash }, "Commit created");
      return hash;
    } catch (err) {
      const message_ = (err as Error).message;
      log.error({ repoPath, error: message_ }, "Failed to create commit");
      throw new Error(`Failed to commit: ${message_}`);
    }
  }

  /**
   * Get the current git status of the working directory.
   */
  getStatus(repoPath: string): GitStatus {
    try {
      const output = execFileSync(
        "git",
        ["status", "--porcelain"],
        {
          cwd: repoPath,
          stdio: "pipe",
          encoding: "utf-8",
        }
      );

      const staged: string[] = [];
      const unstaged: string[] = [];
      const untracked: string[] = [];

      for (const line of output.split("\n")) {
        if (!line.trim()) continue;

        const indexStatus = line[0];
        const workTreeStatus = line[1];
        const filePath = line.slice(3);

        if (indexStatus === "?") {
          untracked.push(filePath);
        } else if (indexStatus !== " " && indexStatus !== "?") {
          staged.push(filePath);
        }

        if (workTreeStatus !== " " && workTreeStatus !== "?" && workTreeStatus !== undefined) {
          unstaged.push(filePath);
        }
      }

      return {
        staged,
        unstaged,
        untracked,
        clean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
      };
    } catch (err) {
      const message = (err as Error).message;
      log.error({ repoPath, error: message }, "Failed to get git status");
      throw new Error(`Failed to get git status: ${message}`);
    }
  }

  /**
   * Stage specific files for commit.
   */
  stageFiles(repoPath: string, files: string[]): void {
    if (files.length === 0) return;

    try {
      execFileSync("git", ["add", ...files], {
        cwd: repoPath,
        stdio: "pipe",
      });
    } catch (err) {
      const message = (err as Error).message;
      log.error({ repoPath, files, error: message }, "Failed to stage files");
      throw new Error(`Failed to stage files: ${message}`);
    }
  }

  /**
   * Get the latest commit hash.
   */
  getLatestCommitHash(repoPath: string): string {
    try {
      return execFileSync(
        "git",
        ["rev-parse", "HEAD"],
        {
          cwd: repoPath,
          stdio: "pipe",
          encoding: "utf-8",
        }
      ).trim();
    } catch (err) {
      const message = (err as Error).message;
      log.error({ repoPath, error: message }, "Failed to get latest commit hash");
      throw new Error(`Failed to get latest commit hash: ${message}`);
    }
  }

  /**
   * Get the diff of uncommitted changes.
   */
  getDiff(repoPath: string, staged = false): string {
    try {
      const args = staged ? ["diff", "--cached"] : ["diff"];
      return execFileSync("git", args, {
        cwd: repoPath,
        stdio: "pipe",
        encoding: "utf-8",
      });
    } catch (err) {
      const message = (err as Error).message;
      log.error({ repoPath, error: message }, "Failed to get diff");
      throw new Error(`Failed to get diff: ${message}`);
    }
  }
}

// Singleton
export const commitManager = new CommitManager();
