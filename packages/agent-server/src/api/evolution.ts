import type { FastifyInstance } from "fastify";
import { evolutionRepo } from "../db/repositories/evolution-repo.js";
import { projectRepo } from "../db/repositories/project-repo.js";
import { memoryRepo } from "../db/repositories/memory-repo.js";

export function registerEvolutionRoutes(app: FastifyInstance) {
  // Get evolution logs for a project
  app.get<{ Querystring: { projectId: string } }>(
    "/api/evolution",
    async (req) => {
      const logs = evolutionRepo.getByProject(req.query.projectId);
      return { data: logs };
    }
  );

  // Rollback an evolution change
  app.post<{ Params: { id: string } }>(
    "/api/evolution/:id/rollback",
    async (req, reply) => {
      const log = evolutionRepo.getById(req.params.id);
      if (!log) return reply.code(404).send({ error: "Not found" });
      if (log.rolledBackAt) return reply.code(400).send({ error: "Already rolled back" });

      if (log.actionType === "config_change") {
        try {
          const diffData = JSON.parse(log.diff);
          if (diffData.applied && diffData.previousValues) {
            projectRepo.update(log.projectId, diffData.previousValues);
          }
        } catch {
          return reply.code(400).send({ error: "Could not parse rollback data" });
        }
      } else if (log.actionType === "model_routing") {
        try {
          const diffData = JSON.parse(log.diff);
          if (diffData.applied && diffData.previousValues) {
            const previousOverrides = typeof diffData.previousValues === "string"
              ? diffData.previousValues
              : JSON.stringify(diffData.previousValues);
            projectRepo.update(log.projectId, { modelOverrides: previousOverrides });
          }
        } catch {
          return reply.code(400).send({ error: "Could not parse rollback data" });
        }
      }

      evolutionRepo.markRolledBack(log.id);
      return { data: evolutionRepo.getById(log.id) };
    }
  );

  // Get memory entries for a project
  app.get<{ Querystring: { projectId: string; layer?: string } }>(
    "/api/memory",
    async (req) => {
      if (req.query.layer) {
        const entries = memoryRepo.getByLayer(
          req.query.projectId,
          req.query.layer as "L1" | "L2" | "L3"
        );
        return { data: entries };
      }
      const entries = memoryRepo.getByProject(req.query.projectId);
      return { data: entries };
    }
  );

  // Get memory stats
  app.get<{ Querystring: { projectId: string } }>(
    "/api/memory/stats",
    async (req) => {
      const all = memoryRepo.getByProject(req.query.projectId);
      const stats = {
        l1Count: all.filter((m) => m.layer === "L1").length,
        l2Count: all.filter((m) => m.layer === "L2").length,
        l3Count: all.filter((m) => m.layer === "L3").length,
      };
      return { data: stats };
    }
  );
}
