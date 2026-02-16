"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { useWebSocket, useSubscribeToProject } from "@/hooks/use-websocket";
import { api } from "@/lib/api-client";
import type { Project } from "@awa-v/shared";
import Link from "next/link";

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useWebSocket();
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState(false);

  useSubscribeToProject(projectId);

  useEffect(() => {
    api
      .getProject(projectId)
      .then((p) => setProject(p as Project))
      .catch(() => setError(true));
  }, [projectId]);

  if (error) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="ml-16 flex flex-1 flex-col items-center justify-center">
          <div className="glass-card p-8 text-center">
            <div className="text-4xl mb-4 opacity-20">&#9670;</div>
            <h2 className="font-mono text-sm font-semibold text-text-primary mb-2">
              Project not found
            </h2>
            <p className="text-xs text-text-muted font-mono mb-4">
              The project you&apos;re looking for doesn&apos;t exist or has been deleted.
            </p>
            <Link
              href="/"
              className="rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 px-4 py-2 font-mono text-xs text-neon-cyan transition hover:bg-neon-cyan/20"
            >
              Back to Dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="ml-16 flex flex-1 flex-col">
        <Header
          title={
            <span className="flex items-center gap-2">
              {project?.name ?? "Loading..."}
              {project?.isSelfRepo === 1 && (
                <span className="rounded border border-neon-magenta/30 px-1 py-0.5 text-[9px] font-mono text-neon-magenta">
                  SELF
                </span>
              )}
            </span>
          }
          subtitle={project?.repoPath}
          actions={
            <div className="flex items-center gap-2">
              <Link
                href={`/projects/${projectId}/pipelines/new`}
                className="rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 px-3 py-1.5 font-mono text-xs text-neon-cyan transition hover:bg-neon-cyan/20"
              >
                + Pipeline
              </Link>
              <Link
                href={`/projects/${projectId}?archived=1`}
                className="rounded-lg border border-neon-magenta/40 bg-neon-magenta/10 px-3 py-1.5 font-mono text-xs text-neon-magenta transition hover:bg-neon-magenta/20"
              >
                Archived
              </Link>
            </div>
          }
        />

        <div className="flex-1 overflow-hidden">{children}</div>
      </main>
    </div>
  );
}
