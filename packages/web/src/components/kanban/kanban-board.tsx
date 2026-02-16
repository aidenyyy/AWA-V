"use client";

import { useMemo } from "react";
import { KanbanColumn } from "./kanban-column";
import { PipelineCard } from "./pipeline-card";
import { PipelineState } from "@awa-v/shared";
import type { Pipeline } from "@awa-v/shared";

interface KanbanBoardProps {
  pipelines: Pipeline[];
  projectId: string;
}

const COLUMNS = [
  {
    key: PipelineState.PLAN_GENERATION,
    title: "Planning",
    accent: "border-neon-cyan",
    states: [
      PipelineState.PLAN_GENERATION,
      PipelineState.HUMAN_REVIEW,
      PipelineState.ADVERSARIAL_REVIEW,
      PipelineState.CONTEXT_PREP,
    ],
    isAction: true,
  },
  {
    key: PipelineState.PARALLEL_EXECUTION,
    title: "Execution",
    accent: "border-neon-green",
  },
  {
    key: PipelineState.TESTING,
    title: "Testing",
    accent: "border-neon-cyan",
  },
  {
    key: PipelineState.CODE_REVIEW,
    title: "Review",
    accent: "border-neon-magenta",
  },
  {
    key: PipelineState.GIT_INTEGRATION,
    title: "Git",
    accent: "border-neon-blue",
  },
  {
    key: "done",
    title: "Done",
    accent: "border-neon-green",
    states: [
      PipelineState.EVOLUTION_CAPTURE,
      PipelineState.CLAUDE_MD_EVOLUTION,
      PipelineState.COMPLETED,
    ],
  },
] as const;

export function KanbanBoard({ pipelines, projectId }: KanbanBoardProps) {
  const columns = useMemo(() => {
    return COLUMNS.map((col) => {
      const states = "states" in col ? col.states : [col.key];
      const items = pipelines.filter((p) =>
        (states as string[]).includes(p.state)
      );
      return { ...col, items };
    });
  }, [pipelines]);

  // Also show paused in a special area
  const pausedPipelines = pipelines.filter(
    (p) => p.state === "paused"
  );

  return (
    <div className="flex h-full gap-3 overflow-x-auto p-4">
      {columns.map((col) => (
        <KanbanColumn
          key={col.key}
          title={col.title}
          count={col.items.length}
          accentColor={col.accent}
          isActionColumn={"isAction" in col && col.isAction}
        >
          {col.items.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-8">
              <span className="font-mono text-[10px] text-text-muted/50">&mdash;</span>
            </div>
          ) : (
            col.items.map((pipeline) => (
              <PipelineCard
                key={pipeline.id}
                pipeline={pipeline}
                projectId={projectId}
                isActionRequired={pipeline.state === "human_review"}
                progress={estimateProgress(pipeline.state)}
              />
            ))
          )}
        </KanbanColumn>
      ))}

      {/* Paused column */}
      {pausedPipelines.length > 0 && (
        <KanbanColumn
          title="Paused"
          count={pausedPipelines.length}
          accentColor="border-neon-yellow"
        >
          {pausedPipelines.map((pipeline) => (
            <PipelineCard
              key={pipeline.id}
              pipeline={pipeline}
              projectId={projectId}
              progress={0}
            />
          ))}
        </KanbanColumn>
      )}

    </div>
  );
}

function estimateProgress(state: string): number {
  const progressMap: Record<string, number> = {
    requirements_input: 5,
    plan_generation: 25,
    human_review: 25,
    adversarial_review: 25,
    context_prep: 25,
    parallel_execution: 60,
    testing: 75,
    code_review: 85,
    git_integration: 92,
    evolution_capture: 96,
    claude_md_evolution: 98,
    completed: 100,
    failed: 0,
    cancelled: 0,
    paused: 0,
  };
  return progressMap[state] ?? 0;
}
