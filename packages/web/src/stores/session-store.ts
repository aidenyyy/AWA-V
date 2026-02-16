import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { ClaudeSession } from "@awa-v/shared";

interface SessionState {
  sessions: Record<string, ClaudeSession>;
  updateSession: (session: ClaudeSession) => void;
  setSessions: (sessions: ClaudeSession[]) => void;
}

export const useSessionStore = create<SessionState>()(
  immer((set) => ({
    sessions: {},
    updateSession: (session) =>
      set((state) => {
        state.sessions[session.id] = session;
      }),
    setSessions: (sessions) =>
      set((state) => {
        for (const s of sessions) state.sessions[s.id] = s;
      }),
  }))
);
