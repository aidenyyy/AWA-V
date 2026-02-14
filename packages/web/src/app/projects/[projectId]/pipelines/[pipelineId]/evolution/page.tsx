"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { EvolutionTimeline } from "@/components/evolution/evolution-timeline";
import { ClaudeMdDiff } from "@/components/evolution/claude-md-diff";
import type { EvolutionLog } from "@awa-v/shared";

export default function EvolutionPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [logs, setLogs] = useState<EvolutionLog[]>([]);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    l1Count: number;
    l2Count: number;
    l3Count: number;
  } | null>(null);

  useEffect(() => {
    api.getEvolutionLogs(projectId).then((l) => setLogs(l as EvolutionLog[]));
    api.getMemoryStats(projectId).then((s) => setStats(s as any));
  }, [projectId]);

  const selectedLog = logs.find((l) => l.id === selectedLogId);
  const claudeMdLogs = logs.filter((l) => l.actionType === "claude_md_update");
  const configLogs = logs.filter((l) => l.actionType === "config_change");

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h2 className="mb-6 font-mono text-sm font-semibold text-text-primary">
        Evolution Log
      </h2>

      {/* Memory stats */}
      {stats && (
        <div className="mb-8 grid grid-cols-3 gap-4">
          {[
            { label: "L1: Cross-Task", count: stats.l1Count, color: "text-neon-cyan" },
            { label: "L2: Project", count: stats.l2Count, color: "text-neon-green" },
            { label: "L3: Patterns", count: stats.l3Count, color: "text-neon-magenta" },
          ].map((s) => (
            <div key={s.label} className="glass-card p-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-text-muted">
                {s.label}
              </div>
              <div className={`mt-1 text-2xl font-mono font-semibold ${s.color}`}>
                {s.count}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary bar */}
      <div className="mb-6 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="indicator indicator-active" />
          <span className="text-xs font-mono text-text-secondary">
            {claudeMdLogs.length} CLAUDE.md updates
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="indicator indicator-warning" />
          <span className="text-xs font-mono text-text-secondary">
            {configLogs.length} config changes
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-text-muted">
            {logs.length} total events
          </span>
        </div>
      </div>

      {/* Two-column layout: timeline + detail */}
      <div className="flex gap-6">
        {/* Left: Timeline */}
        <div className="flex-1 min-w-0">
          <EvolutionTimeline
            logs={logs}
            selectedId={selectedLogId}
            onSelect={setSelectedLogId}
          />
        </div>

        {/* Right: Detail panel */}
        <div className="w-[420px] flex-shrink-0">
          {selectedLog ? (
            <div className="sticky top-6 space-y-4">
              {/* Selected log header */}
              <div className="glass-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`font-mono text-[10px] uppercase tracking-widest ${
                      selectedLog.actionType === "claude_md_update"
                        ? "text-neon-green"
                        : "text-neon-yellow"
                    }`}
                  >
                    {selectedLog.actionType === "claude_md_update"
                      ? "CLAUDE.MD UPDATE"
                      : "CONFIG CHANGE"}
                  </span>
                  <button
                    onClick={() => setSelectedLogId(null)}
                    className="text-text-muted hover:text-text-primary text-sm font-mono"
                  >
                    x
                  </button>
                </div>

                <p className="text-xs text-text-primary mb-2">
                  {selectedLog.patternDescription}
                </p>

                <div className="text-[10px] font-mono text-text-muted">
                  Applied: {new Date(selectedLog.appliedAt).toLocaleString()}
                </div>

                {selectedLog.triggerPipelineId && (
                  <div className="mt-1 text-[10px] font-mono text-text-muted">
                    Triggered by pipeline: {selectedLog.triggerPipelineId.slice(0, 8)}
                  </div>
                )}
              </div>

              {/* Diff viewer */}
              {selectedLog.diff && (
                <ClaudeMdDiff diff={selectedLog.diff} />
              )}
            </div>
          ) : (
            <div className="glass-card p-8 text-center sticky top-6">
              <span className="font-mono text-xs text-text-muted">
                Select an evolution event to view details
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
