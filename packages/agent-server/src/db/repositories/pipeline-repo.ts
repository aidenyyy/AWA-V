import { eq } from "drizzle-orm";
import { db, schema } from "../connection.js";
import { nanoid } from "nanoid";

export const pipelineRepo = {
  getByProject(projectId: string) {
    return db
      .select()
      .from(schema.pipelines)
      .where(eq(schema.pipelines.projectId, projectId))
      .all();
  },

  getById(id: string) {
    return db
      .select()
      .from(schema.pipelines)
      .where(eq(schema.pipelines.id, id))
      .get();
  },

  create(data: { projectId: string; requirements: string; state?: string }) {
    const now = new Date().toISOString();
    const id = nanoid();

    db.insert(schema.pipelines)
      .values({
        id,
        projectId: data.projectId,
        requirements: data.requirements,
        state: data.state ?? "requirements_input",
        totalCostUsd: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        reentryCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return this.getById(id)!;
  },

  update(
    id: string,
    data: Partial<{
      state: string;
      totalCostUsd: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      reentryCount: number;
    }>
  ) {
    const now = new Date().toISOString();

    db.update(schema.pipelines)
      .set({ ...data, updatedAt: now })
      .where(eq(schema.pipelines.id, id))
      .run();

    return this.getById(id);
  },
};
