import {
  PipelineState,
  StageState,
  TaskState,
  DEFAULTS,
} from "@awa-v/shared";
import type { PlanTaskBreakdown, StreamChunk, ModelTier, ModelId } from "@awa-v/shared";
import { COMPLEXITY_MODEL_MAP, STAGE_MODEL_MAP } from "@awa-v/shared";
import { modelRouter } from "../services/model-router.js";
import {
  stageRepo,
  taskRepo,
  planRepo,
  claudeSessionRepo,
} from "../db/repositories/task-repo.js";
import { pipelineRepo } from "../db/repositories/pipeline-repo.js";
import { projectRepo } from "../db/repositories/project-repo.js";
import { processManager } from "../claude/process-manager.js";
import { buildPrompt } from "../claude/prompt-builder.js";
import { broadcaster } from "../ws/broadcaster.js";
import { memoryService } from "../services/memory-service.js";
import { skillDistributor } from "../services/skill-distributor.js";
import { evolutionEngine } from "../services/evolution-engine.js";
import { commitManager } from "../git/commit-manager.js";
import { branchManager } from "../git/branch-manager.js";
import { worktreeManager } from "../git/worktree-manager.js";
import { mergeManager } from "../git/merge-manager.js";
import { interventionManager } from "../services/intervention-manager.js";
import { consultationManager } from "../services/consultation-manager.js";
import { toolForge } from "../services/tool-forge.js";
import { runPreflightChecks } from "../services/preflight-checks.js";
import { runFastGate } from "../services/fast-gate.js";
import { runPostMergeSmoke } from "../services/post-merge-smoke.js";
import { PLANNER_PROMPT } from "../prompts/planner.js";
import { EXECUTOR_PROMPT } from "../prompts/executor.js";
import { ADVERSARIAL_REVIEWER_PROMPT } from "../prompts/adversarial-reviewer.js";
import { TESTER_PROMPT } from "../prompts/tester.js";
import { CODE_REVIEWER_PROMPT } from "../prompts/code-reviewer.js";
import pino from "pino";

const log = pino({ name: "stage-runner" });

// ─── Model Routing ─────────────────────────────────────────

/** Resolve the model to use for a given stage, with optional task-level complexity override */
function resolveModel(
  stageType: string,
  projectModel: string,
  complexity?: ModelTier,
  projectId?: string,
  agentRole?: string
): string {
  // Task-level complexity — use evolution-driven routing if project context is available
  if (complexity && projectId && agentRole) {
    return evolutionEngine.selectModel(projectId, stageType, agentRole, complexity);
  }
  // Task-level complexity without history data — use default mapping
  if (complexity) {
    return COMPLEXITY_MODEL_MAP[complexity];
  }
  // Stage-level default, falls back to project model
  return STAGE_MODEL_MAP[stageType] ?? projectModel;
}

// ─── Self-Repo Helper ───────────────────────────────────────

/** For self-repo pipelines, use the staging worktree. Otherwise project.repoPath. */
function getEffectiveRepoPath(
  project: { repoPath: string },
  pipeline: { selfWorktreePath?: string | null }
): string {
  return pipeline.selfWorktreePath ?? project.repoPath;
}

// ─── Types ──────────────────────────────────────────────────

export interface StageResult {
  outcome: "pass" | "fail" | "waiting";
  error?: string;
}

type StageHandler = (pipelineId: string, stageId: string) => Promise<StageResult>;

// ─── Helper: spawn Claude and wait for completion ───────────

interface SpawnAndWaitOpts {
  pipelineId: string;
  stageId: string;
  agentRole: string;
  prompt: string;
  systemPrompt: string;
  repoPath: string;
  model: string;
  permissionMode: string;
  maxTurns?: number;
  isSelfRepo?: boolean;
}

async function spawnClaudeAndWait(opts: SpawnAndWaitOpts): Promise<{
  output: string;
  exitCode: number;
  taskId: string;
}> {
  const task = taskRepo.create({
    pipelineId: opts.pipelineId,
    stageId: opts.stageId,
    agentRole: opts.agentRole,
    prompt: opts.prompt,
    state: TaskState.RUNNING,
  });

  const session = claudeSessionRepo.create({
    taskId: task.id,
    model: opts.model,
  });

  broadcaster.broadcastToPipeline(opts.pipelineId, {
    type: "session:updated",
    session: claudeSessionRepo.getById(session.id)! as any,
  });

  const proc = processManager.spawn(session.id, {
    prompt: opts.prompt,
    cwd: opts.repoPath,
    pipelineId: opts.pipelineId,
    model: opts.model,
    permissionMode: opts.permissionMode,
    systemPrompt: opts.systemPrompt,
    maxTurns: opts.maxTurns,
    isSelfRepo: opts.isSelfRepo,
  });

  claudeSessionRepo.update(session.id, { pid: proc.pid });

  broadcaster.broadcastToPipeline(opts.pipelineId, {
    type: "session:updated",
    session: claudeSessionRepo.getById(session.id)! as any,
  });

  return new Promise((resolve, reject) => {
    let output = "";
    let lastError = "";
    let costEventCount = 0;

    proc.events.on("chunk", (chunk: StreamChunk) => {
      broadcaster.broadcastToPipeline(opts.pipelineId, {
        type: "stream:chunk",
        taskId: task.id,
        chunk,
      });

      if (chunk.type === "assistant:text") {
        output += chunk.text;
      }

      if (chunk.type === "cost:update") {
        claudeSessionRepo.update(session.id, {
          inputTokens: chunk.inputTokens,
          outputTokens: chunk.outputTokens,
          costUsd: chunk.costUsd,
        });

        costEventCount++;
        if (costEventCount % 5 === 0) {
          broadcaster.broadcastToPipeline(opts.pipelineId, {
            type: "session:updated",
            session: claudeSessionRepo.getById(session.id)! as any,
          });
        }
      }

      if (chunk.type === "done") {
        claudeSessionRepo.update(session.id, {
          completedAt: new Date().toISOString(),
          exitCode: chunk.exitCode,
        });

        const summary = output || lastError || "";
        taskRepo.update(task.id, {
          state: chunk.exitCode === 0 ? TaskState.COMPLETED : TaskState.FAILED,
          resultSummary: summary.slice(0, 2000),
        });

        broadcaster.broadcastToPipeline(opts.pipelineId, {
          type: "session:updated",
          session: claudeSessionRepo.getById(session.id)! as any,
        });

        resolve({ output: output || lastError, exitCode: chunk.exitCode, taskId: task.id });
      }

      if (chunk.type === "error") {
        lastError = chunk.message;
        log.error({ taskId: task.id, error: chunk.message }, "Claude stream error");
      }
    });

    proc.events.on("error", (err: Error) => {
      taskRepo.update(task.id, {
        state: TaskState.FAILED,
        resultSummary: `Process error: ${err.message}`,
      });
      reject(err);
    });
  });
}

// ─── Helper: parse plan JSON from Claude output ─────────────

function parsePlanOutput(raw: string): {
  content: string;
  taskBreakdown: PlanTaskBreakdown[];
} {
  let jsonStr = raw.trim();

  const jsonBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (jsonBlockMatch) {
    jsonStr = jsonBlockMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);
  const planData = parsed.plan ?? parsed;

  if (!planData.content || !Array.isArray(planData.taskBreakdown)) {
    throw new Error("Plan must contain 'content' and 'taskBreakdown'");
  }

  const taskBreakdown: PlanTaskBreakdown[] = planData.taskBreakdown.map(
    (t: Record<string, unknown>, i: number) => {
      if (!t.title || !t.description) {
        throw new Error(`Task ${i} missing 'title' or 'description'`);
      }
      const rawComplexity = String(t.complexity ?? "medium");
      const complexity = (["low", "medium", "high"].includes(rawComplexity) ? rawComplexity : "medium") as ModelTier;
      return {
        title: String(t.title),
        description: String(t.description),
        agentRole: String(t.agentRole ?? "implementer"),
        domain: String(t.domain ?? "general"),
        dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn.map(String) : [],
        canParallelize: Boolean(t.canParallelize ?? true),
        complexity,
      };
    }
  );

  return { content: String(planData.content), taskBreakdown };
}

// ─── Helper: extract consultation markers from Claude output ─

/**
 * Extract [CONSULT] and [BLOCK] markers from Claude output.
 * [CONSULT] question — non-blocking, fire-and-forget
 * [BLOCK] question   — blocking, parks execution until user answers
 * Returns array of block responses (empty if no [BLOCK] markers).
 */
async function extractConsultations(
  output: string,
  pipelineId: string,
  stageType: string,
  taskId?: string
): Promise<string[]> {
  const blockResponses: string[] = [];

  // Non-blocking consultations
  const consultRegex = /\[CONSULT\]\s*(.+?)(?:\n|$)/g;
  let match;
  while ((match = consultRegex.exec(output)) !== null) {
    consultationManager.requestConsultation({
      pipelineId,
      taskId,
      stageType,
      question: match[1].trim(),
      context: { source: "claude_output", stageType },
    });
  }

  // Blocking consultations — parks execution
  const blockRegex = /\[BLOCK\]\s*(.+?)(?:\n|$)/g;
  while ((match = blockRegex.exec(output)) !== null) {
    const response = await consultationManager.requestBlock({
      pipelineId,
      taskId,
      stageType,
      question: match[1].trim(),
      context: { source: "claude_output", stageType },
    });
    blockResponses.push(response);
  }

  return blockResponses;
}

// ─── Helper: create task records from plan breakdown ────────

function splitTasksFromPlan(pipelineId: string, planId: string): string[] {
  const plan = planRepo.getById(planId);
  if (!plan) throw new Error(`Plan not found: ${planId}`);

  const breakdown = (plan as { taskBreakdown: PlanTaskBreakdown[] }).taskBreakdown;
  if (!breakdown || breakdown.length === 0) return [];

  // Create a stage record for parallel_execution to hold these tasks.
  // runStage will reuse this stage instead of creating a duplicate.
  const execStage = stageRepo.create({
    pipelineId,
    type: PipelineState.PARALLEL_EXECUTION,
    state: StageState.PENDING,
  });

  const titleToId = new Map<string, string>();
  const taskIds: string[] = [];

  for (const item of breakdown) {
    const task = taskRepo.create({
      pipelineId,
      stageId: execStage.id,
      agentRole: item.agentRole,
      prompt: item.description,
      state: TaskState.PENDING,
      dependsOn: [],
    });
    titleToId.set(item.title, task.id);
    taskIds.push(task.id);
  }

  // Resolve dependency titles to IDs
  for (let i = 0; i < breakdown.length; i++) {
    if (breakdown[i].dependsOn.length > 0) {
      const deps = breakdown[i].dependsOn
        .map((t) => titleToId.get(t))
        .filter((id): id is string => id !== undefined);
      if (deps.length > 0) {
        taskRepo.update(taskIds[i], { dependsOn: deps });
      }
    }
  }

  log.info({ pipelineId, taskCount: taskIds.length }, "Tasks split from plan");
  return taskIds;
}

// ─── Helper: execute a single task during parallel_execution ─

async function executeOneTask(
  pipelineId: string,
  taskId: string,
  project: { id: string; repoPath: string; model: string; permissionMode: string; isSelfRepo?: number | boolean },
  plan: { content: string } | null | undefined,
  requirements: string,
  repoPath?: string,
  complexity?: ModelTier
): Promise<void> {
  const effectiveRepoPath = repoPath ?? project.repoPath;

  const task = taskRepo.getById(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  // Resolve model: use data-driven complexity routing for parallel_execution tasks
  const taskModel = resolveModel(
    PipelineState.PARALLEL_EXECUTION,
    project.model,
    complexity,
    project.id,
    task.agentRole
  );

  log.info({ pipelineId, taskId, role: task.agentRole, model: taskModel, complexity }, "Executing task");

  taskRepo.update(taskId, { state: TaskState.RUNNING });
  broadcaster.broadcastToPipeline(pipelineId, {
    type: "task:updated",
    task: taskRepo.getById(taskId)! as any,
  });

  const memoryContext = memoryService.getContextForTask(project.id, pipelineId);

  // Map agent role to distributor task type for skill matching
  const ROLE_TO_TASK_TYPE: Record<string, string> = {
    executor: "implement",
    implementer: "implement",
    tester: "test",
    "code-reviewer": "review",
    planner: "plan",
    "adversarial-reviewer": "review",
  };
  const mappedType = ROLE_TO_TASK_TYPE[task.agentRole] ?? task.agentRole;
  const rawSkillPack = skillDistributor.getSkillPack(mappedType, "general");

  // Tool Forge: generate tools if skill pack is empty
  const skillPack = await toolForge.forgeIfNeeded({
    pipelineId,
    taskId,
    taskDescription: task.prompt,
    agentRole: task.agentRole,
    domain: "general",
    currentSkillPack: rawSkillPack,
    repoPath: effectiveRepoPath,
  });

  // Build skill instructions from skill.instructions fields
  const skillInstructionText = skillPack.skills
    .filter((s) => s.instructions)
    .map((s) => `### ${s.name}\n${s.instructions}`)
    .join("\n\n");

  const prompt = buildPrompt({
    role: task.agentRole,
    requirements,
    planContent: plan?.content,
    taskDescription: task.prompt,
    memoryContext: memoryContext || undefined,
    skillInstructions: skillInstructionText || undefined,
    repoPath: effectiveRepoPath,
  });

  const session = claudeSessionRepo.create({
    taskId,
    model: taskModel,
  });

  broadcaster.broadcastToPipeline(pipelineId, {
    type: "session:updated",
    session: claudeSessionRepo.getById(session.id)! as any,
  });

  const proc = processManager.spawn(session.id, {
    prompt,
    cwd: effectiveRepoPath,
    pipelineId,
    model: taskModel,
    permissionMode: project.permissionMode,
    systemPrompt: EXECUTOR_PROMPT,
    skillPack: skillPack.skills.length > 0 ? skillPack : undefined,
    isSelfRepo: !!project.isSelfRepo,
  });

  claudeSessionRepo.update(session.id, { pid: proc.pid });

  broadcaster.broadcastToPipeline(pipelineId, {
    type: "session:updated",
    session: claudeSessionRepo.getById(session.id)! as any,
  });

  return new Promise<void>((resolve, reject) => {
    let resultText = "";
    let costEventCount = 0;

    proc.events.on("chunk", (chunk: StreamChunk) => {
      broadcaster.broadcastToPipeline(pipelineId, {
        type: "stream:chunk",
        taskId,
        chunk,
      });

      if (chunk.type === "assistant:text") {
        resultText += chunk.text;
      }

      if (chunk.type === "cost:update") {
        claudeSessionRepo.update(session.id, {
          inputTokens: chunk.inputTokens,
          outputTokens: chunk.outputTokens,
          costUsd: chunk.costUsd,
        });

        costEventCount++;
        if (costEventCount % 5 === 0) {
          broadcaster.broadcastToPipeline(pipelineId, {
            type: "session:updated",
            session: claudeSessionRepo.getById(session.id)! as any,
          });
        }
      }

      if (chunk.type === "done") {
        claudeSessionRepo.update(session.id, {
          completedAt: new Date().toISOString(),
          exitCode: chunk.exitCode,
        });

        if (chunk.exitCode === 0) {
          taskRepo.update(taskId, {
            state: TaskState.COMPLETED,
            resultSummary: resultText.slice(0, 2000),
          });
          memoryService.recordTaskOutput(
            project.id,
            pipelineId,
            taskId,
            resultText.slice(0, 4000)
          );
          // Record successful outcome for model routing
          if (complexity) {
            const latestSession = claudeSessionRepo.getByTask(taskId).pop();
            modelRouter.recordOutcome(
              project.id,
              task.agentRole,
              complexity,
              taskModel,
              true,
              (latestSession?.inputTokens ?? 0) + (latestSession?.outputTokens ?? 0)
            );
          }
          resolve();
        } else {
          taskRepo.update(taskId, {
            state: TaskState.FAILED,
            resultSummary: `Exit code ${chunk.exitCode}: ${resultText.slice(0, 1000)}`,
          });
          // Record failed outcome for model routing
          if (complexity) {
            const latestSession = claudeSessionRepo.getByTask(taskId).pop();
            modelRouter.recordOutcome(
              project.id,
              task.agentRole,
              complexity,
              taskModel,
              false,
              (latestSession?.inputTokens ?? 0) + (latestSession?.outputTokens ?? 0)
            );
          }
          reject(new Error(`Task ${taskId} exited with code ${chunk.exitCode}`));
        }

        broadcaster.broadcastToPipeline(pipelineId, {
          type: "session:updated",
          session: claudeSessionRepo.getById(session.id)! as any,
        });

        broadcaster.broadcastToPipeline(pipelineId, {
          type: "task:updated",
          task: taskRepo.getById(taskId)! as any,
        });
      }
    });

    proc.events.on("error", (err: Error) => {
      taskRepo.update(taskId, {
        state: TaskState.FAILED,
        resultSummary: `Process error: ${err.message}`,
      });
      reject(err);
    });
  });
}

// ─── Stage Implementations ─────────────────────────────────

const stageHandlers: Record<string, StageHandler> = {
  // Requirements already provided at pipeline creation
  [PipelineState.REQUIREMENTS_INPUT]: async () => {
    return { outcome: "pass" };
  },

  // Spawn Claude planner → parse plan JSON → create plan + tasks
  [PipelineState.PLAN_GENERATION]: async (pipelineId, stageId) => {
    const pipeline = pipelineRepo.getById(pipelineId);
    if (!pipeline) return { outcome: "fail", error: "Pipeline not found" };

    const project = projectRepo.getById(pipeline.projectId);
    if (!project) return { outcome: "fail", error: "Project not found" };

    const effectiveRepoPath = getEffectiveRepoPath(project, pipeline);

    const preflight = runPreflightChecks(effectiveRepoPath);
    if (!preflight.ok) {
      const response = await interventionManager.requestIntervention({
        pipelineId,
        stageType: "plan_generation",
        question: `Preflight checks failed: ${preflight.error}. Proceed anyway, replan, or abort?`,
        context: { checks: preflight.checks, error: preflight.error },
      });
      if (response !== "proceed") {
        return { outcome: "fail", error: `Preflight failed: ${preflight.error}` };
      }
    }

    log.info({ pipelineId }, "Generating plan via Claude");

    const plannerModel = resolveModel(PipelineState.PLAN_GENERATION, project.model);
    const { output, exitCode } = await spawnClaudeAndWait({
      pipelineId,
      stageId,
      agentRole: "planner",
      prompt: pipeline.requirements,
      systemPrompt: PLANNER_PROMPT,
      repoPath: effectiveRepoPath,
      model: plannerModel,
      permissionMode: project.permissionMode,
      maxTurns: 3,
      isSelfRepo: !!project.isSelfRepo,
    });

    if (exitCode !== 0) {
      const detail = output ? `: ${output.slice(0, 500)}` : "";
      return { outcome: "fail", error: `Planner exited with code ${exitCode}${detail}` };
    }

    // Extract consultations from planner output
    await extractConsultations(output, pipelineId, "plan_generation");

    try {
      const parsed = parsePlanOutput(output);

      const plan = planRepo.create({
        pipelineId,
        content: parsed.content,
        taskBreakdown: parsed.taskBreakdown,
      });

      broadcaster.broadcastToPipeline(pipelineId, {
        type: "plan:created",
        plan: plan as any,
      });

      // Pre-create task records for parallel_execution
      splitTasksFromPlan(pipelineId, plan.id);

      log.info(
        { pipelineId, planId: plan.id, tasks: parsed.taskBreakdown.length },
        "Plan generated"
      );
      return { outcome: "pass" };
    } catch (err) {
      return { outcome: "fail", error: (err as Error).message };
    }
  },

  // Wait for human decision (engine resumes via handlePlanReview)
  [PipelineState.HUMAN_REVIEW]: async (pipelineId) => {
    log.info({ pipelineId }, "Waiting for human review");

    broadcaster.broadcastToPipeline(pipelineId, {
      type: "notification",
      level: "warning",
      title: "Review Required",
      message: "Plan is ready for review. Approve, edit, or reject.",
      pipelineId,
    });

    return { outcome: "waiting" };
  },

  // Spawn Claude adversarial reviewer → parse verdict → pass or fail
  [PipelineState.ADVERSARIAL_REVIEW]: async (pipelineId, stageId) => {
    const pipeline = pipelineRepo.getById(pipelineId);
    if (!pipeline) return { outcome: "fail", error: "Pipeline not found" };

    const project = projectRepo.getById(pipeline.projectId);
    if (!project) return { outcome: "fail", error: "Project not found" };

    const effectiveRepoPath = getEffectiveRepoPath(project, pipeline);

    const plan = planRepo.getLatest(pipelineId);
    if (!plan) return { outcome: "fail", error: "No plan found" };

    log.info({ pipelineId }, "Running adversarial review");

    const planContent = (plan as { content: string }).content;
    const planTasks = (plan as { taskBreakdown: PlanTaskBreakdown[] }).taskBreakdown;

    const reviewPrompt = [
      "Review the following plan:\n",
      planContent,
      "\n\nTask breakdown:\n",
      JSON.stringify(planTasks, null, 2),
    ].join("");

    const adversarialModel = resolveModel(PipelineState.ADVERSARIAL_REVIEW, project.model);
    const { output, exitCode } = await spawnClaudeAndWait({
      pipelineId,
      stageId,
      agentRole: "adversarial-reviewer",
      prompt: reviewPrompt,
      systemPrompt: ADVERSARIAL_REVIEWER_PROMPT,
      repoPath: effectiveRepoPath,
      model: adversarialModel,
      permissionMode: project.permissionMode,
      maxTurns: 2,
      isSelfRepo: !!project.isSelfRepo,
    });

    if (exitCode !== 0) {
      return { outcome: "fail", error: `Reviewer exited with code ${exitCode}` };
    }

    // Extract consultations from adversarial reviewer output
    await extractConsultations(output, pipelineId, "adversarial_review");

    // Parse verdict JSON
    try {
      let jsonStr = output.trim();
      const m = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
      if (m) jsonStr = m[1].trim();

      const verdict = JSON.parse(jsonStr);

      planRepo.update(plan.id, {
        adversarialFeedback: verdict.summary ?? output.slice(0, 2000),
      });

      if (verdict.verdict === "reject") {
        // Ask user whether to proceed despite rejection
        const response = await interventionManager.requestIntervention({
          pipelineId,
          stageType: "adversarial_review",
          question: "Adversarial review rejected the plan. Proceed anyway or replan?",
          context: {
            verdict,
            planContent: planContent.slice(0, 2000),
            severity: verdict.severity ?? "unknown",
          },
        });

        if (response === "proceed") {
          log.info({ pipelineId }, "User chose to proceed despite adversarial rejection");
          return { outcome: "pass" };
        }
        return { outcome: "fail", error: `Plan rejected: ${verdict.summary}` };
      }

      return { outcome: "pass" };
    } catch {
      // Can't parse JSON — store raw feedback, pass through
      planRepo.update(plan.id, {
        adversarialFeedback: output.slice(0, 2000),
      });
      return { outcome: "pass" };
    }
  },

  // Context prep: distribute skills and validate memory context.
  [PipelineState.CONTEXT_PREP]: async (pipelineId) => {
    log.info({ pipelineId }, "Preparing context for execution");

    // Map agent roles (from plan breakdown) to distributor task types
    const ROLE_TO_TASK_TYPE: Record<string, string> = {
      executor: "implement",
      implementer: "implement",
      tester: "test",
      "code-reviewer": "review",
      planner: "plan",
      "adversarial-reviewer": "review",
    };

    const tasks = taskRepo
      .getByPipeline(pipelineId)
      .filter((t) => t.state === TaskState.PENDING);

    for (const task of tasks) {
      const mappedType = ROLE_TO_TASK_TYPE[task.agentRole] ?? task.agentRole;
      const skillPack = skillDistributor.getSkillPack(mappedType, "general");
      if (skillPack.skills.length > 0) {
        taskRepo.update(task.id, {
          assignedSkills: skillPack.skills.map((s) => s.name),
        });
        broadcaster.broadcastToPipeline(pipelineId, {
          type: "task:updated",
          task: taskRepo.getById(task.id)! as any,
        });
      }
    }

    const pipeline = pipelineRepo.getById(pipelineId);
    if (!pipeline) return { outcome: "fail", error: "Pipeline not found" };
    const ctx = memoryService.getContextForTask(pipeline.projectId, pipelineId);
    log.info({ pipelineId, taskCount: tasks.length, hasContext: !!ctx }, "Context prep completed");
    return { outcome: "pass" };
  },

  // Execute all tasks in parallel (with dependency ordering + concurrency limit)
  [PipelineState.PARALLEL_EXECUTION]: async (pipelineId) => {
    const pipeline = pipelineRepo.getById(pipelineId);
    if (!pipeline) return { outcome: "fail", error: "Pipeline not found" };

    const project = projectRepo.getById(pipeline.projectId);
    if (!project) return { outcome: "fail", error: "Project not found" };

    const effectiveRepoPath = getEffectiveRepoPath(project, pipeline);

    const plan = planRepo.getLatest(pipelineId);
    const planObj = plan ? { content: (plan as { content: string }).content } : null;

    // Build a map from task title → complexity from the plan breakdown
    const breakdownItems = plan ? (plan as { taskBreakdown: PlanTaskBreakdown[] }).taskBreakdown : [];
    const pendingTasks = taskRepo
      .getByPipeline(pipelineId)
      .filter((t) => t.state === TaskState.PENDING);

    if (pendingTasks.length === 0) {
      log.info({ pipelineId }, "No pending tasks to execute");
      return { outcome: "pass" };
    }

    log.info({ pipelineId, taskCount: pendingTasks.length }, "Starting parallel execution");

    // Create worktrees for parallel isolation
    for (const task of pendingTasks) {
      const branchName = `awa-v/task-${task.id.slice(0, 8)}`;
      const worktreePath = worktreeManager.createWorktree(project.repoPath, branchName);
      taskRepo.update(task.id, { worktreePath });
    }

    // Build a map from task prompt to complexity (match via description)
    const promptComplexityMap = new Map<string, ModelTier>();
    breakdownItems.forEach((item) => {
      promptComplexityMap.set(item.description, (item.complexity as ModelTier) ?? "medium");
    });

    const running = new Set<string>();
    const completed = new Set<string>();
    const failed = new Set<string>();

    // Pre-populate completed tasks
    for (const t of taskRepo.getByPipeline(pipelineId)) {
      if (t.state === TaskState.COMPLETED) completed.add(t.id);
    }

    return new Promise<StageResult>((resolve) => {
      const tryLaunch = () => {
        const ready = pendingTasks.filter((t) => {
          if (running.has(t.id) || completed.has(t.id) || failed.has(t.id)) return false;
          return t.dependsOn.every((dep) => completed.has(dep));
        });

        const slots = DEFAULTS.MAX_CONCURRENT_TASKS - running.size;
        for (const task of ready.slice(0, slots)) {
          running.add(task.id);
          const taskRecord = taskRepo.getById(task.id);
          const taskRepoPath = taskRecord?.worktreePath ?? effectiveRepoPath;
          // Look up complexity from plan breakdown (matched by prompt/description)
          const taskComplexity = promptComplexityMap.get(task.prompt) ?? "medium";
          executeOneTask(pipelineId, task.id, project, planObj, pipeline.requirements, taskRepoPath, taskComplexity)
            .then(() => {
              running.delete(task.id);
              completed.add(task.id);
              checkDone();
              tryLaunch();
            })
            .catch((err) => {
              log.error({ taskId: task.id, error: (err as Error).message }, "Task failed");
              running.delete(task.id);
              failed.add(task.id);
              checkDone();
              tryLaunch();
            });
        }
      };

      const checkDone = () => {
        const remaining = pendingTasks.filter(
          (t) => !completed.has(t.id) && !failed.has(t.id) && !running.has(t.id)
        );
        if (running.size === 0 && remaining.length === 0) {
          if (failed.size > 0) {
            resolve({
              outcome: "fail",
              error: `${failed.size}/${pendingTasks.length} tasks failed`,
            });
          } else {
            // Merge worktree branches back to main
            const completedTaskIds = [...completed];
            mergeManager.mergeAllWorktrees(
              pipelineId, effectiveRepoPath, completedTaskIds
            ).then((mergeResult) => {
              if (!mergeResult.allMerged) {
                resolve({
                  outcome: "fail",
                  error: "Some task branches could not be merged",
                });
              } else {
                resolve({ outcome: "pass" });
              }
            }).catch((err) => {
              resolve({
                outcome: "fail",
                error: `Merge failed: ${(err as Error).message}`,
              });
            });
          }
        }
      };

      tryLaunch();
    });
  },

  // Spawn Claude tester to run/write tests
  [PipelineState.TESTING]: async (pipelineId, stageId) => {
    const pipeline = pipelineRepo.getById(pipelineId);
    if (!pipeline) return { outcome: "fail", error: "Pipeline not found" };

    const project = projectRepo.getById(pipeline.projectId);
    if (!project) return { outcome: "fail", error: "Project not found" };

    const effectiveRepoPath = getEffectiveRepoPath(project, pipeline);

    const plan = planRepo.getLatest(pipelineId);

    const gate = runFastGate(effectiveRepoPath);
    if (!gate.ok) {
      const response = await interventionManager.requestIntervention({
        pipelineId,
        stageType: "testing",
        question: "Fast gate failed (typecheck/lint). Proceed anyway, replan, or abort?",
        context: { checks: gate.checks },
      });
      if (response !== "proceed") {
        return { outcome: "fail", error: "Fast gate failed before tester execution" };
      }
    }

    log.info({ pipelineId }, "Running testing stage");

    const testPrompt = buildPrompt({
      role: "tester",
      requirements: pipeline.requirements,
      planContent: plan ? (plan as { content: string }).content : undefined,
      taskDescription:
        "Run existing tests and write new tests for the changes made in this pipeline. Report pass/fail results.",
      repoPath: effectiveRepoPath,
    });

    const testerModel = resolveModel(PipelineState.TESTING, project.model);
    const { output: testOutput, exitCode } = await spawnClaudeAndWait({
      pipelineId,
      stageId,
      agentRole: "tester",
      prompt: testPrompt,
      systemPrompt: TESTER_PROMPT,
      repoPath: effectiveRepoPath,
      model: testerModel,
      permissionMode: project.permissionMode,
      isSelfRepo: !!project.isSelfRepo,
    });

    if (exitCode !== 0) {
      // Ask user whether to proceed despite test failures
      const response = await interventionManager.requestIntervention({
        pipelineId,
        stageType: "testing",
        question: "Tests failed. Proceed anyway, replan, or abort?",
        context: {
          exitCode,
          testOutput: testOutput.slice(0, 3000),
        },
      });

      if (response === "proceed") {
        log.info({ pipelineId }, "User chose to proceed despite test failures");
        return { outcome: "pass" };
      }
      return { outcome: "fail", error: `Tester exited with code ${exitCode}` };
    }

    return { outcome: "pass" };
  },

  // Spawn Claude code reviewer → parse verdict
  [PipelineState.CODE_REVIEW]: async (pipelineId, stageId) => {
    const pipeline = pipelineRepo.getById(pipelineId);
    if (!pipeline) return { outcome: "fail", error: "Pipeline not found" };

    const project = projectRepo.getById(pipeline.projectId);
    if (!project) return { outcome: "fail", error: "Project not found" };

    const effectiveRepoPath = getEffectiveRepoPath(project, pipeline);

    const plan = planRepo.getLatest(pipelineId);

    log.info({ pipelineId }, "Running code review");

    const reviewPrompt = buildPrompt({
      role: "code-reviewer",
      requirements: pipeline.requirements,
      planContent: plan ? (plan as { content: string }).content : undefined,
      taskDescription:
        "Review all code changes made in this pipeline. Check git diff and assess quality, correctness, and security.",
      repoPath: effectiveRepoPath,
    });

    const reviewerModel = resolveModel(PipelineState.CODE_REVIEW, project.model);
    const { output, exitCode } = await spawnClaudeAndWait({
      pipelineId,
      stageId,
      agentRole: "code-reviewer",
      prompt: reviewPrompt,
      systemPrompt: CODE_REVIEWER_PROMPT,
      repoPath: effectiveRepoPath,
      model: reviewerModel,
      permissionMode: project.permissionMode,
      isSelfRepo: !!project.isSelfRepo,
    });

    if (exitCode !== 0) {
      return { outcome: "fail", error: `Reviewer exited with code ${exitCode}` };
    }

    // Extract consultations from code reviewer output
    await extractConsultations(output, pipelineId, "code_review");

    try {
      let jsonStr = output.trim();
      const m = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
      if (m) jsonStr = m[1].trim();

      const verdict = JSON.parse(jsonStr);

      // Store quality gate result for evolution tracking
      stageRepo.update(stageId, { qualityGateResult: JSON.stringify(verdict) });

      // Check churn metrics — auto-intervention on critical churn
      if (verdict.churnMetrics?.verdict === "critical") {
        consultationManager.requestConsultation({
          pipelineId,
          stageType: "code_review",
          question: `Critical code churn detected (score: ${verdict.churnMetrics.churnScore}/10). ` +
            `${verdict.churnMetrics.patchStyleFixes} patch-style fixes, ` +
            `${verdict.churnMetrics.duplicatedCode} duplicated blocks. ` +
            `Recommending replan to rebuild properly.`,
          context: { churnMetrics: verdict.churnMetrics, findings: verdict.findings },
        });

        const response = await interventionManager.requestIntervention({
          pipelineId,
          stageType: "code_review",
          question: "Critical code churn detected. Force proceed or replan for cleaner implementation?",
          context: { churnMetrics: verdict.churnMetrics, summary: verdict.summary },
        });

        if (response === "proceed") {
          return { outcome: "pass" };
        }
        return { outcome: "fail", error: `Critical churn: ${verdict.summary}` };
      }

      if (verdict.verdict === "reject") {
        // Ask user whether to proceed despite code review rejection
        const response = await interventionManager.requestIntervention({
          pipelineId,
          stageType: "code_review",
          question: "Code review rejected the changes. Proceed anyway or replan?",
          context: {
            verdict,
            summary: verdict.summary ?? output.slice(0, 2000),
          },
        });

        if (response === "proceed") {
          log.info({ pipelineId }, "User chose to proceed despite code review rejection");
          return { outcome: "pass" };
        }
        return { outcome: "fail", error: `Code rejected: ${verdict.summary}` };
      }
    } catch {
      // Can't parse — pass through
    }

    return { outcome: "pass" };
  },

  // Create branch + commit changes
  [PipelineState.GIT_INTEGRATION]: async (pipelineId) => {
    const pipeline = pipelineRepo.getById(pipelineId);
    if (!pipeline) return { outcome: "fail", error: "Pipeline not found" };

    const project = projectRepo.getById(pipeline.projectId);
    if (!project) return { outcome: "fail", error: "Project not found" };

    const effectiveRepoPath = getEffectiveRepoPath(project, pipeline);

    log.info({ pipelineId }, "Running git integration");

    try {
      // Self-repo: staging worktree is already on the right branch.
      // Just commit whatever changes are in the worktree.
      if (pipeline.selfWorktreePath) {
        const status = commitManager.getStatus(effectiveRepoPath);
        if (status.clean) {
          log.info({ pipelineId }, "No changes to commit (self-repo)");
          return { outcome: "pass" };
        }
        const hash = commitManager.commit(
          effectiveRepoPath,
          `feat: ${pipeline.requirements.slice(0, 72)}\n\nPipeline: ${pipelineId}\nAutomated by AWA-V (self-repo)`
        );
        log.info({ pipelineId, hash }, "Changes committed to self-repo staging branch");

        const smoke = runPostMergeSmoke(effectiveRepoPath);
        if (!smoke.ok) {
          const response = await interventionManager.requestIntervention({
            pipelineId,
            stageType: "git_integration",
            question: "Post-merge smoke checks failed. Proceed anyway, replan, or abort?",
            context: { checks: smoke.checks, mode: "self_repo" },
          });
          if (response !== "proceed") {
            return { outcome: "fail", error: "Post-merge smoke failed" };
          }
        }
        return { outcome: "pass" };
      }

      // Normal flow
      const status = commitManager.getStatus(effectiveRepoPath);
      if (status.clean) {
        log.info({ pipelineId }, "No changes to commit");
        return { outcome: "pass" };
      }

      const branchName = `awa-v/pipeline-${pipelineId.slice(0, 8)}`;
      if (!branchManager.branchExists(effectiveRepoPath, branchName)) {
        branchManager.createBranch(effectiveRepoPath, branchName);
      }

      const hash = commitManager.commit(
        effectiveRepoPath,
        `feat: ${pipeline.requirements.slice(0, 72)}\n\nPipeline: ${pipelineId}\nAutomated by AWA-V`
      );

      log.info({ pipelineId, hash, branch: branchName }, "Changes committed");

      const smoke = runPostMergeSmoke(effectiveRepoPath);
      if (!smoke.ok) {
        const response = await interventionManager.requestIntervention({
          pipelineId,
          stageType: "git_integration",
          question: "Post-merge smoke checks failed. Proceed anyway, replan, or abort?",
          context: { checks: smoke.checks, branchName },
        });
        if (response !== "proceed") {
          return { outcome: "fail", error: "Post-merge smoke failed" };
        }
      }

      return { outcome: "pass" };
    } catch (err) {
      return { outcome: "fail", error: (err as Error).message };
    }
  },

  // Capture metrics for evolution analysis
  [PipelineState.EVOLUTION_CAPTURE]: async (pipelineId) => {
    log.info({ pipelineId }, "Capturing evolution metrics");
    evolutionEngine.captureMetrics(pipelineId);
    return { outcome: "pass" };
  },

  // Run evolution analysis + promote L1 memories to L2
  [PipelineState.CLAUDE_MD_EVOLUTION]: async (pipelineId) => {
    const pipeline = pipelineRepo.getById(pipelineId);
    if (!pipeline) return { outcome: "fail", error: "Pipeline not found" };

    log.info({ pipelineId }, "Running evolution analysis");

    memoryService.promotePipelineMemoriesToL2(pipeline.projectId, pipelineId);

    const analysis = await evolutionEngine.analyze(pipeline.projectId);
    if (analysis.recommendations.length > 0) {
      await evolutionEngine.applyRecommendations(
        pipeline.projectId,
        analysis.recommendations,
        pipelineId
      );
    }

    return { outcome: "pass" };
  },
};

// ─── Public API ─────────────────────────────────────────────

/**
 * Run a pipeline stage. Reuses pre-created PENDING stage records
 * (e.g., parallel_execution created by splitTasksFromPlan), otherwise
 * creates a new stage record.
 */
export async function runStage(
  pipelineId: string,
  stageType: string
): Promise<StageResult> {
  log.info({ pipelineId, stageType }, "Running stage");

  // Reuse an existing PENDING stage if one was pre-created
  let stage;
  const existingStages = stageRepo.getByPipeline(pipelineId);
  const pending = existingStages.find(
    (s) => s.type === stageType && s.state === StageState.PENDING
  );

  if (pending) {
    stage = pending;
    stageRepo.update(stage.id, {
      state: StageState.RUNNING,
      startedAt: new Date().toISOString(),
    });
  } else {
    stage = stageRepo.create({
      pipelineId,
      type: stageType,
      state: StageState.RUNNING,
    });
    stageRepo.update(stage.id, { startedAt: new Date().toISOString() });
  }

  const handler = stageHandlers[stageType];

  if (!handler) {
    const errorMsg = `No handler for stage: ${stageType}`;
    log.error({ pipelineId, stageType }, errorMsg);
    stageRepo.update(stage.id, {
      state: StageState.FAILED,
      completedAt: new Date().toISOString(),
      errorMessage: errorMsg,
    });
    return { outcome: "fail", error: errorMsg };
  }

  try {
    const result = await handler(pipelineId, stage.id);

    if (result.outcome === "pass") {
      stageRepo.update(stage.id, {
        state: StageState.PASSED,
        completedAt: new Date().toISOString(),
        qualityGateResult: "pass",
      });
    } else if (result.outcome === "fail") {
      stageRepo.update(stage.id, {
        state: StageState.FAILED,
        completedAt: new Date().toISOString(),
        qualityGateResult: "fail",
        errorMessage: result.error ?? "Stage failed",
      });
    } else if (result.outcome === "waiting") {
      stageRepo.update(stage.id, { qualityGateResult: "waiting" });
    }

    log.info({ pipelineId, stageType, outcome: result.outcome }, "Stage completed");
    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error({ pipelineId, stageType, error: errorMsg }, "Stage threw");

    stageRepo.update(stage.id, {
      state: StageState.FAILED,
      completedAt: new Date().toISOString(),
      errorMessage: errorMsg,
    });

    return { outcome: "fail", error: errorMsg };
  }
}
