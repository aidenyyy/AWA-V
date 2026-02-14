import type { SkillPack } from "@awa-v/shared";

export interface PromptContext {
  role: string;
  requirements: string;
  planContent?: string;
  taskDescription?: string;
  memoryContext?: string;
  skillInstructions?: string;
  repoPath: string;
  additionalInstructions?: string;
}

/**
 * Build the system prompt for a Claude CLI invocation based on role and context.
 */
export function buildPrompt(ctx: PromptContext): string {
  const sections: string[] = [];

  sections.push(`# Role: ${ctx.role}`);
  sections.push("");

  if (ctx.memoryContext) {
    sections.push("## Context from Previous Tasks");
    sections.push(ctx.memoryContext);
    sections.push("");
  }

  if (ctx.skillInstructions) {
    sections.push("## Skill Instructions");
    sections.push(ctx.skillInstructions);
    sections.push("");
  }

  sections.push("## Requirements");
  sections.push(ctx.requirements);
  sections.push("");

  if (ctx.planContent) {
    sections.push("## Plan");
    sections.push(ctx.planContent);
    sections.push("");
  }

  if (ctx.taskDescription) {
    sections.push("## Your Task");
    sections.push(ctx.taskDescription);
    sections.push("");
  }

  if (ctx.additionalInstructions) {
    sections.push("## Additional Instructions");
    sections.push(ctx.additionalInstructions);
    sections.push("");
  }

  sections.push(`## Working Directory: ${ctx.repoPath}`);

  return sections.join("\n");
}

/** Build CLI args for skill pack injection */
export function buildSkillArgs(skillPack: SkillPack): string[] {
  const args: string[] = [];
  for (const dir of skillPack.pluginDirs) {
    args.push("--plugin-dir", dir);
  }
  return args;
}
