"use client";

import { cn } from "@/lib/cn";

interface CostBadgeProps {
  inputTokens: number;
  outputTokens: number;
  className?: string;
  size?: "sm" | "md";
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function CostBadge({ inputTokens, outputTokens, className, size = "sm" }: CostBadgeProps) {
  const total = inputTokens + outputTokens;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono",
        size === "sm" ? "text-[10px]" : "text-xs",
        total > 100_000
          ? "text-neon-yellow"
          : total > 500_000
            ? "text-neon-red"
            : "text-text-muted",
        className
      )}
    >
      {formatTokens(inputTokens)}&darr; {formatTokens(outputTokens)}&uarr;
    </span>
  );
}
