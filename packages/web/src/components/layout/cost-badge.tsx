"use client";

import { cn } from "@/lib/cn";

interface CostBadgeProps {
  costUsd: number;
  className?: string;
  size?: "sm" | "md";
}

export function CostBadge({ costUsd, className, size = "sm" }: CostBadgeProps) {
  const formatted = costUsd < 0.01
    ? "<$0.01"
    : `$${costUsd.toFixed(2)}`;

  return (
    <span
      className={cn(
        "inline-flex items-center font-mono",
        size === "sm" ? "text-[10px]" : "text-xs",
        costUsd > 1
          ? "text-neon-yellow"
          : costUsd > 5
            ? "text-neon-red"
            : "text-text-muted",
        className
      )}
    >
      {formatted}
    </span>
  );
}
