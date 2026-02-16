import { memoryRepo } from "../db/repositories/memory-repo.js";
import pino from "pino";

const log = pino({ name: "memory-service" });

/**
 * Memory Service: provides deterministic cross-task context sharing (L1)
 * and project long-term memory in DB (L2).
 *
 * L1 is pure SQL queries + template concatenation with zero token cost.
 * L2 collects structured outputs for MVP; Claude-based summarization is Phase 2.
 */
class MemoryService {
  // ─── L1: Cross-task context sharing ──────────────────────────

  /**
   * Extract key information from a completed task's output and store it
   * as an L1 memory record for other tasks in the same pipeline to reference.
   */
  recordTaskOutput(
    projectId: string,
    pipelineId: string,
    taskId: string,
    output: string
  ): void {
    log.info({ projectId, pipelineId, taskId }, "Recording task output to L1 memory");

    // Extract structured information from the output.
    // For MVP, we store the full output as a "discovery" memory.
    // Future: use lightweight parsing to extract key decisions, file changes, etc.
    const discoveries = this.extractDiscoveries(output);
    const decisions = this.extractDecisions(output);
    const errors = this.extractErrors(output);

    if (discoveries) {
      memoryRepo.create({
        projectId,
        pipelineId,
        taskId,
        layer: "L1",
        type: "discovery",
        content: discoveries,
      });
    }

    if (decisions) {
      memoryRepo.create({
        projectId,
        pipelineId,
        taskId,
        layer: "L1",
        type: "decision",
        content: decisions,
      });
    }

    if (errors) {
      memoryRepo.create({
        projectId,
        pipelineId,
        taskId,
        layer: "L1",
        type: "error",
        content: errors,
      });
    }

    // Always store a compact summary as a pattern
    const summary = this.buildCompactSummary(output);
    if (summary) {
      memoryRepo.create({
        projectId,
        pipelineId,
        taskId,
        layer: "L1",
        type: "pattern",
        content: summary,
      });
    }
  }

  /**
   * Query relevant L1 memories for the current pipeline and format
   * them as a system prompt snippet. Zero token cost -- just SQL + templates.
   */
  getContextForTask(projectId: string, pipelineId: string): string | null {
    // Get L1 memories from this pipeline (cross-task context)
    const pipelineMemories = memoryRepo.getByPipeline(pipelineId)
      .filter((m) => m.layer === "L1");

    // Get L2 memories from the project (long-term context)
    const projectMemories = memoryRepo.getByLayer(projectId, "L2");

    if (pipelineMemories.length === 0 && projectMemories.length === 0) {
      return null;
    }

    const sections: string[] = [];

    // L2: Project-level context (from previous pipelines)
    if (projectMemories.length > 0) {
      sections.push("### Project Context (from previous work)");
      for (const mem of projectMemories.slice(-5)) {
        sections.push(`- [${mem.type}] ${mem.content}`);
      }
      sections.push("");
    }

    // L1: Cross-task context (from this pipeline)
    if (pipelineMemories.length > 0) {
      sections.push("### Context from Other Tasks in This Pipeline");

      // Group by type for readability
      const byType = new Map<string, typeof pipelineMemories>();
      for (const mem of pipelineMemories) {
        const existing = byType.get(mem.type) ?? [];
        existing.push(mem);
        byType.set(mem.type, existing);
      }

      for (const [type, memories] of byType) {
        sections.push(`\n**${type.charAt(0).toUpperCase() + type.slice(1)}s:**`);
        for (const mem of memories.slice(-10)) {
          sections.push(`- ${mem.content}`);
        }
      }
      sections.push("");
    }

    return sections.join("\n");
  }

  // ─── L2: Project long-term memory ────────────────────────────

  /**
   * Called after pipeline completion to persist learnings as L2 memory.
   * For MVP, this collects structured outputs from completed tasks.
   * Phase 2: call Claude to summarize patterns across pipeline results.
   */
  promotePipelineMemoriesToL2(projectId: string, pipelineId: string): string | null {
    log.info({ projectId, pipelineId }, "Promoting pipeline memories to L2");

    // Collect all L1 memories from this pipeline
    const memories = memoryRepo.getByPipeline(pipelineId)
      .filter((m) => m.layer === "L1");

    if (memories.length === 0) {
      log.info({ projectId, pipelineId }, "No L1 memories to promote");
      return null;
    }

    // Extract decisions and patterns worth persisting long-term
    const decisions = memories.filter((m) => m.type === "decision");
    const patterns = memories.filter((m) => m.type === "pattern");
    const errors = memories.filter((m) => m.type === "error");

    const promotedSections: string[] = [];

    if (decisions.length > 0) {
      promotedSections.push("## Key Decisions");
      for (const d of decisions) {
        promotedSections.push(`- ${d.content}`);
      }
    }

    if (patterns.length > 0) {
      promotedSections.push("## Patterns Observed");
      for (const p of patterns) {
        promotedSections.push(`- ${p.content}`);
      }
    }

    if (errors.length > 0) {
      promotedSections.push("## Known Issues");
      for (const e of errors) {
        promotedSections.push(`- ${e.content}`);
      }
    }

    if (promotedSections.length === 0) {
      return null;
    }

    const updateContent = promotedSections.join("\n");

    // Store as L2 memory for future pipelines
    memoryRepo.create({
      projectId,
      pipelineId,
      layer: "L2",
      type: "pattern",
      content: updateContent,
    });

    log.info(
      { projectId, pipelineId, memoriesPromoted: memories.length },
      "L1 memories promoted to L2"
    );

    return updateContent;
  }

  // ─── L3: Cross-project patterns ─────────────────────────────

  /**
   * Get L3 patterns that apply across projects.
   */
  getL3Patterns(projectId: string): string | null {
    const l3Memories = memoryRepo.getByLayer(projectId, "L3");
    if (l3Memories.length === 0) return null;

    const sections = ["### Cross-Project Patterns (L3)"];
    for (const mem of l3Memories.slice(-10)) {
      sections.push(`- [${mem.type}] ${mem.content}`);
    }
    return sections.join("\n");
  }

  /**
   * Promote a discovered pattern to L3 memory for cross-project use.
   */
  promoteToL3(projectId: string, pattern: string): void {
    log.info({ projectId }, "Promoting pattern to L3 memory");
    memoryRepo.create({
      projectId,
      layer: "L3",
      type: "pattern",
      content: pattern,
    });
  }

  // ─── Internal extraction helpers ─────────────────────────────

  /**
   * Extract discovery-type information from task output.
   * Discoveries are facts about the codebase, files found, APIs discovered, etc.
   */
  private extractDiscoveries(output: string): string | null {
    // Look for lines that indicate discoveries about the codebase
    const discoveryPatterns = [
      /(?:found|discovered|noticed|observed|identified)\s+(?:that\s+)?(.+)/gi,
      /(?:the\s+(?:codebase|project|repo)\s+(?:uses|has|contains))\s+(.+)/gi,
    ];

    const discoveries: string[] = [];
    for (const pattern of discoveryPatterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const discovery = match[1].trim();
        if (discovery.length > 10 && discovery.length < 500) {
          discoveries.push(discovery);
        }
      }
    }

    if (discoveries.length === 0) {
      return null;
    }

    // Deduplicate and limit
    const unique = [...new Set(discoveries)].slice(0, 5);
    return unique.join("; ");
  }

  /**
   * Extract decision-type information from task output.
   * Decisions are choices made during implementation.
   */
  private extractDecisions(output: string): string | null {
    const decisionPatterns = [
      /(?:decided\s+to|chose\s+to|opted\s+for|going\s+with|will\s+use)\s+(.+)/gi,
      /(?:instead\s+of\s+.+,?\s+)(?:I(?:'ll)?\s+)?(?:use|went\s+with)\s+(.+)/gi,
    ];

    const decisions: string[] = [];
    for (const pattern of decisionPatterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const decision = match[1].trim();
        if (decision.length > 10 && decision.length < 500) {
          decisions.push(decision);
        }
      }
    }

    if (decisions.length === 0) {
      return null;
    }

    const unique = [...new Set(decisions)].slice(0, 5);
    return unique.join("; ");
  }

  /**
   * Extract error information from task output.
   */
  private extractErrors(output: string): string | null {
    const errorPatterns = [
      /(?:error|failed|issue|problem|bug):\s*(.+)/gi,
      /(?:couldn't|cannot|unable\s+to)\s+(.+)/gi,
    ];

    const errors: string[] = [];
    for (const pattern of errorPatterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const error = match[1].trim();
        if (error.length > 10 && error.length < 500) {
          errors.push(error);
        }
      }
    }

    if (errors.length === 0) {
      return null;
    }

    const unique = [...new Set(errors)].slice(0, 3);
    return unique.join("; ");
  }

  /**
   * Build a compact summary of what a task did, for cross-task context.
   */
  private buildCompactSummary(output: string): string | null {
    // Take the first meaningful paragraph as a summary
    const lines = output.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      return null;
    }

    // Look for summary-like lines first
    const summaryLine = lines.find(
      (l) =>
        l.toLowerCase().includes("summary") ||
        l.toLowerCase().includes("completed") ||
        l.toLowerCase().includes("implemented") ||
        l.toLowerCase().includes("created") ||
        l.toLowerCase().includes("updated")
    );

    if (summaryLine) {
      return summaryLine.trim().slice(0, 500);
    }

    // Fallback: use the last non-empty line (often a conclusion)
    const lastLine = lines[lines.length - 1].trim();
    if (lastLine.length > 20) {
      return lastLine.slice(0, 500);
    }

    return null;
  }
}

// Singleton
export const memoryService = new MemoryService();
