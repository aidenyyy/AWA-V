"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { AgentBadge } from "./agent-badge";
import { SkillBadges } from "./skill-badges";
import { ProgressBar } from "./progress-bar";
import { ModelBadge } from "./model-badge";
import { TokenBar } from "./token-bar";
import { CancelConfirmModal } from "../modals/cancel-confirm-modal";
import { api } from "@/lib/api-client";
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
}: PipelineCardProps) {
  const [showCancelModal, setShowCancelModal] = useState(false);

  const isTerminal = ["completed", "failed", "cancelled"].includes(pipeline.state);
  const isPaused = pipeline.state === "paused";
  const isActive = !isTerminal && !isPaused;

  const stateLabels: Record<string, string> = {
    requirements_input: "INPUT",
    plan_generation: "PLANNING",
    human_review: "PLANNING",
    adversarial_review: "PLANNING",
    context_prep: "PLANNING",
    parallel_execution: "EXECUTING",
    testing: "TESTING",
    code_review: "REVIEWING",
    git_integration: "GIT",
    evolution_capture: "EVOLVE",
    claude_md_evolution: "EVOLVE",
    completed: "DONE",
    failed: "FAILED",
    cancelled: "CANCELLED",
    paused: "PAUSED",
  };

  const requirementPreview =
    pipeline.requirements.length > 60
      ? pipeline.requirements.slice(0, 60) + "..."
      : pipeline.requirements;

  return (
    <>
    {showCancelModal && (
      <CancelConfirmModal
        onConfirm={async () => {
          setShowCancelModal(false);
          await api.cancelPipeline(pipeline.id);
        }}
        onClose={() => setShowCancelModal(false)}
      />
    )}
    <Link
      href={`/projects/${projectId}/pipelines/${pipeline.id}`}
      className={cn(
        "glass-card block p-3 cursor-pointer group",
        isActionRequired &&
          "border-neon-yellow/40 shadow-[0_0_16px_rgba(255,170,0,0.1)]"
      )}
    >
      {/* Header: indicator + title + model badge */}
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
                    : pipeline.state === "paused"
                      ? "indicator-warning"
                      : "indicator-running"
            )}
          />
          <span className="truncate text-xs font-medium text-text-primary">
            {requirementPreview}
          </span>
        </div>
        <ModelBadge model={pipeline.currentModel} />
      </div>

      {/* Action required banner */}
      {isActionRequired && (
        <div className="mb-2 rounded-md border border-neon-yellow/30 bg-neon-yellow/5 px-2 py-1 text-center">
          <span className="text-[10px] font-mono uppercase tracking-widest text-neon-yellow">
            Action Required
          </span>
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

      {/* Pipeline controls */}
      {!isTerminal && (
        <div className="mb-1.5 flex items-center gap-1">
          {isActive && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); api.pausePipeline(pipeline.id); }}
              className="rounded border border-neon-yellow/30 px-1.5 py-0.5 font-mono text-[9px] text-neon-yellow transition hover:bg-neon-yellow/10"
            >
              Pause
            </button>
          )}
          {isPaused && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); api.resumePipeline(pipeline.id); }}
              className="rounded border border-neon-green/30 px-1.5 py-0.5 font-mono text-[9px] text-neon-green transition hover:bg-neon-green/10"
            >
              Resume
            </button>
          )}
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowCancelModal(true); }}
            className="rounded border border-neon-red/30 px-1.5 py-0.5 font-mono text-[9px] text-neon-red transition hover:bg-neon-red/10"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Footer: token breakdown bar + elapsed */}
      <TokenBar breakdown={pipeline.tokenBreakdown} />
      <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-text-muted">
        <span>
          {inputTokens !== undefined && outputTokens !== undefined
            ? `${formatTokens(inputTokens)}↓ ${formatTokens(outputTokens)}↑`
            : `${formatTokens(pipeline.totalInputTokens)}↓ ${formatTokens(pipeline.totalOutputTokens)}↑`}
        </span>
        {elapsed && <span>{elapsed}</span>}
      </div>
    </Link>
    </>
  );
}
