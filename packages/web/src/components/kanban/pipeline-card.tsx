"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { AgentBadge } from "./agent-badge";
import { SkillBadges } from "./skill-badges";
import { ProgressBar } from "./progress-bar";
import { CostBadge } from "../layout/cost-badge";
import { InterventionBadge } from "../intervention/intervention-badge";
import { useInterventionStore } from "@/stores/intervention-store";
import type { Pipeline } from "@awa-v/shared";

interface PipelineCardProps {
  pipeline: Pipeline;
  projectId: string;
  agentRole?: string;
  agentState?: string;
  skills?: string[];
  activeSkills?: string[];
  progress?: number;
  inputTokens?: number;
  outputTokens?: number;
  elapsed?: string;
  isActionRequired?: boolean;
  pendingInterventionCount?: number;
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function PipelineCard({
  pipeline,
  projectId,
  agentRole = "orchestrator",
  agentState = "running",
  skills = [],
  activeSkills = [],
  progress = 0,
  inputTokens,
  outputTokens,
  elapsed,
  isActionRequired = false,
  pendingInterventionCount = 0,
}: PipelineCardProps) {
  const openPanel = useInterventionStore((s) => s.openPanel);
  const stateLabels: Record<string, string> = {
    requirements_input: "INPUT",
    plan_generation: "PLANNING",
    human_review: "REVIEW",
    adversarial_review: "ADVERSARIAL",
    skill_distribution: "SKILLS",
    memory_injection: "MEMORY",
    parallel_execution: "EXECUTING",
    testing: "TESTING",
    code_review: "REVIEWING",
    git_integration: "GIT",
    evolution_capture: "EVOLVE",
    claude_md_evolution: "EVOLVE",
    completed: "DONE",
    failed: "FAILED",
    cancelled: "CANCELLED",
  };

  const requirementPreview =
    pipeline.requirements.length > 60
      ? pipeline.requirements.slice(0, 60) + "..."
      : pipeline.requirements;

  return (
    <Link
      href={`/projects/${projectId}/pipelines/${pipeline.id}`}
      className={cn(
        "glass-card block p-3 cursor-pointer group",
        isActionRequired &&
          "border-neon-yellow/40 shadow-[0_0_16px_rgba(255,170,0,0.1)]"
      )}
    >
      {/* Header: indicator + title + cost */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "indicator flex-shrink-0",
              pipeline.state === "completed"
                ? "indicator-active"
                : pipeline.state === "failed"
                  ? "indicator-error"
                  : pipeline.state === "human_review"
                    ? "indicator-warning"
                    : "indicator-running"
            )}
          />
          <span className="truncate text-xs font-medium text-text-primary">
            {requirementPreview}
          </span>
        </div>
        <CostBadge costUsd={pipeline.totalCostUsd} />
      </div>

      {/* Action required banner */}
      {isActionRequired && (
        <div className="mb-2 rounded-md border border-neon-yellow/30 bg-neon-yellow/5 px-2 py-1 text-center">
          <span className="text-[10px] font-mono uppercase tracking-widest text-neon-yellow">
            Action Required
          </span>
        </div>
      )}

      {/* Intervention badge */}
      {pendingInterventionCount > 0 && (
        <div className="mb-2">
          <InterventionBadge
            pipelineId={pipeline.id}
            pendingCount={pendingInterventionCount}
            onRespond={() => openPanel(pipeline.id)}
          />
        </div>
      )}

      {/* Agent + State */}
      <div className="mb-2 flex items-center justify-between">
        <AgentBadge role={agentRole} state={agentState} />
        <span className="text-[10px] font-mono uppercase tracking-widest text-text-muted">
          {stateLabels[pipeline.state] ?? pipeline.state}
        </span>
      </div>

      {/* Skill badges */}
      {skills.length > 0 && (
        <div className="mb-2">
          <SkillBadges skills={skills} activeSkills={activeSkills} />
        </div>
      )}

      {/* Progress bar */}
      <div className="mb-1.5">
        <ProgressBar
          progress={progress}
          variant={
            pipeline.state === "completed"
              ? "green"
              : pipeline.state === "failed"
                ? "magenta"
                : "cyan"
          }
        />
      </div>

      {/* Footer: tokens + elapsed */}
      <div className="flex items-center justify-between text-[10px] font-mono text-text-muted">
        <span>
          {inputTokens !== undefined && outputTokens !== undefined
            ? `${formatTokens(inputTokens)}↓ ${formatTokens(outputTokens)}↑`
            : `${formatTokens(pipeline.totalInputTokens)}↓ ${formatTokens(pipeline.totalOutputTokens)}↑`}
        </span>
        {elapsed && <span>⏱ {elapsed}</span>}
      </div>
    </Link>
  );
}
