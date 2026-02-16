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
  modelOverrides: string;
  isSelfRepo: number;
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
  tokenBreakdown: TokenBreakdown | string;
  currentModel: string | null;
  selfWorktreePath: string | null;
  selfMerged: number;
  pausedFromState: string | null;
  reentryCount: number;
  errorMessage: string | null;
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
  complexity: ModelTier;
}

// ─── Model Routing ─────────────────────────────────────────

export type ModelTier = "low" | "medium" | "high";

export type ModelId = "haiku" | "sonnet" | "opus";

/** Maps complexity tier to default model */
export const COMPLEXITY_MODEL_MAP: Record<ModelTier, ModelId> = {
  low: "haiku",
  medium: "sonnet",
  high: "opus",
};

/** Default model per pipeline stage */
export const STAGE_MODEL_MAP: Record<string, ModelId> = {
  plan_generation: "sonnet",
  adversarial_review: "sonnet",
  testing: "sonnet",
  code_review: "sonnet",
  evolution_capture: "haiku",
  claude_md_evolution: "haiku",
  merge_resolve: "haiku",
};

/** Per-model token breakdown for cost tracking */
export interface TokenBreakdown {
  haiku: { input: number; output: number };
  sonnet: { input: number; output: number };
  opus: { input: number; output: number };
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
  instructions: string;
  manifestUrl: string;
  sourceKind: "builtin" | "github" | "manual";
  pluginDir: string;
  starred: number; // 0 = not starred, 1 = starred
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

export type EvolutionActionType =
  | "config_change"
  | "model_routing"
  | "skill_suggestion"
  | "prompt_improvement";

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

// ─── Consultation ──────────────────────────────────────────

export type ConsultationStatus = "pending" | "answered" | "expired";

export interface Consultation {
  id: string;
  pipelineId: string;
  taskId: string | null;
  stageType: string;
  question: string;
  context: string; // JSON
  blocking: number; // 0=consult (fire-and-forget), 1=block (parks execution)
  status: ConsultationStatus;
  response: string | null;
  createdAt: string;
  answeredAt: string | null;
}

// ─── Generated Tool ───────────────────────────────────────

export interface GeneratedTool {
  id: string;
  pipelineId: string;
  taskId: string;
  name: string;
  description: string;
  pluginDir: string;
  sourceCode: string;
  createdAt: string;
}

// ─── Churn Metrics ────────────────────────────────────────

export interface ChurnMetrics {
  churnScore: number; // 0-10, higher = more churn
  patchStyleFixes: number;
  duplicatedCode: number;
  temporaryWorkarounds: number;
  missingAbstractions: number;
  verdict: "clean" | "warning" | "critical";
}

// ─── Skill Pack (runtime) ───────────────────────────────────

export interface SkillPack {
  skills: Skill[];
  pluginDirs: string[];
  claudeMdSnippets: string[];
}
