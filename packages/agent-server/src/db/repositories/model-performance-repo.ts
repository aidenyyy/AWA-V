import { eq, and } from "drizzle-orm";
import { db, schema } from "../connection.js";
import { nanoid } from "nanoid";

export interface ModelPerformanceStats {
  taskType: string;
  complexity: string;
  model: string;
  totalRuns: number;
  successCount: number;
  successRate: number;
  avgTokens: number;
}

export const modelPerformanceRepo = {
  record(data: {
    projectId: string;
    taskType: string;
    complexity: string;
    model: string;
    succeeded: boolean;
    tokenCount: number;
  }) {
    const id = nanoid();
    const now = new Date().toISOString();

    db.insert(schema.modelPerformance)
      .values({
        id,
        projectId: data.projectId,
        taskType: data.taskType,
        complexity: data.complexity,
        model: data.model,
        succeeded: data.succeeded ? 1 : 0,
        tokenCount: data.tokenCount,
        createdAt: now,
      })
      .run();

    return id;
  },

  getStats(projectId: string): ModelPerformanceStats[] {
    const rows = db
      .select()
      .from(schema.modelPerformance)
      .where(eq(schema.modelPerformance.projectId, projectId))
      .all();

    // Group by (taskType, complexity, model)
    const groups = new Map<string, { total: number; success: number; tokens: number }>();

    for (const row of rows) {
      const key = `${row.taskType}|${row.complexity}|${row.model}`;
      const existing = groups.get(key) ?? { total: 0, success: 0, tokens: 0 };
      existing.total++;
      existing.success += row.succeeded;
      existing.tokens += row.tokenCount;
      groups.set(key, existing);
    }

    const stats: ModelPerformanceStats[] = [];
    for (const [key, value] of groups) {
      const [taskType, complexity, model] = key.split("|");
      stats.push({
        taskType,
        complexity,
        model,
        totalRuns: value.total,
        successCount: value.success,
        successRate: value.total > 0 ? value.success / value.total : 0,
        avgTokens: value.total > 0 ? Math.round(value.tokens / value.total) : 0,
      });
    }

    return stats;
  },

  getStatsForCombo(
    projectId: string,
    taskType: string,
    complexity: string
  ): ModelPerformanceStats[] {
    const rows = db
      .select()
      .from(schema.modelPerformance)
      .where(
        and(
          eq(schema.modelPerformance.projectId, projectId),
          eq(schema.modelPerformance.taskType, taskType),
          eq(schema.modelPerformance.complexity, complexity)
        )
      )
      .all();

    // Group by model
    const groups = new Map<string, { total: number; success: number; tokens: number }>();

    for (const row of rows) {
      const existing = groups.get(row.model) ?? { total: 0, success: 0, tokens: 0 };
      existing.total++;
      existing.success += row.succeeded;
      existing.tokens += row.tokenCount;
      groups.set(row.model, existing);
    }

    const stats: ModelPerformanceStats[] = [];
    for (const [model, value] of groups) {
      stats.push({
        taskType,
        complexity,
        model,
        totalRuns: value.total,
        successCount: value.success,
        successRate: value.total > 0 ? value.success / value.total : 0,
        avgTokens: value.total > 0 ? Math.round(value.tokens / value.total) : 0,
      });
    }

    return stats;
  },
};
