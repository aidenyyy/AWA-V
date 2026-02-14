import type { StreamChunk } from "@awa-v/shared";

export interface SessionStats {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  streamEvents: number;
  startedAt: string;
  completedAt: string | null;
  exitCode: number | null;
}

/**
 * Tracks live stats for a single Claude session by processing stream chunks.
 */
export class SessionTracker {
  private stats: SessionStats;

  constructor() {
    this.stats = {
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      streamEvents: 0,
      startedAt: new Date().toISOString(),
      completedAt: null,
      exitCode: null,
    };
  }

  processChunk(chunk: StreamChunk): void {
    this.stats.streamEvents++;

    if (chunk.type === "cost:update") {
      this.stats.inputTokens = chunk.inputTokens;
      this.stats.outputTokens = chunk.outputTokens;
      this.stats.costUsd = chunk.costUsd;
    }

    if (chunk.type === "done") {
      this.stats.completedAt = new Date().toISOString();
      this.stats.exitCode = chunk.exitCode;
    }
  }

  getStats(): SessionStats {
    return { ...this.stats };
  }

  markCompleted(exitCode: number): void {
    this.stats.completedAt = new Date().toISOString();
    this.stats.exitCode = exitCode;
  }
}
