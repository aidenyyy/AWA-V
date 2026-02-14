import type {
  PipelineState,
  StageState,
  TaskState,
  HumanReviewDecision,
} from "../constants/pipeline-states";
import type { SkillType, SkillStatus } from "../constants/skill-tags";

// ─── Project ────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  repoPath: string;
  model: string;
  maxBudgetUsd: number;
  permissionMode: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Pipeline ───────────────────────────────────────────────

export interface Pipeline {
  id: string;
  projectId: string;
  requirements: string;
  state: PipelineState;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  reentryCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Stage ──────────────────────────────────────────────────

export interface Stage {
  id: string;
  pipelineId: string;
  type: PipelineState;
  state: StageState;
  qualityGateResult: string | null;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

// ─── Task ───────────────────────────────────────────────────

export interface Task {
  id: string;
  pipelineId: string;
  stageId: string;
  agentRole: string;
  prompt: string;
  state: TaskState;
  assignedSkills: string[];
  worktreePath: string | null;
  dependsOn: string[];
  resultSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Claude Session ─────────────────────────────────────────

export interface ClaudeSession {
  id: string;
  taskId: string;
  pid: number | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  startedAt: string;
  completedAt: string | null;
  exitCode: number | null;
  streamEvents: number;
}

// ─── Plan ───────────────────────────────────────────────────

export interface Plan {
  id: string;
  pipelineId: string;
  version: number;
  content: string;
  taskBreakdown: PlanTaskBreakdown[];
  humanDecision: HumanReviewDecision | null;
  humanFeedback: string | null;
  adversarialFeedback: string | null;
  createdAt: string;
}

export interface PlanTaskBreakdown {
  title: string;
  description: string;
  agentRole: string;
  domain: string;
  dependsOn: string[];
  canParallelize: boolean;
}

// ─── Skill ──────────────────────────────────────────────────

export interface Skill {
  id: string;
  name: string;
  description: string;
  sourceUrl: string | null;
  tags: string[];
  type: SkillType;
  status: SkillStatus;
  installedAt: string;
}

// ─── Memory ─────────────────────────────────────────────────

export type MemoryLayer = "L1" | "L2" | "L3";
export type MemoryType = "decision" | "discovery" | "error" | "pattern";

export interface Memory {
  id: string;
  projectId: string;
  pipelineId: string | null;
  taskId: string | null;
  layer: MemoryLayer;
  type: MemoryType;
  content: string;
  createdAt: string;
}

// ─── Evolution Log ──────────────────────────────────────────

export type EvolutionActionType = "claude_md_update" | "config_change";

export interface EvolutionLog {
  id: string;
  projectId: string;
  triggerPipelineId: string | null;
  patternDescription: string;
  actionType: EvolutionActionType;
  diff: string;
  appliedAt: string;
  rolledBackAt: string | null;
}

// ─── Intervention ──────────────────────────────────────────

export type InterventionStatus = "pending" | "resolved";

export interface Intervention {
  id: string;
  pipelineId: string;
  stageType: string;
  question: string;
  context: string; // JSON
  status: InterventionStatus;
  response: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

// ─── Skill Pack (runtime) ───────────────────────────────────

export interface SkillPack {
  skills: Skill[];
  pluginDirs: string[];
  claudeMdSnippets: string[];
}
