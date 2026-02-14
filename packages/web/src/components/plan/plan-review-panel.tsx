"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api-client";

interface PlanReviewPanelProps {
  planId: string;
  content: string;
  taskBreakdown: Array<{
    title: string;
    description: string;
    agentRole: string;
    domain: string;
    canParallelize: boolean;
    dependsOn: string[];
  }>;
  version: number;
  adversarialFeedback?: string | null;
}

export function PlanReviewPanel({
  planId,
  content,
  taskBreakdown,
  version,
  adversarialFeedback,
}: PlanReviewPanelProps) {
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleDecision(decision: "approve" | "edit" | "reject") {
    setSubmitting(true);
    try {
      await api.reviewPlan(planId, {
        decision,
        feedback: feedback || undefined,
      });
    } catch (err) {
      console.error("Review failed:", err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Plan header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="indicator indicator-warning" />
          <h2 className="font-mono text-sm font-semibold text-text-primary">
            Plan Review
          </h2>
          <span className="text-[10px] font-mono text-text-muted">
            v{version}
          </span>
        </div>
      </div>

      {/* Adversarial feedback */}
      {adversarialFeedback && (
        <div className="glass-card border-neon-magenta/30 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="indicator indicator-error" />
            <span className="font-mono text-xs text-neon-magenta uppercase tracking-wider">
              Adversarial Review
            </span>
          </div>
          <div className="text-xs text-text-secondary leading-relaxed">
            <ReactMarkdown>{adversarialFeedback}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Plan content */}
      <div className="glass-card p-4">
        <div className="prose prose-invert prose-sm max-w-none text-text-secondary">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </div>

      {/* Task breakdown */}
      {taskBreakdown.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="mb-3 font-mono text-xs uppercase tracking-wider text-text-muted">
            Task Breakdown
          </h3>
          <div className="space-y-2">
            {taskBreakdown.map((task, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border border-border/50 bg-surface/30 p-3"
              >
                <div className="flex-shrink-0">
                  <span
                    className={cn(
                      "inline-flex h-5 w-5 items-center justify-center rounded font-mono text-[10px]",
                      task.canParallelize
                        ? "bg-neon-cyan/10 text-neon-cyan"
                        : "bg-surface-light text-text-muted"
                    )}
                  >
                    {task.canParallelize ? "∥" : i + 1}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-text-primary">
                      {task.title}
                    </span>
                    <span className="skill-badge skill-badge-configured">
                      {task.agentRole}
                    </span>
                    <span className="skill-badge skill-badge-dim">
                      {task.domain}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-text-muted">
                    {task.description}
                  </p>
                  {task.dependsOn.length > 0 && (
                    <p className="mt-1 text-[10px] text-text-muted">
                      Depends on: {task.dependsOn.join(", ")}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feedback input */}
      <div className="glass-card p-4">
        <label className="mb-2 block font-mono text-xs text-text-muted">
          Feedback (optional)
        </label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          className="w-full resize-none rounded-lg border border-border bg-deep p-3 font-mono text-xs text-text-primary placeholder:text-text-muted/50 focus:border-neon-cyan/50 focus:outline-none"
          rows={3}
          placeholder="Add feedback or modifications..."
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => handleDecision("approve")}
          disabled={submitting}
          className="flex-1 rounded-lg border border-neon-green/40 bg-neon-green/10 px-4 py-2.5 font-mono text-xs font-medium text-neon-green transition hover:bg-neon-green/20 hover:shadow-[0_0_16px_rgba(0,255,136,0.15)] disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => handleDecision("edit")}
          disabled={submitting}
          className="flex-1 rounded-lg border border-neon-yellow/40 bg-neon-yellow/10 px-4 py-2.5 font-mono text-xs font-medium text-neon-yellow transition hover:bg-neon-yellow/20 hover:shadow-[0_0_16px_rgba(255,170,0,0.15)] disabled:opacity-50"
        >
          Edit & Replan
        </button>
        <button
          onClick={() => handleDecision("reject")}
          disabled={submitting}
          className="flex-1 rounded-lg border border-neon-red/40 bg-neon-red/10 px-4 py-2.5 font-mono text-xs font-medium text-neon-red transition hover:bg-neon-red/20 hover:shadow-[0_0_16px_rgba(255,51,102,0.15)] disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
