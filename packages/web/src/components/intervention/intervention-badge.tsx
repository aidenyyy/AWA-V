"use client";

import { cn } from "@/lib/cn";

interface InterventionBadgeProps {
  pipelineId: string;
  pendingCount: number;
  onRespond: () => void;
}

export function InterventionBadge({
  pipelineId: _pipelineId,
  pendingCount,
  onRespond,
}: InterventionBadgeProps) {
  if (pendingCount <= 0) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Pulsing neon-red dot + count */}
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon-red opacity-50" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-neon-red intervention-pulse" />
        </span>
        <span className="text-[11px] font-mono font-semibold text-neon-red">
          {pendingCount}
        </span>
      </div>

      {/* Respond button */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRespond();
        }}
        className={cn(
          "inline-flex items-center gap-1 rounded px-2 py-0.5",
          "border border-neon-red/40 bg-neon-red/10",
          "text-[10px] font-mono font-semibold uppercase tracking-wider text-neon-red",
          "hover:bg-neon-red/20 hover:border-neon-red/60",
          "intervention-pulse",
          "transition-all duration-200"
        )}
      >
        <span>!</span>
        <span>Respond</span>
      </button>
    </div>
  );
}
