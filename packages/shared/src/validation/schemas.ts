import { z } from "zod";

// ─── Project ────────────────────────────────────────────────

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  repoPath: z.string().min(1),
  model: z.string().default("sonnet"),
  maxBudgetUsd: z.number().positive().default(10),
  permissionMode: z.string().default("default"),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  model: z.string().optional(),
  maxBudgetUsd: z.number().positive().optional(),
  permissionMode: z.string().optional(),
});

// ─── Pipeline ───────────────────────────────────────────────

export const createPipelineSchema = z.object({
  projectId: z.string().min(1),
  requirements: z.string().min(1).max(50000),
});

// ─── Plan Review ────────────────────────────────────────────

export const planReviewSchema = z.object({
  decision: z.enum(["approve", "edit", "reject"]),
  feedback: z.string().max(10000).optional(),
});

// ─── Skills ─────────────────────────────────────────────────

export const importSkillSchema = z.object({
  sourceUrl: z.string().url().optional(),
  githubUrl: z.string().url().optional(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string()).optional(),
  instructions: z.string().max(10000).optional(),
});

export const approveSkillSchema = z.object({
  skillId: z.string().min(1),
});

export const skillManifestSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  instructions: z.string(),
  pluginDir: z.string().optional(),
  version: z.string().optional(),
});

export const marketplaceManifestSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  skills: z.array(skillManifestSchema),
});

// ─── Task Breakdown ─────────────────────────────────────────

export const planTaskBreakdownSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  agentRole: z.string().min(1),
  domain: z.string().min(1),
  dependsOn: z.array(z.string()),
  canParallelize: z.boolean(),
  complexity: z.enum(["low", "medium", "high"]).default("medium"),
});

// ─── WebSocket ──────────────────────────────────────────────

export const clientEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("subscribe:pipeline"),
    pipelineId: z.string(),
  }),
  z.object({
    type: z.literal("unsubscribe:pipeline"),
    pipelineId: z.string(),
  }),
  z.object({
    type: z.literal("subscribe:project"),
    projectId: z.string(),
  }),
  z.object({
    type: z.literal("unsubscribe:project"),
    projectId: z.string(),
  }),
]);
