import { eq } from "drizzle-orm";
import { db, schema } from "../connection.js";
import { nanoid } from "nanoid";

export const evolutionRepo = {
  getByProject(projectId: string) {
    return db
      .select()
      .from(schema.evolutionLogs)
      .where(eq(schema.evolutionLogs.projectId, projectId))
      .all();
  },

  getById(id: string) {
    return db
      .select()
      .from(schema.evolutionLogs)
      .where(eq(schema.evolutionLogs.id, id))
      .get();
  },

  create(data: {
    projectId: string;
    triggerPipelineId?: string;
    patternDescription: string;
    actionType: string;
    diff: string;
  }) {
    const now = new Date().toISOString();
    const id = nanoid();

    db.insert(schema.evolutionLogs)
      .values({
        id,
        projectId: data.projectId,
        triggerPipelineId: data.triggerPipelineId,
        patternDescription: data.patternDescription,
        actionType: data.actionType,
        diff: data.diff,
        appliedAt: now,
      })
      .run();

    return this.getById(id)!;
  },

  markRolledBack(id: string) {
    const now = new Date().toISOString();

    db.update(schema.evolutionLogs)
      .set({ rolledBackAt: now })
      .where(eq(schema.evolutionLogs.id, id))
      .run();

    return this.getById(id);
  },
};
