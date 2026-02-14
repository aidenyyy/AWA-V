"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api-client";
import type { Project } from "@awa-v/shared";

export default function SettingsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<Project | null>(null);
  const [model, setModel] = useState("");
  const [budget, setBudget] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getProject(projectId).then((p) => {
      const proj = p as Project;
      setProject(proj);
      setModel(proj.model);
      setBudget(String(proj.maxBudgetUsd));
    });
  }, [projectId]);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await api.updateProject(projectId, {
        model,
        maxBudgetUsd: parseFloat(budget),
      });
      setProject(updated as Project);
    } finally {
      setSaving(false);
    }
  }

  if (!project) return null;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h2 className="mb-6 font-mono text-sm font-semibold text-text-primary">
        Project Settings
      </h2>

      <div className="glass-card p-6 space-y-6">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-muted">
            Project Name
          </label>
          <div className="font-mono text-sm text-text-primary">
            {project.name}
          </div>
        </div>

        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-muted">
            Repository Path
          </label>
          <div className="font-mono text-xs text-text-secondary">
            {project.repoPath}
          </div>
        </div>

        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-muted">
            Model
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-lg border border-border bg-deep px-3 py-2 font-mono text-xs text-text-primary focus:border-neon-cyan/50 focus:outline-none"
          >
            <option value="sonnet">Sonnet</option>
            <option value="opus">Opus</option>
            <option value="haiku">Haiku</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-muted">
            Max Budget (USD)
          </label>
          <input
            type="number"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="w-full rounded-lg border border-border bg-deep px-3 py-2 font-mono text-xs text-text-primary focus:border-neon-cyan/50 focus:outline-none"
            step="0.5"
            min="0.5"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 px-4 py-2.5 font-mono text-xs font-medium text-neon-cyan transition hover:bg-neon-cyan/20 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
