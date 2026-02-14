import type { Pipeline, Stage, Task, ClaudeSession, Plan, Intervention } from "./models";

// ─── Client → Server ───────────────────────────────────────

export type ClientEvent =
  | { type: "subscribe:pipeline"; pipelineId: string }
  | { type: "unsubscribe:pipeline"; pipelineId: string }
  | { type: "subscribe:project"; projectId: string }
  | { type: "unsubscribe:project"; projectId: string };

// ─── Server → Client ───────────────────────────────────────

export type ServerEvent =
  | { type: "pipeline:created"; pipeline: Pipeline }
  | { type: "pipeline:updated"; pipeline: Pipeline }
  | { type: "stage:updated"; stage: Stage }
  | { type: "task:updated"; task: Task }
  | { type: "session:updated"; session: ClaudeSession }
  | { type: "plan:created"; plan: Plan }
  | { type: "plan:updated"; plan: Plan }
  | {
      type: "stream:chunk";
      taskId: string;
      chunk: StreamChunk;
    }
  | { type: "intervention:requested"; intervention: Intervention }
  | { type: "intervention:resolved"; intervention: Intervention }
  | {
      type: "notification";
      level: "info" | "warning" | "error";
      title: string;
      message: string;
      pipelineId?: string;
    };

// ─── Claude Stream Chunks ───────────────────────────────────

export type StreamChunk =
  | { type: "assistant:text"; text: string }
  | { type: "assistant:thinking"; thinking: string }
  | {
      type: "tool:use";
      toolName: string;
      toolInput: Record<string, unknown>;
    }
  | {
      type: "tool:result";
      toolName: string;
      output: string;
      isError: boolean;
    }
  | {
      type: "cost:update";
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }
  | { type: "error"; message: string }
  | { type: "done"; exitCode: number };
