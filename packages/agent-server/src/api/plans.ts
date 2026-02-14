import type { FastifyInstance } from "fastify";
import { planReviewSchema, type HumanReviewDecision } from "@awa-v/shared";
import { planRepo } from "../db/repositories/task-repo.js";
import { pipelineEngine } from "../pipeline/engine.js";

export function registerPlanRoutes(app: FastifyInstance) {
  // Get plans for a pipeline
  app.get<{ Querystring: { pipelineId: string } }>(
    "/api/plans",
    async (req) => {
      const plans = planRepo.getByPipeline(req.query.pipelineId);
      return { data: plans };
    }
  );

  // Get latest plan
  app.get<{ Params: { pipelineId: string } }>(
    "/api/pipelines/:pipelineId/plan/latest",
    async (req, reply) => {
      const plan = planRepo.getLatest(req.params.pipelineId);
      if (!plan) {
        return reply.code(404).send({ error: "No plan found" });
      }
      return { data: plan };
    }
  );

  // Submit plan review
  app.post<{ Params: { planId: string } }>(
    "/api/plans/:planId/review",
    async (req, reply) => {
      const body = planReviewSchema.parse(req.body);
      const plan = planRepo.update(req.params.planId, {
        humanDecision: body.decision,
        humanFeedback: body.feedback,
      });
      if (!plan) {
        return reply.code(404).send({ error: "Plan not found" });
      }

      // Continue pipeline based on decision
      pipelineEngine
        .handlePlanReview(plan.pipelineId, body.decision as HumanReviewDecision, body.feedback)
        .catch((err) => {
          app.log.error(
            { planId: req.params.planId, error: err.message },
            "Plan review handling failed"
          );
        });

      return { data: plan };
    }
  );
}
