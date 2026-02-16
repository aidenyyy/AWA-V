"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { api } from "@/lib/api-client";
import { usePipelineStore } from "@/stores/pipeline-store";
import type { Pipeline } from "@awa-v/shared";
import { useShallow } from "zustand/react/shallow";

export default function ProjectKanbanPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [loading, setLoading] = useState(true);
  const setPipelines = usePipelineStore((s) => s.setPipelines);
  const pipelineMap = usePipelineStore(useShallow((s) => s.pipelines));
  const pipelines = useMemo(
    () => Object.values(pipelineMap).filter((p) => p.projectId === projectId),
    [pipelineMap, projectId]
  );

  useEffect(() => {
    api
      .getPipelines(projectId)
      .then((data) => {
        setPipelines(data as Pipeline[]);
      })
      .finally(() => setLoading(false));
  }, [projectId, setPipelines]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3">
          <span className="indicator indicator-running" />
          <span className="font-mono text-sm text-text-muted">
            Loading pipelines...
          </span>
        </div>
      </div>
    );
  }

  if (pipelines.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="glass-card max-w-md p-12 text-center">
          <div className="mb-4 text-5xl opacity-20">▣</div>
          <h3 className="font-mono text-sm font-semibold text-text-primary mb-2">
            No Pipelines
          </h3>
          <p className="text-xs text-text-muted font-mono mb-6">
            Start a new pipeline to begin AI-driven development
          </p>
          <a
            href={`/projects/${projectId}/pipelines/new`}
            className="inline-block rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 px-4 py-2.5 font-mono text-xs text-neon-cyan transition hover:bg-neon-cyan/20 hover:shadow-[0_0_16px_rgba(0,240,255,0.15)]"
          >
            + New Pipeline
          </a>
        </div>
      </div>
    );
  }

  return <KanbanBoard pipelines={pipelines} projectId={projectId} />;
}
