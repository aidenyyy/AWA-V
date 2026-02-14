"use client";

import type { EvolutionLog } from "@awa-v/shared";
import { PatternCard } from "./pattern-card";

interface EvolutionTimelineProps {
  logs: EvolutionLog[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function EvolutionTimeline({
  logs,
  selectedId,
  onSelect,
}: EvolutionTimelineProps) {
  if (logs.length === 0) {
    return (
      <div className="glass-card p-8 text-center font-mono text-xs text-text-muted">
        No evolution events yet. Complete pipelines to generate insights.
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical timeline line */}
      <div className="absolute left-[15px] top-0 bottom-0 w-px bg-border" />

      <div className="space-y-4">
        {logs.map((log, i) => (
          <div key={log.id} className="relative pl-10">
            {/* Timeline node */}
            <div
              className={`absolute left-[8px] top-3 h-[14px] w-[14px] rounded-full border-2 ${
                log.actionType === "claude_md_update"
                  ? "border-neon-green bg-neon-green/20"
                  : "border-neon-yellow bg-neon-yellow/20"
              } ${
                selectedId === log.id
                  ? "shadow-[0_0_8px_currentColor]"
                  : ""
              }`}
            />

            {/* Connect line to next */}
            {i < logs.length - 1 && (
              <div className="absolute left-[14px] top-[22px] bottom-[-16px] w-px bg-border" />
            )}

            <PatternCard
              log={log}
              isSelected={selectedId === log.id}
              onSelect={() => onSelect(log.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
