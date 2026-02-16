"use client";

import { cn } from "@/lib/cn";

interface ModelBadgeProps {
  model: string | null | undefined;
  className?: string;
}

const modelConfig: Record<string, { label: string; color: string; glow: string }> = {
  haiku: {
    label: "HAIKU",
    color: "text-neon-green border-neon-green/30 bg-neon-green/5",
    glow: "shadow-[0_0_6px_rgba(0,255,128,0.15)]",
  },
  sonnet: {
    label: "SONNET",
    color: "text-neon-cyan border-neon-cyan/30 bg-neon-cyan/5",
    glow: "shadow-[0_0_6px_rgba(0,240,255,0.15)]",
  },
  opus: {
    label: "OPUS",
    color: "text-neon-magenta border-neon-magenta/30 bg-neon-magenta/5",
    glow: "shadow-[0_0_6px_rgba(255,0,200,0.15)]",
  },
};

function resolveModel(model: string): string {
  if (model.includes("haiku")) return "haiku";
  if (model.includes("opus")) return "opus";
  return "sonnet";
}

export function ModelBadge({ model, className }: ModelBadgeProps) {
  if (!model) return null;

  const key = resolveModel(model);
  const config = modelConfig[key] ?? modelConfig.sonnet;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider",
        config.color,
        config.glow,
        className
      )}
    >
      {config.label}
    </span>
  );
}
