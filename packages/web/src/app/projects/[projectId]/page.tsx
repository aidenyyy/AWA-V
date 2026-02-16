"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { ArchivedPipelinesModal } from "@/components/modals/archived-pipelines-modal";
import { api } from "@/lib/api-client";
import { usePipelineStore } from "@/stores/pipeline-store";
import type { Pipeline } from "@awa-v/shared";
import { useShallow } from "zustand/react/shallow";

export default function ProjectKanbanPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const [loading, setLoading] = useState(true);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const setPipelines = usePipelineStore((s) => s.setPipelines);
  const pipelineMap = usePipelineStore(useShallow((s) => s.pipelines));
  const pipelines = useMemo(() => {
    return Object.values(pipelineMap).filter(
      (p) =>
        p.projectId === projectId &&
        p.state !== "failed" &&
        p.state !== "cancelled"
    );
  }, [pipelineMap, projectId]);

  useEffect(() => {
    api
      .getPipelines(projectId)
      .then((data) => {
        setPipelines(data as Pipeline[]);
      })
      .finally(() => setLoading(false));
  }, [projectId, setPipelines]);

  useEffect(() => {
    if (searchParams.get("archived") === "1") {
      setArchivedOpen(true);
    }
  }, [searchParams]);

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

  return (
    <>
      <ArchivedPipelinesModal
        open={archivedOpen}
        projectId={projectId}
        onClose={() => {
          setArchivedOpen(false);
          router.replace(`/projects/${projectId}`);
        }}
        onChanged={() => {
          api.getPipelines(projectId).then((data) => setPipelines(data as Pipeline[]));
        }}
      />
      <div className="h-full">
        <KanbanBoard pipelines={pipelines} projectId={projectId} />
      </div>
    </>
  );
}
