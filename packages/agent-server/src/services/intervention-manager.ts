import { interventionRepo } from "../db/repositories/intervention-repo.js";
import { broadcaster } from "../ws/broadcaster.js";
import { selfHealer } from "../pipeline/self-healing.js";
import type { Intervention, PipelineState } from "@awa-v/shared";
import pino from "pino";

const log = pino({ name: "intervention-manager" });

/**
 * InterventionManager uses a promise-parking pattern:
 * - Stage handlers call requestIntervention() which returns a Promise<string>
 * - The promise parks (does not resolve) until a user responds via REST API
 * - resolveIntervention() resolves the parked promise, resuming the stage handler
 *
 * If the server restarts, pending interventions remain in the DB.
 * The UI can re-show them and users can re-respond.
 *
 * When an intervention is requested, the stage timeout is cleared so
 * that human decisions (which can take hours) don't trigger timeouts.
 */
class InterventionManager {
  private pending = new Map<
    string,
    {
      resolve: (response: string) => void;
      pipelineId: string;
      postRestart?: boolean;
    }
  >();

  /**
   * Request human intervention. Parks the current execution until a user responds.
   * Returns the user's response string.
   */
  async requestIntervention(opts: {
    pipelineId: string;
    taskId?: string;
    stageType: string;
    question: string;
    context: Record<string, unknown>;
  }): Promise<string> {
    // Clear the stage timeout — human decisions can take hours
    selfHealer.clearTimeout(opts.pipelineId);

    // Enforce a single pending blocking item per task.
    // Cross-task blocking can still happen in parallel.
    let intervention =
      opts.taskId
        ? interventionRepo.getPendingForTask(opts.pipelineId, opts.taskId)[0]
        : undefined;

    if (!intervention) {
      intervention = interventionRepo.create({
        pipelineId: opts.pipelineId,
        taskId: opts.taskId,
        stageType: opts.stageType,
        question: opts.question,
        context: JSON.stringify(opts.context),
      });
    }

    log.info(
      {
        interventionId: intervention.id,
        pipelineId: opts.pipelineId,
        taskId: opts.taskId,
        stageType: opts.stageType,
      },
      "Intervention requested — timeout cleared"
    );

    broadcaster.broadcastToPipeline(opts.pipelineId, {
      type: "intervention:requested",
      intervention: intervention as Intervention,
    });

    return new Promise<string>((resolve) => {
      this.pending.set(intervention.id, { resolve, pipelineId: opts.pipelineId });
    });
  }

  /**
   * Re-park an intervention after server restart.
   * Creates a new intervention request in the DB and parks a promise.
   * When the user responds, the pipeline will be advanced via the engine.
   */
  async reParkIntervention(
    pipelineId: string,
    stageType: PipelineState
  ): Promise<void> {
    // Check if there's already a pending intervention in the DB
    const existing = interventionRepo.getPending(pipelineId);
    let intervention: ReturnType<typeof interventionRepo.create>;

    if (existing.length > 0) {
      // Reuse the existing pending intervention
      intervention = existing[0];
      log.info(
        { interventionId: intervention.id, pipelineId, stageType },
        "Re-parking existing intervention after restart"
      );
    } else {
      // Create a fresh intervention request
      intervention = interventionRepo.create({
        pipelineId,
        stageType,
        question: `Pipeline requires input for ${stageType} (resumed after server restart)`,
        context: JSON.stringify({ postRestart: true, stageType }),
      });

      log.info(
        { interventionId: intervention.id, pipelineId, stageType },
        "Created new intervention after restart"
      );
    }

    // Broadcast so the UI shows the pending intervention
    broadcaster.broadcastToPipeline(pipelineId, {
      type: "intervention:requested",
      intervention: intervention as Intervention,
    });

    // Park a new promise — when resolved, advance the pipeline
    this.pending.set(intervention.id, {
      resolve: () => {
        /* no-op: post-restart resolution handled in resolveIntervention */
      },
      pipelineId,
      postRestart: true,
    });
  }

  /**
   * Resolve a pending intervention with the user's response.
   * Unparks the waiting stage handler.
   */
  resolveIntervention(id: string, response: string): void {
    const intervention = interventionRepo.resolve(id, response);
    if (!intervention) {
      log.warn({ interventionId: id }, "Intervention not found for resolution");
      return;
    }

    log.info(
      { interventionId: id, response: response.slice(0, 100) },
      "Intervention resolved"
    );

    broadcaster.broadcastToPipeline(intervention.pipelineId, {
      type: "intervention:resolved",
      intervention: intervention as Intervention,
    });

    const parked = this.pending.get(id);
    if (parked) {
      const isPostRestart = parked.postRestart;
      parked.resolve(response);
      this.pending.delete(id);

      // Post-restart interventions need to trigger pipeline advancement
      // since there's no stage handler waiting on the parked promise
      if (isPostRestart) {
        log.info(
          { interventionId: id, pipelineId: intervention.pipelineId },
          "Post-restart intervention resolved — advancing pipeline"
        );
        // Lazy import to avoid circular dependency
        import("../pipeline/engine.js").then(({ pipelineEngine }) => {
          pipelineEngine.advance(intervention.pipelineId).catch((err) => {
            log.error(
              { pipelineId: intervention.pipelineId, error: (err as Error).message },
              "Failed to advance pipeline after post-restart intervention"
            );
          });
        });
      }
    } else {
      log.warn(
        { interventionId: id },
        "No parked promise found — server may have restarted"
      );
    }
  }

  /**
   * Check if there are any parked interventions for a pipeline.
   */
  hasPending(pipelineId: string): boolean {
    for (const [, entry] of this.pending) {
      if (entry.pipelineId === pipelineId) {
        return true;
      }
    }
    return false;
  }
}

// Singleton
export const interventionManager = new InterventionManager();
