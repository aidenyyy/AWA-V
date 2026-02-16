import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { createStreamProcessor } from "./stream-parser.js";
import { SessionTracker } from "./session-tracker.js";
import type { StreamChunk, SkillPack } from "@awa-v/shared";
import { buildSkillArgs } from "./prompt-builder.js";
import pino from "pino";

const log = pino({ name: "process-manager" });

export interface SpawnOptions {
  prompt: string;
  cwd: string;
  model?: string;
  permissionMode?: string;
  skillPack?: SkillPack;
  maxTurns?: number;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  isSelfRepo?: boolean;
  pipelineId?: string;
}

export interface ClaudeProcess {
  id: string;
  pid: number;
  pipelineId?: string;
  process: ChildProcess;
  tracker: SessionTracker;
  events: EventEmitter;
}

/**
 * Manages spawning and tracking of Claude CLI child processes.
 */
export class ProcessManager {
  private processes = new Map<string, ClaudeProcess>();

  /**
   * Spawn a new Claude CLI process with stream-json output.
   */
  spawn(id: string, options: SpawnOptions): ClaudeProcess {
    const args = this.buildArgs(options);

    log.info({ id, cwd: options.cwd, args: args.filter(a => !a.includes('\n')) }, "Spawning Claude process");

    const child = spawn("claude", args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        // Ensure non-interactive
        CI: "true",
      },
    });

    const tracker = new SessionTracker();
    const events = new EventEmitter();

    // Process stdout (stream-json NDJSON)
    const processData = createStreamProcessor((chunk: StreamChunk) => {
      tracker.processChunk(chunk);
      events.emit("chunk", chunk);
    });

    child.stdout?.on("data", processData);

    // Process stderr (log it)
    let stderrBuffer = "";
    child.stderr?.on("data", (data: Buffer) => {
      stderrBuffer += data.toString();
    });

    child.on("close", (code) => {
      const exitCode = code ?? 1;
      tracker.markCompleted(exitCode);

      // If Claude exited non-zero with no output, surface stderr as an error
      // so callers get a useful message instead of "exited with code 1"
      if (exitCode !== 0 && stderrBuffer.trim() && tracker.getStats().outputTokens === 0) {
        events.emit("chunk", {
          type: "error" as const,
          message: stderrBuffer.trim(),
        });
      }

      events.emit("chunk", {
        type: "done" as const,
        exitCode,
      });
      events.emit("close", exitCode);

      if (stderrBuffer.trim()) {
        log.warn({ id, stderr: stderrBuffer.trim() }, "Claude stderr output");
      }

      this.processes.delete(id);
      log.info({ id, exitCode, stats: tracker.getStats() }, "Claude process exited");
    });

    child.on("error", (err) => {
      log.error({ id, error: err.message }, "Claude process error");
      events.emit("chunk", {
        type: "error" as const,
        message: err.message,
      });
      events.emit("error", err);
    });

    const claudeProcess: ClaudeProcess = {
      id,
      pid: child.pid!,
      pipelineId: options.pipelineId,
      process: child,
      tracker,
      events,
    };

    this.processes.set(id, claudeProcess);

    // Deliver prompt via stdin to avoid argument parsing issues
    // (prompts starting with "-" would be misinterpreted as CLI flags)
    if (child.stdin) {
      child.stdin.write(options.prompt);
      child.stdin.end();
    }

    return claudeProcess;
  }

  private buildArgs(options: SpawnOptions): string[] {
    const args = [
      "--output-format",
      "stream-json",
      "--verbose",
      "-p",
    ];

    if (options.model) {
      args.push("--model", options.model);
    }

    if (options.permissionMode) {
      args.push("--permission-mode", options.permissionMode);
    }

    if (options.maxTurns) {
      args.push("--max-turns", String(options.maxTurns));
    }

    if (options.systemPrompt) {
      args.push("--system-prompt", options.systemPrompt);
    }

    if (options.appendSystemPrompt) {
      args.push("--append-system-prompt", options.appendSystemPrompt);
    }

    if (options.isSelfRepo) {
      const guard = [
        "\n\n## CRITICAL: Self-Repo Safety",
        "This repository IS the AWA-V system that is currently running.",
        "You are working in an isolated worktree — your changes will NOT affect the running server.",
        "DO NOT modify: data/, .env*, node_modules/",
        "DO NOT run git commands that target the main branch (no git checkout main, no git merge into main).",
      ].join("\n");
      if (options.appendSystemPrompt) {
        options.appendSystemPrompt += guard;
      } else {
        args.push("--append-system-prompt", guard);
      }
    }

    if (options.skillPack) {
      args.push(...buildSkillArgs(options.skillPack));
    }

    return args;
  }

  /** Kill a running process */
  kill(id: string): boolean {
    const proc = this.processes.get(id);
    if (!proc) return false;
    proc.process.kill("SIGTERM");
    // Give it 5s then SIGKILL
    setTimeout(() => {
      if (this.processes.has(id)) {
        proc.process.kill("SIGKILL");
      }
    }, 5000);
    return true;
  }

  /** Kill all running processes (used during graceful shutdown) */
  async killAll(): Promise<void> {
    if (this.processes.size === 0) return;
    log.info({ count: this.processes.size }, "Killing all Claude processes");

    // Send SIGTERM to all
    for (const [id, proc] of this.processes) {
      proc.process.kill("SIGTERM");
    }

    // Wait for all to exit, with a 5s deadline
    await Promise.race([
      Promise.all(
        Array.from(this.processes.values()).map(
          (proc) =>
            new Promise<void>((resolve) => {
              if (proc.process.exitCode !== null) return resolve();
              proc.process.once("close", () => resolve());
            })
        )
      ),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);

    // SIGKILL any remaining
    for (const [id, proc] of this.processes) {
      try {
        proc.process.kill("SIGKILL");
      } catch {
        // Process may have already exited
      }
    }

    this.processes.clear();
  }

  /** Kill all processes belonging to a specific pipeline */
  killByPipeline(pipelineId: string): number {
    let killed = 0;
    for (const [id, proc] of this.processes) {
      if (proc.pipelineId === pipelineId) {
        proc.process.kill("SIGTERM");
        killed++;
      }
    }
    if (killed > 0) {
      log.info({ pipelineId, killed }, "Killed processes for pipeline");
      // Give processes 5s to exit gracefully, then SIGKILL any remaining
      setTimeout(() => {
        for (const [id, proc] of this.processes) {
          if (proc.pipelineId === pipelineId) {
            try {
              proc.process.kill("SIGKILL");
            } catch {
              // Process may have already exited
            }
          }
        }
      }, 5000);
    }
    return killed;
  }

  /** Get a running process */
  get(id: string): ClaudeProcess | undefined {
    return this.processes.get(id);
  }

  /** Get all running processes */
  getAll(): ClaudeProcess[] {
    return Array.from(this.processes.values());
  }

  /** Number of active processes */
  get activeCount(): number {
    return this.processes.size;
  }
}

// Singleton
export const processManager = new ProcessManager();
