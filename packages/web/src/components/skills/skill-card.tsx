"use client";

import { cn } from "@/lib/cn";
import type { Skill } from "@awa-v/shared";

interface SkillCardProps {
  skill: Skill;
  onToggle: () => void;
  onDelete?: () => void;
  onToggleStar?: () => void;
}

const SOURCE_BADGE: Record<string, { label: string; color: string }> = {
  builtin: { label: "Built-in", color: "text-neon-green border-neon-green/30" },
  github: { label: "GitHub", color: "text-neon-magenta border-neon-magenta/30" },
  manual: { label: "Manual", color: "text-neon-blue border-neon-blue/30" },
};

export function SkillCard({ skill, onToggle, onDelete, onToggleStar }: SkillCardProps) {
  const isActive = skill.status === "active";
  const isStarred = skill.starred === 1;
  const badge = SOURCE_BADGE[skill.sourceKind] ?? SOURCE_BADGE.manual;

  return (
    <div
      className={cn(
        "glass-card p-4 transition-all",
        isActive ? "border-border" : "border-border opacity-60",
        isStarred && "border-neon-yellow/20"
      )}
    >
      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onToggleStar}
            className={cn(
              "flex-shrink-0 transition hover:scale-110",
              isStarred ? "text-neon-yellow" : "text-text-muted hover:text-neon-yellow/60"
            )}
            title={isStarred ? "Unstar" : "Star (prioritized in skill distribution)"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={isStarred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
          <span className="truncate font-mono text-xs font-semibold text-text-primary">
            {skill.name}
          </span>
        </div>
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 font-mono text-[9px] flex-shrink-0",
            badge.color
          )}
        >
          {badge.label}
        </span>
      </div>

      {/* Description */}
      {skill.description && (
        <p className="mb-2 text-[11px] text-text-muted line-clamp-2">
          {skill.description}
        </p>
      )}

      {/* Tags */}
      {skill.tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {skill.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[9px] text-text-secondary"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Status + actions */}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "font-mono text-[10px] uppercase tracking-widest",
            isActive ? "text-neon-green" : "text-text-muted"
          )}
        >
          {isActive ? "active" : "disabled"}
        </span>

        <div className="flex gap-1.5">
          <button
            onClick={onToggle}
            className={cn(
              "rounded border px-2 py-0.5 font-mono text-[10px] transition",
              isActive
                ? "border-neon-yellow/30 text-neon-yellow hover:bg-neon-yellow/10"
                : "border-neon-green/30 text-neon-green hover:bg-neon-green/10"
            )}
          >
            {isActive ? "Disable" : "Enable"}
          </button>

          {onDelete && skill.sourceKind !== "builtin" && (
            <button
              onClick={onDelete}
              className="rounded border border-neon-red/30 px-2 py-0.5 font-mono text-[10px] text-neon-red transition hover:bg-neon-red/10"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
