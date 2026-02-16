import {
  modelPerformanceRepo,
  type ModelPerformanceStats,
} from "../db/repositories/model-performance-repo.js";
import pino from "pino";

const log = pino({ name: "model-router" });

/**
 * ModelRouter — thin data access layer for model performance recording/stats.
 *
 * Model selection decisions are now owned by EvolutionEngine.selectModel().
 * This class only handles outcome recording and stats retrieval.
 */
class ModelRouter {
  /**
   * Record the outcome of a task execution for future routing decisions.
   */
  recordOutcome(
    projectId: string,
    agentRole: string,
    complexity: string,
    model: string,
    succeeded: boolean,
    tokenCount: number
  ): void {
    modelPerformanceRepo.record({
      projectId,
      taskType: agentRole,
      complexity,
      model,
      succeeded,
      tokenCount,
    });

    log.debug(
      { projectId, agentRole, complexity, model, succeeded, tokenCount },
      "Model outcome recorded"
    );
  }

  /**
   * Get all model performance stats for a project.
   */
  getStats(projectId: string): ModelPerformanceStats[] {
    return modelPerformanceRepo.getStats(projectId);
  }
}

// Singleton
export const modelRouter = new ModelRouter();
