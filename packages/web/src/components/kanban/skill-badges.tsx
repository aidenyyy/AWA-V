"use client";

import { cn } from "@/lib/cn";

interface SkillBadgesProps {
  skills: string[];
  activeSkills?: string[];
  suggestedSkills?: string[];
  maxVisible?: number;
}

export function SkillBadges({
  skills,
  activeSkills = [],
  suggestedSkills = [],
  maxVisible = 4,
}: SkillBadgesProps) {
  const visible = skills.slice(0, maxVisible);
  const overflow = skills.length - maxVisible;

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((skill) => {
        const isActive = activeSkills.includes(skill);
        const isSuggested = suggestedSkills.includes(skill);

        return (
          <span
            key={skill}
            className={cn(
              "skill-badge",
              isActive
                ? "skill-badge-active"
                : isSuggested
                  ? "skill-badge-suggested"
                  : "skill-badge-configured"
            )}
          >
            {skill}
          </span>
        );
      })}
      {overflow > 0 && (
        <span className="skill-badge skill-badge-dim">+{overflow}</span>
      )}
    </div>
  );
}
