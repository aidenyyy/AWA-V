import type { FastifyInstance } from "fastify";
import { claudeSessionRepo } from "../db/repositories/task-repo.js";
import { processManager } from "../claude/process-manager.js";

export function registerSessionRoutes(app: FastifyInstance) {
  // Get sessions for a task
  app.get<{ Querystring: { taskId: string } }>(
    "/api/sessions",
    async (req) => {
      const sessions = claudeSessionRepo.getByTask(req.query.taskId);
      return { data: sessions };
    }
  );

  // Get active Claude processes
  app.get("/api/sessions/active", async () => {
    const active = processManager.getAll().map((p) => ({
      id: p.id,
      pid: p.pid,
      stats: p.tracker.getStats(),
    }));
    return { data: active };
  });

  // Kill a Claude process
  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/kill",
    async (req, reply) => {
      const killed = processManager.kill(req.params.id);
      if (!killed) {
        return reply
          .code(404)
          .send({ error: "Session not found or already completed" });
      }
      return { data: { message: "Session killed" } };
    }
  );
}
