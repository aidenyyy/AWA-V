import type { FastifyInstance } from "fastify";
import { execFileSync } from "node:child_process";
import { createPipelineSchema } from "@awa-v/shared";
import type { Pipeline } from "@awa-v/shared";
import { pipelineRepo } from "../db/repositories/pipeline-repo.js";
import { projectRepo } from "../db/repositories/project-repo.js";
import { stageRepo, taskRepo, planRepo } from "../db/repositories/task-repo.js";
import { pipelineEngine } from "../pipeline/engine.js";
import { processManager } from "../claude/process-manager.js";
import { worktreeManager } from "../git/worktree-manager.js";
import { db, schema } from "../db/connection.js";
import { count } from "drizzle-orm";
import { broadcaster } from "../ws/broadcaster.js";
import pino from "pino";

const log = pino({ name: "pipeline-routes" });

export function registerPipelineRoutes(app: FastifyInstance) {
  // Dashboard aggregated stats
  app.get("/api/dashboard/stats", async () => {
    const pipelines = pipelineRepo.getAll();
    const terminalStates = ["completed", "cancelled", "failed"];

    let totalCostUsd = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let activePipelines = 0;
    let pausedPipelines = 0;
    const tokensByModel: Record<string, { input: number; output: number }> = {
      haiku: { input: 0, output: 0 },
      sonnet: { input: 0, output: 0 },
      opus: { input: 0, output: 0 },
    };

    for (const p of pipelines) {
      totalCostUsd += p.totalCostUsd;
      totalInputTokens += p.totalInputTokens;
      totalOutputTokens += p.totalOutputTokens;

      if (!terminalStates.includes(p.state)) {
        activePipelines++;
        if (p.state === "paused") {
          pausedPipelines++;
        }
      }

      try {
        const breakdown = JSON.parse(p.tokenBreakdown) as Record<
          string,
          { input: number; output: number }
        >;
        for (const [model, tokens] of Object.entries(breakdown)) {
          if (tokensByModel[model]) {
            tokensByModel[model].input += tokens.input ?? 0;
            tokensByModel[model].output += tokens.output ?? 0;
          }
        }
      } catch {
        // skip malformed JSON
      }
    }

    const [{ value: totalEvolutions }] = db
      .select({ value: count() })
      .from(schema.evolutionLogs)
      .all();

    const [{ value: totalMemories }] = db
      .select({ value: count() })
      .from(schema.memory)
      .all();

    const [{ value: totalProjects }] = db
      .select({ value: count() })
      .from(schema.projects)
      .all();

    const pendingSelfUpdates = pipelines.filter(
      (p) => p.selfWorktreePath && !p.selfMerged && p.state === "completed"
    ).length;

    return {
      data: {
        totalProjects,
        activePipelines,
        pausedPipelines,
        totalCostUsd,
        totalInputTokens,
        totalOutputTokens,
        tokensByModel,
        totalEvolutions,
        totalMemories,
        activeSessions: processManager.activeCount,
        pendingSelfUpdates,
      },
    };
  });
  // List pipelines for a project
  app.get<{ Querystring: { projectId: string } }>(
    "/api/pipelines",
    async (req) => {
      const pipelines = pipelineRepo.getByProject(req.query.projectId);
      return { data: pipelines };
    }
  );

  // Get pipeline detail
  app.get<{ Params: { id: string } }>(
    "/api/pipelines/:id",
    async (req, reply) => {
      const pipeline = pipelineRepo.getById(req.params.id);
      if (!pipeline) {
        return reply.code(404).send({ error: "Pipeline not found" });
      }
      const stages = stageRepo.getByPipeline(pipeline.id);
      const plans = planRepo.getByPipeline(pipeline.id);
      return {
        data: {
          ...pipeline,
          stages: stages.map((s) => ({
            ...s,
            tasks: taskRepo.getByStage(s.id),
          })),
          plans,
        },
      };
    }
  );

  // Create and start a pipeline
  app.post("/api/pipelines", async (req, reply) => {
    const body = createPipelineSchema.parse(req.body);
    const pipeline = pipelineRepo.create(body);

    broadcaster.broadcastToProject(pipeline.projectId, {
      type: "pipeline:created",
      pipeline: pipeline as Pipeline,
    });

    // Start the pipeline asynchronously
    pipelineEngine.start(pipeline.id).catch((err) => {
      app.log.error({ pipelineId: pipeline.id, error: err.message }, "Pipeline start failed");
    });

    return reply.code(201).send({ data: pipeline });
  });

  // Re-plan a pipeline
  app.post<{ Params: { id: string } }>(
    "/api/pipelines/:id/replan",
    async (req, reply) => {
      const pipeline = pipelineRepo.getById(req.params.id);
      if (!pipeline) {
        return reply.code(404).send({ error: "Pipeline not found" });
      }
      pipelineEngine.replan(pipeline.id).catch((err) => {
        app.log.error({ pipelineId: pipeline.id, error: err.message }, "Replan failed");
      });
      return { data: { message: "Replan initiated" } };
    }
  );

  // Cancel a pipeline
  app.post<{ Params: { id: string } }>(
    "/api/pipelines/:id/cancel",
    async (req, reply) => {
      const pipeline = pipelineRepo.getById(req.params.id);
      if (!pipeline) {
        return reply.code(404).send({ error: "Pipeline not found" });
      }
      await pipelineEngine.cancel(pipeline.id);
      return { data: { message: "Pipeline cancelled" } };
    }
  );

  // Pause a pipeline
  app.post<{ Params: { id: string } }>(
    "/api/pipelines/:id/pause",
    async (req, reply) => {
      const pipeline = pipelineRepo.getById(req.params.id);
      if (!pipeline) {
        return reply.code(404).send({ error: "Pipeline not found" });
      }
      await pipelineEngine.pause(pipeline.id);
      return { data: { message: "Pipeline paused" } };
    }
  );

  // Resume a paused pipeline
  app.post<{ Params: { id: string } }>(
    "/api/pipelines/:id/resume",
    async (req, reply) => {
      const pipeline = pipelineRepo.getById(req.params.id);
      if (!pipeline) {
        return reply.code(404).send({ error: "Pipeline not found" });
      }
      pipelineEngine.resumePaused(pipeline.id).catch((err) => {
        app.log.error({ pipelineId: pipeline.id, error: err.message }, "Resume failed");
      });
      return { data: { message: "Pipeline resume initiated" } };
    }
  );

  // List pending self-repo updates
  app.get("/api/pipelines/pending-self-updates", async () => {
    const all = pipelineRepo.getAll();
    const pending = all.filter(
      (p) => p.selfWorktreePath && !p.selfMerged && ["completed"].includes(p.state)
    );
    return { data: pending };
  });

  // Merge a self-repo pipeline branch into main
  app.post<{ Params: { id: string } }>(
    "/api/pipelines/:id/merge-self",
    async (req, reply) => {
      const pipeline = pipelineRepo.getById(req.params.id);
      if (!pipeline?.selfWorktreePath) {
        return reply.code(400).send({ error: "Not a self-repo pipeline" });
      }

      const project = projectRepo.getById(pipeline.projectId);
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const branchName = `awa-v/self/${pipeline.id.slice(0, 8)}`;

      try {
        execFileSync("git", [
          "merge", "--no-ff", branchName,
          "-m", `update: AWA-V pipeline ${pipeline.id.slice(0, 8)}`
        ], { cwd: project.repoPath, stdio: "pipe" });

        // Clean up worktree directory (keep branch history)
        try {
          worktreeManager.removeWorktree(pipeline.selfWorktreePath);
        } catch (err) {
          log.warn({ error: (err as Error).message }, "Failed to remove self worktree");
        }

        // Mark as merged
        pipelineRepo.update(pipeline.id, { selfMerged: 1 });

        return {
          data: {
            message: "Update applied to main branch.",
            branch: branchName,
          },
        };
      } catch (err) {
        return reply.code(500).send({
          error: `Merge failed: ${(err as Error).message}. Resolve conflicts manually.`,
        });
      }
    }
  );
}
