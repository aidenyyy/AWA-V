export const DEFAULTS = {
  MODEL: "sonnet",
  MAX_BUDGET_USD: 10,
  PERMISSION_MODE: "default",
  REPLAN_LIMIT: 3,
  AGENT_SERVER_PORT: 2078,
  WEB_PORT: 2077,
  EVOLUTION_TRIGGER_INTERVAL: 5, // pipelines between evolution analysis
  MAX_CONCURRENT_TASKS: 4,
  TASK_TIMEOUT_MS: 10 * 60 * 1000, // 10 minutes
  SELF_HEAL_RETRY_LIMIT: 2,
  MODEL_ROUTER_MIN_SAMPLES: 5, // minimum executions before data-driven routing
  MODEL_UPGRADE_THRESHOLD: 0.7, // success rate below this triggers upgrade
  MODEL_KEEP_THRESHOLD: 0.9, // success rate above this keeps current model
} as const;
