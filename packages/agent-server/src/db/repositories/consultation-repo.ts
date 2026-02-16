import { eq, and } from "drizzle-orm";
import { db, schema } from "../connection.js";
import { nanoid } from "nanoid";

export const consultationRepo = {
  getByPipeline(pipelineId: string) {
    return db
      .select()
      .from(schema.consultations)
      .where(eq(schema.consultations.pipelineId, pipelineId))
      .all();
  },

  getPending(pipelineId: string) {
    return db
      .select()
      .from(schema.consultations)
      .where(
        and(
          eq(schema.consultations.pipelineId, pipelineId),
          eq(schema.consultations.status, "pending")
        )
      )
      .all();
  },

  getById(id: string) {
    return db
      .select()
      .from(schema.consultations)
      .where(eq(schema.consultations.id, id))
      .get();
  },

  create(data: {
    pipelineId: string;
    taskId?: string;
    stageType: string;
    question: string;
    context: string;
    blocking: number;
  }) {
    const now = new Date().toISOString();
    const id = nanoid();

    db.insert(schema.consultations)
      .values({
        id,
        pipelineId: data.pipelineId,
        taskId: data.taskId,
        stageType: data.stageType,
        question: data.question,
        context: data.context,
        blocking: data.blocking,
        status: "pending",
        createdAt: now,
      })
      .run();

    return this.getById(id)!;
  },

  answer(id: string, response: string) {
    const now = new Date().toISOString();

    db.update(schema.consultations)
      .set({
        status: "answered",
        response,
        answeredAt: now,
      })
      .where(eq(schema.consultations.id, id))
      .run();

    return this.getById(id);
  },

  expireForPipeline(pipelineId: string) {
    db.update(schema.consultations)
      .set({ status: "expired" })
      .where(
        and(
          eq(schema.consultations.pipelineId, pipelineId),
          eq(schema.consultations.status, "pending")
        )
      )
      .run();
  },
};
