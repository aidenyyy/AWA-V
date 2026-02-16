import { existsSync } from "node:fs";
import {
  PipelineState,
  HumanReviewDecision,
  REPLAN_LIMIT,
  DEFAULTS,
  StageState,
  TaskState,
} from "@awa-v/shared";
import type { Pipeline } from "@awa-v/shared";
import { pipelineRepo } from "../db/repositories/pipeline-repo.js";
import { projectRepo } from "../db/repositories/project-repo.js";
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
import { worktreeManager } from "../git/worktree-manager.js";
import { processManager } from "../claude/process-manager.js";
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

    // Self-repo: create dedicated staging worktree for this pipeline
    const project = projectRepo.getById(pipeline.projectId);
    if (project?.isSelfRepo) {
      const branchName = `awa-v/self/${pipelineId.slice(0, 8)}`;
      const worktreePath = worktreeManager.createWorktree(project.repoPath, branchName);
      pipelineRepo.update(pipelineId, { selfWorktreePath: worktreePath });
      log.info({ pipelineId, worktreePath, branchName }, "Created self-repo staging worktree");
    }

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
      // Include the last stage error so the user sees the root cause
      const failures = selfHealer.getFailures(pipelineId);
      const lastError = failures.length > 0
        ? failures[failures.length - 1].error
        : undefined;
      const reason = lastError
        ? `Replan limit exceeded. Last error: ${lastError}`
        : "Replan limit exceeded";
      log.error(
        { pipelineId, reentryCount: newReentryCount, limit: REPLAN_LIMIT, lastError },
        "Replan limit exceeded; failing pipeline"
      );
      await this.failPipeline(pipelineId, reason);
      return;
    }

    log.info(
      { pipelineId, reentryCount: newReentryCount },
      "Replanning pipeline"
    );

    // Ensure no in-flight task continues writing while we rebuild the plan.
    processManager.killByPipeline(pipelineId);

    // Cancel unfinished tasks from previous attempts so only the new plan executes.
    const { stageRepo, taskRepo } = await import("../db/repositories/task-repo.js");
    const existingStages = stageRepo.getByPipeline(pipelineId);
    const now = new Date().toISOString();
    for (const task of existingStages.flatMap((s) => taskRepo.getByStage(s.id))) {
      if (
        task.state === TaskState.PENDING ||
        task.state === TaskState.QUEUED ||
        task.state === TaskState.RUNNING
      ) {
        taskRepo.update(task.id, {
          state: TaskState.CANCELLED,
          resultSummary: "Cancelled due to replan",
        });
      }
    }

    // Mark incomplete parallel execution stages as non-active to avoid stale reuse.
    for (const stage of existingStages) {
      if (
        stage.type === PipelineState.PARALLEL_EXECUTION &&
        (stage.state === StageState.PENDING || stage.state === StageState.RUNNING)
      ) {
        stageRepo.update(stage.id, {
          state: stage.state === StageState.RUNNING ? StageState.FAILED : StageState.SKIPPED,
          completedAt: now,
          errorMessage: "Replanned",
        });
      }
    }

    // Update reentry count
    pipelineRepo.update(pipelineId, { reentryCount: newReentryCount });

    // Transition to plan_generation
    await this.transitionTo(pipelineId, PipelineState.PLAN_GENERATION);
  }

  /**
   * Cancel a pipeline with full cleanup: kill processes, clean worktrees,
   * expire consultations, remove forged tools, mark stages/tasks cancelled.
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

    log.info({ pipelineId }, "Cancelling pipeline with full cleanup");

    // 1. Kill all active Claude processes for this pipeline
    processManager.killByPipeline(pipelineId);

    // 2. Mark all running/pending stages as cancelled
    const { stageRepo, taskRepo } = await import("../db/repositories/task-repo.js");
    const stages = stageRepo.getByPipeline(pipelineId);
    for (const stage of stages) {
      if (stage.state === StageState.RUNNING || stage.state === StageState.PENDING) {
        const updateData: { state: string; completedAt: string; errorMessage?: string } = {
          state: stage.state === StageState.RUNNING ? "failed" : "skipped",
          completedAt: new Date().toISOString(),
        };
        if (stage.state === StageState.RUNNING) {
          updateData.errorMessage = "Pipeline cancelled";
        }
        stageRepo.update(stage.id, updateData);
      }
    }

    // 3. Mark all running/pending tasks as cancelled
    const tasks = stages.flatMap(s => taskRepo.getByStage(s.id));
    for (const task of tasks) {
      if (task.state === TaskState.RUNNING || task.state === TaskState.PENDING || task.state === TaskState.QUEUED) {
        taskRepo.update(task.id, { state: TaskState.CANCELLED });
      }
    }

    // 4. Clean up task worktrees
    for (const task of tasks) {
      if (task.worktreePath) {
        try {
          worktreeManager.removeWorktree(task.worktreePath);
        } catch (err) {
          log.warn({ taskId: task.id, error: (err as Error).message }, "Failed to remove task worktree during cancel");
        }
      }
    }

    // 5. Clean up self-repo worktree
    if (pipeline.selfWorktreePath) {
      try {
        worktreeManager.removeWorktree(pipeline.selfWorktreePath);
      } catch (err) {
        log.warn({ pipelineId, error: (err as Error).message }, "Failed to remove self worktree during cancel");
      }
    }

    // 6. Expire pending consultations
    const { consultationManager } = await import("../services/consultation-manager.js");
    consultationManager.expireForPipeline(pipelineId);

    // 7. Cleanup forged tools
    const { toolForge } = await import("../services/tool-forge.js");
    toolForge.cleanup(pipelineId);

    // 8. Clear self-healer state
    selfHealer.clearFailures(pipelineId);

    // 9. Aggregate final costs
    await costTracker.aggregateAndUpdate(pipelineId);

    // 10. Set pipeline state to cancelled
    const updated = pipelineRepo.update(pipelineId, {
      state: PipelineState.CANCELLED,
    });

    this.broadcastUpdate(pipelineId, updated!);
  }

  /**
   * Pause a running pipeline: save current state, kill processes, set to paused.
   */
  async pause(pipelineId: string): Promise<void> {
    const pipeline = pipelineRepo.getById(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${pipelineId}`);
    }

    const currentState = pipeline.state as PipelineState;

    if (isTerminal(currentState) || currentState === PipelineState.PAUSED) {
      log.info(
        { pipelineId, state: currentState },
        "Cannot pause: pipeline is in terminal or already paused state"
      );
      return;
    }

    log.info({ pipelineId, fromState: currentState }, "Pausing pipeline");

    // Kill all active Claude processes for this pipeline
    processManager.killByPipeline(pipelineId);

    // Reset running tasks so resume can re-dispatch them deterministically.
    const { stageRepo, taskRepo } = await import("../db/repositories/task-repo.js");
    for (const stage of stageRepo.getByPipeline(pipelineId)) {
      for (const task of taskRepo.getByStage(stage.id)) {
        if (task.state === TaskState.RUNNING) {
          taskRepo.update(task.id, {
            state: TaskState.PENDING,
            resultSummary: "Paused and reset to pending",
          });
        }
      }
    }

    // Clear any self-healer timeouts
    selfHealer.clearTimeout(pipelineId);

    // Save current state and set to paused
    const updated = pipelineRepo.update(pipelineId, {
      state: PipelineState.PAUSED,
      pausedFromState: currentState,
    });

    this.broadcastUpdate(pipelineId, updated!);
  }

  /**
   * Resume a paused pipeline: restore state and re-enter the FSM.
   * Distinct from resume() which is for crash recovery.
   */
  async resumePaused(pipelineId: string): Promise<void> {
    const pipeline = pipelineRepo.getById(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${pipelineId}`);
    }

    if (pipeline.state !== PipelineState.PAUSED) {
      // Already resumed (by crash recovery or another call) — skip silently
      log.info(
        { pipelineId, state: pipeline.state },
        "Pipeline is not paused — skipping resume"
      );
      return;
    }

    const restoreState = pipeline.pausedFromState as PipelineState;
    if (!restoreState) {
      throw new Error(`Pipeline ${pipelineId} has no pausedFromState to restore`);
    }

    log.info({ pipelineId, restoreState }, "Resuming paused pipeline");

    // Restore the state and clear pausedFromState
    const updated = pipelineRepo.update(pipelineId, {
      state: restoreState,
      pausedFromState: null,
    });

    this.broadcastUpdate(pipelineId, updated!);

    // Re-enter the FSM at the restored state
    await this.runCurrentStageAndAdvance(pipelineId, restoreState);
  }

  /**
   * Resume a pipeline after a server crash/restart.
   * Re-enters the FSM loop at the pipeline's current state.
   */
  async resume(pipelineId: string): Promise<void> {
    const pipeline = pipelineRepo.getById(pipelineId);
    if (!pipeline) {
      log.warn({ pipelineId }, "Cannot resume: pipeline not found");
      return;
    }

    let currentState = pipeline.state as PipelineState;

    // Migrate deprecated prep states to unified context_prep on resume.
    if (
      currentState === PipelineState.SKILL_DISTRIBUTION ||
      currentState === PipelineState.MEMORY_INJECTION
    ) {
      const updated = pipelineRepo.update(pipelineId, {
        state: PipelineState.CONTEXT_PREP,
      });
      if (updated) {
        this.broadcastUpdate(pipelineId, updated);
      }
      currentState = PipelineState.CONTEXT_PREP;
    }

    if (isTerminal(currentState)) {
      log.warn(
        { pipelineId, state: currentState },
        "Cannot resume: pipeline is in terminal state"
      );
      return;
    }

    // Paused pipelines: use resumePaused() flow
    if (currentState === PipelineState.PAUSED) {
      await this.resumePaused(pipelineId);
      return;
    }

    // Intervention stages: re-park via the intervention manager
    if (
      currentState === PipelineState.HUMAN_REVIEW ||
      currentState === PipelineState.PLAN_GENERATION ||
      currentState === PipelineState.ADVERSARIAL_REVIEW
    ) {
      log.info(
        { pipelineId, state: currentState },
        "Resuming pipeline in intervention stage — re-parking"
      );
      const { interventionManager } = await import(
        "../services/intervention-manager.js"
      );
      await interventionManager.reParkIntervention(pipelineId, currentState);
      return;
    }

    // Self-repo: ensure staging worktree exists (may have been lost on restart)
    if (pipeline.selfWorktreePath && !existsSync(pipeline.selfWorktreePath)) {
      const project = projectRepo.getById(pipeline.projectId);
      if (project) {
        const branchName = `awa-v/self/${pipelineId.slice(0, 8)}`;
        try {
          const worktreePath = worktreeManager.createWorktree(project.repoPath, branchName);
          pipelineRepo.update(pipelineId, { selfWorktreePath: worktreePath });
          log.info({ pipelineId, worktreePath }, "Recreated self-repo staging worktree on resume");
        } catch (err) {
          log.error({ pipelineId, error: (err as Error).message }, "Failed to recreate self-repo worktree");
        }
      }
    }

    log.info(
      { pipelineId, state: currentState },
      "Resuming pipeline from current stage"
    );

    await this.runCurrentStageAndAdvance(pipelineId, currentState);
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

      // Expire pending consultations
      const { consultationManager } = await import("../services/consultation-manager.js");
      consultationManager.expireForPipeline(pipelineId);

      // Cleanup forged tools
      const { toolForge } = await import("../services/tool-forge.js");
      toolForge.cleanup(pipelineId);

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
    } else if (result.outcome === "replan") {
      log.info({ pipelineId, stageType }, "Stage requested replan");
      await this.replan(pipelineId);
    } else if (result.outcome === "cancel") {
      log.info({ pipelineId, stageType }, "Stage requested cancellation");
      await this.cancel(pipelineId);
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
    // Explicit user intents should bypass retry logic.
    if (error.startsWith("REPLAN_REQUESTED:")) {
      log.info({ pipelineId, stageType, reason: error }, "User requested replan");
      await this.replan(pipelineId);
      return;
    }
    if (error.startsWith("CANCEL_REQUESTED:")) {
      log.info({ pipelineId, stageType, reason: error }, "User requested cancellation");
      await this.cancel(pipelineId);
      return;
    }
    // Non-JSON planning output is deterministic from prompt/format mismatch.
    // Retrying the same stage immediately tends to spawn duplicate planners
    // without improving outcome.
    if (
      stageType === PipelineState.PLAN_GENERATION &&
      (error.includes("Unexpected token") ||
        error.includes("Plan must contain 'content' and 'taskBreakdown'") ||
        error.includes("missing 'title' or 'description'"))
    ) {
      await this.failPipeline(pipelineId, `Fatal planning parse error: ${error}`);
      return;
    }

    const action = selfHealer.handleFailure(pipelineId, stageType, error);

    switch (action) {
      case "retry":
        log.info({ pipelineId, stageType }, "Retrying stage after failure");
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await this.runCurrentStageAndAdvance(
          pipelineId,
          stageType as PipelineState
        );
        break;

      case "fatal":
        log.error({ pipelineId, stageType }, "Fatal failure; retry limit exhausted");
        await this.failPipeline(
          pipelineId,
          `Fail fast after retries in stage ${stageType}: ${error}`
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
      errorMessage: reason,
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
    broadcaster.broadcastToProject(pipeline.projectId, {
      type: "pipeline:updated",
      pipeline: pipeline as Pipeline,
    });
  }
}

export const pipelineEngine = new PipelineEngine();
