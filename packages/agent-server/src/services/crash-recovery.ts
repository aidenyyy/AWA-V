import { eq, notInArray } from "drizzle-orm";
import { db, schema } from "../db/connection.js";
import { PipelineState, StageState, TaskState } from "@awa-v/shared";
import pino from "pino";

const log = pino({ name: "crash-recovery" });

const TERMINAL_STATES: string[] = [
  PipelineState.COMPLETED,
  PipelineState.FAILED,
  PipelineState.CANCELLED,
];

const INTERVENTION_STAGES: string[] = [
  PipelineState.HUMAN_REVIEW,
];

const PAUSED_STATE = PipelineState.PAUSED;

/**
 * Recover from a server crash by fixing inconsistent DB state.
 * Returns a list of pipeline IDs that should be resumed.
 */
export function recoverFromCrash(): string[] {
  log.info("Starting crash recovery scan");

  // 1. Mark incomplete claude_sessions as crashed (no completedAt)
  const runningSessions = db
    .select()
    .from(schema.claudeSessions)
    .all()
    .filter((s) => !s.completedAt);

  for (const session of runningSessions) {
    db.update(schema.claudeSessions)
      .set({
        completedAt: new Date().toISOString(),
        exitCode: -1,
      })
      .where(eq(schema.claudeSessions.id, session.id))
      .run();
  }

  if (runningSessions.length > 0) {
    log.info(
      { count: runningSessions.length },
      "Marked incomplete claude sessions as crashed"
    );
  }

  // 2. Mark running tasks as pending (so they can be re-executed)
  const runningTasks = db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.state, TaskState.RUNNING))
    .all();

  for (const task of runningTasks) {
    db.update(schema.tasks)
      .set({ state: TaskState.PENDING, updatedAt: new Date().toISOString() })
      .where(eq(schema.tasks.id, task.id))
      .run();
  }

  if (runningTasks.length > 0) {
    log.info(
      { count: runningTasks.length },
      "Reset running tasks to pending"
    );
  }

  // 3. Mark running stages as failed with crash error
  const runningStages = db
    .select()
    .from(schema.stages)
    .where(eq(schema.stages.state, StageState.RUNNING))
    .all();

  for (const stage of runningStages) {
    db.update(schema.stages)
      .set({
        state: StageState.FAILED,
        completedAt: new Date().toISOString(),
        errorMessage: "Server crashed during execution",
      })
      .where(eq(schema.stages.id, stage.id))
      .run();
  }

  if (runningStages.length > 0) {
    log.info(
      { count: runningStages.length },
      "Marked running stages as failed (crash)"
    );
  }

  // 4. Find non-terminal pipelines to resume (select only needed columns
  //    to avoid schema mismatch if DB was created before new columns were added)
  const activePipelines = db
    .select({ id: schema.pipelines.id, state: schema.pipelines.state })
    .from(schema.pipelines)
    .where(notInArray(schema.pipelines.state, TERMINAL_STATES))
    .all();

  const toResume: string[] = [];

  for (const pipeline of activePipelines) {
    const state = pipeline.state;

    if (state === PAUSED_STATE) {
      // 5a. Paused pipelines: leave paused for manual resume
      log.info(
        { pipelineId: pipeline.id, state },
        "Pipeline is paused — leaving paused for manual resume"
      );
      continue;
    } else if (INTERVENTION_STAGES.includes(state)) {
      // 5b. Intervention stages: keep state as-is (will be re-parked in resume)
      log.info(
        { pipelineId: pipeline.id, state },
        "Pipeline in intervention stage — will re-park"
      );
      toResume.push(pipeline.id);
    } else if (TERMINAL_STATES.includes(state)) {
      // Skip terminal (shouldn't reach here due to query, but defensive)
      continue;
    } else {
      // 6. Active execution stage: the stage was already marked failed above,
      //    so the pipeline's current state is still set to that stage.
      //    The resume() method will re-enter runCurrentStageAndAdvance.
      log.info(
        { pipelineId: pipeline.id, state },
        "Pipeline in active stage — will resume"
      );
      toResume.push(pipeline.id);
    }
  }

  log.info(
    {
      sessions: runningSessions.length,
      tasks: runningTasks.length,
      stages: runningStages.length,
      pipelines: toResume.length,
    },
    "Crash recovery complete"
  );

  return toResume;
}
