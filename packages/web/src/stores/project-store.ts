import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Project } from "@awa-v/shared";

interface ProjectState {
  projects: Record<string, Project>;
  activeProjectId: string | null;

  setProjects: (projects: Project[]) => void;
  updateProject: (project: Project) => void;
  setActiveProject: (id: string | null) => void;
}

export const useProjectStore = create<ProjectState>()(
  immer((set) => ({
    projects: {},
    activeProjectId: null,

    setProjects: (projects) =>
      set((state) => {
        for (const p of projects) {
          state.projects[p.id] = p;
        }
      }),

    updateProject: (project) =>
      set((state) => {
        state.projects[project.id] = project;
      }),

    setActiveProject: (id) =>
      set((state) => {
        state.activeProjectId = id;
      }),
  }))
);
