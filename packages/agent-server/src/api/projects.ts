import type { FastifyInstance } from "fastify";
import { createProjectSchema, updateProjectSchema } from "@awa-v/shared";
import { projectRepo } from "../db/repositories/project-repo.js";

export function registerProjectRoutes(app: FastifyInstance) {
  // List all projects
  app.get("/api/projects", async () => {
    const projects = projectRepo.getAll();
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
    const project = projectRepo.create(body);
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
