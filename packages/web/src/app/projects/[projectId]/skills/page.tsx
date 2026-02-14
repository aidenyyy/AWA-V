"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { SkillBadges } from "@/components/kanban/skill-badges";
import { cn } from "@/lib/cn";
import type { Skill } from "@awa-v/shared";

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importName, setImportName] = useState("");

  useEffect(() => {
    api.getSkills().then((s) => setSkills(s as Skill[]));
  }, []);

  async function handleImport() {
    if (!importUrl) return;
    const skill = (await api.importSkill({
      sourceUrl: importUrl,
      name: importName || undefined,
    })) as Skill;
    setSkills((prev) => [...prev, skill]);
    setShowImport(false);
    setImportUrl("");
    setImportName("");
  }

  async function handleDelete(id: string) {
    await api.deleteSkill(id);
    setSkills((prev) => prev.filter((s) => s.id !== id));
  }

  const typeGroups = {
    builtin: skills.filter((s) => s.type === "builtin"),
    manual: skills.filter((s) => s.type === "manual"),
    marketplace: skills.filter((s) => s.type === "marketplace"),
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-mono text-sm font-semibold text-text-primary">
          Skill Manager
        </h2>
        <button
          onClick={() => setShowImport(true)}
          className="rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 px-3 py-1.5 font-mono text-xs text-neon-cyan transition hover:bg-neon-cyan/20"
        >
          + Import Skill
        </button>
      </div>

      {/* Skill groups */}
      {(
        [
          { key: "builtin", label: "Built-in Skills", color: "text-neon-green" },
          { key: "manual", label: "Manually Added", color: "text-neon-cyan" },
          { key: "marketplace", label: "Marketplace", color: "text-neon-magenta" },
        ] as const
      ).map(({ key, label, color }) => (
        <div key={key} className="mb-8">
          <h3
            className={cn(
              "mb-3 font-mono text-xs uppercase tracking-wider",
              color
            )}
          >
            {label} ({typeGroups[key].length})
          </h3>

          {typeGroups[key].length === 0 ? (
            <div className="glass-card p-4 text-center font-mono text-xs text-text-muted">
              No {label.toLowerCase()} skills
            </div>
          ) : (
            <div className="grid gap-2">
              {typeGroups[key].map((skill) => (
                <div key={skill.id} className="glass-card flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "indicator",
                        skill.status === "active"
                          ? "indicator-active"
                          : skill.status === "pending_approval"
                            ? "indicator-warning"
                            : "indicator-idle"
                      )}
                    />
                    <div>
                      <div className="font-mono text-xs font-medium text-text-primary">
                        {skill.name}
                      </div>
                      {skill.description && (
                        <div className="mt-0.5 text-[10px] text-text-muted">
                          {skill.description}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <SkillBadges skills={skill.tags} />
                    {skill.type !== "builtin" && (
                      <button
                        onClick={() => handleDelete(skill.id)}
                        className="text-[10px] font-mono text-text-muted hover:text-neon-red transition"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Import dialog */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md p-6">
            <h3 className="mb-4 font-mono text-sm font-semibold text-text-primary">
              Import Skill
            </h3>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  Skill URL
                </label>
                <input
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  className="w-full rounded-lg border border-border bg-deep px-3 py-2 font-mono text-xs text-text-primary focus:border-neon-cyan/50 focus:outline-none"
                  placeholder="https://github.com/..."
                />
              </div>

              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  Name (optional)
                </label>
                <input
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-deep px-3 py-2 font-mono text-xs text-text-primary focus:border-neon-cyan/50 focus:outline-none"
                  placeholder="My Custom Skill"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleImport}
                className="flex-1 rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 px-4 py-2.5 font-mono text-xs font-medium text-neon-cyan transition hover:bg-neon-cyan/20"
              >
                Import
              </button>
              <button
                onClick={() => setShowImport(false)}
                className="rounded-lg border border-border px-4 py-2.5 font-mono text-xs text-text-muted transition hover:bg-surface"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
