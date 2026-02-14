"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { useSubscribeToPipeline } from "@/hooks/use-websocket";
import { usePipelineStore } from "@/stores/pipeline-store";
import { PlanReviewPanel } from "@/components/plan/plan-review-panel";
import { ClaudeStreamViewer } from "@/components/stream/claude-stream-viewer";
import { ProgressBar } from "@/components/kanban/progress-bar";
import { CostBadge } from "@/components/layout/cost-badge";
import { cn } from "@/lib/cn";
import type { Pipeline, Plan, Stage, Task } from "@awa-v/shared";

interface PipelineDetail extends Pipeline {
  stages: (Stage & { tasks: Task[] })[];
  plans: Plan[];
}

const STAGE_LABELS: Record<string, string> = {
  requirements_input: "Requirements",
  plan_generation: "Planning",
  human_review: "Human Review",
  adversarial_review: "Adversarial Review",
  skill_distribution: "Skill Distribution",
  memory_injection: "Memory Injection",
  parallel_execution: "Execution",
  testing: "Testing",
  code_review: "Code Review",
  git_integration: "Git Integration",
  evolution_capture: "Evolution Capture",
  claude_md_evolution: "CLAUDE.md Evolution",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export default function PipelineDetailPage() {
  const params = useParams();
  const pipelineId = params.pipelineId as string;
  const projectId = params.projectId as string;
  const [detail, setDetail] = useState<PipelineDetail | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useSubscribeToPipeline(pipelineId);

  const pipeline = usePipelineStore((s) => s.pipelines[pipelineId]);

  useEffect(() => {
    api.getPipeline(pipelineId).then((d) => setDetail(d as PipelineDetail));
  }, [pipelineId]);

  const currentPipeline = pipeline ?? detail;
  if (!currentPipeline) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="indicator indicator-running" />
        <span className="ml-2 font-mono text-sm text-text-muted">Loading...</span>
      </div>
    );
  }

  const latestPlan = detail?.plans?.[0];
  const isReviewState = currentPipeline.state === "human_review";

  return (
    <div className="flex h-full">
      {/* Left: Pipeline flow */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Pipeline header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="font-mono text-sm font-semibold text-text-primary">
              Pipeline Detail
            </h2>
            <p className="mt-1 text-xs text-text-muted font-mono max-w-lg truncate">
              {currentPipeline.requirements}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <CostBadge costUsd={currentPipeline.totalCostUsd} size="md" />
            <span
              className={cn(
                "rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-widest",
                currentPipeline.state === "completed"
                  ? "border-neon-green/30 text-neon-green"
                  : currentPipeline.state === "failed"
                    ? "border-neon-red/30 text-neon-red"
                    : "border-neon-cyan/30 text-neon-cyan"
              )}
            >
              {STAGE_LABELS[currentPipeline.state] ?? currentPipeline.state}
            </span>
          </div>
        </div>

        {/* Stage flow visualization */}
        <div className="mb-8">
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {detail?.stages?.map((stage, i) => (
              <div key={stage.id} className="flex items-center">
                <div
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-2 font-mono text-[10px] transition",
                    stage.state === "passed"
                      ? "border-neon-green/30 bg-neon-green/5 text-neon-green"
                      : stage.state === "running"
                        ? "border-neon-cyan/30 bg-neon-cyan/5 text-neon-cyan"
                        : stage.state === "failed"
                          ? "border-neon-red/30 bg-neon-red/5 text-neon-red"
                          : "border-border bg-surface/30 text-text-muted"
                  )}
                >
                  <span
                    className={cn(
                      "indicator",
                      stage.state === "passed"
                        ? "indicator-active"
                        : stage.state === "running"
                          ? "indicator-running"
                          : stage.state === "failed"
                            ? "indicator-error"
                            : "indicator-idle"
                    )}
                  />
                  {STAGE_LABELS[stage.type] ?? stage.type}
                </div>
                {i < (detail?.stages?.length ?? 0) - 1 && (
                  <div
                    className={cn(
                      "mx-1 h-px w-6",
                      stage.state === "passed"
                        ? "data-flow-line"
                        : "bg-border"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Plan review (when in human_review state) */}
        {isReviewState && latestPlan && (
          <PlanReviewPanel
            planId={latestPlan.id}
            content={latestPlan.content}
            taskBreakdown={latestPlan.taskBreakdown as any[]}
            version={latestPlan.version}
            adversarialFeedback={latestPlan.adversarialFeedback}
          />
        )}

        {/* Tasks */}
        {detail?.stages?.some((s) => s.tasks.length > 0) && (
          <div className="mt-6">
            <h3 className="mb-3 font-mono text-xs uppercase tracking-wider text-text-muted">
              Tasks
            </h3>
            <div className="grid gap-2">
              {detail.stages.flatMap((s) =>
                s.tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() =>
                      setSelectedTaskId(
                        selectedTaskId === task.id ? null : task.id
                      )
                    }
                    className={cn(
                      "glass-card w-full p-3 text-left transition",
                      selectedTaskId === task.id && "border-neon-cyan/40"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "indicator",
                            task.state === "completed"
                              ? "indicator-active"
                              : task.state === "running"
                                ? "indicator-running"
                                : task.state === "failed"
                                  ? "indicator-error"
                                  : "indicator-idle"
                          )}
                        />
                        <span className="font-mono text-xs text-text-primary">
                          {task.agentRole}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-text-muted uppercase">
                        {task.state}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right: Stream viewer */}
      {selectedTaskId && (
        <div className="w-[480px] border-l border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-xs text-text-secondary">
              Live Output
            </span>
            <button
              onClick={() => setSelectedTaskId(null)}
              className="text-text-muted hover:text-text-primary text-sm"
            >
              x
            </button>
          </div>
          <ClaudeStreamViewer taskId={selectedTaskId} />
        </div>
      )}
    </div>
  );
}
