"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

interface DashboardStats {
  pendingSelfUpdates: number;
  activePipelines: number;
  pausedPipelines: number;
}

type UpdatePhase = "idle" | "merging" | "restarting";

export function UpdateBanner() {
  const [pendingCount, setPendingCount] = useState(0);
  const [hasRunningPipelines, setHasRunningPipelines] = useState(false);
  const [phase, setPhase] = useState<UpdatePhase>("idle");

  // Poll for pending self-updates and pipeline status
  useEffect(() => {
    function poll() {
      api
        .getDashboardStats()
        .then((s) => {
          const stats = s as DashboardStats;
          setPendingCount(stats.pendingSelfUpdates ?? 0);
          const running =
            (stats.activePipelines ?? 0) - (stats.pausedPipelines ?? 0);
          setHasRunningPipelines(running > 0);
        })
        .catch(() => {});
    }
    poll();
    const interval = setInterval(poll, 15_000);
    return () => clearInterval(interval);
  }, []);

  async function handleApplyUpdate() {
    try {
      // Phase 1: Merge each pending self-update
      setPhase("merging");
      const pending = (await api.getPendingSelfUpdates()) as { id: string }[];
      if (pending.length === 0) {
        // Nothing to merge — stale count
        setPhase("idle");
        setPendingCount(0);
        return;
      }
      for (const p of pending) {
        await api.mergeSelfPipeline(p.id);
      }

      // Phase 2: Poll for server restart
      setPhase("restarting");
      let sawDown = false;
      const startTime = Date.now();
      const maxWait = 60_000;
      const giveUpIfNeverDown = 30_000;

      while (Date.now() - startTime < maxWait) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          await api.getDashboardStats();
          // Server responded
          if (sawDown) {
            // Server came back after going down — restart complete
            break;
          }
          if (Date.now() - startTime > giveUpIfNeverDown) {
            // Server never went down — hot-reload applied changes
            break;
          }
        } catch {
          sawDown = true;
        }
      }

      setPhase("idle");
      setPendingCount(0);
    } catch {
      setPhase("idle");
    }
  }

  // Show loading overlay during update phases
  if (phase !== "idle") {
    const phaseLabels: Record<UpdatePhase, string> = {
      idle: "",
      merging: "Merging changes into main branch...",
      restarting: "Waiting for server restart...",
    };

    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-void/95 backdrop-blur">
        <span
          className="indicator indicator-running mb-4"
          style={{ width: 24, height: 24 }}
        />
        <div className="font-mono text-sm text-neon-magenta">
          Updating AWA-V...
        </div>
        <div className="mt-2 font-mono text-[10px] text-text-muted">
          {phaseLabels[phase]}
        </div>
      </div>
    );
  }

  // Don't render banner if no pending updates
  if (pendingCount <= 0) return null;

  return (
    <div className="border-b border-neon-magenta/30 bg-neon-magenta/5 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="indicator indicator-warning" />
        <div>
          <span className="font-mono text-xs font-semibold text-neon-magenta">
            Update Available
          </span>
          <span className="ml-2 font-mono text-[10px] text-text-muted">
            {pendingCount} self-repo pipeline(s) completed with changes ready to
            apply
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {hasRunningPipelines && (
          <span className="font-mono text-[10px] text-text-muted">
            Pause all active pipelines before applying update
          </span>
        )}
        <button
          onClick={handleApplyUpdate}
          disabled={hasRunningPipelines}
          className="rounded-lg border border-neon-magenta/40 bg-neon-magenta/10 px-3 py-1.5 font-mono text-xs text-neon-magenta transition hover:bg-neon-magenta/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-neon-magenta/10"
        >
          Apply Update
        </button>
      </div>
    </div>
  );
}
