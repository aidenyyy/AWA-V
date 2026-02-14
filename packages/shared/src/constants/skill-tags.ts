export const SkillType = {
  BUILTIN: "builtin",
  MANUAL: "manual",
  MARKETPLACE: "marketplace",
} as const;

export type SkillType = (typeof SkillType)[keyof typeof SkillType];

export const SkillStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  PENDING_APPROVAL: "pending_approval",
} as const;

export type SkillStatus = (typeof SkillStatus)[keyof typeof SkillStatus];

export const TaskDomain = {
  FRONTEND: "frontend",
  BACKEND: "backend",
  DATABASE: "database",
  API: "api",
  INFRA: "infra",
  GENERAL: "general",
} as const;

export type TaskDomain = (typeof TaskDomain)[keyof typeof TaskDomain];

export const TaskType = {
  IMPLEMENT: "implement",
  TEST: "test",
  REVIEW: "review",
  FIX: "fix",
  REFACTOR: "refactor",
  PLAN: "plan",
} as const;

export type TaskType = (typeof TaskType)[keyof typeof TaskType];
