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

  useSubscribeToProject(projectId);

  useEffect(() => {
    api.getProject(projectId).then((p) => setProject(p as Project));
  }, [projectId]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="ml-16 flex flex-1 flex-col">
        <Header
          title={project?.name ?? "Loading..."}
          subtitle={project?.repoPath}
          actions={
            <div className="flex items-center gap-2">
              <Link
                href={`/projects/${projectId}/skills`}
                className="rounded-lg border border-border px-3 py-1.5 font-mono text-xs text-text-secondary transition hover:border-neon-blue/40 hover:text-neon-blue"
              >
                Skills
              </Link>
              <Link
                href={`/projects/${projectId}/pipelines/new`}
                className="rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 px-3 py-1.5 font-mono text-xs text-neon-cyan transition hover:bg-neon-cyan/20"
              >
                + Pipeline
              </Link>
            </div>
          }
        />

        <div className="flex-1 overflow-hidden">{children}</div>
      </main>
    </div>
  );
}
