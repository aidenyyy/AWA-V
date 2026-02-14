import { execFileSync } from "node:child_process";
import pino from "pino";

const log = pino({ name: "pr-manager" });

export interface PullRequest {
  number: number;
  url: string;
  title: string;
  state: string;
}

/**
 * Manages pull request operations using the GitHub CLI (`gh`).
 * Requires `gh` to be installed and authenticated.
 */
class PRManager {
  /**
   * Create a pull request for the given branch.
   */
  createPR(
    repoPath: string,
    title: string,
    body: string,
    branch: string,
    baseBranch?: string
  ): PullRequest {
    log.info({ repoPath, title, branch, baseBranch }, "Creating pull request");

    try {
      // Push the branch first
      execFileSync("git", ["push", "-u", "origin", branch], {
        cwd: repoPath,
        stdio: "pipe",
      });

      // Build gh pr create args
      const args = [
        "pr",
        "create",
        "--title", title,
        "--body", body,
        "--head", branch,
      ];

      if (baseBranch) {
        args.push("--base", baseBranch);
      }

      const output = execFileSync("gh", args, {
        cwd: repoPath,
        stdio: "pipe",
        encoding: "utf-8",
      });

      // gh pr create outputs the PR URL
      const prUrl = output.trim();

      // Extract PR number from URL (e.g., https://github.com/owner/repo/pull/42)
      const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
      const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : 0;

      log.info({ prUrl, prNumber }, "Pull request created");

      return {
        number: prNumber,
        url: prUrl,
        title,
        state: "open",
      };
    } catch (err) {
      const message = (err as Error).message;
      log.error({ repoPath, title, branch, error: message }, "Failed to create pull request");
      throw new Error(`Failed to create pull request: ${message}`);
    }
  }

  /**
   * Get the status of a pull request by number.
   */
  getPRStatus(repoPath: string, prNumber: number): PullRequest | null {
    try {
      const output = execFileSync(
        "gh",
        [
          "pr",
          "view",
          String(prNumber),
          "--json", "number,url,title,state",
        ],
        {
          cwd: repoPath,
          stdio: "pipe",
          encoding: "utf-8",
        }
      );

      const data = JSON.parse(output);
      return {
        number: data.number,
        url: data.url,
        title: data.title,
        state: data.state,
      };
    } catch (err) {
      const message = (err as Error).message;
      log.error({ repoPath, prNumber, error: message }, "Failed to get PR status");
      return null;
    }
  }

  /**
   * Merge a pull request by number.
   */
  mergePR(
    repoPath: string,
    prNumber: number,
    method: "merge" | "squash" | "rebase" = "squash"
  ): void {
    log.info({ repoPath, prNumber, method }, "Merging pull request");

    try {
      execFileSync(
        "gh",
        [
          "pr",
          "merge",
          String(prNumber),
          `--${method}`,
          "--delete-branch",
        ],
        {
          cwd: repoPath,
          stdio: "pipe",
        }
      );

      log.info({ prNumber }, "Pull request merged");
    } catch (err) {
      const message = (err as Error).message;
      log.error({ repoPath, prNumber, error: message }, "Failed to merge pull request");
      throw new Error(`Failed to merge PR #${prNumber}: ${message}`);
    }
  }

  /**
   * List open pull requests for the repository.
   */
  listOpenPRs(repoPath: string): PullRequest[] {
    try {
      const output = execFileSync(
        "gh",
        [
          "pr",
          "list",
          "--state", "open",
          "--json", "number,url,title,state",
        ],
        {
          cwd: repoPath,
          stdio: "pipe",
          encoding: "utf-8",
        }
      );

      const data = JSON.parse(output);
      return data.map((pr: Record<string, unknown>) => ({
        number: pr.number as number,
        url: pr.url as string,
        title: pr.title as string,
        state: pr.state as string,
      }));
    } catch (err) {
      const message = (err as Error).message;
      log.error({ repoPath, error: message }, "Failed to list open PRs");
      return [];
    }
  }

  /**
   * Check if the `gh` CLI is available and authenticated.
   */
  isAvailable(): boolean {
    try {
      execFileSync("gh", ["auth", "status"], {
        stdio: "pipe",
      });
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton
export const prManager = new PRManager();
