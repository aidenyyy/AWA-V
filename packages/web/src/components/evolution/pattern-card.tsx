"use client";

import { cn } from "@/lib/cn";
import type { EvolutionLog } from "@awa-v/shared";

interface PatternCardProps {
  log: EvolutionLog;
  isSelected: boolean;
  onSelect: () => void;
}

export function PatternCard({ log, isSelected, onSelect }: PatternCardProps) {
  const isClaudeMd = log.actionType === "claude_md_update";
  const relativeTime = getRelativeTime(log.appliedAt);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "glass-card w-full p-4 text-left transition",
        isSelected &&
          (isClaudeMd
            ? "border-neon-green/40 shadow-[0_0_12px_rgba(0,255,136,0.08)]"
            : "border-neon-yellow/40 shadow-[0_0_12px_rgba(255,170,0,0.08)]")
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span
          className={cn(
            "font-mono text-[10px] uppercase tracking-widest",
            isClaudeMd ? "text-neon-green" : "text-neon-yellow"
          )}
        >
          {isClaudeMd ? "CLAUDE.MD UPDATE" : "CONFIG CHANGE"}
        </span>
        <span className="text-[10px] font-mono text-text-muted">{relativeTime}</span>
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
