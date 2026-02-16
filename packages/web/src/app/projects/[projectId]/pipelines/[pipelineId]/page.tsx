"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useSubscribeToPipeline } from "@/hooks/use-websocket";
import { usePipelineStore } from "@/stores/pipeline-store";
import { ClaudeStreamViewer } from "@/components/stream/claude-stream-viewer";
import { ProgressBar } from "@/components/kanban/progress-bar";
import { CostBadge } from "@/components/layout/cost-badge";
import { CancelConfirmModal } from "@/components/modals/cancel-confirm-modal";
import { ConversationModal } from "@/components/conversation/conversation-modal";
import { useSessionStore } from "@/stores/session-store";
import { useInterventionStore } from "@/stores/intervention-store";
import { useConsultationStore } from "@/stores/consultation-store";
import { useNotificationStore } from "@/stores/notification-store";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/cn";
import type { Pipeline, Plan, Stage, Task, ClaudeSession, Project } from "@awa-v/shared";

interface PipelineDetail extends Pipeline {
  stages: (Stage & { tasks: Task[] })[];
  plans: Plan[];
}

const STAGE_LABELS: Record<string, string> = {
  requirements_input: "Requirements",
  plan_generation: "Planning",
  human_review: "Planning",
  adversarial_review: "Planning",
  context_prep: "Planning",
  parallel_execution: "Execution",
  testing: "Testing",
  code_review: "Code Review",
  git_integration: "Git Integration",
  evolution_capture: "Evolution Capture",
  claude_md_evolution: "Evolution Analysis",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  paused: "Paused",
};

export default function PipelineDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pipelineId = params.pipelineId as string;
  const projectId = params.projectId as string;
  const [detail, setDetail] = useState<PipelineDetail | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [conversationOpen, setConversationOpen] = useState(false);
  const [conversationTaskId, setConversationTaskId] = useState<string | null>(null);
  const [conversationTab, setConversationTab] = useState<"blocking" | "consultation">("blocking");

  useSubscribeToPipeline(pipelineId);

  const pipeline = usePipelineStore((s) => s.pipelines[pipelineId]);
  const setSessions = useSessionStore((s) => s.setSessions);
  const interventions = useInterventionStore((s) => s.interventions);
  const addIntervention = useInterventionStore((s) => s.addIntervention);
  const consultations = useConsultationStore((s) => s.consultations);
  const upsertConsultation = useConsultationStore((s) => s.upsertConsultation);
  const addNotification = useNotificationStore((s) => s.addNotification);

  useEffect(() => {
    api.getPipeline(pipelineId).then((d) => setDetail(d as PipelineDetail));
    api.getProject(projectId).then((p) => setProject(p as Project));
    api.getInterventions(pipelineId).then((rows) => {
      for (const row of rows as any[]) addIntervention(row);
    });
    api.getConsultations(pipelineId).then((rows) => {
      for (const row of rows as any[]) upsertConsultation(row);
    });
  }, [pipelineId, projectId, addIntervention, upsertConsultation]);

  useEffect(() => {
    if (!detail?.stages) return;
    const allTasks = detail.stages.flatMap((s) => s.tasks);
    Promise.all(allTasks.map((t) => api.getSessionsForTask(t.id)))
      .then((results) => setSessions(results.flat() as ClaudeSession[]))
      .catch(() => {});
  }, [detail, setSessions]);

  // When modal is open on task A, notify if new blocking appears on other tasks.
  const lastBlockingByTaskRef = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!conversationOpen || !conversationTaskId) return;
    const pendingBlockingByTask: Record<string, number> = {};
    for (const i of interventions) {
      if (i.pipelineId === pipelineId && i.status === "pending" && i.taskId) {
        pendingBlockingByTask[i.taskId] = (pendingBlockingByTask[i.taskId] ?? 0) + 1;
      }
    }
    for (const c of consultations) {
      if (c.pipelineId === pipelineId && c.status === "pending" && c.blocking === 1 && c.taskId) {
        pendingBlockingByTask[c.taskId] = (pendingBlockingByTask[c.taskId] ?? 0) + 1;
      }
    }

    for (const [taskId, count] of Object.entries(pendingBlockingByTask)) {
      const prev = lastBlockingByTaskRef.current[taskId] ?? 0;
      if (taskId !== conversationTaskId && count > prev) {
        addNotification({
          level: "warning",
          title: "Blocking Conversation Pending",
          message: "Another task has a new blocking question waiting for response.",
          pipelineId,
        });
      }
    }

    for (const key of Object.keys(lastBlockingByTaskRef.current)) {
      delete lastBlockingByTaskRef.current[key];
    }
    Object.assign(lastBlockingByTaskRef.current, pendingBlockingByTask);
  }, [addNotification, consultations, conversationOpen, conversationTaskId, interventions, pipelineId]);

  const deduplicatedStages = useMemo(() => {
    if (!detail?.stages) return [];
    const planningTypes = new Set([
      "plan_generation",
      "human_review",
      "adversarial_review",
      "context_prep",
    ]);
    const byType = new Map<string, { stage: (typeof detail.stages)[0]; count: number }>();
    for (const stage of detail.stages) {
      const displayType = planningTypes.has(stage.type) ? "plan_generation" : stage.type;
      const existing = byType.get(displayType);
      if (existing) {
        existing.count++;
        // keep the latest stage instance so state reflects current planning sub-step
        existing.stage = stage;
      } else {
        byType.set(displayType, { stage: { ...stage, type: displayType }, count: 1 });
      }
    }
    return Array.from(byType.values());
  }, [detail]);

  const currentPipeline = pipeline ?? detail;
  if (!currentPipeline) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="indicator indicator-running" />
        <span className="ml-2 font-mono text-sm text-text-muted">Loading...</span>
      </div>
    );
  }

  const latestPlan = detail?.plans?.[0];
  const isTerminal = ["completed", "failed", "cancelled"].includes(currentPipeline.state);
  const isPaused = currentPipeline.state === "paused";
  const isRunning = !isTerminal && !isPaused;
  const pipelinePendingBlocking = interventions.filter(
    (i) => i.pipelineId === pipelineId && i.status === "pending"
  ).length + consultations.filter(
    (c) => c.pipelineId === pipelineId && c.status === "pending" && c.blocking === 1
  ).length;
  const pipelinePendingConsult = consultations.filter(
    (c) => c.pipelineId === pipelineId && c.status === "pending" && c.blocking === 0
  ).length;

  async function handlePause() {
    try { await api.pausePipeline(pipelineId); } catch { /* silent ok */ }
  }

  async function handleResume() {
    try { await api.resumePipeline(pipelineId); } catch { /* silent ok */ }
  }

  async function handleCancel() {
    setShowCancelModal(false);
    try { await api.cancelPipeline(pipelineId); } catch { /* silent ok */ }
  }

  return (
    <div className="flex h-full">
      {/* Cancel confirmation modal */}
      {showCancelModal && (
        <CancelConfirmModal
          onConfirm={handleCancel}
          onClose={() => setShowCancelModal(false)}
        />
      )}

      {/* Left: Pipeline flow */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Back button */}
        <button
          onClick={() => router.push(`/projects/${projectId}`)}
          className="mb-4 flex items-center gap-1 font-mono text-[11px] text-text-muted transition hover:text-text-primary"
        >
          &larr; Back to Pipelines
        </button>

        {/* Pipeline header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-sm font-semibold text-text-primary">
                Pipeline Detail
              </h2>
              {project?.isSelfRepo === 1 && (
                <span className="rounded border border-neon-magenta/30 px-1 py-0.5 text-[9px] font-mono text-neon-magenta">
                  SELF
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-text-muted font-mono max-w-lg truncate">
              {currentPipeline.requirements}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded border border-neon-red/30 bg-neon-red/10 px-2 py-1 font-mono text-[10px] text-neon-red">
              B {pipelinePendingBlocking}
            </span>
            <span className="rounded border border-neon-yellow/30 bg-neon-yellow/10 px-2 py-1 font-mono text-[10px] text-neon-yellow">
              C {pipelinePendingConsult}
            </span>
            <button
              onClick={() => {
                setConversationTaskId(null);
                setConversationTab("blocking");
                setConversationOpen(true);
              }}
              className="rounded-md border border-neon-cyan/40 bg-neon-cyan/10 px-2.5 py-1 font-mono text-[10px] text-neon-cyan transition hover:bg-neon-cyan/20"
              title="Open planning and task Q&A"
            >
              Q&A
            </button>
            {/* Pipeline controls */}
            {isRunning && (
              <button
                onClick={handlePause}
                className="rounded-md border border-neon-yellow/40 bg-neon-yellow/10 px-2.5 py-1 font-mono text-[10px] text-neon-yellow transition hover:bg-neon-yellow/20"
              >
                Pause
              </button>
            )}
            {isPaused && (
              <button
                onClick={handleResume}
                className="rounded-md border border-neon-green/40 bg-neon-green/10 px-2.5 py-1 font-mono text-[10px] text-neon-green transition hover:bg-neon-green/20"
              >
                Resume
              </button>
            )}
            {!isTerminal && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="rounded-md border border-neon-red/40 bg-neon-red/10 px-2.5 py-1 font-mono text-[10px] text-neon-red transition hover:bg-neon-red/20"
              >
                Cancel
              </button>
            )}

            <CostBadge inputTokens={currentPipeline.totalInputTokens} outputTokens={currentPipeline.totalOutputTokens} size="md" />
            <span
              className={cn(
                "rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-widest",
                currentPipeline.state === "completed"
                  ? "border-neon-green/30 text-neon-green"
                  : currentPipeline.state === "failed"
                    ? "border-neon-red/30 text-neon-red"
                    : currentPipeline.state === "paused"
                      ? "border-neon-yellow/30 text-neon-yellow"
                      : "border-neon-cyan/30 text-neon-cyan"
              )}
            >
              {STAGE_LABELS[currentPipeline.state] ?? currentPipeline.state}
            </span>
          </div>
        </div>

        {/* Stage flow visualization */}
        <div className="mb-8">
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {deduplicatedStages.map(({ stage, count }, i) => (
              <div key={stage.id} className="flex items-center">
                <div
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-2 font-mono text-[10px] transition",
                    stage.state === "passed"
                      ? "border-neon-green/30 bg-neon-green/5 text-neon-green"
                      : stage.state === "running"
                        ? "border-neon-cyan/30 bg-neon-cyan/5 text-neon-cyan"
                        : stage.state === "skipped"
                          ? "border-neon-yellow/30 bg-neon-yellow/5 text-neon-yellow"
                        : stage.state === "failed"
                          ? "border-neon-red/30 bg-neon-red/5 text-neon-red"
                          : "border-border bg-surface/30 text-text-muted"
                  )}
                >
                  <span
                    className={cn(
                      "indicator",
                      stage.state === "passed"
                        ? "indicator-active"
                        : stage.state === "running"
                          ? "indicator-running"
                          : stage.state === "skipped"
                            ? "indicator-warning"
                          : stage.state === "failed"
                            ? "indicator-error"
                            : "indicator-idle"
                    )}
                  />
                  {STAGE_LABELS[stage.type] ?? stage.type}
                  {count > 1 && (
                    <span className="ml-1 text-[9px] text-text-muted">x{count}</span>
                  )}
                  {stage.state === "failed" && stage.errorMessage && (
                    <span className="ml-1.5 max-w-[200px] truncate text-[9px] text-neon-red/70" title={stage.errorMessage}>
                      {stage.errorMessage}
                    </span>
                  )}
                  {stage.state === "skipped" && stage.qualityGateResult && (
                    <span className="ml-1.5 max-w-[200px] truncate text-[9px] text-neon-yellow/70" title={stage.qualityGateResult}>
                      {stage.qualityGateResult}
                    </span>
                  )}
                </div>
                {i < deduplicatedStages.length - 1 && (
                  <div
                    className={cn(
                      "mx-1 h-px w-6",
                      stage.state === "passed"
                        ? "data-flow-line"
                        : "bg-border"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline error banner */}
        {currentPipeline.state === "failed" && currentPipeline.errorMessage && (
          <div className="mb-6 rounded-lg border border-neon-red/30 bg-neon-red/5 p-4">
            <h4 className="mb-1 font-mono text-xs font-semibold text-neon-red">Error</h4>
            <p className="font-mono text-[11px] text-text-secondary whitespace-pre-wrap">
              {currentPipeline.errorMessage}
            </p>
          </div>
        )}

        {/* Empty state when pipeline has no stages yet */}
        {detail && (!detail.stages || detail.stages.length === 0) && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-4xl mb-4 opacity-20">&#9678;</div>
            <h3 className="font-mono text-sm font-semibold text-text-primary mb-2">
              Pipeline Initializing
            </h3>
            <p className="text-xs text-text-muted font-mono max-w-sm">
              {isRunning
                ? "This pipeline is starting up. Stages and tasks will appear here as the pipeline progresses."
                : isTerminal
                  ? "This pipeline ended before any stages were created."
                  : "Waiting for pipeline to begin processing."}
            </p>
          </div>
        )}

        {/* Latest plan snapshot */}
        {latestPlan && (
          <div className="mb-6 rounded-lg border border-border/70 bg-surface/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-text-muted">Latest Plan v{latestPlan.version}</span>
              <button
                onClick={() => {
                  setConversationTaskId(null);
                  setConversationTab("blocking");
                  setConversationOpen(true);
                }}
                className="rounded border border-neon-cyan/40 bg-neon-cyan/10 px-2 py-1 font-mono text-[10px] text-neon-cyan"
              >
                Continue Q&A
              </button>
            </div>
            <p className="mt-2 max-h-20 overflow-hidden whitespace-pre-wrap text-[11px] text-text-secondary">
              {latestPlan.content}
            </p>
          </div>
        )}

        {/* Tasks */}
        {detail?.stages?.some((s) => s.tasks.length > 0) && (
          <div className="mt-6">
            <h3 className="mb-3 font-mono text-xs uppercase tracking-wider text-text-muted">
              Tasks
            </h3>
            <div className="grid gap-2">
              {detail.stages.flatMap((s) =>
                s.tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() =>
                      setSelectedTaskId(
                        selectedTaskId === task.id ? null : task.id
                      )
                    }
                    className={cn(
                      "glass-card w-full p-3 text-left transition",
                      selectedTaskId === task.id && "border-neon-cyan/40"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "indicator",
                            task.state === "completed"
                              ? "indicator-active"
                              : task.state === "running"
                                ? "indicator-running"
                                : task.state === "failed"
                                  ? "indicator-error"
                                  : "indicator-idle"
                          )}
                        />
                        <span className="font-mono text-xs text-text-primary">
                          {task.agentRole}
                        </span>
                        {(() => {
                          const blockingCount =
                            interventions.filter(
                              (i) =>
                                i.pipelineId === pipelineId &&
                                i.status === "pending" &&
                                i.taskId === task.id
                            ).length +
                            consultations.filter(
                              (c) =>
                                c.pipelineId === pipelineId &&
                                c.status === "pending" &&
                                c.taskId === task.id &&
                                c.blocking === 1
                            ).length;
                          const consultCount = consultations.filter(
                            (c) =>
                              c.pipelineId === pipelineId &&
                              c.status === "pending" &&
                              c.taskId === task.id &&
                              c.blocking === 0
                          ).length;
                          return (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConversationTaskId(task.id);
                                  setConversationTab("blocking");
                                  setConversationOpen(true);
                                }}
                                className={cn(
                                  "rounded border px-1.5 py-0.5 font-mono text-[10px]",
                                  blockingCount > 0
                                    ? "border-neon-red/40 bg-neon-red/10 text-neon-red"
                                    : "border-border text-text-muted"
                                )}
                                title="Pending blocking items"
                              >
                                B {blockingCount}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConversationTaskId(task.id);
                                  setConversationTab("consultation");
                                  setConversationOpen(true);
                                }}
                                className={cn(
                                  "rounded border px-1.5 py-0.5 font-mono text-[10px]",
                                  consultCount > 0
                                    ? "border-neon-yellow/40 bg-neon-yellow/10 text-neon-yellow"
                                    : "border-border text-text-muted"
                                )}
                                title="Pending consultations"
                              >
                                C {consultCount}
                              </button>
                            </>
                          );
                        })()}
                      </div>
                      <span className="font-mono text-[10px] text-text-muted uppercase">
                        {task.state}
                      </span>
                    </div>
                    <TaskSessionInfo taskId={task.id} />
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right: Stream viewer */}
      {selectedTaskId && (
        <div className="w-[480px] border-l border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-xs text-text-secondary">
              Live Output
            </span>
            <button
              onClick={() => setSelectedTaskId(null)}
              className="text-text-muted hover:text-text-primary text-sm"
            >
              x
            </button>
          </div>
          <ClaudeStreamViewer taskId={selectedTaskId} />
        </div>
      )}

      {conversationOpen && (
        <ConversationModal
          open={conversationOpen}
          pipelineId={pipelineId}
          taskId={conversationTaskId ?? undefined}
          initialTab={conversationTab}
          onClose={() => setConversationOpen(false)}
        />
      )}
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function getModelColor(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes("opus")) return "text-neon-magenta border-neon-magenta/30 bg-neon-magenta/10";
  if (lower.includes("haiku")) return "text-neon-green border-neon-green/30 bg-neon-green/10";
  return "text-neon-cyan border-neon-cyan/30 bg-neon-cyan/10";
}

function TaskSessionInfo({ taskId }: { taskId: string }) {
  const sessions = useSessionStore(
    useShallow((s) =>
      Object.values(s.sessions).filter((sess) => sess.taskId === taskId)
    )
  );
  if (sessions.length === 0) return null;
  const session = sessions[sessions.length - 1];
  const isRunning = !session.completedAt;

  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      <span
        className={cn(
          "rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase",
          getModelColor(session.model)
        )}
      >
        {session.model}
      </span>
      <span className="font-mono text-[9px] text-text-muted">
        &#8595;{formatTokens(session.inputTokens)} &#8593;{formatTokens(session.outputTokens)}
      </span>
      <span className="font-mono text-[9px] text-text-muted">
        {formatTokens(session.inputTokens + session.outputTokens)} tokens
      </span>
      {session.pid && (
        <span className="font-mono text-[9px] text-text-muted">
          PID:{session.pid}
        </span>
      )}
      {isRunning && (
        <span className="indicator indicator-running" />
      )}
    </div>
  );
}
