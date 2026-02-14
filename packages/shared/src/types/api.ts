import type {
  Project,
  Pipeline,
  Plan,
  Skill,
  Memory,
  EvolutionLog,
  Task,
  ClaudeSession,
} from "./models";
import type { HumanReviewDecision } from "../constants/pipeline-states";

// ─── Projects ───────────────────────────────────────────────

export interface CreateProjectRequest {
  name: string;
  repoPath: string;
  model?: string;
  maxBudgetUsd?: number;
  permissionMode?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  model?: string;
  maxBudgetUsd?: number;
  permissionMode?: string;
}

// ─── Pipelines ──────────────────────────────────────────────

export interface CreatePipelineRequest {
  projectId: string;
  requirements: string;
}

// ─── Plans ──────────────────────────────────────────────────

export interface PlanReviewRequest {
  decision: HumanReviewDecision;
  feedback?: string;
}

// ─── Skills ─────────────────────────────────────────────────

export interface ImportSkillRequest {
  sourceUrl: string;
  name?: string;
  description?: string;
  tags?: string[];
}

export interface ApproveSkillRequest {
  skillId: string;
}

// ─── API Responses ──────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

export interface PipelineDetail extends Pipeline {
  stages: (import("./models.js").Stage & { tasks: Task[] })[];
  plans: Plan[];
  sessions: ClaudeSession[];
}

export interface ProjectDetail extends Project {
  pipelines: Pipeline[];
  totalCostUsd: number;
  activePipelines: number;
}

export interface EvolutionSummary {
  logs: EvolutionLog[];
  memoryStats: {
    l1Count: number;
    l2Count: number;
    l3Count: number;
  };
}
