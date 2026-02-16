import { execFileSync } from "node:child_process";
import { worktreeManager } from "./worktree-manager.js";
import { commitManager } from "./commit-manager.js";
import { interventionManager } from "../services/intervention-manager.js";
import { taskRepo, claudeSessionRepo } from "../db/repositories/task-repo.js";
import { processManager } from "../claude/process-manager.js";
import type { StreamChunk } from "@awa-v/shared";
import pino from "pino";

const log = pino({ name: "merge-manager" });

interface TaskMergeResult {
  taskId: string;
  status: "merged" | "auto_resolved" | "manually_resolved" | "skipped";
}

interface MergeResult {
  results: TaskMergeResult[];
  allMerged: boolean;
}

class MergeManager {
  async mergeAllWorktrees(
    pipelineId: string,
    repoPath: string,
    taskIds: string[]
  ): Promise<MergeResult> {
    const results: TaskMergeResult[] = [];

    for (const taskId of taskIds) {
      const task = taskRepo.getById(taskId);
      if (!task?.worktreePath) continue;

      const branchName = `awa-v/task-${taskId.slice(0, 8)}`;

      try {
        execFileSync("git", ["merge", "--no-ff", branchName,
          "-m", `merge: task ${task.agentRole} (${taskId.slice(0, 8)})`],
          { cwd: repoPath, stdio: "pipe" });
        results.push({ taskId, status: "merged" });
      } catch {
        // Conflict detected — try Claude auto-resolve
        log.warn({ pipelineId, taskId, branchName }, "Merge conflict, attempting auto-resolve");

        const resolved = await this.attemptClaudeResolve(repoPath, pipelineId, taskId);
        if (resolved) {
          results.push({ taskId, status: "auto_resolved" });
        } else {
          // Human intervention
          const conflictFiles = this.getConflictFiles(repoPath);
          const conflictDiff = this.getConflictDiff(repoPath);

          const response = await interventionManager.requestIntervention({
            pipelineId,
            stageType: "parallel_execution",
            question: `Merge conflict in task "${task.agentRole}". Auto-resolve failed. Choose: "skip" to abort this merge, "resolved" if you manually resolved it.`,
            context: {
              taskId,
              branch: branchName,
              conflictFiles,
              diff: conflictDiff.slice(0, 5000),
            },
          });

          if (response === "skip") {
            try {
              execFileSync("git", ["merge", "--abort"], { cwd: repoPath, stdio: "pipe" });
            } catch { /* merge may not be in progress */ }
            results.push({ taskId, status: "skipped" });
          } else {
            // User says "resolved" — commit the resolution
            try {
              commitManager.commit(repoPath, `merge: manually resolved task ${taskId.slice(0, 8)}`);
              results.push({ taskId, status: "manually_resolved" });
            } catch {
              results.push({ taskId, status: "skipped" });
            }
          }
        }
      }

      // Cleanup worktree after merge attempt
      try {
        worktreeManager.removeWorktree(task.worktreePath);
      } catch (err) {
        log.warn({ worktreePath: task.worktreePath, error: (err as Error).message }, "Failed to remove worktree");
      }
    }

    return {
      results,
      allMerged: results.every((r) => r.status !== "skipped"),
    };
  }

  private async attemptClaudeResolve(
    repoPath: string,
    pipelineId: string,
    taskId: string
  ): Promise<boolean> {
    const conflictFiles = this.getConflictFiles(repoPath);
    if (conflictFiles.length === 0) return false;

    const conflictDiff = this.getConflictDiff(repoPath);

    log.info({ pipelineId, taskId, conflictFiles }, "Attempting Claude auto-resolve");

    try {
      const session = claudeSessionRepo.create({
        taskId,
        model: "haiku",
      });

      const resolvePrompt = [
        "You are resolving a git merge conflict. The following files have conflicts:",
        conflictFiles.join(", "),
        "\nConflict diff:\n",
        conflictDiff.slice(0, 8000),
        "\n\nResolve ALL conflict markers (<<<<<<< ======= >>>>>>>) in these files.",
        "Keep the best version of each conflicting section, preferring to combine both changes when possible.",
        "After resolving, stage and commit with message: 'merge: auto-resolved conflicts'",
      ].join("\n");

      const proc = processManager.spawn(session.id, {
        prompt: resolvePrompt,
        cwd: repoPath,
        pipelineId,
        model: "haiku",
        permissionMode: "auto",
        systemPrompt: "You are a git merge conflict resolver. Resolve conflicts cleanly and commit.",
        maxTurns: 5,
      });

      return new Promise<boolean>((resolve) => {
        proc.events.on("chunk", (chunk: StreamChunk) => {
          if (chunk.type === "done") {
            // Check if conflicts are resolved
            const remaining = this.getConflictFiles(repoPath);
            resolve(remaining.length === 0);
          }
        });
        proc.events.on("error", () => resolve(false));
      });
    } catch (err) {
      log.error({ error: (err as Error).message }, "Claude auto-resolve failed");
      return false;
    }
  }

  private getConflictFiles(repoPath: string): string[] {
    try {
      const output = execFileSync(
        "git", ["diff", "--name-only", "--diff-filter=U"],
        { cwd: repoPath, stdio: "pipe", encoding: "utf-8" }
      );
      return output.trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }

  private getConflictDiff(repoPath: string): string {
    try {
      return execFileSync(
        "git", ["diff"],
        { cwd: repoPath, stdio: "pipe", encoding: "utf-8" }
      );
    } catch {
      return "";
    }
  }
}

export const mergeManager = new MergeManager();
