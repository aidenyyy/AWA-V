import {
  PipelineState,
  HumanReviewDecision,
  REPLAN_LIMIT,
  DEFAULTS,
} from "@awa-v/shared";
import type { Pipeline } from "@awa-v/shared";
import { pipelineRepo } from "../db/repositories/pipeline-repo.js";
import { broadcaster } from "../ws/broadcaster.js";
import {
  getNextState,
  isTerminal,
  reviewDecisionToOutcome,
  type TransitionOutcome,
} from "./state-machine.js";
import { runStage, type StageResult } from "./stage-runner.js";
import { costTracker } from "./cost-tracker.js";
import { selfHealer } from "./self-healing.js";
import pino from "pino";

const log = pino({ name: "pipeline-engine" });

// ─── Pipeline Engine ────────────────────────────────────────

class PipelineEngine {
  /**
   * Start a pipeline from the requirements_input stage.
   * The pipeline must already exist in the database with state = requirements_input.
   */
  async start(pipelineId: string): Promise<void> {
    const pipeline = pipelineRepo.getById(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${pipelineId}`);
    }

    if (pipeline.state !== PipelineState.REQUIREMENTS_INPUT) {
      throw new Error(
        `Pipeline ${pipelineId} is in state "${pipeline.state}", expected "${PipelineState.REQUIREMENTS_INPUT}"`
      );
    }

    log.info({ pipelineId }, "Starting pipeline");

    // Run the requirements_input stage (auto-pass) and advance
    await this.runCurrentStageAndAdvance(pipelineId, PipelineState.REQUIREMENTS_INPUT);
  }

  /**
   * Advance the pipeline to its next stage based on the FSM.
   * Determines the outcome from the current stage and transitions forward.
   */
  async advance(pipelineId: string): Promise<void> {
    const pipeline = pipelineRepo.getById(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${pipelineId}`);
    }

    if (isTerminal(pipeline.state as PipelineState)) {
      log.info(
        { pipelineId, state: pipeline.state },
        "Pipeline is in terminal state; cannot advance"
      );
      return;
    }

    const currentState = pipeline.state as PipelineState;
    const outcome = this.determineOutcome(currentState);
    const nextState = getNextState(currentState, outcome);

    if (!nextState) {
      log.error(
        { pipelineId, currentState, outcome },
        "No valid transition found"
      );
      return;
    }

    log.info(
      { pipelineId, from: currentState, to: nextState, outcome },
      "Advancing pipeline"
    );

    await this.transitionTo(pipelineId, nextState);
  }

  /**
   * Trigger a replan: transition back to plan_generation and increment
   * the reentry count. If the replan limit is exceeded, fail the pipeline.
   */
  async replan(pipelineId: string): Promise<void> {
    const pipeline = pipelineRepo.getById(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${pipelineId}`);
    }

    const newReentryCount = pipeline.reentryCount + 1;

    if (newReentryCount > REPLAN_LIMIT) {
      log.error(
        { pipelineId, reentryCount: newReentryCount, limit: REPLAN_LIMIT },
        "Replan limit exceeded; failing pipeline"
      );
      await this.failPipeline(pipelineId, "Replan limit exceeded");
      return;
    }

    log.info(
      { pipelineId, reentryCount: newReentryCount },
      "Replanning pipeline"
    );

    // Update reentry count
    pipelineRepo.update(pipelineId, { reentryCount: newReentryCount });

    // Transition to plan_generation
    await this.transitionTo(pipelineId, PipelineState.PLAN_GENERATION);
  }

  /**
   * Cancel a pipeline: set state to cancelled.
   */
  async cancel(pipelineId: string): Promise<void> {
    const pipeline = pipelineRepo.getById(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${pipelineId}`);
    }

    if (isTerminal(pipeline.state as PipelineState)) {
      log.info(
        { pipelineId, state: pipeline.state },
        "Pipeline is already in terminal state"
      );
      return;
    }

    log.info({ pipelineId }, "Cancelling pipeline");

    const updated = pipelineRepo.update(pipelineId, {
      state: PipelineState.CANCELLED,
    });

    selfHealer.clearFailures(pipelineId);

    this.broadcastUpdate(pipelineId, updated!);
  }

  /**
   * Handle a human review decision on the plan.
   * - approve: advance to adversarial_review
   * - edit: go back to plan_generation
   * - reject: cancel the pipeline
   */
  async handlePlanReview(
    pipelineId: string,
    decision: HumanReviewDecision,
    feedback?: string
  ): Promise<void> {
    const pipeline = pipelineRepo.getById(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${pipelineId}`);
    }

    if (pipeline.state !== PipelineState.HUMAN_REVIEW) {
      throw new Error(
        `Pipeline ${pipelineId} is in state "${pipeline.state}", expected "${PipelineState.HUMAN_REVIEW}"`
      );
    }

    log.info(
      { pipelineId, decision, hasFeedback: !!feedback },
      "Processing human review decision"
    );

    const outcome = reviewDecisionToOutcome(decision);
    const nextState = getNextState(PipelineState.HUMAN_REVIEW, outcome);

    if (!nextState) {
      log.error({ pipelineId, decision, outcome }, "Invalid review transition");
      return;
    }

    // If editing, increment reentry count since we're going back to planning
    if (decision === HumanReviewDecision.EDIT) {
      const newReentryCount = pipeline.reentryCount + 1;
      if (newReentryCount > REPLAN_LIMIT) {
        log.error(
          { pipelineId, reentryCount: newReentryCount },
          "Replan limit exceeded during human review edit"
        );
        await this.failPipeline(pipelineId, "Replan limit exceeded");
        return;
      }
      pipelineRepo.update(pipelineId, { reentryCount: newReentryCount });
    }

    await this.transitionTo(pipelineId, nextState);
  }

  // ─── Internal helpers ───────────────────────────────────────

  /**
   * Transition the pipeline to a new state, run the stage, and
   * continue advancing if the stage passes immediately.
   */
  private async transitionTo(
    pipelineId: string,
    newState: PipelineState
  ): Promise<void> {
    // Update pipeline state in DB
    const updated = pipelineRepo.update(pipelineId, { state: newState });
    this.broadcastUpdate(pipelineId, updated!);

    // If we've reached a terminal state, clean up and stop
    if (isTerminal(newState)) {
      log.info({ pipelineId, state: newState }, "Pipeline reached terminal state");
      selfHealer.clearFailures(pipelineId);

      // Aggregate final costs
      await costTracker.aggregateAndUpdate(pipelineId);
      return;
    }

    // Run the new stage
    await this.runCurrentStageAndAdvance(pipelineId, newState);
  }

  /**
   * Run the current stage and, if it passes, automatically advance
   * to the next stage. If it fails, attempt self-healing.
   */
  private async runCurrentStageAndAdvance(
    pipelineId: string,
    stageType: PipelineState
  ): Promise<void> {
    // Start a timeout for this stage
    selfHealer.startTimeout(pipelineId, () => {
      this.handleStageTimeout(pipelineId, stageType);
    });

    let result: StageResult;

    try {
      result = await runStage(pipelineId, stageType);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      result = { outcome: "fail", error: errorMsg };
    }

    // Clear the timeout since the stage finished
    selfHealer.clearTimeout(pipelineId);

    // Aggregate costs after each stage
    await costTracker.aggregateAndUpdate(pipelineId);

    // Check budget
    const costSummary = costTracker.getSummary(pipelineId);
    if (costSummary && !costSummary.withinBudget) {
      log.error({ pipelineId }, "Budget exceeded; failing pipeline");
      await this.failPipeline(pipelineId, "Budget limit exceeded");
      return;
    }

    if (result.outcome === "pass") {
      // Determine the forward outcome based on the stage type
      const outcome = this.determineOutcome(stageType);
      const nextState = getNextState(stageType, outcome);

      if (nextState) {
        await this.transitionTo(pipelineId, nextState);
      } else {
        log.error(
          { pipelineId, stageType, outcome },
          "No valid forward transition after pass"
        );
      }
    } else if (result.outcome === "fail") {
      await this.handleStageFailure(pipelineId, stageType, result.error ?? "Unknown error");
    } else if (result.outcome === "waiting") {
      // Stage is waiting for external input (e.g. human review)
      // Pipeline stays in current state until input arrives
      log.info(
        { pipelineId, stageType },
        "Stage is waiting for external input"
      );
    }
  }

  /**
   * Handle a stage failure using the self-healer.
   */
  private async handleStageFailure(
    pipelineId: string,
    stageType: string,
    error: string
  ): Promise<void> {
    const action = selfHealer.handleFailure(pipelineId, stageType, error);

    switch (action) {
      case "retry":
        log.info({ pipelineId, stageType }, "Retrying stage after failure");
        await this.runCurrentStageAndAdvance(
          pipelineId,
          stageType as PipelineState
        );
        break;

      case "replan":
        log.info({ pipelineId, stageType }, "Replanning after repeated failures");
        await this.replan(pipelineId);
        break;

      case "fatal":
        log.error({ pipelineId, stageType }, "Fatal failure; no retries or replans left");
        await this.failPipeline(
          pipelineId,
          `Fatal failure in stage ${stageType}: ${error}`
        );
        break;
    }
  }

  /**
   * Handle a stage timeout.
   */
  private async handleStageTimeout(
    pipelineId: string,
    stageType: PipelineState
  ): Promise<void> {
    log.warn({ pipelineId, stageType }, "Stage timed out");
    await this.handleStageFailure(
      pipelineId,
      stageType,
      `Stage ${stageType} timed out after ${DEFAULTS.TASK_TIMEOUT_MS}ms`
    );
  }

  /**
   * Move pipeline to the FAILED terminal state.
   */
  private async failPipeline(
    pipelineId: string,
    reason: string
  ): Promise<void> {
    log.error({ pipelineId, reason }, "Failing pipeline");

    const updated = pipelineRepo.update(pipelineId, {
      state: PipelineState.FAILED,
    });

    selfHealer.clearFailures(pipelineId);

    // Aggregate final costs
    await costTracker.aggregateAndUpdate(pipelineId);

    this.broadcastUpdate(pipelineId, updated!);

    // Send notification
    broadcaster.broadcastToPipeline(pipelineId, {
      type: "notification",
      level: "error",
      title: "Pipeline Failed",
      message: reason,
      pipelineId,
    });
  }

  /**
   * Determine the default forward outcome for a stage that passed.
   * Most stages use "next" or "pass"; some use "all_done".
   */
  private determineOutcome(stageType: PipelineState): TransitionOutcome {
    switch (stageType) {
      case PipelineState.PARALLEL_EXECUTION:
        return "all_done";
      case PipelineState.ADVERSARIAL_REVIEW:
      case PipelineState.TESTING:
      case PipelineState.CODE_REVIEW:
        return "pass";
      default:
        return "next";
    }
  }

  /**
   * Broadcast a pipeline update event to all subscribed clients.
   */
  private broadcastUpdate(
    pipelineId: string,
    pipeline: NonNullable<ReturnType<typeof pipelineRepo.getById>>
  ): void {
    broadcaster.broadcastToPipeline(pipelineId, {
      type: "pipeline:updated",
      pipeline: pipeline as Pipeline,
    });
  }
}

export const pipelineEngine = new PipelineEngine();
