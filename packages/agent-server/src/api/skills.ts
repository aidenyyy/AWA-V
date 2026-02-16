import type { FastifyInstance } from "fastify";
import { importSkillSchema, approveSkillSchema, skillManifestSchema } from "@awa-v/shared";
import { skillRepo } from "../db/repositories/skill-repo.js";
import { importFromGithub } from "../services/skill-importer.js";

export function registerSkillRoutes(app: FastifyInstance) {
  // List all skills
  app.get("/api/skills", async () => {
    const skills = skillRepo.getAll();
    return { data: skills };
  });

  // Get skills by type or tags
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

  // Import a skill by URL (legacy)
  app.post("/api/skills/import", async (req, reply) => {
    const body = importSkillSchema.parse(req.body);

    // If githubUrl is provided, use the GitHub importer
    if (body.githubUrl) {
      const skill = await importFromGithub(body.githubUrl);
      return reply.code(201).send({ data: skill });
    }

    const skill = skillRepo.create({
      name: body.name ?? "Imported Skill",
      description: body.description ?? "",
      sourceUrl: body.sourceUrl,
      tags: body.tags ?? [],
      instructions: body.instructions ?? "",
      type: "manual",
      sourceKind: "manual",
      status: "active",
    });
    return reply.code(201).send({ data: skill });
  });

  // Import from GitHub
  app.post<{ Body: { githubUrl: string } }>(
    "/api/skills/import-github",
    async (req, reply) => {
      const { githubUrl } = req.body;
      if (!githubUrl) {
        return reply.code(400).send({ error: "githubUrl is required" });
      }
      try {
        const skill = await importFromGithub(githubUrl);
        return reply.code(201).send({ data: skill });
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    }
  );

  // Import from file (drag-and-drop)
  app.post("/api/skills/import-file", async (req, reply) => {
    try {
      const manifest = skillManifestSchema.parse(req.body);

      const existing = skillRepo.getByName(manifest.name);
      if (existing) {
        return reply.code(400).send({
          error: `Skill "${manifest.name}" already exists (id: ${existing.id})`,
        });
      }

      const skill = skillRepo.create({
        name: manifest.name,
        description: manifest.description,
        tags: manifest.tags,
        instructions: manifest.instructions,
        sourceUrl: "file://",
        sourceKind: "manual",
        type: "manual",
        status: "active",
        pluginDir: manifest.pluginDir ?? "",
      });

      return reply.code(201).send({ data: skill });
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // Toggle skill starred state
  app.patch<{ Params: { id: string } }>(
    "/api/skills/:id/star",
    async (req, reply) => {
      const skill = skillRepo.getById(req.params.id);
      if (!skill) {
        return reply.code(404).send({ error: "Skill not found" });
      }
      const updated = skillRepo.update(req.params.id, {
        starred: skill.starred ? 0 : 1,
      });
      return { data: updated };
    }
  );

  // Toggle skill status (active <-> inactive)
  app.patch<{ Params: { id: string } }>(
    "/api/skills/:id/toggle",
    async (req, reply) => {
      const skill = skillRepo.getById(req.params.id);
      if (!skill) {
        return reply.code(404).send({ error: "Skill not found" });
      }
      const newStatus = skill.status === "active" ? "inactive" : "active";
      const updated = skillRepo.update(req.params.id, { status: newStatus });
      return { data: updated };
    }
  );

  // Update a skill
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/api/skills/:id",
    async (req, reply) => {
      const skill = skillRepo.getById(req.params.id);
      if (!skill) {
        return reply.code(404).send({ error: "Skill not found" });
      }
      const body = req.body as Partial<{
        name: string;
        description: string;
        tags: string[];
        instructions: string;
        status: string;
        pluginDir: string;
      }>;
      const updated = skillRepo.update(req.params.id, body);
      return { data: updated };
    }
  );

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
      const skill = skillRepo.getById(req.params.id);
      if (skill && skill.sourceKind === "builtin") {
        return reply.code(400).send({ error: "Cannot delete built-in skills" });
      }
      skillRepo.delete(req.params.id);
      return reply.code(200).send({ data: { success: true } });
    }
  );
}
