import type { FastifyInstance } from "fastify";
import { createProjectSchema, updateProjectSchema } from "@awa-v/shared";
import { projectRepo } from "../db/repositories/project-repo.js";
import { isSelfRepo } from "../utils/self-detect.js";

export function registerProjectRoutes(app: FastifyInstance) {
  // List all projects (re-detect isSelfRepo for projects that predate the migration)
  app.get("/api/projects", async () => {
    const projects = projectRepo.getAll();
    for (const project of projects) {
      const shouldBeSelf = isSelfRepo(project.repoPath);
      if (shouldBeSelf && project.isSelfRepo !== 1) {
        projectRepo.update(project.id, {});
        // Direct set since update() doesn't expose isSelfRepo
        const { db, schema } = await import("../db/connection.js");
        const { eq } = await import("drizzle-orm");
        db.update(schema.projects)
          .set({ isSelfRepo: 1 })
          .where(eq(schema.projects.id, project.id))
          .run();
        project.isSelfRepo = 1;
      }
    }
    return { data: projects };
  });

  // Get project by ID
  app.get<{ Params: { id: string } }>(
    "/api/projects/:id",
    async (req, reply) => {
      const project = projectRepo.getById(req.params.id);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }
      return { data: project };
    }
  );

  // Create project
  app.post("/api/projects", async (req, reply) => {
    const body = createProjectSchema.parse(req.body);
    const selfDetected = isSelfRepo(body.repoPath);
    const project = projectRepo.create({ ...body, isSelfRepo: selfDetected });
    return reply.code(201).send({ data: project });
  });

  // Update project
  app.patch<{ Params: { id: string } }>(
    "/api/projects/:id",
    async (req, reply) => {
      const body = updateProjectSchema.parse(req.body);
      const project = projectRepo.update(req.params.id, body);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }
      return { data: project };
    }
  );

  // Delete project
  app.delete<{ Params: { id: string } }>(
    "/api/projects/:id",
    async (req, reply) => {
      projectRepo.delete(req.params.id);
      return reply.code(204).send();
    }
  );
}
