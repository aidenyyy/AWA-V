import type { FastifyInstance } from "fastify";
import { createPipelineSchema } from "@awa-v/shared";
import { pipelineRepo } from "../db/repositories/pipeline-repo.js";
import { stageRepo, taskRepo, planRepo } from "../db/repositories/task-repo.js";
import { pipelineEngine } from "../pipeline/engine.js";

export function registerPipelineRoutes(app: FastifyInstance) {
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
      pipelineEngine.cancel(pipeline.id);
      return { data: { message: "Pipeline cancelled" } };
    }
  );
}
