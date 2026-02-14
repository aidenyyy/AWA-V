import { eq, and, desc } from "drizzle-orm";
import { db, schema } from "../connection.js";
import { nanoid } from "nanoid";

// ─── Stages ────────────────────────────────────────────────────

export const stageRepo = {
  getByPipeline(pipelineId: string) {
    return db
      .select()
      .from(schema.stages)
      .where(eq(schema.stages.pipelineId, pipelineId))
      .all();
  },

  getById(id: string) {
    return db
      .select()
      .from(schema.stages)
      .where(eq(schema.stages.id, id))
      .get();
  },

  create(data: { pipelineId: string; type: string; state?: string }) {
    const id = nanoid();

    db.insert(schema.stages)
      .values({
        id,
        pipelineId: data.pipelineId,
        type: data.type,
        state: data.state ?? "pending",
      })
      .run();

    return this.getById(id)!;
  },

  update(
    id: string,
    data: Partial<{
      state: string;
      qualityGateResult: string;
      startedAt: string;
      completedAt: string;
      errorMessage: string;
    }>
  ) {
    db.update(schema.stages)
      .set(data)
      .where(eq(schema.stages.id, id))
      .run();

    return this.getById(id);
  },
};

// ─── Tasks ─────────────────────────────────────────────────────

export const taskRepo = {
  getByStage(stageId: string) {
    return db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.stageId, stageId))
      .all()
      .map(parseTaskJsonFields);
  },

  getByPipeline(pipelineId: string) {
    return db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.pipelineId, pipelineId))
      .all()
      .map(parseTaskJsonFields);
  },

  getById(id: string) {
    const row = db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, id))
      .get();
    return row ? parseTaskJsonFields(row) : undefined;
  },

  create(data: {
    pipelineId: string;
    stageId: string;
    agentRole: string;
    prompt: string;
    state?: string;
    assignedSkills?: string[];
    worktreePath?: string;
    dependsOn?: string[];
  }) {
    const now = new Date().toISOString();
    const id = nanoid();

    db.insert(schema.tasks)
      .values({
        id,
        pipelineId: data.pipelineId,
        stageId: data.stageId,
        agentRole: data.agentRole,
        prompt: data.prompt,
        state: data.state ?? "pending",
        assignedSkills: JSON.stringify(data.assignedSkills ?? []),
        worktreePath: data.worktreePath,
        dependsOn: JSON.stringify(data.dependsOn ?? []),
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
      assignedSkills: string[];
      worktreePath: string;
      dependsOn: string[];
      resultSummary: string;
    }>
  ) {
    const now = new Date().toISOString();

    const setValues: Record<string, unknown> = { updatedAt: now };
    if (data.state !== undefined) setValues.state = data.state;
    if (data.worktreePath !== undefined) setValues.worktreePath = data.worktreePath;
    if (data.resultSummary !== undefined) setValues.resultSummary = data.resultSummary;
    if (data.assignedSkills !== undefined)
      setValues.assignedSkills = JSON.stringify(data.assignedSkills);
    if (data.dependsOn !== undefined)
      setValues.dependsOn = JSON.stringify(data.dependsOn);

    db.update(schema.tasks)
      .set(setValues)
      .where(eq(schema.tasks.id, id))
      .run();

    return this.getById(id);
  },
};

function parseTaskJsonFields<T extends { assignedSkills: string; dependsOn: string }>(
  row: T
): Omit<T, "assignedSkills" | "dependsOn"> & { assignedSkills: string[]; dependsOn: string[] } {
  return {
    ...row,
    assignedSkills: JSON.parse(row.assignedSkills) as string[],
    dependsOn: JSON.parse(row.dependsOn) as string[],
  };
}

// ─── Claude Sessions ──────────────────────────────────────────

export const claudeSessionRepo = {
  getByTask(taskId: string) {
    return db
      .select()
      .from(schema.claudeSessions)
      .where(eq(schema.claudeSessions.taskId, taskId))
      .all();
  },

  getById(id: string) {
    return db
      .select()
      .from(schema.claudeSessions)
      .where(eq(schema.claudeSessions.id, id))
      .get();
  },

  create(data: { taskId: string; model: string; pid?: number }) {
    const now = new Date().toISOString();
    const id = nanoid();

    db.insert(schema.claudeSessions)
      .values({
        id,
        taskId: data.taskId,
        pid: data.pid,
        model: data.model,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        startedAt: now,
        streamEvents: 0,
      })
      .run();

    return this.getById(id)!;
  },

  update(
    id: string,
    data: Partial<{
      pid: number;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
      completedAt: string;
      exitCode: number;
      streamEvents: number;
    }>
  ) {
    db.update(schema.claudeSessions)
      .set(data)
      .where(eq(schema.claudeSessions.id, id))
      .run();

    return this.getById(id);
  },
};

// ─── Plans ─────────────────────────────────────────────────────

export const planRepo = {
  getByPipeline(pipelineId: string) {
    return db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.pipelineId, pipelineId))
      .orderBy(desc(schema.plans.version))
      .all()
      .map(parsePlanJsonFields);
  },

  getLatest(pipelineId: string) {
    const row = db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.pipelineId, pipelineId))
      .orderBy(desc(schema.plans.version))
      .limit(1)
      .get();
    return row ? parsePlanJsonFields(row) : undefined;
  },

  getById(id: string) {
    const row = db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.id, id))
      .get();
    return row ? parsePlanJsonFields(row) : undefined;
  },

  create(data: {
    pipelineId: string;
    version?: number;
    content: string;
    taskBreakdown?: unknown[];
  }) {
    const now = new Date().toISOString();
    const id = nanoid();

    db.insert(schema.plans)
      .values({
        id,
        pipelineId: data.pipelineId,
        version: data.version ?? 1,
        content: data.content,
        taskBreakdown: JSON.stringify(data.taskBreakdown ?? []),
        createdAt: now,
      })
      .run();

    return this.getById(id)!;
  },

  update(
    id: string,
    data: Partial<{
      content: string;
      taskBreakdown: unknown[];
      humanDecision: string;
      humanFeedback: string;
      adversarialFeedback: string;
    }>
  ) {
    const setValues: Record<string, unknown> = {};
    if (data.content !== undefined) setValues.content = data.content;
    if (data.humanDecision !== undefined) setValues.humanDecision = data.humanDecision;
    if (data.humanFeedback !== undefined) setValues.humanFeedback = data.humanFeedback;
    if (data.adversarialFeedback !== undefined)
      setValues.adversarialFeedback = data.adversarialFeedback;
    if (data.taskBreakdown !== undefined)
      setValues.taskBreakdown = JSON.stringify(data.taskBreakdown);

    db.update(schema.plans)
      .set(setValues)
      .where(eq(schema.plans.id, id))
      .run();

    return this.getById(id);
  },
};

function parsePlanJsonFields<T extends { taskBreakdown: string }>(
  row: T
): Omit<T, "taskBreakdown"> & { taskBreakdown: unknown[] } {
  return {
    ...row,
    taskBreakdown: JSON.parse(row.taskBreakdown) as unknown[],
  };
}
