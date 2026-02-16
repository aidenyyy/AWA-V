import type { FastifyInstance } from "fastify";
import { consultationRepo } from "../db/repositories/consultation-repo.js";
import { consultationManager } from "../services/consultation-manager.js";

export function registerConsultationRoutes(app: FastifyInstance) {
  // List consultations for a pipeline (optionally filter by status)
  app.get<{ Querystring: { pipelineId: string; status?: string } }>(
    "/api/consultations",
    async (req) => {
      if (req.query.status === "pending") {
        return { data: consultationRepo.getPending(req.query.pipelineId) };
      }
      return { data: consultationRepo.getByPipeline(req.query.pipelineId) };
    }
  );

  // Get a single consultation by ID
  app.get<{ Params: { id: string } }>(
    "/api/consultations/:id",
    async (req, reply) => {
      const consultation = consultationRepo.getById(req.params.id);
      if (!consultation) {
        return reply.status(404).send({ error: "Consultation not found" });
      }
      return { data: consultation };
    }
  );

  // Answer a consultation
  app.post<{ Params: { id: string }; Body: { response: string } }>(
    "/api/consultations/:id/answer",
    async (req, reply) => {
      const consultation = consultationRepo.getById(req.params.id);
      if (!consultation) {
        return reply.status(404).send({ error: "Consultation not found" });
      }
      if (consultation.status !== "pending") {
        return reply
          .status(400)
          .send({ error: `Consultation already ${consultation.status}` });
      }

      consultationManager.answerConsultation(req.params.id, req.body.response);

      return { data: consultationRepo.getById(req.params.id) };
    }
  );
}
