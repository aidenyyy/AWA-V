import { evolutionRepo } from "../db/repositories/evolution-repo.js";
import { memoryRepo } from "../db/repositories/memory-repo.js";
import { consultationRepo } from "../db/repositories/consultation-repo.js";
import { pipelineRepo } from "../db/repositories/pipeline-repo.js";
import { projectRepo } from "../db/repositories/project-repo.js";
import { taskRepo, stageRepo } from "../db/repositories/task-repo.js";
import { processManager } from "../claude/process-manager.js";
import { modelRouter } from "./model-router.js";
import { interventionManager } from "./intervention-manager.js";
import { EVOLUTION_ANALYST_PROMPT } from "../prompts/evolution-analyst.js";
import {
  DEFAULTS,
  COMPLEXITY_MODEL_MAP,
  STAGE_MODEL_MAP,
} from "@awa-v/shared";
import type { StreamChunk, ModelTier, ModelId } from "@awa-v/shared";
import {
  modelPerformanceRepo,
} from "../db/repositories/model-performance-repo.js";
import pino from "pino";

const log = pino({ name: "evolution-engine" });

/**
 * Evolution Engine — Claude-powered analysis + backend strategy updates.
 *
 * Captures structured metrics from pipeline executions, calls Claude
 * to identify patterns, and applies recommendations to backend-managed state.
 */
class EvolutionEngine {
  /**
   * Capture structured metrics from a completed pipeline execution.
   * Records replan frequency, failure patterns, skill effectiveness, and cost data.
   */
  captureMetrics(pipelineId: string): void {
    const pipeline = pipelineRepo.getById(pipelineId);
    if (!pipeline) {
      log.warn({ pipelineId }, "Pipeline not found for metric capture");
      return;
    }

    log.info({ pipelineId, projectId: pipeline.projectId }, "Capturing evolution metrics");

    const tasks = taskRepo.getByPipeline(pipelineId);
    const failedTasks = tasks.filter((t) => t.state === "failed");
    const completedTasks = tasks.filter((t) => t.state === "completed");

    // Consultation pattern metrics
    const allConsultations = consultationRepo.getByPipeline(pipelineId);
    const consultCount = allConsultations.filter((c) => !c.blocking).length;
    const blockCount = allConsultations.filter((c) => c.blocking).length;
    const answeredBeforeCompletion = allConsultations.filter(
      (c) => c.status === "answered"
    ).length;
    const expiredCount = allConsultations.filter(
      (c) => c.status === "expired"
    ).length;

    // Churn metrics from code review quality gate
    const codeReviewStages = stageRepo
      .getByPipeline(pipelineId)
      .filter((s) => s.type === "code_review" && s.qualityGateResult);

    let churnMetrics = null;
    if (codeReviewStages.length > 0) {
      try {
        const result = JSON.parse(codeReviewStages[0].qualityGateResult!);
        churnMetrics = result.churnMetrics ?? null;
      } catch {
        // ignore parse errors
      }
    }

    const metrics = {
      pipelineId,
      projectId: pipeline.projectId,
      state: pipeline.state,
      reentryCount: pipeline.reentryCount,
      totalCostUsd: pipeline.totalCostUsd,
      totalInputTokens: pipeline.totalInputTokens,
      totalOutputTokens: pipeline.totalOutputTokens,
      taskCount: tasks.length,
      failedTaskCount: failedTasks.length,
      completedTaskCount: completedTasks.length,
      failedTaskRoles: failedTasks.map((t) => t.agentRole),
      consultationMetrics: {
        consultCount,
        blockCount,
        answeredBeforeCompletion,
        expiredCount,
      },
      churnMetrics,
      capturedAt: new Date().toISOString(),
    };

    memoryRepo.create({
      projectId: pipeline.projectId,
      pipelineId,
      layer: "L1",
      type: "pattern",
      content: JSON.stringify(metrics),
    });

    log.info(
      {
        pipelineId,
        reentryCount: metrics.reentryCount,
        costUsd: metrics.totalCostUsd,
        taskSuccess: `${completedTasks.length}/${tasks.length}`,
      },
      "Metrics captured"
    );
  }

  /**
   * Analyze patterns across pipeline executions using Claude.
   * Falls back to statistical analysis if Claude is unavailable.
   */
  async analyze(projectId: string): Promise<EvolutionAnalysis> {
    log.info({ projectId }, "Starting evolution analysis");

    const pipelines = pipelineRepo.getByProject(projectId);
    const memories = memoryRepo.getByProject(projectId);

    if (pipelines.length === 0) {
      log.info({ projectId }, "No pipelines to analyze");
      return {
        patterns: [],
        recommendations: [],
        metrics: {
          totalPipelines: 0,
          avgReplanCount: 0,
          avgCostUsd: 0,
          successRate: 0,
        },
      };
    }

    // Build structured input for Claude
    const completedPipelines = pipelines.filter((p) => p.state === "completed");
    const failedPipelines = pipelines.filter((p) => p.state === "failed");
    const avgReplanCount =
      pipelines.reduce((sum, p) => sum + p.reentryCount, 0) / pipelines.length;
    const avgCostUsd =
      pipelines.reduce((sum, p) => sum + p.totalCostUsd, 0) / pipelines.length;
    const successRate =
      pipelines.length > 0 ? completedPipelines.length / pipelines.length : 0;

    const errorMemories = memories.filter((m) => m.type === "error");
    const patternMemories = memories.filter((m) => m.type === "pattern" && m.layer === "L1");

    // Include model performance stats
    const modelStats = modelRouter.getStats(projectId);

    const analysisInput = {
      totalPipelines: pipelines.length,
      completedCount: completedPipelines.length,
      failedCount: failedPipelines.length,
      avgReplanCount,
      avgCostUsd,
      successRate,
      recentErrors: errorMemories.slice(-10).map((m) => m.content),
      recentPatterns: patternMemories.slice(-10).map((m) => m.content),
      pipelineSummaries: pipelines.slice(-5).map((p) => ({
        state: p.state,
        reentryCount: p.reentryCount,
        costUsd: p.totalCostUsd,
        tokens: p.totalInputTokens + p.totalOutputTokens,
      })),
      modelPerformance: modelStats.map((s) => ({
        taskType: s.taskType,
        complexity: s.complexity,
        model: s.model,
        successRate: s.successRate,
        totalRuns: s.totalRuns,
        avgTokens: s.avgTokens,
      })),
    };

    // Try Claude analysis, fall back to statistical
    try {
      const claudeAnalysis = await this.runClaudeAnalysis(projectId, analysisInput);
      if (claudeAnalysis) {
        log.info(
          {
            projectId,
            patternsFound: claudeAnalysis.patterns.length,
            recommendationsGenerated: claudeAnalysis.recommendations.length,
          },
          "Claude evolution analysis complete"
        );
        return claudeAnalysis;
      }
    } catch (err) {
      log.warn(
        { projectId, error: (err as Error).message },
        "Claude analysis failed, falling back to statistical"
      );
    }

    // Fallback: statistical analysis
    return this.statisticalAnalysis(
      pipelines.length,
      avgReplanCount,
      avgCostUsd,
      successRate,
      failedPipelines.length,
      errorMemories.length
    );
  }

  /**
   * Select the best model for a task, checking evolution-driven overrides first.
   * Replaces ModelRouter.selectModel() as the single source of model decisions.
   */
  selectModel(
    projectId: string,
    stageType: string,
    agentRole: string,
    complexity: ModelTier
  ): ModelId {
    const project = projectRepo.getById(projectId);
    const overrides = JSON.parse(project?.modelOverrides ?? "{}") as {
      stageModels?: Record<string, ModelId>;
      roleModels?: Record<string, ModelId>;
    };

    // 1. Check evolution-driven role:complexity override
    const roleKey = `${agentRole}:${complexity}`;
    if (overrides.roleModels?.[roleKey]) {
      log.debug(
        { projectId, agentRole, complexity, model: overrides.roleModels[roleKey], reason: "evolution-role-override" },
        "Using evolution role override"
      );
      return overrides.roleModels[roleKey];
    }

    // 2. Check evolution-driven stage override
    if (overrides.stageModels?.[stageType]) {
      log.debug(
        { projectId, stageType, model: overrides.stageModels[stageType], reason: "evolution-stage-override" },
        "Using evolution stage override"
      );
      return overrides.stageModels[stageType];
    }

    // 3. Data-driven routing: check historical performance
    const defaultModel = COMPLEXITY_MODEL_MAP[complexity];
    const stats = modelPerformanceRepo.getStatsForCombo(projectId, agentRole, complexity);
    const totalRuns = stats.reduce((sum, s) => sum + s.totalRuns, 0);

    if (totalRuns >= DEFAULTS.MODEL_ROUTER_MIN_SAMPLES) {
      const defaultStats = stats.find((s) => s.model === defaultModel);
      if (defaultStats && defaultStats.successRate < DEFAULTS.MODEL_UPGRADE_THRESHOLD) {
        const upgraded = this.upgradeModel(defaultModel);
        log.info(
          { projectId, agentRole, complexity, from: defaultModel, to: upgraded, successRate: defaultStats.successRate },
          "Upgrading model due to low success rate"
        );
        return upgraded;
      }
    }

    // 4. Default mapping: stage → complexity → project
    return STAGE_MODEL_MAP[stageType] ?? COMPLEXITY_MODEL_MAP[complexity] ?? (project?.model as ModelId) ?? "sonnet";
  }

  /**
   * Apply recommendations by updating config, adjusting model routing, and recording insights.
   */
  async applyRecommendations(
    projectId: string,
    recommendations: EvolutionRecommendation[],
    triggerPipelineId?: string
  ): Promise<void> {
    log.info(
      { projectId, count: recommendations.length },
      "Applying evolution recommendations"
    );

    const project = projectRepo.getById(projectId);
    if (!project) {
      log.warn({ projectId }, "Project not found for applying recommendations");
      return;
    }

    for (const rec of recommendations) {
      if (rec.type === "config_change" && rec.configChanges) {
        // Config changes require user approval via intervention
        await this.applyConfigChange(projectId, rec, triggerPipelineId);
      } else if (rec.type === "model_routing" && rec.configChanges) {
        // Model routing changes are data-driven and low-risk — apply automatically
        this.applyModelRouting(projectId, project, rec, triggerPipelineId);
      } else {
        // Non-actionable recommendations: just record them
        evolutionRepo.create({
          projectId,
          triggerPipelineId,
          patternDescription: rec.description,
          actionType: rec.type,
          diff: JSON.stringify(rec),
        });

        log.info(
          { projectId, type: rec.type, description: rec.description },
          "Recommendation recorded"
        );
      }
    }
  }

  // ─── Private: config_change with intervention approval ───────

  private async applyConfigChange(
    projectId: string,
    rec: EvolutionRecommendation,
    triggerPipelineId?: string
  ): Promise<void> {
    const project = projectRepo.getById(projectId);
    if (!project || !rec.configChanges) return;

    // Store pre-change state for rollback
    const previousValues: Record<string, unknown> = {};
    for (const key of Object.keys(rec.configChanges)) {
      if (key === "model" || key === "maxBudgetUsd") {
        previousValues[key] = (project as Record<string, unknown>)[key];
      }
    }

    if (!triggerPipelineId) {
      // No pipeline context — can't request intervention, just record
      evolutionRepo.create({
        projectId,
        triggerPipelineId,
        patternDescription: rec.description,
        actionType: "config_change",
        diff: JSON.stringify({ applied: false, noInterventionContext: true, changes: rec.configChanges }),
      });
      log.info({ projectId, type: rec.type }, "Config change recorded (no pipeline for intervention)");
      return;
    }

    // Request user approval via intervention system
    const response = await interventionManager.requestIntervention({
      pipelineId: triggerPipelineId,
      stageType: "evolution_config",
      question: `Evolution recommends: ${rec.description}. Apply this change?`,
      context: {
        recommendation: rec,
        currentValues: previousValues,
        proposedValues: rec.configChanges,
      },
    });

    if (response === "approve" || response === "proceed") {
      // Apply the changes
      const updateData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rec.configChanges)) {
        if (key === "model" || key === "maxBudgetUsd") {
          updateData[key] = value;
        }
      }

      if (Object.keys(updateData).length > 0) {
        projectRepo.update(projectId, updateData as { model?: string; maxBudgetUsd?: number });
      }

      // Record with rollback data
      evolutionRepo.create({
        projectId,
        triggerPipelineId,
        patternDescription: rec.description,
        actionType: "config_change",
        diff: JSON.stringify({
          applied: true,
          changes: rec.configChanges,
          previousValues,
        }),
      });

      log.info(
        { projectId, description: rec.description, changes: updateData },
        "Config change applied after user approval"
      );
    } else {
      // Record as rejected
      evolutionRepo.create({
        projectId,
        triggerPipelineId,
        patternDescription: rec.description,
        actionType: "config_change",
        diff: JSON.stringify({ applied: false, rejected: true, changes: rec.configChanges }),
      });

      log.info(
        { projectId, description: rec.description },
        "Config change rejected by user"
      );
    }
  }

  // ─── Private: model_routing auto-apply (no intervention) ────

  private applyModelRouting(
    projectId: string,
    project: { modelOverrides: string },
    rec: EvolutionRecommendation,
    triggerPipelineId?: string
  ): void {
    if (!rec.configChanges) return;

    const overrides = JSON.parse(project.modelOverrides ?? "{}") as {
      stageModels?: Record<string, string>;
      roleModels?: Record<string, string>;
    };
    const previousOverrides = JSON.stringify(overrides);

    // Merge new routing rules
    if (rec.configChanges.stageModelOverrides && typeof rec.configChanges.stageModelOverrides === "object") {
      overrides.stageModels = {
        ...overrides.stageModels,
        ...(rec.configChanges.stageModelOverrides as Record<string, string>),
      };
    }
    if (rec.configChanges.modelRouting && typeof rec.configChanges.modelRouting === "object") {
      overrides.roleModels = {
        ...overrides.roleModels,
        ...(rec.configChanges.modelRouting as Record<string, string>),
      };
    }

    projectRepo.update(projectId, { modelOverrides: JSON.stringify(overrides) });

    evolutionRepo.create({
      projectId,
      triggerPipelineId,
      patternDescription: rec.description,
      actionType: "model_routing",
      diff: JSON.stringify({
        applied: true,
        changes: overrides,
        previousValues: previousOverrides,
      }),
    });

    log.info(
      { projectId, description: rec.description, overrides },
      "Model routing updated automatically"
    );
  }

  // ─── Private: model upgrade helper ─────────────────────────

  private upgradeModel(current: ModelId): ModelId {
    switch (current) {
      case "haiku":
        return "sonnet";
      case "sonnet":
        return "opus";
      case "opus":
        return "opus";
    }
  }

  // ─── Private helpers ────────────────────────────────────────

  /**
   * Run Claude (haiku model for cost efficiency) to analyze patterns.
   * Uses a lightweight spawn without DB task/session records to avoid
   * foreign key issues (evolution runs outside any pipeline).
   */
  private async runClaudeAnalysis(
    projectId: string,
    input: Record<string, unknown>
  ): Promise<EvolutionAnalysis | null> {
    const project = projectRepo.getById(projectId);
    if (!project) return null;

    const analysisPrompt = [
      "Analyze the following pipeline execution data and provide recommendations:\n\n",
      JSON.stringify(input, null, 2),
    ].join("");

    const sessionId = `evolution-${projectId}-${Date.now()}`;

    const proc = processManager.spawn(sessionId, {
      prompt: analysisPrompt,
      cwd: project.repoPath,
      model: "haiku",
      permissionMode: "auto",
      systemPrompt: EVOLUTION_ANALYST_PROMPT,
      maxTurns: 2,
    });

    return new Promise<EvolutionAnalysis | null>((resolve) => {
      let output = "";

      proc.events.on("chunk", (chunk: StreamChunk) => {
        if (chunk.type === "assistant:text") {
          output += chunk.text;
        }

        if (chunk.type === "done") {
          try {
            const parsed = this.parseClaudeAnalysis(output);
            resolve(parsed);
          } catch {
            log.warn({ projectId }, "Could not parse Claude analysis output");
            resolve(null);
          }
        }
      });

      proc.events.on("error", () => {
        resolve(null);
      });
    });
  }

  /**
   * Parse Claude's JSON analysis output.
   */
  private parseClaudeAnalysis(raw: string): EvolutionAnalysis {
    let jsonStr = raw.trim();
    const m = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (m) jsonStr = m[1].trim();

    const parsed = JSON.parse(jsonStr);

    const patterns: EvolutionPattern[] = (parsed.patterns ?? []).map(
      (p: Record<string, unknown>) => ({
        type: String(p.type ?? "efficiency"),
        description: String(p.description ?? ""),
        frequency: String(p.frequency ?? "unknown"),
        impact: String(p.impact ?? "medium") as "high" | "medium" | "low",
      })
    );

    const validTypes = ["config_change", "model_routing", "skill_suggestion", "prompt_improvement"];
    const recommendations: EvolutionRecommendation[] = (
      parsed.recommendations ?? []
    ).map((r: Record<string, unknown>) => {
      const rawType = String(r.type ?? "prompt_improvement");
      const type = validTypes.includes(rawType) ? rawType : "prompt_improvement";
      return {
        type: type as EvolutionRecommendation["type"],
        description: String(r.description ?? ""),
        rationale: String(r.rationale ?? ""),
        priority: String(r.priority ?? "medium") as "high" | "medium" | "low",
        diff: r.diff ? String(r.diff) : undefined,
        configChanges: r.configChanges && typeof r.configChanges === "object"
          ? (r.configChanges as Record<string, unknown>)
          : undefined,
      };
    });

    return {
      patterns,
      recommendations,
      metrics: {
        totalPipelines: Number(parsed.metrics?.totalPipelines ?? 0),
        avgReplanCount: Number(parsed.metrics?.avgReplanCount ?? 0),
        avgCostUsd: Number(parsed.metrics?.avgCostPerPipeline ?? 0),
        successRate: Number(parsed.metrics?.avgTaskSuccessRate ?? 0),
      },
    };
  }

  /**
   * Fallback statistical analysis when Claude is unavailable.
   */
  private statisticalAnalysis(
    totalPipelines: number,
    avgReplanCount: number,
    avgCostUsd: number,
    successRate: number,
    failedCount: number,
    errorMemoryCount: number
  ): EvolutionAnalysis {
    const patterns: EvolutionPattern[] = [];
    const recommendations: EvolutionRecommendation[] = [];

    if (avgReplanCount > 1.5) {
      patterns.push({
        type: "efficiency",
        description: "High replan frequency detected. Plans may need more upfront detail.",
        frequency: `${avgReplanCount.toFixed(1)} replans per pipeline`,
        impact: "high",
      });
      recommendations.push({
        type: "prompt_improvement",
        description: "Add more explicit requirements format guidelines to the planner prompt.",
        rationale: "High replan count suggests initial plans are insufficiently detailed.",
        priority: "high",
      });
    }

    if (successRate < 0.7) {
      patterns.push({
        type: "failure",
        description: `Low success rate: ${(successRate * 100).toFixed(0)}% of pipelines complete successfully.`,
        frequency: `${failedCount} of ${totalPipelines} pipelines failed`,
        impact: "high",
      });
      recommendations.push({
        type: "config_change",
        description: "Increase SELF_HEAL_RETRY_LIMIT and consider adding error recovery strategies.",
        rationale: "Low success rate may benefit from additional retry attempts.",
        priority: "high",
      });
    }

    if (avgCostUsd > 5) {
      patterns.push({
        type: "efficiency",
        description: `Average pipeline cost is high (${avgCostUsd.toFixed(2)} USD equivalent), which is above target.`,
        frequency: "per pipeline",
        impact: "medium",
      });
    }

    if (errorMemoryCount > 5) {
      recommendations.push({
        type: "prompt_improvement",
        description: "Document common error patterns in backend evolution logs for future routing decisions.",
        rationale: `${errorMemoryCount} error memories found. Recording patterns can prevent recurrence.`,
        priority: "medium",
      });
    }

    return {
      patterns,
      recommendations,
      metrics: { totalPipelines, avgReplanCount, avgCostUsd, successRate },
    };
  }
}

// ─── Types ─────────────────────────────────────────────────────

export interface EvolutionPattern {
  type: "failure" | "efficiency" | "quality" | "skill";
  description: string;
  frequency: string;
  impact: "high" | "medium" | "low";
}

export interface EvolutionRecommendation {
  type: "config_change" | "model_routing" | "skill_suggestion" | "prompt_improvement";
  description: string;
  rationale: string;
  priority: "high" | "medium" | "low";
  diff?: string;
  configChanges?: Record<string, unknown>;
}

export interface EvolutionAnalysis {
  patterns: EvolutionPattern[];
  recommendations: EvolutionRecommendation[];
  metrics: {
    totalPipelines: number;
    avgReplanCount: number;
    avgCostUsd: number;
    successRate: number;
  };
}

// Singleton
export const evolutionEngine = new EvolutionEngine();
