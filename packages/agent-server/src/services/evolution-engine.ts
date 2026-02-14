import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { evolutionRepo } from "../db/repositories/evolution-repo.js";
import { memoryRepo } from "../db/repositories/memory-repo.js";
import { pipelineRepo } from "../db/repositories/pipeline-repo.js";
import { projectRepo } from "../db/repositories/project-repo.js";
import { taskRepo } from "../db/repositories/task-repo.js";
import { processManager } from "../claude/process-manager.js";
import { commitManager } from "../git/commit-manager.js";
import { EVOLUTION_ANALYST_PROMPT } from "../prompts/evolution-analyst.js";
import type { StreamChunk } from "@awa-v/shared";
import pino from "pino";

const log = pino({ name: "evolution-engine" });

/**
 * Evolution Engine — Claude-powered analysis + CLAUDE.md writes.
 *
 * Captures structured metrics from pipeline executions, calls Claude
 * to identify patterns, and applies recommendations by modifying CLAUDE.md.
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
   * Apply recommendations by writing to CLAUDE.md and/or updating config.
   */
  async applyRecommendations(
    projectId: string,
    recommendations: EvolutionRecommendation[]
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
      if (rec.type === "claude_md_update" && rec.diff) {
        // Actually write to CLAUDE.md
        const claudeMdPath = join(project.repoPath, "CLAUDE.md");
        try {
          const existing = existsSync(claudeMdPath)
            ? readFileSync(claudeMdPath, "utf-8")
            : "";

          const separator = "\n\n<!-- AWA-V Evolution -->\n";
          const updated = existing + separator + rec.diff;
          writeFileSync(claudeMdPath, updated);

          // Commit the change
          try {
            commitManager.commit(
              project.repoPath,
              `evolution: ${rec.description.slice(0, 72)}`
            );
          } catch {
            // Commit may fail if working tree is dirty from other operations
            log.warn({ projectId }, "Could not commit CLAUDE.md evolution update");
          }

          // Record in evolution_logs
          evolutionRepo.create({
            projectId,
            patternDescription: rec.description,
            actionType: "claude_md_update",
            diff: rec.diff,
          });

          log.info(
            { projectId, description: rec.description },
            "CLAUDE.md updated with evolution recommendation"
          );
        } catch (err) {
          log.error(
            { projectId, error: (err as Error).message },
            "Failed to update CLAUDE.md"
          );
        }
      } else {
        // Non-file recommendations: just record them
        evolutionRepo.create({
          projectId,
          patternDescription: rec.description,
          actionType: rec.type === "claude_md_update" ? "claude_md_update" : "config_change",
          diff: JSON.stringify(rec),
        });

        log.info(
          { projectId, type: rec.type, description: rec.description },
          "Recommendation recorded"
        );
      }
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

    const recommendations: EvolutionRecommendation[] = (
      parsed.recommendations ?? []
    ).map((r: Record<string, unknown>) => ({
      type: String(r.type ?? "claude_md_update"),
      description: String(r.description ?? ""),
      rationale: String(r.rationale ?? ""),
      priority: String(r.priority ?? "medium") as "high" | "medium" | "low",
      diff: r.diff ? String(r.diff) : undefined,
    }));

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
        description: `Average pipeline cost is $${avgCostUsd.toFixed(2)}, which is above target.`,
        frequency: "per pipeline",
        impact: "medium",
      });
    }

    if (errorMemoryCount > 5) {
      recommendations.push({
        type: "claude_md_update",
        description: "Document common error patterns and workarounds in CLAUDE.md.",
        rationale: `${errorMemoryCount} error memories found. Documenting patterns can prevent recurrence.`,
        priority: "medium",
        diff: "## Known Error Patterns\n\n_Auto-generated by AWA-V Evolution Engine. Review and refine these patterns._\n",
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
  type: "claude_md_update" | "config_change" | "skill_suggestion" | "prompt_improvement";
  description: string;
  rationale: string;
  priority: "high" | "medium" | "low";
  diff?: string;
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
