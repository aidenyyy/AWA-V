import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { immer } from "zustand/middleware/immer";
import type { Intervention } from "@awa-v/shared";

interface InterventionState {
  interventions: Intervention[];

  addIntervention: (intervention: Intervention) => void;
  resolveIntervention: (id: string, intervention: Intervention) => void;
}

export const useInterventionStore = create<InterventionState>()(
  immer((set) => ({
    interventions: [],

    addIntervention: (intervention) =>
      set((state) => {
        // Avoid duplicates
        const exists = state.interventions.some((i) => i.id === intervention.id);
        if (!exists) {
          state.interventions.unshift(intervention);
        }
      }),

    resolveIntervention: (id, intervention) => {
      set((state) => {
        const idx = state.interventions.findIndex((i) => i.id === id);
        if (idx !== -1) {
          state.interventions[idx] = intervention;
        }
      });
    },
  }))
);

// ─── Selectors ──────────────────────────────────────────────

export function getPendingByPipeline(pipelineId: string) {
  return useInterventionStore
    .getState()
    .interventions.filter(
      (i) => i.pipelineId === pipelineId && i.status === "pending"
    );
}

export function usePendingByPipeline(pipelineId: string) {
  return useInterventionStore(
    useShallow((s) =>
      s.interventions.filter(
        (i) => i.pipelineId === pipelineId && i.status === "pending"
      )
    )
  );
}

export function useTotalPendingCount() {
  return useInterventionStore(
    (s) => s.interventions.filter((i) => i.status === "pending").length
  );
}
