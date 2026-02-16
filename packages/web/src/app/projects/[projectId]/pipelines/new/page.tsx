"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import type { Pipeline } from "@awa-v/shared";

export default function NewPipelinePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const [requirements, setRequirements] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!requirements.trim()) return;
    setSubmitting(true);
    try {
      const pipeline = (await api.createPipeline({
        projectId,
        requirements: requirements.trim(),
      })) as Pipeline;
      router.push(`/projects/${projectId}/pipelines/${pipeline.id}`);
    } catch (err) {
      console.error("Failed to create pipeline:", err);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h2 className="mb-1 font-mono text-lg font-semibold text-text-primary">
        New Pipeline
      </h2>
      <p className="mb-8 text-xs font-mono text-text-muted">
        Describe what you want to build. The AI will generate a plan for your
        review.
      </p>

      <div className="glass-card p-6">
        <label className="mb-2 block font-mono text-[10px] uppercase tracking-wider text-text-muted">
          Requirements
        </label>
        <textarea
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
          className="w-full resize-none rounded-lg border border-border bg-deep p-4 font-mono text-sm text-text-primary leading-relaxed placeholder:text-text-muted/40 focus:border-neon-cyan/50 focus:outline-none"
          rows={12}
          placeholder="Describe the feature, bug fix, or change you want..."
          autoFocus
          spellCheck={false}
        />

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[10px] font-mono text-text-muted">
            {requirements.length} / 50,000 characters
          </span>

          <div className="flex gap-3">
            <button
              onClick={() => router.back()}
              className="rounded-lg border border-border px-4 py-2.5 font-mono text-xs text-text-muted transition hover:bg-surface"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!requirements.trim() || submitting}
              className="rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 px-6 py-2.5 font-mono text-xs font-medium text-neon-cyan transition hover:bg-neon-cyan/20 hover:shadow-[0_0_16px_rgba(0,240,255,0.15)] disabled:opacity-50"
            >
              {submitting ? "Starting..." : "Start Pipeline"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
