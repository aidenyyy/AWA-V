import type { FastifyInstance } from "fastify";
import { importSkillSchema, approveSkillSchema } from "@awa-v/shared";
import { skillRepo } from "../db/repositories/skill-repo.js";

export function registerSkillRoutes(app: FastifyInstance) {
  // List all skills
  app.get("/api/skills", async () => {
    const skills = skillRepo.getAll();
    return { data: skills };
  });

  // Get skills by type
  app.get<{ Querystring: { type?: string; tags?: string } }>(
    "/api/skills/filter",
    async (req) => {
      if (req.query.tags) {
        const tags = req.query.tags.split(",");
        const skills = skillRepo.getByTags(tags);
        return { data: skills };
      }
      if (req.query.type) {
        const skills = skillRepo.getByType(req.query.type);
        return { data: skills };
      }
      return { data: skillRepo.getAll() };
    }
  );

  // Import a skill by URL
  app.post("/api/skills/import", async (req, reply) => {
    const body = importSkillSchema.parse(req.body);
    const skill = skillRepo.create({
      name: body.name ?? "Imported Skill",
      description: body.description ?? "",
      sourceUrl: body.sourceUrl,
      tags: body.tags ?? [],
      type: "manual",
      status: "active",
    });
    return reply.code(201).send({ data: skill });
  });

  // Approve a pending skill
  app.post("/api/skills/approve", async (req, reply) => {
    const body = approveSkillSchema.parse(req.body);
    const skill = skillRepo.update(body.skillId, { status: "active" });
    if (!skill) {
      return reply.code(404).send({ error: "Skill not found" });
    }
    return { data: skill };
  });

  // Delete a skill
  app.delete<{ Params: { id: string } }>(
    "/api/skills/:id",
    async (req, reply) => {
      skillRepo.delete(req.params.id);
      return reply.code(204).send();
    }
  );
}
