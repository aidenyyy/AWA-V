export const PipelineState = {
  REQUIREMENTS_INPUT: "requirements_input",
  PLAN_GENERATION: "plan_generation",
  HUMAN_REVIEW: "human_review",
  ADVERSARIAL_REVIEW: "adversarial_review",
  SKILL_DISTRIBUTION: "skill_distribution",
  MEMORY_INJECTION: "memory_injection",
  PARALLEL_EXECUTION: "parallel_execution",
  TESTING: "testing",
  CODE_REVIEW: "code_review",
  GIT_INTEGRATION: "git_integration",
  EVOLUTION_CAPTURE: "evolution_capture",
  CLAUDE_MD_EVOLUTION: "claude_md_evolution",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export type PipelineState =
  (typeof PipelineState)[keyof typeof PipelineState];

export const StageState = {
  PENDING: "pending",
  RUNNING: "running",
  PASSED: "passed",
  FAILED: "failed",
  SKIPPED: "skipped",
} as const;

export type StageState = (typeof StageState)[keyof typeof StageState];

export const TaskState = {
  PENDING: "pending",
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export type TaskState = (typeof TaskState)[keyof typeof TaskState];

export const HumanReviewDecision = {
  APPROVE: "approve",
  EDIT: "edit",
  REJECT: "reject",
} as const;

export type HumanReviewDecision =
  (typeof HumanReviewDecision)[keyof typeof HumanReviewDecision];

export const REPLAN_LIMIT = 3;

/** Ordered list of pipeline stages for the FSM */
export const PIPELINE_STAGE_ORDER = [
  PipelineState.REQUIREMENTS_INPUT,
  PipelineState.PLAN_GENERATION,
  PipelineState.HUMAN_REVIEW,
  PipelineState.ADVERSARIAL_REVIEW,
  PipelineState.SKILL_DISTRIBUTION,
  PipelineState.MEMORY_INJECTION,
  PipelineState.PARALLEL_EXECUTION,
  PipelineState.TESTING,
  PipelineState.CODE_REVIEW,
  PipelineState.GIT_INTEGRATION,
  PipelineState.EVOLUTION_CAPTURE,
  PipelineState.CLAUDE_MD_EVOLUTION,
  PipelineState.COMPLETED,
] as const;
