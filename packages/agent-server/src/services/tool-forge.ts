import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generatedToolRepo } from "../db/repositories/generated-tool-repo.js";
import { consultationManager } from "./consultation-manager.js";
import { processManager } from "../claude/process-manager.js";
import { TOOL_SMITH_PROMPT } from "../prompts/tool-smith.js";
import type { SkillPack, StreamChunk } from "@awa-v/shared";
import pino from "pino";

const log = pino({ name: "tool-forge" });

/**
 * Tool Forge — Dynamic MCP tool generation.
 *
 * When skill distributor returns an empty/insufficient skill pack for a task,
 * Tool Forge spawns a Claude session (haiku, maxTurns=2) to generate an MCP
 * tool plugin. The plugin is written to a temp directory and injected via
 * --plugin-dir. Tools are cleaned up on pipeline terminal state.
 */
class ToolForge {
  /**
   * Check if the current skill pack is sufficient.
   * If not, forge a new tool using Claude (haiku, maxTurns=2).
   * Returns augmented SkillPack with the forged tool's pluginDir added.
   */
  async forgeIfNeeded(opts: {
    pipelineId: string;
    taskId: string;
    taskDescription: string;
    agentRole: string;
    domain: string;
    currentSkillPack: SkillPack;
    repoPath: string;
  }): Promise<SkillPack> {
    // If skills already cover the task domain, return as-is
    if (opts.currentSkillPack.skills.length > 0) {
      return opts.currentSkillPack;
    }

    log.info(
      { pipelineId: opts.pipelineId, taskId: opts.taskId, domain: opts.domain },
      "Skill pack empty — forging tool"
    );

    try {
      const forged = await this.generateTool(opts);
      if (!forged) {
        log.warn({ pipelineId: opts.pipelineId, taskId: opts.taskId }, "Tool forge produced no output");
        return opts.currentSkillPack;
      }

      // Emit consultation to inform user
      consultationManager.requestConsultation({
        pipelineId: opts.pipelineId,
        taskId: opts.taskId,
        stageType: "parallel_execution",
        question: `Forged tool "${forged.name}" for task "${opts.taskDescription.slice(0, 80)}". Is this appropriate?`,
        context: { toolName: forged.name, description: forged.description, domain: opts.domain },
      });

      // Augment skill pack with forged tool's plugin dir
      return {
        ...opts.currentSkillPack,
        pluginDirs: [...opts.currentSkillPack.pluginDirs, forged.pluginDir],
      };
    } catch (err) {
      log.error(
        { pipelineId: opts.pipelineId, taskId: opts.taskId, error: (err as Error).message },
        "Tool forge failed"
      );
      return opts.currentSkillPack;
    }
  }

  /** Clean up generated tool directories for a pipeline */
  cleanup(pipelineId: string): void {
    const tools = generatedToolRepo.getByPipeline(pipelineId);
    for (const tool of tools) {
      try {
        if (existsSync(tool.pluginDir)) {
          rmSync(tool.pluginDir, { recursive: true, force: true });
        }
      } catch (err) {
        log.warn(
          { pluginDir: tool.pluginDir, error: (err as Error).message },
          "Could not clean up forged tool directory"
        );
      }
    }
    generatedToolRepo.deleteByPipeline(pipelineId);
    log.info({ pipelineId, count: tools.length }, "Cleaned up forged tools");
  }

  // ─── Private ─────────────────────────────────────────────────

  private async generateTool(opts: {
    pipelineId: string;
    taskId: string;
    taskDescription: string;
    agentRole: string;
    repoPath: string;
  }): Promise<{ name: string; description: string; pluginDir: string } | null> {
    const forgePrompt = [
      "Create an MCP tool plugin for the following task:\n\n",
      `Task: ${opts.taskDescription}\n`,
      `Agent Role: ${opts.agentRole}\n`,
      "\nGenerate a minimal, focused tool that helps accomplish this task.",
    ].join("");

    const sessionId = `forge-${opts.pipelineId}-${opts.taskId}-${Date.now()}`;

    const proc = processManager.spawn(sessionId, {
      prompt: forgePrompt,
      cwd: opts.repoPath,
      pipelineId: opts.pipelineId,
      model: "haiku",
      permissionMode: "auto",
      systemPrompt: TOOL_SMITH_PROMPT,
      maxTurns: 2,
    });

    return new Promise<{ name: string; description: string; pluginDir: string } | null>((resolve) => {
      let output = "";

      proc.events.on("chunk", (chunk: StreamChunk) => {
        if (chunk.type === "assistant:text") {
          output += chunk.text;
        }

        if (chunk.type === "done") {
          try {
            const parsed = this.parseForgeOutput(output);
            if (!parsed) {
              resolve(null);
              return;
            }

            // Write to temp directory
            const pluginDir = join(
              tmpdir(),
              "awa-v-forge",
              opts.pipelineId,
              parsed.name
            );
            mkdirSync(pluginDir, { recursive: true });
            writeFileSync(join(pluginDir, "index.js"), parsed.sourceCode);

            // Record in DB
            generatedToolRepo.create({
              pipelineId: opts.pipelineId,
              taskId: opts.taskId,
              name: parsed.name,
              description: parsed.description,
              pluginDir,
              sourceCode: parsed.sourceCode,
            });

            log.info(
              { pipelineId: opts.pipelineId, toolName: parsed.name, pluginDir },
              "Tool forged successfully"
            );

            resolve({ name: parsed.name, description: parsed.description, pluginDir });
          } catch (err) {
            log.warn(
              { pipelineId: opts.pipelineId, error: (err as Error).message },
              "Could not parse forge output"
            );
            resolve(null);
          }
        }
      });

      proc.events.on("error", () => {
        resolve(null);
      });
    });
  }

  private parseForgeOutput(
    raw: string
  ): { name: string; description: string; sourceCode: string } | null {
    let jsonStr = raw.trim();
    const m = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (m) jsonStr = m[1].trim();

    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed.name || !parsed.sourceCode) {
        return null;
      }
      return {
        name: String(parsed.name),
        description: String(parsed.description ?? ""),
        sourceCode: String(parsed.sourceCode),
      };
    } catch {
      return null;
    }
  }
}

// Singleton
export const toolForge = new ToolForge();
