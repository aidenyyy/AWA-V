import { DEFAULTS, REPLAN_LIMIT } from "@awa-v/shared";
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
 * - Retry on crash (up to SELF_HEAL_RETRY_LIMIT times)
 * - Timeout detection
 * - Trigger replan on repeated failures
 */
export class SelfHealer {
  /** pipelineId -> list of failure records */
  private failures = new Map<string, FailureRecord[]>();

  /** pipelineId -> active timeout handles */
  private timeouts = new Map<string, ReturnType<typeof setTimeout>>();

  private readonly retryLimit = DEFAULTS.SELF_HEAL_RETRY_LIMIT; // 2
  private readonly timeoutMs = DEFAULTS.TASK_TIMEOUT_MS; // 10 minutes

  /**
   * Record a failure and determine whether to retry, replan, or give up.
   *
   * Returns:
   * - "retry"   if the failure count for this stage is within retry limits
   * - "replan"  if retries are exhausted but replan limit isn't reached
   * - "fatal"   if replan limit is also exceeded
   */
  handleFailure(
    pipelineId: string,
    stageType: string,
    error: string
  ): "retry" | "replan" | "fatal" {
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

    // Retries exhausted; check if we should trigger a replan
    if (this.shouldReplan(pipelineId)) {
      log.info({ pipelineId, stageType }, "Retries exhausted, triggering replan");
      return "replan";
    }

    // Replan limit also exceeded
    log.error(
      { pipelineId, stageType },
      "All retries and replans exhausted; fatal failure"
    );
    return "fatal";
  }

  /**
   * Determine whether a replan is still allowed for this pipeline.
   * Counts the number of distinct replan cycles (times we went back to
   * plan_generation after failures).
   */
  shouldReplan(pipelineId: string): boolean {
    const records = this.failures.get(pipelineId) ?? [];

    // Count distinct replan events: each time retries were exhausted for a stage
    const replanEvents = new Set<string>();
    const stageCounts = new Map<string, number>();

    for (const record of records) {
      const count = (stageCounts.get(record.stageType) ?? 0) + 1;
      stageCounts.set(record.stageType, count);

      if (count > this.retryLimit) {
        replanEvents.add(`${record.stageType}-${Math.floor(count / (this.retryLimit + 1))}`);
      }
    }

    const replanCount = replanEvents.size;
    const canReplan = replanCount < REPLAN_LIMIT;

    log.info(
      { pipelineId, replanCount, replanLimit: REPLAN_LIMIT, canReplan },
      "Replan check"
    );

    return canReplan;
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
