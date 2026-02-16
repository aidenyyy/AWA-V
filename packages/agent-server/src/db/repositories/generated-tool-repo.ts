import { eq } from "drizzle-orm";
import { db, schema } from "../connection.js";
import { nanoid } from "nanoid";

export const generatedToolRepo = {
  getByPipeline(pipelineId: string) {
    return db
      .select()
      .from(schema.generatedTools)
      .where(eq(schema.generatedTools.pipelineId, pipelineId))
      .all();
  },

  getByTask(taskId: string) {
    return db
      .select()
      .from(schema.generatedTools)
      .where(eq(schema.generatedTools.taskId, taskId))
      .all();
  },

  getById(id: string) {
    return db
      .select()
      .from(schema.generatedTools)
      .where(eq(schema.generatedTools.id, id))
      .get();
  },

  create(data: {
    pipelineId: string;
    taskId: string;
    name: string;
    description: string;
    pluginDir: string;
    sourceCode: string;
  }) {
    const now = new Date().toISOString();
    const id = nanoid();

    db.insert(schema.generatedTools)
      .values({
        id,
        pipelineId: data.pipelineId,
        taskId: data.taskId,
        name: data.name,
        description: data.description,
        pluginDir: data.pluginDir,
        sourceCode: data.sourceCode,
        createdAt: now,
      })
      .run();

    return this.getById(id)!;
  },

  deleteByPipeline(pipelineId: string) {
    db.delete(schema.generatedTools)
      .where(eq(schema.generatedTools.pipelineId, pipelineId))
      .run();
  },
};
