import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { immer } from "zustand/middleware/immer";
import type { Intervention } from "@awa-v/shared";

const DRAFT_STORAGE_KEY = "awa-v:intervention-drafts";

function loadDrafts(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function persistDrafts(drafts: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // localStorage may be full or unavailable
  }
}

interface InterventionState {
  interventions: Intervention[];
  panelOpen: boolean;
  activePipelineId: string | null;
  drafts: Record<string, string>;

  addIntervention: (intervention: Intervention) => void;
  resolveIntervention: (id: string, intervention: Intervention) => void;
  openPanel: (pipelineId: string) => void;
  closePanel: () => void;
  setDraft: (interventionId: string, text: string) => void;
  getDraft: (interventionId: string) => string;
}

export const useInterventionStore = create<InterventionState>()(
  immer((set, get) => ({
    interventions: [],
    panelOpen: false,
    activePipelineId: null,
    drafts: loadDrafts(),

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
        if (state.drafts[id]) {
          delete state.drafts[id];
        }
      });
      persistDrafts(get().drafts);
    },

    openPanel: (pipelineId) =>
      set((state) => {
        state.panelOpen = true;
        state.activePipelineId = pipelineId;
      }),

    closePanel: () =>
      set((state) => {
        state.panelOpen = false;
        state.activePipelineId = null;
      }),

    setDraft: (interventionId, text) => {
      set((state) => {
        state.drafts[interventionId] = text;
      });
      persistDrafts(get().drafts);
    },

    getDraft: (interventionId) => {
      return get().drafts[interventionId] ?? "";
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
