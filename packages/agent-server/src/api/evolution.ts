import type { FastifyInstance } from "fastify";
import { evolutionRepo } from "../db/repositories/evolution-repo.js";
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
