import { skillRepo } from "../db/repositories/skill-repo.js";
import type { SkillPack, Skill } from "@awa-v/shared";
import pino from "pino";

const log = pino({ name: "skill-distributor" });

/**
 * Rule-based skill distribution engine.
 * Matches skills from the registry to tasks based on task type and domain.
 */
class SkillDistributor {
  /**
   * Tag mapping rules: maps (taskType, taskDomain) combinations to skill tags.
   * These rules determine which skills get assigned to which tasks.
   */
  private static readonly RULES: Array<{
    match: { type?: string; domain?: string; keywords?: string[] };
    tags: string[];
  }> = [
    // Implementation tasks
    {
      match: { type: "implement", domain: "frontend" },
      tags: ["frontend-design", "brainstorming", "ui", "css", "react"],
    },
    {
      match: { type: "implement", domain: "backend" },
      tags: ["tdd", "debugging", "api", "database"],
    },
    {
      match: { type: "implement", domain: "database" },
      tags: ["database", "sql", "migrations"],
    },
    {
      match: { type: "implement", domain: "api" },
      tags: ["api", "rest", "validation"],
    },
    {
      match: { type: "implement", domain: "infra" },
      tags: ["devops", "docker", "ci-cd"],
    },
    {
      match: { type: "implement" },
      tags: ["coding", "architecture"],
    },

    // Testing tasks
    {
      match: { type: "test" },
      tags: ["tdd", "testing", "assertions"],
    },

    // Review tasks
    {
      match: { type: "review" },
      tags: ["code-review", "security", "best-practices"],
    },

    // Fix/debug tasks
    {
      match: { type: "fix" },
      tags: ["debugging", "error-handling", "diagnostics"],
    },

    // Refactoring tasks
    {
      match: { type: "refactor" },
      tags: ["refactoring", "architecture", "clean-code"],
    },

    // Planning tasks
    {
      match: { type: "plan" },
      tags: ["architecture", "brainstorming", "planning"],
    },
  ];

  /**
   * Get the appropriate skill pack for a task based on its type and domain.
   * Matches skills from the registry by tags using the rule engine.
   */
  getSkillPack(taskType: string, taskDomain: string): SkillPack {
    log.debug({ taskType, taskDomain }, "Getting skill pack");

    const matchedTags = this.getMatchingTags(taskType, taskDomain);

    // Query skills from the registry that match any of the resolved tags
    const tagMatchedSkills = matchedTags.length > 0
      ? skillRepo.getByTags(matchedTags).filter((s) => s.status === "active")
      : [];

    // Always include starred active skills, regardless of tag matching
    const starredSkills = skillRepo.getAll()
      .filter((s) => s.starred === 1 && s.status === "active");

    // Merge: starred first (deduplicated), then tag-matched
    const seenIds = new Set<string>();
    const mergedSkills: typeof tagMatchedSkills = [];

    for (const skill of starredSkills) {
      if (!seenIds.has(skill.id)) {
        seenIds.add(skill.id);
        mergedSkills.push(skill);
      }
    }
    for (const skill of tagMatchedSkills) {
      if (!seenIds.has(skill.id)) {
        seenIds.add(skill.id);
        mergedSkills.push(skill);
      }
    }

    // Build the skill pack
    const pluginDirs: string[] = [];
    const claudeMdSnippets: string[] = [];

    for (const skill of mergedSkills) {
      // Skills with a pluginDir set get added as plugin directories
      if (skill.pluginDir) {
        pluginDirs.push(skill.pluginDir);
      } else if (skill.sourceUrl && !skill.sourceUrl.startsWith("http")) {
        // Legacy: sourceUrl that looks like a directory path
        pluginDirs.push(skill.sourceUrl);
      }

      // Use skill instructions (preferred) or description as CLAUDE.md snippet
      if (skill.instructions) {
        claudeMdSnippets.push(
          `### Skill: ${skill.name}\n${skill.instructions}`
        );
      } else if (skill.description) {
        claudeMdSnippets.push(
          `### Skill: ${skill.name}\n${skill.description}`
        );
      }
    }

    log.info(
      {
        taskType,
        taskDomain,
        matchedTags,
        skillCount: mergedSkills.length,
        starredCount: starredSkills.length,
      },
      "Skill pack assembled"
    );

    return {
      skills: mergedSkills as Skill[],
      pluginDirs,
      claudeMdSnippets,
    };
  }

  /**
   * Register a new skill in the repository.
   */
  registerSkill(skill: {
    name: string;
    description?: string;
    sourceUrl?: string;
    tags?: string[];
    type?: string;
  }): Skill {
    log.info({ name: skill.name, tags: skill.tags }, "Registering skill");

    const created = skillRepo.create({
      name: skill.name,
      description: skill.description,
      sourceUrl: skill.sourceUrl,
      tags: skill.tags,
      type: skill.type ?? "manual",
      status: "active",
    });

    return created as Skill;
  }

  /**
   * Get recommended skills for a task based on keyword matching in its description.
   * Simple heuristic for when task type/domain are not explicitly set.
   */
  getRecommendedSkills(taskDescription: string): Skill[] {
    const lower = taskDescription.toLowerCase();

    const inferredTags: string[] = [];

    // Keyword-to-tag mapping
    const keywordMap: Record<string, string[]> = {
      "implement": ["coding", "architecture"],
      "create": ["coding", "architecture"],
      "build": ["coding", "architecture"],
      "frontend": ["frontend-design", "ui", "css", "react"],
      "ui": ["frontend-design", "ui"],
      "component": ["frontend-design", "react", "ui"],
      "backend": ["tdd", "debugging", "api"],
      "server": ["api", "backend"],
      "api": ["api", "rest", "validation"],
      "endpoint": ["api", "rest"],
      "database": ["database", "sql", "migrations"],
      "schema": ["database", "sql"],
      "migration": ["database", "migrations"],
      "test": ["tdd", "testing", "assertions"],
      "spec": ["tdd", "testing"],
      "review": ["code-review", "security", "best-practices"],
      "fix": ["debugging", "error-handling", "diagnostics"],
      "bug": ["debugging", "error-handling"],
      "debug": ["debugging", "diagnostics"],
      "refactor": ["refactoring", "clean-code"],
      "style": ["css", "frontend-design"],
      "deploy": ["devops", "ci-cd"],
      "docker": ["devops", "docker"],
      "security": ["security", "validation"],
      "auth": ["security", "authentication"],
    };

    for (const [keyword, tags] of Object.entries(keywordMap)) {
      if (lower.includes(keyword)) {
        inferredTags.push(...tags);
      }
    }

    // Deduplicate tags
    const uniqueTags = [...new Set(inferredTags)];

    const tagMatched = uniqueTags.length > 0
      ? skillRepo.getByTags(uniqueTags).filter((s) => s.status === "active")
      : [];

    // Always include starred active skills, prioritized first
    const starredSkills = skillRepo.getAll()
      .filter((s) => s.starred === 1 && s.status === "active");

    const seenIds = new Set<string>();
    const merged: typeof tagMatched = [];

    for (const skill of starredSkills) {
      if (!seenIds.has(skill.id)) {
        seenIds.add(skill.id);
        merged.push(skill);
      }
    }
    for (const skill of tagMatched) {
      if (!seenIds.has(skill.id)) {
        seenIds.add(skill.id);
        merged.push(skill);
      }
    }

    log.debug(
      { description: taskDescription.slice(0, 100), inferredTags: uniqueTags, skillCount: merged.length, starredCount: starredSkills.length },
      "Recommended skills from description"
    );

    return merged as Skill[];
  }

  /**
   * Get the tags that match a given task type and domain from the rule engine.
   */
  private getMatchingTags(taskType: string, taskDomain: string): string[] {
    const allTags: string[] = [];

    for (const rule of SkillDistributor.RULES) {
      const typeMatch = !rule.match.type || rule.match.type === taskType;
      const domainMatch = !rule.match.domain || rule.match.domain === taskDomain;

      if (typeMatch && domainMatch) {
        allTags.push(...rule.tags);
      }
    }

    // Deduplicate
    return [...new Set(allTags)];
  }
}

// Singleton
export const skillDistributor = new SkillDistributor();
