"use client";

import { cn } from "@/lib/cn";
import type { EvolutionLog } from "@awa-v/shared";

interface PatternCardProps {
  log: EvolutionLog;
  isSelected: boolean;
  onSelect: () => void;
}

export function PatternCard({ log, isSelected, onSelect }: PatternCardProps) {
  const isInsight =
    log.actionType === "prompt_improvement" || log.actionType === "skill_suggestion";
  const isModelRouting = log.actionType === "model_routing";
  const relativeTime = getRelativeTime(log.appliedAt);
  const status = getConfigStatus(log);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "glass-card w-full p-4 text-left transition",
        isSelected &&
          (isInsight
            ? "border-neon-green/40 shadow-[0_0_12px_rgba(0,255,136,0.08)]"
            : isModelRouting
            ? "border-neon-cyan/40 shadow-[0_0_12px_rgba(0,255,255,0.08)]"
            : "border-neon-yellow/40 shadow-[0_0_12px_rgba(255,170,0,0.08)]")
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span
          className={cn(
            "font-mono text-[10px] uppercase tracking-widest",
            isInsight
              ? "text-neon-green"
              : isModelRouting
              ? "text-neon-cyan"
              : "text-neon-yellow"
          )}
        >
          {isInsight
            ? "INSIGHT UPDATE"
            : isModelRouting
            ? "MODEL ROUTING"
            : "CONFIG CHANGE"}
        </span>
        <div className="flex items-center gap-2">
          {status && (
            <span
              className={cn(
                "text-[10px] font-mono px-1.5 py-0.5 rounded",
                status === "applied" && "bg-neon-green/10 text-neon-green",
                status === "rejected" && "bg-neon-red/10 text-neon-red",
                status === "rolled_back" && "bg-neon-magenta/10 text-neon-magenta"
              )}
            >
              {status === "applied"
                ? "APPLIED"
                : status === "rejected"
                ? "REJECTED"
                : "ROLLED BACK"}
            </span>
          )}
          <span className="text-[10px] font-mono text-text-muted">{relativeTime}</span>
        </div>
      </div>

      {/* Pattern description */}
      <p className="text-xs text-text-secondary mb-2">{log.patternDescription}</p>

      {/* Diff preview (collapsed) */}
      {log.diff && !isSelected && (
        <div className="rounded-md border border-border bg-deep px-3 py-2 text-[10px] font-mono text-text-muted truncate">
          {log.diff.slice(0, 100)}...
        </div>
      )}

      {/* Rolled back indicator */}
      {log.rolledBackAt && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="indicator indicator-error" />
          <span className="text-[10px] font-mono text-neon-red">
            Rolled back {getRelativeTime(log.rolledBackAt)}
          </span>
        </div>
      )}
    </button>
  );
}

function getConfigStatus(
  log: EvolutionLog
): "applied" | "rejected" | "rolled_back" | null {
  if (log.rolledBackAt) return "rolled_back";
  if (log.actionType !== "config_change" && log.actionType !== "model_routing") return null;

  try {
    const diff = JSON.parse(log.diff);
    if (diff.applied) return "applied";
    if (diff.rejected) return "rejected";
  } catch {
    // not structured JSON
  }
  return null;
}

function getRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
