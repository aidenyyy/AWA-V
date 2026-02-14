import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ─── Projects ───────────────────────────────────────────────

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  repoPath: text("repo_path").notNull(),
  model: text("model").notNull().default("sonnet"),
  maxBudgetUsd: real("max_budget_usd").notNull().default(10),
  permissionMode: text("permission_mode").notNull().default("default"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── Pipelines ──────────────────────────────────────────────

export const pipelines = sqliteTable("pipelines", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  requirements: text("requirements").notNull(),
  state: text("state").notNull().default("requirements_input"),
  totalCostUsd: real("total_cost_usd").notNull().default(0),
  totalInputTokens: integer("total_input_tokens").notNull().default(0),
  totalOutputTokens: integer("total_output_tokens").notNull().default(0),
  reentryCount: integer("reentry_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── Stages ─────────────────────────────────────────────────

export const stages = sqliteTable("stages", {
  id: text("id").primaryKey(),
  pipelineId: text("pipeline_id")
    .notNull()
    .references(() => pipelines.id),
  type: text("type").notNull(),
  state: text("state").notNull().default("pending"),
  qualityGateResult: text("quality_gate_result"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  errorMessage: text("error_message"),
});

// ─── Tasks ──────────────────────────────────────────────────

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  pipelineId: text("pipeline_id")
    .notNull()
    .references(() => pipelines.id),
  stageId: text("stage_id")
    .notNull()
    .references(() => stages.id),
  agentRole: text("agent_role").notNull(),
  prompt: text("prompt").notNull(),
  state: text("state").notNull().default("pending"),
  assignedSkills: text("assigned_skills").notNull().default("[]"), // JSON array
  worktreePath: text("worktree_path"),
  dependsOn: text("depends_on").notNull().default("[]"), // JSON array
  resultSummary: text("result_summary"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── Claude Sessions ───────────────────────────────────────

export const claudeSessions = sqliteTable("claude_sessions", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id),
  pid: integer("pid"),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  exitCode: integer("exit_code"),
  streamEvents: integer("stream_events").notNull().default(0),
});

// ─── Plans ──────────────────────────────────────────────────

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  pipelineId: text("pipeline_id")
    .notNull()
    .references(() => pipelines.id),
  version: integer("version").notNull().default(1),
  content: text("content").notNull(),
  taskBreakdown: text("task_breakdown").notNull().default("[]"), // JSON
  humanDecision: text("human_decision"),
  humanFeedback: text("human_feedback"),
  adversarialFeedback: text("adversarial_feedback"),
  createdAt: text("created_at").notNull(),
});

// ─── Skills ─────────────────────────────────────────────────

export const skills = sqliteTable("skills", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  sourceUrl: text("source_url"),
  tags: text("tags").notNull().default("[]"), // JSON array
  type: text("type").notNull().default("builtin"),
  status: text("status").notNull().default("active"),
  installedAt: text("installed_at").notNull(),
});

// ─── Memory ─────────────────────────────────────────────────

export const memory = sqliteTable("memory", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  pipelineId: text("pipeline_id").references(() => pipelines.id),
  taskId: text("task_id").references(() => tasks.id),
  layer: text("layer").notNull(), // L1 | L2 | L3
  type: text("type").notNull(), // decision | discovery | error | pattern
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});

// ─── Interventions ─────────────────────────────────────────

export const interventions = sqliteTable("interventions", {
  id: text("id").primaryKey(),
  pipelineId: text("pipeline_id")
    .notNull()
    .references(() => pipelines.id),
  stageType: text("stage_type").notNull(),
  question: text("question").notNull(),
  context: text("context").notNull(), // JSON
  status: text("status").notNull().default("pending"), // pending | resolved
  response: text("response"),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
});

// ─── Evolution Logs ─────────────────────────────────────────

export const evolutionLogs = sqliteTable("evolution_logs", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  triggerPipelineId: text("trigger_pipeline_id").references(
    () => pipelines.id
  ),
  patternDescription: text("pattern_description").notNull(),
  actionType: text("action_type").notNull(),
  diff: text("diff").notNull(),
  appliedAt: text("applied_at").notNull(),
  rolledBackAt: text("rolled_back_at"),
});
