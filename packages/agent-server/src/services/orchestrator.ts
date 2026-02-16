import { processManager } from "../claude/process-manager.js";
import { buildPrompt } from "../claude/prompt-builder.js";
import { pipelineRepo } from "../db/repositories/pipeline-repo.js";
import { stageRepo, taskRepo, planRepo, claudeSessionRepo } from "../db/repositories/task-repo.js";
import { projectRepo } from "../db/repositories/project-repo.js";
import { memoryService } from "./memory-service.js";
import { skillDistributor } from "./skill-distributor.js";
import { broadcaster } from "../ws/broadcaster.js";
import { PLANNER_PROMPT } from "../prompts/planner.js";
import { EXECUTOR_PROMPT } from "../prompts/executor.js";
import {
  PipelineState,
  StageState,
  TaskState,
  DEFAULTS,
} from "@awa-v/shared";
import type { PlanTaskBreakdown, StreamChunk } from "@awa-v/shared";
import pino from "pino";

const log = pino({ name: "orchestrator" });

/**
 * Orchestrator service: coordinates pipeline execution by managing plan
 * generation, task splitting, and parallel agent execution.
 */
class Orchestrator {
  /**
   * Spawn a Claude process in "plan mode" to generate a plan + task breakdown
   * from the pipeline's requirements.
   */
  async generatePlan(pipelineId: string): Promise<string> {
    const pipeline = pipelineRepo.getById(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${pipelineId}`);
    }

    const project = projectRepo.getById(pipeline.projectId);
    if (!project) {
      throw new Error(`Project not found: ${pipeline.projectId}`);
    }

    log.info({ pipelineId }, "Generating plan");

    // Update pipeline state
    pipelineRepo.update(pipelineId, { state: PipelineState.PLAN_GENERATION });

    // Create a stage record for plan generation
    const stage = stageRepo.create({
      pipelineId,
      type: PipelineState.PLAN_GENERATION,
      state: StageState.RUNNING,
    });
    stageRepo.update(stage.id, { startedAt: new Date().toISOString() });

    broadcaster.broadcastToPipeline(pipelineId, {
      type: "stage:updated",
      stage: stageRepo.getById(stage.id)! as any,
    });

    // Create a task for the planner
    const plannerTask = taskRepo.create({
      pipelineId,
      stageId: stage.id,
      agentRole: "planner",
      prompt: pipeline.requirements,
      state: TaskState.RUNNING,
    });

    // Create a session record
    const session = claudeSessionRepo.create({
      taskId: plannerTask.id,
      model: project.model,
    });

    // Spawn Claude with the planner system prompt
    const claudeProcess = processManager.spawn(session.id, {
      prompt: pipeline.requirements,
      cwd: project.repoPath,
      pipelineId,
      model: project.model,
      permissionMode: project.permissionMode,
      systemPrompt: PLANNER_PROMPT,
      maxTurns: 3,
    });

    // Update session with PID
    claudeSessionRepo.update(session.id, { pid: claudeProcess.pid });

    // Collect output for plan parsing
    let fullOutput = "";

    return new Promise<string>((resolve, reject) => {
      claudeProcess.events.on("chunk", (chunk: StreamChunk) => {
        // Broadcast stream chunks to subscribed clients
        broadcaster.broadcastToPipeline(pipelineId, {
          type: "stream:chunk",
          taskId: plannerTask.id,
          chunk,
        });

        // Accumulate text output for plan parsing
        if (chunk.type === "assistant:text") {
          fullOutput += chunk.text;
        }

        // Track cost updates
        if (chunk.type === "cost:update") {
          claudeSessionRepo.update(session.id, {
            inputTokens: chunk.inputTokens,
            outputTokens: chunk.outputTokens,
            costUsd: chunk.costUsd,
          });
        }

        if (chunk.type === "done") {
          try {
            const parsed = this.parsePlanOutput(fullOutput);

            // Create the plan record
            const plan = planRepo.create({
              pipelineId,
              content: parsed.content,
              taskBreakdown: parsed.taskBreakdown,
            });

            // Update task and stage
            taskRepo.update(plannerTask.id, {
              state: TaskState.COMPLETED,
              resultSummary: `Plan generated with ${parsed.taskBreakdown.length} tasks`,
            });

            claudeSessionRepo.update(session.id, {
              completedAt: new Date().toISOString(),
              exitCode: chunk.exitCode,
            });

            stageRepo.update(stage.id, {
              state: StageState.PASSED,
              completedAt: new Date().toISOString(),
            });

            // Broadcast plan creation
            broadcaster.broadcastToPipeline(pipelineId, {
              type: "plan:created",
              plan: plan as any,
            });

            // Move pipeline to human review
            pipelineRepo.update(pipelineId, {
              state: PipelineState.HUMAN_REVIEW,
            });

            log.info(
              { pipelineId, planId: plan.id, taskCount: parsed.taskBreakdown.length },
              "Plan generated successfully"
            );

            resolve(plan.id);
          } catch (err) {
            const errorMsg = (err as Error).message;
            log.error({ pipelineId, error: errorMsg }, "Failed to parse plan output");

            taskRepo.update(plannerTask.id, {
              state: TaskState.FAILED,
              resultSummary: `Plan parsing failed: ${errorMsg}`,
            });

            stageRepo.update(stage.id, {
              state: StageState.FAILED,
              completedAt: new Date().toISOString(),
              errorMessage: errorMsg,
            });

            reject(new Error(`Plan generation failed: ${errorMsg}`));
          }
        }

        if (chunk.type === "error") {
          log.error({ pipelineId, error: chunk.message }, "Claude process error during planning");
        }
      });

      claudeProcess.events.on("error", (err: Error) => {
        reject(err);
      });
    });
  }

  /**
   * Takes the plan's taskBreakdown and creates Task records in the DB.
   * Links task dependencies by title matching.
   */
  splitTasks(pipelineId: string, planId: string): string[] {
    const plan = planRepo.getById(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const breakdown = plan.taskBreakdown as PlanTaskBreakdown[];
    if (!breakdown.length) {
      throw new Error("Plan has no task breakdown");
    }

    log.info({ pipelineId, planId, taskCount: breakdown.length }, "Splitting tasks from plan");

    // Create the execution stage
    const stage = stageRepo.create({
      pipelineId,
      type: PipelineState.PARALLEL_EXECUTION,
      state: StageState.PENDING,
    });

    // First pass: create all tasks and build a title -> id map
    const titleToId = new Map<string, string>();
    const taskIds: string[] = [];

    for (const item of breakdown) {
      const task = taskRepo.create({
        pipelineId,
        stageId: stage.id,
        agentRole: item.agentRole,
        prompt: item.description,
        state: TaskState.PENDING,
        dependsOn: [], // Will be resolved in second pass
      });

      titleToId.set(item.title, task.id);
      taskIds.push(task.id);

      broadcaster.broadcastToPipeline(pipelineId, {
        type: "task:updated",
        task: task as any,
      });
    }

    // Second pass: resolve dependency titles to task IDs
    for (let i = 0; i < breakdown.length; i++) {
      const item = breakdown[i];
      if (item.dependsOn.length > 0) {
        const resolvedDeps = item.dependsOn
          .map((depTitle) => titleToId.get(depTitle))
          .filter((id): id is string => id !== undefined);

        if (resolvedDeps.length > 0) {
          taskRepo.update(taskIds[i], { dependsOn: resolvedDeps });
        }
      }
    }

    log.info(
      { pipelineId, taskCount: taskIds.length },
      "Tasks created from plan breakdown"
    );

    return taskIds;
  }

  /**
   * For each task in the pipeline, gets memory context + skill pack,
   * then spawns Claude processes to execute them.
   * Respects dependencies: only starts tasks whose dependencies are completed.
   */
  async coordinateExecution(pipelineId: string): Promise<void> {
    const pipeline = pipelineRepo.getById(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${pipelineId}`);
    }

    const project = projectRepo.getById(pipeline.projectId);
    if (!project) {
      throw new Error(`Project not found: ${pipeline.projectId}`);
    }

    log.info({ pipelineId }, "Starting coordinated execution");

    // Update pipeline state
    pipelineRepo.update(pipelineId, {
      state: PipelineState.PARALLEL_EXECUTION,
    });

    const allTasks = taskRepo.getByPipeline(pipelineId)
      .filter((t) => t.state === TaskState.PENDING || t.state === TaskState.QUEUED);

    // Get the latest plan for context
    const plan = planRepo.getLatest(pipelineId);

    // Track running tasks
    const runningTasks = new Set<string>();
    const completedTasks = new Set<string>();
    const failedTasks = new Set<string>();

    // Check which already-existing tasks are completed
    const existingTasks = taskRepo.getByPipeline(pipelineId);
    for (const t of existingTasks) {
      if (t.state === TaskState.COMPLETED) {
        completedTasks.add(t.id);
      }
    }

    return new Promise<void>((resolve, reject) => {
      const tryLaunchTasks = () => {
        // Find tasks ready to run (all deps completed, not already running)
        const readyTasks = allTasks.filter((task) => {
          if (runningTasks.has(task.id) || completedTasks.has(task.id) || failedTasks.has(task.id)) {
            return false;
          }
          // Check all dependencies are completed
          return task.dependsOn.every((depId) => completedTasks.has(depId));
        });

        // Respect concurrency limit
        const slotsAvailable = DEFAULTS.MAX_CONCURRENT_TASKS - runningTasks.size;
        const tasksToLaunch = readyTasks.slice(0, slotsAvailable);

        for (const task of tasksToLaunch) {
          runningTasks.add(task.id);
          this.executeTask(pipelineId, task.id, project, plan, pipeline.requirements)
            .then(() => {
              runningTasks.delete(task.id);
              completedTasks.add(task.id);
              checkCompletion();
              tryLaunchTasks();
            })
            .catch((err) => {
              log.error(
                { pipelineId, taskId: task.id, error: (err as Error).message },
                "Task execution failed"
              );
              runningTasks.delete(task.id);
              failedTasks.add(task.id);
              checkCompletion();
              tryLaunchTasks();
            });
        }
      };

      const checkCompletion = () => {
        const totalPending = allTasks.filter(
          (t) => !completedTasks.has(t.id) && !failedTasks.has(t.id) && !runningTasks.has(t.id)
        ).length;

        if (runningTasks.size === 0 && totalPending === 0) {
          if (failedTasks.size > 0) {
            log.warn(
              { pipelineId, failed: failedTasks.size, completed: completedTasks.size },
              "Execution completed with failures"
            );
          } else {
            log.info(
              { pipelineId, completed: completedTasks.size },
              "All tasks completed successfully"
            );
          }
          resolve();
        }
      };

      // Start the launch loop
      tryLaunchTasks();

      // If no tasks to run, resolve immediately
      if (allTasks.length === 0) {
        resolve();
      }
    });
  }

  /**
   * Execute a single task: gather context, build prompt, spawn Claude.
   */
  private async executeTask(
    pipelineId: string,
    taskId: string,
    project: { id: string; repoPath: string; model: string; permissionMode: string },
    plan: { content: string } | undefined,
    requirements: string
  ): Promise<void> {
    const task = taskRepo.getById(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    log.info({ pipelineId, taskId, role: task.agentRole }, "Executing task");

    // Update task state
    taskRepo.update(taskId, { state: TaskState.RUNNING });
    broadcaster.broadcastToPipeline(pipelineId, {
      type: "task:updated",
      task: taskRepo.getById(taskId)! as any,
    });

    // 1. Get memory context from memoryService
    const memoryContext = memoryService.getContextForTask(project.id, pipelineId);

    // 2. Get skill pack from skillDistributor
    const skillPack = skillDistributor.getSkillPack(
      task.agentRole,
      "general" // domain could be extracted from task metadata
    );

    // 3. Build prompt with context
    const prompt = buildPrompt({
      role: task.agentRole,
      requirements,
      planContent: plan?.content,
      taskDescription: task.prompt,
      memoryContext: memoryContext || undefined,
      skillInstructions: skillPack.claudeMdSnippets.join("\n\n") || undefined,
      repoPath: project.repoPath,
    });

    // 4. Create session and spawn Claude process
    const session = claudeSessionRepo.create({
      taskId,
      model: project.model,
    });

    const claudeProcess = processManager.spawn(session.id, {
      prompt,
      cwd: project.repoPath,
      pipelineId,
      model: project.model,
      permissionMode: project.permissionMode,
      skillPack: skillPack.skills.length > 0 ? skillPack : undefined,
      systemPrompt: EXECUTOR_PROMPT,
    });

    claudeSessionRepo.update(session.id, { pid: claudeProcess.pid });

    // Update task with assigned skills
    if (skillPack.skills.length > 0) {
      taskRepo.update(taskId, {
        assignedSkills: skillPack.skills.map((s) => s.name),
      });
    }

    // 5. Track stream events and broadcast
    let resultText = "";

    return new Promise<void>((resolve, reject) => {
      claudeProcess.events.on("chunk", (chunk: StreamChunk) => {
        // Broadcast to subscribed clients
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

          // Update pipeline totals
          const currentPipeline = pipelineRepo.getById(pipelineId);
          if (currentPipeline) {
            pipelineRepo.update(pipelineId, {
              totalInputTokens: currentPipeline.totalInputTokens + chunk.inputTokens,
              totalOutputTokens: currentPipeline.totalOutputTokens + chunk.outputTokens,
              totalCostUsd: currentPipeline.totalCostUsd + chunk.costUsd,
            });
          }
        }

        if (chunk.type === "done") {
          const now = new Date().toISOString();

          claudeSessionRepo.update(session.id, {
            completedAt: now,
            exitCode: chunk.exitCode,
          });

          if (chunk.exitCode === 0) {
            taskRepo.update(taskId, {
              state: TaskState.COMPLETED,
              resultSummary: resultText.slice(0, 2000), // Truncate for DB
            });

            // Record task output for cross-task memory
            memoryService.recordTaskOutput(
              project.id,
              pipelineId,
              taskId,
              resultText.slice(0, 4000)
            );

            log.info({ pipelineId, taskId }, "Task completed successfully");
            resolve();
          } else {
            taskRepo.update(taskId, {
              state: TaskState.FAILED,
              resultSummary: `Exit code ${chunk.exitCode}: ${resultText.slice(0, 1000)}`,
            });
            reject(new Error(`Task ${taskId} exited with code ${chunk.exitCode}`));
          }

          broadcaster.broadcastToPipeline(pipelineId, {
            type: "task:updated",
            task: taskRepo.getById(taskId)! as any,
          });
        }

        if (chunk.type === "error") {
          log.error({ pipelineId, taskId, error: chunk.message }, "Task stream error");
        }
      });

      claudeProcess.events.on("error", (err: Error) => {
        taskRepo.update(taskId, {
          state: TaskState.FAILED,
          resultSummary: `Process error: ${err.message}`,
        });
        reject(err);
      });
    });
  }

  /**
   * Parse the raw Claude output to extract plan content and task breakdown.
   * Expects JSON output matching the PLANNER_PROMPT format.
   */
  private parsePlanOutput(raw: string): {
    content: string;
    taskBreakdown: PlanTaskBreakdown[];
  } {
    // Try to find JSON in the output (may be wrapped in markdown code blocks)
    let jsonStr = raw.trim();

    // Strip markdown code block wrappers if present
    const jsonBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (jsonBlockMatch) {
      jsonStr = jsonBlockMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(jsonStr);

      // Handle both { plan: { ... } } and direct { content, taskBreakdown } shapes
      const planData = parsed.plan ?? parsed;

      if (!planData.content || !Array.isArray(planData.taskBreakdown)) {
        throw new Error(
          "Plan output must contain 'content' (string) and 'taskBreakdown' (array)"
        );
      }

      // Validate each task in the breakdown
      const taskBreakdown: PlanTaskBreakdown[] = planData.taskBreakdown.map(
        (task: Record<string, unknown>, index: number) => {
          if (!task.title || !task.description) {
            throw new Error(
              `Task at index ${index} missing required fields 'title' and 'description'`
            );
          }
          return {
            title: String(task.title),
            description: String(task.description),
            agentRole: String(task.agentRole ?? "implementer"),
            domain: String(task.domain ?? "general"),
            dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn.map(String) : [],
            canParallelize: Boolean(task.canParallelize ?? true),
          };
        }
      );

      return {
        content: String(planData.content),
        taskBreakdown,
      };
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(
          `Failed to parse plan JSON: ${err.message}. Raw output starts with: "${raw.slice(0, 200)}"`
        );
      }
      throw err;
    }
  }
}

// Singleton
export const orchestrator = new Orchestrator();
