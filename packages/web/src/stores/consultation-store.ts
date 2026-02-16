import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Consultation } from "@awa-v/shared";

interface ConsultationState {
  consultations: Consultation[];
  upsertConsultation: (consultation: Consultation) => void;
}

export const useConsultationStore = create<ConsultationState>()(
  immer((set) => ({
    consultations: [],

    upsertConsultation: (consultation) =>
      set((state) => {
        const idx = state.consultations.findIndex((c) => c.id === consultation.id);
        if (idx === -1) {
          state.consultations.unshift(consultation);
        } else {
          state.consultations[idx] = consultation;
        }
      }),
  }))
);

