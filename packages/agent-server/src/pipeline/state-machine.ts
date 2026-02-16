import {
  PipelineState,
  HumanReviewDecision,
  REPLAN_LIMIT,
} from "@awa-v/shared";

export { REPLAN_LIMIT };

// ─── Outcome types for transitions ──────────────────────────

export type TransitionOutcome =
  | "next"        // default forward progression
  | "approve"     // human approves plan
  | "edit"        // human requests edits
  | "reject"      // human rejects plan
  | "pass"        // quality gate passed
  | "fail"        // quality gate failed / replan
  | "replan"      // explicit replan request
  | "all_done"    // parallel execution complete
  | "cancel"      // cancellation
  | "error";      // unrecoverable error

// ─── FSM transition table ───────────────────────────────────

type StateValue = PipelineState;

const TRANSITIONS: Record<string, Partial<Record<TransitionOutcome, StateValue>>> = {
  [PipelineState.REQUIREMENTS_INPUT]: {
    next: PipelineState.PLAN_GENERATION,
  },
  [PipelineState.PLAN_GENERATION]: {
    next: PipelineState.ADVERSARIAL_REVIEW,
  },
  [PipelineState.HUMAN_REVIEW]: {
    // Deprecated path kept for compatibility with historical rows.
    approve: PipelineState.ADVERSARIAL_REVIEW,
    edit: PipelineState.PLAN_GENERATION,
    reject: PipelineState.CANCELLED,
  },
  [PipelineState.ADVERSARIAL_REVIEW]: {
    pass: PipelineState.CONTEXT_PREP,
    fail: PipelineState.PLAN_GENERATION,
    replan: PipelineState.PLAN_GENERATION,
  },
  [PipelineState.CONTEXT_PREP]: {
    next: PipelineState.PARALLEL_EXECUTION,
  },
  [PipelineState.PARALLEL_EXECUTION]: {
    all_done: PipelineState.TESTING,
    fail: PipelineState.PLAN_GENERATION,
    replan: PipelineState.PLAN_GENERATION,
  },
  [PipelineState.TESTING]: {
    pass: PipelineState.CODE_REVIEW,
    fail: PipelineState.PLAN_GENERATION,
    replan: PipelineState.PLAN_GENERATION,
  },
  [PipelineState.CODE_REVIEW]: {
    pass: PipelineState.GIT_INTEGRATION,
    fail: PipelineState.PLAN_GENERATION,
    replan: PipelineState.PLAN_GENERATION,
  },
  [PipelineState.GIT_INTEGRATION]: {
    next: PipelineState.EVOLUTION_CAPTURE,
  },
  [PipelineState.EVOLUTION_CAPTURE]: {
    next: PipelineState.CLAUDE_MD_EVOLUTION,
  },
  [PipelineState.CLAUDE_MD_EVOLUTION]: {
    next: PipelineState.COMPLETED,
  },
};

// ─── Terminal states ────────────────────────────────────────

const TERMINAL_STATES: ReadonlySet<PipelineState> = new Set([
  PipelineState.COMPLETED,
  PipelineState.FAILED,
  PipelineState.CANCELLED,
]);

// ─── Public API ─────────────────────────────────────────────

/**
 * Determine the next state given a current state and an outcome.
 * Returns undefined if the transition is invalid.
 */
export function getNextState(
  current: PipelineState,
  outcome: TransitionOutcome
): PipelineState | undefined {
  // Any state can transition to cancelled
  if (outcome === "cancel") {
    return PipelineState.CANCELLED;
  }

  // Any state can transition to failed (e.g. replan limit exceeded)
  if (outcome === "error") {
    return PipelineState.FAILED;
  }

  // Don't transition from terminal states
  if (isTerminal(current)) {
    return undefined;
  }

  const stateTransitions = TRANSITIONS[current];
  if (!stateTransitions) {
    return undefined;
  }

  return stateTransitions[outcome];
}

/**
 * Check if a state is terminal (completed, failed, or cancelled).
 */
export function isTerminal(state: PipelineState): boolean {
  return TERMINAL_STATES.has(state);
}

/**
 * Check whether a direct transition from `from` to `to` is valid
 * under any outcome.
 */
export function canTransition(from: PipelineState, to: PipelineState): boolean {
  // Any state can reach cancelled or failed
  if (to === PipelineState.CANCELLED || to === PipelineState.FAILED) {
    return true;
  }

  if (isTerminal(from)) {
    return false;
  }

  const stateTransitions = TRANSITIONS[from];
  if (!stateTransitions) {
    return false;
  }

  return Object.values(stateTransitions).includes(to);
}

/**
 * Map a HumanReviewDecision to a TransitionOutcome.
 */
export function reviewDecisionToOutcome(
  decision: HumanReviewDecision
): TransitionOutcome {
  switch (decision) {
    case HumanReviewDecision.APPROVE:
      return "approve";
    case HumanReviewDecision.EDIT:
      return "edit";
    case HumanReviewDecision.REJECT:
      return "reject";
    default:
      return "reject";
  }
}
