import { DEFAULTS } from "@awa-v/shared";
import pino from "pino";

const log = pino({ name: "self-healing" });

// ─── Types ──────────────────────────────────────────────────

interface FailureRecord {
  stageType: string;
  error: string;
  timestamp: number;
  retryCount: number;
}

// ─── Self Healer ────────────────────────────────────────────

/**
 * Provides basic self-healing capabilities for the pipeline:
 * - Retry on crash (up to MAX_STAGE_RETRIES times)
 * - Timeout detection
 * - Fail fast after retries are exhausted
 */
export class SelfHealer {
  /** pipelineId -> list of failure records */
  private failures = new Map<string, FailureRecord[]>();

  /** pipelineId -> active timeout handles */
  private timeouts = new Map<string, ReturnType<typeof setTimeout>>();

  // User policy: any stage retry beyond 3 attempts should fail fast.
  private readonly retryLimit = 3;
  private readonly timeoutMs = DEFAULTS.TASK_TIMEOUT_MS; // 10 minutes

  /**
   * Record a failure and determine whether to retry or fail fast.
   *
   * Returns:
   * - "retry"   if the failure count for this stage is within retry limits
   * - "fatal"   if retries are exhausted
   */
  handleFailure(
    pipelineId: string,
    stageType: string,
    error: string
  ): "retry" | "fatal" {
    const records = this.failures.get(pipelineId) ?? [];

    // Count previous failures for this specific stage
    const stageFailures = records.filter((r) => r.stageType === stageType);
    const retryCount = stageFailures.length;

    // Record this failure
    records.push({
      stageType,
      error,
      timestamp: Date.now(),
      retryCount: retryCount + 1,
    });
    this.failures.set(pipelineId, records);

    log.info(
      { pipelineId, stageType, retryCount: retryCount + 1, error },
      "Handling failure"
    );

    // Check if we can still retry this stage
    if (retryCount < this.retryLimit) {
      log.info(
        { pipelineId, stageType, attempt: retryCount + 1, maxRetries: this.retryLimit },
        "Will retry stage"
      );
      return "retry";
    }

    log.error(
      { pipelineId, stageType },
      "Retries exhausted; failing fast"
    );
    return "fatal";
  }

  /**
   * Start a timeout timer for a stage. If the stage doesn't complete
   * within the configured timeout, the callback is invoked.
   */
  startTimeout(
    pipelineId: string,
    onTimeout: () => void
  ): void {
    // Clear any existing timeout for this pipeline
    this.clearTimeout(pipelineId);

    const handle = setTimeout(() => {
      log.warn({ pipelineId, timeoutMs: this.timeoutMs }, "Stage timed out");
      this.timeouts.delete(pipelineId);
      onTimeout();
    }, this.timeoutMs);

    this.timeouts.set(pipelineId, handle);
  }

  /**
   * Clear the timeout timer for a pipeline (e.g. when a stage completes).
   */
  clearTimeout(pipelineId: string): void {
    const handle = this.timeouts.get(pipelineId);
    if (handle) {
      clearTimeout(handle);
      this.timeouts.delete(pipelineId);
    }
  }

  /**
   * Get the failure history for a pipeline.
   */
  getFailures(pipelineId: string): FailureRecord[] {
    return this.failures.get(pipelineId) ?? [];
  }

  /**
   * Clear all failure records for a pipeline (e.g. on successful completion).
   */
  clearFailures(pipelineId: string): void {
    this.failures.delete(pipelineId);
    this.clearTimeout(pipelineId);
  }
}

export const selfHealer = new SelfHealer();
