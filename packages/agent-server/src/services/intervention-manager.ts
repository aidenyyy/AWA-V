import { interventionRepo } from "../db/repositories/intervention-repo.js";
import { broadcaster } from "../ws/broadcaster.js";
import { selfHealer } from "../pipeline/self-healing.js";
import type { Intervention } from "@awa-v/shared";
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
    { resolve: (response: string) => void; pipelineId: string }
  >();

  /**
   * Request human intervention. Parks the current execution until a user responds.
   * Returns the user's response string.
   */
  async requestIntervention(opts: {
    pipelineId: string;
    stageType: string;
    question: string;
    context: Record<string, unknown>;
  }): Promise<string> {
    // Clear the stage timeout — human decisions can take hours
    selfHealer.clearTimeout(opts.pipelineId);

    const intervention = interventionRepo.create({
      pipelineId: opts.pipelineId,
      stageType: opts.stageType,
      question: opts.question,
      context: JSON.stringify(opts.context),
    });

    log.info(
      {
        interventionId: intervention.id,
        pipelineId: opts.pipelineId,
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
      parked.resolve(response);
      this.pending.delete(id);
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
