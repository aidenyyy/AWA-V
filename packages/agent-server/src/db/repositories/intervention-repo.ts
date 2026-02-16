import { eq, and } from "drizzle-orm";
import { db, schema } from "../connection.js";
import { nanoid } from "nanoid";

export const interventionRepo = {
  getByPipeline(pipelineId: string) {
    return db
      .select()
      .from(schema.interventions)
      .where(eq(schema.interventions.pipelineId, pipelineId))
      .all();
  },

  getPending(pipelineId: string) {
    return db
      .select()
      .from(schema.interventions)
      .where(
        and(
          eq(schema.interventions.pipelineId, pipelineId),
          eq(schema.interventions.status, "pending")
        )
      )
      .all();
  },

  getPendingForTask(pipelineId: string, taskId: string) {
    return db
      .select()
      .from(schema.interventions)
      .where(
        and(
          eq(schema.interventions.pipelineId, pipelineId),
          eq(schema.interventions.taskId, taskId),
          eq(schema.interventions.status, "pending")
        )
      )
      .all();
  },

  getById(id: string) {
    return db
      .select()
      .from(schema.interventions)
      .where(eq(schema.interventions.id, id))
      .get();
  },

  create(data: {
    pipelineId: string;
    taskId?: string;
    stageType: string;
    question: string;
    context: string;
  }) {
    const now = new Date().toISOString();
    const id = nanoid();

    db.insert(schema.interventions)
      .values({
        id,
        pipelineId: data.pipelineId,
        taskId: data.taskId,
        stageType: data.stageType,
        question: data.question,
        context: data.context,
        status: "pending",
        createdAt: now,
      })
      .run();

    return this.getById(id)!;
  },

  resolve(id: string, response: string) {
    const now = new Date().toISOString();

    db.update(schema.interventions)
      .set({
        status: "resolved",
        response,
        resolvedAt: now,
      })
      .where(eq(schema.interventions.id, id))
      .run();

    return this.getById(id);
  },
};
