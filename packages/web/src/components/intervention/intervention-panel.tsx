"use client";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/cn";
import { useInterventionStore } from "@/stores/intervention-store";
import { InterventionTab } from "./intervention-tab";
import { api } from "@/lib/api-client";
import type { Intervention } from "@awa-v/shared";

export function InterventionPanel() {
  const panelOpen = useInterventionStore((s) => s.panelOpen);
  const activePipelineId = useInterventionStore((s) => s.activePipelineId);
  const interventions = useInterventionStore((s) => s.interventions);
  const closePanel = useInterventionStore((s) => s.closePanel);
  const resolveIntervention = useInterventionStore((s) => s.resolveIntervention);

  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter interventions for the active pipeline (pending first)
  const pipelineInterventions = interventions.filter(
    (i) => i.pipelineId === activePipelineId
  );
  const pendingInterventions = pipelineInterventions.filter(
    (i) => i.status === "pending"
  );

  // Display pending interventions; if none, show all for this pipeline
  const displayInterventions =
    pendingInterventions.length > 0
      ? pendingInterventions
      : pipelineInterventions;

  // Reset selected index when pipeline changes or list shrinks
  useEffect(() => {
    setSelectedIndex(0);
  }, [activePipelineId]);

  useEffect(() => {
    if (selectedIndex >= displayInterventions.length && displayInterventions.length > 0) {
      setSelectedIndex(0);
    }
  }, [displayInterventions.length, selectedIndex]);

  const handleRespond = useCallback(
    async (interventionId: string, response: string) => {
      try {
        const resolved = await api.respondToIntervention(interventionId, response);
        resolveIntervention(interventionId, resolved as Intervention);
      } catch (err) {
        console.error("[Intervention] Failed to respond:", err);
      }
    },
    [resolveIntervention]
  );

  // Close on Escape key
  useEffect(() => {
    if (!panelOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closePanel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [panelOpen, closePanel]);

  const selectedIntervention = displayInterventions[selectedIndex] ?? null;

  return (
    <>
      {/* Backdrop */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-40 bg-void/60 backdrop-blur-sm"
          onClick={closePanel}
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          "fixed right-0 top-0 z-50 h-full w-[480px] max-w-full",
          "intervention-panel",
          "transform transition-transform duration-300 ease-out",
          panelOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neon-red/20 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon-red opacity-50" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-neon-red" />
            </span>
            <h2 className="neon-text-red text-sm font-mono font-bold uppercase tracking-wider">
              Interventions
            </h2>
            {pendingInterventions.length > 0 && (
              <span className="rounded-full bg-neon-red/20 px-2 py-0.5 text-[10px] font-mono font-bold text-neon-red">
                {pendingInterventions.length} pending
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={closePanel}
            className={cn(
              "rounded-lg p-1.5",
              "border border-border hover:border-neon-red/40",
              "text-text-muted hover:text-neon-red",
              "transition-all duration-200"
            )}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Tab bar (when multiple interventions) */}
        {displayInterventions.length > 1 && (
          <div className="flex gap-0 overflow-x-auto border-b border-border px-2">
            {displayInterventions.map((intervention, idx) => (
              <button
                key={intervention.id}
                type="button"
                onClick={() => setSelectedIndex(idx)}
                className={cn(
                  "flex-shrink-0 px-3 py-2 text-[11px] font-mono transition-all duration-200",
                  idx === selectedIndex
                    ? "tab-glow-active text-neon-red"
                    : "text-text-muted hover:text-text-secondary border-b-2 border-transparent"
                )}
              >
                #{idx + 1}{" "}
                <span className="hidden sm:inline">
                  {intervention.stageType.replace(/_/g, " ").slice(0, 12)}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto" style={{ height: "calc(100% - 100px)" }}>
          {selectedIntervention ? (
            <InterventionTab
              intervention={selectedIntervention}
              onRespond={(response) =>
                handleRespond(selectedIntervention.id, response)
              }
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm font-mono text-text-muted">
                No interventions for this pipeline.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
