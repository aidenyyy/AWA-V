import type { FastifyInstance } from "fastify";
import { interventionRepo } from "../db/repositories/intervention-repo.js";
import { interventionManager } from "../services/intervention-manager.js";

export function registerInterventionRoutes(app: FastifyInstance) {
  // List interventions for a pipeline (optionally filter by status)
  app.get<{ Querystring: { pipelineId: string; status?: string } }>(
    "/api/interventions",
    async (req) => {
      if (req.query.status === "pending") {
        return { data: interventionRepo.getPending(req.query.pipelineId) };
      }
      return { data: interventionRepo.getByPipeline(req.query.pipelineId) };
    }
  );

  // Get a single intervention by ID
  app.get<{ Params: { id: string } }>(
    "/api/interventions/:id",
    async (req, reply) => {
      const intervention = interventionRepo.getById(req.params.id);
      if (!intervention) {
        return reply.status(404).send({ error: "Intervention not found" });
      }
      return { data: intervention };
    }
  );

  // Respond to an intervention
  app.post<{ Params: { id: string }; Body: { response: string } }>(
    "/api/interventions/:id/respond",
    async (req, reply) => {
      const intervention = interventionRepo.getById(req.params.id);
      if (!intervention) {
        return reply.status(404).send({ error: "Intervention not found" });
      }
      if (intervention.status === "resolved") {
        return reply.status(400).send({ error: "Intervention already resolved" });
      }

      interventionManager.resolveIntervention(req.params.id, req.body.response);

      return { data: interventionRepo.getById(req.params.id) };
    }
  );
}
