"use client";

import { cn } from "@/lib/cn";

interface KanbanColumnProps {
  title: string;
  count: number;
  accentColor?: string;
  isActionColumn?: boolean;
  children: React.ReactNode;
}

export function KanbanColumn({
  title,
  count,
  accentColor = "border-border",
  isActionColumn = false,
  children,
}: KanbanColumnProps) {
  return (
    <div className="kanban-column flex flex-col">
      {/* Column header */}
      <div
        className={cn(
          "mb-3 flex items-center justify-between rounded-t-lg border-t-2 px-3 py-2",
          accentColor,
          isActionColumn ? "bg-neon-yellow/5" : "bg-surface/50"
        )}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono uppercase tracking-widest text-text-secondary">
            {title}
          </span>
          {isActionColumn && (
            <span className="indicator indicator-warning" />
          )}
        </div>
        <span className="text-[10px] font-mono text-text-muted">{count}</span>
      </div>

      {/* Cards */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-1 pb-4">
        {children}
      </div>
    </div>
  );
}
