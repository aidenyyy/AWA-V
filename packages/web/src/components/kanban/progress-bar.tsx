"use client";

import { cn } from "@/lib/cn";

interface ProgressBarProps {
  progress: number; // 0-100
  className?: string;
  variant?: "cyan" | "green" | "magenta";
}

export function ProgressBar({
  progress,
  className,
  variant = "cyan",
}: ProgressBarProps) {
  const colors = {
    cyan: "from-neon-cyan to-neon-blue shadow-[0_0_8px_rgba(0,240,255,0.4)]",
    green: "from-neon-green to-neon-cyan shadow-[0_0_8px_rgba(0,255,136,0.4)]",
    magenta: "from-neon-magenta to-neon-blue shadow-[0_0_8px_rgba(255,0,170,0.4)]",
  };

  return (
    <div className={cn("neon-progress", className)}>
      <div
        className={cn("neon-progress-bar bg-gradient-to-r", colors[variant])}
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
}
