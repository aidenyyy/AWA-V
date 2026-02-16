import { consultationRepo } from "../db/repositories/consultation-repo.js";
import { memoryRepo } from "../db/repositories/memory-repo.js";
import { pipelineRepo } from "../db/repositories/pipeline-repo.js";
import { broadcaster } from "../ws/broadcaster.js";
import { selfHealer } from "../pipeline/self-healing.js";
import type { Consultation } from "@awa-v/shared";
import pino from "pino";

const log = pino({ name: "consultation-manager" });

/**
 * ConsultationManager handles two patterns:
 *
 * 1. [CONSULT] — Non-blocking, fire-and-forget.
 *    Agent continues working. User answer stored as L1 memory for future tasks.
 *
 * 2. [BLOCK] — Blocking, promise-parking.
 *    Execution parks until user answers. Same semantics as InterventionManager.
 */
class ConsultationManager {
  private pending = new Map<
    string,
    { resolve: (response: string) => void; pipelineId: string }
  >();

  /**
   * NON-BLOCKING (consult): Emit a question, return immediately.
   * User answer stored as L1 memory for future tasks.
   */
  requestConsultation(opts: {
    pipelineId: string;
    taskId?: string;
    stageType: string;
    question: string;
    context: Record<string, unknown>;
  }): void {
    const consultation = consultationRepo.create({
      pipelineId: opts.pipelineId,
      taskId: opts.taskId,
      stageType: opts.stageType,
      question: opts.question,
      context: JSON.stringify(opts.context),
      blocking: 0,
    });

    log.info(
      { consultationId: consultation.id, pipelineId: opts.pipelineId, blocking: false },
      "Non-blocking consultation requested"
    );

    broadcaster.broadcastToPipeline(opts.pipelineId, {
      type: "consultation:requested",
      consultation: consultation as Consultation,
    });
  }

  /**
   * BLOCKING (block): Emit a question and PARK execution.
   * Returns user's response string. Clears stage timeout while parked.
   */
  async requestBlock(opts: {
    pipelineId: string;
    taskId?: string;
    stageType: string;
    question: string;
    context: Record<string, unknown>;
  }): Promise<string> {
    selfHealer.clearTimeout(opts.pipelineId);

    const consultation = consultationRepo.create({
      pipelineId: opts.pipelineId,
      taskId: opts.taskId,
      stageType: opts.stageType,
      question: opts.question,
      context: JSON.stringify(opts.context),
      blocking: 1,
    });

    log.info(
      { consultationId: consultation.id, pipelineId: opts.pipelineId, blocking: true },
      "Blocking consultation requested — timeout cleared"
    );

    broadcaster.broadcastToPipeline(opts.pipelineId, {
      type: "consultation:requested",
      consultation: consultation as Consultation,
    });

    return new Promise<string>((resolve) => {
      this.pending.set(consultation.id, { resolve, pipelineId: opts.pipelineId });
    });
  }

  /**
   * Answer a consultation. For non-blocking: store as L1 memory.
   * For blocking: unpark execution AND store as L1 memory.
   */
  answerConsultation(id: string, response: string): void {
    const consultation = consultationRepo.answer(id, response);
    if (!consultation) {
      log.warn({ consultationId: id }, "Consultation not found for answering");
      return;
    }

    log.info(
      { consultationId: id, response: response.slice(0, 100), blocking: !!consultation.blocking },
      "Consultation answered"
    );

    broadcaster.broadcastToPipeline(consultation.pipelineId, {
      type: "consultation:answered",
      consultation: consultation as Consultation,
    });

    // Store as L1 decision memory
    const pipeline = pipelineRepo.getById(consultation.pipelineId);
    if (pipeline) {
      memoryRepo.create({
        projectId: pipeline.projectId,
        pipelineId: consultation.pipelineId,
        taskId: consultation.taskId ?? undefined,
        layer: "L1",
        type: "decision",
        content: `[CONSULTATION] Q: ${consultation.question}\nA: ${response}`,
      });
    }

    // Unpark blocking consultation
    const parked = this.pending.get(id);
    if (parked) {
      parked.resolve(response);
      this.pending.delete(id);
    }
  }

  /** Expire all pending consultations for a pipeline (on terminal state) */
  expireForPipeline(pipelineId: string): void {
    consultationRepo.expireForPipeline(pipelineId);

    // Clean up any parked promises
    for (const [id, entry] of this.pending) {
      if (entry.pipelineId === pipelineId) {
        entry.resolve("expired");
        this.pending.delete(id);
      }
    }

    log.info({ pipelineId }, "Expired pending consultations");
  }
}

// Singleton
export const consultationManager = new ConsultationManager();
