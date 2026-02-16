"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { Pipeline } from "@awa-v/shared";

interface ArchivedPipelinesModalProps {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onChanged: () => void;
}

export function ArchivedPipelinesModal({
  open,
  projectId,
  onClose,
  onChanged,
}: ArchivedPipelinesModalProps) {
  const [rows, setRows] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    api.getArchivedPipelines(projectId)
      .then((data) => setRows(data as Pipeline[]))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [open, projectId]);

  async function handleRetry(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.retryPipeline(id);
      await api.deleteArchivedPipeline(id);
      setRows((prev) => prev.filter((p) => p.id !== id));
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    const ok = window.confirm("Delete this archived pipeline permanently?");
    if (!ok) return;
    setBusyId(id);
    setError(null);
    try {
      await api.deleteArchivedPipeline(id);
      setRows((prev) => prev.filter((p) => p.id !== id));
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-void/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-16 z-50 w-[900px] max-w-[94vw] -translate-x-1/2 rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-sm text-text-primary">Archived Pipelines</h2>
          <button
            onClick={onClose}
            className="rounded border border-border px-2 py-1 font-mono text-[10px] text-text-muted hover:text-text-primary"
          >
            Close
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded border border-neon-red/30 bg-neon-red/10 px-3 py-2 font-mono text-[11px] text-neon-red">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center font-mono text-xs text-text-muted">Loading archived pipelines...</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center font-mono text-xs text-text-muted">No archived pipelines.</div>
        ) : (
          <div className="space-y-2">
            {rows.map((p) => (
              <div key={p.id} className="rounded border border-border/70 bg-abyss/50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-[10px] uppercase text-text-muted">{p.state}</div>
                    <div className="truncate text-sm text-text-primary">{p.requirements}</div>
                    <div className="font-mono text-[10px] text-text-muted">{p.id}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRetry(p.id)}
                      disabled={busyId === p.id}
                      className="rounded border border-neon-cyan/40 bg-neon-cyan/10 px-2 py-1 font-mono text-[10px] text-neon-cyan disabled:opacity-50"
                    >
                      Retry
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={busyId === p.id}
                      className="rounded border border-neon-red/40 bg-neon-red/10 px-2 py-1 font-mono text-[10px] text-neon-red disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
