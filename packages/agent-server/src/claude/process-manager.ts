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
}

export interface ClaudeProcess {
  id: string;
  pid: number;
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
      process: child,
      tracker,
      events,
    };

    this.processes.set(id, claudeProcess);

    // Write prompt to stdin
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
      "-p", options.prompt,
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
