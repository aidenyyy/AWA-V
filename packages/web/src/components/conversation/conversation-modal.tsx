"use client";

import { useMemo, useState, useEffect } from "react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api-client";
import { useInterventionStore } from "@/stores/intervention-store";
import { useConsultationStore } from "@/stores/consultation-store";
import type { Consultation, Intervention } from "@awa-v/shared";

type ConversationTab = "blocking" | "consultation";

type ConversationItem =
  | {
      kind: "intervention";
      id: string;
      createdAt: string;
      question: string;
      context: string;
      status: string;
      response: string | null;
      stageType: string;
    }
  | {
      kind: "consultation";
      id: string;
      createdAt: string;
      question: string;
      context: string;
      status: string;
      response: string | null;
      stageType: string;
      blocking: number;
    };

interface ConversationModalProps {
  open: boolean;
  pipelineId: string;
  taskId?: string;
  initialTab: ConversationTab;
  onClose: () => void;
}

function parseContext(context: string): Record<string, unknown> | null {
  try {
    return JSON.parse(context) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function ConversationModal({
  open,
  pipelineId,
  taskId,
  initialTab,
  onClose,
}: ConversationModalProps) {
  const interventions = useInterventionStore((s) => s.interventions);
  const resolveIntervention = useInterventionStore((s) => s.resolveIntervention);
  const consultations = useConsultationStore((s) => s.consultations);
  const upsertConsultation = useConsultationStore((s) => s.upsertConsultation);

  const [tab, setTab] = useState<ConversationTab>(initialTab);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setSelectedId(null);
      setResponseText("");
    }
  }, [open, initialTab, taskId]);

  const taskFilterEnabled = !!taskId;

  const blockingItems = useMemo<ConversationItem[]>(() => {
    const pendingInterventions = interventions
      .filter(
        (i) =>
          i.pipelineId === pipelineId &&
          (!taskFilterEnabled || i.taskId === taskId) &&
          i.status === "pending"
      )
      .map((i): ConversationItem => ({
        kind: "intervention",
        id: i.id,
        createdAt: i.createdAt,
        question: i.question,
        context: i.context,
        status: i.status,
        response: i.response,
        stageType: i.stageType,
      }));

    const pendingBlockConsultations = consultations
      .filter(
        (c) =>
          c.pipelineId === pipelineId &&
          (!taskFilterEnabled || c.taskId === taskId) &&
          c.status === "pending" &&
          c.blocking === 1
      )
      .map((c): ConversationItem => ({
        kind: "consultation",
        id: c.id,
        createdAt: c.createdAt,
        question: c.question,
        context: c.context,
        status: c.status,
        response: c.response,
        stageType: c.stageType,
        blocking: c.blocking,
      }));

    return [...pendingInterventions, ...pendingBlockConsultations].sort(
      (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)
    );
  }, [consultations, interventions, pipelineId, taskFilterEnabled, taskId]);

  const consultItems = useMemo<ConversationItem[]>(() => {
    return consultations
      .filter(
        (c) =>
          c.pipelineId === pipelineId &&
          (!taskFilterEnabled || c.taskId === taskId) &&
          c.status === "pending" &&
          c.blocking === 0
      )
      .map((c): ConversationItem => ({
        kind: "consultation",
        id: c.id,
        createdAt: c.createdAt,
        question: c.question,
        context: c.context,
        status: c.status,
        response: c.response,
        stageType: c.stageType,
        blocking: c.blocking,
      }))
      .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  }, [consultations, pipelineId, taskFilterEnabled, taskId]);

  const currentList = tab === "blocking" ? blockingItems : consultItems;
  const selected = currentList.find((i) => i.id === selectedId) ?? currentList[0] ?? null;

  async function handleSend(item: ConversationItem, response: string) {
    if (!response.trim()) return;
    if (item.kind === "intervention") {
      const resolved = await api.respondToIntervention(item.id, response);
      resolveIntervention(item.id, resolved as Intervention);
      setResponseText("");
      return;
    }
    const answered = await api.respondToConsultation(item.id, response);
    upsertConsultation(answered as Consultation);
    setResponseText("");
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-void/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-6 top-6 z-50 h-[calc(100vh-3rem)] w-[620px] max-w-[92vw] glass-card p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-xs uppercase tracking-widest text-text-primary">
              {taskFilterEnabled ? "Task Conversation" : "Pipeline Conversation"}
            </h2>
            <span className="rounded border border-neon-red/30 bg-neon-red/10 px-1.5 py-0.5 text-[10px] font-mono text-neon-red">
              B {blockingItems.length}
            </span>
            <span className="rounded border border-neon-yellow/30 bg-neon-yellow/10 px-1.5 py-0.5 text-[10px] font-mono text-neon-yellow">
              C {consultItems.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded border border-border px-2 py-1 font-mono text-[10px] text-text-muted hover:text-text-primary"
          >
            Minimize
          </button>
        </div>

        <div className="flex h-[calc(100%-49px)]">
          <div className="w-56 border-r border-border p-2">
            <div className="mb-2 grid grid-cols-2 gap-1">
              <button
                onClick={() => {
                  setTab("blocking");
                  setSelectedId(null);
                }}
                className={cn(
                  "rounded px-2 py-1 text-[10px] font-mono uppercase",
                  tab === "blocking"
                    ? "border border-neon-red/40 bg-neon-red/10 text-neon-red"
                    : "border border-border text-text-muted"
                )}
              >
                B ({blockingItems.length})
              </button>
              <button
                onClick={() => {
                  setTab("consultation");
                  setSelectedId(null);
                }}
                className={cn(
                  "rounded px-2 py-1 text-[10px] font-mono uppercase",
                  tab === "consultation"
                    ? "border border-neon-yellow/40 bg-neon-yellow/10 text-neon-yellow"
                    : "border border-border text-text-muted"
                )}
              >
                C ({consultItems.length})
              </button>
            </div>
            <div className="space-y-1 overflow-y-auto">
              {currentList.map((item) => (
                <button
                  key={`${item.kind}:${item.id}`}
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    "w-full rounded border p-2 text-left",
                    selected?.id === item.id
                      ? "border-neon-cyan/40 bg-neon-cyan/10"
                      : "border-border"
                  )}
                >
                  <div className="truncate font-mono text-[10px] text-text-secondary">
                    {item.stageType.replace(/_/g, " ")}
                  </div>
                  {!taskFilterEnabled && (
                    <div className="truncate font-mono text-[10px] text-text-muted">
                      {item.kind === "intervention" ? "I" : "C"} • {item.id.slice(0, 8)}
                    </div>
                  )}
                  <div className="truncate text-xs text-text-primary">{item.question}</div>
                  <div className="mt-1 font-mono text-[10px] text-text-muted">
                    {new Date(item.createdAt).toLocaleTimeString()}
                  </div>
                </button>
              ))}
              {currentList.length === 0 && (
                <div className="rounded border border-border p-2 text-xs text-text-muted">
                  No pending items.
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 p-4">
            {selected ? (
              <div className="flex h-full flex-col">
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 font-mono text-[10px] uppercase",
                      selected.kind === "intervention"
                        ? "border border-neon-red/40 bg-neon-red/10 text-neon-red"
                        : selected.blocking === 1
                        ? "border border-neon-red/40 bg-neon-red/10 text-neon-red"
                        : "border border-neon-yellow/40 bg-neon-yellow/10 text-neon-yellow"
                    )}
                  >
                    {selected.kind === "intervention"
                      ? "Blocking / Intervention"
                      : selected.blocking === 1
                      ? "Blocking / Consult"
                      : "Consultation"}
                  </span>
                </div>
                <p className="mb-3 text-sm text-text-primary">{selected.question}</p>
                {selected.context && selected.context !== "{}" && (
                  <div className="mb-3 rounded border border-border bg-abyss/80 p-2">
                    {(() => {
                      const parsed = parseContext(selected.context);
                      if (!parsed) {
                        return (
                          <pre className="whitespace-pre-wrap break-words text-xs text-text-secondary">
                            {selected.context}
                          </pre>
                        );
                      }
                      return (
                        <pre className="whitespace-pre-wrap break-words text-xs text-text-secondary">
                          {JSON.stringify(parsed, null, 2)}
                        </pre>
                      );
                    })()}
                  </div>
                )}
                <textarea
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="Type your response..."
                  rows={4}
                  className="w-full resize-y rounded border border-border bg-abyss/80 p-3 text-sm text-text-primary"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleSend(selected, "proceed")}
                    className="rounded border border-neon-green/40 bg-neon-green/10 px-3 py-1 text-[10px] font-mono uppercase text-neon-green"
                  >
                    Proceed
                  </button>
                  <button
                    onClick={() => handleSend(selected, "abort")}
                    className="rounded border border-neon-red/40 bg-neon-red/10 px-3 py-1 text-[10px] font-mono uppercase text-neon-red"
                  >
                    Abort
                  </button>
                  <button
                    onClick={() => handleSend(selected, responseText)}
                    disabled={!responseText.trim()}
                    className="rounded border border-neon-cyan/40 bg-neon-cyan/10 px-3 py-1 text-[10px] font-mono uppercase text-neon-cyan disabled:opacity-40"
                  >
                    Send
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-text-muted">
                Select a pending item.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
