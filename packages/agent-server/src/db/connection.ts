import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

const DB_PATH = resolve(
  import.meta.dirname,
  "../../../../data/awa-v.db"
);

// Ensure data directory exists
mkdirSync(resolve(DB_PATH, ".."), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };

/** Initialize database tables */
export function initDatabase() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      repo_path TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'sonnet',
      max_budget_usd REAL NOT NULL DEFAULT 10,
      permission_mode TEXT NOT NULL DEFAULT 'default',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pipelines (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      requirements TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'requirements_input',
      total_cost_usd REAL NOT NULL DEFAULT 0,
      total_input_tokens INTEGER NOT NULL DEFAULT 0,
      total_output_tokens INTEGER NOT NULL DEFAULT 0,
      token_breakdown TEXT NOT NULL DEFAULT '{"haiku":{"input":0,"output":0},"sonnet":{"input":0,"output":0},"opus":{"input":0,"output":0}}',
      current_model TEXT,
      reentry_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stages (
      id TEXT PRIMARY KEY,
      pipeline_id TEXT NOT NULL REFERENCES pipelines(id),
      type TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',
      quality_gate_result TEXT,
      started_at TEXT,
      completed_at TEXT,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      pipeline_id TEXT NOT NULL REFERENCES pipelines(id),
      stage_id TEXT NOT NULL REFERENCES stages(id),
      agent_role TEXT NOT NULL,
      prompt TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',
      assigned_skills TEXT NOT NULL DEFAULT '[]',
      worktree_path TEXT,
      depends_on TEXT NOT NULL DEFAULT '[]',
      result_summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS claude_sessions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      pid INTEGER,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      exit_code INTEGER,
      stream_events INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      pipeline_id TEXT NOT NULL REFERENCES pipelines(id),
      version INTEGER NOT NULL DEFAULT 1,
      content TEXT NOT NULL,
      task_breakdown TEXT NOT NULL DEFAULT '[]',
      human_decision TEXT,
      human_feedback TEXT,
      adversarial_feedback TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      source_url TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      type TEXT NOT NULL DEFAULT 'builtin',
      status TEXT NOT NULL DEFAULT 'active',
      installed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      pipeline_id TEXT REFERENCES pipelines(id),
      task_id TEXT REFERENCES tasks(id),
      layer TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS interventions (
      id TEXT PRIMARY KEY,
      pipeline_id TEXT NOT NULL REFERENCES pipelines(id),
      task_id TEXT REFERENCES tasks(id),
      stage_type TEXT NOT NULL,
      question TEXT NOT NULL,
      context TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      response TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS consultations (
      id TEXT PRIMARY KEY,
      pipeline_id TEXT NOT NULL REFERENCES pipelines(id),
      task_id TEXT REFERENCES tasks(id),
      stage_type TEXT NOT NULL,
      question TEXT NOT NULL,
      context TEXT NOT NULL,
      blocking INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      response TEXT,
      created_at TEXT NOT NULL,
      answered_at TEXT
    );

    CREATE TABLE IF NOT EXISTS generated_tools (
      id TEXT PRIMARY KEY,
      pipeline_id TEXT NOT NULL REFERENCES pipelines(id),
      task_id TEXT NOT NULL REFERENCES tasks(id),
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      plugin_dir TEXT NOT NULL,
      source_code TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evolution_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      trigger_pipeline_id TEXT REFERENCES pipelines(id),
      pattern_description TEXT NOT NULL,
      action_type TEXT NOT NULL,
      diff TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      rolled_back_at TEXT
    );

    CREATE TABLE IF NOT EXISTS model_performance (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      task_type TEXT NOT NULL,
      complexity TEXT NOT NULL,
      model TEXT NOT NULL,
      succeeded INTEGER NOT NULL,
      token_count INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skill_marketplaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      last_fetched TEXT,
      skill_count INTEGER NOT NULL DEFAULT 0,
      added_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS starred_plugins (
      plugin_id TEXT PRIMARY KEY,
      starred_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pipelines_project ON pipelines(project_id);
    CREATE INDEX IF NOT EXISTS idx_stages_pipeline ON stages(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_pipeline ON tasks(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_stage ON tasks(stage_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_task ON claude_sessions(task_id);
    CREATE INDEX IF NOT EXISTS idx_plans_pipeline ON plans(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_memory_project ON memory(project_id);
    CREATE INDEX IF NOT EXISTS idx_memory_pipeline ON memory(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_interventions_pipeline ON interventions(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_evolution_project ON evolution_logs(project_id);
    CREATE INDEX IF NOT EXISTS idx_model_perf_project ON model_performance(project_id);
    CREATE INDEX IF NOT EXISTS idx_model_perf_lookup ON model_performance(project_id, task_type, complexity);
    CREATE INDEX IF NOT EXISTS idx_consultations_pipeline ON consultations(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_consultations_task ON consultations(task_id);
    CREATE INDEX IF NOT EXISTS idx_generated_tools_pipeline ON generated_tools(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_generated_tools_task ON generated_tools(task_id);
  `);

  // Migrations: add columns that may not exist in older databases
  const migrations: string[] = [
    `ALTER TABLE pipelines ADD COLUMN token_breakdown TEXT NOT NULL DEFAULT '{"haiku":{"input":0,"output":0},"sonnet":{"input":0,"output":0},"opus":{"input":0,"output":0}}'`,
    `ALTER TABLE pipelines ADD COLUMN current_model TEXT`,
    `ALTER TABLE projects ADD COLUMN model_overrides TEXT NOT NULL DEFAULT '{}'`,
    `ALTER TABLE skills ADD COLUMN instructions TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE skills ADD COLUMN manifest_url TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE skills ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'manual'`,
    `ALTER TABLE skills ADD COLUMN plugin_dir TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE projects ADD COLUMN is_self_repo INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE pipelines ADD COLUMN self_worktree_path TEXT`,
    `ALTER TABLE pipelines ADD COLUMN self_merged INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE pipelines ADD COLUMN paused_from_state TEXT`,
    `ALTER TABLE skills ADD COLUMN starred INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE interventions ADD COLUMN task_id TEXT REFERENCES tasks(id)`,
  ];

  for (const sql of migrations) {
    try {
      sqlite.exec(sql);
    } catch (err) {
      // "duplicate column name" means it already exists — ignore
      if (!(err instanceof Error && err.message.includes("duplicate column"))) {
        throw err;
      }
    }
  }
}
