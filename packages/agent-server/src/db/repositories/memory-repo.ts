import { eq, and } from "drizzle-orm";
import { db, schema } from "../connection.js";
import { nanoid } from "nanoid";

export const memoryRepo = {
  getByProject(projectId: string) {
    return db
      .select()
      .from(schema.memory)
      .where(eq(schema.memory.projectId, projectId))
      .all();
  },

  getByPipeline(pipelineId: string) {
    return db
      .select()
      .from(schema.memory)
      .where(eq(schema.memory.pipelineId, pipelineId))
      .all();
  },

  getByLayer(projectId: string, layer: string) {
    return db
      .select()
      .from(schema.memory)
      .where(
        and(
          eq(schema.memory.projectId, projectId),
          eq(schema.memory.layer, layer)
        )
      )
      .all();
  },

  getById(id: string) {
    return db
      .select()
      .from(schema.memory)
      .where(eq(schema.memory.id, id))
      .get();
  },

  create(data: {
    projectId: string;
    pipelineId?: string;
    taskId?: string;
    layer: string;
    type: string;
    content: string;
  }) {
    const now = new Date().toISOString();
    const id = nanoid();

    db.insert(schema.memory)
      .values({
        id,
        projectId: data.projectId,
        pipelineId: data.pipelineId,
        taskId: data.taskId,
        layer: data.layer,
        type: data.type,
        content: data.content,
        createdAt: now,
      })
      .run();

    return this.getById(id)!;
  },
};
