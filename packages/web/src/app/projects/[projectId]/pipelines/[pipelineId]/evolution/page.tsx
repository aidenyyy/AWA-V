"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { EvolutionTimeline } from "@/components/evolution/evolution-timeline";
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
  const [rollingBack, setRollingBack] = useState(false);

  const refreshLogs = useCallback(() => {
    api.getEvolutionLogs(projectId).then((l) => setLogs(l as EvolutionLog[]));
  }, [projectId]);

  useEffect(() => {
    refreshLogs();
    api.getMemoryStats(projectId).then((s) => setStats(s as any));
  }, [projectId, refreshLogs]);

  const selectedLog = logs.find((l) => l.id === selectedLogId);
  const insightLogs = logs.filter(
    (l) => l.actionType === "prompt_improvement" || l.actionType === "skill_suggestion"
  );
  const configLogs = logs.filter((l) => l.actionType === "config_change");
  const routingLogs = logs.filter((l) => l.actionType === "model_routing");

  const handleRollback = async (logId: string) => {
    setRollingBack(true);
    try {
      await api.rollbackEvolution(logId);
      refreshLogs();
    } catch {
      // Error handled by api-client
    } finally {
      setRollingBack(false);
    }
  };

  // Parse structured diff for config/routing changes
  const parsedDiff = selectedLog ? parseConfigDiff(selectedLog) : null;

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
            {insightLogs.length} insight updates
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="indicator indicator-warning" />
          <span className="text-xs font-mono text-text-secondary">
            {configLogs.length} config changes
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="indicator" style={{ backgroundColor: "var(--neon-cyan, #0ff)" }} />
          <span className="text-xs font-mono text-text-secondary">
            {routingLogs.length} model routing
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
                      selectedLog.actionType === "prompt_improvement" ||
                      selectedLog.actionType === "skill_suggestion"
                        ? "text-neon-green"
                        : selectedLog.actionType === "model_routing"
                        ? "text-neon-cyan"
                        : "text-neon-yellow"
                    }`}
                  >
                    {selectedLog.actionType === "model_routing"
                      ? "MODEL ROUTING"
                      : selectedLog.actionType === "config_change"
                      ? "CONFIG CHANGE"
                      : selectedLog.actionType === "skill_suggestion"
                      ? "SKILL SUGGESTION"
                      : "PROMPT IMPROVEMENT"
                    }
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

                {/* Status badge */}
                {parsedDiff && (
                  <div className="mb-2">
                    <span
                      className={`inline-block text-[10px] font-mono px-2 py-0.5 rounded ${
                        selectedLog.rolledBackAt
                          ? "bg-neon-magenta/10 text-neon-magenta"
                          : parsedDiff.applied
                          ? "bg-neon-green/10 text-neon-green"
                          : parsedDiff.rejected
                          ? "bg-neon-red/10 text-neon-red"
                          : "bg-white/5 text-text-muted"
                      }`}
                    >
                      {selectedLog.rolledBackAt
                        ? "ROLLED BACK"
                        : parsedDiff.applied
                        ? "APPLIED"
                        : parsedDiff.rejected
                        ? "REJECTED"
                        : "RECORDED"}
                    </span>
                  </div>
                )}

                <div className="text-[10px] font-mono text-text-muted">
                  Applied: {new Date(selectedLog.appliedAt).toLocaleString()}
                </div>

                {selectedLog.triggerPipelineId && (
                  <div className="mt-1 text-[10px] font-mono text-text-muted">
                    Triggered by pipeline: {selectedLog.triggerPipelineId.slice(0, 8)}
                  </div>
                )}

                {selectedLog.rolledBackAt && (
                  <div className="mt-1 text-[10px] font-mono text-neon-magenta">
                    Rolled back: {new Date(selectedLog.rolledBackAt).toLocaleString()}
                  </div>
                )}
              </div>

              {/* Config change details */}
              {parsedDiff && (parsedDiff.changes || parsedDiff.previousValues) && (
                <div className="glass-card p-4">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-3">
                    Config Changes
                  </div>
                  {parsedDiff.previousValues && parsedDiff.changes && (
                    <div className="space-y-2">
                      {Object.entries(parsedDiff.changes).map(([key, newVal]) => {
                        const oldVal = parsedDiff.previousValues?.[key];
                        return (
                          <div key={key} className="flex items-center justify-between">
                            <span className="text-xs font-mono text-text-secondary">{key}</span>
                            <div className="flex items-center gap-2 text-xs font-mono">
                              {oldVal !== undefined && (
                                <>
                                  <span className="text-neon-red/80 line-through">
                                    {typeof oldVal === "object" ? JSON.stringify(oldVal) : String(oldVal)}
                                  </span>
                                  <span className="text-text-muted">&rarr;</span>
                                </>
                              )}
                              <span className="text-neon-green">
                                {typeof newVal === "object" ? JSON.stringify(newVal) : String(newVal)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Rollback button */}
              {parsedDiff?.applied &&
                !selectedLog.rolledBackAt &&
                (selectedLog.actionType === "config_change" ||
                  selectedLog.actionType === "model_routing") && (
                <button
                  onClick={() => handleRollback(selectedLog.id)}
                  disabled={rollingBack}
                  className="w-full glass-card p-3 text-center text-xs font-mono text-neon-red hover:border-neon-red/40 hover:shadow-[0_0_12px_rgba(255,0,0,0.08)] transition disabled:opacity-50"
                >
                  {rollingBack ? "Rolling back..." : "Rollback Change"}
                </button>
              )}

              {/* Raw recommendation payload */}
              {selectedLog.diff && (
                <pre className="glass-card max-h-[280px] overflow-auto whitespace-pre-wrap p-4 text-[11px] text-text-secondary">
                  {selectedLog.diff}
                </pre>
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

/** Parse config/routing diff JSON to extract structured data */
function parseConfigDiff(log: EvolutionLog): {
  applied: boolean;
  rejected: boolean;
  changes: Record<string, unknown> | null;
  previousValues: Record<string, unknown> | null;
} | null {
  if (log.actionType !== "config_change" && log.actionType !== "model_routing") return null;
  try {
    const diff = JSON.parse(log.diff);
    return {
      applied: !!diff.applied,
      rejected: !!diff.rejected,
      changes: diff.changes ?? null,
      previousValues: diff.previousValues ?? null,
    };
  } catch {
    return null;
  }
}
