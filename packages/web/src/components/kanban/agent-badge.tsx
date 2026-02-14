"use client";

import { cn } from "@/lib/cn";

interface AgentBadgeProps {
  role: string;
  state: string;
}

const roleColors: Record<string, string> = {
  planner: "text-neon-cyan",
  executor: "text-neon-green",
  reviewer: "text-neon-magenta",
  tester: "text-neon-yellow",
  adversarial: "text-neon-red",
};

const stateIndicator: Record<string, string> = {
  running: "indicator-running",
  completed: "indicator-active",
  failed: "indicator-error",
  pending: "indicator-idle",
  queued: "indicator-idle",
};

export function AgentBadge({ role, state }: AgentBadgeProps) {
  const color = roleColors[role.toLowerCase()] ?? "text-text-secondary";
  const indicator = stateIndicator[state] ?? "indicator-idle";

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("indicator", indicator)} />
      <span className={cn("font-mono text-[11px] uppercase tracking-wider", color)}>
        {role}
      </span>
    </div>
  );
}
