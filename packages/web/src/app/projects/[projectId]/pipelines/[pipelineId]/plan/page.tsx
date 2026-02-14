"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { PlanReviewPanel } from "@/components/plan/plan-review-panel";
import type { Plan } from "@awa-v/shared";

export default function PlanPage() {
  const params = useParams();
  const pipelineId = params.pipelineId as string;
  const [plan, setPlan] = useState<Plan | null>(null);

  useEffect(() => {
    api
      .getLatestPlan(pipelineId)
      .then((p) => setPlan(p as Plan))
      .catch(() => {});
  }, [pipelineId]);

  if (!plan) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="font-mono text-sm text-text-muted">
          No plan available yet
        </span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <PlanReviewPanel
        planId={plan.id}
        content={plan.content}
        taskBreakdown={plan.taskBreakdown as any[]}
        version={plan.version}
        adversarialFeedback={plan.adversarialFeedback}
      />
    </div>
  );
}
