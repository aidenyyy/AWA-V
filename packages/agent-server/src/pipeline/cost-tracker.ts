import { pipelineRepo } from "../db/repositories/pipeline-repo.js";
import { claudeSessionRepo } from "../db/repositories/task-repo.js";
import { taskRepo } from "../db/repositories/task-repo.js";
import { projectRepo } from "../db/repositories/project-repo.js";
import type { TokenBreakdown } from "@awa-v/shared";
import pino from "pino";

const log = pino({ name: "cost-tracker" });

// ─── Types ──────────────────────────────────────────────────

export interface CostSummary {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  tokenBreakdown: TokenBreakdown;
  withinBudget: boolean;
  budgetRemainingUsd: number;
}

function emptyBreakdown(): TokenBreakdown {
  return {
    haiku: { input: 0, output: 0 },
    sonnet: { input: 0, output: 0 },
    opus: { input: 0, output: 0 },
  };
}

function modelToKey(model: string): "haiku" | "sonnet" | "opus" {
  if (model.includes("haiku")) return "haiku";
  if (model.includes("opus")) return "opus";
  return "sonnet"; // default
}

// ─── Cost Tracker ───────────────────────────────────────────

export const costTracker = {
  /**
   * Aggregate costs from all Claude sessions associated with a pipeline
   * and update the pipeline totals.
   */
  async aggregateAndUpdate(pipelineId: string): Promise<CostSummary> {
    const tasks = taskRepo.getByPipeline(pipelineId);

    let totalCostUsd = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const breakdown = emptyBreakdown();

    for (const task of tasks) {
      const sessions = claudeSessionRepo.getByTask(task.id);
      for (const session of sessions) {
        totalCostUsd += session.costUsd;
        totalInputTokens += session.inputTokens;
        totalOutputTokens += session.outputTokens;

        // Aggregate per-model breakdown
        const key = modelToKey(session.model);
        breakdown[key].input += session.inputTokens;
        breakdown[key].output += session.outputTokens;
      }
    }

    // Update pipeline with aggregated costs
    pipelineRepo.update(pipelineId, {
      totalCostUsd,
      totalInputTokens,
      totalOutputTokens,
      tokenBreakdown: JSON.stringify(breakdown),
    });

    log.info(
      { pipelineId, totalCostUsd, totalInputTokens, totalOutputTokens },
      "Costs aggregated"
    );

    // Check budget
    const budgetCheck = await this.checkBudget(pipelineId);

    return {
      totalCostUsd,
      totalInputTokens,
      totalOutputTokens,
      tokenBreakdown: breakdown,
      withinBudget: budgetCheck.withinBudget,
      budgetRemainingUsd: budgetCheck.budgetRemainingUsd,
    };
  },

  /**
   * Check if the pipeline is within its project's budget limit.
   */
  async checkBudget(
    pipelineId: string
  ): Promise<{ withinBudget: boolean; budgetRemainingUsd: number }> {
    const pipeline = pipelineRepo.getById(pipelineId);
    if (!pipeline) {
      log.warn({ pipelineId }, "Pipeline not found for budget check");
      return { withinBudget: false, budgetRemainingUsd: 0 };
    }

    const project = projectRepo.getById(pipeline.projectId);
    if (!project) {
      log.warn(
        { pipelineId, projectId: pipeline.projectId },
        "Project not found for budget check"
      );
      return { withinBudget: false, budgetRemainingUsd: 0 };
    }

    const maxBudget = project.maxBudgetUsd;
    const currentCost = pipeline.totalCostUsd;
    const remaining = maxBudget - currentCost;
    const withinBudget = currentCost <= maxBudget;

    if (!withinBudget) {
      log.warn(
        { pipelineId, currentCost, maxBudget },
        "Pipeline has exceeded budget"
      );
    }

    return {
      withinBudget,
      budgetRemainingUsd: Math.max(0, remaining),
    };
  },

  /**
   * Get the current cost summary for a pipeline without updating.
   */
  getSummary(pipelineId: string): CostSummary | undefined {
    const pipeline = pipelineRepo.getById(pipelineId);
    if (!pipeline) return undefined;

    const project = projectRepo.getById(pipeline.projectId);
    const maxBudget = project?.maxBudgetUsd ?? 0;
    const remaining = maxBudget - pipeline.totalCostUsd;

    // Parse stored tokenBreakdown or use empty
    let tokenBreakdown: TokenBreakdown;
    try {
      tokenBreakdown = JSON.parse(
        (pipeline as { tokenBreakdown?: string }).tokenBreakdown ?? "{}"
      ) as TokenBreakdown;
    } catch {
      tokenBreakdown = emptyBreakdown();
    }

    return {
      totalCostUsd: pipeline.totalCostUsd,
      totalInputTokens: pipeline.totalInputTokens,
      totalOutputTokens: pipeline.totalOutputTokens,
      tokenBreakdown,
      withinBudget: pipeline.totalCostUsd <= maxBudget,
      budgetRemainingUsd: Math.max(0, remaining),
    };
  },
};
